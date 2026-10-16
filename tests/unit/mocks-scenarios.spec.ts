import { MockDb, type DbEvent } from '@/mocks/db/db';
import { SCENARIO_NAMES } from '@/mocks/scenarios';
import { test, expect } from './helpers/mock-fixture';

test.describe('MSW — condições de rede e falhas', () => {
  test('NETWORK_ERROR derruba a conexão só no catálogo; /mock/* continua acessível', async ({ mock }) => {
    await mock.api.post('/mock/scenario', { name: 'NETWORK_ERROR' });
    await expect(mock.api.get('/nfts')).rejects.toThrow();
    await expect(mock.api.get('/nfts/nft-001')).rejects.toThrow();
    expect((await mock.api.get('/mock/scenario')).data.name).toBe('NETWORK_ERROR');

    await mock.api.post('/mock/scenario', { name: 'DEFAULT' });
    expect((await mock.api.get('/nfts')).status).toBe(200);
  });

  test('HTTP_4XX e HTTP_5XX devolvem o envelope de erro tipado', async ({ mock }) => {
    mock.db.setScenario('HTTP_4XX');
    const bad = await mock.api.get('/nfts');
    expect(bad.status).toBe(400);
    expect(bad.data).toMatchObject({ code: 'BAD_REQUEST', message: expect.any(String) });

    mock.db.setScenario('HTTP_5XX');
    const down = await mock.api.get('/nfts');
    expect(down.status).toBe(503);
    expect(down.data.code).toBe('SERVICE_UNAVAILABLE');
  });

  test('orçamento de falhas: N falhas e depois recupera sem trocar de cenário (nova tentativa)', async ({ mock }) => {
    await mock.api.post('/mock/scenario', { name: 'HTTP_5XX', failures: 2 });
    expect((await mock.api.get('/nfts')).status).toBe(503);
    expect((await mock.api.get('/nfts')).status).toBe(503);
    expect((await mock.api.get('/nfts')).status).toBe(200);

    await mock.api.post('/mock/scenario', { name: 'NETWORK_ERROR', failures: 1 });
    await expect(mock.api.get('/nfts')).rejects.toThrow();
    expect((await mock.api.get('/nfts')).status).toBe(200);
  });

  test('EMPTY_RESULTS devolve página vazia válida', async ({ mock }) => {
    mock.db.setScenario('EMPTY_RESULTS');
    const res = await mock.api.get('/nfts', { params: { page: 2, limit: 10 } });
    expect(res.data).toEqual({ items: [], total: 0, page: 2, limit: 10, totalPages: 1 });
  });

  test('SLOW_NETWORK atrasa ~2 s', async ({ mock }) => {
    mock.db.setScenario('SLOW_NETWORK');
    const start = Date.now();
    const res = await mock.api.get('/nfts/nft-001');
    expect(res.status).toBe(200);
    expect(Date.now() - start).toBeGreaterThanOrEqual(1900);
  });

  test('VARIABLE_LATENCY é determinístico e produz respostas fora de ordem', async ({ mock }) => {
    mock.db.setScenario('VARIABLE_LATENCY');
    const finished: string[] = [];
    const call = (search: string) =>
      mock.api.get('/nfts', { params: { search } }).then((r) => {
        finished.push(search);
        return r;
      });
    // Disparadas em ordem a → b → c: latências 900 → 60 → 400 ms.
    await Promise.all([call('a'), call('b'), call('c')]);
    expect(finished).toEqual(['b', 'c', 'a']);

    // Reconfigurar o cenário reinicia a sequência (reprodutível).
    mock.db.setScenario('VARIABLE_LATENCY');
    finished.length = 0;
    await Promise.all([call('a'), call('b'), call('c')]);
    expect(finished).toEqual(['b', 'c', 'a']);
  });

  test('SESSION_EXPIRED: a próxima chamada autenticada recebe 401 e o usuário precisa logar de novo', async ({ mock }) => {
    const token = await mock.login('ana');
    mock.db.setScenario('SESSION_EXPIRED');

    const expired = await mock.api.get('/cart', mock.auth(token));
    expect(expired.status).toBe(401);
    expect(expired.data.code).toBe('SESSION_EXPIRED');

    const still = await mock.api.get('/cart', mock.auth(token));
    expect(still.status).toBe(401);

    const fresh = await mock.login('ana');
    expect((await mock.api.get('/cart', mock.auth(fresh))).status).toBe(200);
  });

  test('REGISTER_CONFLICT e FORM_VALIDATION_ERROR retornam erros por campo', async ({ mock }) => {
    const body = { name: 'Nova Pessoa', email: 'nova@example.com', password: 'Senha@123' };
    mock.db.setScenario('REGISTER_CONFLICT');
    const conflict = await mock.api.post('/auth/register', body);
    expect(conflict.status).toBe(409);
    expect(conflict.data.fields.email).toBeTruthy();

    mock.db.setScenario('FORM_VALIDATION_ERROR');
    const invalid = await mock.api.post('/auth/register', body);
    expect(invalid.status).toBe(400);
    expect(invalid.data).toMatchObject({ code: 'VALIDATION_ERROR', fields: { email: expect.any(String) } });

    const token = await mock.login('ana');
    const profile = await mock.api.patch('/profile', { name: 'Ana' }, mock.auth(token));
    expect(profile.data.fields).toHaveProperty('name');
    const wallet = await mock.api.patch('/wallets/wallet-1', { label: 'ok' }, mock.auth(token));
    expect(wallet.data.fields).toHaveProperty('address');
  });

  test('todos os cenários do README existem e são aceitos pelo endpoint de controle', async ({ mock }) => {
    for (const required of [
      'EMPTY_RESULTS', 'VARIABLE_LATENCY', 'NETWORK_ERROR', 'HTTP_4XX', 'HTTP_5XX', 'SESSION_EXPIRED',
      'UNAUTHORIZED', 'REGISTER_CONFLICT', 'FORM_VALIDATION_ERROR', 'COUPON_INVALID', 'COUPON_EXPIRED',
      'PRICE_CHANGED_MID_CHECKOUT', 'EDITION_SOLD_OUT', 'ORDER_TIMEOUT_AFTER_CREATE', 'PAYMENT_CONFIRMED',
      'PAYMENT_DECLINED',
    ]) {
      expect(SCENARIO_NAMES).toContain(required);
    }
    for (const name of SCENARIO_NAMES) {
      const res = await mock.api.post('/mock/scenario', { name });
      expect(res.status, name).toBe(200);
      expect(res.data.name).toBe(name);
    }
    const unknown = await mock.api.post('/mock/scenario', { name: 'NOPE' });
    expect(unknown.status).toBe(400);
    expect(unknown.data.fields.name).toContain('DEFAULT');
  });
});

