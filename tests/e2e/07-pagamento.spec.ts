import { test, expect } from '@playwright/test';
import { loginAndFillCart, nftStock, resetApp, reviewOrder, submitOrder } from './helpers';

/** Cenário 7: falha de pagamento, clique repetido e timeout com recuperação do mesmo pedido. */

test.beforeEach(async ({ page }) => resetApp(page));

test('pagamento recusado preserva os itens e permite voltar ao pagamento', async ({ page }) => {
  await loginAndFillCart(page, 2, 'PAYMENT_DECLINED');
  await reviewOrder(page);
  await submitOrder(page);

  await expect(page.getByRole('alert').filter({ hasText: 'recusad' })).toBeVisible();
  await expect(page).toHaveURL(/\/checkout(\?|$)/);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toHaveCount(0);

  await page.goto('/cart');
  await expect(page.getByTestId('cart-line-nft-001').getByTestId('quantity')).toHaveText('2');
  expect(await nftStock(page, 'nft-001')).toBe(5);
});

test('clique repetido cria um único pedido', async ({ page }) => {
  await loginAndFillCart(page, 2);
  await reviewOrder(page);
  await page.getByRole('button', { name: 'Confirmar e enviar pedido' }).dblclick();

  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  // Estoque inicial 5: só um pedido de 2 unidades foi cobrado.
  expect(await nftStock(page, 'nft-001')).toBe(3);
});

test('timeout após criar: reenviar recupera o mesmo pedido, sem cobrar duas vezes', async ({ page }) => {
  await loginAndFillCart(page, 2, 'ORDER_TIMEOUT_AFTER_CREATE');
  await reviewOrder(page);
  await submitOrder(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Sem resposta' })).toBeVisible();
  const firstKey = await page.evaluate(() => localStorage.getItem('nft:checkout_attempt'));
  expect(firstKey).not.toBeNull();

  await submitOrder(page);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  expect(await nftStock(page, 'nft-001')).toBe(3);
});

test('timeout seguido de refresh: o reenvio recupera o mesmo pedido', async ({ page }) => {
  await loginAndFillCart(page, 1, 'ORDER_TIMEOUT_AFTER_CREATE');
  await reviewOrder(page);
  await submitOrder(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Sem resposta' })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Há um envio anterior sem resposta')).toBeVisible();
  await page.getByRole('button', { name: 'Revisar pedido' }).click();
  await submitOrder(page);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  expect(await nftStock(page, 'nft-001')).toBe(4);
});

test('NFT esgotado durante a compra bloqueia o pedido e preserva o carrinho', async ({ page }) => {
  await loginAndFillCart(page, 2, 'EDITION_SOLD_OUT');
  await reviewOrder(page);
  await submitOrder(page);

  await expect(page.getByRole('alert').filter({ hasText: /esgotad|estoque|indispon/i }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toHaveCount(0);
  await page.goto('/cart');
  await expect(page.getByTestId('cart-line-nft-001')).toBeVisible();
});
