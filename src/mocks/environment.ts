import { DEFAULT_SOCKET_URL } from '@/shared/schemas/events';
import { MockDb, type MockDbOptions } from './db/db';
import { createHandlers } from './handlers';
import { SocketHub, type SocketHubOptions } from './socket/hub';

export interface MockEnvironmentOptions extends MockDbOptions, SocketHubOptions {
  /** Base do socket (sem path). Padrão: `VITE_SOCKET_URL` ou `ws://mock.socket.local`. */
  socketUrl?: string;
}

/**
 * Monta o ambiente completo de mocks: um `MockDb`, os handlers REST e o servidor Socket.IO,
 * todos sobre o mesmo estado. Reutilizado por dev, demo, Playwright e testes unitários.
 */
export function createMockEnvironment(options: MockEnvironmentOptions = {}) {
  const socketUrl = options.socketUrl ?? import.meta.env?.VITE_SOCKET_URL ?? DEFAULT_SOCKET_URL;
  const db = new MockDb(options);
  const hub = new SocketHub(db, options);
  // O MSW (>= 2.x) remove o prefixo `/socket.io/` da URL do cliente antes de casar, então o handler
  // é registrado só na origem do socket (sem path) e casa com a querystring `?EIO=4&transport=websocket`.
  const handlers = [...createHandlers(db, hub), hub.createHandler(socketUrl.replace(/\/$/, ''))];
  return { db, hub, handlers, socketUrl };
}

export type MockEnvironment = ReturnType<typeof createMockEnvironment>;
