import { isApiRequestError } from '@/shared/api/errors';
import { Skeleton } from '@/shared/ui/skeleton';
import type { Quote } from '@/shared/schemas/cart';

const PANEL = 'w-full max-w-md rounded-lg border border-border bg-surface p-4';

interface QuoteSummaryProps {
  quote: Quote | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
}

/** Resumo oficial (valores da API). Esqueleto com a mesma altura evita deslocamento de layout. */
export function QuoteSummary({ quote, isPending, isFetching, error }: QuoteSummaryProps) {
  if (isPending && !error) {
    return (
      <div role="status" aria-busy="true" aria-label="Carregando resumo" className={`${PANEL} grid gap-3`}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }
  if (!quote) {
    const message = isApiRequestError(error) ? error.message : 'Não foi possível calcular o resumo.';
    return (
      <p role="alert" className="max-w-md">
        {message}
      </p>
    );
  }
  return (
    <dl aria-busy={isFetching} className={`${PANEL} grid grid-cols-[1fr_auto] gap-x-4 gap-y-2`}>
      <dt>Subtotal</dt>
      <dd className="text-right">{quote.subtotal} ETH</dd>
      <dt>Desconto{quote.isCouponApplied && quote.couponCode ? ` (${quote.couponCode})` : ''}</dt>
      <dd className="text-right">- {quote.discount} ETH</dd>
      <dt>Taxa de rede</dt>
      <dd className="text-right">{quote.networkFee} ETH</dd>
      <dt className="border-t border-border pt-2 text-lg font-bold">Total</dt>
      <dd className="border-t border-border pt-2 text-right text-lg font-bold">{quote.total} ETH</dd>
    </dl>
  );
}
