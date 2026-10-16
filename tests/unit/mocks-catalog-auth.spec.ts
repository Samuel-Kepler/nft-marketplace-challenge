import { compareEth } from '@/shared/utils/eth';
import { MemoryStorage, MockDb } from '@/mocks/db/db';
import { test, expect } from './helpers/mock-fixture';

test.describe('MSW REST — catálogo', () => {
  test('pagina 48 itens em 3 páginas e respeita limit', async ({ mock }) => {
    const p1 = await mock.api.get('/nfts');
    expect(p1.status).toBe(200);
    expect(p1.data).toMatchObject({ total: 48, page: 1, limit: 20, totalPages: 3 });
    expect(p1.data.items).toHaveLength(20);

    const p3 = await mock.api.get('/nfts', { params: { page: 3 } });
    expect(p3.data.items).toHaveLength(8);

    const small = await mock.api.get('/nfts', { params: { limit: 10 } });
    expect(small.data.totalPages).toBe(5);
  });

  test('filtros se combinam e ordenação por preço usa aritmética decimal', async ({ mock }) => {
    const all = await mock.api.get('/nfts', { params: { limit: 100 } });
    const art = all.data.items.filter((n: { category: string }) => n.category === 'art');

    const filtered = await mock.api.get('/nfts', { params: { category: 'art', sortBy: 'price-asc', limit: 100 } });
    expect(filtered.data.total).toBe(art.length);
    const prices: string[] = filtered.data.items.map((n: { price: string }) => n.price);
    for (let i = 1; i < prices.length; i++) expect(compareEth(prices[i - 1]!, prices[i]!)).toBeLessThanOrEqual(0);

    const combined = await mock.api.get('/nfts', {
      params: { category: 'art', maxPrice: '0.5', minPrice: '0.1', limit: 100 },
    });
    expect(combined.data.items.length).toBeGreaterThan(0);
    for (const n of combined.data.items) {
      expect(n.category).toBe('art');
      expect(compareEth(n.price, '0.5')).toBeLessThanOrEqual(0);
      expect(compareEth(n.price, '0.1')).toBeGreaterThanOrEqual(0);
    }
  });

  test('busca por texto e destaque', async ({ mock }) => {
    const search = await mock.api.get('/nfts', { params: { search: 'aurora drift' } });
    expect(search.data.items.map((n: { id: string }) => n.id)).toContain('nft-001');

    const none = await mock.api.get('/nfts', { params: { search: 'zzz-inexistente' } });
    expect(none.data).toMatchObject({ items: [], total: 0 });

    const featured = await mock.api.get('/nfts', { params: { featured: true, limit: 100 } });
    expect(featured.data.items.length).toBeGreaterThan(0);
    expect(featured.data.items.every((n: { featured: boolean }) => n.featured)).toBe(true);
  });

  test('detalhe, NFT inexistente (404) e query inválida (400 com fields)', async ({ mock }) => {
    const ok = await mock.api.get('/nfts/nft-002');
    expect(ok.data.editions).toHaveLength(2);

    const missing = await mock.api.get('/nfts/nft-999');
    expect(missing.status).toBe(404);
    expect(missing.data.code).toBe('NFT_NOT_FOUND');

    const bad = await mock.api.get('/nfts', { params: { page: 0, sortBy: 'x' } });
    expect(bad.status).toBe(400);
    expect(bad.data.code).toBe('VALIDATION_ERROR');
    expect(bad.data.fields).toHaveProperty('page');
  });
});

