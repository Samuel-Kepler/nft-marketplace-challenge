import { createFileRoute, Link } from '@tanstack/react-router';
import { NftDetail, NftDetailSkeleton } from '@/features/nfts/components/nft-detail';
import { nftDetailOptions, useNft } from '@/features/nfts/queries';
import { Button } from '@/shared/ui/button';
import { isApiRequestError } from '@/shared/api/errors';

export const Route = createFileRoute('/nft/$nftId')({
  // Sem `await`: o skeleton aparece enquanto a requisição (compartilhada com `useNft`) está em andamento.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(nftDetailOptions(params.nftId));
  },
  component: NftDetailPage,
});

function NftDetailPage() {
  const { nftId } = Route.useParams();
  const { data, isPending, error, refetch, isFetching } = useNft(nftId);

  if (isPending) return <NftDetailSkeleton />;
  if (isApiRequestError(error) && error.status === 404) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <h1>NFT não encontrado</h1>
        <p className="my-2">O NFT “{nftId}” não existe ou foi removido.</p>
        <Link to="/" className="underline">
          Voltar ao catálogo
        </Link>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <div role="alert">
          <p>Não foi possível carregar este NFT.</p>
          <Button variant="outline" className="mt-2" disabled={isFetching} onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
        <Link to="/" className="mt-4 inline-flex min-h-11 items-center underline">
          Voltar ao catálogo
        </Link>
      </main>
    );
  }
  return <NftDetail nft={data} />;
}
