import { test, expect } from '@playwright/test';
import { ApiRequestError } from '@/shared/api/errors';
import type { CreateOrderRequest } from '@/shared/schemas/order';

/** O registro vive em `window.localStorage`; no projeto `unit` (Node) simulamos só o necessário. */
function installWindow() {
  const data = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

const body = (overrides: Partial<CreateOrderRequest> = {}): CreateOrderRequest => ({
  items: [{ nftId: 'nft-001', quantity: 2 }],
  quoteVersion: 3,
  walletId: 'wallet-1',
  network: 'ethereum',
  ...overrides,
});

test.describe('Tentativa de checkout (idempotência no cliente)', () => {
  test.beforeEach(() => installWindow());

  test('mesmo conteúdo reaproveita a chave; reenvio recupera o mesmo registro', async () => {
    const { prepareAttempt, rememberOrder, readAttempt } = await import('@/features/checkout/attempt');
    const first = await prepareAttempt('u1', body());
    const again = await prepareAttempt('u1', body());
    expect(again.key).toBe(first.key);

    rememberOrder(first, 'order-9');
    expect(readAttempt('u1')).toMatchObject({ key: first.key, orderId: 'order-9' });
    expect((await prepareAttempt('u1', body())).orderId).toBe('order-9');
  });

  test('ordem dos itens e caixa do cupom não mudam o hash', async () => {
    const { hashOrderRequest } = await import('@/features/checkout/attempt');
    const a = body({ items: [{ nftId: 'a', quantity: 1 }, { nftId: 'b', quantity: 1 }], couponCode: 'nft10' });
    const b = body({ items: [{ nftId: 'b', quantity: 1 }, { nftId: 'a', quantity: 1 }], couponCode: 'NFT10' });
    expect(await hashOrderRequest(a)).toBe(await hashOrderRequest(b));
  });

  test('cotação, carteira ou quantidade diferentes geram chave nova (nunca a mesma chave com outro conteúdo)', async () => {
    const { prepareAttempt } = await import('@/features/checkout/attempt');
    const first = await prepareAttempt('u1', body());
    const requote = await prepareAttempt('u1', body({ quoteVersion: 4 }));
    expect(requote.key).not.toBe(first.key);
    expect(requote.orderId).toBeUndefined();
    expect((await prepareAttempt('u1', body({ walletId: 'wallet-2' }))).key).not.toBe(requote.key);
    expect((await prepareAttempt('u1', body({ items: [{ nftId: 'nft-001', quantity: 3 }] }))).key).not.toBe(requote.key);
  });

  test('registro de outro usuário ou corrompido é ignorado; clearAttempt apaga', async () => {
    const { prepareAttempt, readAttempt, clearAttempt } = await import('@/features/checkout/attempt');
    const { CHECKOUT_ATTEMPT_KEY } = await import('@/shared/api/session-store');
    const mine = await prepareAttempt('u1', body());
    expect(readAttempt('u2')).toBeNull();
    expect((await prepareAttempt('u2', body())).key).not.toBe(mine.key);

    window.localStorage.setItem(CHECKOUT_ATTEMPT_KEY, '{nao-json');
    expect(readAttempt('u1')).toBeNull();
    window.localStorage.setItem(CHECKOUT_ATTEMPT_KEY, '{"key":1}');
    expect(readAttempt('u1')).toBeNull();

    await prepareAttempt('u1', body());
    clearAttempt();
    expect(readAttempt('u1')).toBeNull();
  });

  test('só erro HTTP prova que nenhum pedido foi criado; rede e timeout mantêm a chave', async () => {
    const { failureCreatedNoOrder, isQuoteChangedError } = await import('@/features/checkout/attempt');
    expect(failureCreatedNoOrder(new ApiRequestError('api', 'x', 409, 'QUOTE_STALE'))).toBe(true);
    expect(failureCreatedNoOrder(new ApiRequestError('api', 'x', 503, 'HTTP_503'))).toBe(true);
    expect(failureCreatedNoOrder(new ApiRequestError('network', 'x'))).toBe(false);
    expect(failureCreatedNoOrder(new ApiRequestError('timeout', 'x'))).toBe(false);
    expect(failureCreatedNoOrder(new Error('x'))).toBe(false);

    expect(isQuoteChangedError(new ApiRequestError('api', 'x', 409, 'QUOTE_STALE'))).toBe(true);
    expect(isQuoteChangedError(new ApiRequestError('api', 'x', 409, 'PRICE_CHANGED'))).toBe(true);
    expect(isQuoteChangedError(new ApiRequestError('api', 'x', 409, 'EDITION_UNAVAILABLE'))).toBe(false);
  });
});
