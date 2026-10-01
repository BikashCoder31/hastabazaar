import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CategoryRow, OccasionRow } from '@/lib/db/repositories/products';

interface CatalogueFiltersProps {
  query: string;
  categories: readonly CategoryRow[];
  occasions: readonly OccasionRow[];
  selectedCategories: readonly string[];
  selectedOccasions: readonly string[];
  sort: string;
  idPrefix?: string;
}

export function CatalogueFilters(props: CatalogueFiltersProps) {
  const idPrefix = props.idPrefix ?? 'catalogue';
  const hasFilters = Boolean(
    props.query ||
    props.selectedCategories.length ||
    props.selectedOccasions.length,
  );
  return (
    <form
      key={JSON.stringify([
        props.query,
        props.selectedCategories,
        props.selectedOccasions,
        props.sort,
      ])}
      action="/shop"
      method="get"
      className="rounded-3xl border bg-card p-5 shadow-sm"
    >
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
      <label
        htmlFor={`${idPrefix}-search`}
        className="mt-5 block text-sm font-semibold"
      >
        Search
      </label>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${idPrefix}-search`}
          name="q"
          defaultValue={props.query}
          maxLength={100}
          placeholder="Product, material, or maker"
          className="pl-9"
        />
      </div>
      <label
        htmlFor={`${idPrefix}-sort`}
        className="mt-5 block text-sm font-semibold"
      >
        Sort by
      </label>
      <select
        id={`${idPrefix}-sort`}
        name="sort"
        defaultValue={props.sort}
        className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm"
      >
        <option value="newest">Newest</option>
        <option value="price-low">Price: low to high</option>
        <option value="price-high">Price: high to low</option>
        <option value="name">Name</option>
      </select>

      <FilterGroup legend="Gift occasion">
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

      <FilterGroup legend="Category">
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

      <Button type="submit" className="mt-6 w-full">
        Show matching products
      </Button>
    </form>
  );
}

function FilterGroup({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mt-6 border-t pt-5">
      <legend className="pr-3 text-sm font-semibold">{legend}</legend>
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
      className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
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
