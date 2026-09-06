import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PackageOpen } from 'lucide-react';

import { CatalogueFilters } from '@/components/catalog/catalog-filters';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireDatabase } from '@/lib/db/d1';
import { countPublishedProducts, listActiveOccasions, listPublicDiscoveryCategories, listPublishedProducts } from '@/lib/db/repositories/products';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shop handmade products',
  description: 'Browse verified handmade products from approved makers and businesses across Nepal.',
};

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100);
}

type ShopSearchParams = Record<string, string | string[] | undefined>;

function values(value: string | string[] | undefined): string[] {
  const input = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(input.map((item) => item.trim()).filter(Boolean))];
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<ShopSearchParams> }) {
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const params = await searchParams;
  const [categories, occasions] = await Promise.all([
    listPublicDiscoveryCategories(database),
    listActiveOccasions(database),
  ]);
  const query = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 100) ?? '';
  const categorySet = new Set(categories.map((item) => item.slug));
  const occasionSet = new Set(occasions.map((item) => item.slug));
  const selectedCategories = values(params.category).filter((slug) => categorySet.has(slug));
  const selectedOccasions = values(params.occasion).filter((slug) => occasionSet.has(slug));
  const sortValue = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort = ['newest', 'price-low', 'price-high', 'name'].includes(sortValue ?? '') ? sortValue as 'newest' | 'price-low' | 'price-high' | 'name' : 'newest';
  const pageValue = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10_000) : 1;
  const pageSize = 18;
  const filterValues = {
    query,
    categorySlugs: selectedCategories,
    occasionSlugs: selectedOccasions,
  };
  const total = await countPublishedProducts(database, filterValues);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const products = await listPublishedProducts(database, { ...filterValues, sort, page: safePage, limit: pageSize });
  const isFiltered = Boolean(query || selectedCategories.length || selectedOccasions.length);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="border-b bg-secondary/30"><div className="shell py-10 sm:py-12"><p className="eyebrow">Verified makers · Nepal</p><h1 className="mt-3 font-heading text-5xl tracking-tight sm:text-6xl">Find the right handmade gift</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">Search by product, material, or maker, then narrow the collection by occasion and craft category.</p></div></section>
        <section className="shell grid gap-8 py-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:py-14">
          <CatalogueFilters query={query} categories={categories} occasions={occasions} selectedCategories={selectedCategories} selectedOccasions={selectedOccasions} sort={sort} />
          <div>
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b pb-4"><div><p className="eyebrow">Curated collection</p><h2 className="mt-2 font-heading text-3xl">{isFiltered ? 'Matching products' : 'All products'}</h2></div><p className="text-sm text-muted-foreground" aria-live="polite">{total} {total === 1 ? 'product' : 'products'}</p></div>
            {products.length === 0 ? (
            <div className="rounded-3xl border bg-card px-6 py-16 text-center"><PackageOpen className="mx-auto size-10 text-primary" /><h2 className="mt-5 font-heading text-3xl">{isFiltered ? 'No products match yet' : 'The first collection is being prepared'}</h2><p className="mx-auto mt-3 max-w-lg leading-7 text-muted-foreground">{isFiltered ? 'Try clearing one filter or searching with a broader phrase.' : 'Approved products will appear here as soon as Hastabazaar’s catalogue review is complete.'}</p>{isFiltered ? <Link href="/shop" className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Clear all filters</Link> : null}</div>
            ) : (
            <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <Link key={product.id} href={`/products/${product.slug}`} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">{product.primaryMediaId ? <Image src={`/api/product-media/${product.primaryMediaId}`} alt={product.nameEn} width={720} height={900} unoptimized className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" /> : null}<span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold backdrop-blur">{product.categoryName}</span></div>
                  <p className="mt-4 text-sm font-semibold text-primary">{product.tradingName}</p><h2 className="mt-1 line-clamp-2 text-base font-semibold leading-6">{product.nameEn}</h2><p className="mt-2 font-heading text-xl">{money(product.pricePaisa)}</p><p className="mt-1 text-xs text-muted-foreground">{product.inventoryQuantity > 0 ? `${product.inventoryQuantity} available` : 'Currently unavailable'}</p>
                </Link>
              ))}
            </div>
            )}
            {totalPages > 1 ? <nav aria-label="Product pages" className="mt-10 flex items-center justify-center gap-3"><PageLink page={Math.max(1, safePage - 1)} disabled={safePage <= 1} params={params}>Previous</PageLink><span className="text-sm text-muted-foreground">Page {safePage} of {totalPages}</span><PageLink page={Math.min(totalPages, safePage + 1)} disabled={safePage >= totalPages} params={params}>Next</PageLink></nav> : null}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function PageLink({ page, disabled, params, children }: { page: number; disabled: boolean; params: ShopSearchParams; children: React.ReactNode }) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) { for (const item of Array.isArray(value) ? value : value ? [value] : []) if (key !== 'page') next.append(key, item); }
  next.set('page', String(page));
  return disabled ? <span aria-disabled="true" className="rounded-full border px-4 py-2 text-sm text-muted-foreground opacity-50">{children}</span> : <Link href={`/shop?${next.toString()}`} className="rounded-full border px-4 py-2 text-sm font-semibold hover:bg-muted">{children}</Link>;
}
