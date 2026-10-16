import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { clearSession, getSession, getToken, setSession, subscribeSession } from '@/shared/api/session-store';
import { clearNotices } from '@/shared/realtime/notices';
import type { LoginRequest, RegisterRequest, Session } from '@/shared/schemas/user';
import * as authApi from './api';

/** Sessão atual, reativa a login/logout/expiração (inclusive vindos de outra aba). */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, getSession, () => null);
}

/**
 * Início de sessão: o cache é descartado por inteiro, para que nada do usuário anterior
 * (ou do visitante) sobreviva à troca. O socket reage à mudança de sessão por conta própria.
 */
export function beginSession(queryClient: QueryClient, session: Session): void {
  queryClient.clear();
  clearNotices();
  setSession(session);
}

/** Fim de sessão. Na expiração o registro da tentativa de checkout é preservado para retomada. */
export function endSession(queryClient: QueryClient, options: { expired?: boolean } = {}): void {
  queryClient.clear();
  clearNotices();
  clearSession({ keepCheckoutAttempt: options.expired });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => authApi.login(body),
    onSuccess: (session) => beginSession(queryClient, session),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterRequest) => authApi.register(body),
    onSuccess: (session) => beginSession(queryClient, session),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    // A sessão local termina na hora (antes da resposta) e mesmo que o servidor falhe:
    // dados privados não podem ficar no cache nem no storage.
    mutationFn: () => {
      const token = getToken();
      endSession(queryClient);
      return authApi.logout(token);
    },
  });
}
