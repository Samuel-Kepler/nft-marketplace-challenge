import { useState, type FormEvent } from 'react';
import type { CatalogFilter } from '@/shared/schemas/nft';
import {
  CATEGORY_OPTIONS,
  RARITY_OPTIONS,
  SORT_OPTIONS,
  clearedSearch,
  hasActiveFilters,
  parsePriceRange,
} from '../catalog';
import { Button } from '@/shared/ui/button';
import type { CatalogSearch } from '../search';

interface CatalogFiltersProps {
  search: CatalogSearch;
  onChange: (patch: Partial<CatalogFilter>) => void;
  onClear: (next: CatalogSearch) => void;
}

const LABEL = 'mb-1 block text-sm font-medium';

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  emptyLabel: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}

function SelectField({ id, label, value, emptyLabel, options, onChange }: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} className="w-full" value={value} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Todos os controles refletem a URL (valor vem de `search`) e disparam `onChange`. */
export function CatalogFilters({ search, onChange, onClear }: CatalogFiltersProps) {
  const [priceError, setPriceError] = useState<string | null>(null);

  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = String(new FormData(e.currentTarget).get('search') ?? '').trim();
    onChange({ search: term || undefined });
  };

  const submitPrice = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const result = parsePriceRange(String(data.get('minPrice') ?? ''), String(data.get('maxPrice') ?? ''));
    if (!result.ok) return setPriceError(result.message);
    setPriceError(null);
    onChange({ minPrice: result.minPrice, maxPrice: result.maxPrice });
  };

  const priceProps = {
    'aria-invalid': priceError ? (true as const) : undefined,
    'aria-describedby': priceError ? 'price-error' : undefined,
    inputMode: 'decimal' as const,
    className: 'w-full sm:w-36',
  };

  return (
    <section aria-label="Busca e filtros" className="mb-6 grid gap-4 rounded-lg border border-border bg-surface p-3 sm:p-4">
      <form role="search" onSubmit={submitSearch} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="catalog-search" className={LABEL}>
            Buscar NFTs
          </label>
          <input
            id="catalog-search"
            name="search"
            type="search"
            // A chave recria o campo quando a URL muda (voltar/avançar no histórico).
            key={search.search ?? ''}
            defaultValue={search.search ?? ''}
            placeholder="Título, artista ou descrição"
            className="w-full"
          />
        </div>
        <Button type="submit">Buscar</Button>
      </form>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <SelectField
          id="filter-category"
          label="Categoria"
          emptyLabel="Todas"
          options={CATEGORY_OPTIONS}
          value={search.category ?? ''}
          onChange={(category) => onChange({ category })}
        />
        <SelectField
          id="filter-rarity"
          label="Raridade"
          emptyLabel="Todas"
          options={RARITY_OPTIONS}
          value={search.rarity ?? ''}
          onChange={(rarity) => onChange({ rarity })}
        />
        <SelectField
          id="filter-sort"
          label="Ordenar por"
          emptyLabel="Relevância"
          options={SORT_OPTIONS}
          value={search.sortBy ?? ''}
          onChange={(sortBy) => onChange({ sortBy: sortBy as CatalogFilter['sortBy'] })}
        />
        <div className="flex items-end">
          <label className="min-h-11 items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={search.featured === true}
              onChange={(e) => onChange({ featured: e.target.checked || undefined })}
            />
            Somente destaques
          </label>
        </div>
      </div>

      <form
        onSubmit={submitPrice}
        noValidate
        // Recria os campos quando a faixa da URL muda por fora (histórico, limpar filtros).
        key={`${search.minPrice ?? ''}-${search.maxPrice ?? ''}`}
        className="flex flex-wrap items-start gap-2"
      >
        <div className="min-w-0 flex-1 basis-36 sm:flex-none">
          <label htmlFor="filter-min" className={LABEL}>
            Preço mínimo (ETH)
          </label>
          <input id="filter-min" name="minPrice" defaultValue={search.minPrice ?? ''} {...priceProps} />
        </div>
        <div className="min-w-0 flex-1 basis-36 sm:flex-none">
          <label htmlFor="filter-max" className={LABEL}>
            Preço máximo (ETH)
          </label>
          <input id="filter-max" name="maxPrice" defaultValue={search.maxPrice ?? ''} {...priceProps} />
        </div>
        <Button type="submit" variant="outline" className="mt-6">
          Aplicar preço
        </Button>
        {hasActiveFilters(search) && (
          <Button variant="outline" className="mt-6" onClick={() => onClear(clearedSearch(search))}>
            Limpar filtros
          </Button>
        )}
        {priceError && (
          <p id="price-error" role="alert" className="w-full">
            {priceError}
          </p>
        )}
      </form>
    </section>
  );
}
