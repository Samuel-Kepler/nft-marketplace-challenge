import { test, expect, type Page } from '@playwright/test';
import { resetApp } from './helpers';

/** Cenário 1: busca, filtros combinados, ordenação, paginação e restauração pelo histórico. */

const results = (page: Page) => page.getByTestId('catalog-results');
const cards = (page: Page) => results(page).locator('li[data-testid^="nft-card-"]');
const prices = async (page: Page) =>
  (await cards(page).allTextContents()).map((t) => Number(/([\d.]+) ETH/.exec(t)![1]));

test.beforeEach(async ({ page }) => resetApp(page));

test('filtros combinados, ordenação e preço ficam na URL e voltam pelo histórico', async ({ page }) => {
  await page.getByLabel('Categoria').selectOption('art');
  await expect(page).toHaveURL(/category=art/);
  await page.getByLabel('Ordenar por').selectOption('price-asc');
  await expect(page).toHaveURL(/sortBy=price-asc/);
  await expect(page).toHaveURL(/category=art/);

  await page.getByLabel('Preço máximo (ETH)').fill('1');
  await page.getByRole('button', { name: 'Aplicar preço' }).click();
  await expect(page).toHaveURL(/maxPrice=1/);

  // Resultado compatível com TODOS os filtros: ordenado de forma crescente e dentro do teto.
  await expect(cards(page).first()).toBeVisible();
  await expect.poll(async () => {
    const list = await prices(page);
    return list.length > 0 && Math.max(...list) <= 1 && list.every((p, i) => i === 0 || list[i - 1]! <= p);
  }).toBe(true);

  await page.goBack();
  await expect(page).not.toHaveURL(/maxPrice/);
  await expect(page.getByLabel('Preço máximo (ETH)')).toHaveValue('');
  await expect(page.getByLabel('Ordenar por')).toHaveValue('price-asc');
  await expect(page.getByLabel('Categoria')).toHaveValue('art');
});

test('ordenação decrescente inverte a lista da API', async ({ page }) => {
  await page.getByLabel('Ordenar por').selectOption('price-desc');
  await expect(page).toHaveURL(/sortBy=price-desc/);
  await expect(cards(page).first()).toBeVisible();
  await expect
    .poll(async () => {
      const list = await prices(page);
      return list.length > 1 && list.every((p, i) => i === 0 || list[i - 1]! >= p);
    })
    .toBe(true);
});

test('busca entra na URL, reinicia a paginação e restaura ao voltar', async ({ page }) => {
  await page.goto('/?page=2');
  await expect(page.getByText('Página 2 de 3')).toBeVisible();
  await page.getByLabel('Buscar').fill('aurora');
  await page.getByLabel('Buscar').press('Enter');
  await expect(page).toHaveURL(/search=aurora/);
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.getByRole('link', { name: /Aurora/ }).first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText('Página 2 de 3')).toBeVisible();
});

test('paginação sobrevive a refresh e mudar filtro na página 2 volta à página 1', async ({ page }) => {
  await page.getByRole('link', { name: 'Próxima' }).click();
  await expect(page.getByText('Página 2 de 3')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Página 2 de 3')).toBeVisible();

  await page.getByLabel('Raridade').selectOption('rare');
  await expect(page).toHaveURL(/rarity=rare/);
  await expect(page).not.toHaveURL(/page=/);

  await page.goBack();
  await expect(page.getByText('Página 2 de 3')).toBeVisible();
});

test('resultado vazio oferece limpar filtros; preço inválido não altera a URL', async ({ page }) => {
  await page.goto('/?search=zzzz-nao-existe');
  await expect(results(page).getByText('Nenhum NFT encontrado.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page).not.toHaveURL(/search=/);
  await expect(cards(page).first()).toBeVisible();

  await page.getByLabel('Preço mínimo (ETH)').fill('abc');
  await page.getByRole('button', { name: 'Aplicar preço' }).click();
  await expect(page.getByRole('alert')).toContainText('Preço mínimo inválido');
  await expect(page.getByLabel('Preço mínimo (ETH)')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).not.toHaveURL(/minPrice/);
});

test('navega do catálogo ao detalhe e volta preservando a consulta', async ({ page }) => {
  await page.goto('/?category=art&sortBy=price-asc');
  await expect(cards(page).first()).toBeVisible();
  await cards(page).first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/nft\/nft-/);
  await page.goBack();
  await expect(page).toHaveURL(/category=art/);
  await expect(page.getByLabel('Ordenar por')).toHaveValue('price-asc');
});
