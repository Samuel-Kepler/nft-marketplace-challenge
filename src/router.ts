import type { QueryClient } from '@tanstack/react-query';
import { createRouter, stringifySearchWith } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

/**
 * O parse padrão já devolve `1` como número (o catálogo converte de volta para texto), mas o stringify
 * padrão escreveria a string "1" como `%221%22`. Strings numéricas (ETH, cupom) saem sem aspas.
 */
const NUMERIC = /^-?\d+(\.\d+)?$/;
const stringifySearch = stringifySearchWith(JSON.stringify, (value: string) => {
  if (NUMERIC.test(value)) throw new Error('numérica: manter como texto');
  return JSON.parse(value) as unknown;
});

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    stringifySearch,
    defaultPreload: 'intent',
    // Dados vêm do TanStack Query; o router não mantém cache próprio.
    defaultPreloadStaleTime: 0,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
