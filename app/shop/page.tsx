import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { MessageCircle, PackageOpen, Search } from 'lucide-react';

import { CatalogueFilters } from '@/components/catalog/catalog-filters';
import { MobileCatalogFilters } from '@/components/catalog/mobile-catalog-filters';
import { ProductDiscount } from '@/components/catalog/product-discount';
import { SearchSuggestionField } from '@/components/catalog/search-suggestion-field';
import { ShopSort } from '@/components/catalog/shop-sort';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { loadShopQueryConfig, parseShopQueryCriteria, queryFieldPresentation } from '@/lib/catalog/shop-query';
import { companyPublicContacts } from '@/lib/content/company-details';
import { requireDatabase } from '@/lib/db/d1';
import {
  countPublishedProducts,
  listActiveOccasions,
  listPublicDiscoveryCategories,
  listPublishedProducts,
  type PublicCatalogueFilters,
  type PublicProductRow,
} from '@/lib/db/repositories/products';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { mediaFrameClass, mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, unknown>> }): Promise<Metadata> {
  const filtered = Object.keys(await searchParams).length > 0;
  return {
    alternates: { canonical: 'https://hastabazaar.com/shop' },
    robots: { index: !filtered, follow: true },
    title: 'Shop products',
    description: 'Browse gifts and everyday finds from marketplace sellers. Read each listing for materials, origin and seller details.',
  };
}

type ShopSearchParams = Record<string, string | string[] | undefined>;
type TaxonomyOption = { slug: string; nameEn: string };
type CatalogueSort = NonNullable<PublicCatalogueFilters['sort']>;
const sortOptions = new Set<CatalogueSort>(['relevance', 'newest', 'price-low', 'price-high', 'name']);
const shopShell = 'mx-auto w-[calc(100%-2rem)] max-w-[1264px] md:w-[calc(100%-6rem)]';
const chipClass = 'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const chipColour = (active: boolean) => active ? 'border-[#14213d] bg-[#14213d] text-white' : 'border-[#d9c8ae] bg-[#fffdf9] text-[#14213d] hover:border-primary';
const money = (paisa: number) => formatPaisaExact(paisa).replace(/\.00$/, '');

function values(value: string | string[] | undefined) {
  return [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(item => item.trim()).filter(Boolean))];
}

function filterEntries(params: ShopSearchParams, omit: readonly string[] = []): [string, string][] {
  const keys = ['q', 'sort', 'category', 'occasion', 'ready', 'maxPrice', 'custom.minimum_price_npr'];
  return keys.filter(key => !omit.includes(key)).flatMap(key => values(params[key]).map((value): [string, string] => [key, value]));
}

function shopHref(params: ShopSearchParams, key: string, next: readonly string[] = []) {
  const query = new URLSearchParams(filterEntries(params, [key]));
  for (const value of next) query.append(key, value);
  return query.size ? `/shop?${query}` : '/shop';
}

function readMaximumPrice(raw: string | string[] | undefined) {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw))
    throw new RangeError('Enter a maximum price in NPR using up to two decimal places.');
  const [rupees, fraction = ''] = raw.split('.');
  const amount = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount > 100_000_000_000) throw new RangeError('The maximum price is outside the supported NPR range.');
  return amount;
}

function HiddenFilters({ entries }: { entries: readonly [string, string][] }) {
  return entries.map(([name, value], index) => <input key={`${name}-${index}`} type="hidden" name={name} value={value} />);
}

