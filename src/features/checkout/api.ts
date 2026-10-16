import { request, requestData } from '@/shared/api/client';
import { OrderSchema, type CreateOrderRequest, type Order } from '@/shared/schemas/order';

/**
 * Criação idempotente. `replayed` indica que o servidor devolveu um pedido já criado com a mesma
 * chave (200) em vez de criar outro (201).
 */
export async function createOrder(
  body: CreateOrderRequest,
  idempotencyKey: string
): Promise<{ order: Order; replayed: boolean }> {
  const { data, status } = await request(OrderSchema, {
    method: 'POST',
    url: '/orders',
    data: body,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return { order: data, replayed: status === 200 };
}

export const fetchOrder = (id: string, signal?: AbortSignal) =>
  requestData(OrderSchema, { url: `/orders/${encodeURIComponent(id)}`, signal });
