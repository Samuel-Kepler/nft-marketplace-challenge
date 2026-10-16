import type { DbEvent } from '@/mocks/db/db';
import { test, expect } from './helpers/mock-fixture';

const items = (nftId: string, quantity: number, editionId?: string) => ({ nftId, quantity, ...(editionId && { editionId }) });

test.describe('MSW REST — favoritos e carrinho', () => {
  test('favoritos são por usuário e a mutation é idempotente', async ({ mock }) => {
    const ana = await mock.login('ana');
    const bruno = await mock.login('bruno');

    const add = await mock.api.post('/favorites', { nftId: 'nft-001' }, mock.auth(ana));
    expect(add.status).toBe(201);
    await mock.api.post('/favorites', { nftId: 'nft-001' }, mock.auth(ana));
    expect((await mock.api.get('/favorites', mock.auth(ana))).data.nftIds).toEqual(['nft-004', 'nft-001']);
    expect((await mock.api.get('/favorites', mock.auth(bruno))).data.nftIds).toEqual([]);

    expect((await mock.api.post('/favorites', { nftId: 'nft-999' }, mock.auth(ana))).status).toBe(404);
    const removed = await mock.api.delete('/favorites/nft-001', mock.auth(ana));
    expect(removed.data.nftIds).toEqual(['nft-004']);
  });

  test('cenário FAVORITES_MUTATION_FAILS falha só as mutations e o estado não muda', async ({ mock }) => {
    const ana = await mock.login('ana');
    mock.db.setScenario('FAVORITES_MUTATION_FAILS');

    const fail = await mock.api.post('/favorites', { nftId: 'nft-001' }, mock.auth(ana));
    expect(fail.status).toBe(503);
    expect((await mock.api.get('/favorites', mock.auth(ana))).data.nftIds).toEqual(['nft-004']);

    mock.db.setScenario('FAVORITES_MUTATION_FAILS', 1);
    expect((await mock.api.post('/favorites', { nftId: 'nft-001' }, mock.auth(ana))).status).toBe(503);
    expect((await mock.api.post('/favorites', { nftId: 'nft-001' }, mock.auth(ana))).status).toBe(201);
  });

  test('carrinho: adicionar soma quantidades, altera, remove e respeita a disponibilidade', async ({ mock }) => {
    const token = await mock.login('ana');
    const added = await mock.api.post('/cart/items', items('nft-001', 2), mock.auth(token));
    expect(added.status).toBe(201);
    expect(added.data.items[0]).toMatchObject({ key: 'nft-001', quantity: 2, maxQuantity: 5, subtotal: '1' });

    const more = await mock.api.post('/cart/items', items('nft-001', 1), mock.auth(token));
    expect(more.data.items).toHaveLength(1);
    expect(more.data.items[0].quantity).toBe(3);

    const over = await mock.api.post('/cart/items', items('nft-001', 3), mock.auth(token));
    expect(over.status).toBe(409);
    expect(over.data).toMatchObject({ code: 'AVAILABILITY_CONFLICT', details: { max: 5 } });

    const patched = await mock.api.patch('/cart/items/nft-001', { quantity: 5 }, mock.auth(token));
    expect(patched.data.items[0].quantity).toBe(5);
    expect((await mock.api.patch('/cart/items/nft-001', { quantity: 6 }, mock.auth(token))).status).toBe(409);
    expect((await mock.api.patch('/cart/items/nft-001', { quantity: 1.5 }, mock.auth(token))).status).toBe(400);

    expect((await mock.api.delete('/cart/items/nft-001', mock.auth(token))).data.items).toEqual([]);
    expect((await mock.api.patch('/cart/items/nft-001', { quantity: 1 }, mock.auth(token))).status).toBe(404);
  });

  test('edições: chave nftId:editionId, edição padrão e limite por edição', async ({ mock }) => {
    const token = await mock.login('ana');
    const def = await mock.api.post('/cart/items', items('nft-002', 1), mock.auth(token));
    expect(def.data.items[0]).toMatchObject({ key: 'nft-002:standard', price: '0.8', maxQuantity: 3 });

    const collector = await mock.api.post('/cart/items', items('nft-002', 1, 'collector'), mock.auth(token));
    expect(collector.data.items.map((i: { key: string }) => i.key)).toEqual(['nft-002:standard', 'nft-002:collector']);
    expect((await mock.api.post('/cart/items', items('nft-002', 1, 'collector'), mock.auth(token))).status).toBe(409);
    expect((await mock.api.post('/cart/items', items('nft-002', 1, 'nope'), mock.auth(token))).status).toBe(404);
    expect((await mock.api.post('/cart/items', items('nft-001', 1, 'standard'), mock.auth(token))).status).toBe(404);

    const removed = await mock.api.delete(`/cart/items/${encodeURIComponent('nft-002:standard')}`, mock.auth(token));
    expect(removed.data.items.map((i: { key: string }) => i.key)).toEqual(['nft-002:collector']);
  });

  test('carrinhos são isolados por usuário e NFT esgotado não entra', async ({ mock }) => {
    const ana = await mock.login('ana');
    const bruno = await mock.login('bruno');
    await mock.api.post('/cart/items', items('nft-001', 1), mock.auth(ana));
    expect((await mock.api.get('/cart', mock.auth(bruno))).data.items).toEqual([]);
    expect((await mock.api.post('/cart/items', items('nft-003', 1), mock.auth(ana))).status).toBe(409);
  });
});

