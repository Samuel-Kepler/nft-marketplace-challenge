import type { Cart, CartItemRequest, CartLine, Quote } from '@/shared/schemas/cart';
import type { NftUpdatedEvent, OrderUpdatedEvent } from '@/shared/schemas/events';
import type { CatalogFilter, Nft, NftListResponse } from '@/shared/schemas/nft';
import type { CreateOrderRequest, Order } from '@/shared/schemas/order';
import type { PasswordChangeRequest, ProfileUpdateRequest, Session, User } from '@/shared/schemas/user';
import type { CreateWalletRequest, UpdateWalletRequest, Wallet } from '@/shared/schemas/wallet';
import { addEth, compareEth, ethToWei, mulEth, weiToEth } from '@/shared/utils/eth';
import { hashPayload } from '@/shared/utils/idempotency';
import { COUPONS, NETWORK_FEE_ETH, ORDER_RESOLVE_DELAY_MS, QUOTE_TTL_MS, SESSION_TTL_MS } from '../fixtures/coupons';
import { createNfts } from '../fixtures/nfts';
import { createFavorites, createUsers, createWallets, type StoredUser } from '../fixtures/users';
import { initialScenario, type ScenarioName, type ScenarioState } from '../scenarios';
import { ApiFailure, validationFailure } from './errors';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem = (key: string) => this.map.get(key) ?? null;
  setItem = (key: string, value: string) => void this.map.set(key, value);
  removeItem = (key: string) => void this.map.delete(key);
}

export type DbEvent =
  | { type: 'nft.updated'; payload: NftUpdatedEvent }
  | { type: 'order.updated'; payload: OrderUpdatedEvent };

interface SessionRecord {
  userId: string;
  expiresAt: number;
}

interface IdempotencyRecord {
  hash: string;
  orderId: string;
}

interface DbState {
  users: StoredUser[];
  sessions: Record<string, SessionRecord>;
  nfts: Nft[];
  carts: Record<string, CartItemRequest[]>;
  favorites: Record<string, string[]>;
  wallets: Wallet[];
  orders: Order[];
  /** Chave `${userId}:${Idempotency-Key}`. */
  idempotency: Record<string, IdempotencyRecord>;
  eventSeq: number;
  idSeq: number;
  scenario: ScenarioState;
}

export interface MockDbOptions {
  storage?: StorageLike;
  storageKey?: string;
  now?: () => number;
  /** Atraso base (ms) aplicado pelos handlers REST; 0 desliga. */
  baseLatencyMs?: number;
  orderResolveDelayMs?: number;
}

export interface NftPatch {
  price?: string;
  availableQuantity?: number;
  editions?: { id: string; price?: string; availableQuantity?: number }[];
}

const SCHEMA_VERSION = 1;
const HISTORY_LIMIT = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ETH_RE = /^\d+(\.\d{1,18})?$/;

export const lineKey = (nftId: string, editionId?: string | null) => (editionId ? `${nftId}:${editionId}` : nftId);

