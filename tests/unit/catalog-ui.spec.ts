import { test, expect } from '@playwright/test';
import {
  clampQuantity,
  clearedSearch,
  defaultEditionId,
  hasActiveFilters,
  pageWindow,
  parsePriceRange,
  resolveOffer,
} from '@/features/nfts/catalog';
import type { Nft } from '@/shared/schemas/nft';

const base: Nft = {
  id: 'nft-x',
  title: 'X',
  description: '',
  artist: 'A',
  imageUrl: '/x.jpg',
  gallery: [],
  price: '0.5',
  availableQuantity: 5,
  isAvailable: true,
  featured: false,
  category: 'art',
  createdAt: '2026-01-01T00:00:00.000Z',
  version: 1,
};

const withEditions: Nft = {
  ...base,
  price: '0.8',
  availableQuantity: 1,
  editions: [
    { id: 'standard', name: 'Standard', price: '0.8', availableQuantity: 0 },
    { id: 'collector', name: 'Collector', price: '1.5', availableQuantity: 1 },
  ],
};

test.describe('Faixa de preço', () => {
  test('aceita vírgula decimal e campos vazios', () => {
    expect(parsePriceRange('0,5', ' 2 ')).toEqual({ ok: true, minPrice: '0.5', maxPrice: '2' });
    expect(parsePriceRange('', '')).toEqual({ ok: true, minPrice: undefined, maxPrice: undefined });
  });

  test('rejeita valor inválido, negativo e mínimo maior que máximo', () => {
    expect(parsePriceRange('abc', '')).toMatchObject({ ok: false, field: 'minPrice' });
    expect(parsePriceRange('', '-1')).toMatchObject({ ok: false, field: 'maxPrice' });
    expect(parsePriceRange('2', '0.5')).toMatchObject({ ok: false, field: 'range' });
  });

  test('compara com precisão decimal (sem float)', () => {
    expect(parsePriceRange('0.3', '0.3')).toMatchObject({ ok: true });
    expect(parsePriceRange('0.30000000000000001', '0.3')).toMatchObject({ ok: false, field: 'range' });
  });
});

test.describe('Filtros ativos', () => {
  test('página, limite e ordenação não contam como filtro', () => {
    expect(hasActiveFilters({ page: 2, limit: 50, sortBy: 'newest' })).toBe(false);
    expect(hasActiveFilters({ category: 'art' })).toBe(true);
    expect(hasActiveFilters({ featured: true })).toBe(true);
  });

  test('limpar mantém só o limite', () => {
    expect(clearedSearch({ category: 'art', page: 3, limit: 50 })).toEqual({ limit: 50 });
    expect(clearedSearch({ category: 'art' })).toEqual({});
  });
});

test.describe('Janela de paginação', () => {
  test('mostra primeira, última e vizinhas com reticências', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(2, 10)).toEqual([1, 2, 3, null, 10]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});

test.describe('Oferta, edição e quantidade', () => {
  test('sem edições usa preço e estoque do NFT', () => {
    expect(resolveOffer(base)).toEqual({ price: '0.5', maxQuantity: 5 });
  });

  test('com edições, preço e limite vêm da edição escolhida', () => {
    expect(resolveOffer(withEditions, 'collector')).toEqual({
      editionId: 'collector',
      name: 'Collector',
      price: '1.5',
      maxQuantity: 1,
    });
    expect(resolveOffer(withEditions, 'standard').maxQuantity).toBe(0);
  });

  test('NFT com edições sem edição válida não oferece estoque', () => {
    expect(resolveOffer(withEditions, 'inexistente').maxQuantity).toBe(0);
  });

  test('edição padrão: a escolhida se existir, senão a primeira com estoque', () => {
    expect(defaultEditionId(base)).toBeUndefined();
    expect(defaultEditionId(withEditions)).toBe('collector');
    expect(defaultEditionId(withEditions, 'standard')).toBe('standard');
    expect(defaultEditionId(withEditions, 'removida')).toBe('collector');
  });

  test('quantidade fica entre 1 e o máximo; zero sem estoque', () => {
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(99, 5)).toBe(5);
    expect(clampQuantity(2.7, 5)).toBe(2);
    expect(clampQuantity(Number.NaN, 5)).toBe(1);
    expect(clampQuantity(3, 0)).toBe(0);
  });
});
