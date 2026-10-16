import { test, expect } from '@playwright/test';
import { login, mock, nftStock, resetApp, reviewOrder, submitOrder } from './helpers';

/** Cenário 6: compra completa, do catálogo ao recibo confirmado. */

test.beforeEach(async ({ page }) => resetApp(page));

test('catálogo → detalhe → carrinho → pagamento → recibo confirmado', async ({ page }) => {
  await login(page);

  // Descoberta: busca e abre o NFT pela interface.
  await page.goto('/');
  await page.getByLabel('Buscar').fill('Aurora Drift');
  await page.getByLabel('Buscar').press('Enter');
  await page.getByTestId('nft-card-nft-001').first().getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Aurora Drift' })).toBeVisible();

  await page.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await expect(page.getByText('2 × Aurora Drift adicionado ao carrinho.')).toBeVisible();

  await page.goto('/cart');
  await expect(page.getByTestId('cart-line-nft-001').getByTestId('quantity')).toHaveText('2');
  await page.getByRole('link', { name: 'Ir para o pagamento' }).click();
  await expect(page).toHaveURL(/\/checkout/);

  await reviewOrder(page);
  await expect(page.getByText(/Total: 1\.002 ETH/)).toBeVisible();
  await submitOrder(page);

  await expect(page).toHaveURL(/\/checkout\/success\?orderId=/);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  await expect(page.getByTestId('tx-hash')).toContainText('0x');
  await expect(page.getByTestId('order-total')).toHaveText('1.002 ETH');
  await expect(page.getByText('Aurora Drift').first()).toBeVisible();

  // Efeitos da compra: carrinho esvaziado e estoque debitado (5 → 3).
  await page.goto('/cart');
  await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();
  expect(await nftStock(page, 'nft-001')).toBe(3);
});

test('o recibo é um snapshot: mudanças posteriores no catálogo não o alteram', async ({ page }) => {
  await login(page);
  await page.goto('/nft/nft-001');
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await expect(page.getByText('1 × Aurora Drift adicionado ao carrinho.')).toBeVisible();
  await reviewOrder(page);
  await submitOrder(page);
  await expect(page.getByTestId('order-total')).toHaveText('0.502 ETH');
  const receiptUrl = page.url();

  expect(await mock(page, '/mock/nfts/nft-001', { price: '9.99' })).toBe(200);
  await page.goto(receiptUrl);
  await expect(page.getByTestId('order-total')).toHaveText('0.502 ETH');
});

test('compra exige autenticação: o checkout leva ao login e volta depois', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fcheckout/);
  await page.getByLabel('E-mail').fill('ana@example.com');
  await page.getByLabel('Senha').fill('Senha@123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Pagamento' })).toBeVisible();
});
