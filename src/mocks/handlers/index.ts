import { http, HttpResponse, type RequestHandler } from 'msw';
import { z } from 'zod';
import {
  CartItemRequestSchema,
  QuoteRequestSchema,
  UpdateCartItemRequestSchema,
} from '@/shared/schemas/cart';
import { CatalogFilterSchema } from '@/shared/schemas/nft';
import { CreateOrderRequestSchema } from '@/shared/schemas/order';
import {
  LoginRequestSchema,
  PasswordChangeRequestSchema,
  ProfileUpdateRequestSchema,
  RegisterRequestSchema,
} from '@/shared/schemas/user';
import { CreateWalletRequestSchema, UpdateWalletRequestSchema } from '@/shared/schemas/wallet';
import type { MockDb } from '../db/db';
import { ApiFailure, validationFailure, zodFields } from '../db/errors';
import { isScenarioName, SCENARIO_NAMES } from '../scenarios';
import type { SocketControl } from '../socket/hub';
import { API_BASE, route } from './route';

function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) throw validationFailure(zodFields(result.error.issues));
  return result.data;
}

/** Querystring → filtro tipado (page/limit/featured chegam como string). */
function parseCatalogQuery(url: URL) {
  const raw: Record<string, unknown> = {};
  url.searchParams.forEach((value, key) => {
    if (value === '') return;
    if (key === 'page' || key === 'limit') raw[key] = Number(value);
    else if (key === 'featured') raw[key] = value === 'true' ? true : value === 'false' ? false : value;
    else raw[key] = value;
  });
  return parseBody(CatalogFilterSchema, raw);
}

const param = (value: string | readonly string[] | undefined) => (Array.isArray(value) ? value[0]! : (value as string));

