import { delay, HttpResponse, type HttpResponseResolver } from 'msw';
import { ApiFailure, validationFailure } from '../db/errors';
import type { MockDb } from '../db/db';
import type { StoredUser } from '../fixtures/users';
import { SLOW_NETWORK_LATENCY_MS, VARIABLE_LATENCY_SEQUENCE_MS } from '../scenarios';

export const API_BASE = '*/api/v1';

export interface RouteContext {
  db: MockDb;
  request: Request;
  params: Record<string, string | readonly string[] | undefined>;
  /** Presente quando `auth` foi exigido. */
  user: StoredUser;
  token: string;
  json: () => Promise<Record<string, unknown>>;
}

export interface RouteOptions {
  /** `session`: exige token válido. `private`: idem, e sujeito ao cenário UNAUTHORIZED. */
  auth?: 'session' | 'private';
  /** Rotas do catálogo recebem os cenários NETWORK_ERROR / HTTP_4XX / HTTP_5XX. */
  catalog?: boolean;
  /** Mutations de favoritos recebem o cenário FAVORITES_MUTATION_FAILS. */
  favoritesMutation?: boolean;
  /** Campos devolvidos pelo cenário FORM_VALIDATION_ERROR nesta rota. */
  formErrorFields?: Record<string, string>;
}

export const failureResponse = (failure: ApiFailure) => HttpResponse.json(failure.toBody(), { status: failure.status });

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function latencyFor(db: MockDb): number {
  switch (db.scenario.name) {
    case 'SLOW_NETWORK':
      return SLOW_NETWORK_LATENCY_MS;
    case 'VARIABLE_LATENCY': {
      const ms = VARIABLE_LATENCY_SEQUENCE_MS[db.latencyCounter % VARIABLE_LATENCY_SEQUENCE_MS.length]!;
      db.latencyCounter += 1;
      return ms;
    }
    default:
      return db.config.baseLatencyMs;
  }
}

/**
 * Envolve a regra de negócio de uma rota com latência, cenários e o mapeamento de
 * `ApiFailure` → envelope de erro. Toda a ficção de rede fica aqui, nunca no cliente.
 */
export function route(
  db: MockDb,
  options: RouteOptions,
  handler: (ctx: RouteContext) => Promise<Response> | Response
): HttpResponseResolver {
  return async ({ request, params }) => {
    const ms = latencyFor(db);
    if (ms > 0) await delay(ms);

    const scenario = db.scenario.name;
    try {
      if (options.catalog) {
        if (scenario === 'NETWORK_ERROR' && db.consumeFailure()) return HttpResponse.error();
        if (scenario === 'HTTP_4XX' && db.consumeFailure()) {
          throw new ApiFailure(400, 'BAD_REQUEST', 'Requisição inválida (cenário HTTP_4XX).');
        }
        if (scenario === 'HTTP_5XX' && db.consumeFailure()) {
          throw new ApiFailure(503, 'SERVICE_UNAVAILABLE', 'Serviço indisponível (cenário HTTP_5XX).');
        }
      }
      if (options.favoritesMutation && scenario === 'FAVORITES_MUTATION_FAILS' && db.consumeFailure()) {
        throw new ApiFailure(503, 'SERVICE_UNAVAILABLE', 'Não foi possível atualizar os favoritos.');
      }
      if (options.formErrorFields && scenario === 'FORM_VALIDATION_ERROR' && db.consumeFailure()) {
        throw validationFailure(options.formErrorFields);
      }

      let user: StoredUser | undefined;
      const token = bearerToken(request);
      if (options.auth) {
        // Expiração simulada: a próxima chamada autenticada derruba todas as sessões, uma única vez.
        if (token && db.triggerOnce('SESSION_EXPIRED')) {
          db.revokeAllSessions();
          throw new ApiFailure(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Faça login novamente.');
        }
        user = db.authenticate(token);
        if (options.auth === 'private' && scenario === 'UNAUTHORIZED') {
          throw new ApiFailure(403, 'FORBIDDEN', 'Você não tem permissão para acessar este recurso.');
        }
      }

      return await handler({
        db,
        request,
        params,
        user: user!,
        token: token!,
        json: async () => {
          const body: unknown = await request.clone().json().catch(() => ({}));
          return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
        },
      });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  };
}
