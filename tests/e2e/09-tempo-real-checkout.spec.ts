import { test, expect } from '@playwright/test';
import { addToCart, dismissNotices, login, loginAndFillCart, mock, resetApp, reviewOrder, submitOrder } from './helpers';

/**
 * Cenário 9: preço/disponibilidade alterados via Socket.IO durante o carrinho e o checkout. Os eventos
 * só nascem nos endpoints `/mock/*` e chegam pelo `socket.io-client` real da aplicação.
 */

test.beforeEach(async ({ page }) => resetApp(page));

test('carrinho aberto: mudança de preço avisa e atualiza o resumo', async ({ page }) => {
  await login(page);
  await addToCart(page, 'nft-001', 2);
  await page.goto('/cart');
  const line = page.getByTestId('cart-line-nft-001');
  await expect(line.getByTestId('quantity')).toHaveText('2');

  // O socket conecta fora do caminho crítico: cada tentativa usa uma versão nova até o evento chegar.
  await expect(async () => {
    expect(await mock(page, '/mock/nfts/nft-001', { price: '9.99' })).toBe(200);
    await expect(page.getByRole('status')).toContainText('preço ou disponibilidade mudou', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(line).toContainText('19.98 ETH');
});

test('checkout: preço muda após a revisão e a confirmação exige nova revisão', async ({ page }) => {
  await loginAndFillCart(page, 2);
  await reviewOrder(page);

  // O socket conecta fora do caminho crítico: repete o evento (versão nova a cada vez) até chegar.
  await expect(async () => {
    expect(await mock(page, '/mock/nfts/nft-001', { price: '1' })).toBe(200);
    await expect(page.getByRole('status').filter({ hasText: 'confirme novamente' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Confirmar e enviar pedido' })).toHaveCount(0);

  await dismissNotices(page);
  await page.getByRole('button', { name: 'Revisar pedido' }).click();
  await expect(page.getByText('Total: 2.002 ETH')).toBeVisible();
  await submitOrder(page);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  await expect(page.getByTestId('order-total')).toHaveText('2.002 ETH');
});

test('checkout: disponibilidade insuficiente impede confirmar com a cotação antiga', async ({ page }) => {
  await loginAndFillCart(page, 3);
  await reviewOrder(page);

  await expect(async () => {
    expect(await mock(page, '/mock/nfts/nft-001', { availableQuantity: 1 })).toBe(200);
    await expect(page.getByRole('button', { name: 'Confirmar e enviar pedido' })).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole('status').filter({ hasText: /confirme novamente|disponibilidade/i }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toHaveCount(0);
});
