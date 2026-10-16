import { useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  toQuoteItems,
  useCart,
  useQuote,
  useRemoveCartItem,
  useSetCartItemQuantity,
} from '@/features/cart/queries';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { QuoteSummary } from '@/features/cart/quote-summary';
import { useSession } from '@/features/auth/session';
import { isApiRequestError } from '@/shared/api/errors';
import { pushNotice } from '@/shared/realtime/notices';

export const Route = createFileRoute('/cart')({
  validateSearch: (raw: Record<string, unknown>): { coupon?: string } =>
    typeof raw.coupon === 'string' && raw.coupon.trim() ? { coupon: raw.coupon.trim().slice(0, 32) } : {},
  component: CartPage,
});

function CartPage() {
  const session = useSession();
  const { coupon } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data, isPending, isError, refetch } = useCart();
  const quote = useQuote(toQuoteItems(data), coupon);
  const setQuantity = useSetCartItemQuantity();
  const removeItem = useRemoveCartItem();
  const [code, setCode] = useState('');

  const onError = (error: unknown) =>
    pushNotice('error', isApiRequestError(error) ? error.message : 'Não foi possível atualizar o carrinho.');
  const applyCoupon = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) void navigate({ search: { coupon: code.trim() } });
  };

  const hasItems = Boolean(data && data.items.length > 0);
  const overLimit = data?.items.some((line) => line.quantity > line.maxQuantity) ?? false;
  const couponError = isApiRequestError(quote.error) && quote.error.code.startsWith('COUPON_') ? quote.error : null;
  const canCheckout = hasItems && !overLimit && Boolean(quote.data) && !quote.isError;

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <h1>Carrinho</h1>
      {!session && (
        <p>
          <Link to="/auth/login" search={{ redirect: '/cart' }}>
            Entre
          </Link>{' '}
          para ver seu carrinho.
        </p>
      )}
      {session && isPending && (
        <div role="status" aria-busy="true" aria-label="Carregando carrinho" className="mb-6 grid gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[6.5rem] w-full rounded-lg sm:h-20" />
          ))}
        </div>
      )}
      {session && isError && (
        <div role="alert">
          <p>Não foi possível carregar o carrinho.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {data && !hasItems && (
        <p>
          Seu carrinho está vazio. <Link to="/">Explorar NFTs</Link>
        </p>
      )}
      {data && hasItems && (
        <>
          <ul className="mb-6 grid gap-3">
            {data.items.map((line) => {
              const unavailable = line.quantity > line.maxQuantity;
              return (
                <li key={line.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border p-3" data-testid={`cart-line-${line.key}`}>
                  <img src={line.imageUrl} alt={line.title} width={64} height={64} className="size-16 rounded object-cover" />
                  <div className="min-w-40 flex-1">
                    <p className="font-semibold">{line.title}</p>
                    <p className="text-sm text-muted">{line.price} ETH cada</p>
                    {unavailable && (
                      <p role="alert">
                        {line.maxQuantity === 0 ? 'Esgotado.' : `Disponível: ${line.maxQuantity}. Reduza a quantidade.`}
                      </p>
                    )}
                  </div>
                  <div role="group" aria-label={`Quantidade de ${line.title}`} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Diminuir quantidade de ${line.title}`}
                      disabled={line.quantity <= 1 || setQuantity.isPending}
                      onClick={() => setQuantity.mutate({ key: line.key, quantity: line.quantity - 1 }, { onError })}
                    >
                      -
                    </button>
                    <span aria-live="polite" data-testid="quantity" className="min-w-6 text-center font-semibold">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Aumentar quantidade de ${line.title}`}
                      disabled={line.quantity >= line.maxQuantity || setQuantity.isPending}
                      onClick={() => setQuantity.mutate({ key: line.key, quantity: line.quantity + 1 }, { onError })}
                    >
                      +
                    </button>
                  </div>
                  <p className="min-w-20 text-right font-semibold">{line.subtotal} ETH</p>
                  <button
                    type="button"
                    aria-label={`Remover ${line.title}`}
                    disabled={removeItem.isPending}
                    onClick={() => removeItem.mutate(line.key, { onError })}
                  >
                    Remover
                  </button>
                </li>
              );
            })}
          </ul>

          <form onSubmit={applyCoupon} className="mb-4 flex flex-wrap items-end gap-2" noValidate>
            <div className="min-w-0 flex-1 basis-40 sm:max-w-xs">
              <label htmlFor="coupon">Cupom</label>
              <input
                id="coupon"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-invalid={couponError ? true : undefined}
                aria-describedby={couponError ? 'coupon-error' : undefined}
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="outline">
              Aplicar
            </Button>
            {coupon && (
              <Button
                variant="ghost"
                onClick={() => {
                  setCode('');
                  void navigate({ search: {} });
                }}
              >
                Remover cupom {coupon}
              </Button>
            )}
          </form>
          {couponError && (
            <p id="coupon-error" role="alert" className="mb-4 max-w-md">
              {couponError.message}
            </p>
          )}

          {!couponError && (
            <QuoteSummary quote={quote.data} isPending={quote.isPending} isFetching={quote.isFetching} error={quote.error} />
          )}
          <div className="mt-4">
            {canCheckout ? (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/checkout" search={{ coupon }}>
                  Ir para o pagamento
                </Link>
              </Button>
            ) : (
              <Button size="lg" disabled className="w-full sm:w-auto">
                Ir para o pagamento
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
