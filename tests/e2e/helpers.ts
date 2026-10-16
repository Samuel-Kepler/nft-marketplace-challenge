import { expect, type Page } from '@playwright/test';

/**
 * Utilitários E2E. Tudo passa pela aplicação real (Router + Query + Axios + socket.io-client) sobre
 * o MSW no navegador. Os endpoints `/api/v1/mock/*` são chamados DE DENTRO da página (`fetch`), porque
 * `page.request` não atravessa o Service Worker e não alcançaria o estado simulado.
 */

export const ANA = { email: 'ana@example.com', password: 'Senha@123' } as const;
export const BRUNO = { email: 'bruno@example.com', password: 'Senha@456' } as const;

export const mock = (page: Page, path: string, body?: unknown) =>
  page.evaluate(
    ([p, b]) =>
      fetch(`/api/v1${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) }).then((r) => r.status),
    [path, body] as const
  );

export const setScenario = (page: Page, name: string, failures?: number) => mock(page, '/mock/scenario', { name, failures });

/** Estado limpo e determinístico: restaura o cenário conhecido e descarta sessão e tentativa de checkout. */
export async function resetApp(page: Page) {
  await page.goto('/');
  await expect.poll(() => mock(page, '/mock/reset')).toBe(204);
  await page.evaluate(() => {
    localStorage.removeItem('nft:session');
    localStorage.removeItem('nft:checkout_attempt');
  });
  await page.goto('/');
}

export async function login(page: Page, who: { email: string; password: string } = ANA, redirect?: string) {
  await page.goto(redirect ? `/auth/login?redirect=${encodeURIComponent(redirect)}` : '/auth/login');
  await page.getByLabel('E-mail').fill(who.email);
  await page.getByLabel('Senha').fill(who.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

/** Sai pela interface; no mobile o botão pode estar dentro do menu. */
export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: 'Entrar' }).first()).toBeVisible();
}

/** Insere no carrinho remoto da sessão atual (REST via Service Worker, como a UI faria). */
export const addToCart = (page: Page, nftId: string, quantity: number) =>
  page.evaluate(
    async ([id, qty]) => {
      const { token } = JSON.parse(localStorage.getItem('nft:session')!);
      const res = await fetch('/api/v1/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nftId: id, quantity: qty }),
      });
      if (!res.ok) throw new Error(`addToCart ${res.status}`);
    },
    [nftId, quantity] as const
  );

export const nftStock = (page: Page, id: string) =>
  page.evaluate((nftId) => fetch(`/api/v1/nfts/${nftId}`).then((r) => r.json()).then((n) => n.availableQuantity as number), id);

export const overflowX = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Logado como Ana, com `quantity` unidades do nft-001 no carrinho. */
export async function loginAndFillCart(page: Page, quantity = 2, scenario?: string) {
  await login(page);
  await addToCart(page, 'nft-001', quantity);
  if (scenario) await setScenario(page, scenario);
}

/** /checkout: conecta a carteira e revisa o pedido, deixando o botão de envio disponível. */
export async function reviewOrder(page: Page) {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Conectar carteira' }).click();
  await expect(page.getByRole('button', { name: 'Desconectar carteira' })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar pedido' }).click();
  await expect(page.getByRole('button', { name: /Confirmar e enviar pedido|Tentar novamente/ })).toBeVisible();
}

export const submitOrder = (page: Page) => page.getByRole('button', { name: /Confirmar e enviar pedido|Tentar novamente/ }).click();

/**
 * Dispensa os avisos visíveis. No mobile a região `aria-live` é fixa no rodapé, em largura total, e
 * cobre os botões de ação até ser dispensada; um usuário faria o mesmo antes de continuar.
 */
export async function dismissNotices(page: Page) {
  const buttons = page.getByRole('button', { name: 'Dispensar aviso' });
  while ((await buttons.count()) > 0) await buttons.first().click();
}

/** Espera as mutations em andamento terminarem (um `reload` imediato abortaria a requisição). */
export const settled = (page: Page) => page.waitForLoadState('networkidle');
