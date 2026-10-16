import { test, expect } from '@playwright/test';
import { resetApp } from './helpers';

/** Cenário 2: acesso direto ao detalhe, recurso inexistente, edição indisponível e limite de quantidade. */

test.beforeEach(async ({ page }) => resetApp(page));

test('acesso direto mostra informações e disponibilidade', async ({ page }) => {
  await page.goto('/nft/nft-001');
  await expect(page.getByRole('heading', { name: 'Aurora Drift' })).toBeVisible();
  await expect(page.getByTestId('nft-price')).toHaveText('0.5 ETH');
  await expect(page.getByTestId('nft-availability')).toContainText('5 unidades disponíveis');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Aurora Drift' })).toBeVisible();
});

test('NFT e rota inexistentes têm tratamento próprio', async ({ page }) => {
  await page.goto('/nft/nft-999');
  await expect(page.getByRole('heading', { name: 'NFT não encontrado' })).toBeVisible();
  await page.goto('/rota-que-nao-existe');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao início' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('quantidade respeita o limite de estoque', async ({ page }) => {
  await page.goto('/nft/nft-001');
  const plus = page.getByRole('button', { name: 'Aumentar quantidade' });
  for (let i = 0; i < 6; i++) if (await plus.isEnabled()) await plus.click();
  await expect(page.getByTestId('quantity')).toHaveText('5');
  await expect(plus).toBeDisabled();
  await expect(page.getByText('Limite atingido')).toBeVisible();
});

test('NFT esgotado desabilita a compra', async ({ page }) => {
  await page.goto('/nft/nft-003');
  await expect(page.getByTestId('nft-availability')).toHaveText('Esgotado.');
  await expect(page.getByRole('button', { name: /carrinho|comprar/i })).toBeDisabled();
});

test('a edição escolhida define preço e limite', async ({ page }) => {
  await page.goto('/nft/nft-002');
  await expect(page.getByTestId('nft-price')).toHaveText('0.8 ETH');
  await page.getByRole('radio', { name: /Collector/ }).check();
  await expect(page.getByTestId('nft-price')).toHaveText('1.5 ETH');
  await expect(page.getByTestId('nft-availability')).toContainText('1 unidade disponível');
  await expect(page.getByRole('button', { name: 'Aumentar quantidade' })).toBeDisabled();
});

test('edição esgotada em tempo real fica indisponível', async ({ page }) => {
  await page.goto('/nft/nft-002');
  await page.getByRole('radio', { name: /Collector/ }).check();
  await expect(page.getByTestId('nft-availability')).toContainText('1 unidade disponível');
  // O socket conecta fora do caminho crítico: repete o evento (cada um com versão nova) até chegar.
  await expect(async () => {
    await page.evaluate(() =>
      fetch('/api/v1/mock/nfts/nft-002', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editions: [{ id: 'collector', availableQuantity: 0 }] }),
      })
    );
    await expect(page.getByTestId('nft-availability')).toHaveText('Edição esgotada.', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /carrinho|comprar/i })).toBeDisabled();
});
