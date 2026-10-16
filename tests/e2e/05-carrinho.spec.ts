import { test, expect } from '@playwright/test';
import { addToCart, login, logout, resetApp, setScenario } from './helpers';

/** Cenário 5: carrinho, quantidades, remoção, cupom e persistência após refresh/login. */

test.beforeEach(async ({ page }) => resetApp(page));

test('quantidade, resumo vindo da API e remoção', async ({ page }) => {
  await login(page);
  await addToCart(page, 'nft-001', 2);
  await page.goto('/cart');
  const line = page.getByTestId('cart-line-nft-001');
  await expect(line.getByTestId('quantity')).toHaveText('2');
  await expect(page.getByText('1.002 ETH')).toBeVisible();

  await line.getByRole('button', { name: /Aumentar quantidade/ }).click();
  await expect(line.getByTestId('quantity')).toHaveText('3');
  await line.getByRole('button', { name: /Diminuir quantidade/ }).click();
  await expect(line.getByTestId('quantity')).toHaveText('2');

  await line.getByRole('button', { name: /Remover Aurora/ }).click();
  await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();
});

test('quantidade não passa da disponibilidade', async ({ page }) => {
  await login(page);
  await addToCart(page, 'nft-001', 5);
  await page.goto('/cart');
  const line = page.getByTestId('cart-line-nft-001');
  await expect(line.getByTestId('quantity')).toHaveText('5');
  await expect(line.getByRole('button', { name: /Aumentar quantidade/ })).toBeDisabled();
});

test('cupom: aplica, remove, e trata código inválido e expirado', async ({ page }) => {
  await login(page);
  await addToCart(page, 'nft-001', 3);
  await page.goto('/cart');
  await expect(page.getByTestId('cart-line-nft-001')).toBeVisible();

  await page.getByLabel('Cupom').fill('NFT10');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/coupon=NFT10/);
  await expect(page.getByText('Desconto (NFT10)')).toBeVisible();

  await page.getByRole('button', { name: /Remover cupom/ }).click();
  await expect(page).not.toHaveURL(/coupon=/);
  await expect(page.getByText('Desconto (NFT10)')).toHaveCount(0);

  await page.getByLabel('Cupom').fill('INVALIDO');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Cupom inválido' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ir para o pagamento' })).toBeDisabled();

  await setScenario(page, 'COUPON_EXPIRED');
  await page.getByLabel('Cupom').fill('NFT10');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /expirou/i })).toBeVisible();
});

test('o carrinho persiste após refresh e após sair e entrar de novo', async ({ page }) => {
  await login(page);
  await addToCart(page, 'nft-001', 2);
  await page.goto('/cart');
  await expect(page.getByTestId('cart-line-nft-001').getByTestId('quantity')).toHaveText('2');
  await page.reload();
  await expect(page.getByTestId('cart-line-nft-001').getByTestId('quantity')).toHaveText('2');

  await logout(page);
  await login(page, undefined, '/cart');
  await expect(page.getByTestId('cart-line-nft-001').getByTestId('quantity')).toHaveText('2');
});

test('visitante não tem carrinho: é levado ao login, volta ao NFT e então adiciona', async ({ page }) => {
  // O app não mantém carrinho anônimo (o README pede preservar itens do visitante; ver relatório do Passo 8).
  await page.goto('/nft/nft-001');
  await page.getByRole('button', { name: 'Entrar para comprar' }).click();
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fnft%2Fnft-001/);

  await login(page, undefined, '/nft/nft-001');
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await expect(page.getByText('1 × Aurora Drift adicionado ao carrinho.')).toBeVisible();
  await page.goto('/cart');
  await expect(page.getByTestId('cart-line-nft-001').getByTestId('quantity')).toHaveText('1');
});
