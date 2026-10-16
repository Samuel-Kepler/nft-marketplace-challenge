import { test, expect, type Page } from '@playwright/test';

/**
 * Aplicação real (router + Query + Axios + socket.io-client) sobre o MSW. Os eventos só são
 * provocados pelos endpoints `/mock/*`, chamados de dentro da página (passam pelo Service Worker).
 */

const mock = (page: Page, path: string, body?: unknown) =>
  page.evaluate(
    ([p, b]) => fetch(`/api/v1${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) }).then((r) => r.status),
    [path, body] as const
  );

async function loginAsAna(page: Page, redirect?: string) {
  await page.goto(redirect ? `/auth/login?redirect=${encodeURIComponent(redirect)}` : '/auth/login');
  await page.getByLabel('E-mail').fill('ana@example.com');
  await page.getByLabel('Senha').fill('Senha@123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

/** Adiciona ao carrinho remoto da sessão atual (REST via Service Worker, como a UI faria). */
const addToCart = (page: Page, nftId: string, quantity: number) =>
  page.evaluate(
    async ([id, qty]) => {
      const { token } = JSON.parse(localStorage.getItem('nft:session')!);
      await fetch('/api/v1/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nftId: id, quantity: qty }),
      });
    },
    [nftId, quantity] as const
  );

test.describe('Roteamento e estado remoto', () => {
  test('catálogo lê a página da URL e a paginação volta pelo histórico', async ({ page }) => {
    await page.goto('/?page=2');
    await expect(page.getByText('Página 2 de 3')).toBeVisible();

    await page.getByRole('link', { name: 'Anterior' }).click();
    await expect(page.getByText('Página 1 de 3')).toBeVisible();
    await expect(page).not.toHaveURL(/page=/);

    await page.goBack();
    await expect(page.getByText('Página 2 de 3')).toBeVisible();
  });

  test('busca entra na URL e reinicia a paginação', async ({ page }) => {
    await page.goto('/?page=2');
    await page.getByLabel('Buscar').fill('aurora');
    await page.getByLabel('Buscar').press('Enter');
    await expect(page).toHaveURL(/search=aurora/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByRole('link', { name: /Aurora/ }).first()).toBeVisible();
  });

  test('rota inexistente e NFT inexistente têm tratamento próprio', async ({ page }) => {
    await page.goto('/nao-existe');
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();

    await page.goto('/nft/nft-inexistente');
    await expect(page.getByRole('heading', { name: 'NFT não encontrado' })).toBeVisible();
  });

  test('acesso direto a rota privada redireciona ao login e retorna ao destino após autenticar', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fprofile/);

    await page.getByLabel('E-mail').fill('ana@example.com');
    await page.getByLabel('Senha').fill('Senha@123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible();
    await expect(page.getByLabel('Nome')).toHaveValue('Ana Souza');
  });

  test('redirect externo no login é ignorado', async ({ page }) => {
    await loginAsAna(page, '//evil.example');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test('erro de credenciais vem da API e fica associado ao formulário', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('E-mail').fill('ana@example.com');
    await page.getByLabel('Senha').fill('errada123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos');
  });

  test('validação de cliente marca o campo inválido', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('E-mail').fill('nao-e-email');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true');
  });

  test('sessão sobrevive ao refresh', async ({ page }) => {
    await loginAsAna(page, '/profile');
    await expect(page.getByLabel('Nome')).toHaveValue('Ana Souza');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible();
  });

  test('sessão expirada durante a navegação leva ao login preservando o destino', async ({ page }) => {
    await loginAsAna(page, '/profile');
    await expect(page.getByLabel('Nome')).toHaveValue('Ana Souza');

    await mock(page, '/mock/scenario', { name: 'SESSION_EXPIRED' });
    await page.reload();

    await expect(page).toHaveURL(/\/auth\/login\?redirect=/);
    await expect(page.evaluate(() => localStorage.getItem('nft:session'))).resolves.toBeNull();
  });
});

test.describe('Tempo real na aplicação', () => {
  test('nft.updated atualiza o preço no catálogo sem refetch manual', async ({ page }) => {
    await page.goto('/');
    const first = page.locator('li a[href^="/nft/"]').first();
    await expect(first).toBeVisible();
    const href = (await first.getAttribute('href'))!;
    const id = href.split('/').pop()!;

    // O socket conecta fora do caminho crítico: repete o evento (cada um com versão nova) até chegar.
    // O NFT pode aparecer também em Destaques: todas as ocorrências devem refletir o novo preço.
    const cards = page.getByTestId(`nft-card-${id}`);
    await expect(async () => {
      expect(await mock(page, `/mock/nfts/${id}`, { price: '9.99' })).toBe(200);
      await expect(cards.first()).toContainText('9.99 ETH', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    for (const card of await cards.all()) await expect(card).toContainText('9.99 ETH');
  });

  test('mudança de preço com o carrinho aberto avisa e atualiza o resumo', async ({ page }) => {
    await loginAsAna(page, '/');
    await addToCart(page, 'nft-001', 2);

    await page.goto('/cart');
    const line = page.getByTestId('cart-line-nft-001');
    await expect(line.getByTestId('quantity')).toHaveText('2');

    await expect.poll(() => mock(page, '/mock/nfts/nft-001', { price: '9.99' })).toBe(200);
    await expect(page.getByRole('status')).toContainText('preço ou disponibilidade mudou');
    await expect(line).toContainText('19.98 ETH');
  });

  test('evento duplicado não repete o aviso', async ({ page }) => {
    await loginAsAna(page, '/');
    await addToCart(page, 'nft-001', 1);
    await page.goto('/cart');
    await expect(page.getByTestId('cart-line-nft-001').getByTestId('quantity')).toHaveText('1');

    await expect.poll(() => mock(page, '/mock/nfts/nft-001', { price: '9.99' })).toBe(200);
    const warnings = page.locator('[data-kind="warning"]');
    await expect(warnings).toHaveCount(1);

    await mock(page, '/mock/socket/replay', { kind: 'duplicate' });
    await mock(page, '/mock/socket/replay', { kind: 'stale' });
    await page.waitForTimeout(500);
    await expect(warnings).toHaveCount(1);
  });
});
