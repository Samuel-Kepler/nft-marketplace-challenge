import { requestData, requestVoid } from '@/shared/api/client';
import { SessionSchema, type LoginRequest, type RegisterRequest } from '@/shared/schemas/user';

export const login = (body: LoginRequest) => requestData(SessionSchema, { method: 'POST', url: '/auth/login', data: body });

export const register = (body: RegisterRequest) =>
  requestData(SessionSchema, { method: 'POST', url: '/auth/register', data: body });

export const fetchSession = (signal?: AbortSignal) => requestData(SessionSchema, { url: '/auth/session', signal });

/** O token é passado explicitamente: o logout local acontece antes da resposta e já o terá removido. */
export const logout = (token: string | null) =>
  requestVoid({ method: 'POST', url: '/auth/logout', ...(token && { headers: { Authorization: `Bearer ${token}` } }) });
