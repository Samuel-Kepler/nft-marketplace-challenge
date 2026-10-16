import { test, expect } from '@playwright/test';
import { parseCatalogSearch, toCatalogFilter, withFilterChange } from '@/features/nfts/search';

test.describe('Estado do catálogo na URL', () => {
  test('valores JSON do router voltam a string (ETH não vira number)', () => {
    expect(parseCatalogSearch({ minPrice: 0.5, maxPrice: '2', search: 123 })).toEqual({
      minPrice: '0.5',
      maxPrice: '2',
      search: '123',
    });
  });

  test('lixo na URL é descartado, não quebra a rota', () => {
    const parsed = parseCatalogSearch({ page: 'abc', sortBy: 'banana', featured: 'yes', limit: 9999, category: '' });
    expect(parsed).toEqual({});
  });

  test('página 1 e limite padrão não poluem a URL', () => {
    expect(parseCatalogSearch({ page: 1, limit: 20 })).toEqual({});
    expect(parseCatalogSearch({ page: 3, limit: 50 })).toEqual({ page: 3, limit: 50 });
  });

  test('toCatalogFilter aplica os padrões da API', () => {
    expect(toCatalogFilter({ search: 'ape' })).toEqual({ search: 'ape', page: 1, limit: 20 });
  });

  test('mudar filtro reinicia a paginação; navegar de página mantém filtros', () => {
    const current = { category: 'art', page: 4 };
    expect(withFilterChange(current, { rarity: 'rare' })).toEqual({ category: 'art', rarity: 'rare' });
    expect(withFilterChange(current, { page: 5 })).toEqual({ category: 'art', page: 5 });
    expect(withFilterChange(current, { page: 1 })).toEqual({ category: 'art' });
  });

  test('filtros são combináveis', () => {
    const next = withFilterChange(withFilterChange({}, { category: 'art' }), { sortBy: 'price-asc', featured: true });
    expect(next).toEqual({ category: 'art', sortBy: 'price-asc', featured: true });
  });
});
