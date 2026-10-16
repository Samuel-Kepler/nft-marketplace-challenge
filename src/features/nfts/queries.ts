import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiRequestError } from '@/shared/api/errors';
import { queryKeys } from '@/shared/api/query-keys';
import { pushNotice } from '@/shared/realtime/notices';
import type { CatalogFilter } from '@/shared/schemas/nft';
import { useSession } from '@/features/auth/session';
import * as api from './api';

const CATALOG_STALE_MS = 30_000;
const CATALOG_GC_MS = 5 * 60_000;

export const nftListOptions = (filter: CatalogFilter) =>
  queryOptions({
    queryKey: queryKeys.nftList(filter),
    queryFn: ({ signal }) => api.fetchNfts(filter, signal),
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_GC_MS,
    // Mantém a página anterior na tela durante a troca de filtro (sem piscar skeleton, sem salto).
    placeholderData: keepPreviousData,
  });

export const nftDetailOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.nftDetail(id),
    queryFn: ({ signal }) => api.fetchNft(id, signal),
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_GC_MS,
    // 404 é resposta definitiva: não retenta e deixa a tela mostrar "NFT não encontrado".
    retry: (count, error) => count < 1 && isApiRequestError(error) && error.isTransient,
  });

export const useNftList = (filter: CatalogFilter) => useQuery(nftListOptions(filter));
export const useNft = (id: string) => useQuery(nftDetailOptions(id));

export function useFavorites() {
  const userId = useSession()?.user.id;
  return useQuery({
    queryKey: queryKeys.favorites(userId ?? 'guest'),
    queryFn: ({ signal }) => api.fetchFavorites(signal),
    enabled: Boolean(userId),
  });
}

/** Atualização otimista com rollback: snapshot → aplica → (erro) restaura + avisa → revalida. */
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const userId = useSession()?.user.id;

  return useMutation({
    mutationFn: ({ nftId, favorite }: { nftId: string; favorite: boolean }) =>
      favorite ? api.addFavorite(nftId) : api.removeFavorite(nftId),
    onMutate: async ({ nftId, favorite }) => {
      if (!userId) return undefined;
      const key = queryKeys.favorites(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<api.Favorites>(key);
      const ids = new Set(previous?.nftIds ?? []);
      if (favorite) ids.add(nftId);
      else ids.delete(nftId);
      queryClient.setQueryData<api.Favorites>(key, { nftIds: [...ids] });
      return { key, previous };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
      pushNotice('error', 'Não foi possível atualizar seus favoritos. A alteração foi desfeita.');
    },
    onSettled: (_data, _error, _vars, context) => {
      if (context) void queryClient.invalidateQueries({ queryKey: context.key });
    },
  });
}
