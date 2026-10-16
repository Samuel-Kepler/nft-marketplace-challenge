import { test, expect, type Locator, type Page } from '@playwright/test';
import { login, resetApp, setScenario, settled } from './helpers';

/** Clica e espera a resposta da mutation de favoritos: recarregar antes dela abortaria a requisição. */
const clickAndWaitMutation = (page: Page, button: Locator) =>
  Promise.all([
    page.waitForResponse((r) => r.url().includes('/favorites') && r.request().method() !== 'GET'),
    button.click(),
  ]);

/** Cenário 4: favoritos, incluindo falha de mutation (rollback otimista) e recuperação do estado. */

test.beforeEach(async ({ page }) => resetApp(page));

test('visitante é enviado ao login ao favoritar e volta ao NFT', async ({ page }) => {
  await page.goto('/nft/nft-001');
  await page.getByRole('button', { name: /Favoritar Aurora Drift/ }).click();
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fnft%2Fnft-001/);
});

test('favoritar é otimista, persiste após refresh e pode ser removido', async ({ page }) => {
  await login(page, undefined, '/nft/nft-001');
  await clickAndWaitMutation(page, page.getByRole('button', { name: /Favoritar Aurora Drift/ }));
  await expect(page.getByRole('button', { name: /Remover Aurora Drift dos favoritos/ })).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  await page.reload();
  const remove = page.getByRole('button', { name: /Remover Aurora Drift dos favoritos/ });
  await expect(remove).toBeVisible();

  await clickAndWaitMutation(page, remove);
  await expect(page.getByRole('button', { name: /Favoritar Aurora Drift/ })).toHaveAttribute('aria-pressed', 'false');
  await settled(page);
  await page.reload();
  await expect(page.getByRole('button', { name: /Favoritar Aurora Drift/ })).toBeVisible();
});

test('falha ao favoritar desfaz a alteração, avisa e se recupera na nova tentativa', async ({ page }) => {
  await login(page, undefined, '/nft/nft-001');
  await setScenario(page, 'FAVORITES_MUTATION_FAILS');
  await page.getByRole('button', { name: /Favoritar Aurora Drift/ }).click();
  await expect(page.getByText('A alteração foi desfeita.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Favoritar Aurora Drift/ })).toHaveAttribute('aria-pressed', 'false');

  // Deixa o refetch pós-rollback terminar para a nova tentativa partir do estado já reconciliado.
  await page.waitForLoadState('networkidle');
  await setScenario(page, 'DEFAULT');
  await clickAndWaitMutation(page, page.getByRole('button', { name: /Favoritar Aurora Drift/ }));
  await expect(page.getByRole('button', { name: /Remover Aurora Drift dos favoritos/ })).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  await page.reload();
  await expect(page.getByRole('button', { name: /Remover Aurora Drift dos favoritos/ })).toBeVisible();
});

test('falha ao remover favorito existente mantém o favorito', async ({ page }) => {
  await login(page, undefined, '/nft/nft-004');
  const remove = page.getByRole('button', { name: /Remover .* dos favoritos/ });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await setScenario(page, 'FAVORITES_MUTATION_FAILS');
  await remove.click();
  await expect(page.getByText('A alteração foi desfeita.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Remover .* dos favoritos/ })).toHaveAttribute('aria-pressed', 'true');
});
