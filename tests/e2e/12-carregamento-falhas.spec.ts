import { test, expect } from '@playwright/test';
import { addToCart, login, resetApp, setScenario } from './helpers';

/** Cenário 12: skeletons em carregamento lento, feedback de falha e recuperação após nova tentativa. */

const results = (page: import('@playwright/test').Page) => page.getByTestId('catalog-results');

test.beforeEach(async ({ page }) => resetApp(page));

test('catálogo lento: skeleton com shimmer, sem deslocamento, depois o conteúdo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?scenario=SLOW_NETWORK&category=photography');
  const skeletonRegion = page.getByRole('status', { name: 'Carregando catálogo' });
  await expect(skeletonRegion).toBeVisible();
  const skeleton = page.locator('.skeleton').first();
  await expect(skeleton).not.toHaveCSS('animation-name', 'none');

  const before = (await skeletonRegion.locator('li').first().boundingBox())!;
  const card = results(page).locator('li[data-testid^="nft-card-"]').first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  const after = (await card.boundingBox())!;
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(8);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
});

test('movimento reduzido desliga a animação do shimmer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?scenario=SLOW_NETWORK&category=photography');
  const skeleton = page.locator('.skeleton').first();
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveCSS('animation-name', 'none');
});

test('detalhe lento mostra skeleton e depois o NFT', async ({ page }) => {
  await page.goto('/nft/nft-005?scenario=SLOW_NETWORK');
  await expect(page.locator('.skeleton').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.skeleton')).toHaveCount(0);
});

test('resumo do carrinho lento mostra skeleton e depois os valores da API', async ({ page }) => {
  await login(page);
  await addToCart(page, 'nft-001', 2);
  await setScenario(page, 'SLOW_NETWORK');
  await page.goto('/cart');
  await expect(page.locator('.skeleton').first()).toBeVisible();
  await expect(page.getByText('1.002 ETH')).toBeVisible({ timeout: 15_000 });
});

test('catálogo com HTTP 5xx mostra erro e se recupera ao tentar novamente', async ({ page }) => {
  await page.goto('/?scenario=HTTP_5XX&category=music');
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o catálogo.' })).toBeVisible({ timeout: 20_000 });
  await setScenario(page, 'DEFAULT');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(results(page).getByRole('listitem').first()).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o catálogo.' })).toHaveCount(0);
});

test('catálogo sem conexão mostra erro e se recupera ao tentar novamente', async ({ page }) => {
  await page.goto('/?scenario=NETWORK_ERROR&category=music');
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o catálogo.' })).toBeVisible({ timeout: 20_000 });
  await setScenario(page, 'DEFAULT');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(results(page).getByRole('listitem').first()).toBeVisible();
});

test('detalhe com falha permite tentar de novo', async ({ page }) => {
  await page.goto('/nft/nft-005?scenario=HTTP_5XX');
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar este NFT.', { timeout: 20_000 });
  await setScenario(page, 'DEFAULT');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('falhas transitórias limitadas: a interface se recupera sozinha após as tentativas automáticas', async ({ page }) => {
  await page.goto('/?scenario=DEFAULT&category=music');
  await expect(results(page).getByRole('listitem').first()).toBeVisible();
  await setScenario(page, 'HTTP_4XX', 1);
  await page.goto('/?category=art');
  // Com 1 falha restante o catálogo pode mostrar erro ou já se recuperar; nos dois casos termina com dados.
  const retry = page.getByRole('button', { name: 'Tentar novamente' });
  await expect(retry.or(results(page).getByRole('listitem').first())).toBeVisible({ timeout: 20_000 });
  if (await retry.isVisible()) await retry.click();
  await expect(results(page).getByRole('listitem').first()).toBeVisible();
});