export async function hashPassword(salt: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash de transação simulado e determinístico (64 hex). */
export function fakeTxHash(orderId: string): string {
  let h = 0x811c9dc5;
  let out = '';
  for (let round = 0; out.length < 64; round++) {
    for (const ch of `${orderId}:${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return `0x${out.slice(0, 64)}`;
}

const toPublicUser = ({ id, email, name, avatarUrl, createdAt }: StoredUser): User => ({
  id,
  email,
  name,
  createdAt,
  ...(avatarUrl && { avatarUrl }),
});

/**
 * Fonte única de verdade dos mocks. REST (handlers MSW) e eventos Socket.IO leem e
 * escrevem aqui, então os dois canais nunca divergem.
 */
export class MockDb {
  readonly config: { baseLatencyMs: number; orderResolveDelayMs: number };
  private state: DbState;
  private readonly storage: StorageLike;
  private readonly storageKey: string;
  private readonly now: () => number;
  private readonly listeners = new Set<(event: DbEvent) => void>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly history: DbEvent[] = [];
  /** Contador de requisições (cenário VARIABLE_LATENCY); não persistido. */
  latencyCounter = 0;

  constructor(options: MockDbOptions = {}) {
    this.storage = options.storage ?? new MemoryStorage();
    this.storageKey = options.storageKey ?? 'nft:mock_db';
    this.now = options.now ?? (() => Date.now());
    this.config = {
      baseLatencyMs: options.baseLatencyMs ?? 40,
      orderResolveDelayMs: options.orderResolveDelayMs ?? ORDER_RESOLVE_DELAY_MS,
    };
    this.state = this.load() ?? this.seed();
  }

  // ---------------------------------------------------------------- persistência

  private seed(): DbState {
    return {
      users: createUsers(),
      sessions: {},
      nfts: createNfts(),
      carts: {},
      favorites: createFavorites(),
      wallets: createWallets(),
      orders: [],
      idempotency: {},
      eventSeq: 0,
      // Começa acima dos ids dos fixtures (user-1, wallet-1…) para nunca colidir com eles.
      idSeq: 1000,
      scenario: initialScenario(),
    };
  }

  private load(): DbState | null {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { v: number; state: DbState };
      return parsed.v === SCHEMA_VERSION ? parsed.state : null;
    } catch {
      return null;
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify({ v: SCHEMA_VERSION, state: this.state }));
    } catch {
      // Quota excedida: o estado em memória continua válido para a sessão da página.
    }
  }

  /** Restaura integralmente o cenário conhecido (fixtures + cenário DEFAULT). */
  reset(): void {
    this.clearTimers();
    this.history.length = 0;
    this.latencyCounter = 0;
    this.state = this.seed();
    this.persist();
  }

  dispose(): void {
    this.clearTimers();
    this.listeners.clear();
  }

  private clearTimers(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }

  private nextId(prefix: string): string {
    this.state.idSeq += 1;
    return `${prefix}-${this.state.idSeq}`;
  }

  // ---------------------------------------------------------------- eventos

  subscribe(listener: (event: DbEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: DbEvent): void {
    this.history.push(event);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.listeners.forEach((l) => l(event));
  }

  private nextEventId(): string {
    this.state.eventSeq += 1;
    return `evt-${this.state.eventSeq}`;
  }

  lastEvent(type: DbEvent['type']): DbEvent | undefined {
    return [...this.history].reverse().find((e) => e.type === type);
  }

  /** Reenvia uma cópia: `duplicate` (mesmo eventId) ou `stale` (versão anterior, preço sentinela). */
  replayLast(kind: 'duplicate' | 'stale', type: DbEvent['type'] = 'nft.updated'): DbEvent {
    const last = this.lastEvent(type);
    if (!last) throw new ApiFailure(409, 'NO_EVENT_TO_REPLAY', 'Nenhum evento emitido ainda.');
    if (kind === 'duplicate') {
      this.listeners.forEach((l) => l(last));
      return last;
    }
    const version = Math.max(1, last.payload.version - 1);
    const stale: DbEvent =
      last.type === 'nft.updated'
        ? { type: 'nft.updated', payload: { ...last.payload, eventId: this.nextEventId(), version, price: '999' } }
        : { type: 'order.updated', payload: { ...last.payload, eventId: this.nextEventId(), version, status: 'PENDING' } };
    this.persist();
    this.listeners.forEach((l) => l(stale));
    return stale;
  }

  // ---------------------------------------------------------------- cenário

  get scenario(): ScenarioState {
    return this.state.scenario;
  }

  setScenario(name: ScenarioName, failures?: number): ScenarioState {
    this.state.scenario = initialScenario(name, failures);
    this.latencyCounter = 0;
    this.persist();
    return this.state.scenario;
  }

  /** Consome uma falha do cenário de falha ativo; `false` quando o orçamento de falhas acabou. */
  consumeFailure(): boolean {
    const s = this.state.scenario;
    if (s.remainingFailures === undefined) return true;
    if (s.remainingFailures <= 0) return false;
    s.remainingFailures -= 1;
    this.persist();
    return true;
  }

  /** Marca um cenário de efeito único como disparado; retorna `true` só na primeira vez. */
  triggerOnce(name: ScenarioName): boolean {
    const s = this.state.scenario;
    if (s.name !== name || s.triggered) return false;
    s.triggered = true;
    this.persist();
    return true;
  }

  // ---------------------------------------------------------------- sessão e conta

  private validateCredentialsShape(name: string | undefined, email: string, password: string) {
    const fields: Record<string, string> = {};
    if (name !== undefined && name.trim().length < 2) fields.name = 'Informe o nome completo.';
    if (!EMAIL_RE.test(email)) fields.email = 'E-mail inválido.';
    if (password.length < 6) fields.password = 'A senha deve ter ao menos 6 caracteres.';
    if (Object.keys(fields).length) throw validationFailure(fields);
  }

  async register(name: string, email: string, password: string, forceConflict = false): Promise<Session> {
    this.validateCredentialsShape(name, email, password);
    const normalized = email.trim().toLowerCase();
    if (forceConflict || this.state.users.some((u) => u.email.toLowerCase() === normalized)) {
      throw new ApiFailure(409, 'EMAIL_TAKEN', 'Este e-mail já está cadastrado.', {
        email: 'Este e-mail já está cadastrado.',
      });
    }
    const salt = `salt-${this.nextId('s')}`;
    const user: StoredUser = {
      id: this.nextId('user'),
      email: normalized,
      name: name.trim(),
      createdAt: new Date(this.now()).toISOString(),
      salt,
      passwordHash: await hashPassword(salt, password),
    };
    this.state.users.push(user);
    this.state.favorites[user.id] = [];
    return this.createSession(user);
  }

  async login(email: string, password: string): Promise<Session> {
    const user = this.state.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    const ok = user && (await hashPassword(user.salt, password)) === user.passwordHash;
    if (!user || !ok) throw new ApiFailure(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
    return this.createSession(user);
  }

  private createSession(user: StoredUser): Session {
    const token = `tok_${crypto.randomUUID()}`;
    const expiresAt = this.now() + SESSION_TTL_MS;
    this.state.sessions[token] = { userId: user.id, expiresAt };
    this.persist();
    return { user: toPublicUser(user), token, expiresAt: new Date(expiresAt).toISOString() };
  }

  /** Resolve o token em usuário; expirado/ausente → 401. */
  authenticate(token: string | null): StoredUser {
    if (!token) throw new ApiFailure(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
    const record = this.state.sessions[token];
    if (!record) throw new ApiFailure(401, 'UNAUTHENTICATED', 'Sessão inválida.');
    if (this.now() >= record.expiresAt) {
      delete this.state.sessions[token];
      this.persist();
      throw new ApiFailure(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Faça login novamente.');
    }
    const user = this.state.users.find((u) => u.id === record.userId);
    if (!user) throw new ApiFailure(401, 'UNAUTHENTICATED', 'Sessão inválida.');
    return user;
  }

  /** Usuário dono do token, sem lançar (usado para rotear eventos privados do socket). */
  userIdForToken(token: unknown): string | null {
    if (typeof token !== 'string') return null;
    const record = this.state.sessions[token];
    return record && this.now() < record.expiresAt ? record.userId : null;
  }

  sessionFor(token: string, user: StoredUser): Session {
    return {
      user: toPublicUser(user),
      token,
      expiresAt: new Date(this.state.sessions[token]!.expiresAt).toISOString(),
    };
  }

  logout(token: string): void {
    delete this.state.sessions[token];
    this.persist();
  }

  revokeAllSessions(): void {
    this.state.sessions = {};
    this.persist();
  }

  // ---------------------------------------------------------------- catálogo

  getNft(id: string): Nft {
    const nft = this.state.nfts.find((n) => n.id === id);
    if (!nft) throw new ApiFailure(404, 'NFT_NOT_FOUND', 'NFT não encontrado.');
    return structuredClone(nft);
  }

  listNfts(filter: CatalogFilter): NftListResponse {
    const q = filter.search?.trim().toLowerCase();
    let items = this.state.nfts.filter((n) => {
      if (q && !`${n.title} ${n.artist} ${n.description}`.toLowerCase().includes(q)) return false;
      if (filter.category && n.category !== filter.category) return false;
      if (filter.rarity && n.rarity !== filter.rarity) return false;
      if (filter.featured !== undefined && n.featured !== filter.featured) return false;
      if (filter.minPrice && compareEth(n.price, filter.minPrice) < 0) return false;
      if (filter.maxPrice && compareEth(n.price, filter.maxPrice) > 0) return false;
      return true;
    });
    const sorters: Record<NonNullable<CatalogFilter['sortBy']>, (a: Nft, b: Nft) => number> = {
      'price-asc': (a, b) => compareEth(a.price, b.price),
      'price-desc': (a, b) => compareEth(b.price, a.price),
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
    };
    const sort = filter.sortBy ? sorters[filter.sortBy] : () => 0;
    items = [...items].sort((a, b) => sort(a, b) || a.id.localeCompare(b.id));

    const total = items.length;
    const start = (filter.page - 1) * filter.limit;
    return {
      items: structuredClone(items.slice(start, start + filter.limit)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.max(1, Math.ceil(total / filter.limit)),
    };
  }

  /**
   * Altera preço/estoque, incrementa `version` e emite `nft.updated`.
   * Para NFTs com edições, preço e estoque do topo são derivados das edições.
   */
  updateNft(id: string, patch: NftPatch): Nft {
    const nft = this.state.nfts.find((n) => n.id === id);
    if (!nft) throw new ApiFailure(404, 'NFT_NOT_FOUND', 'NFT não encontrado.');
    this.applyNftPatch(nft, patch);
    this.emitNftUpdated(nft);
    this.persist();
    return structuredClone(nft);
  }

  private applyNftPatch(nft: Nft, patch: NftPatch): void {
    const fields: Record<string, string> = {};
    const checkPrice = (p: string | undefined, f: string) => {
      if (p !== undefined && !ETH_RE.test(p)) fields[f] = 'ETH inválido';
    };
    const checkQty = (q: number | undefined, f: string) => {
      if (q !== undefined && (!Number.isInteger(q) || q < 0)) fields[f] = 'Quantidade inválida';
    };
    checkPrice(patch.price, 'price');
    checkQty(patch.availableQuantity, 'availableQuantity');
    patch.editions?.forEach((e, i) => {
      checkPrice(e.price, `editions.${i}.price`);
      checkQty(e.availableQuantity, `editions.${i}.availableQuantity`);
    });
    if (nft.editions && (patch.price !== undefined || patch.availableQuantity !== undefined)) {
      fields.price = 'NFT com edições: altere o preço/estoque pelas edições.';
    }
    if (Object.keys(fields).length) throw validationFailure(fields);

    if (nft.editions) {
      for (const e of patch.editions ?? []) {
        const edition = nft.editions.find((x) => x.id === e.id);
        if (!edition) throw new ApiFailure(404, 'EDITION_NOT_FOUND', `Edição ${e.id} não encontrada.`);
        if (e.price !== undefined) edition.price = e.price;
        if (e.availableQuantity !== undefined) edition.availableQuantity = e.availableQuantity;
      }
      this.syncEditionTotals(nft);
    } else {
      if (patch.price !== undefined) nft.price = patch.price;
      if (patch.availableQuantity !== undefined) nft.availableQuantity = patch.availableQuantity;
    }
    nft.isAvailable = nft.availableQuantity > 0;
    nft.version += 1;
  }

  private syncEditionTotals(nft: Nft): void {
    if (!nft.editions) return;
    nft.price = nft.editions.map((e) => e.price).reduce((min, p) => (compareEth(p, min) < 0 ? p : min));
    nft.availableQuantity = nft.editions.reduce((sum, e) => sum + e.availableQuantity, 0);
  }

  private emitNftUpdated(nft: Nft): void {
    this.emit({
      type: 'nft.updated',
      payload: {
        eventId: this.nextEventId(),
        resource: 'nft',
        id: nft.id,
        version: nft.version,
        price: nft.price,
        availableQuantity: nft.availableQuantity,
        isAvailable: nft.isAvailable,
        ...(nft.editions && {
          editions: nft.editions.map(({ id, price, availableQuantity }) => ({ id, price, availableQuantity })),
        }),
        timestamp: new Date(this.now()).toISOString(),
      },
    });
  }

  // ---------------------------------------------------------------- favoritos

  getFavorites(userId: string): string[] {
    return [...(this.state.favorites[userId] ?? [])];
  }

  addFavorite(userId: string, nftId: string): string[] {
    this.getNft(nftId);
    const list = (this.state.favorites[userId] ??= []);
    if (!list.includes(nftId)) list.push(nftId);
    this.persist();
    return [...list];
  }

  removeFavorite(userId: string, nftId: string): string[] {
    this.state.favorites[userId] = (this.state.favorites[userId] ?? []).filter((id) => id !== nftId);
    this.persist();
    return [...this.state.favorites[userId]];
  }

  // ---------------------------------------------------------------- carrinho e cotação

  /** Normaliza o pedido de item: edição padrão quando o NFT tem edições. */
  private resolveRequest(req: CartItemRequest) {
    const nft = this.state.nfts.find((n) => n.id === req.nftId);
    if (!nft) throw new ApiFailure(404, 'NFT_NOT_FOUND', 'NFT não encontrado.', undefined, { nftId: req.nftId });
    const notFound = () =>
      new ApiFailure(404, 'EDITION_NOT_FOUND', 'Edição não encontrada.', undefined, {
        nftId: nft.id,
        editionId: req.editionId,
      });
    let edition: NonNullable<Nft['editions']>[number] | undefined;
    if (nft.editions) {
      const wanted = req.editionId ?? nft.editions[0]!.id;
      edition = nft.editions.find((e) => e.id === wanted);
      if (!edition) throw notFound();
    } else if (req.editionId) {
      throw notFound();
    }
    return {
      nft,
      edition,
      price: edition?.price ?? nft.price,
      max: edition?.availableQuantity ?? nft.availableQuantity,
    };
  }

  private toLine(req: CartItemRequest): CartLine {
    const { nft, edition, price, max } = this.resolveRequest(req);
    return {
      key: lineKey(nft.id, edition?.id),
      nftId: nft.id,
      ...(edition && { editionId: edition.id }),
      title: edition ? `${nft.title} — ${edition.name}` : nft.title,
      imageUrl: nft.imageUrl,
      price,
      quantity: req.quantity,
      maxQuantity: max,
      subtotal: mulEth(price, req.quantity),
    };
  }

  getCart(userId: string): Cart {
    const items = (this.state.carts[userId] ??= []);
    return {
      userId,
      items: items.map((i) => this.toLine(i)),
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  private requireStock(line: CartLine, quantity: number): void {
    if (line.maxQuantity < quantity) {
      throw new ApiFailure(
        409,
        'AVAILABILITY_CONFLICT',
        `Quantidade indisponível. Máximo: ${line.maxQuantity}.`,
        undefined,
        { nftId: line.nftId, editionId: line.editionId, max: line.maxQuantity }
      );
    }
  }

  addCartItem(userId: string, req: CartItemRequest): Cart {
    const probe = this.toLine(req);
    const items = (this.state.carts[userId] ??= []);
    const existing = items.find((i) => lineKey(i.nftId, i.editionId) === probe.key);
    this.requireStock(probe, (existing?.quantity ?? 0) + req.quantity);
    if (existing) existing.quantity += req.quantity;
    else items.push({ nftId: probe.nftId, editionId: probe.editionId, quantity: req.quantity });
    this.persist();
    return this.getCart(userId);
  }

  setCartItem(userId: string, key: string, quantity: number): Cart {
    const item = this.state.carts[userId]?.find((i) => lineKey(i.nftId, i.editionId) === key);
    if (!item) throw new ApiFailure(404, 'CART_ITEM_NOT_FOUND', 'Item não está no carrinho.');
    this.requireStock(this.toLine({ ...item, quantity }), quantity);
    item.quantity = quantity;
    this.persist();
    return this.getCart(userId);
  }

  removeCartItem(userId: string, key: string): Cart {
    const items = this.state.carts[userId] ?? [];
    this.state.carts[userId] = items.filter((i) => lineKey(i.nftId, i.editionId) !== key);
    this.persist();
    return this.getCart(userId);
  }

  /** Versão da cotação: cresce sempre que preço/estoque de qualquer NFT envolvido muda. */
  private quoteVersion(lines: CartLine[]): number {
    return 1 + lines.reduce((sum, l) => sum + this.state.nfts.find((n) => n.id === l.nftId)!.version, 0);
  }

  private findCoupon(code: string) {
    const scenario = this.state.scenario.name;
    const coupon = COUPONS.find((c) => c.code === code.trim().toUpperCase());
    if (scenario === 'COUPON_EXPIRED' || coupon?.expired) {
      throw new ApiFailure(422, 'COUPON_EXPIRED', 'Este cupom expirou.', { couponCode: 'Cupom expirado.' });
    }
    if (scenario === 'COUPON_INVALID' || !coupon) {
      throw new ApiFailure(422, 'COUPON_INVALID', 'Cupom inválido.', { couponCode: 'Cupom inválido.' });
    }
    return coupon;
  }

  /** Cotação oficial: o cliente apenas exibe estes valores. Público (visitante também cota). */
  buildQuote(items: CartItemRequest[], couponCode?: string): Quote {
    const lines = items.map((i) => this.toLine(i));
    for (const line of lines) {
      if (line.maxQuantity < line.quantity) {
        throw new ApiFailure(409, 'EDITION_UNAVAILABLE', `"${line.title}" não tem estoque suficiente.`, undefined, {
          nftId: line.nftId,
          editionId: line.editionId,
          max: line.maxQuantity,
        });
      }
    }
    const subtotal = lines.reduce((sum, l) => addEth(sum, l.subtotal), '0');
    const code = couponCode?.trim();
    const discount = code
      ? weiToEth((ethToWei(subtotal) * BigInt(this.findCoupon(code).percent)) / 100n)
      : '0';
    const networkFee = lines.length ? NETWORK_FEE_ETH : '0';
    const total = weiToEth(ethToWei(subtotal) - ethToWei(discount) + ethToWei(networkFee));
    return {
      lines,
      subtotal,
      discount,
      networkFee,
      total,
      ...(code && { couponCode: code.toUpperCase() }),
      isCouponApplied: ethToWei(discount) > 0n,
      expiresAt: new Date(this.now() + QUOTE_TTL_MS).toISOString(),
      version: this.quoteVersion(lines),
    };
  }

  // ---------------------------------------------------------------- perfil

  updateProfile(userId: string, patch: ProfileUpdateRequest): User {
    const user = this.state.users.find((u) => u.id === userId)!;
    if (patch.email && patch.email.toLowerCase() !== user.email.toLowerCase()) {
      const taken = this.state.users.some((u) => u.id !== userId && u.email.toLowerCase() === patch.email!.toLowerCase());
      if (taken) {
        throw new ApiFailure(409, 'EMAIL_TAKEN', 'Este e-mail já está em uso.', { email: 'Este e-mail já está em uso.' });
      }
      user.email = patch.email.toLowerCase();
    }
    if (patch.name !== undefined) user.name = patch.name.trim();
    if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
    this.persist();
    return toPublicUser(user);
  }

  async changePassword(userId: string, body: PasswordChangeRequest): Promise<void> {
    const user = this.state.users.find((u) => u.id === userId)!;
    if ((await hashPassword(user.salt, body.currentPassword)) !== user.passwordHash) {
      throw validationFailure({ currentPassword: 'Senha atual incorreta.' });
    }
    if (body.newPassword === body.currentPassword) {
      throw validationFailure({ newPassword: 'A nova senha deve ser diferente da atual.' });
    }
    user.salt = `salt-${this.nextId('s')}`;
    user.passwordHash = await hashPassword(user.salt, body.newPassword);
    this.persist();
  }

  // ---------------------------------------------------------------- carteiras

  listWallets(userId: string): Wallet[] {
    return structuredClone(this.state.wallets.filter((w) => w.userId === userId));
  }

  private ownWallet(userId: string, id: string): Wallet {
    const wallet = this.state.wallets.find((w) => w.id === id);
    if (!wallet) throw new ApiFailure(404, 'WALLET_NOT_FOUND', 'Carteira não encontrada.');
    if (wallet.userId !== userId) throw new ApiFailure(403, 'FORBIDDEN', 'Sem permissão para esta carteira.');
    return wallet;
  }

  createWallet(userId: string, req: CreateWalletRequest): Wallet {
    const own = this.state.wallets.filter((w) => w.userId === userId);
    if (own.length >= 2) {
      throw new ApiFailure(409, 'WALLET_LIMIT', 'Limite de duas carteiras (principal e secundária).');
    }
    if (own.some((w) => w.address.toLowerCase() === req.address.toLowerCase())) {
      throw new ApiFailure(409, 'WALLET_EXISTS', 'Carteira já cadastrada.', { address: 'Carteira já cadastrada.' });
    }
    const isPrimary = own.length === 0 || req.isPrimary === true;
    if (isPrimary) own.forEach((w) => (w.isPrimary = false));
    const wallet: Wallet = {
      id: this.nextId('wallet'),
      userId,
      address: req.address,
      network: req.network,
      isPrimary,
      ...(req.label && { label: req.label }),
      isConnected: false,
      createdAt: new Date(this.now()).toISOString(),
    };
    this.state.wallets.push(wallet);
    this.persist();
    return structuredClone(wallet);
  }

  updateWallet(userId: string, id: string, patch: UpdateWalletRequest): Wallet {
    const wallet = this.ownWallet(userId, id);
    if (patch.address && patch.address.toLowerCase() !== wallet.address.toLowerCase()) {
      const dup = this.state.wallets.some(
        (w) => w.userId === userId && w.id !== id && w.address.toLowerCase() === patch.address!.toLowerCase()
      );
      if (dup) throw new ApiFailure(409, 'WALLET_EXISTS', 'Carteira já cadastrada.', { address: 'Carteira já cadastrada.' });
      wallet.address = patch.address;
      wallet.isConnected = false;
    }
    if (patch.network) wallet.network = patch.network;
    if (patch.label !== undefined) wallet.label = patch.label;
    if (patch.isPrimary === true) {
      this.state.wallets.filter((w) => w.userId === userId).forEach((w) => (w.isPrimary = w.id === id));
    } else if (patch.isPrimary === false && wallet.isPrimary) {
      throw validationFailure({ isPrimary: 'Defina outra carteira como principal.' });
    }
    this.persist();
    return structuredClone(wallet);
  }

  setWalletConnection(userId: string, id: string, connected: boolean): Wallet {
    const wallet = this.ownWallet(userId, id);
    wallet.isConnected = connected;
    this.persist();
    return structuredClone(wallet);
  }

  // ---------------------------------------------------------------- pedidos

  getOrder(userId: string, id: string): Order {
    const order = this.state.orders.find((o) => o.id === id);
    if (!order) throw new ApiFailure(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado.');
    if (order.userId !== userId) throw new ApiFailure(403, 'FORBIDDEN', 'Sem permissão para este pedido.');
    return structuredClone(order);
  }

  /**
   * Criação idempotente. Ordem (spec §14.1): 1) replay/conflito por chave, 2) validações,
   * 3) criação. A checagem e o registro da chave são síncronos para não haver corrida.
   */
  async createOrder(
    user: StoredUser,
    idempotencyKey: string,
    req: CreateOrderRequest
  ): Promise<{ order: Order; replay: boolean }> {
    const items = req.items
      .map((i) => ({ nftId: i.nftId, editionId: i.editionId ?? null, quantity: i.quantity }))
      .sort((a, b) => lineKey(a.nftId, a.editionId).localeCompare(lineKey(b.nftId, b.editionId)));
    const hash = await hashPayload({
      items,
      walletId: req.walletId,
      network: req.network,
      quoteVersion: req.quoteVersion,
      couponCode: req.couponCode?.trim().toUpperCase() ?? null,
    });

    const slot = `${user.id}:${idempotencyKey}`;
    const known = this.state.idempotency[slot];
    if (known) {
      if (known.hash !== hash) {
        throw new ApiFailure(
          409,
          'IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH',
          'A chave de idempotência já foi usada com outro conteúdo.'
        );
      }
      return { order: this.getOrder(user.id, known.orderId), replay: true };
    }

    const wallet = this.ownWallet(user.id, req.walletId);
    if (!wallet.isConnected) {
      throw new ApiFailure(409, 'WALLET_NOT_CONNECTED', 'Conecte a carteira antes de finalizar.');
    }
    if (!req.items.length) throw validationFailure({ items: 'O pedido não tem itens.' });

    // Efeitos únicos dos cenários de "mudança durante a compra" (emitem nft.updated reais).
    let priceChanged = false;
    const first = this.resolveRequest(req.items[0]!);
    if (this.triggerOnce('PRICE_CHANGED_MID_CHECKOUT')) {
      const bumped = weiToEth((ethToWei(first.price) * 110n) / 100n);
      this.updateNft(first.nft.id, first.edition ? { editions: [{ id: first.edition.id, price: bumped }] } : { price: bumped });
      priceChanged = true;
    }
    if (this.triggerOnce('EDITION_SOLD_OUT')) {
      this.updateNft(
        first.nft.id,
        first.edition ? { editions: [{ id: first.edition.id, availableQuantity: 0 }] } : { availableQuantity: 0 }
      );
    }

    const quote = this.buildQuote(req.items, req.couponCode); // 409 EDITION_UNAVAILABLE / 422 cupom
    if (quote.version !== req.quoteVersion) {
      throw new ApiFailure(
        409,
        priceChanged ? 'PRICE_CHANGED' : 'QUOTE_STALE',
        'A cotação mudou. Revise e confirme novamente.',
        undefined,
        { currentQuoteVersion: quote.version }
      );
    }

    const nowIso = new Date(this.now()).toISOString();
    const order: Order = {
      id: this.nextId('order'),
      userId: user.id,
      status: 'PENDING',
      items: quote.lines.map((l) => ({
        nftId: l.nftId,
        ...(l.editionId && { editionId: l.editionId }),
        title: l.title,
        imageUrl: l.imageUrl,
        price: l.price,
        quantity: l.quantity,
        subtotal: l.subtotal,
      })),
      buyer: { name: user.name, email: user.email },
      quote: {
        subtotal: quote.subtotal,
        discount: quote.discount,
        networkFee: quote.networkFee,
        total: quote.total,
        ...(quote.couponCode && { couponCode: quote.couponCode }),
      },
      walletId: wallet.id,
      network: req.network,
      createdAt: nowIso,
      updatedAt: nowIso,
      version: 1,
    };
    this.state.orders.push(order);
    this.state.idempotency[slot] = { hash, orderId: order.id };
    this.emitOrderUpdated(order);
    this.scheduleResolution(order.id, this.config.orderResolveDelayMs);
    this.persist();
    return { order: structuredClone(order), replay: false };
  }

  private emitOrderUpdated(order: Order): void {
    this.emit({
      type: 'order.updated',
      payload: {
        eventId: this.nextEventId(),
        resource: 'order',
        id: order.id,
        userId: order.userId,
        version: order.version,
        status: order.status,
        ...(order.transactionHash && { transactionHash: order.transactionHash }),
        ...(order.errorMessage && { errorMessage: order.errorMessage }),
        timestamp: new Date(this.now()).toISOString(),
      },
    });
  }

  private scheduleResolution(orderId: string, delayMs: number): void {
    const existing = this.timers.get(orderId);
    if (existing) clearTimeout(existing);
    this.timers.set(
      orderId,
      setTimeout(() => {
        this.timers.delete(orderId);
        this.resolveOrder(orderId);
      }, delayMs)
    );
  }

  /** Retoma, após refresh, a resolução dos pedidos que ficaram PENDING no storage. */
  resumePendingOrders(): void {
    for (const order of this.state.orders) {
      if (order.status === 'PENDING' && !this.timers.has(order.id)) {
        this.scheduleResolution(order.id, this.config.orderResolveDelayMs);
      }
    }
  }

  /** Transição terminal e idempotente: pedidos CONFIRMED/DECLINED nunca mudam. */
  resolveOrder(orderId: string, outcome?: 'CONFIRMED' | 'DECLINED'): Order | undefined {
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order || order.status !== 'PENDING') return order && structuredClone(order);

    const target = outcome ?? (this.state.scenario.name === 'PAYMENT_DECLINED' ? 'DECLINED' : 'CONFIRMED');
    order.status = target;
    order.version += 1;
    order.updatedAt = new Date(this.now()).toISOString();
    if (target === 'CONFIRMED') {
      order.transactionHash = fakeTxHash(order.id);
      this.consumeCart(order);
      this.consumeStock(order);
    } else {
      order.errorMessage = 'Pagamento recusado pela rede simulada.';
    }
    this.emitOrderUpdated(order);
    this.persist();
    return structuredClone(order);
  }

  /** Remove do carrinho só o que foi comprado: linhas e quantidades do pedido (o resto permanece). */
  private consumeCart(order: Order): void {
    const cart = this.state.carts[order.userId];
    if (!cart) return;
    const bought = new Map<string, number>();
    for (const item of order.items) {
      const key = lineKey(item.nftId, item.editionId);
      bought.set(key, (bought.get(key) ?? 0) + item.quantity);
    }
    this.state.carts[order.userId] = cart.flatMap((entry) => {
      let key: string;
      try {
        key = lineKey(entry.nftId, this.resolveRequest(entry).edition?.id);
      } catch {
        return [entry];
      }
      const remaining = entry.quantity - (bought.get(key) ?? 0);
      return remaining > 0 ? [{ ...entry, quantity: remaining }] : [];
    });
  }

  private consumeStock(order: Order): void {
    const touched = new Map<string, Nft>();
    for (const item of order.items) {
      const nft = this.state.nfts.find((n) => n.id === item.nftId)!;
      const edition = nft.editions?.find((e) => e.id === item.editionId);
      if (edition) edition.availableQuantity = Math.max(0, edition.availableQuantity - item.quantity);
      else nft.availableQuantity = Math.max(0, nft.availableQuantity - item.quantity);
      touched.set(nft.id, nft);
    }
    for (const nft of touched.values()) {
      this.syncEditionTotals(nft);
      nft.isAvailable = nft.availableQuantity > 0;
      nft.version += 1;
      this.emitNftUpdated(nft);
    }
  }
}
