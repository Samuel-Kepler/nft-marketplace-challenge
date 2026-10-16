import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { isApiRequestError } from '@/shared/api/errors';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { clearAttempt, readAttempt } from './attempt';
import { useOrder } from './queries';

/**
 * Confirmação do pedido. O recibo só aparece para pedido `CONFIRMED`; os valores vêm do snapshot
 * do pedido, nunca do catálogo atual. Sem `orderId` na URL, usa o pedido da tentativa em curso.
 */
export function OrderReceiptPage({ orderId: fromUrl }: { orderId?: string }) {
  const orderId = fromUrl ?? readAttempt()?.orderId;
  const { data: order, isPending, error, refetch } = useOrder(orderId);

  useEffect(() => {
    if (order?.status === 'CONFIRMED' || order?.status === 'DECLINED') clearAttempt();
  }, [order?.status]);

  if (!orderId) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <h1>Confirmação do pedido</h1>
        <p>Nenhum pedido para exibir.</p>
        <Link to="/">Voltar ao início</Link>
      </main>
    );
  }
  if (isPending) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8" aria-busy="true">
        <h1>Confirmação do pedido</h1>
        <div role="status" aria-label="Carregando pedido" className="grid gap-3">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </main>
    );
  }
  if (error || !order) {
    const notFound = isApiRequestError(error) && (error.status === 404 || error.status === 403);
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <h1>Confirmação do pedido</h1>
        <div role="alert">
          <p>{notFound ? 'Pedido não encontrado.' : 'Não foi possível carregar o pedido.'}</p>
          {!notFound && (
            <Button variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          )}
        </div>
        <Link to="/">Voltar ao início</Link>
      </main>
    );
  }
  if (order.status === 'PENDING') {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8" aria-busy="true">
        <h1>Confirmação do pedido</h1>
        <p role="status" className="rounded-lg border border-border bg-surface p-4">Pagamento em processamento. Esta página será atualizada quando for confirmado.</p>
      </main>
    );
  }
  if (order.status === 'DECLINED') {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <h1>Pedido não confirmado</h1>
        <p role="alert">{order.errorMessage ?? 'Pagamento recusado.'} Seus itens continuam no carrinho.</p>
        <Link to="/checkout">Tentar novamente</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <h1>
        <span aria-hidden="true">✓ </span>Pedido confirmado
      </h1>
      <dl className="mb-6 grid grid-cols-1 gap-y-1 rounded-lg border border-border p-4 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt>Pedido</dt>
        <dd data-testid="order-id">{order.id}</dd>
        <dt>Transação</dt>
        <dd data-testid="tx-hash" className="break-all">
          {order.transactionHash} (simulada)
        </dd>
        <dt>Rede</dt>
        <dd>{order.network}</dd>
        <dt>Colecionador</dt>
        <dd>
          {order.buyer.name} ({order.buyer.email})
        </dd>
      </dl>
      <h2>Itens</h2>
      <ul className="mb-4 grid gap-1 rounded-lg border border-border p-3">
        {order.items.map((item) => (
          <li key={`${item.nftId}:${item.editionId ?? ''}`}>
            {item.title} × {item.quantity} — {item.subtotal} ETH
          </li>
        ))}
      </ul>
      <dl className="mb-6 grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-4">
        <dt>Subtotal</dt>
        <dd>{order.quote.subtotal} ETH</dd>
        <dt>Desconto{order.quote.couponCode ? ` (${order.quote.couponCode})` : ''}</dt>
        <dd>- {order.quote.discount} ETH</dd>
        <dt>Taxa de rede</dt>
        <dd>{order.quote.networkFee} ETH</dd>
        <dt className="text-lg font-bold">Total</dt>
        <dd className="text-lg font-bold" data-testid="order-total">
          {order.quote.total} ETH
        </dd>
      </dl>
      <Link to="/">Continuar explorando</Link>
    </main>
  );
}
