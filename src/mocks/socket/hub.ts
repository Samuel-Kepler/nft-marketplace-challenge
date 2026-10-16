import { ws, type WebSocketHandler } from 'msw';
import { toSocketIo } from '@mswjs/socket.io-binding';
import { SOCKET_EVENTS } from '@/shared/schemas/events';
import type { DbEvent, MockDb } from '../db/db';

/** Controle exposto aos endpoints `/mock/socket/*`. */
export interface SocketControl {
  /** Derruba todos os clientes e recusa novas conexões (simula queda de rede). */
  drop(): void;
  /** Volta a aceitar conexões; o `socket.io-client` reconecta sozinho. */
  restore(): void;
}

type Connection = Parameters<typeof toSocketIo>[0];

interface ClientEntry {
  connection: Connection;
  io: ReturnType<typeof toSocketIo>;
  /** `auth.token` do handshake (pacote CONNECT `40{...}`); o dono é re-resolvido a cada evento. */
  token: string | null;
  pingTimer?: ReturnType<typeof setInterval>;
}

export interface SocketHubOptions {
  /** Intervalo do ping do engine.io; precisa ser < `pingInterval` anunciado pelo binding (25 s). */
  pingIntervalMs?: number;
}

const DEFAULT_PING_MS = 20_000;

/**
 * Servidor Socket.IO simulado, montado sobre `ws.link` do MSW + `@mswjs/socket.io-binding`.
 *
 * Roteamento (mesmas regras do spec §6):
 *  - `nft.updated` é público: vai para todos os clientes, visitantes inclusive;
 *  - `order.updated` só vai para o socket cujo `auth.token` pertence ao dono do pedido.
 *
 * Limitações: só intercepta `WebSocket` na página (use `transports: ['websocket']`);
 * o binding não implementa salas/namespaces/ack, então `public`/`user:<id>` são
 * emuladas aqui; e o handshake `auth` chega depois do ack `40` automático do binding.
 */
export class SocketHub implements SocketControl {
  private readonly clients = new Set<ClientEntry>();
  private unsubscribe?: () => void;
  private blocked = false;
  private readonly pingIntervalMs: number;

  constructor(
    private readonly db: MockDb,
    options: SocketHubOptions = {}
  ) {
    this.pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_MS;
  }

  get stats() {
    return {
      connected: this.clients.size,
      authenticated: [...this.clients].filter((c) => this.db.userIdForToken(c.token)).length,
      blocked: this.blocked,
    };
  }

  /** Cria o handler MSW para a URL do socket (ex.: `ws://mock.socket.local`; o MSW ignora o prefixo `/socket.io/`). */
  createHandler(url: string): WebSocketHandler {
    return ws.link(url).addEventListener('connection', (connection) => this.attach(connection));
  }

  drop(): void {
    this.blocked = true;
    for (const entry of [...this.clients]) entry.connection.client.close();
  }

  restore(): void {
    this.blocked = false;
  }

  private attach(connection: Connection): void {
    if (this.blocked) {
      // Só `close()` cancela o `open` e deixa o cliente pendurado até o timeout de conexão (20 s).
      // Um `error` no WebSocket faz o engine.io falhar a tentativa e o Manager reagendar com backoff.
      // (`socket` é a instância interna do interceptor; não faz parte do tipo público.)
      (Reflect.get(connection.client, 'socket') as EventTarget | undefined)?.dispatchEvent(new Event('error'));
      connection.client.close();
      return;
    }

    const entry: ClientEntry = { connection, io: toSocketIo(connection), token: null };
    this.clients.add(entry);
    this.ensureSubscribed();

    // O binding só decodifica EVENT; o CONNECT com `auth` (`40{...}`) é lido do frame bruto.
    connection.client.addEventListener('message', (event) => {
      const data = event.data;
      if (typeof data !== 'string' || !data.startsWith('40')) return;
      try {
        const auth = data.length > 2 ? (JSON.parse(data.slice(2)) as { token?: unknown }) : {};
        entry.token = typeof auth.token === 'string' ? auth.token : null;
      } catch {
        entry.token = null;
      }
    });

    // engine.io v4: o servidor envia ping ("2"); o cliente responde "3" e se desconecta sem ping.
    entry.pingTimer = setInterval(() => connection.client.send('2'), this.pingIntervalMs);
    (entry.pingTimer as { unref?: () => void }).unref?.();

    connection.client.addEventListener('close', () => this.detach(entry));
  }

  private detach(entry: ClientEntry): void {
    clearInterval(entry.pingTimer);
    this.clients.delete(entry);
    if (this.clients.size === 0) {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
    }
  }

  /** Assina o `MockDb` só enquanto houver clientes (sem listeners órfãos). */
  private ensureSubscribed(): void {
    this.unsubscribe ??= this.db.subscribe((event) => this.dispatch(event));
  }

  private dispatch(event: DbEvent): void {
    for (const entry of this.clients) {
      // Token revogado/expirado (logout) deixa de receber eventos privados, mesmo com o socket aberto.
      if (event.type === 'order.updated' && this.db.userIdForToken(entry.token) !== event.payload.userId) continue;
      const name = event.type === 'nft.updated' ? SOCKET_EVENTS.nftUpdated : SOCKET_EVENTS.orderUpdated;
      entry.io.client.emit(name, event.payload);
    }
  }
}
