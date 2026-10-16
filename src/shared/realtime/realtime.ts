import type { QueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { queryKeys } from '@/shared/api/query-keys';
import { getSession, getToken, getUserId, subscribeSession } from '@/shared/api/session-store';
import type { Cart } from '@/shared/schemas/cart';
import {
  DEFAULT_SOCKET_URL,
  NftUpdatedEventSchema,
  OrderUpdatedEventSchema,
  SOCKET_EVENTS,
  SOCKET_PATH,
  type NftUpdatedEvent,
  type OrderUpdatedEvent,
} from '@/shared/schemas/events';
import type { Nft, NftListResponse } from '@/shared/schemas/nft';
import type { Order } from '@/shared/schemas/order';
import { EventDeduplicator } from '@/shared/utils/realtime-dedup';
import { applyNftEvent, applyNftEventToCartLine, applyOrderEvent } from './apply-events';
import { clearNotices, pushNotice } from './notices';

export interface RealtimeOptions {
  /** Base do socket (sem path). Padrão: `VITE_SOCKET_URL` ou o endereço do socket simulado. */
  url?: string;
}

/**
 * Cliente de tempo real (Socket.IO). Um socket por sessão: login, logout, expiração ou troca de
 * usuário encerram o anterior (`removeAllListeners` + `disconnect`), zeram a deduplicação e abrem
 * outro com o token novo. Retorna a função que encerra tudo.
 *
 * `transports: ['websocket']`: o binding do MSW só intercepta `WebSocket` (não long-polling).
 */
export function startRealtime(queryClient: QueryClient, options: RealtimeOptions = {}): () => void {
  const url = (options.url ?? import.meta.env.VITE_SOCKET_URL ?? DEFAULT_SOCKET_URL).replace(/\/$/, '');
  const dedup = new EventDeduplicator();
  let socket: Socket | null = null;
  let identity: string | null | undefined;

  const reconcile = (userId: string | null) => {
    // Eventos podem ter sido perdidos durante a queda: o REST é a fonte da verdade.
    void queryClient.invalidateQueries({ queryKey: queryKeys.nfts() });
    void queryClient.invalidateQueries({ queryKey: ['quote'] });
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart(userId) });
      void queryClient.invalidateQueries({ queryKey: ['orders', userId] });
    }
  };

  const onNftUpdated = (raw: unknown) => {
    const parsed = NftUpdatedEventSchema.safeParse(raw);
    if (!parsed.success) return;
    const event = parsed.data;
    if (!dedup.shouldProcess(event.resource, event.id, event.version, event.eventId)) return;
    applyNftUpdate(queryClient, event, getUserId());
  };

  const onOrderUpdated = (raw: unknown, ownerId: string) => {
    const parsed = OrderUpdatedEventSchema.safeParse(raw);
    if (!parsed.success) return;
    const event = parsed.data;
    // Defesa em profundidade: o servidor já só envia ao dono; aqui descartamos o que não é da sessão atual.
    if (event.userId !== ownerId || event.userId !== getUserId()) return;
    if (!dedup.shouldProcess(event.resource, event.id, event.version, event.eventId)) return;
    applyOrderUpdate(queryClient, event, ownerId);
  };

  const close = () => {
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  };

  const open = () => {
    const token = getToken();
    const userId = getUserId();
    identity = token;
    const next = io(url, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnection: true,
    });
    let connectedBefore = false;
    next.on('connect', () => {
      if (connectedBefore) reconcile(userId);
      connectedBefore = true;
    });
    next.on(SOCKET_EVENTS.nftUpdated, onNftUpdated);
    if (userId) next.on(SOCKET_EVENTS.orderUpdated, (raw) => onOrderUpdated(raw, userId));
    socket = next;
  };

  const sync = () => {
    if ((getSession()?.token ?? null) === identity && socket) return;
    close();
    // Eventos antigos de outra sessão não podem influenciar a nova.
    dedup.clear();
    open();
  };

  open();
  const unsubscribe = subscribeSession(sync);

  return () => {
    unsubscribe();
    close();
    dedup.clear();
    clearNotices();
  };
}

function applyNftUpdate(queryClient: QueryClient, event: NftUpdatedEvent, userId: string | null): void {
  queryClient.setQueriesData<NftListResponse>({ queryKey: [...queryKeys.nfts(), 'list'] }, (old) =>
    old && { ...old, items: old.items.map((item) => applyNftEvent(item, event)) }
  );
  queryClient.setQueryData<Nft>(queryKeys.nftDetail(event.id), (old) => old && applyNftEvent(old, event));

  if (userId) {
    const cart = queryClient.getQueryData<Cart>(queryKeys.cart(userId));
    const items = cart?.items.map((line) => applyNftEventToCartLine(line, event));
    const changed = cart && items?.some((line, i) => line !== cart.items[i]);
    if (cart && items && changed) {
      queryClient.setQueryData<Cart>(queryKeys.cart(userId), { ...cart, items });
      const title = cart.items.find((l) => l.nftId === event.id)?.title ?? 'Um item';
      pushNotice('warning', `${title}: preço ou disponibilidade mudou. O resumo do carrinho foi atualizado.`);
    }
  }
  // Cotações abertas (carrinho/checkout) ficaram defasadas; a nova cotação traz a versão atual.
  void queryClient.invalidateQueries({ queryKey: ['quote'] });
}

function applyOrderUpdate(queryClient: QueryClient, event: OrderUpdatedEvent, userId: string): void {
  const key = queryKeys.order(userId, event.id);
  const cached = queryClient.getQueryData<Order>(key);
  if (!cached) {
    // Sem recibo em cache (ex.: página recarregada): busca o estado completo na API.
    void queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  const next = applyOrderEvent(cached, event);
  if (next === cached) return;
  queryClient.setQueryData<Order>(key, next);
  if (next.status === 'CONFIRMED') {
    pushNotice('success', 'Pagamento confirmado. Seu pedido foi concluído.');
    void queryClient.invalidateQueries({ queryKey: queryKeys.cart(userId) });
  } else if (next.status === 'DECLINED') {
    pushNotice('error', next.errorMessage ?? 'Pagamento recusado. Seus itens foram mantidos no carrinho.');
  }
}
