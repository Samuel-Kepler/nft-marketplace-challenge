import { test, expect } from '@playwright/test';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ApiRequestError, toApiRequestError } from '@/shared/api/errors';
import { createQueryClient } from '@/shared/api/query-client';

const config = {} as InternalAxiosRequestConfig;
const withResponse = (status: number, data: unknown) =>
  new AxiosError('falhou', 'ERR_BAD_RESPONSE', config, null, { status, data, statusText: '', headers: {}, config });

test.describe('Normalização de erros HTTP', () => {
  test('envelope da API vira ApiRequestError com code e fields', () => {
    const error = toApiRequestError(
      withResponse(400, { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', fields: { email: 'inválido' } })
    );
    expect(error).toMatchObject({ kind: 'api', status: 400, code: 'VALIDATION_ERROR', fields: { email: 'inválido' } });
    expect(error.isTransient).toBe(false);
  });

  test('sem resposta é falha de rede (transitória)', () => {
    const error = toApiRequestError(new AxiosError('Network Error', 'ERR_NETWORK', config));
    expect(error).toMatchObject({ kind: 'network' });
    expect(error.isTransient).toBe(true);
  });

  test('timeout e cancelamento são distintos', () => {
    expect(toApiRequestError(new AxiosError('t', 'ECONNABORTED', config)).kind).toBe('timeout');
    expect(toApiRequestError(new AxiosError('c', 'ERR_CANCELED', config)).kind).toBe('canceled');
  });

  test('5xx é transitório, 4xx não; corpo fora do envelope usa HTTP_<status>', () => {
    expect(toApiRequestError(withResponse(503, { code: 'UNAVAILABLE', message: 'x' })).isTransient).toBe(true);
    const plain = toApiRequestError(withResponse(404, '<html>'));
    expect(plain).toMatchObject({ status: 404, code: 'HTTP_404' });
    expect(plain.isTransient).toBe(false);
  });

  test('erros já normalizados passam intactos', () => {
    const original = new ApiRequestError('api', 'x', 409, 'CONFLICT');
    expect(toApiRequestError(original)).toBe(original);
  });
});

test.describe('Política de retry do QueryClient', () => {
  const retry = createQueryClient().getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;

  test('retenta uma vez, só falhas transitórias', () => {
    expect(retry(0, new ApiRequestError('network', 'x'))).toBe(true);
    expect(retry(0, new ApiRequestError('api', 'x', 500))).toBe(true);
    expect(retry(1, new ApiRequestError('network', 'x'))).toBe(false);
    expect(retry(0, new ApiRequestError('api', 'x', 404))).toBe(false);
    expect(retry(0, new Error('qualquer'))).toBe(false);
  });

  test('mutations nunca são retentadas automaticamente', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(0);
  });
});
