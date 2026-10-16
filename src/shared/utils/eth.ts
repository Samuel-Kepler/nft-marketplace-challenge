const WEI = 10n ** 18n;
const ETH_RE = /^\d+(\.\d{1,18})?$/;

export function ethToWei(s: string): bigint {
  if (!ETH_RE.test(s)) throw new RangeError(`ETH inválido: ${s}`);
  const [i, d = ''] = s.split('.');
  return BigInt(i) * WEI + BigInt(d.padEnd(18, '0'));
}

export function weiToEth(w: bigint): string {
  if (w < 0n) throw new RangeError('ETH negativo');
  const d = (w % WEI).toString().padStart(18, '0').replace(/0+$/, '');
  return d ? `${w / WEI}.${d}` : `${w / WEI}`;
}

export const addEth = (a: string, b: string) => weiToEth(ethToWei(a) + ethToWei(b));

export function mulEth(a: string, qty: number) {
  if (!Number.isInteger(qty) || qty < 0) throw new RangeError('quantidade inteira');
  return weiToEth(ethToWei(a) * BigInt(qty));
}

export const compareEth = (a: string, b: string) =>
  ethToWei(a) < ethToWei(b) ? -1 : ethToWei(a) > ethToWei(b) ? 1 : 0;
