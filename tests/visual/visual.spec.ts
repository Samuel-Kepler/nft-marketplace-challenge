import { test, expect, type Page } from '@playwright/test';
import { addToCart, login, resetApp, reviewOrder } from '../e2e/helpers';

/**
 * Regressão visual de início, detalhe, carrinho e pagamento em desktop (1440px) e mobile (390px).
 * Dados estáveis: `/mock/reset` restaura o cenário conhecido, o catálogo é determinístico, a animação
 * é desligada e as imagens ausentes caem no substituto textual (idêntico entre execuções).
 *
 * Baselines: `npm run test:visual:update`, gerado sempre no mesmo ambiente (ver ARCHITECTURE.md).
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function settle(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.skeleton')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
}

const shot = (page: Page, name: string) =>
  expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, animations: 'disabled', caret: 'hide' });

for (const vp of VIEWPORTS) {
  test.describe(`visual @${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.name === 'mobile', hasTouch: vp.name === 'mobile', deviceScaleFactor: 1 });

    test.beforeEach(async ({ page }) => {
      await resetApp(page);
    });

    test(`início ${vp.name}`, async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('catalog-results').locator('li[data-testid^="nft-card-"]').first()).toBeVisible();
      await settle(page);
      await shot(page, `inicio-${vp.name}`);
    });

    test(`detalhe ${vp.name}`, async ({ page }) => {
      await page.goto('/nft/nft-001');
      await expect(page.getByRole('heading', { name: 'Aurora Drift' })).toBeVisible();
      await settle(page);
      await shot(page, `detalhe-${vp.name}`);
    });

    test(`carrinho ${vp.name}`, async ({ page }) => {
      await login(page);
      await addToCart(page, 'nft-001', 2);
      await page.goto('/cart');
      await expect(page.getByText('1.002 ETH')).toBeVisible();
      await settle(page);
      await shot(page, `carrinho-${vp.name}`);
    });

    test(`pagamento ${vp.name}`, async ({ page }) => {
      await login(page);
      await addToCart(page, 'nft-001', 2);
      await reviewOrder(page);
      await settle(page);
      await shot(page, `pagamento-${vp.name}`);
    });
  });
}