/** Handlers REST (`/api/v1`) e endpoints de controle (`/api/v1/mock/*`) sobre um `MockDb`. */
export function createHandlers(db: MockDb, socket?: SocketControl): RequestHandler[] {
  const json = HttpResponse.json.bind(HttpResponse);

  return [
    // ------------------------------------------------------------------ sessão e conta
    http.post(
      `${API_BASE}/auth/register`,
      route(
        db,
        { formErrorFields: { email: 'E-mail inválido (cenário FORM_VALIDATION_ERROR).' } },
        async (ctx) => {
          const body = parseBody(RegisterRequestSchema, await ctx.json());
          const session = await db.register(body.name, body.email, body.password, db.scenario.name === 'REGISTER_CONFLICT');
          return json(session, { status: 201 });
        }
      )
    ),
    http.post(
      `${API_BASE}/auth/login`,
      route(db, {}, async (ctx) => {
        const body = parseBody(LoginRequestSchema, await ctx.json());
        return json(await db.login(body.email, body.password));
      })
    ),
    http.get(
      `${API_BASE}/auth/session`,
      route(db, { auth: 'session' }, ({ user, token }) => json(db.sessionFor(token, user)))
    ),
    http.post(
      `${API_BASE}/auth/logout`,
      route(db, { auth: 'session' }, ({ token }) => {
        db.logout(token);
        return new HttpResponse(null, { status: 204 });
      })
    ),

    // ------------------------------------------------------------------ catálogo
    http.get(
      `${API_BASE}/nfts`,
      route(db, { catalog: true }, ({ request }) => {
        const filter = parseCatalogQuery(new URL(request.url));
        if (db.scenario.name === 'EMPTY_RESULTS') {
          return json({ items: [], total: 0, page: filter.page, limit: filter.limit, totalPages: 1 });
        }
        return json(db.listNfts(filter));
      })
    ),
    http.get(
      `${API_BASE}/nfts/:id`,
      route(db, { catalog: true }, ({ params }) => json(db.getNft(param(params.id))))
    ),

    // ------------------------------------------------------------------ favoritos
    http.get(
      `${API_BASE}/favorites`,
      route(db, { auth: 'private' }, ({ user }) => json({ nftIds: db.getFavorites(user.id) }))
    ),
    http.post(
      `${API_BASE}/favorites`,
      route(db, { auth: 'private', favoritesMutation: true }, async (ctx) => {
        const { nftId } = parseBody(z.object({ nftId: z.string() }), await ctx.json());
        return json({ nftIds: db.addFavorite(ctx.user.id, nftId) }, { status: 201 });
      })
    ),
    http.delete(
      `${API_BASE}/favorites/:nftId`,
      route(db, { auth: 'private', favoritesMutation: true }, ({ user, params }) =>
        json({ nftIds: db.removeFavorite(user.id, param(params.nftId)) })
      )
    ),

    // ------------------------------------------------------------------ carrinho
    http.get(
      `${API_BASE}/cart`,
      route(db, { auth: 'private' }, ({ user }) => json(db.getCart(user.id)))
    ),
    http.post(
      `${API_BASE}/cart/items`,
      route(db, { auth: 'private' }, async (ctx) => {
        const body = parseBody(CartItemRequestSchema, await ctx.json());
        return json(db.addCartItem(ctx.user.id, body), { status: 201 });
      })
    ),
    http.patch(
      `${API_BASE}/cart/items/:key`,
      route(db, { auth: 'private' }, async (ctx) => {
        const body = parseBody(UpdateCartItemRequestSchema, await ctx.json());
        return json(db.setCartItem(ctx.user.id, decodeURIComponent(param(ctx.params.key)), body.quantity));
      })
    ),
    http.delete(
      `${API_BASE}/cart/items/:key`,
      route(db, { auth: 'private' }, ({ user, params }) =>
        json(db.removeCartItem(user.id, decodeURIComponent(param(params.key))))
      )
    ),

    // ------------------------------------------------------------------ cotação (pública)
    http.post(
      `${API_BASE}/checkout/quote`,
      route(db, {}, async (ctx) => {
        const body = parseBody(QuoteRequestSchema, await ctx.json());
        return json(db.buildQuote(body.items, body.couponCode));
      })
    ),

    // ------------------------------------------------------------------ pedidos
    http.post(
      `${API_BASE}/orders`,
      route(db, { auth: 'private' }, async (ctx) => {
        const key = ctx.request.headers.get('idempotency-key')?.trim();
        if (!key) throw new ApiFailure(400, 'MISSING_IDEMPOTENCY_KEY', 'Cabeçalho Idempotency-Key obrigatório.');
        const body = parseBody(CreateOrderRequestSchema, await ctx.json());
        const { order, replay } = await db.createOrder(ctx.user, key, body);
        // O pedido já foi persistido; a resposta é derrubada para forçar a recuperação por idempotência.
        if (!replay && db.scenario.name === 'ORDER_TIMEOUT_AFTER_CREATE') return HttpResponse.error();
        return json(order, {
          status: replay ? 200 : 201,
          headers: replay ? { 'Idempotent-Replayed': 'true' } : undefined,
        });
      })
    ),
    http.get(
      `${API_BASE}/orders/:id`,
      route(db, { auth: 'private' }, ({ user, params }) => json(db.getOrder(user.id, param(params.id))))
    ),

    // ------------------------------------------------------------------ perfil
    http.get(
      `${API_BASE}/profile`,
      route(db, { auth: 'private' }, ({ user, token }) => json(db.sessionFor(token, user).user))
    ),
    http.patch(
      `${API_BASE}/profile`,
      route(db, { auth: 'private', formErrorFields: { name: 'Nome inválido (cenário FORM_VALIDATION_ERROR).' } }, async (ctx) => {
        const body = parseBody(ProfileUpdateRequestSchema, await ctx.json());
        return json(db.updateProfile(ctx.user.id, body));
      })
    ),
    http.patch(
      `${API_BASE}/profile/password`,
      route(
        db,
        { auth: 'private', formErrorFields: { newPassword: 'Senha inválida (cenário FORM_VALIDATION_ERROR).' } },
        async (ctx) => {
          const body = parseBody(PasswordChangeRequestSchema, await ctx.json());
          await db.changePassword(ctx.user.id, body);
          return new HttpResponse(null, { status: 204 });
        }
      )
    ),

    // ------------------------------------------------------------------ carteiras
    http.get(
      `${API_BASE}/wallets`,
      route(db, { auth: 'private' }, ({ user }) => json(db.listWallets(user.id)))
    ),
    http.post(
      `${API_BASE}/wallets`,
      route(db, { auth: 'private', formErrorFields: { address: 'Endereço inválido (cenário FORM_VALIDATION_ERROR).' } }, async (ctx) => {
        const body = parseBody(CreateWalletRequestSchema, await ctx.json());
        return json(db.createWallet(ctx.user.id, body), { status: 201 });
      })
    ),
    http.patch(
      `${API_BASE}/wallets/:id`,
      route(db, { auth: 'private', formErrorFields: { address: 'Endereço inválido (cenário FORM_VALIDATION_ERROR).' } }, async (ctx) => {
        const body = parseBody(UpdateWalletRequestSchema, await ctx.json());
        return json(db.updateWallet(ctx.user.id, param(ctx.params.id), body));
      })
    ),
    http.post(
      `${API_BASE}/wallets/:id/connect`,
      route(db, { auth: 'private' }, ({ user, params }) => {
        if (db.scenario.name === 'WALLET_REFUSED') {
          throw new ApiFailure(403, 'WALLET_CONNECTION_REFUSED', 'A conexão com a carteira foi recusada.');
        }
        return json(db.setWalletConnection(user.id, param(params.id), true));
      })
    ),
    http.post(
      `${API_BASE}/wallets/:id/disconnect`,
      route(db, { auth: 'private' }, ({ user, params }) =>
        json(db.setWalletConnection(user.id, param(params.id), false))
      )
    ),

    ...createControlHandlers(db, socket),
  ];
}

