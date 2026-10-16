import { createFileRoute, Link } from '@tanstack/react-router';
import { CatalogFilters } from '@/features/nfts/components/catalog-filters';
import { NFT_GRID_CLASS, NftCard, NftGridSkeleton } from '@/features/nfts/components/nft-card';
import { Pagination } from '@/features/nfts/components/pagination';
import { hasActiveFilters } from '@/features/nfts/catalog';
import { nftListOptions, useNftList } from '@/features/nfts/queries';
import { parseCatalogSearch, toCatalogFilter, withFilterChange } from '@/features/nfts/search';
import { Button } from '@/shared/ui/button';
import type { CatalogFilter } from '@/shared/schemas/nft';

const FEATURED_FILTER = toCatalogFilter({ featured: true, limit: 4 });

export const Route = createFileRoute('/')({
  // A URL é a fonte do estado do catálogo: busca, filtros, ordenação e página sobrevivem a refresh e histórico.
  validateSearch: parseCatalogSearch,
  loaderDeps: ({ search }) => search,
  // Prefetch sem `await`: a tela renderiza já (com skeleton) e a query do componente reaproveita a mesma
  // requisição. `prefetchQuery` não lança: falhas aparecem no estado de erro da tela, com nova tentativa.
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(nftListOptions(toCatalogFilter(deps)));
  },
  component: HomePage,
});

function FeaturedSection() {
  const { data, isPending, isError } = useNftList(FEATURED_FILTER);
  // Destaque é complemento: se falhar, o catálogo abaixo continua utilizável.
  if (isError || (data && data.items.length === 0)) return null;
  return (
    <section aria-labelledby="featured-title" className="mb-10">
      <h2 id="featured-title">
        Destaques
      </h2>
      {isPending || !data ? (
        <NftGridSkeleton count={4} label="Carregando destaques" />
      ) : (
        <ul className={NFT_GRID_CLASS}>
          {data.items.map((nft, i) => (
            <NftCard key={nft.id} nft={nft} priority={i === 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HomePage() {
  const search = Route.useSearch();
  const filter = toCatalogFilter(search);
  const navigate = Route.useNavigate();
  const { data, isPending, isError, isFetching, isPlaceholderData, refetch } = useNftList(filter);
  const change = (patch: Partial<CatalogFilter>) => void navigate({ search: withFilterChange(search, patch) });
  const showFeatured = !hasActiveFilters(search) && !search.page;

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="mb-0">NFT Marketplace</h1>
        <nav aria-label="Principal" className="flex gap-2">
          <Link to="/cart" className="inline-flex min-h-11 items-center px-2 font-medium">
            Carrinho
          </Link>
          <Link to="/profile" className="inline-flex min-h-11 items-center px-2 font-medium">
            Perfil
          </Link>
        </nav>
      </header>

      {showFeatured && <FeaturedSection />}

      <h2>Catálogo</h2>
      <CatalogFilters search={search} onChange={change} onClear={(next) => void navigate({ search: next })} />

      <div aria-busy={isPending || isFetching} data-testid="catalog-results">
        {isPending && <NftGridSkeleton count={8} label="Carregando catálogo" />}

        {isError && (
          <div role="alert">
            <p>Não foi possível carregar o catálogo.</p>
            <Button variant="outline" className="mt-2" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {data && (
          <>
            <p role="status" className="mb-3 text-sm text-muted">
              {data.total === 0
                ? 'Nenhum resultado.'
                : `${data.total} ${data.total === 1 ? 'NFT encontrado' : 'NFTs encontrados'}`}
              {isPlaceholderData && isFetching ? ' · atualizando…' : ''}
            </p>

            {data.items.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface p-6 text-center">
                <p className="font-medium">Nenhum NFT encontrado.</p>
                {data.total > 0 ? (
                  <Link to="/" search={withFilterChange(search, { page: 1 })} className="underline">
                    Voltar à primeira página
                  </Link>
                ) : (
                  <p className="text-sm text-muted">Ajuste a busca ou limpe os filtros para ver mais resultados.</p>
                )}
              </div>
            ) : (
              <ul className={`${NFT_GRID_CLASS} ${isPlaceholderData ? 'opacity-60 transition-opacity' : ''}`}>
                {data.items.map((nft) => (
                  <NftCard key={nft.id} nft={nft} />
                ))}
              </ul>
            )}
            <Pagination search={search} page={data.page} totalPages={data.totalPages} />
          </>
        )}
      </div>
    </main>
  );
}
