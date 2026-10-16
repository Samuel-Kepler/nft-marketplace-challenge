import { EthStringSchema } from '@/shared/schemas/common';
import { compareEth } from '@/shared/utils/eth';
import type { Nft, NftEdition } from '@/shared/schemas/nft';
import type { CatalogSearch } from './search';

/** A API não expõe facetas; as opções de filtro acompanham o contrato do catálogo. */
export const CATEGORY_OPTIONS = [
  { value: 'art', label: 'Arte' },
  { value: 'music', label: 'Música' },
  { value: 'photography', label: 'Fotografia' },
  { value: 'collectibles', label: 'Colecionáveis' },
] as const;

export const RARITY_OPTIONS = [
  { value: 'common', label: 'Comum' },
  { value: 'rare', label: 'Raro' },
  { value: 'epic', label: 'Épico' },
  { value: 'legendary', label: 'Lendário' },
] as const;

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigos' },
  { value: 'price-asc', label: 'Menor preço' },
  { value: 'price-desc', label: 'Maior preço' },
] as const;

const labelOf = (options: readonly { value: string; label: string }[], value: string | undefined) =>
  options.find((o) => o.value === value)?.label ?? value ?? '';
export const categoryLabel = (value?: string) => labelOf(CATEGORY_OPTIONS, value);
export const rarityLabel = (value?: string) => labelOf(RARITY_OPTIONS, value);

/** Filtros que o usuário escolheu (página, limite e ordenação não contam como "filtro"). */
export const hasActiveFilters = (search: CatalogSearch): boolean =>
  Boolean(search.search || search.category || search.rarity || search.minPrice || search.maxPrice || search.featured);

/** Remove busca/filtros/ordenação/página de uma vez, mantendo só o limite. */
export const clearedSearch = (search: CatalogSearch): CatalogSearch => (search.limit ? { limit: search.limit } : {});

export type PriceRangeResult =
  | { ok: true; minPrice?: string; maxPrice?: string }
  | { ok: false; field: 'minPrice' | 'maxPrice' | 'range'; message: string };

/** Valida a faixa de preço digitada (aceita vírgula decimal) antes de ir para a URL. */
export function parsePriceRange(minRaw: string, maxRaw: string): PriceRangeResult {
  const normalize = (v: string) => v.trim().replace(',', '.');
  const min = normalize(minRaw);
  const max = normalize(maxRaw);
  if (min && !EthStringSchema.safeParse(min).success) {
    return { ok: false, field: 'minPrice', message: 'Preço mínimo inválido. Use números, ex.: 0.5' };
  }
  if (max && !EthStringSchema.safeParse(max).success) {
    return { ok: false, field: 'maxPrice', message: 'Preço máximo inválido. Use números, ex.: 2' };
  }
  if (min && max && compareEth(min, max) > 0) {
    return { ok: false, field: 'range', message: 'O preço mínimo não pode ser maior que o máximo.' };
  }
  return { ok: true, minPrice: min || undefined, maxPrice: max || undefined };
}

/** Páginas a exibir: primeira, última e vizinhas da atual; `null` marca reticências. */
export function pageWindow(page: number, totalPages: number, radius = 1): (number | null)[] {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - radius; p <= page + radius; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) result.push(null);
    result.push(p);
  });
  return result;
}


// ---------------------------------------------------------------------------------- detalhe

export interface Offer {
  editionId?: string;
  name?: string;
  price: string;
  maxQuantity: number;
}

/** Oferta efetiva: com edições, preço e limite vêm da edição escolhida; sem edições, do NFT. */
export function resolveOffer(nft: Nft, editionId?: string): Offer {
  const edition: NftEdition | undefined = nft.editions?.find((e) => e.id === editionId);
  if (edition) return { editionId: edition.id, name: edition.name, price: edition.price, maxQuantity: edition.availableQuantity };
  return { price: nft.price, maxQuantity: nft.editions?.length ? 0 : nft.availableQuantity };
}

/** Edição inicial: a escolhida (se ainda existir) ou a primeira com estoque. */
export function defaultEditionId(nft: Nft, current?: string): string | undefined {
  if (!nft.editions?.length) return undefined;
  if (current && nft.editions.some((e) => e.id === current)) return current;
  return (nft.editions.find((e) => e.availableQuantity > 0) ?? nft.editions[0])!.id;
}

/** Mantém a quantidade inteira dentro de [1, max] (0 quando não há estoque). */
export function clampQuantity(requested: number, max: number): number {
  if (max <= 0) return 0;
  if (!Number.isFinite(requested)) return 1;
  return Math.min(Math.max(Math.trunc(requested), 1), max);
}
