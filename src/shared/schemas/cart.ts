import { z } from 'zod';
import { EthStringSchema } from './common';

export const CartItemRequestSchema = z.object({
  nftId: z.string(),
  editionId: z.string().optional(),
  quantity: z.number().int().min(1),
});

export const CartLineSchema = z.object({
  key: z.string(),
  nftId: z.string(),
  editionId: z.string().optional(),
  title: z.string(),
  imageUrl: z.string(),
  price: EthStringSchema,
  quantity: z.number().int().min(1),
  maxQuantity: z.number().int().min(0),
  subtotal: EthStringSchema,
});

export const CartSchema = z.object({
  userId: z.string(),
  items: z.array(CartLineSchema),
  updatedAt: z.string(),
});

export const QuoteSchema = z.object({
  lines: z.array(CartLineSchema),
  subtotal: EthStringSchema,
  discount: EthStringSchema,
  networkFee: EthStringSchema,
  total: EthStringSchema,
  couponCode: z.string().optional(),
  isCouponApplied: z.boolean(),
  expiresAt: z.string(),
  version: z.number().int().min(1),
});

export type CartItemRequest = z.infer<typeof CartItemRequestSchema>;
export type CartLine = z.infer<typeof CartLineSchema>;
export type Cart = z.infer<typeof CartSchema>;
export type Quote = z.infer<typeof QuoteSchema>;

export const UpdateCartItemRequestSchema = z.object({
  quantity: z.number().int().min(1),
});

export const QuoteRequestSchema = z.object({
  items: z.array(CartItemRequestSchema),
  couponCode: z.string().optional(),
});

export type UpdateCartItemRequest = z.infer<typeof UpdateCartItemRequestSchema>;
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;
