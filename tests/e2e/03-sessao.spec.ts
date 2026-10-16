import { test, expect } from '@playwright/test';
import { ANA, BRUNO, login, logout, resetApp, setScenario } from './helpers';

/** Cenário 3: cadastro, login, expiração de sessão, logout e troca de usuário. */

test.beforeEach(async ({ page }) => resetApp(page));

test('cadastro: conflito de e-mail no campo, depois conta nova entra autenticada', async ({ page }) => {
  await page.goto('/auth/register');
  await page.getByLabel('Nome').fill('Ana Clone');
  await page.getByLabel('E-mail').fill(ANA.email);
  await page.getByLabel('Senha').fill('Senha@999');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'já está cadastrado' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('E-mail').fill('novo@example.com');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).not.toHaveURL(/\/auth\/register/);
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
});

test('login: validação no cliente, credenciais inválidas e retorno ao destino', async ({ page }) => {
  await page.goto('/profile/wallets');
  await expect(page).toHaveURL(/\/auth\/login\?redirect=/);

  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Senha')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('E-mail').fill(ANA.email);
  await page.getByLabel('Senha').fill('errada123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos' })).toBeVisible();

  await page.getByLabel('Senha').fill(ANA.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/profile\/wallets$/);
  await expect(page.getByRole('heading', { name: 'Carteiras', level: 1 })).toBeVisible();
});

test('a senha não fica em claro no armazenamento do navegador', async ({ page }) => {
  await login(page);
  const dump = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(dump).not.toContain(ANA.password);
});

test('sessão sobrevive ao refresh; logout a encerra e bloqueia rotas privadas', async ({ page }) => {
  await login(page, ANA, '/profile');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible();

  await logout(page);
  await expect(page.evaluate(() => localStorage.getItem('nft:session'))).resolves.toBeNull();
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('sessão expirada durante a navegação avisa e volta ao destino depois de entrar', async ({ page }) => {
  await login(page, ANA, '/');
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await setScenario(page, 'SESSION_EXPIRED');
  await page.getByRole('navigation', { name: 'Conta' }).getByRole('link', { name: 'Perfil' }).click();

  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fprofile/);
  await expect(page.locator('[data-kind="warning"]').filter({ hasText: 'sessão expirou' })).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem('nft:session'))).resolves.toBeNull();

  await setScenario(page, 'DEFAULT');
  await page.getByLabel('E-mail').fill(ANA.email);
  await page.getByLabel('Senha').fill(ANA.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel('Nome')).toHaveValue('Ana Souza');
});

test('troca de usuário não expõe dados privados da sessão anterior', async ({ page }) => {
  await login(page, ANA, '/nft/nft-004');
  await expect(page.getByRole('button', { name: /Remover .* dos favoritos/ })).toBeVisible();
  await page.goto('/profile/wallets');
  await expect(page.getByText('0x1111111111111111111111111111111111111111')).toBeVisible();
  await logout(page);

  await login(page, BRUNO, '/nft/nft-004');
  await expect(page.getByRole('button', { name: /^Favoritar / })).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/profile/wallets');
  await expect(page.getByText('0x3333333333333333333333333333333333333333')).toBeVisible();
  await expect(page.getByText('0x1111111111111111111111111111111111111111')).toHaveCount(0);
  await page.goto('/profile');
  await expect(page.getByLabel('Nome')).toHaveValue('Bruno Lima');
});
