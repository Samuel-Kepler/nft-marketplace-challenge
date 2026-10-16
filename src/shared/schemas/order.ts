import { z } from 'zod';
import { EthStringSchema } from './common';
import { NetworkSchema } from './wallet';

export const OrderStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'DECLINED']);

export const OrderItemSchema = z.object({
  nftId: z.string(),
  editionId: z.string().optional(),
  title: z.string(),
  imageUrl: z.string(),
  price: EthStringSchema,
  quantity: z.number().int().min(1),
  subtotal: EthStringSchema,
});

export const OrderBuyerSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

export const OrderQuoteSchema = z.object({
  subtotal: EthStringSchema,
  discount: EthStringSchema,
  networkFee: EthStringSchema,
  total: EthStringSchema,
  couponCode: z.string().optional(),
});

export const OrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: OrderStatusSchema,
  items: z.array(OrderItemSchema),
  buyer: OrderBuyerSchema,
  quote: OrderQuoteSchema,
  walletId: z.string(),
  network: NetworkSchema,
  transactionHash: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().min(1),
});

export const CreateOrderRequestSchema = z.object({
  items: z.array(
    z.object({
      nftId: z.string(),
      editionId: z.string().optional(),
      quantity: z.number().int().min(1),
    })
  ),
  quoteVersion: z.number().int().min(1),
  couponCode: z.string().optional(),
  walletId: z.string(),
  network: NetworkSchema,
});

export type Order = z.infer<typeof OrderSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
