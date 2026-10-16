import { redirect } from '@tanstack/react-router';
import { getSession } from '@/shared/api/session-store';

/** Rotas que exigem sessão (checkout, perfil, carteiras, pedidos). */
const PRIVATE_PREFIXES = ['/checkout', '/profile'];

export const isPrivatePath = (pathname: string): boolean =>
  PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/**
 * Destino pós-login: só caminhos internos. Rejeita `//host`, `/\host` e URLs absolutas
 * (open redirect), voltando ao início.
 */
export function safeRedirect(target: unknown, fallback = '/'): string {
  if (typeof target !== 'string' || !target.startsWith('/')) return fallback;
  if (target.startsWith('//') || target.startsWith('/\\')) return fallback;
  return target;
}

/** `beforeLoad` das rotas privadas: guarda o destino para retomar o fluxo depois do login. */
export function requireAuth({ location }: { location: { href: string } }): void {
  if (!getSession()) {
    throw redirect({ to: '/auth/login', search: { redirect: location.href } });
  }
}

/** `beforeLoad` de login/cadastro: quem já tem sessão segue direto para o destino. */
export function redirectIfAuthenticated({ search }: { search: { redirect?: string } }): void {
  if (getSession()) throw redirect({ href: safeRedirect(search.redirect) });
}

/** `validateSearch` das telas de login/cadastro. */
export const parseAuthSearch = (raw: Record<string, unknown>): { redirect?: string } =>
  typeof raw.redirect === 'string' ? { redirect: safeRedirect(raw.redirect) } : {};
