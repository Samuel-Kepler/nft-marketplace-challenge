import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().optional(),
  createdAt: z.string(),
});

export const SessionSchema = z.object({
  user: UserSchema,
  token: z.string(),
  expiresAt: z.string(),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const RegisterRequestSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export type User = z.infer<typeof UserSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const ProfileUpdateRequestSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  avatarUrl: z
    .string()
    .startsWith('data:image/')
    .max(200_000)
    .optional(),
});

export const PasswordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>;
export type PasswordChangeRequest = z.infer<typeof PasswordChangeRequestSchema>;
