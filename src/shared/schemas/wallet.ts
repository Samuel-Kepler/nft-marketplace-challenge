import { z } from 'zod';

export const NetworkSchema = z.enum(['ethereum', 'polygon', 'arbitrum', 'optimism']);

export const WalletSchema = z.object({
  id: z.string(),
  userId: z.string(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  network: NetworkSchema,
  isPrimary: z.boolean(),
  label: z.string().optional(),
  isConnected: z.boolean(),
  createdAt: z.string(),
});

export const NETWORK_LABELS: Record<z.infer<typeof NetworkSchema>, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum',
  optimism: 'Optimism',
};

export type Wallet = z.infer<typeof WalletSchema>;
export type Network = z.infer<typeof NetworkSchema>;

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Endereço inválido');

export const CreateWalletRequestSchema = z.object({
  address: AddressSchema,
  network: NetworkSchema,
  label: z.string().max(40).optional(),
  isPrimary: z.boolean().optional(),
});

export const UpdateWalletRequestSchema = z.object({
  address: AddressSchema.optional(),
  network: NetworkSchema.optional(),
  label: z.string().max(40).optional(),
  isPrimary: z.boolean().optional(),
});

export type CreateWalletRequest = z.infer<typeof CreateWalletRequestSchema>;
export type UpdateWalletRequest = z.infer<typeof UpdateWalletRequestSchema>;