function TaxonomyFilter({ name, label, options, selected, params }: {
  name: 'category' | 'occasion';
  label: string;
  options: readonly TaxonomyOption[];
  selected: readonly string[];
  params: ShopSearchParams;
}) {
  if (!options.length) return null;
  const active = options.filter(option => selected.includes(option.slug));
  return (
    <details className="relative min-w-0">
      <summary className={`${chipClass} ${chipColour(active.length > 0)} max-w-full list-none wrap-break-word [&::-webkit-details-marker]:hidden`}>
        {active[0]?.nameEn ?? label}{active.length > 1 ? ` +${active.length - 1}` : ''}
      </summary>
      <ul className="z-30 mt-2 max-h-56 w-52 max-w-[calc(100vw-3rem)] overflow-auto rounded-xl border border-[#e2d6c2] bg-[#fffdf9] p-1.5 shadow-lg sm:absolute">
        {options.map(option => {
          const on = selected.includes(option.slug);
          return (
            <li key={option.slug}>
              <Link href={shopHref(params, name, on ? selected.filter(slug => slug !== option.slug) : [...selected, option.slug])}
                className="flex min-h-11 items-center rounded-lg px-2.5 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">
                {option.nameEn}{on ? <span className="ml-1 text-muted-foreground"> · Selected</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<ShopSearchParams> }) {
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [params, categories, occasions, formState] = await Promise.all([
    searchParams,
    listPublicDiscoveryCategories(database),
    listActiveOccasions(database),
    loadShopQueryConfig(database).then((config) => ({ config, unavailable: false }),
      () => ({ config: { formId: 'catalog.filters', version: 0, publishedAt: 0, fields: [] }, unavailable: true })),
  ]);
  const formConfig = formState.config;
  let priceCriteria: ReturnType<typeof parseShopQueryCriteria> = {};
  let maximumPricePaisa: number | undefined;
  let queryError = formState.unavailable ? 'Shop filters are unavailable. Refresh the page and try again.' : '';
  try {
    if (!formState.unavailable) priceCriteria = parseShopQueryCriteria(formConfig, params);
    maximumPricePaisa = readMaximumPrice(params.maxPrice);
  } catch (error) {
    queryError = error instanceof Error ? error.message : 'Shop filters are unavailable.';
  }

  const query = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 100) ?? '';
  const categorySet = new Set(categories.map(item => item.slug));
  const occasionSet = new Set(occasions.map(item => item.slug));
  const selectedCategories = values(params.category).filter(slug => categorySet.has(slug));
  const selectedOccasions = values(params.occasion).filter(slug => occasionSet.has(slug));
  const readyToDispatch = params.ready === '1';
  const maximumPriceNpr = maximumPricePaisa === undefined ? undefined : String(maximumPricePaisa / 100);
  const sortValue = values(params.sort)[0] as CatalogueSort | undefined;
  const sort = sortValue && sortOptions.has(sortValue) ? sortValue : query ? 'relevance' : 'newest';
  const pageValue = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10_000) : 1;
  const pageSize = 20;
  const activeCount = selectedCategories.length + selectedOccasions.length + Number(readyToDispatch)
    + Number(maximumPricePaisa !== undefined) + Number(priceCriteria.minimumPricePaisa !== undefined);
  const filterValues = { query, categorySlugs: selectedCategories, occasionSlugs: selectedOccasions,
    minimumPricePaisa: priceCriteria.minimumPricePaisa, maximumPricePaisa, readyToDispatch };
  const total = queryError ? 0 : await countPublishedProducts(database, filterValues);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const products = queryError || !total ? [] : await listPublishedProducts(database, { ...filterValues, sort, page: safePage, limit: pageSize });
  const alternatives = !queryError && !products.length && (query || activeCount)
    ? await listPublishedProducts(database, { categorySlugs: selectedCategories, limit: 4 }) : [];
  const suggestedCategory = categories.find(category => category.slug === selectedCategories[0])
    ?? categories.find(category => category.nameEn === alternatives[0]?.categoryName);
  const words = query.split(/\s+/);
  const shorterQueries = [...new Set([words.slice(0, 2).join(' '), words.at(-1) ?? ''])]
    .filter(candidate => candidate.length > 1 && candidate !== query);
  const searchField = queryFieldPresentation('catalog.filters', formConfig, 'q', { label: 'Search the shop', placeholder: 'Search gifts, crafts & makers…' });
  const sortField = queryFieldPresentation('catalog.filters', formConfig, 'sort', { label: 'Sort' });
  return (
    <div className="min-h-screen bg-[#f5efe3] text-[#14213d]">
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className={`${shopShell} space-y-5 pb-16 pt-6 sm:pt-9`}>
        <search aria-label="Search the shop" className="max-w-[55rem]">
          <form action="/shop" method="get"
            className="flex min-h-14 items-center gap-2 rounded-2xl border border-[#d9c8ae] bg-[#fffdf9] p-1.5 pl-3 focus-within:border-[#14213d] focus-within:ring-2 focus-within:ring-[#14213d]/15 sm:gap-3 sm:pl-5">
            <HiddenFilters entries={filterEntries(params, ['q'])} />
            <Search className="size-5 shrink-0 text-[#675b4e]" aria-hidden="true" />
            <SearchSuggestionField key={query} id="shop-results-search" initialQuery={query} label={searchField.label}
              placeholder={searchField.placeholder} helpId={searchField.helpText ? 'shop-results-search-help' : undefined}
              className="min-h-11 w-full border-0 bg-transparent p-0 text-base text-[#14213d] placeholder:text-muted-foreground focus-visible:ring-0" />
            <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-[#a8232e] px-3.5 text-sm font-semibold text-white hover:bg-[#8f1b25] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Search</button>
          </form>
          {searchField.helpText ? <p id="shop-results-search-help" className="mt-1 text-sm text-muted-foreground">{searchField.helpText}</p> : null}
        </search>
        {queryError ? <p role="alert" className="rounded-xl border border-destructive p-4 text-sm text-destructive">{queryError} <Link href="/shop" className="inline-flex min-h-11 items-center font-semibold underline">Clear all filters</Link></p> : null}

        {!queryError && !products.length && (query || activeCount) ? (
          <>
            <section className="max-w-[55rem] space-y-4 rounded-2xl border border-[#e2d6c2] bg-[#fffdf9] p-5 sm:p-8">
              <h1 className="wrap-break-word font-heading text-3xl font-semibold">{query ? `No results for “${query}”` : 'No products match these filters'}</h1>
              <p className="text-[#46536f]">Try fewer words, or browse one of these:</p>
              <div className="flex flex-wrap gap-2">
                {shorterQueries.map(candidate => <Link key={candidate} href={shopHref({}, 'q', [candidate])} className={`${chipClass} ${chipColour(false)} wrap-break-word`}>{candidate}</Link>)}
                {suggestedCategory ? <Link href={shopHref({}, 'category', [suggestedCategory.slug])} className={`${chipClass} ${chipColour(false)}`}>All {suggestedCategory.nameEn.toLowerCase()}</Link> : null}
                <Link href="/shop" className={`${chipClass} ${chipColour(false)}`}>Browse all products</Link>
              </div>
              <p className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f5efe3] p-3 text-sm text-[#46536f]">
                <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>Looking for something specific? <a href={companyPublicContacts.whatsappUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-semibold text-[#a8232e] underline">Ask us on WhatsApp</a> and we’ll help you look.</span>
              </p>
            </section>
            {alternatives.length ? <section aria-label="You might like" className="space-y-4"><h2 className="text-lg font-semibold">You might like</h2><ShopProductGrid products={alternatives} /></section> : null}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="wrap-break-word font-heading text-3xl font-semibold tracking-tight sm:text-[2rem]">
                  {query ? `“${query}” · ${total} ${total === 1 ? 'result' : 'results'}` : 'Shop all'}
                </h1>
                {!query ? <p className="text-sm text-[#46536f]">{total} {total === 1 ? 'product' : 'products'}</p> : null}
              </div>
              <ShopSort entries={filterEntries(params, ['sort'])} value={sort} {...sortField} />
            </div>
            <div aria-label="Quick filters" className="flex flex-wrap items-start gap-2">
              <Link href={shopHref(params, 'ready', readyToDispatch ? [] : ['1'])}
                className={`${chipClass} ${chipColour(readyToDispatch)}`}>
                Ready to dispatch{readyToDispatch ? <span className="sr-only"> · Selected, remove filter</span> : null}
              </Link>
              <details className="relative">
                <summary className={`${chipClass} ${chipColour(maximumPricePaisa !== undefined)} list-none [&::-webkit-details-marker]:hidden`}>
                  {maximumPricePaisa === undefined ? 'Price' : `Up to ${money(maximumPricePaisa)}`}
                </summary>
                <form action="/shop" method="get" className="z-30 mt-2 w-48 max-w-[calc(100vw-3rem)] space-y-2 rounded-xl border border-[#e2d6c2] bg-[#fffdf9] p-3 shadow-lg sm:absolute">
                  <HiddenFilters entries={filterEntries(params, ['maxPrice'])} />
                  <label htmlFor="quick-max-price" className="block text-sm font-semibold">Maximum price in NPR</label>
                  <input id="quick-max-price" name="maxPrice" type="number" min="0" max="1000000000" step="0.01" inputMode="decimal"
                    defaultValue={maximumPriceNpr} className="min-h-11 w-full rounded-lg border bg-white px-2" />
                  <button type="submit" className="min-h-11 w-full rounded-lg bg-[#14213d] px-3 text-sm font-semibold text-white">Apply price</button>
                  {maximumPricePaisa !== undefined ? <Link href={shopHref(params, 'maxPrice')} className="inline-flex min-h-11 items-center text-sm text-primary underline">Clear price</Link> : null}
                </form>
              </details>
              <TaxonomyFilter name="category" label="Category" options={categories} selected={selectedCategories} params={params} />
              <TaxonomyFilter name="occasion" label="Occasion" options={occasions} selected={selectedOccasions} params={params} />
              <MobileCatalogFilters chip activeCount={activeCount}>
                <CatalogueFilters query={query} categories={categories} occasions={occasions} selectedCategories={selectedCategories}
                  selectedOccasions={selectedOccasions} sort={sort} config={formConfig} unavailable={formState.unavailable}
                  minimumPriceNpr={priceCriteria.minimumPriceNpr} shopperFilters={{ maximumPriceNpr, readyToDispatch }}
                  idPrefix="full-catalogue" presentation="sheet" />
              </MobileCatalogFilters>
            </div>
            {products.length ? <ShopProductGrid products={products} /> : !queryError ? (
              <div className="rounded-2xl border border-[#e2d6c2] bg-[#fffdf9] px-6 py-14 text-center">
                <PackageOpen className="mx-auto size-10 text-primary" aria-hidden="true" />
                <h2 className="mt-4 font-heading text-2xl">The first collection is being prepared</h2>
                <p className="mx-auto mt-3 max-w-lg text-muted-foreground">Published products will appear here.</p>
              </div>
            ) : null}
          </>
        )}
        {totalPages > 1 ? <nav aria-label="Product pages" className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <PageLink page={safePage - 1} disabled={safePage <= 1} params={params}>Previous</PageLink>
          <span className="text-sm text-muted-foreground">Page {safePage} of {totalPages}</span>
          <PageLink page={safePage + 1} disabled={safePage >= totalPages} params={params}>Next</PageLink>
        </nav> : null}
      </main>
      <SiteFooter />
    </div>
  );
}

function ShopProductGrid({ products }: { products: readonly PublicProductRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:gap-x-5 lg:grid-cols-4">
      {products.map(product => {
        const ready = product.purchasable && product.inventoryQuantity > 0 && !product.madeToOrder && product.preparationDays === 0;
        return (
          <Link key={product.id} href={`/products/${product.slug}`} className="group min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <div data-media-frame="cover" className={mediaFrameClass('cover', 'aspect-square rounded-[14px] border border-[#e2d6c2] bg-[#fffdf9]')}>
              {product.primaryMediaId ? (
                <Image src={`/api/product-media/${product.primaryMediaId}`} alt={product.nameEn} data-media-mode="cover" width={720} height={720}
                  unoptimized sizes={mediaSizes.shopGrid} className={mediaObjectClass('cover', 'transition-transform duration-300 group-hover:scale-[1.035] motion-reduce:transition-none')} />
              ) : <div className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center text-muted-foreground">
                <PackageOpen className="size-7" aria-hidden="true" /><span className="text-xs">Photo coming soon</span>
              </div>}
              {ready ? <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-full bg-[#e0eee5] px-2 py-1 text-xs font-semibold leading-tight text-[#1f664b]">Ready to dispatch</span> : null}
            </div>
            <p className="mt-2.5 wrap-break-word text-[15px] font-semibold leading-snug">{product.nameEn}</p>
            <p className="mt-0.5 wrap-break-word text-sm text-[#675b4e]">
              {product.participationRoute === 'managed_maker' ? <>
                Supplied by {product.makerName ?? product.tradingName}
                <span className="block">{product.legalSellerName ? `Sold and invoiced by ${product.legalSellerName}` : 'Seller and invoice identity require review'}</span>
              </> : <><span className="sr-only">Sold by </span>{product.tradingName}<span className="sr-only"> · Through Hastabazaar</span></>}
            </p>
            <p className="mt-2 font-semibold">{product.pricePaisa === null ? 'Price unavailable' : `${product.priceFrom ? 'From ' : ''}${money(product.pricePaisa)}`}</p>
            <ProductDiscount pricePaisa={product.pricePaisa} originalPaisa={product.compareAtPricePaisa} />
            {!product.purchasable || product.inventoryQuantity < 1 ? <p className="mt-1 text-xs text-[#675b4e]">Currently unavailable to order</p> : null}
          </Link>
        );
      })}
    </div>
  );
}

function PageLink({ page, disabled, params, children }: { page: number; disabled: boolean; params: ShopSearchParams; children: React.ReactNode }) {
  const style = 'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold';
  return disabled ? <span aria-disabled="true" className={`${style} text-muted-foreground opacity-50`}>{children}</span>
    : <Link href={shopHref(params, 'page', [String(page)])} className={`${style} bg-[#fffdf9] hover:bg-muted`}>{children}</Link>;
}
