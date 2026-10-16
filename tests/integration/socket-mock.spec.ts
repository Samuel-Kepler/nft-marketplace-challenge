import { test, expect, type Page } from '@playwright/test';

/**
 * Integração real: Chromium + MSW (Service Worker para REST, `ws` na página para o socket)
 * + `socket.io-client` de verdade. Os eventos só são provocados por `/mock/*` (REST), nunca
 * por setters da UI, e todo estado é lido de volta pelo cliente Socket.IO e pelo REST.
 */

async function open(page: Page) {
  await page.goto('/tests/integration/harness.html');
  await page.evaluate(() => window.harness.ready);
  await call(page, 'POST', '/mock/reset');
}

// `window.harness` é tipado pela declaração global em harness.ts.
const call = (page: Page, method: string, url: string, data?: unknown, token?: string) =>
  page.evaluate(
    ([m, u, d, t]) => window.harness.api(m as string, u as string, d, t ? { Authorization: `Bearer ${t}` } : undefined),
    [method, url, data, token] as const
  );

const connect = (page: Page, token?: string) => page.evaluate((t) => window.harness.connect(t), token);
const state = (page: Page, id: string) => page.evaluate((i) => window.harness.state(i), id);
const login = (page: Page, who: 'ana' | 'bruno') => page.evaluate((w) => window.harness.login(w), who);
const pendingOrder = (page: Page, token: string, key?: string) =>
  page.evaluate(([t, k]) => window.harness.createPendingOrder(t, k), [token, key] as const);

