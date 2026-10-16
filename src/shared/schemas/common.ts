import { z } from 'zod';

export const EthStringSchema = z.string().regex(/^\d+(\.\d{1,18})?$/, 'ETH inválido');

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string()).optional(),
  details: z.record(z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
