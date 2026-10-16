/**
 * Página mínima para testar a camada de mocks no navegador real: liga o MSW exatamente
 * como a aplicação (`startMocks`) e expõe um cliente Axios e sondas de `socket.io-client`.
 * Não contém respostas fictícias — só observa o que chega pela rede simulada.
 */
import axios from 'axios';
import type { io as createSocket, Socket } from 'socket.io-client';
import { startMocks } from '@/mocks/browser';
import {
  DEFAULT_SOCKET_URL,
  NftUpdatedEventSchema,
  OrderUpdatedEventSchema,
  SOCKET_EVENTS,
  SOCKET_PATH,
} from '@/shared/schemas/events';
import { EventDeduplicator } from '@/shared/utils/realtime-dedup';

interface Received {
  event: string;
  payload: { eventId: string; version: number; [key: string]: unknown };
}

/**
 * `engine.io-client` captura `globalThis.WebSocket` quando o módulo é avaliado, e o MSW só o
 * substitui em `worker.start()`. Por isso o `socket.io-client` é importado DEPOIS dos mocks.
 */
let io: typeof createSocket;
const ready = startMocks().then(async () => {
  ({ io } = await import('socket.io-client'));
});

class SocketProbe {
  readonly socket: Socket;
  /** Tudo que chegou pelo socket, sem filtro. */
  readonly received: Received[] = [];
  /** O que o consumidor aplicaria após dedup por eventId/versão. */
  readonly accepted: Received[] = [];
  connects = 0;
  disconnects = 0;
  /** Diagnóstico do ciclo de vida: motivos de desconexão, erros de conexão e tentativas de reconexão. */
  readonly log: string[] = [];
  private readonly dedup = new EventDeduplicator();

  constructor(token?: string) {
    this.socket = io(import.meta.env.VITE_SOCKET_URL ?? DEFAULT_SOCKET_URL, {
      path: SOCKET_PATH,
      transports: ['websocket'], // o binding do MSW só intercepta WebSocket
      reconnectionDelay: 100,
      reconnectionDelayMax: 200,
      ...(token && { auth: { token } }),
    });
    this.socket.on('connect', () => (this.connects += 1));
    this.socket.on('disconnect', (reason) => {
      this.disconnects += 1;
      this.log.push(`disconnect:${reason}`);
    });
    this.socket.on('connect_error', (err) => this.log.push(`connect_error:${err.message}`));
    this.socket.io.on('reconnect_attempt', (n) => this.log.push(`reconnect_attempt:${n}`));
    for (const name of [SOCKET_EVENTS.nftUpdated, SOCKET_EVENTS.orderUpdated]) {
      this.socket.on(name, (raw: unknown) => {
        const schema = name === SOCKET_EVENTS.nftUpdated ? NftUpdatedEventSchema : OrderUpdatedEventSchema;
        const payload = schema.parse(raw) as Received['payload'];
        const entry = { event: name, payload };
        this.received.push(entry);
        if (this.dedup.shouldProcess(String(payload.resource), String(payload.id), payload.version, payload.eventId)) {
          this.accepted.push(entry);
        }
      });
    }
  }

  get state() {
    return {
      connected: this.socket.connected,
      transport: this.socket.io.engine?.transport?.name ?? null,
      connects: this.connects,
      disconnects: this.disconnects,
      log: this.log,
      received: this.received,
      accepted: this.accepted,
    };
  }
}

const api = axios.create({ baseURL: '/api/v1', validateStatus: () => true });
const probes = new Map<string, SocketProbe>();
let seq = 0;

const harness = {
  ready,
  api: (method: string, url: string, data?: unknown, headers?: Record<string, string>) =>
    api.request({ method, url, data, headers }).then((r) => ({ status: r.status, data: r.data, headers: r.headers })),
  connect(token?: string): string {
    const id = `probe-${++seq}`;
    probes.set(id, new SocketProbe(token));
    return id;
  },
  state: (id: string) => probes.get(id)!.state,
  disconnect(id: string) {
    probes.get(id)?.socket.removeAllListeners().disconnect();
    probes.delete(id);
  },
  async login(who: 'ana' | 'bruno') {
    const creds = { ana: ['ana@example.com', 'Senha@123'], bruno: ['bruno@example.com', 'Senha@456'] }[who];
    const res = await api.post('/auth/login', { email: creds[0], password: creds[1] });
    return res.data.token as string;
  },
  /** Fluxo REST completo até um pedido PENDING (carteira conectada → cotação → pedido). */
  async createPendingOrder(token: string, key = 'k1') {
    const auth = { Authorization: `Bearer ${token}` };
    await api.post('/wallets/wallet-1/connect', undefined, { headers: auth });
    const lines = [{ nftId: 'nft-001', quantity: 1 }];
    const quote = (await api.post('/checkout/quote', { items: lines })).data;
    const body = { items: lines, quoteVersion: quote.version, walletId: 'wallet-1', network: 'ethereum' };
    const res = await api.post('/orders', body, { headers: { ...auth, 'Idempotency-Key': key } });
    return { status: res.status, orderId: res.data.id as string, body };
  },
  /** Reenvio do MESMO pedido (mesma chave e payload), como faz o cliente após timeout/refresh. */
  async resendOrder(token: string, key: string, body: unknown) {
    const res = await api.post('/orders', body, { headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key } });
    return { status: res.status, orderId: res.data.id as string };
  },
};

declare global {
  interface Window {
    harness: typeof harness;
  }
}
window.harness = harness;
