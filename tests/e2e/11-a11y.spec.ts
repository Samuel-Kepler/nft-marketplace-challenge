import { test, expect } from '@playwright/test';
import { ANA, login, overflowX, resetApp } from './helpers';

/**
 * Cenário 11: teclado, foco e validação de formulários. O app não tem diálogos modais nem drawers;
 * o controle de foco verificado é o das trocas de página, do link "Pular" e do formulário expansível.
 */

test.beforeEach(async ({ page }) => resetApp(page));

test('"Pular para o conteúdo" é o primeiro foco e leva ao <main>', async ({ page }) => {
  await expect(page.getByRole('main')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test('login inteiro por teclado e foco no conteúdo após a navegação', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado físico não se aplica ao perfil touch');
  await page.getByRole('link', { name: 'Entrar' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('main')).toBeFocused();

  await page.getByLabel('E-mail').focus();
  await page.keyboard.type(ANA.email);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Senha')).toBeFocused();
  await page.keyboard.type(ANA.password);
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
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

test('formulário de login: erros associados aos campos por aria e com prefixo textual', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: 'Entrar' }).click();

  for (const label of ['E-mail', 'Senha']) {
    const field = page.getByLabel(label);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await field.getAttribute('aria-describedby');
    expect(describedBy, `${label} sem aria-describedby`).toBeTruthy();
    const message = page.locator(`[id="${describedBy!.split(' ')[0]}"]`);
    await expect(message).toBeVisible();
    await expect(message).not.toBeEmpty();
  }

  // O alerta não depende só de cor: carrega o rótulo "Erro".
  await page.getByLabel('E-mail').fill(ANA.email);
  await page.getByLabel('Senha').fill('errada123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  const alert = page.getByRole('alert').first();
  await expect(alert).toBeVisible();
  expect(await alert.evaluate((el) => getComputedStyle(el, '::before').content)).toContain('Erro');
});

test('cadastro: validação de todos os campos por teclado', async ({ page }) => {
  await page.goto('/auth/register');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  for (const label of ['Nome', 'E-mail', 'Senha']) {
    await expect(page.getByLabel(label)).toHaveAttribute('aria-invalid', 'true');
  }
  await page.getByLabel('Senha').fill('123');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByLabel('Senha')).toHaveAttribute('aria-invalid', 'true');
});

test('formulário de carteira expansível: aria-expanded e foco no campo ao abrir por teclado', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado físico não se aplica ao perfil touch');
  await login(page, ANA, '/profile/wallets');
  const edit = page.getByTestId('wallet-wallet-2').getByRole('button', { name: 'Editar' });
  await edit.focus();
  await page.keyboard.press('Enter');
  const toggle = page.getByTestId('wallet-wallet-2').getByRole('button', { expanded: true });
  await expect(toggle).toBeVisible();
  const address = page.getByTestId('wallet-wallet-2').getByLabel('Endereço da carteira');
  await expect(address).toBeVisible();
  await address.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});

test('mutation avisa por região aria-live e o catálogo tem controles rotulados', async ({ page }) => {
  await login(page, ANA, '/nft/nft-001');
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  const live = page.locator('[role="status"][aria-live="polite"]');
  await expect(live).toContainText('adicionado ao carrinho');

  await page.goto('/');
  for (const label of ['Buscar', 'Categoria', 'Raridade', 'Ordenar por', 'Preço mínimo (ETH)', 'Preço máximo (ETH)']) {
    await expect(page.getByLabel(label)).toBeVisible();
  }
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toBeVisible();
});

test('sem overflow horizontal nas rotas principais do viewport atual', async ({ page }) => {
  for (const path of ['/', '/nft/nft-002', '/auth/login', '/auth/register']) {
    await page.goto(path);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(await overflowX(page), path).toBeLessThanOrEqual(0);
  }
});
