import { test, expect, type Page } from '@playwright/test';

/** Passo 7: responsividade (390/768/1440), skeleton com shimmer, foco visível e feedback acessível. */

const WIDTHS = [390, 768, 1440] as const;

async function loginAsAna(page: Page, redirect: string) {
  await page.goto(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel('E-mail').fill('ana@example.com');
  await page.getByLabel('Senha').fill('Senha@123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

const overflowX = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('Responsividade', () => {
  for (const width of WIDTHS) {
    test(`sem overflow horizontal em ${width}px (catálogo, detalhe, login)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/nft/nft-002', '/auth/login']) {
        await page.goto(path);
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        expect(await overflowX(page), `${path} @${width}`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('carrinho e pagamento cabem em 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAna(page, '/cart');
    await page.goto('/nft/nft-001');
    await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
    for (const path of ['/cart', '/checkout']) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await overflowX(page), path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('Skeleton e movimento reduzido', () => {
  test('shimmer anima por padrão e fica estático com prefers-reduced-motion', async ({ page }) => {
    await page.goto('/?scenario=SLOW_NETWORK&category=photography');
    const skeleton = page.locator('.skeleton').first();
    await expect(skeleton).toBeVisible();
    await expect(skeleton).not.toHaveCSS('animation-name', 'none');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(skeleton).toHaveCSS('animation-name', 'none');
  });

  test('skeleton do catálogo reserva a mesma altura do cartão real (sem deslocamento)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?scenario=SLOW_NETWORK&category=photography');
    const skeletonCard = page.getByRole('status', { name: 'Carregando catálogo' }).locator('li').first();
    await expect(skeletonCard).toBeVisible();
    const before = (await skeletonCard.boundingBox())!;
    const card = page.getByTestId('catalog-results').locator('li[data-testid^="nft-card-"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const after = (await card.boundingBox())!;
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(8);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  });
});

test.describe('Acessibilidade', () => {
  test('"Pular para o conteúdo" é o primeiro foco e leva ao <main>', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('foco por teclado é visível nos controles', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('E-mail').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const outline = await page.getByLabel('E-mail').evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('troca de página move o foco para o conteúdo principal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Entrar' }).first().click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('avisos em tempo real têm rótulo textual, não só cor', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('E-mail').fill('ana@example.com');
    await page.getByLabel('Senha').fill('errada');
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Erro de formulário: mensagem associada ao campo ou alerta, sempre com o prefixo "Erro".
    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible();
    const prefix = await alert.evaluate((el) => getComputedStyle(el, '::before').content);
    expect(prefix).toContain('Erro');
  });
});
