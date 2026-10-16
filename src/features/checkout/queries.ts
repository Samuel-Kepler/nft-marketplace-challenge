import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api/query-keys';
import type { CreateOrderRequest } from '@/shared/schemas/order';
import { useSession } from '@/features/auth/session';
import * as api from './api';

/** Estado do pedido. Terminais (`CONFIRMED`/`DECLINED`) não são rebuscados: o evento e o REST concordam. */
export function useOrder(orderId: string | undefined) {
  const userId = useSession()?.user.id;
  return useQuery({
    queryKey: queryKeys.order(userId ?? 'guest', orderId ?? ''),
    queryFn: ({ signal }) => api.fetchOrder(orderId!, signal),
    enabled: Boolean(userId && orderId),
    staleTime: (query) => (query.state.data && query.state.data.status !== 'PENDING' ? Infinity : 0),
    // Rede de segurança: se um `order.updated` se perder sem queda de conexão, o REST resolve o pendente.
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 3000 : false),
  });
}

/**
 * `retry: 0` (padrão das mutations) e sem retentativa automática: quem reenvia é o usuário, com a
 * mesma `idempotencyKey`, e o servidor devolve o mesmo pedido.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  const userId = useSession()?.user.id;
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateOrderRequest; idempotencyKey: string }) =>
      api.createOrder(body, idempotencyKey),
    onSuccess: ({ order }) => {
      if (userId) queryClient.setQueryData(queryKeys.order(userId, order.id), order);
    },
  });
}