test.describe('MSW REST — sessão e conta', () => {
  test('login, consulta de sessão e logout invalidam o token', async ({ mock }) => {
    const bad = await mock.api.post('/auth/login', { email: 'ana@example.com', password: 'errada1' });
    expect(bad.status).toBe(401);
    expect(bad.data.code).toBe('INVALID_CREDENTIALS');

    const token = await mock.login('ana');
    const session = await mock.api.get('/auth/session', mock.auth(token));
    expect(session.data.user).toMatchObject({ email: 'ana@example.com', name: 'Ana Souza' });
    expect(JSON.stringify(session.data)).not.toMatch(/passwordHash|Senha@123/);

    expect((await mock.api.post('/auth/logout', undefined, mock.auth(token))).status).toBe(204);
    const after = await mock.api.get('/auth/session', mock.auth(token));
    expect(after.status).toBe(401);
  });

  test('rotas privadas sem token retornam 401', async ({ mock }) => {
    for (const path of ['/cart', '/favorites', '/wallets', '/profile', '/orders/order-1']) {
      const res = await mock.api.get(path);
      expect(res.status, path).toBe(401);
      expect(res.data.code).toBe('UNAUTHENTICATED');
    }
  });

  test('cadastro: validação com fields, conflito 409 e login do novo usuário', async ({ mock }) => {
    const invalid = await mock.api.post('/auth/register', { name: 'X', email: 'nao-e-email', password: '123' });
    expect(invalid.status).toBe(400);
    expect(Object.keys(invalid.data.fields)).toEqual(expect.arrayContaining(['name', 'email', 'password']));

    const conflict = await mock.api.post('/auth/register', {
      name: 'Outra Ana',
      email: 'ANA@example.com',
      password: 'Senha@999',
    });
    expect(conflict.status).toBe(409);
    expect(conflict.data.fields.email).toBeTruthy();

    const created = await mock.api.post('/auth/register', {
      name: 'Carla Dias',
      email: 'carla@example.com',
      password: 'Senha@999',
    });
    expect(created.status).toBe(201);
    expect(['user-1', 'user-2']).not.toContain(created.data.user.id);
    const relogin = await mock.api.post('/auth/login', { email: 'carla@example.com', password: 'Senha@999' });
    expect(relogin.status).toBe(200);
  });

  test('perfil: atualização persiste, e-mail duplicado e avatar inválido falham', async ({ mock }) => {
    const token = await mock.login('ana');
    const ok = await mock.api.patch(
      '/profile',
      { name: 'Ana S. Souza', avatarUrl: 'data:image/png;base64,AAAA' },
      mock.auth(token)
    );
    expect(ok.data).toMatchObject({ name: 'Ana S. Souza', avatarUrl: 'data:image/png;base64,AAAA' });
    expect((await mock.api.get('/profile', mock.auth(token))).data.name).toBe('Ana S. Souza');

    const dup = await mock.api.patch('/profile', { email: 'bruno@example.com' }, mock.auth(token));
    expect(dup.status).toBe(409);

    const badAvatar = await mock.api.patch('/profile', { avatarUrl: 'http://x/y.png' }, mock.auth(token));
    expect(badAvatar.status).toBe(400);
    expect(badAvatar.data.fields).toHaveProperty('avatarUrl');
  });

  test('senha: exige a atual, grava hash e a nova senha passa a valer', async ({ mock }) => {
    const token = await mock.login('ana');
    const wrong = await mock.api.patch(
      '/profile/password',
      { currentPassword: 'x', newPassword: 'NovaSenha1' },
      mock.auth(token)
    );
    expect(wrong.status).toBe(400);
    expect(wrong.data.fields.currentPassword).toBeTruthy();

    const ok = await mock.api.patch(
      '/profile/password',
      { currentPassword: 'Senha@123', newPassword: 'NovaSenha1' },
      mock.auth(token)
    );
    expect(ok.status).toBe(204);
    expect((await mock.api.post('/auth/login', { email: 'ana@example.com', password: 'Senha@123' })).status).toBe(401);
    expect((await mock.api.post('/auth/login', { email: 'ana@example.com', password: 'NovaSenha1' })).status).toBe(200);
  });

  test('carteiras: limite, validação, troca de principal, isolamento e recusa de conexão', async ({ mock }) => {
    const ana = await mock.login('ana');
    const bruno = await mock.login('bruno');

    const list = await mock.api.get('/wallets', mock.auth(ana));
    expect(list.data.map((w: { id: string }) => w.id)).toEqual(['wallet-1', 'wallet-2']);

    const limit = await mock.api.post('/wallets', { address: `0x${'4'.repeat(40)}`, network: 'polygon' }, mock.auth(ana));
    expect(limit.status).toBe(409);
    expect(limit.data.code).toBe('WALLET_LIMIT');

    const invalid = await mock.api.post('/wallets', { address: '0x123', network: 'polygon' }, mock.auth(bruno));
    expect(invalid.data.fields).toHaveProperty('address');

    const created = await mock.api.post(
      '/wallets',
      { address: `0x${'5'.repeat(40)}`, network: 'arbitrum', label: 'Sec' },
      mock.auth(bruno)
    );
    expect(created.status).toBe(201);
    expect(created.data.isPrimary).toBe(false);

    const promote = await mock.api.patch(`/wallets/${created.data.id}`, { isPrimary: true }, mock.auth(bruno));
    expect(promote.data.isPrimary).toBe(true);
    const brunoWallets = (await mock.api.get('/wallets', mock.auth(bruno))).data;
    expect(brunoWallets.filter((w: { isPrimary: boolean }) => w.isPrimary)).toHaveLength(1);

    expect((await mock.api.patch('/wallets/wallet-1', { label: 'x' }, mock.auth(bruno))).status).toBe(403);

    mock.db.setScenario('WALLET_REFUSED');
    const refused = await mock.api.post('/wallets/wallet-1/connect', undefined, mock.auth(ana));
    expect(refused.status).toBe(403);
    expect(refused.data.code).toBe('WALLET_CONNECTION_REFUSED');
  });
});

test.describe('MockDb — sessão, persistência e reset', () => {
  test('sessão expira pelo relógio injetado (mesmo `now` que page.clock controlaria)', async () => {
    let now = 1_000_000;
    const db = new MockDb({ now: () => now, baseLatencyMs: 0 });
    const session = await db.login('ana@example.com', 'Senha@123');
    expect(db.authenticate(session.token).id).toBe('user-1');
    now += 31 * 60_000;
    expect(() => db.authenticate(session.token)).toThrowError(/expirou/);
    db.dispose();
  });

  test('estado sobrevive a um "refresh" e reset restaura integralmente o fixture', () => {
    const storage = new MemoryStorage();
    const db1 = new MockDb({ storage, baseLatencyMs: 0 });
    db1.updateNft('nft-001', { price: '0.9' });
    db1.addFavorite('user-1', 'nft-001');
    db1.dispose();

    const db2 = new MockDb({ storage, baseLatencyMs: 0 });
    expect(db2.getNft('nft-001')).toMatchObject({ price: '0.9', version: 2 });
    expect(db2.getFavorites('user-1')).toContain('nft-001');

    db2.setScenario('HTTP_5XX');
    db2.reset();
    expect(db2.getNft('nft-001')).toMatchObject({ price: '0.5', version: 1 });
    expect(db2.getFavorites('user-1')).toEqual(['nft-004']);
    expect(db2.scenario.name).toBe('DEFAULT');
    db2.dispose();
  });

  test('storage corrompido cai para o fixture em vez de quebrar', () => {
    const storage = new MemoryStorage();
    storage.setItem('nft:mock_db', '{nao-e-json');
    const db = new MockDb({ storage, baseLatencyMs: 0 });
    expect(db.getNft('nft-001').title).toBe('Aurora Drift');
    db.dispose();
  });
});
