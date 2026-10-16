import { test, expect } from '@playwright/test';
import { QueryClient } from '@tanstack/react-query';
import type { Session } from '@/shared/schemas/user';

/** `session-store` usa `window.localStorage`; no projeto `unit` (Node) simulamos só o necessário. */
function installWindow() {
  const data = new Map<string, string>();
  const listeners = new Set<unknown>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
    addEventListener: (_: string, l: unknown) => listeners.add(l),
    removeEventListener: (_: string, l: unknown) => listeners.delete(l),
  };
  return data;
}

const session = (id: string, expiresAt: string): Session => ({
  token: `tok-${id}`,
  expiresAt,
  user: { id, email: `${id}@example.com`, name: id, createdAt: '2026-01-01T00:00:00.000Z' },
});
const FUTURE = '2999-01-01T00:00:00.000Z';

test.describe('Sessão e isolamento de dados', () => {
  test.beforeEach(() => {
    installWindow();
  });

  test('sessão persiste e é lida de volta; expirada vira null (relógio da página)', async () => {
    const store = await import('@/shared/api/session-store');
    expect(store.getSession()).toBeNull();
    store.setSession(session('u1', FUTURE));
    expect(store.getUserId()).toBe('u1');
    expect(store.getToken()).toBe('tok-u1');
    store.setSession(session('u1', '2000-01-01T00:00:00.000Z'));
    expect(store.getSession()).toBeNull();
  });

  test('snapshot é estável entre leituras (requisito do useSyncExternalStore)', async () => {
    const store = await import('@/shared/api/session-store');
    store.setSession(session('u1', FUTURE));
    expect(store.getSession()).toBe(store.getSession());
  });

  test('conteúdo corrompido no storage é tratado como sem sessão', async () => {
    const store = await import('@/shared/api/session-store');
    window.localStorage.setItem(store.SESSION_STORAGE_KEY, '{nao-e-json');
    expect(store.getSession()).toBeNull();
  });

  test('assinantes são notificados em login e logout', async () => {
    const store = await import('@/shared/api/session-store');
    let calls = 0;
    const off = store.subscribeSession(() => calls++);
    store.setSession(session('u1', FUTURE));
    store.clearSession();
    off();
    store.setSession(session('u2', FUTURE));
    expect(calls).toBe(2);
  });

  test('beginSession descarta o cache do usuário anterior', async () => {
    const store = await import('@/shared/api/session-store');
    const { beginSession } = await import('@/features/auth/session');
    const qc = new QueryClient();
    store.setSession(session('u1', FUTURE));
    qc.setQueryData(['cart', 'u1'], { items: ['privado'] });
    beginSession(qc, session('u2', FUTURE));
    expect(qc.getQueryData(['cart', 'u1'])).toBeUndefined();
    expect(store.getUserId()).toBe('u2');
  });

  test('logout limpa cache e tentativa de checkout; expiração preserva a tentativa', async () => {
    const store = await import('@/shared/api/session-store');
    const { endSession } = await import('@/features/auth/session');
    const qc = new QueryClient();

    store.setSession(session('u1', FUTURE));
    window.localStorage.setItem(store.CHECKOUT_ATTEMPT_KEY, '{"key":"k"}');
    qc.setQueryData(['orders', 'u1', 'o1'], { id: 'o1' });
    endSession(qc, { expired: true });
    expect(store.getSession()).toBeNull();
    expect(qc.getQueryData(['orders', 'u1', 'o1'])).toBeUndefined();
    expect(window.localStorage.getItem(store.CHECKOUT_ATTEMPT_KEY)).not.toBeNull();

    endSession(qc);
    expect(window.localStorage.getItem(store.CHECKOUT_ATTEMPT_KEY)).toBeNull();
  });
});
