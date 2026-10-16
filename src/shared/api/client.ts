import axios, { type AxiosRequestConfig } from 'axios';
import type { z } from 'zod';
import { ApiRequestError, toApiRequestError } from './errors';
import { getToken } from './session-store';

export const SESSION_EXPIRED_EVENT = 'session-expired';

/**
 * Único cliente HTTP. Sem respostas fictícias nem caminhos alternativos: o MSW atende na rede.
 * Só anexa o token e, em 401 de uma requisição autenticada, avisa a aplicação (`session-expired`).
 */
export const http = axios.create({ baseURL: '/api/v1', timeout: 15_000 });

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token && !config.headers.has('Authorization')) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const normalized = toApiRequestError(error);
    const hadToken = Boolean((error as { config?: AxiosRequestConfig })?.config?.headers?.Authorization);
    if (normalized.status === 401 && hadToken) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    return Promise.reject(normalized);
  }
);

/** Executa a requisição e valida o corpo com o schema Zod do contrato. */
export async function request<S extends z.ZodTypeAny>(
  schema: S,
  config: AxiosRequestConfig
): Promise<{ data: z.infer<S>; status: number }> {
  const response = await http.request(config);
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiRequestError('invalid-response', 'Resposta fora do contrato.', response.status, 'INVALID_RESPONSE', undefined, {
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  return { data: parsed.data, status: response.status };
}

export async function requestData<S extends z.ZodTypeAny>(schema: S, config: AxiosRequestConfig): Promise<z.infer<S>> {
  return (await request(schema, config)).data;
}

export async function requestVoid(config: AxiosRequestConfig): Promise<void> {
  await http.request(config);
}