test.describe('MSW — endpoints de controle e eventos', () => {
  test('POST /mock/nfts/:id altera o dado REST e emite nft.updated coerente com ele', async ({ mock }) => {
    const events: DbEvent[] = [];
    mock.db.subscribe((e) => events.push(e));

    const res = await mock.api.post('/mock/nfts/nft-001', { price: '0.75', availableQuantity: 2 });
    expect(res.status).toBe(200);
    const rest = (await mock.api.get('/nfts/nft-001')).data;
    expect(rest).toMatchObject({ price: '0.75', availableQuantity: 2, isAvailable: true, version: 2 });

    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      resource: 'nft', id: 'nft-001', version: 2, price: '0.75', availableQuantity: 2, isAvailable: true,
      eventId: expect.stringMatching(/^evt-\d+$/),
    });
  });

  test('NFT com edições: patch pelas edições recalcula preço mínimo e estoque; patch no topo é recusado', async ({ mock }) => {
    const res = await mock.api.post('/mock/nfts/nft-002', { editions: [{ id: 'standard', price: '0.4', availableQuantity: 0 }] });
    expect(res.data).toMatchObject({ price: '0.4', availableQuantity: 1 });
    const top = await mock.api.post('/mock/nfts/nft-002', { price: '1' });
    expect(top.status).toBe(400);
    const badPrice = await mock.api.post('/mock/nfts/nft-001', { price: '1,5' });
    expect(badPrice.status).toBe(400);
  });

  test('esgotar via /mock zera isAvailable; versões só crescem', async ({ mock }) => {
    await mock.api.post('/mock/nfts/nft-001', { availableQuantity: 0 });
    await mock.api.post('/mock/nfts/nft-001', { availableQuantity: 4 });
    expect((await mock.api.get('/nfts/nft-001')).data).toMatchObject({ version: 3, isAvailable: true });
  });

  test('replay duplicate repete o mesmo eventId; stale envia versão menor com preço sentinela', async ({ mock }) => {
    const events: DbEvent[] = [];
    await mock.api.post('/mock/nfts/nft-001', { price: '0.6' });
    mock.db.subscribe((e) => events.push(e));

    await mock.api.post('/mock/socket/replay', { kind: 'duplicate' });
    await mock.api.post('/mock/socket/replay', { kind: 'stale' });
    expect(events).toHaveLength(2);
    expect(events[0]!.payload.eventId).toBe('evt-1');
    expect(events[1]!.payload).toMatchObject({ version: 1, price: '999' });
    expect(events[1]!.payload.eventId).not.toBe('evt-1');
    // O replay não altera os dados REST.
    expect((await mock.api.get('/nfts/nft-001')).data.price).toBe('0.6');

    const empty = new MockDb({ baseLatencyMs: 0 });
    expect(() => empty.replayLast('duplicate')).toThrowError(/Nenhum evento/);
    empty.dispose();
  });

  test('POST /mock/reset restaura catálogo, usuários e cenário', async ({ mock }) => {
    const token = await mock.login('ana');
    await mock.api.post('/mock/nfts/nft-001', { price: '5' });
    await mock.api.post('/cart/items', { nftId: 'nft-001', quantity: 1 }, mock.auth(token));
    await mock.api.post('/mock/scenario', { name: 'HTTP_5XX' });

    expect((await mock.api.post('/mock/reset')).status).toBe(204);
    expect((await mock.api.get('/nfts/nft-001')).data).toMatchObject({ price: '0.5', version: 1 });
    expect((await mock.api.get('/mock/scenario')).data.name).toBe('DEFAULT');
    expect((await mock.api.get('/cart', mock.auth(token))).status).toBe(401); // sessões não sobrevivem ao reset
  });

  test('pedido PENDING persistido é retomado após "refresh" e resolve uma única vez', async () => {
    const { MemoryStorage } = await import('@/mocks/db/db');
    const storage = new MemoryStorage();
    const db1 = new MockDb({ storage, baseLatencyMs: 0, orderResolveDelayMs: 60_000 });
    const session = await db1.login('ana@example.com', 'Senha@123');
    const stored = db1.authenticate(session.token);
    const user = session.user;
    db1.setWalletConnection(user.id, 'wallet-1', true);
    const quote = db1.buildQuote([{ nftId: 'nft-001', quantity: 1 }]);
    const { order } = await db1.createOrder(stored, 'k1', {
      items: [{ nftId: 'nft-001', quantity: 1 }], quoteVersion: quote.version, walletId: 'wallet-1', network: 'ethereum',
    });
    db1.dispose(); // "refresh": timers perdidos

    const db2 = new MockDb({ storage, baseLatencyMs: 0, orderResolveDelayMs: 20 });
    const events: DbEvent[] = [];
    db2.subscribe((e) => events.push(e));
    expect(db2.getOrder(user.id, order.id).status).toBe('PENDING');
    db2.resumePendingOrders();
    db2.resumePendingOrders(); // idempotente: não agenda duas vezes
    await expect.poll(() => db2.getOrder(user.id, order.id).status).toBe('CONFIRMED');
    await new Promise((r) => setTimeout(r, 60));
    expect(events.filter((e) => e.type === 'order.updated')).toHaveLength(1);
    db2.dispose();
  });
});
