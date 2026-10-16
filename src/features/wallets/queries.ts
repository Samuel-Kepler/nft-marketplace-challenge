import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requestData } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import {
  WalletSchema,
  type CreateWalletRequest,
  type UpdateWalletRequest,
} from '@/shared/schemas/wallet';
import { useSession } from '@/features/auth/session';

const WalletListSchema = z.array(WalletSchema);

export function useWallets() {
  const userId = useSession()?.user.id;
  return useQuery({
    queryKey: queryKeys.wallets(userId ?? 'guest'),
    queryFn: ({ signal }) => requestData(WalletListSchema, { url: '/wallets', signal }),
    enabled: Boolean(userId),
  });
}

/** Cadastro, edição e (des)conexão mexem em mais de uma carteira (principal/secundária): revalida a lista. */
function useWalletMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  const userId = useSession()?.user.id;
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.wallets(userId) });
    },
  });
}

export const useCreateWallet = () =>
  useWalletMutation((body: CreateWalletRequest) => requestData(WalletSchema, { method: 'POST', url: '/wallets', data: body }));

export const useUpdateWallet = () =>
  useWalletMutation(({ id, patch }: { id: string; patch: UpdateWalletRequest }) =>
    requestData(WalletSchema, { method: 'PATCH', url: `/wallets/${encodeURIComponent(id)}`, data: patch })
  );

export const useConnectWallet = () =>
  useWalletMutation((id: string) => requestData(WalletSchema, { method: 'POST', url: `/wallets/${encodeURIComponent(id)}/connect` }));

export const useDisconnectWallet = () =>
  useWalletMutation((id: string) =>
    requestData(WalletSchema, { method: 'POST', url: `/wallets/${encodeURIComponent(id)}/disconnect` })
  );
