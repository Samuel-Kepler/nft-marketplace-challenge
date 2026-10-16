import { isAxiosError } from 'axios';
import { ApiErrorSchema } from '@/shared/schemas/common';

export type ApiErrorKind = 'api' | 'network' | 'timeout' | 'invalid-response' | 'canceled';

/** Erro único exposto pela camada HTTP: transporte, contrato e domínio chegam no mesmo formato. */
export class ApiRequestError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly code: string = kind.toUpperCase(),
    readonly fields?: Record<string, string>,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Falha transitória: vale retentar um GET (rede, timeout, 5xx). */
  get isTransient(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || (this.status !== undefined && this.status >= 500);
  }
}

export const isApiRequestError = (e: unknown): e is ApiRequestError => e instanceof ApiRequestError;

export function toApiRequestError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (isAxiosError(error)) {
    if (error.code === 'ERR_CANCELED') return new ApiRequestError('canceled', 'Requisição cancelada.');
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiRequestError('timeout', 'A requisição demorou demais.');
    }
    if (!error.response) return new ApiRequestError('network', 'Sem conexão com o servidor.');
    const body = ApiErrorSchema.safeParse(error.response.data);
    const status = error.response.status;
    if (body.success) {
      return new ApiRequestError('api', body.data.message, status, body.data.code, body.data.fields, body.data.details);
    }
    return new ApiRequestError('api', error.message, status, `HTTP_${status}`);
  }
  return new ApiRequestError('invalid-response', error instanceof Error ? error.message : 'Erro inesperado.');
}
