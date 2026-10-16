export interface Coupon {
  code: string;
  /** Desconto percentual inteiro. */
  percent: number;
  expired: boolean;
}

export const COUPONS: Coupon[] = [
  { code: 'NFT10', percent: 10, expired: false },
  { code: 'EXPIRED20', percent: 20, expired: true },
];

export const NETWORK_FEE_ETH = '0.002';
export const QUOTE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 30 * 60_000;
export const ORDER_RESOLVE_DELAY_MS = 1500;
