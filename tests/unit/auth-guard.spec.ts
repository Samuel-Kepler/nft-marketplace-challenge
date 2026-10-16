import { test, expect } from '@playwright/test';
import { isPrivatePath, parseAuthSearch, safeRedirect } from '@/features/auth/guard';

test.describe('Guarda de autenticação', () => {
  test('safeRedirect aceita apenas caminhos internos', () => {
    expect(safeRedirect('/checkout?x=1')).toBe('/checkout?x=1');
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect('/\\evil.example')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect(42, '/cart')).toBe('/cart');
  });

  test('parseAuthSearch sanitiza o redirect', () => {
    expect(parseAuthSearch({ redirect: '/profile' })).toEqual({ redirect: '/profile' });
    expect(parseAuthSearch({ redirect: '//evil.example' })).toEqual({ redirect: '/' });
    expect(parseAuthSearch({})).toEqual({});
  });

  test('rotas privadas: checkout e perfil (e filhas); catálogo e carrinho são públicos', () => {
    for (const p of ['/checkout', '/checkout/success', '/profile', '/profile/wallets']) expect(isPrivatePath(p)).toBe(true);
    for (const p of ['/', '/cart', '/nft/1', '/auth/login', '/profiles', '/checkouts']) expect(isPrivatePath(p)).toBe(false);
  });
});
