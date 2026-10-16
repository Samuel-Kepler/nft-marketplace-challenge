import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/session';
import { toQuoteItems, useCart, useQuote } from '@/features/cart/queries';
import { QuoteSummary } from '@/features/cart/quote-summary';
import { useConnectWallet, useDisconnectWallet, useWallets } from '@/features/wallets/queries';
import { queryKeys } from '@/shared/api/query-keys';
import { isApiRequestError } from '@/shared/api/errors';
import { pushNotice } from '@/shared/realtime/notices';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { NETWORK_LABELS, NetworkSchema, type Network } from '@/shared/schemas/wallet';
import type { CreateOrderRequest } from '@/shared/schemas/order';
import {
  clearAttempt,
  failureCreatedNoOrder,
  isQuoteChangedError,
  prepareAttempt,
  readAttempt,
  rememberOrder,
} from './attempt';
import { useCreateOrder, useOrder } from './queries';

const errorMessage = (error: unknown, fallback: string) => (isApiRequestError(error) ? error.message : fallback);

export function CheckoutPage({ coupon }: { coupon?: string }) {
  const userId = useSession()?.user.id;
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cart = useCart();
  const items = toQuoteItems(cart.data);
  const quote = useQuote(items, coupon);
  const wallets = useWallets();
  const connect = useConnectWallet();
  const disconnect = useDisconnectWallet();
  const createOrder = useCreateOrder();

  // Pedido em andamento: recuperado do registro local após refresh/reconexão/expiração.
  const [orderId, setOrderId] = useState<string | undefined>(() => readAttempt()?.orderId);
  const order = useOrder(orderId);
  const [walletId, setWalletId] = useState<string>();
  const [network, setNetwork] = useState<Network>();
  /** Versão da cotação que o usuário revisou e aceitou. Qualquer mudança invalida a confirmação. */
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string>();
  const [declinedMessage, setDeclinedMessage] = useState<string>();
  const sending = useRef(false);
  const hadUnansweredAttempt = useRef(Boolean(readAttempt() && !readAttempt()?.orderId));

  const list = wallets.data ?? [];
  const wallet = list.find((w) => w.id === (walletId ?? list.find((x) => x.isPrimary)?.id ?? list[0]?.id));
  const chosenNetwork = network ?? wallet?.network;
  const quoteData = quote.data;
  const quoteSettled = Boolean(quoteData) && !quote.isFetching;
  const reviewValid = reviewedVersion !== null && quoteSettled && quoteData?.version === reviewedVersion;

  // Cotação mudou depois da revisão (nft.updated, reconexão…): exige nova confirmação.
  useEffect(() => {
    if (reviewedVersion !== null && quoteData && quoteData.version !== reviewedVersion) {
      setReviewedVersion(null);
      pushNotice('warning', 'Preço ou disponibilidade mudou. Revise o pedido e confirme novamente.');
    }
  }, [quoteData, reviewedVersion]);

  // Resultado do pedido: confirmado → recibo; recusado → volta ao formulário com itens preservados.
  const status = order.data?.status;
  useEffect(() => {
    if (!orderId || !status || status === 'PENDING') return;
    if (status === 'CONFIRMED') {
      if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.cart(userId) });
      void navigate({ to: '/checkout/success', search: { orderId }, replace: true });
    } else {
      clearAttempt();
      setDeclinedMessage(order.data?.errorMessage ?? 'Pagamento recusado. Seus itens foram mantidos.');
      setOrderId(undefined);
      setReviewedVersion(null);
      void queryClient.invalidateQueries({ queryKey: ['quote'] });
    }
  }, [status, orderId, order.data?.errorMessage, navigate, queryClient, userId]);

  if (!session) return null;

  if (orderId && (order.isPending || status === 'PENDING')) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8" aria-busy="true">
        <h1>Pagamento</h1>
        <p role="status" className="rounded-lg border border-border bg-surface p-4">Aguardando a confirmação do pagamento… Você pode recarregar a página: o pedido não será duplicado.</p>
      </main>
    );
  }
  if (orderId && order.isError && !order.data) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <h1>Pagamento</h1>
        <div role="alert">
          <p>Não foi possível consultar o pedido. {errorMessage(order.error, '')}</p>
          <Button variant="outline" onClick={() => void order.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </main>
    );
  }

  if (cart.isPending) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8" aria-busy="true">
        <h1>Pagamento</h1>
        <div role="status" aria-label="Carregando pagamento" className="grid gap-4">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </main>
    );
  }
  if (cart.data && cart.data.items.length === 0) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <h1>Pagamento</h1>
        <p>
          Seu carrinho está vazio. <Link to="/">Explorar NFTs</Link>
        </p>
      </main>
    );
  }

  const selectWallet = (id: string) => {
    setWalletId(id);
    setNetwork(undefined);
    setReviewedVersion(null);
  };

  const canReview = Boolean(wallet?.isConnected && chosenNetwork && quoteSettled && !quote.isError);

  const submit = async () => {
    if (sending.current || !userId || !quoteData || !wallet || !chosenNetwork) return;
    sending.current = true;
    setSubmitError(undefined);
    const body: CreateOrderRequest = {
      items,
      quoteVersion: quoteData.version,
      walletId: wallet.id,
      network: chosenNetwork,
      ...(coupon && { couponCode: coupon }),
    };
    try {
      const attempt = await prepareAttempt(userId, body);
      const { order: created } = await createOrder.mutateAsync({ body, idempotencyKey: attempt.key });
      rememberOrder(attempt, created.id);
      hadUnansweredAttempt.current = false;
      setOrderId(created.id);
    } catch (error) {
      if (isQuoteChangedError(error)) {
        clearAttempt();
        setReviewedVersion(null);
        void queryClient.invalidateQueries({ queryKey: ['quote'] });
        void queryClient.invalidateQueries({ queryKey: ['nfts'] });
        setSubmitError('A cotação mudou. Revise os novos valores e confirme novamente.');
      } else if (failureCreatedNoOrder(error)) {
        // O servidor respondeu com erro: nenhum pedido existe, a próxima tentativa usa chave nova.
        clearAttempt();
        hadUnansweredAttempt.current = false;
        setReviewedVersion(null);
        void queryClient.invalidateQueries({ queryKey: ['quote'] });
        setSubmitError(errorMessage(error, 'Não foi possível enviar o pedido.'));
      } else {
        // Sem resposta (rede/timeout): o pedido pode existir. A chave é mantida e o reenvio recupera o mesmo pedido.
        hadUnansweredAttempt.current = true;
        setSubmitError('Sem resposta do servidor. Seu pedido pode ter sido criado; tente novamente para recuperá-lo sem duplicar a compra.');
      }
    } finally {
      sending.current = false;
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <h1>Pagamento</h1>

      {declinedMessage && (
        <p role="alert" className="mb-4">
          {declinedMessage} Escolha outra carteira ou tente novamente.
        </p>
      )}
      {submitError && (
        <p role="alert" className="mb-4">
          {submitError}
        </p>
      )}
      {hadUnansweredAttempt.current && !submitError && (
        <p role="status" className="mb-4 rounded-md border-l-4 border-warning bg-warning-surface p-3 text-warning">Há um envio anterior sem resposta. Ao confirmar, recuperaremos o mesmo pedido, sem cobrar duas vezes.</p>
      )}

      <section aria-labelledby="buyer-heading" className="mb-6 rounded-lg border border-border p-4">
        <h2 id="buyer-heading">Dados do colecionador</h2>
        <p>{session.user.name}</p>
        <p>{session.user.email}</p>
        <Link to="/profile">Editar dados no perfil</Link>
      </section>

      <section aria-labelledby="wallet-heading" className="mb-6 rounded-lg border border-border p-4">
        <h2 id="wallet-heading">Carteira e rede</h2>
        {wallets.isPending && (
          <div role="status" aria-busy="true" aria-label="Carregando carteiras" className="grid gap-2">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        )}
        {wallets.isError && (
          <div role="alert">
            <p>Não foi possível carregar suas carteiras.</p>
            <Button variant="outline" onClick={() => void wallets.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {wallets.data && list.length === 0 && (
          <p>
            Você ainda não cadastrou uma carteira. <Link to="/profile/wallets">Cadastrar carteira</Link>
          </p>
        )}
        {list.length > 0 && (
          <fieldset className="grid gap-2">
            <legend>Selecione a carteira</legend>
            {list.map((w) => (
              <label
                key={w.id}
                className={`min-h-11 items-center gap-3 rounded-md border p-3 text-base ${wallet?.id === w.id ? 'border-primary bg-surface' : 'border-border'}`}
              >
                <input
                  type="radio"
                  name="wallet"
                  checked={wallet?.id === w.id}
                  onChange={() => selectWallet(w.id)}
                />
                <span>
                  {w.label ?? (w.isPrimary ? 'Principal' : 'Secundária')} — {w.address.slice(0, 6)}…{w.address.slice(-4)} (
                  {w.isConnected ? 'conectada' : 'desconectada'})
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {wallet && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-48 sm:max-w-xs">
              <label htmlFor="network">Rede</label>
              <select
                id="network"
                value={chosenNetwork}
                onChange={(e) => {
                  setNetwork(NetworkSchema.parse(e.target.value));
                  setReviewedVersion(null);
                }}
              >
                {NetworkSchema.options.map((n) => (
                  <option key={n} value={n}>
                    {NETWORK_LABELS[n]}
                  </option>
                ))}
              </select>
            </div>
            {wallet.isConnected ? (
              <button type="button" disabled={disconnect.isPending} onClick={() => disconnect.mutate(wallet.id, { onSuccess: () => setReviewedVersion(null) })}>
                Desconectar carteira
              </button>
            ) : (
              <button type="button" disabled={connect.isPending} onClick={() => connect.mutate(wallet.id)}>
                {connect.isPending ? 'Conectando…' : 'Conectar carteira'}
              </button>
            )}
          </div>
        )}
        {connect.isError && <p role="alert">{errorMessage(connect.error, 'Não foi possível conectar a carteira.')}</p>}
        {disconnect.isError && <p role="alert">{errorMessage(disconnect.error, 'Não foi possível desconectar.')}</p>}
        {wallet && !wallet.isConnected && <p>Conecte a carteira para continuar.</p>}
      </section>

      <section aria-labelledby="review-heading" className="mb-6 rounded-lg border border-border p-4">
        <h2 id="review-heading">Revisão</h2>
        <ul className="mb-4 grid gap-1 rounded-lg border border-border p-3">
          {(quoteData?.lines ?? cart.data?.items ?? []).map((line) => (
            <li key={line.key}>
              {line.title} × {line.quantity} — {line.subtotal} ETH
            </li>
          ))}
        </ul>
        {coupon && <p>Cupom: {coupon.toUpperCase()}</p>}
        <QuoteSummary quote={quoteData} isPending={quote.isPending} isFetching={quote.isFetching} error={quote.error} />
        {quote.isError && (
          <p>
            <Link to="/cart" search={{ coupon }}>
              Voltar ao carrinho
            </Link>
          </p>
        )}
      </section>

      {!reviewValid ? (
        <Button size="lg" disabled={!canReview} onClick={() => setReviewedVersion(quoteData?.version ?? null)} className="w-full sm:w-auto">
          Revisar pedido
        </Button>
      ) : (
        <div>
          <p role="status" className="mb-3 font-medium">Pedido revisado. Total: {quoteData?.total} ETH em {chosenNetwork ? NETWORK_LABELS[chosenNetwork] : ''}.</p>
          <Button size="lg" disabled={createOrder.isPending} aria-busy={createOrder.isPending} onClick={() => void submit()} className="w-full sm:w-auto">
            {createOrder.isPending ? 'Enviando…' : submitError ? 'Tentar novamente' : 'Confirmar e enviar pedido'}
          </Button>
        </div>
      )}
    </main>
  );
}
