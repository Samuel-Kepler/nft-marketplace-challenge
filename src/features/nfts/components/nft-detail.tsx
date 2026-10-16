import { useState } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useAddCartItem } from '@/features/cart/queries';
import { useSession } from '@/features/auth/session';
import { isApiRequestError } from '@/shared/api/errors';
import { pushNotice } from '@/shared/realtime/notices';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import type { Nft } from '@/shared/schemas/nft';
import { categoryLabel, clampQuantity, defaultEditionId, rarityLabel, resolveOffer } from '../catalog';
import { FavoriteButton } from './favorite-button';
import { NftImage } from './nft-image';

function Gallery({ nft }: { nft: Nft }) {
  const images = [nft.imageUrl, ...nft.gallery.filter((g) => g !== nft.imageUrl)];
  const [selected, setSelected] = useState(0);
  const current = images[Math.min(selected, images.length - 1)]!;
  return (
    <div>
      <NftImage
        key={current}
        src={current}
        alt={`${nft.title}, imagem ${selected + 1} de ${images.length}`}
        width={640}
        height={640}
        priority
        className="aspect-square w-full rounded-lg object-cover"
      />
      {images.length > 1 && (
        <ul aria-label="Galeria" className="mt-3 flex flex-wrap gap-2">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                aria-label={`Ver imagem ${i + 1} de ${images.length}`}
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
                className={`block rounded-md border-2 ${i === selected ? 'border-primary' : 'border-transparent'}`}
              >
                <NftImage src={src} alt="" width={64} height={64} className="size-16 rounded object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NftDetail({ nft }: { nft: Nft }) {
  const session = useSession();
  const navigate = useNavigate();
  const href = useLocation({ select: (l) => l.href });
  const addToCart = useAddCartItem();
  const [chosenEdition, setChosenEdition] = useState<string | undefined>();
  const [requested, setRequested] = useState(1);

  // Tudo abaixo é derivado: se o estoque cair em tempo real, edição e quantidade se ajustam sozinhas.
  const editionId = defaultEditionId(nft, chosenEdition);
  const offer = resolveOffer(nft, editionId);
  const quantity = clampQuantity(requested, offer.maxQuantity);
  const soldOut = offer.maxQuantity === 0;
  const atLimit = !soldOut && quantity >= offer.maxQuantity;

  const onAdd = () => {
    if (!session) {
      void navigate({ to: '/auth/login', search: { redirect: href } });
      return;
    }
    addToCart.mutate(
      { nftId: nft.id, ...(offer.editionId && { editionId: offer.editionId }), quantity },
      {
        onSuccess: () => pushNotice('success', `${quantity} × ${nft.title} adicionado ao carrinho.`),
        onError: (error) =>
          pushNotice('error', isApiRequestError(error) ? error.message : 'Não foi possível adicionar ao carrinho.'),
      }
    );
  };

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <nav aria-label="Navegação estrutural" className="mb-4">
        <Link to="/" className="inline-flex min-h-11 items-center underline">
          ← Voltar ao catálogo
        </Link>
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <Gallery key={nft.id} nft={nft} />

        <article className="flex flex-col gap-4" aria-labelledby="nft-title">
          <div className="flex items-start justify-between gap-2">
            <h1 id="nft-title" className="mb-0">
              {nft.title}
            </h1>
            <FavoriteButton nftId={nft.id} title={nft.title} />
          </div>
          <p className="text-muted">
            por {nft.artist} · {categoryLabel(nft.category)}
            {nft.rarity ? ` · ${rarityLabel(nft.rarity)}` : ''}
          </p>
          <p>{nft.description}</p>

          {nft.editions && nft.editions.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium">Edição</legend>
              {nft.editions.map((edition) => (
                <label
                  key={edition.id}
                  className={`min-h-11 items-center gap-3 rounded-md border p-2 ${edition.id === editionId ? 'border-primary bg-surface' : 'border-border'} ${edition.availableQuantity === 0 ? 'opacity-60' : ''}`}
                >
                  <input
                    type="radio"
                    name="edition"
                    value={edition.id}
                    checked={edition.id === editionId}
                    onChange={() => {
                      setChosenEdition(edition.id);
                      setRequested(1);
                    }}
                  />
                  <span className="min-w-0 flex-1">{edition.name}</span>
                  <span>{edition.price} ETH</span>
                  <span className="text-sm">{edition.availableQuantity === 0 ? 'Esgotada' : `${edition.availableQuantity} disp.`}</span>
                </label>
              ))}
            </fieldset>
          )}

          <p className="text-2xl font-bold" data-testid="nft-price">
            {offer.price} ETH
          </p>
          <p data-testid="nft-availability" role="status">
            {soldOut
              ? offer.editionId
                ? 'Edição esgotada.'
                : 'Esgotado.'
              : `${offer.maxQuantity} ${offer.maxQuantity === 1 ? 'unidade disponível' : 'unidades disponíveis'}`}
          </p>

          <div role="group" aria-label="Quantidade" className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Diminuir quantidade"
              disabled={soldOut || quantity <= 1}
              onClick={() => setRequested(quantity - 1)}
              className="text-lg"
            >
              −
            </Button>
            <output aria-live="polite" aria-label="Quantidade selecionada" data-testid="quantity" className="min-w-8 text-center text-lg">
              {quantity}
            </output>
            <Button
              variant="outline"
              size="icon"
              aria-label="Aumentar quantidade"
              disabled={soldOut || atLimit}
              aria-describedby={atLimit ? 'quantity-limit' : undefined}
              onClick={() => setRequested(quantity + 1)}
              className="text-lg"
            >
              +
            </Button>
          </div>
          {atLimit && (
            <p id="quantity-limit" className="text-sm text-muted">
              Limite atingido: máximo de {offer.maxQuantity} por compra.
            </p>
          )}

          <Button size="lg" disabled={soldOut || addToCart.isPending} aria-busy={addToCart.isPending} onClick={onAdd}>
            {addToCart.isPending ? 'Adicionando…' : session ? 'Adicionar ao carrinho' : 'Entrar para comprar'}
          </Button>
        </article>
      </div>
    </main>
  );
}

/** Reserva o espaço do conteúdo real (galeria quadrada + coluna de informações). */
export function NftDetailSkeleton() {
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8" aria-busy="true">
      <div role="status" aria-label="Carregando NFT" className="grid gap-8 md:grid-cols-2">
        <div>
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="mt-3 flex gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="size-16" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-11 w-40" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </main>
  );
}