test.describe('Socket.IO via @mswjs/socket.io-binding', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test('socket.io-client conecta no servidor simulado usando só WebSocket', async ({ page }) => {
    const id = await connect(page);
    await expect.poll(async () => (await state(page, id)).connected).toBe(true);
    expect((await state(page, id)).transport).toBe('websocket');
  });

  test('nft.updated chega a visitantes e bate com a resposta REST (preço, estoque, versão)', async ({ page }) => {
    const visitor = await connect(page);
    await expect.poll(async () => (await state(page, visitor)).connected).toBe(true);

    await call(page, 'POST', '/mock/nfts/nft-001', { price: '0.75', availableQuantity: 2 });
    await expect.poll(async () => (await state(page, visitor)).received.length).toBe(1);

    const event = (await state(page, visitor)).received[0]!;
    const rest = (await call(page, 'GET', '/nfts/nft-001')).data;
    expect(event.event).toBe('nft.updated');
    expect(event.payload).toMatchObject({
      resource: 'nft',
      id: 'nft-001',
      version: rest.version,
      price: rest.price,
      availableQuantity: rest.availableQuantity,
      isAvailable: rest.isAvailable,
    });
    expect(event.payload.eventId).toBeTruthy();
  });

  test('nft.updated de NFT com edições carrega o preço/estoque por edição', async ({ page }) => {
    const id = await connect(page);
    await expect.poll(async () => (await state(page, id)).connected).toBe(true);
    await call(page, 'POST', '/mock/nfts/nft-002', { editions: [{ id: 'collector', price: '2', availableQuantity: 0 }] });
    await expect.poll(async () => (await state(page, id)).received.length).toBe(1);
    const payload = (await state(page, id)).received[0]!.payload;
    expect(payload.editions).toEqual([
      { id: 'standard', price: '0.8', availableQuantity: 3 },
      { id: 'collector', price: '2', availableQuantity: 0 },
    ]);
    expect(payload).toMatchObject({ price: '0.8', availableQuantity: 3 });
  });

  test('order.updated: PENDING → CONFIRMED só para o dono; outro usuário e visitante não recebem', async ({ page }) => {
    const ana = await login(page, 'ana');
    const bruno = await login(page, 'bruno');
    const anaProbe = await connect(page, ana);
    const brunoProbe = await connect(page, bruno);
    const visitorProbe = await connect(page);
    for (const p of [anaProbe, brunoProbe, visitorProbe]) {
      await expect.poll(async () => (await state(page, p)).connected).toBe(true);
    }

    const { status, orderId } = await pendingOrder(page, ana);
    expect(status).toBe(201);

    await expect
      .poll(async () => (await state(page, anaProbe)).received.filter((e) => e.event === 'order.updated').map((e) => e.payload.status), { timeout: 8000 })
      .toEqual(['PENDING', 'CONFIRMED']);
    const confirmed = (await state(page, anaProbe)).received.filter((e) => e.event === 'order.updated').pop()!.payload;
    expect(confirmed).toMatchObject({ id: orderId, version: 2, transactionHash: expect.stringMatching(/^0x[0-9a-f]{64}$/) });

    // O estoque baixou e o nft.updated correspondente também chegou (público).
    await expect.poll(async () => (await state(page, visitorProbe)).received.map((e) => e.event)).toEqual(['nft.updated']);
    expect((await state(page, brunoProbe)).received.map((e) => e.event)).toEqual(['nft.updated']);
    expect((await call(page, 'GET', `/orders/${orderId}`, undefined, ana)).data.status).toBe('CONFIRMED');
  });

  test('logout revoga o token: o socket aberto deixa de receber order.updated', async ({ page }) => {
    const ana = await login(page, 'ana');
    const probe = await connect(page, ana);
    await expect.poll(async () => (await state(page, probe)).connected).toBe(true);

    const { orderId } = await pendingOrder(page, ana);
    await expect.poll(async () => (await state(page, probe)).received.length).toBe(1); // PENDING

    await call(page, 'POST', '/auth/logout', undefined, ana);
    await call(page, 'POST', `/mock/orders/${orderId}/resolve`, { status: 'CONFIRMED' });
    await page.waitForTimeout(300);
    const events = (await state(page, probe)).received.filter((e) => e.event === 'order.updated');
    expect(events.map((e) => e.payload.status)).toEqual(['PENDING']);
  });

  test('duplicata e evento antigo chegam pelo socket, mas o dedup não reaplica nem regride', async ({ page }) => {
    const id = await connect(page);
    await expect.poll(async () => (await state(page, id)).connected).toBe(true);

    await call(page, 'POST', '/mock/nfts/nft-001', { price: '0.9' });
    await expect.poll(async () => (await state(page, id)).received.length).toBe(1);
    await call(page, 'POST', '/mock/socket/replay', { kind: 'duplicate' });
    await call(page, 'POST', '/mock/socket/replay', { kind: 'stale' });
    await expect.poll(async () => (await state(page, id)).received.length).toBe(3);

    const s = await state(page, id);
    expect(s.received.map((e) => `${e.payload.version}:${e.payload.price}`)).toEqual(['2:0.9', '2:0.9', '1:999']);
    expect(s.accepted).toHaveLength(1);
    expect(s.accepted[0]!.payload.price).toBe('0.9');
    expect((await call(page, 'GET', '/nfts/nft-001')).data.price).toBe('0.9');
  });

  test('queda de conexão: o cliente reconecta sozinho, perde o evento emitido offline e reconcilia via REST', async ({ page }) => {
    const id = await connect(page);
    await expect.poll(async () => (await state(page, id)).connected).toBe(true);

    await call(page, 'POST', '/mock/socket/drop');
    await expect.poll(async () => (await state(page, id)).connected).toBe(false);

    await call(page, 'POST', '/mock/nfts/nft-001', { price: '1.1' }); // emitido com o socket caído
    await page.waitForTimeout(300);
    expect((await state(page, id)).received).toHaveLength(0);

    await call(page, 'POST', '/mock/socket/restore');
    await expect.poll(async () => (await state(page, id)).connected, { timeout: 8000 }).toBe(true);
    const s = await state(page, id);
    expect(s.connects).toBe(2);
    expect(s.disconnects).toBe(1);
    expect(s.received).toHaveLength(0); // sem replay: o app precisa reconciliar via REST
    expect((await call(page, 'GET', '/nfts/nft-001')).data).toMatchObject({ price: '1.1', version: 2 });

    // Depois de reconectar, novos eventos voltam a fluir.
    await call(page, 'POST', '/mock/nfts/nft-001', { price: '1.2' });
    await expect.poll(async () => (await state(page, id)).received.length).toBe(1);
  });

  test('pedido pendente sobrevive a refresh: o mock retoma a resolução e o novo socket recebe o terminal', async ({ page }) => {
    const ana = await login(page, 'ana');
    const { orderId, body } = await pendingOrder(page, ana);
    expect((await call(page, 'GET', `/orders/${orderId}`, undefined, ana)).data.status).toBe('PENDING');

    await page.reload();
    await page.evaluate(() => window.harness.ready);
    const probe = await connect(page, ana);
    await expect.poll(async () => (await state(page, probe)).connected).toBe(true);

    await expect
      .poll(async () => (await state(page, probe)).received.filter((e) => e.event === 'order.updated').map((e) => e.payload.status), { timeout: 8000 })
      .toEqual(['CONFIRMED']);
    expect((await call(page, 'GET', `/orders/${orderId}`, undefined, ana)).data.status).toBe('CONFIRMED');

    // Reenvio com a mesma chave após o refresh recupera o mesmo pedido (sem segunda compra).
    const again = await page.evaluate(([t, b]) => window.harness.resendOrder(t, 'k1', b), [ana, body] as const);
    expect(again).toEqual({ status: 200, orderId });
  });

  test('dados e cenário persistem no refresh; reset restaura o fixture', async ({ page }) => {
    await call(page, 'POST', '/mock/nfts/nft-001', { price: '3' });
    await call(page, 'POST', '/mock/scenario', { name: 'EMPTY_RESULTS' });
    await page.reload();
    await page.evaluate(() => window.harness.ready);
    expect((await call(page, 'GET', '/nfts/nft-001')).data.price).toBe('3');
    expect((await call(page, 'GET', '/nfts')).data.total).toBe(0);

    await call(page, 'POST', '/mock/reset');
    expect((await call(page, 'GET', '/nfts/nft-001')).data).toMatchObject({ price: '0.5', version: 1 });
    expect((await call(page, 'GET', '/nfts')).data.total).toBe(48);
  });

  test('?scenario= seleciona o cenário inicial (lido apenas por src/mocks)', async ({ page }) => {
    await page.goto('/tests/integration/harness.html?scenario=HTTP_5XX');
    await page.evaluate(() => window.harness.ready);
    const res = await call(page, 'GET', '/nfts');
    expect(res.status).toBe(503);
    await call(page, 'POST', '/mock/reset');
  });

  test('NETWORK_ERROR no navegador: a requisição falha como erro de rede real', async ({ page }) => {
    await call(page, 'POST', '/mock/scenario', { name: 'NETWORK_ERROR', failures: 1 });
    const failed = await page.evaluate(() =>
      fetch('/api/v1/nfts').then(
        () => 'resolved',
        () => 'network-error'
      )
    );
    expect(failed).toBe('network-error');
    expect(await page.evaluate(() => fetch('/api/v1/nfts').then((r) => r.status))).toBe(200);
  });
});
