import { z } from 'zod';
import { CatalogFilterSchema, type CatalogFilter } from '@/shared/schemas/nft';

const DEFAULT_LIMIT = 20;

/** Estado do catálogo na URL: só o que foi escolhido (página 1 e limite padrão ficam fora). */
export type CatalogSearch = Omit<CatalogFilter, 'page' | 'limit'> & { page?: number; limit?: number };

/** O router faz `JSON.parse` dos valores da URL: `minPrice=0.5` chega como número; ETH volta a string. */
const text = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .optional()
  .catch(undefined);

const SearchSchema = z.object({
  search: text,
  category: text,
  rarity: text,
  minPrice: text,
  maxPrice: text,
  featured: z.boolean().optional().catch(undefined),
  sortBy: CatalogFilterSchema.shape.sortBy.catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
});

/** `validateSearch` do catálogo: tolerante a lixo na URL (descarta o campo) e sem campos vazios. */
export function parseCatalogSearch(raw: Record<string, unknown>): CatalogSearch {
  const parsed = SearchSchema.parse(raw);
  if (parsed.page === 1) delete parsed.page;
  if (parsed.limit === DEFAULT_LIMIT) delete parsed.limit;
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined && v !== '')) as CatalogSearch;
}

/** Filtro completo (com padrões) a enviar à API. */
export const toCatalogFilter = (search: CatalogSearch): CatalogFilter => CatalogFilterSchema.parse(search);

/** Mudança de filtro/busca/ordenação reinicia a paginação; navegar de página mantém o resto. */
export function withFilterChange(current: CatalogSearch, patch: Partial<CatalogFilter>): CatalogSearch {
  const next: CatalogSearch = { ...current, ...patch };
  if (!('page' in patch) || next.page === 1) delete next.page;
  return next;
}