test.describe('MSW REST — cotação', () => {
  test('totais exatos em string decimal: subtotal, desconto, taxa e total', async ({ mock }) => {
    const plain = await mock.api.post('/checkout/quote', { items: [items('nft-001', 2)] });
    expect(plain.status).toBe(200);
    expect(plain.data).toMatchObject({ subtotal: '1', discount: '0', networkFee: '0.002', total: '1.002', isCouponApplied: false });

    const coupon = await mock.api.post('/checkout/quote', { items: [items('nft-001', 2)], couponCode: 'nft10' });
    expect(coupon.data).toMatchObject({ discount: '0.1', total: '0.902', couponCode: 'NFT10', isCouponApplied: true });

    const mixed = await mock.api.post('/checkout/quote', { items: [items('nft-002', 1), items('nft-002', 1, 'collector')] });
    expect(mixed.data.subtotal).toBe('2.3'); // 0.8 + 1.5 sem erro de ponto flutuante
  });

  test('cupom inválido/expirado (422) e cenários que forçam cada erro', async ({ mock }) => {
    const invalid = await mock.api.post('/checkout/quote', { items: [items('nft-001', 1)], couponCode: 'XYZ' });
    expect(invalid.status).toBe(422);
    expect(invalid.data).toMatchObject({ code: 'COUPON_INVALID', fields: { couponCode: expect.any(String) } });

    const expired = await mock.api.post('/checkout/quote', { items: [items('nft-001', 1)], couponCode: 'EXPIRED20' });
    expect(expired.data.code).toBe('COUPON_EXPIRED');

    mock.db.setScenario('COUPON_INVALID');
    expect((await mock.api.post('/checkout/quote', { items: [items('nft-001', 1)], couponCode: 'NFT10' })).data.code).toBe('COUPON_INVALID');
    mock.db.setScenario('COUPON_EXPIRED');
    expect((await mock.api.post('/checkout/quote', { items: [items('nft-001', 1)], couponCode: 'NFT10' })).data.code).toBe('COUPON_EXPIRED');
  });

  test('estoque insuficiente → 409 EDITION_UNAVAILABLE; a versão muda quando o preço muda', async ({ mock }) => {
    const sold = await mock.api.post('/checkout/quote', { items: [items('nft-001', 6)] });
    expect(sold.status).toBe(409);
    expect(sold.data).toMatchObject({ code: 'EDITION_UNAVAILABLE', details: { max: 5 } });

    const before = (await mock.api.post('/checkout/quote', { items: [items('nft-001', 1)] })).data;
    mock.db.updateNft('nft-001', { price: '0.6' });
    const after = (await mock.api.post('/checkout/quote', { items: [items('nft-001', 1)] })).data;
    expect(after.version).toBeGreaterThan(before.version);
    expect(after.total).toBe('0.602');
  });
});

