import { QueryClient } from '@tanstack/react-query';
import { isApiRequestError } from './errors';

/**
 * Política de cache/retry (documentada em ARCHITECTURE.md):
 *  - `staleTime` 0 por padrão (carrinho, cotação, pedidos); o catálogo sobrescreve para 30 s / gc 5 min;
 *  - queries: 1 retentativa, só para falhas transitórias (rede, timeout, 5xx); 4xx nunca é retentado;
 *  - mutations: `retry: 0`. Reenvio é decisão do usuário e reaproveita a chave de idempotência.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => failureCount < 1 && isApiRequestError(error) && error.isTransient,
      },
      mutations: { retry: 0 },
    },
  });
}
