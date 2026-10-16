import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestData } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import {
  CartSchema,
  QuoteSchema,
  type Cart,
  type CartItemRequest,
} from '@/shared/schemas/cart';
import { useSession } from '@/features/auth/session';

const encodeKey = (key: string) => encodeURIComponent(key);

export const fetchCart = (signal?: AbortSignal) => requestData(CartSchema, { url: '/cart', signal });

export const addCartItem = (item: CartItemRequest) =>
  requestData(CartSchema, { method: 'POST', url: '/cart/items', data: item });

export const setCartItemQuantity = (key: string, quantity: number) =>
  requestData(CartSchema, { method: 'PATCH', url: `/cart/items/${encodeKey(key)}`, data: { quantity } });

export const removeCartItem = (key: string) =>
  requestData(CartSchema, { method: 'DELETE', url: `/cart/items/${encodeKey(key)}` });

export const fetchQuote = (items: CartItemRequest[], couponCode: string | undefined, signal?: AbortSignal) =>
  requestData(QuoteSchema, { method: 'POST', url: '/checkout/quote', data: { items, couponCode }, signal });

export function useCart() {
  const userId = useSession()?.user.id;
  return useQuery({
    queryKey: queryKeys.cart(userId ?? 'guest'),
    queryFn: ({ signal }) => fetchCart(signal),
    enabled: Boolean(userId),
  });
}

/** As mutations devolvem o carrinho completo; a resposta vira o novo estado do cache. */
function useCartMutation<V>(fn: (vars: V) => Promise<Cart>) {
  const queryClient = useQueryClient();
  const userId = useSession()?.user.id;
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart) => {
      if (!userId) return;
      queryClient.setQueryData(queryKeys.cart(userId), cart);
      // Qualquer cotação anterior deixou de refletir o carrinho.
      void queryClient.invalidateQueries({ queryKey: ['quote'] });
    },
  });
}

export const useAddCartItem = () => useCartMutation(addCartItem);
export const useSetCartItemQuantity = () =>
  useCartMutation(({ key, quantity }: { key: string; quantity: number }) => setCartItemQuantity(key, quantity));
export const useRemoveCartItem = () => useCartMutation(removeCartItem);

/**
 * Cotação da API (referência para fechar o pedido). Pública: visitante também cota.
 * A chave inclui itens e cupom, então respostas de uma combinação antiga nunca ocupam a atual.
 */
export function useQuote(items: CartItemRequest[], couponCode?: string) {
  const userId = useSession()?.user.id;
  return useQuery({
    queryKey: queryKeys.quote(userId ?? 'guest', items, couponCode),
    queryFn: ({ signal }) => fetchQuote(items, couponCode, signal),
    enabled: items.length > 0,
    placeholderData: keepPreviousData,
  });
}

export const toQuoteItems = (cart: Cart | undefined): CartItemRequest[] =>
  cart?.items.map(({ nftId, editionId, quantity }) => ({ nftId, ...(editionId && { editionId }), quantity })) ?? [];
