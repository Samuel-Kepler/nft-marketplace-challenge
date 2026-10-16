import { CHECKOUT_ATTEMPT_KEY, getUserId } from '@/shared/api/session-store';
import { isApiRequestError } from '@/shared/api/errors';
import type { CreateOrderRequest } from '@/shared/schemas/order';
import { hashPayload } from '@/shared/utils/idempotency';

/**
 * Registro da tentativa de checkout (spec §5). Sobrevive a refresh e à expiração de sessão
 * (`endSession({ expired })`), mas é apagado no logout. Pertence a um único usuário.
 */
export interface CheckoutAttempt {
  userId: string;
  key: string;
  payloadHash: string;
  orderId?: string;
}

const isAttempt = (value: unknown): value is CheckoutAttempt => {
  const v = value as Partial<CheckoutAttempt> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.userId === 'string' &&
    typeof v.key === 'string' &&
    typeof v.payloadHash === 'string' &&
    (v.orderId === undefined || typeof v.orderId === 'string')
  );
};

/** Lê a tentativa do usuário atual; registro corrompido ou de outro usuário conta como inexistente. */
export function readAttempt(userId: string | null = getUserId()): CheckoutAttempt | null {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(CHECKOUT_ATTEMPT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isAttempt(parsed) && parsed.userId === userId ? parsed : null;
  } catch {
    return null;
  }
}

const write = (attempt: CheckoutAttempt) =>
  window.localStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(attempt));

export const clearAttempt = (): void => window.localStorage.removeItem(CHECKOUT_ATTEMPT_KEY);

/** Hash do conteúdo que a chave protege: itens (ordenados), carteira, rede, cotação e cupom. */
export function hashOrderRequest(body: CreateOrderRequest): Promise<string> {
  const items = body.items
    .map((i) => ({ nftId: i.nftId, editionId: i.editionId ?? null, quantity: i.quantity }))
    .sort((a, b) => `${a.nftId}:${a.editionId}`.localeCompare(`${b.nftId}:${b.editionId}`));
  return hashPayload({
    items,
    walletId: body.walletId,
    network: body.network,
    quoteVersion: body.quoteVersion,
    couponCode: body.couponCode?.trim().toUpperCase() ?? null,
  });
}

const newKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * Chave para este conteúdo. Mesmo conteúdo ⇒ reaproveita a chave (e o `orderId`, se já conhecido),
 * de modo que reenvio após timeout/refresh recupera o mesmo pedido. Conteúdo diferente (cotação
 * confirmada de novo, outra carteira…) ⇒ chave nova, nunca a mesma chave com outro payload (409).
 */
export async function prepareAttempt(userId: string, body: CreateOrderRequest): Promise<CheckoutAttempt> {
  const payloadHash = await hashOrderRequest(body);
  const current = readAttempt(userId);
  if (current && current.payloadHash === payloadHash) return current;
  const attempt: CheckoutAttempt = { userId, key: newKey(), payloadHash };
  write(attempt);
  return attempt;
}

/** Guarda o pedido devolvido pelo servidor, para recuperação após refresh/reconexão. */
export function rememberOrder(attempt: CheckoutAttempt, orderId: string): CheckoutAttempt {
  const next = { ...attempt, orderId };
  write(next);
  return next;
}

/**
 * Erro que prova que NENHUM pedido foi criado (resposta HTTP do servidor): a chave pode ser
 * descartada. Rede e timeout são ambíguos (o pedido pode existir): a chave é mantida para o replay.
 */
export function failureCreatedNoOrder(error: unknown): boolean {
  return isApiRequestError(error) && error.kind === 'api' && error.status !== undefined;
}

/** Erros que significam "a cotação mudou; revise e confirme de novo". */
export const isQuoteChangedError = (error: unknown): boolean =>
  isApiRequestError(error) && (error.code === 'QUOTE_STALE' || error.code === 'PRICE_CHANGED');
