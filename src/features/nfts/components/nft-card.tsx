import { Link } from '@tanstack/react-router';
import { Skeleton } from '@/shared/ui/skeleton';
import type { Nft } from '@/shared/schemas/nft';
import { categoryLabel } from '../catalog';
import { FavoriteButton } from './favorite-button';
import { NftImage } from './nft-image';

export const NFT_GRID_CLASS = 'grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4';

export function NftCard({ nft, priority = false }: { nft: Nft; priority?: boolean }) {
  return (
    <li className="relative flex flex-col overflow-hidden rounded-lg border border-border bg-background transition-shadow focus-within:shadow-md hover:shadow-md" data-testid={`nft-card-${nft.id}`}>
      <Link
        to="/nft/$nftId"
        params={{ nftId: nft.id }}
        className="flex flex-1 flex-col text-foreground no-underline hover:text-foreground"
      >
        <NftImage
          src={nft.imageUrl}
          alt={`Arte do NFT ${nft.title}`}
          width={320}
          height={320}
          priority={priority}
          className="aspect-square w-full object-cover"
        />
        <div className="flex flex-1 flex-col gap-1 p-3">
          <h3 className="text-base font-semibold">{nft.title}</h3>
          <p className="text-sm text-muted">
            {nft.artist} · {categoryLabel(nft.category)}
          </p>
          <p className="mt-auto flex items-center justify-between pt-2">
            <span className="font-semibold">{nft.price} ETH</span>
            {!nft.isAvailable && <span className="rounded-md border border-danger bg-danger-surface px-2 py-0.5 text-xs font-semibold text-danger">Esgotado</span>}
          </p>
        </div>
      </Link>
      <FavoriteButton nftId={nft.id} title={nft.title} className="absolute right-2 top-2" />
    </li>
  );
}

/** Mesmas dimensões do cartão real: nada se move quando os dados chegam. */
export function NftGridSkeleton({ count = 8, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      <ul className={NFT_GRID_CLASS}>
        {Array.from({ length: count }, (_, i) => (
          <li key={i} aria-hidden="true" className="overflow-hidden rounded-lg border border-border bg-background">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="mt-2 h-6 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
