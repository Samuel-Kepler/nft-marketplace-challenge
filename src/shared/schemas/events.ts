import { z } from 'zod';
import { EthStringSchema } from './common';
import { OrderStatusSchema } from './order';

export const SOCKET_EVENTS = {
  nftUpdated: 'nft.updated',
  orderUpdated: 'order.updated',
} as const;

export const NftUpdatedEventSchema = z.object({
  eventId: z.string(),
  resource: z.literal('nft'),
  id: z.string(),
  version: z.number().int().min(1),
  price: EthStringSchema,
  availableQuantity: z.number().int().min(0),
  isAvailable: z.boolean(),
  editions: z
    .array(
      z.object({
        id: z.string(),
        price: EthStringSchema,
        availableQuantity: z.number().int().min(0),
      })
    )
    .optional(),
  timestamp: z.string(),
});

export const OrderUpdatedEventSchema = z.object({
  eventId: z.string(),
  resource: z.literal('order'),
  id: z.string(),
  userId: z.string(),
  version: z.number().int().min(1),
  status: OrderStatusSchema,
  transactionHash: z.string().optional(),
  errorMessage: z.string().optional(),
  timestamp: z.string(),
});

export type NftUpdatedEvent = z.infer<typeof NftUpdatedEventSchema>;
export type OrderUpdatedEvent = z.infer<typeof OrderUpdatedEventSchema>;

/** Caminho do engine.io; compartilhado entre o `socket.io-client` e o servidor simulado. */
export const SOCKET_PATH = '/socket.io/';
export const DEFAULT_SOCKET_URL = 'ws://mock.socket.local';