test.describe('MSW REST — pedidos', () => {
  const order = (quoteVersion: number, overrides: Record<string, unknown> = {}) => ({
    items: [items('nft-001', 2)],
    quoteVersion,
    walletId: 'wallet-1',
    network: 'ethereum',
    ...overrides,
  });
  const idem = (token: string, key: string) => ({ headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key } });
  const quoteVersion = async (mock: { api: { post: (u: string, b: unknown) => Promise<{ data: { version: number } }> } }) =>
    (await mock.api.post('/checkout/quote', { items: [items('nft-001', 2)] })).data.version;

  test('exige Idempotency-Key e carteira conectada', async ({ mock }) => {
    const token = await mock.login('ana');
    const version = await quoteVersion(mock);

    const noKey = await mock.api.post('/orders', order(version), mock.auth(token));
    expect(noKey.status).toBe(400);
    expect(noKey.data.code).toBe('MISSING_IDEMPOTENCY_KEY');

    const disconnected = await mock.api.post('/orders', order(version), idem(token, 'k1'));
    expect(disconnected.status).toBe(409);
    expect(disconnected.data.code).toBe('WALLET_NOT_CONNECTED');
  });

  test('mesma chave → mesmo pedido (201 depois 200); conteúdo diferente → 409', async ({ mock }) => {
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    const version = await quoteVersion(mock);

    const first = await mock.api.post('/orders', order(version), idem(token, 'k1'));
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({ status: 'PENDING', version: 1, buyer: { email: 'ana@example.com' } });

    const replay = await mock.api.post('/orders', order(version), idem(token, 'k1'));
    expect(replay.status).toBe(200);
    expect(replay.data.id).toBe(first.data.id);
    expect(replay.headers['idempotent-replayed']).toBe('true');

    const mismatch = await mock.api.post('/orders', order(version, { items: [items('nft-001', 3)] }), idem(token, 'k1'));
    expect(mismatch.status).toBe(409);
    expect(mismatch.data.code).toBe('IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH');

    const second = await mock.api.post('/orders', order(version), idem(token, 'k2'));
    expect(second.data.id).not.toBe(first.data.id);
  });

  test('requisições concorrentes com a mesma chave criam um único pedido', async ({ mock }) => {
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    const version = await quoteVersion(mock);

    const results = await Promise.all(
      Array.from({ length: 4 }, () => mock.api.post('/orders', order(version), idem(token, 'dup')))
    );
    expect(new Set(results.map((r) => r.data.id)).size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  test('replay vem ANTES da validação: após nft.updated devolve o pedido, e chave nova recebe QUOTE_STALE', async ({ mock }) => {
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    const version = await quoteVersion(mock);
    const created = await mock.api.post('/orders', order(version), idem(token, 'k1'));

    mock.db.updateNft('nft-001', { price: '0.7' });

    const replay = await mock.api.post('/orders', order(version), idem(token, 'k1'));
    expect(replay.status).toBe(200);
    expect(replay.data.id).toBe(created.data.id);

    const stale = await mock.api.post('/orders', order(version), idem(token, 'k-new'));
    expect(stale.status).toBe(409);
    expect(stale.data).toMatchObject({ code: 'QUOTE_STALE', details: { currentQuoteVersion: expect.any(Number) } });
  });

  test('PENDING → CONFIRMED: tx simulada, estoque baixa, eventos na ordem e recibo é snapshot', async ({ mock }) => {
    const events: DbEvent[] = [];
    mock.db.subscribe((e) => events.push(e));
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    const version = await quoteVersion(mock);
    const created = await mock.api.post('/orders', order(version), idem(token, 'k1'));

    await expect
      .poll(async () => (await mock.api.get(`/orders/${created.data.id}`, mock.auth(token))).data.status)
      .toBe('CONFIRMED');
    const receipt = (await mock.api.get(`/orders/${created.data.id}`, mock.auth(token))).data;
    expect(receipt).toMatchObject({ version: 2, quote: { subtotal: '1', total: '1.002' } });
    expect(receipt.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);

    expect((await mock.api.get('/nfts/nft-001')).data).toMatchObject({ availableQuantity: 3, version: 2 });
    expect(events.map((e) => `${e.type}:${e.payload.version}`)).toEqual(['order.updated:1', 'nft.updated:2', 'order.updated:2']);

    // alterações posteriores no catálogo não mexem no recibo
    mock.db.updateNft('nft-001', { price: '9' });
    const again = (await mock.api.get(`/orders/${created.data.id}`, mock.auth(token))).data;
    expect(again.items[0].price).toBe('0.5');
    expect(again.quote.total).toBe('1.002');

    // estado terminal não muda
    expect(mock.db.resolveOrder(created.data.id, 'DECLINED')?.status).toBe('CONFIRMED');
  });

  test('cenário PAYMENT_DECLINED: recusado, sem baixa de estoque', async ({ mock }) => {
    mock.db.setScenario('PAYMENT_DECLINED');
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    const created = await mock.api.post('/orders', order(await quoteVersion(mock)), idem(token, 'k1'));
    await expect
      .poll(async () => (await mock.api.get(`/orders/${created.data.id}`, mock.auth(token))).data.status)
      .toBe('DECLINED');
    const declined = (await mock.api.get(`/orders/${created.data.id}`, mock.auth(token))).data;
    expect(declined.errorMessage).toBeTruthy();
    expect(declined.transactionHash).toBeUndefined();
    expect((await mock.api.get('/nfts/nft-001')).data.availableQuantity).toBe(5);
  });

  test('pedido de outro usuário → 403; inexistente → 404; UNAUTHORIZED → 403', async ({ mock }) => {
    const ana = await mock.login('ana');
    const bruno = await mock.login('bruno');
    await mock.connectWallet(ana, 'wallet-1');
    const created = await mock.api.post('/orders', order(await quoteVersion(mock)), idem(ana, 'k1'));

    expect((await mock.api.get(`/orders/${created.data.id}`, mock.auth(bruno))).status).toBe(403);
    expect((await mock.api.get('/orders/order-x', mock.auth(ana))).status).toBe(404);

    mock.db.setScenario('UNAUTHORIZED');
    const forbidden = await mock.api.get(`/orders/${created.data.id}`, mock.auth(ana));
    expect(forbidden.status).toBe(403);
    expect(forbidden.data.code).toBe('FORBIDDEN');
  });

  test('ORDER_TIMEOUT_AFTER_CREATE: resposta cai, pedido existe e o replay o recupera', async ({ mock }) => {
    mock.db.setScenario('ORDER_TIMEOUT_AFTER_CREATE');
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    const version = await quoteVersion(mock);

    await expect(mock.api.post('/orders', order(version), idem(token, 'k1'))).rejects.toThrow();

    const replay = await mock.api.post('/orders', order(version), idem(token, 'k1'));
    expect(replay.status).toBe(200);
    expect(replay.data.status).toMatch(/PENDING|CONFIRMED/);
    // Um único pedido foi criado apesar do "timeout".
    const again = await mock.api.post('/orders', order(version), idem(token, 'k1'));
    expect(again.data.id).toBe(replay.data.id);
  });

  test('PRICE_CHANGED_MID_CHECKOUT: sobe o preço uma vez, emite nft.updated e a reconfirmação passa', async ({ mock }) => {
    const events: DbEvent[] = [];
    mock.db.subscribe((e) => events.push(e));
    mock.db.setScenario('PRICE_CHANGED_MID_CHECKOUT');
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    const version = await quoteVersion(mock);

    const changed = await mock.api.post('/orders', order(version), idem(token, 'k1'));
    expect(changed.status).toBe(409);
    expect(changed.data.code).toBe('PRICE_CHANGED');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'nft.updated', payload: { id: 'nft-001', price: '0.55', version: 2 } });

    const fresh = await mock.api.post('/checkout/quote', { items: [items('nft-001', 2)] });
    expect(fresh.data.subtotal).toBe('1.1');
    const ok = await mock.api.post('/orders', order(fresh.data.version), idem(token, 'k2'));
    expect(ok.status).toBe(201);
    expect(ok.data.quote.subtotal).toBe('1.1');
  });

  test('EDITION_SOLD_OUT: esgota a edição durante a compra e preserva o carrinho', async ({ mock }) => {
    mock.db.setScenario('EDITION_SOLD_OUT');
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    await mock.api.post('/cart/items', items('nft-001', 2), mock.auth(token));

    const res = await mock.api.post('/orders', order(await quoteVersion(mock)), idem(token, 'k1'));
    expect(res.status).toBe(409);
    expect(res.data).toMatchObject({ code: 'EDITION_UNAVAILABLE', details: { max: 0 } });
    expect((await mock.api.get('/nfts/nft-001')).data).toMatchObject({ availableQuantity: 0, isAvailable: false });

    const cart = (await mock.api.get('/cart', mock.auth(token))).data;
    expect(cart.items[0]).toMatchObject({ quantity: 2, maxQuantity: 0 });
  });

  test('compra de edição reduz só aquela edição e recalcula o total do NFT', async ({ mock }) => {
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    const lines = [items('nft-002', 1, 'collector')];
    const version = (await mock.api.post('/checkout/quote', { items: lines })).data.version;
    const created = await mock.api.post('/orders', order(version, { items: lines }), idem(token, 'k1'));
    expect(created.status).toBe(201);
    mock.db.resolveOrder(created.data.id, 'CONFIRMED');

    const nft = (await mock.api.get('/nfts/nft-002')).data;
    expect(nft.editions.find((e: { id: string }) => e.id === 'collector').availableQuantity).toBe(0);
    expect(nft.availableQuantity).toBe(3);
  });
  test('CONFIRMED remove do carrinho só o comprado; DECLINED preserva tudo', async ({ mock }) => {
    const token = await mock.login('ana');
    await mock.connectWallet(token, 'wallet-1');
    await mock.api.post('/cart/items', items('nft-001', 4), mock.auth(token));
    await mock.api.post('/cart/items', items('nft-004', 1), mock.auth(token));
    const version = await quoteVersion(mock);

    const declined = await mock.api.post('/orders', order(version), idem(token, 'k-declined'));
    mock.db.resolveOrder(declined.data.id, 'DECLINED');
    const kept = (await mock.api.get('/cart', mock.auth(token))).data.items;
    expect(kept.map((l: { key: string; quantity: number }) => [l.key, l.quantity])).toEqual([['nft-001', 4], ['nft-004', 1]]);

    const created = await mock.api.post('/orders', order(version), idem(token, 'k-ok'));
    mock.db.resolveOrder(created.data.id, 'CONFIRMED');
    const left = (await mock.api.get('/cart', mock.auth(token))).data.items;
    expect(left.map((l: { key: string; quantity: number }) => [l.key, l.quantity])).toEqual([['nft-001', 2], ['nft-004', 1]]);
  });
});
