import { deflateSync } from 'node:zlib';
import { test, expect, type Page } from '@playwright/test';

/** Conta do colecionador: login/cadastro, perfil (dados, avatar, senha) e carteiras, sobre o MSW em modo mocks. */

const mock = (page: Page, path: string, body?: unknown) =>
  page.evaluate(
    ([p, b]) =>
      fetch(`/api/v1${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) }).then((r) => r.status),
    [path, body] as const
  );

async function login(page: Page, email = 'ana@example.com', password = 'Senha@123', redirect?: string) {
  await page.goto(redirect ? `/auth/login?redirect=${encodeURIComponent(redirect)}` : '/auth/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

// PNG 8×8 válido, gerado na hora (sem CRC escrito à mão).
function makePng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const size = 8;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG = makePng();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await mock(page, '/mock/reset');
  await page.evaluate(() => localStorage.removeItem('nft:session'));
});

test.describe('Login e cadastro', () => {
  test('rota privada leva ao login e volta ao destino original depois de entrar', async ({ page }) => {
    await page.goto('/profile/wallets');
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/);
    await page.getByLabel('E-mail').fill('ana@example.com');
    await page.getByLabel('Senha').fill('Senha@123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/profile\/wallets$/);
    await expect(page.getByRole('heading', { name: 'Carteiras', level: 1 })).toBeVisible();
  });

  test('validação no cliente e credenciais inválidas ficam associadas aos campos', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Senha')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('E-mail').fill('ana@example.com');
    await page.getByLabel('Senha').fill('errada123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos' })).toBeVisible();
  });

  test('cadastro com e-mail existente mostra o conflito no campo; novo cadastro entra autenticado', async ({ page }) => {
    await page.goto('/auth/register');
    await page.getByLabel('Nome').fill('Ana Clone');
    await page.getByLabel('E-mail').fill('ana@example.com');
    await page.getByLabel('Senha').fill('Senha@999');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'já está cadastrado' })).toBeVisible();
    await expect(page.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('E-mail').fill('novo@example.com');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page).not.toHaveURL(/\/auth\/register/);
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  });

  test('quem já está autenticado não vê o login; a sessão sobrevive ao refresh e o logout a encerra', async ({ page }) => {
    await login(page);
    await page.goto('/auth/login?redirect=/profile');
    await expect(page).toHaveURL(/\/profile$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible();

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('Perfil do colecionador', () => {
  test('edita nome e e-mail, valida erros e mantém os dados após refresh', async ({ page }) => {
    await login(page, undefined, undefined, '/profile');
    const name = page.getByLabel('Nome');
    await expect(name).toHaveValue('Ana Souza');

    await name.fill('A');
    await page.getByRole('button', { name: 'Salvar dados' }).click();
    await expect(name).toHaveAttribute('aria-invalid', 'true');

    await name.fill('Ana Souza Lima');
    await page.getByLabel('E-mail').fill('bruno@example.com');
    await page.getByRole('button', { name: 'Salvar dados' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'já está em uso' })).toBeVisible();

    await page.getByLabel('E-mail').fill('ana.lima@example.com');
    await page.getByRole('button', { name: 'Salvar dados' }).click();
    await expect(page.getByRole('status').getByText('Dados atualizados.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Nome')).toHaveValue('Ana Souza Lima');
    await expect(page.getByLabel('E-mail')).toHaveValue('ana.lima@example.com');
  });

  test('avatar: rejeita arquivo inválido e persiste a imagem reduzida após refresh', async ({ page }) => {
    await login(page, undefined, undefined, '/profile');
    const file = page.getByLabel('Escolher imagem');

    await file.setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
    await expect(page.getByRole('alert').filter({ hasText: 'arquivo de imagem' })).toBeVisible();

    await file.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('status').getByText('Avatar atualizado.')).toBeVisible();
    await page.reload();
    const img = page.getByTestId('avatar-image');
    await expect(img).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    await expect(img).toHaveAttribute('alt', 'Avatar de Ana Souza');
  });

  test('senha: valida, rejeita a atual incorreta e a nova senha passa a valer no login', async ({ page }) => {
    await login(page, undefined, undefined, '/profile');
    const change = page.getByRole('button', { name: 'Alterar senha' });

    await page.getByLabel('Senha atual').fill('Senha@123');
    await page.getByLabel('Nova senha', { exact: true }).fill('Nova@1234');
    await page.getByLabel('Confirmar nova senha').fill('Diferente');
    await change.click();
    await expect(page.getByRole('alert').filter({ hasText: 'não coincidem' })).toBeVisible();

    await page.getByLabel('Senha atual').fill('errada');
    await page.getByLabel('Confirmar nova senha').fill('Nova@1234');
    await change.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Senha atual incorreta' })).toBeVisible();

    await page.getByLabel('Senha atual').fill('Senha@123');
    await change.click();
    await expect(page.getByRole('status').getByText('Senha alterada.')).toBeVisible();
    await expect(page.getByLabel('Senha atual')).toHaveValue('');

    await page.getByRole('button', { name: 'Sair' }).click();
    await login(page, 'ana@example.com', 'Nova@1234');
  });

  test('cenário de validação da API exibe o erro do servidor por campo', async ({ page }) => {
    await login(page, undefined, undefined, '/profile');
    await mock(page, '/mock/scenario', { name: 'FORM_VALIDATION_ERROR' });
    await page.getByLabel('Senha atual').fill('Senha@123');
    await page.getByLabel('Nova senha', { exact: true }).fill('Nova@1234');
    await page.getByLabel('Confirmar nova senha').fill('Nova@1234');
    await page.getByRole('button', { name: 'Alterar senha' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Senha inválida' })).toBeVisible();
  });
});

test.describe('Carteiras', () => {
  test('mostra principal e secundária, conecta, desconecta e mantém o estado após refresh', async ({ page }) => {
    await login(page, undefined, undefined, '/profile/wallets');
    const main = page.getByTestId('wallet-wallet-1');
    const second = page.getByTestId('wallet-wallet-2');
    await expect(main.getByRole('heading')).toContainText('Principal');
    await expect(second.getByRole('heading')).toContainText('Secundária');
    await expect(main.getByTestId('wallet-status')).toHaveText('Desconectada');

    await main.getByRole('button', { name: 'Conectar' }).click();
    await expect(main.getByTestId('wallet-status')).toHaveText('Conectada');
    await page.reload();
    await expect(page.getByTestId('wallet-wallet-1').getByTestId('wallet-status')).toHaveText('Conectada');

    await page.getByTestId('wallet-wallet-1').getByRole('button', { name: 'Desconectar' }).click();
    await expect(page.getByTestId('wallet-wallet-1').getByTestId('wallet-status')).toHaveText('Desconectada');
  });

  test('conexão recusada mostra erro e a carteira continua desconectada', async ({ page }) => {
    await login(page, undefined, undefined, '/profile/wallets');
    await mock(page, '/mock/scenario', { name: 'WALLET_REFUSED' });
    const main = page.getByTestId('wallet-wallet-1');
    await main.getByRole('button', { name: 'Conectar' }).click();
    await expect(main.getByRole('alert')).toContainText('recusada');
    await expect(main.getByTestId('wallet-status')).toHaveText('Desconectada');
  });

  test('edita rede e apelido, troca a carteira principal e valida o endereço', async ({ page }) => {
    await login(page, undefined, undefined, '/profile/wallets');
    const second = page.getByTestId('wallet-wallet-2');
    await second.getByRole('button', { name: 'Editar' }).click();

    const address = second.getByLabel('Endereço da carteira');
    await address.fill('0x123');
    await second.getByRole('button', { name: 'Salvar carteira' }).click();
    await expect(address).toHaveAttribute('aria-invalid', 'true');

    await address.fill('0x1111111111111111111111111111111111111111');
    await second.getByRole('button', { name: 'Salvar carteira' }).click();
    await expect(second.getByRole('alert').filter({ hasText: 'já cadastrada' })).toBeVisible();

    await address.fill('0x2222222222222222222222222222222222222222');
    await second.getByLabel('Rede').selectOption('arbitrum');
    await second.getByLabel('Apelido (opcional)').fill('Cofre');
    await second.getByLabel('Definir como principal').check();
    await second.getByRole('button', { name: 'Salvar carteira' }).click();

    await expect(page.getByRole('status').getByText('Carteira atualizada.')).toBeVisible();
    await page.reload();
    const first = page.getByRole('listitem').first();
    await expect(first.getByRole('heading')).toContainText('Principal — Cofre');
    await expect(first).toContainText('Arbitrum');
  });

  test('limite de duas carteiras: sem formulário de cadastro; usuário sem carteira cadastra a principal', async ({ page }) => {
    await login(page, undefined, undefined, '/profile/wallets');
    await expect(page.getByText('Limite de 2 carteiras atingido')).toBeVisible();
    await page.getByRole('button', { name: 'Sair' }).click();

    await page.goto('/auth/register');
    await page.getByLabel('Nome').fill('Carla Dias');
    await page.getByLabel('E-mail').fill('carla@example.com');
    await page.getByLabel('Senha').fill('Senha@777');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    // Aguarda o cadastro concluir antes de navegar: um `goto` imediato aborta a requisição em andamento.
    await expect(page).not.toHaveURL(/\/auth\/register/);
    await page.goto('/profile/wallets');
    await expect(page.getByText('nenhuma carteira')).toBeVisible();

    await page.getByLabel('Endereço da carteira').fill('0x4444444444444444444444444444444444444444');
    await page.getByLabel('Rede').selectOption('polygon');
    await page.getByRole('button', { name: 'Cadastrar carteira' }).click();
    const card = page.getByRole('listitem').first();
    await expect(card.getByRole('heading')).toContainText('Principal');
    await expect(card).toContainText('Polygon');
  });

  test('privacidade: outro usuário não vê as carteiras nem o perfil do anterior', async ({ page }) => {
    await login(page, undefined, undefined, '/profile/wallets');
    await expect(page.getByText('0x1111111111111111111111111111111111111111')).toBeVisible();
    await page.getByRole('button', { name: 'Sair' }).click();

    await login(page, 'bruno@example.com', 'Senha@456', '/profile/wallets');
    await expect(page.getByText('0x3333333333333333333333333333333333333333')).toBeVisible();
    await expect(page.getByText('0x1111111111111111111111111111111111111111')).toHaveCount(0);
    await page.goto('/profile');
    await expect(page.getByLabel('Nome')).toHaveValue('Bruno Lima');
  });
});
