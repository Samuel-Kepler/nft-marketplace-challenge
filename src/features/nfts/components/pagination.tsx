import { Link } from '@tanstack/react-router';
import { pageWindow } from '../catalog';
import { withFilterChange, type CatalogSearch } from '../search';

const BASE = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-input px-3 no-underline';

/** Links reais para `/?…&page=N`: abrem em nova aba, entram no histórico e funcionam por teclado. */
export function Pagination({ search, page, totalPages }: { search: CatalogSearch; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const to = (p: number) => withFilterChange(search, { page: p });
  return (
    <nav aria-label="Paginação" className="mt-6 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link to="/" search={to(page - 1)} className={BASE}>
          Anterior
        </Link>
      ) : (
        <span aria-disabled="true" className={`${BASE} text-muted opacity-60`}>
          Anterior
        </span>
      )}
      <ul className="flex items-center gap-1">
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                to="/"
                search={to(p)}
                aria-label={`Página ${p}`}
                aria-current={p === page ? 'page' : undefined}
                className={`${BASE} ${p === page ? 'border-primary bg-primary font-semibold text-primary-foreground hover:text-primary-foreground' : 'hover:bg-surface'}`}
              >
                {p}
              </Link>
            </li>
          )
        )}
      </ul>
      {page < totalPages ? (
        <Link to="/" search={to(page + 1)} className={BASE}>
          Próxima
        </Link>
      ) : (
        <span aria-disabled="true" className={`${BASE} text-muted opacity-60`}>
          Próxima
        </span>
      )}
      <p className="w-full text-center text-sm text-muted" aria-live="polite">
        Página {page} de {totalPages}
      </p>
    </nav>
  );
}
