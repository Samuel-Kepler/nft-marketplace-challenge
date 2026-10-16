export const SCENARIO_NAMES = [
  'DEFAULT',
  'EMPTY_RESULTS',
  'SLOW_NETWORK',
  'VARIABLE_LATENCY',
  'NETWORK_ERROR',
  'HTTP_4XX',
  'HTTP_5XX',
  'SESSION_EXPIRED',
  'UNAUTHORIZED',
  'REGISTER_CONFLICT',
  'FORM_VALIDATION_ERROR',
  'COUPON_INVALID',
  'COUPON_EXPIRED',
  'PRICE_CHANGED_MID_CHECKOUT',
  'EDITION_SOLD_OUT',
  'ORDER_TIMEOUT_AFTER_CREATE',
  'PAYMENT_CONFIRMED',
  'PAYMENT_DECLINED',
  'WALLET_REFUSED',
  'FAVORITES_MUTATION_FAILS',
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export interface ScenarioState {
  name: ScenarioName;
  /** Falhas restantes para cenários de falha; `undefined` = indefinidas (até trocar de cenário). */
  remainingFailures?: number;
  /** Cenários de efeito único (preço alterado, esgotado, sessão expirada) marcam aqui o disparo. */
  triggered: boolean;
}

export const isScenarioName = (v: unknown): v is ScenarioName =>
  typeof v === 'string' && (SCENARIO_NAMES as readonly string[]).includes(v);

export const initialScenario = (name: ScenarioName = 'DEFAULT', failures?: number): ScenarioState => ({
  name,
  remainingFailures: failures,
  triggered: false,
});

/** Latências determinísticas do cenário VARIABLE_LATENCY: a 1ª resposta é a mais lenta. */
export const VARIABLE_LATENCY_SEQUENCE_MS = [900, 60, 400, 20] as const;
export const SLOW_NETWORK_LATENCY_MS = 2000;
