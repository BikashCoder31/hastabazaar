import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CategoryRow, OccasionRow } from '@/lib/db/repositories/products';
import type { PublishedFormConfig } from '@/lib/forms/types';
import { queryFieldPresentation } from '@/lib/catalog/shop-query';
import { cn } from '@/lib/utils';

interface CatalogueFiltersProps {
  query: string;
  categories: readonly CategoryRow[];
  occasions: readonly OccasionRow[];
  selectedCategories: readonly string[];
  selectedOccasions: readonly string[];
  sort: string;
  config: PublishedFormConfig;
  minimumPriceNpr?: string;
  shopperFilters?: { maximumPriceNpr?: string; readyToDispatch: boolean };
  idPrefix?: string;
  unavailable?: boolean;
  presentation?: 'panel' | 'sheet';
}

export function CatalogueFilters(props: CatalogueFiltersProps) {
  const idPrefix = props.idPrefix ?? 'catalogue';
  const inSheet = props.presentation === 'sheet';
  const search = queryFieldPresentation('catalog.filters', props.config, 'q', {
    label: 'Search',
    placeholder: 'Product, material, or maker',
  });
  const sort = queryFieldPresentation('catalog.filters', props.config, 'sort', {
    label: 'Sort by',
  });
  const category = queryFieldPresentation(
    'catalog.filters',
    props.config,
    'category',
    { label: 'Category' },
  );
  const occasion = queryFieldPresentation(
    'catalog.filters',
    props.config,
    'occasion',
    { label: 'Gift occasion' },
  );
  const priceField = props.config.fields.find(
    (field) => field.status === 'active' && field.key === 'minimum_price_npr',
  );
  const hasFilters = Boolean(
    props.query ||
    props.selectedCategories.length ||
    props.selectedOccasions.length ||
    props.minimumPriceNpr,
  );
  return (
    <form
      data-form-id="catalog.filters"
      key={JSON.stringify([
        props.query,
        props.selectedCategories,
        props.selectedOccasions,
        props.sort,
        props.minimumPriceNpr,
        props.shopperFilters,
      ])}
      action="/shop"
      method="get"
      data-catalog-filter-layout={inSheet ? 'sheet' : 'panel'}
      className={cn(
        'bg-card',
        inSheet
          ? 'flex min-h-0 flex-1 flex-col'
          : 'rounded-3xl border p-5 shadow-sm',
      )}
    >
      <div
        data-catalog-filter-body
        className={
          inSheet
            ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6'
            : undefined
        }
      >
        {!inSheet ? (
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-heading text-2xl">
              <SlidersHorizontal className="size-5 text-primary" /> Find a gift
            </h2>
            {hasFilters ? (
              <Link
                href="/shop"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Clear
              </Link>
            ) : null}
          </div>
        ) : null}
        <label
          htmlFor={`${idPrefix}-search`}
          className="mt-5 block text-sm font-semibold"
        >
          {search.label}
        </label>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`${idPrefix}-search`}
            name="q"
            defaultValue={props.query}
            maxLength={100}
            placeholder={search.placeholder}
            aria-describedby={
              search.helpText ? `${idPrefix}-search-help` : undefined
            }
            className="pl-9"
          />
        </div>
        {search.helpText ? (
          <p
            id={`${idPrefix}-search-help`}
            className="mt-2 text-sm text-muted-foreground"
          >
            {search.helpText}
          </p>
        ) : null}
        <label
          htmlFor={`${idPrefix}-sort`}
          className="mt-5 block text-sm font-semibold"
        >
          {sort.label}
        </label>
        <select
          id={`${idPrefix}-sort`}
          name="sort"
          defaultValue={props.sort}
          aria-describedby={sort.helpText ? `${idPrefix}-sort-help` : undefined}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {props.shopperFilters ? <option value="relevance">Best match</option> : null}
          <option value="newest">Newest</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
          <option value="name">Name</option>
        </select>
        {sort.helpText ? (
          <p
            id={`${idPrefix}-sort-help`}
            className="mt-2 text-sm text-muted-foreground"
          >
            {sort.helpText}
          </p>
        ) : null}

        {props.shopperFilters ? (
          <div className="mt-5 space-y-3">
            <label htmlFor={`${idPrefix}-maximum-price`} className="block text-sm font-semibold">Maximum price in NPR</label>
            <input id={`${idPrefix}-maximum-price`} name="maxPrice" type="number" inputMode="decimal" min="0" step="0.01" max="1000000000"
              defaultValue={props.shopperFilters.maximumPriceNpr ?? ''} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm" />
            <FilterOption idPrefix={idPrefix} name="ready" value="1" label="Ready to dispatch" checked={props.shopperFilters.readyToDispatch} />
          </div>
        ) : null}

        {priceField ? (
          <div className="mt-5">
            <label
              htmlFor={`${idPrefix}-minimum-price`}
              className="block text-sm font-semibold"
            >
              {priceField.label}
              {priceField.required ? <span aria-hidden="true"> *</span> : null}
            </label>
            <input
              id={`${idPrefix}-minimum-price`}
              name="custom.minimum_price_npr"
              type="number"
              inputMode="decimal"
              min={Math.max(0, priceField.min ?? 0)}
              max={Math.min(1_000_000_000, priceField.max ?? 1_000_000_000)}
              step={priceField.integerOnly ? '1' : '0.01'}
              required={priceField.required}
              aria-required={priceField.required}
              defaultValue={props.minimumPriceNpr ?? ''}
              placeholder={priceField.placeholder ?? 'NPR'}
              aria-describedby={
                priceField.helpText
                  ? `${idPrefix}-minimum-price-help`
                  : undefined
              }
              className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
            />
            {priceField.helpText ? (
              <p
                id={`${idPrefix}-minimum-price-help`}
                className="mt-2 text-sm text-muted-foreground"
              >
                {priceField.helpText}
              </p>
            ) : null}
          </div>
        ) : null}

        <FilterGroup legend={occasion.label} helpText={occasion.helpText}>
          {props.occasions.map((occasion) => (
            <FilterOption
              key={occasion.id}
              idPrefix={idPrefix}
              name="occasion"
              value={occasion.slug}
              checked={props.selectedOccasions.includes(occasion.slug)}
              label={occasion.nameEn}
            />
          ))}
        </FilterGroup>

        <FilterGroup legend={category.label} helpText={category.helpText}>
          {props.categories.map((category) => (
            <FilterOption
              key={category.id}
              idPrefix={idPrefix}
              name="category"
              value={category.slug}
              checked={props.selectedCategories.includes(category.slug)}
              label={category.nameEn}
            />
          ))}
        </FilterGroup>
      </div>
      <div
        data-catalog-filter-actions
        className={
          inSheet
            ? 'shrink-0 border-t bg-card px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'mt-6'
        }
      >
        <Button
          type="submit"
          disabled={props.unavailable}
          className={cn('w-full', inSheet && 'min-h-11')}
        >
          Show matching products
        </Button>
        {inSheet ? (
          <Link
            href="/shop"
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg border text-sm font-semibold text-primary hover:bg-muted"
          >
            Reset filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function FilterGroup({
  legend,
  children,
  helpText,
}: {
  legend: string;
  children: React.ReactNode;
  helpText?: string;
}) {
  return (
    <fieldset className="mt-6 border-t pt-5">
      <legend className="pr-3 text-sm font-semibold">{legend}</legend>
      {helpText ? (
        <p className="mt-2 text-sm text-muted-foreground">{helpText}</p>
      ) : null}
      <div className="mt-3 space-y-2.5">{children}</div>
    </fieldset>
  );
}

function FilterOption({
  idPrefix,
  name,
  value,
  checked,
  label,
}: {
  idPrefix: string;
  name: string;
  value: string;
  checked: boolean;
  label: string;
}) {
  const id = `${idPrefix}-filter-${name}-${value}`;
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
    >
      <input
        id={id}
        name={name}
        value={value}
        type="checkbox"
        defaultChecked={checked}
        className="mt-1 size-4 rounded border-border accent-primary"
      />
      <span className="min-w-0 text-sm font-medium leading-5">{label}</span>
    </label>
  );
}
