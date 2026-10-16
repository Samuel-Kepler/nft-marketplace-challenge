import { SessionSchema, type Session, type User } from '@/shared/schemas/user';

export const SESSION_STORAGE_KEY = 'nft:session';
/** Registro de tentativa de checkout (chave de idempotência); sobrevive à expiração, não ao logout. */
export const CHECKOUT_ATTEMPT_KEY = 'nft:checkout_attempt';

type Listener = () => void;

const listeners = new Set<Listener>();
let lastRaw: string | null | undefined;
let lastSession: Session | null = null;

function read(): Session | null {
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (raw !== lastRaw) {
    lastRaw = raw;
    try {
      const parsed = raw ? SessionSchema.safeParse(JSON.parse(raw)) : null;
      lastSession = parsed?.success ? parsed.data : null;
    } catch {
      lastSession = null;
    }
  }
  return lastSession;
}

const notify = () => listeners.forEach((l) => l());

/** Sessão válida. A expiração usa o relógio da página (`Date.now()`), compatível com `page.clock`. */
export function getSession(): Session | null {
  const session = read();
  return session && Date.parse(session.expiresAt) > Date.now() ? session : null;
}

export const getToken = (): string | null => getSession()?.token ?? null;
export const getUserId = (): string | null => getSession()?.user.id ?? null;

export function setSession(session: Session): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  notify();
}

export function updateSessionUser(user: User): void {
  const session = read();
  if (session) setSession({ ...session, user });
}

export function clearSession(options: { keepCheckoutAttempt?: boolean } = {}): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  if (!options.keepCheckoutAttempt) window.localStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
  notify();
}

/** Assinatura para `useSyncExternalStore`; também reage a mudanças vindas de outra aba. */
export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SESSION_STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
