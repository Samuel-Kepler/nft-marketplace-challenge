import { z } from 'zod';
import { EthStringSchema } from './common';

export const NftEditionSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: EthStringSchema,
  availableQuantity: z.number().int().min(0),
});

export const NftSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  artist: z.string(),
  imageUrl: z.string(),
  gallery: z.array(z.string()),
  price: EthStringSchema,
  availableQuantity: z.number().int().min(0),
  isAvailable: z.boolean(),
  featured: z.boolean(),
  category: z.string(),
  rarity: z.string().optional(),
  editions: z.array(NftEditionSchema).optional(),
  createdAt: z.string(),
  version: z.number().int().min(1),
});

export const CatalogFilterSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  rarity: z.string().optional(),
  minPrice: EthStringSchema.optional(),
  maxPrice: EthStringSchema.optional(),
  featured: z.boolean().optional(),
  sortBy: z.enum(['price-asc', 'price-desc', 'newest', 'oldest']).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const NftListResponseSchema = z.object({
  items: z.array(NftSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

export type Nft = z.infer<typeof NftSchema>;
export type NftEdition = z.infer<typeof NftEditionSchema>;
export type CatalogFilter = z.infer<typeof CatalogFilterSchema>;
export type NftListResponse = z.infer<typeof NftListResponseSchema>;