/** Endpoints de controle: sem latência, sem cenários, sem autenticação (só existem com mocks ativos). */
function createControlHandlers(db: MockDb, socket?: SocketControl): RequestHandler[] {
  const guarded = (fn: (ctx: { request: Request; params: Record<string, string | readonly string[] | undefined> }) => Response | Promise<Response>) =>
    async (ctx: Parameters<Parameters<typeof http.get>[1]>[0]) => {
      try {
        return await fn(ctx);
      } catch (error) {
        if (error instanceof ApiFailure) return HttpResponse.json(error.toBody(), { status: error.status });
        throw error;
      }
    };
  const readJson = (request: Request) => request.json().catch(() => ({})) as Promise<Record<string, unknown>>;

  return [
    http.post(
      `${API_BASE}/mock/reset`,
      guarded(() => {
        db.reset();
        socket?.restore();
        return new HttpResponse(null, { status: 204 });
      })
    ),
    http.get(
      `${API_BASE}/mock/scenario`,
      guarded(() => HttpResponse.json({ ...db.scenario, available: SCENARIO_NAMES }))
    ),
    http.post(
      `${API_BASE}/mock/scenario`,
      guarded(async ({ request }) => {
        const { name, failures } = await readJson(request);
        if (!isScenarioName(name)) throw validationFailure({ name: `Cenário desconhecido. Use: ${SCENARIO_NAMES.join(', ')}` });
        if (failures !== undefined && (!Number.isInteger(failures) || (failures as number) < 0)) {
          throw validationFailure({ failures: 'Informe um inteiro ≥ 0.' });
        }
        return HttpResponse.json(db.setScenario(name, failures as number | undefined));
      })
    ),
    http.post(
      `${API_BASE}/mock/nfts/:id`,
      guarded(async ({ request, params }) => {
        const body = parseBody(
          z.object({
            price: z.string().optional(),
            availableQuantity: z.number().optional(),
            editions: z
              .array(z.object({ id: z.string(), price: z.string().optional(), availableQuantity: z.number().optional() }))
              .optional(),
          }),
          await readJson(request)
        );
        return HttpResponse.json(db.updateNft(param(params.id), body));
      })
    ),
    http.post(
      `${API_BASE}/mock/orders/:id/resolve`,
      guarded(async ({ request, params }) => {
        const { status } = parseBody(z.object({ status: z.enum(['CONFIRMED', 'DECLINED']) }), await readJson(request));
        const order = db.resolveOrder(param(params.id), status);
        if (!order) throw new ApiFailure(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado.');
        return HttpResponse.json(order);
      })
    ),
    http.post(
      `${API_BASE}/mock/socket/drop`,
      guarded(() => {
        socket?.drop();
        return new HttpResponse(null, { status: 204 });
      })
    ),
    http.post(
      `${API_BASE}/mock/socket/restore`,
      guarded(() => {
        socket?.restore();
        return new HttpResponse(null, { status: 204 });
      })
    ),
    http.post(
      `${API_BASE}/mock/socket/replay`,
      guarded(async ({ request }) => {
        const { kind, type } = parseBody(
          z.object({
            kind: z.enum(['duplicate', 'stale']),
            type: z.enum(['nft.updated', 'order.updated']).default('nft.updated'),
          }),
          await readJson(request)
        );
        return HttpResponse.json(db.replayLast(kind, type));
      })
    ),
  ];
}
