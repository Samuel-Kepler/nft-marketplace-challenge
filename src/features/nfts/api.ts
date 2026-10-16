import { z } from 'zod';
import { requestData } from '@/shared/api/client';
import { NftListResponseSchema, NftSchema, type CatalogFilter } from '@/shared/schemas/nft';

export const FavoritesSchema = z.object({ nftIds: z.array(z.string()) });
export type Favorites = z.infer<typeof FavoritesSchema>;

/** Só envia o que foi definido; `signal` permite descartar respostas obsoletas. */
export const fetchNfts = (filter: CatalogFilter, signal?: AbortSignal) =>
  requestData(NftListResponseSchema, { url: '/nfts', params: filter, signal });

export const fetchNft = (id: string, signal?: AbortSignal) =>
  requestData(NftSchema, { url: `/nfts/${encodeURIComponent(id)}`, signal });

export const fetchFavorites = (signal?: AbortSignal) => requestData(FavoritesSchema, { url: '/favorites', signal });

export const addFavorite = (nftId: string) =>
  requestData(FavoritesSchema, { method: 'POST', url: '/favorites', data: { nftId } });

export const removeFavorite = (nftId: string) =>
  requestData(FavoritesSchema, { method: 'DELETE', url: `/favorites/${encodeURIComponent(nftId)}` });
