import { test, expect, type Page } from '@playwright/test';

/**
 * Carrinho → pagamento → confirmação sobre o MSW (REST + socket.io-client reais). Mudanças de
 * preço e cenários entram pelos endpoints `/mock/*`, chamados de dentro da página.
 */

const mock = (page: Page, path: string, body?: unknown) =>
  page.evaluate(
    ([p, b]) =>
      fetch(`/api/v1${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) }).then((r) => r.status),
    [path, body] as const
  );

const nftStock = (page: Page, id: string) =>
  page.evaluate((nftId) => fetch(`/api/v1/nfts/${nftId}`).then((r) => r.json()).then((n) => n.availableQuantity as number), id);

async function loginAndFillCart(page: Page, scenario?: string) {
  await page.goto('/auth/login');
  await page.getByLabel('E-mail').fill('ana@example.com');
  await page.getByLabel('Senha').fill('Senha@123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
  if (scenario) await mock(page, '/mock/scenario', { name: scenario });
  await page.evaluate(async () => {
    const { token } = JSON.parse(localStorage.getItem('nft:session')!);
    await fetch('/api/v1/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nftId: 'nft-001', quantity: 2 }),
    });
  });
}

async function reviewOrder(page: Page) {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Conectar carteira' }).click();
  await expect(page.getByRole('button', { name: 'Desconectar carteira' })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar pedido' }).click();
  await expect(page.getByRole('button', { name: /Confirmar e enviar pedido|Tentar novamente/ })).toBeVisible();
}

const submit = (page: Page) => page.getByRole('button', { name: /Confirmar e enviar pedido|Tentar novamente/ }).click();

test.describe('Checkout', () => {
  test('carrinho: quantidade, cupom inválido e resumo da API', async ({ page }) => {
    await loginAndFillCart(page);
    await page.goto('/cart');
    const line = page.getByTestId('cart-line-nft-001');
    await expect(line.getByTestId('quantity')).toHaveText('2');
    await expect(page.getByText('1.002 ETH')).toBeVisible();

    await line.getByRole('button', { name: /Aumentar quantidade/ }).click();
    await expect(line.getByTestId('quantity')).toHaveText('3');

    await page.getByLabel('Cupom').fill('NFT10');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page).toHaveURL(/coupon=NFT10/);
    await expect(page.getByText('Desconto (NFT10)')).toBeVisible();

    await page.getByLabel('Cupom').fill('INVALIDO');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Cupom inválido' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ir para o pagamento' })).toBeDisabled();

    await line.getByRole('button', { name: /Remover Aurora/ }).click();
    await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();
  });

  test('pedido confirmado mostra o recibo e esvazia o carrinho', async ({ page }) => {
    await loginAndFillCart(page);
    await reviewOrder(page);
    await submit(page);

    await expect(page).toHaveURL(/\/checkout\/success\?orderId=/);
    await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
    await expect(page.getByTestId('tx-hash')).toContainText('0x');
    await expect(page.getByTestId('order-total')).toHaveText('1.002 ETH');

    await page.goto('/cart');
    await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();
  });

  test('pagamento recusado preserva os itens e volta ao pagamento', async ({ page }) => {
    await loginAndFillCart(page, 'PAYMENT_DECLINED');
    await reviewOrder(page);
    await submit(page);

    await expect(page.getByRole('alert').filter({ hasText: 'recusad' })).toBeVisible();
    await expect(page).toHaveURL(/\/checkout(\?|$)/);
    await page.goto('/cart');
    await expect(page.getByTestId('cart-line-nft-001').getByTestId('quantity')).toHaveText('2');
  });

  test('timeout após criar: reenviar com a mesma chave recupera o mesmo pedido, sem duplicar', async ({ page }) => {
    await loginAndFillCart(page, 'ORDER_TIMEOUT_AFTER_CREATE');
    await reviewOrder(page);
    await submit(page);
    await expect(page.getByRole('alert').filter({ hasText: 'Sem resposta' })).toBeVisible();

    await submit(page);
    await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
    // Estoque inicial 5: um único pedido de 2 unidades foi cobrado.
    expect(await nftStock(page, 'nft-001')).toBe(3);
  });

  test('preço muda após a revisão: a confirmação é bloqueada até nova revisão', async ({ page }) => {
    await loginAndFillCart(page);
    await reviewOrder(page);

    await expect.poll(() => mock(page, '/mock/nfts/nft-001', { price: '1' })).toBe(200);
    await expect(page.getByRole('status').filter({ hasText: 'confirme novamente' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar e enviar pedido' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Revisar pedido' }).click();
    await expect(page.getByText('Total: 2.002 ETH')).toBeVisible();
    await submit(page);
    await expect(page.getByTestId('order-total')).toHaveText('2.002 ETH');
  });

  test('refresh com pedido pendente recupera o mesmo pedido, sem criar outro', async ({ page }) => {
    await loginAndFillCart(page);
    await reviewOrder(page);
    await submit(page);
    await expect(page.getByText('Aguardando a confirmação')).toBeVisible();
    const orderId = await page.evaluate(() => JSON.parse(localStorage.getItem('nft:checkout_attempt')!).orderId as string);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
    await expect(page.getByTestId('order-id')).toHaveText(orderId);
    expect(await nftStock(page, 'nft-001')).toBe(3);
  });

  test('confirmação não aparece para pedido que não é do usuário nem sem login', async ({ page }) => {
    await page.goto('/checkout/success?orderId=order-1');
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/);
  });
});
