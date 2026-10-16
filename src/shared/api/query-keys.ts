import type { CartItemRequest } from '@/shared/schemas/cart';
import type { CatalogFilter } from '@/shared/schemas/nft';

/** Chaves privadas incluem o `userId`: cache nunca é compartilhado entre usuários. */
export const queryKeys = {
  session: () => ['session'] as const,
  nfts: () => ['nfts'] as const,
  nftList: (filter: CatalogFilter) => ['nfts', 'list', filter] as const,
  nftDetail: (id: string) => ['nfts', 'detail', id] as const,
  favorites: (userId: string) => ['favorites', userId] as const,
  cart: (userId: string) => ['cart', userId] as const,
  quote: (scope: string, items: CartItemRequest[], couponCode?: string) =>
    ['quote', scope, items, couponCode ?? null] as const,
  order: (userId: string, id: string) => ['orders', userId, id] as const,
  profile: (userId: string) => ['profile', userId] as const,
  wallets: (userId: string) => ['wallets', userId] as const,
};
