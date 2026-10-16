import { useState } from 'react';
import { isApiRequestError } from '@/shared/api/errors';
import { pushNotice } from '@/shared/realtime/notices';
import {
  CreateWalletRequestSchema,
  NETWORK_LABELS,
  NetworkSchema,
  UpdateWalletRequestSchema,
  type Wallet,
} from '@/shared/schemas/wallet';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { zodFieldErrors } from '@/shared/utils/form-errors';
import {
  useConnectWallet,
  useCreateWallet,
  useDisconnectWallet,
  useUpdateWallet,
  useWallets,
} from './queries';

const MAX_WALLETS = 2;

const apiFields = (e: unknown): Record<string, string> => (isApiRequestError(e) ? (e.fields ?? {}) : {});
const apiMessage = (e: unknown, fallback?: string) => (isApiRequestError(e) ? (e.fields ? null : e.message) : e ? fallback : null);

export const walletRole = (w: Pick<Wallet, 'isPrimary'>) => (w.isPrimary ? 'Principal' : 'Secundária');

/** Formulário de cadastro/edição. `wallet` ausente = cadastro. */
function WalletForm({
  wallet,
  canBePrimary,
  onDone,
  onCancel,
}: {
  wallet?: Wallet;
  canBePrimary: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const create = useCreateWallet();
  const update = useUpdateWallet();
  const mutation = wallet ? update : create;
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const errors = { ...apiFields(mutation.error), ...clientErrors };
  const idp = wallet ? `wallet-${wallet.id}` : 'wallet-new';

  return (
    <form
      noValidate
      aria-label={wallet ? `Editar carteira ${walletRole(wallet).toLowerCase()}` : 'Cadastrar carteira'}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const label = String(form.get('label') ?? '').trim();
        const body = {
          address: String(form.get('address') ?? '').trim(),
          network: form.get('network'),
          label,
          ...(canBePrimary && { isPrimary: form.get('isPrimary') === 'on' }),
        };
        // Em edição, desmarcar a principal não é permitido (o servidor exige outra principal): não enviamos.
        const payload = wallet && wallet.isPrimary ? { ...body, isPrimary: undefined } : body;
        const parsed = (wallet ? UpdateWalletRequestSchema : CreateWalletRequestSchema).safeParse(payload);
        setClientErrors(zodFieldErrors(parsed));
        if (!parsed.success) return;
        const done = () => {
          pushNotice('success', wallet ? 'Carteira atualizada.' : 'Carteira cadastrada.');
          onDone();
        };
        if (wallet) update.mutate({ id: wallet.id, patch: parsed.data }, { onSuccess: done });
        else create.mutate(CreateWalletRequestSchema.parse(parsed.data), { onSuccess: done });
      }}
    >
      <div>
        <label htmlFor={`${idp}-address`}>Endereço da carteira</label>
        <input
          id={`${idp}-address`}
          name="address"
          defaultValue={wallet?.address}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={errors.address ? true : undefined}
          aria-describedby={errors.address ? `${idp}-address-error` : undefined}
        />
        {errors.address && (
          <p id={`${idp}-address-error`} role="alert">
            {errors.address}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${idp}-network`}>Rede</label>
        <select id={`${idp}-network`} name="network" defaultValue={wallet?.network ?? 'ethereum'}>
          {NetworkSchema.options.map((n) => (
            <option key={n} value={n}>
              {NETWORK_LABELS[n]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idp}-label`}>Apelido (opcional)</label>
        <input
          id={`${idp}-label`}
          name="label"
          defaultValue={wallet?.label}
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={errors.label ? `${idp}-label-error` : undefined}
        />
        {errors.label && (
          <p id={`${idp}-label-error`} role="alert">
            {errors.label}
          </p>
        )}
      </div>
      {canBePrimary && (
        <div className="flex items-center gap-2">
          <input id={`${idp}-primary`} name="isPrimary" type="checkbox" defaultChecked={wallet?.isPrimary} disabled={wallet?.isPrimary} />
          <label htmlFor={`${idp}-primary`} className="mb-0">Definir como principal</label>
          {errors.isPrimary && <p role="alert">{errors.isPrimary}</p>}
        </div>
      )}
      {apiMessage(mutation.error, 'Não foi possível salvar a carteira.') && (
        <p role="alert">{apiMessage(mutation.error, 'Não foi possível salvar a carteira.')}</p>
      )}
      <Button type="submit" disabled={mutation.isPending} aria-busy={mutation.isPending}>
        {wallet ? 'Salvar carteira' : 'Cadastrar carteira'}
      </Button>
      {onCancel && (
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      )}
    </form>
  );
}

