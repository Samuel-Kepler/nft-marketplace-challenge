import { test, expect } from '@playwright/test';
import { addToCart, login, loginAndFillCart, mock, nftStock, resetApp, reviewOrder, submitOrder } from './helpers';

/** Cenário 10: eventos duplicados ou antigos, desconexão e retomada de pedido pendente. */

test.beforeEach(async ({ page }) => resetApp(page));

test('evento duplicado ou antigo não repete o aviso nem regride o preço', async ({ page }) => {
  await login(page);
  await addToCart(page, 'nft-001', 1);
  await page.goto('/cart');
  const line = page.getByTestId('cart-line-nft-001');
  await expect(line.getByTestId('quantity')).toHaveText('1');

  await expect(async () => {
    expect(await mock(page, '/mock/nfts/nft-001', { price: '9.99' })).toBe(200);
    await expect(line).toContainText('9.99 ETH', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const warnings = page.locator('[data-kind="warning"]');
  await expect(warnings).toHaveCount(1);

  expect(await mock(page, '/mock/socket/replay', { kind: 'duplicate' })).toBe(200);
  expect(await mock(page, '/mock/socket/replay', { kind: 'stale' })).toBe(200);
  // Dá tempo para o socket entregar os reenvios, depois verifica que nada mudou.
  await page.waitForTimeout(500);
  await expect(warnings).toHaveCount(1);
  await expect(line).toContainText('9.99 ETH');
});

test('desconexão do socket: ao restaurar, o catálogo reconcilia com a API REST', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('li a[href^="/nft/"]').first();
  await expect(first).toBeVisible();
  const id = (await first.getAttribute('href'))!.split('/').pop()!;
  const cards = page.getByTestId(`nft-card-${id}`);

  // Garante que o socket já está conectado antes de derrubá-lo.
  await expect(async () => {
    expect(await mock(page, `/mock/nfts/${id}`, { price: '2.5' })).toBe(200);
    await expect(cards.first()).toContainText('2.5 ETH', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  expect(await mock(page, '/mock/socket/drop')).toBe(204);
  expect(await mock(page, `/mock/nfts/${id}`, { price: '7.77' })).toBe(200);
  expect(await mock(page, '/mock/socket/restore')).toBe(204);

  // O evento perdido durante a queda é recuperado pela reconciliação com o REST após reconectar.
  await expect(cards.first()).toContainText('7.77 ETH', { timeout: 20_000 });
});

test('conexão cai com o pedido pendente: ao reconectar o pedido é recuperado sem nova compra', async ({ page }) => {
  await loginAndFillCart(page, 2);
  await reviewOrder(page);

  expect(await mock(page, '/mock/socket/drop')).toBe(204);
  await submitOrder(page);
  await expect(page.getByText('Aguardando a confirmação')).toBeVisible();
  const orderId = await page.evaluate(() => JSON.parse(localStorage.getItem('nft:checkout_attempt')!).orderId as string);

  expect(await mock(page, '/mock/socket/restore')).toBe(204);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('order-id')).toHaveText(orderId);
  expect(await nftStock(page, 'nft-001')).toBe(3);
});

test('refresh com o pedido pendente recupera o mesmo pedido', async ({ page }) => {
  await loginAndFillCart(page, 2);
  await reviewOrder(page);
  await submitOrder(page);
  await expect(page.getByText('Aguardando a confirmação')).toBeVisible();
  const orderId = await page.evaluate(() => JSON.parse(localStorage.getItem('nft:checkout_attempt')!).orderId as string);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('order-id')).toHaveText(orderId);
  expect(await nftStock(page, 'nft-001')).toBe(3);
});

test('order.updated recusado é terminal: apresenta a recusa e preserva o carrinho', async ({ page }) => {
  await loginAndFillCart(page, 2);
  await reviewOrder(page);
  await submitOrder(page);
  await expect(page.getByText('Aguardando a confirmação')).toBeVisible();
  const orderId = await page.evaluate(() => JSON.parse(localStorage.getItem('nft:checkout_attempt')!).orderId as string);

  // Resolve a recusa antes do temporizador do mock; a UI deve refletir o evento recebido pelo socket.
  expect(await mock(page, `/mock/orders/${orderId}/resolve`, { status: 'DECLINED' })).toBe(200);
  await expect(page.getByRole('alert').filter({ hasText: 'recusad' })).toBeVisible({ timeout: 15_000 });
  // Terminal: tentar confirmar depois não muda o desfecho.
  expect(await mock(page, `/mock/orders/${orderId}/resolve`, { status: 'CONFIRMED' })).toBe(200);
  await page.waitForTimeout(300);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toHaveCount(0);
  expect(await nftStock(page, 'nft-001')).toBe(5);
});
