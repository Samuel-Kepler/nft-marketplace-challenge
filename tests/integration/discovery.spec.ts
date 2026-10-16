import { test, expect, type Page } from '@playwright/test';

/** Descoberta: catálogo (URL como estado) e detalhe do NFT, sobre o MSW em modo mocks. */

const mock = (page: Page, path: string, body?: unknown) =>
  page.evaluate(
    ([p, b]) =>
      fetch(`/api/v1${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) }).then((r) => r.status),
    [path, body] as const
  );

async function loginAsAna(page: Page, redirect: string) {
  await page.goto(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel('E-mail').fill('ana@example.com');
  await page.getByLabel('Senha').fill('Senha@123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

const results = (page: Page) => page.getByTestId('catalog-results');

test.describe('Catálogo', () => {
  test('filtros combinados, ordenação e paginação ficam na URL e voltam pelo histórico', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Categoria').selectOption('art');
    await expect(page).toHaveURL(/category=art/);
    await page.getByLabel('Ordenar por').selectOption('price-asc');
    await expect(page).toHaveURL(/sortBy=price-asc/);
    await expect(page).toHaveURL(/category=art/);

    await page.getByLabel('Preço máximo (ETH)').fill('1');
    await page.getByRole('button', { name: 'Aplicar preço' }).click();
    await expect(page).toHaveURL(/maxPrice=1/);

    await page.goBack();
    await expect(page).not.toHaveURL(/maxPrice/);
    await expect(page.getByLabel('Preço máximo (ETH)')).toHaveValue('');
    await expect(page.getByLabel('Ordenar por')).toHaveValue('price-asc');
  });

  test('mudar filtro na página 2 volta para a página 1', async ({ page }) => {
    await page.goto('/?page=2');
    await expect(page.getByText('Página 2 de 3')).toBeVisible();
    await page.getByLabel('Raridade').selectOption('rare');
    await expect(page).toHaveURL(/rarity=rare/);
    await expect(page).not.toHaveURL(/page=/);
  });

  test('preço inválido mostra erro associado ao campo e não altera a URL', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Preço mínimo (ETH)').fill('abc');
    await page.getByRole('button', { name: 'Aplicar preço' }).click();
    await expect(page.getByRole('alert')).toContainText('Preço mínimo inválido');
    await expect(page.getByLabel('Preço mínimo (ETH)')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).not.toHaveURL(/minPrice/);
  });

  test('resultado vazio oferece limpar filtros', async ({ page }) => {
    await page.goto('/?search=zzzz-nao-existe');
    await expect(results(page).getByText('Nenhum NFT encontrado.')).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(page).not.toHaveURL(/search=/);
    await expect(results(page).getByRole('listitem').first()).toBeVisible();
  });

  test('página fora do intervalo leva de volta à primeira', async ({ page }) => {
    await page.goto('/?page=99');
    await page.getByRole('link', { name: 'Voltar à primeira página' }).click();
    await expect(page.getByText('Página 1 de 3')).toBeVisible();
  });

  test('falha do catálogo mostra erro e se recupera ao tentar novamente', async ({ page }) => {
    await page.goto('/?scenario=HTTP_5XX&category=music');
    await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o catálogo.' })).toBeVisible({ timeout: 15_000 });
    await mock(page, '/mock/scenario', { name: 'DEFAULT' });
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(results(page).getByRole('listitem').first()).toBeVisible();
  });

  test('skeleton aparece em rede lenta', async ({ page }) => {
    await page.goto('/?scenario=SLOW_NETWORK&category=photography');
    await expect(page.getByRole('status', { name: 'Carregando catálogo' })).toBeVisible();
    await expect(results(page).getByRole('listitem').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Detalhe do NFT', () => {
  test('acesso direto mostra informações e disponibilidade', async ({ page }) => {
    await page.goto('/nft/nft-001');
    await expect(page.getByRole('heading', { name: 'Aurora Drift' })).toBeVisible();
    await expect(page.getByTestId('nft-price')).toHaveText('0.5 ETH');
    await expect(page.getByTestId('nft-availability')).toContainText('5 unidades disponíveis');
  });

  test('NFT inexistente mostra "não encontrado"', async ({ page }) => {
    await page.goto('/nft/nft-999');
    await expect(page.getByRole('heading', { name: 'NFT não encontrado' })).toBeVisible();
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

  test('edição esgotada some do limite: a quantidade segue a edição escolhida', async ({ page }) => {
    await page.goto('/nft/nft-002');
    await expect(page.getByTestId('nft-price')).toHaveText('0.8 ETH');
    await page.getByRole('radio', { name: /Collector/ }).check();
    await expect(page.getByTestId('nft-price')).toHaveText('1.5 ETH');
    await expect(page.getByTestId('nft-availability')).toContainText('1 unidade disponível');
    await expect(page.getByRole('button', { name: 'Aumentar quantidade' })).toBeDisabled();
  });

  test('visitante é enviado ao login ao favoritar e volta ao NFT', async ({ page }) => {
    await page.goto('/nft/nft-001');
    await page.getByRole('button', { name: /Favoritar Aurora Drift/ }).click();
    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fnft%2Fnft-001/);
  });

  test('favorito é otimista e persiste após refresh', async ({ page }) => {
    await loginAsAna(page, '/nft/nft-001');
    const button = page.getByRole('button', { name: /Favoritar Aurora Drift/ });
    await button.click();
    await expect(page.getByRole('button', { name: /Remover Aurora Drift dos favoritos/ })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('button', { name: /Remover Aurora Drift dos favoritos/ })).toBeVisible();
  });

  test('falha ao favoritar desfaz a alteração e avisa', async ({ page }) => {
    await loginAsAna(page, '/nft/nft-001');
    await mock(page, '/mock/scenario', { name: 'FAVORITES_MUTATION_FAILS' });
    await page.getByRole('button', { name: /Favoritar Aurora Drift/ }).click();
    await expect(page.getByText('A alteração foi desfeita.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Favoritar Aurora Drift/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('adicionar ao carrinho confirma e aparece no carrinho', async ({ page }) => {
    await loginAsAna(page, '/nft/nft-001');
    await page.getByRole('button', { name: 'Aumentar quantidade' }).click();
    await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
    await expect(page.getByText('2 × Aurora Drift adicionado ao carrinho.')).toBeVisible();
    await page.goto('/cart');
    await expect(page.getByTestId('cart-line-nft-001').getByTestId('quantity')).toHaveText('2');
  });

  test('nft.updated reduz o estoque e ajusta a quantidade em tela', async ({ page }) => {
    await page.goto('/nft/nft-001');
    const plus = page.getByRole('button', { name: 'Aumentar quantidade' });
    for (let i = 0; i < 4; i++) await plus.click();
    await expect(page.getByTestId('quantity')).toHaveText('5');
    await expect.poll(() => mock(page, '/mock/nfts/nft-001', { availableQuantity: 2 })).toBe(200);
    await expect(page.getByTestId('nft-availability')).toContainText('2 unidades');
    await expect(page.getByTestId('quantity')).toHaveText('2');
  });

  test('falha de carregamento do detalhe permite tentar de novo', async ({ page }) => {
    await page.goto('/nft/nft-005?scenario=HTTP_5XX');
    await expect(page.getByRole('alert')).toContainText('Não foi possível carregar este NFT.', { timeout: 15_000 });
    await mock(page, '/mock/scenario', { name: 'DEFAULT' });
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