function WalletCard({ wallet, canBePrimary }: { wallet: Wallet; canBePrimary: boolean }) {
  const [editing, setEditing] = useState(false);
  const connect = useConnectWallet();
  const disconnect = useDisconnectWallet();
  const pending = connect.isPending || disconnect.isPending;
  const error = connect.error ?? disconnect.error;

  return (
    <li aria-label={`Carteira ${walletRole(wallet).toLowerCase()}`} className="grid gap-2 rounded-lg border border-border p-4" data-testid={`wallet-${wallet.id}`}>
      <h2>
        {walletRole(wallet)}
        {wallet.label && wallet.label !== walletRole(wallet) ? ` — ${wallet.label}` : ''}
      </h2>
      <p>
        <span data-testid="wallet-address" className="break-all font-mono text-sm">{wallet.address}</span> · {NETWORK_LABELS[wallet.network]}
      </p>
      <p role="status" data-testid="wallet-status" className="text-sm font-medium text-muted">
        {pending ? (connect.isPending ? 'Conectando…' : 'Desconectando…') : wallet.isConnected ? 'Conectada' : 'Desconectada'}
      </p>
      <div className="flex flex-wrap gap-2">
        {wallet.isConnected ? (
          <Button variant="outline" disabled={pending} onClick={() => disconnect.mutate(wallet.id)}>
            Desconectar
          </Button>
        ) : (
          <Button disabled={pending} onClick={() => connect.mutate(wallet.id)}>
            Conectar
          </Button>
        )}
        <Button variant="outline" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Fechar edição' : 'Editar'}
        </Button>
      </div>
      {error && <p role="alert">{isApiRequestError(error) ? error.message : 'Operação com a carteira falhou.'}</p>}
      {editing && <WalletForm wallet={wallet} canBePrimary={canBePrimary} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />}
    </li>
  );
}

export function WalletsPage() {
  const wallets = useWallets();
  const list = [...(wallets.data ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-4 sm:p-8">
      <h1>Carteiras</h1>
      {wallets.isPending && (
        <div role="status" aria-busy="true" aria-label="Carregando carteiras" className="grid gap-4">
          <Skeleton className="h-36 w-full rounded-lg" />
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
      {wallets.data && list.length === 0 && <p>Você ainda não cadastrou nenhuma carteira.</p>}
      {list.length > 0 && (
        <ul className="grid gap-4">
          {list.map((w) => (
            <WalletCard key={w.id} wallet={w} canBePrimary={list.length > 1} />
          ))}
        </ul>
      )}
      {wallets.data &&
        (list.length < MAX_WALLETS ? (
          <section aria-labelledby="new-wallet-heading">
            <h2 id="new-wallet-heading">{list.length === 0 ? 'Cadastrar carteira principal' : 'Cadastrar carteira secundária'}</h2>
            {/* `key`: após cadastrar, o formulário volta vazio. */}
            <WalletForm key={list.length} canBePrimary={list.length > 0} onDone={() => undefined} />
          </section>
        ) : (
          <p>Limite de {MAX_WALLETS} carteiras atingido (principal e secundária).</p>
        ))}
    </main>
  );
}
