import { test as base } from '@playwright/test';
import axios, { type AxiosInstance } from 'axios';
import { setupServer } from 'msw/node';
import { MockDb } from '@/mocks/db/db';
import { createHandlers } from '@/mocks/handlers';
import { FIXTURE_CREDENTIALS } from '@/mocks/fixtures/users';

export interface MockHarness {
  db: MockDb;
  /** Cliente Axios real contra os handlers MSW; nunca lança por status HTTP. */
  api: AxiosInstance;
  /** Cabeçalho Authorization para um token. */
  auth: (token: string) => { headers: { Authorization: string } };
  /** Faz login de um usuário fixture e devolve o token. */
  login: (who?: keyof typeof FIXTURE_CREDENTIALS) => Promise<string>;
  /** Conecta uma carteira (pré-requisito para criar pedidos). */
  connectWallet: (token: string, walletId: string) => Promise<void>;
}

/**
 * Cada teste recebe seu próprio `MockDb` em memória + servidor MSW (Node), então os
 * testes de REST passam pelos mesmos handlers usados no navegador e ficam isolados.
 */
export const test = base.extend<{ mock: MockHarness }>({
  mock: async ({}, use) => {
    const db = new MockDb({ baseLatencyMs: 0, orderResolveDelayMs: 25 });
    const server = setupServer(...createHandlers(db));
    server.listen({ onUnhandledRequest: 'error' });
    const api = axios.create({ baseURL: 'http://mock.test/api/v1', validateStatus: () => true });
    const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

    await use({
      db,
      api,
      auth,
      login: async (who = 'ana') => {
        const res = await api.post('/auth/login', FIXTURE_CREDENTIALS[who]);
        if (res.status !== 200) throw new Error(`login falhou: ${res.status}`);
        return res.data.token as string;
      },
      connectWallet: async (token, walletId) => {
        const res = await api.post(`/wallets/${walletId}/connect`, undefined, auth(token));
        if (res.status !== 200) throw new Error(`connect falhou: ${res.status}`);
      },
    });

    server.close();
    db.dispose();
  },
});

export { expect } from '@playwright/test';
