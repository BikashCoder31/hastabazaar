import { ProductDiscount } from '@/components/catalog/product-discount';
import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, PackageOpen } from 'lucide-react';

import { CatalogueFilters } from '@/components/catalog/catalog-filters';
import { MobileCatalogFilters } from '@/components/catalog/mobile-catalog-filters';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireDatabase } from '@/lib/db/d1';
import { loadShopQueryConfig, parseShopQueryCriteria } from '@/lib/catalog/shop-query';
import {
  countPublishedProducts,
  listActiveOccasions,
  listPublicDiscoveryCategories,
  listPublishedProducts,
} from '@/lib/db/repositories/products';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

export const dynamic = 'force-dynamic';

export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,unknown>>}):Promise<Metadata> {
 const filtered=Object.keys(await searchParams).length>0;return {
 alternates:{canonical:'https://hastabazaar.com/shop'},
 robots:filtered?{index:false,follow:true}:{index:true,follow:true},
  title: 'Shop products',
  description:
    'Browse gifts and everyday finds from marketplace sellers. Read each listing for materials, origin and seller details.',
};}

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

type ShopSearchParams = Record<string, string | string[] | undefined>;

function values(value: string | string[] | undefined): string[] {
  const input = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(input.map((item) => item.trim()).filter(Boolean))];
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<ShopSearchParams>;
}) {
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const params = await searchParams;
  const [categories, occasions, formState] = await Promise.all([
    listPublicDiscoveryCategories(database),
    listActiveOccasions(database),
    loadShopQueryConfig(database).then((config) => ({ config, unavailable: false }),
      () => ({ config: { formId: 'catalog.filters', version: 0, publishedAt: 0, fields: [] }, unavailable: true })),
  ]);
  const formConfig = formState.config;
  let priceCriteria: ReturnType<typeof parseShopQueryCriteria> = {};
  let queryError = formState.unavailable ? 'Shop filters are unavailable. Refresh the page and try again.' : '';
  try {
    if (!formState.unavailable) priceCriteria = parseShopQueryCriteria(formConfig, params);
  } catch (error) {
    queryError = error instanceof Error ? error.message : 'Shop filters are unavailable.';
  }
  const query =
    (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 100) ??
    '';
  const categorySet = new Set(categories.map((item) => item.slug));
  const occasionSet = new Set(occasions.map((item) => item.slug));
  const selectedCategories = values(params.category).filter((slug) =>
    categorySet.has(slug),
  );
  const selectedOccasions = values(params.occasion).filter((slug) =>
    occasionSet.has(slug),
  );
  const sortValue = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort = ['newest', 'price-low', 'price-high', 'name'].includes(
    sortValue ?? '',
  )
    ? (sortValue as 'newest' | 'price-low' | 'price-high' | 'name')
    : 'newest';
  const pageValue = Number(
    Array.isArray(params.page) ? params.page[0] : params.page,
  );
  const page =
    Number.isInteger(pageValue) && pageValue > 0
      ? Math.min(pageValue, 10_000)
      : 1;
  const pageSize = 18;
  const filterValues = {
    query,
    categorySlugs: selectedCategories,
    occasionSlugs: selectedOccasions,
    minimumPricePaisa: priceCriteria.minimumPricePaisa,
  };
  const total = queryError ? 0 : await countPublishedProducts(database, filterValues);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const products = queryError ? [] : await listPublishedProducts(database, {
    ...filterValues,
    sort,
    page: safePage,
    limit: pageSize,
  });
  const isFiltered = Boolean(
    query || selectedCategories.length || selectedOccasions.length ||
    priceCriteria.minimumPricePaisa !== undefined || queryError,
  );
  const filterProps = {
    query,
    categories,
    occasions,
    selectedCategories,
    selectedOccasions,
    sort,
    config: formConfig,
    unavailable: formState.unavailable,
    minimumPriceNpr: priceCriteria.minimumPriceNpr,
  };
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main tabIndex={-1} id="main-content">
        <section className="border-b bg-secondary/60">
          <div className="shell py-8 sm:py-10">
            <nav
              aria-label="Breadcrumb"
              className="mb-6 flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Link href="/" className="rounded-sm hover:text-primary">
                Home
              </Link>
              <ChevronRight className="size-3.5" />
              <span aria-current="page">The collection</span>
            </nav>
            <p className="eyebrow">Independent sellers · Thoughtful finds</p>
            <h1 className="mt-3 font-heading text-4xl tracking-[-0.035em] sm:text-5xl">
              Something special starts here.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Find your next favourite by craft, occasion, material, or maker.
            </p>
          </div>
        </section>
        <section className="shell grid gap-8 py-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:py-14">
          <div className="hidden lg:sticky lg:top-40 lg:block">
            <CatalogueFilters {...filterProps} idPrefix="desktop-catalogue" />
          </div>
          <div>
            <div className="mb-6 lg:hidden">
              <MobileCatalogFilters
                activeCount={
                  selectedCategories.length +
                  selectedOccasions.length +
                  (query ? 1 : 0) +
                  (priceCriteria.minimumPricePaisa !== undefined ? 1 : 0)
                }
              >
                <CatalogueFilters
                  {...filterProps}
                  idPrefix="mobile-catalogue"
                  presentation="sheet"
                />
              </MobileCatalogFilters>
            </div>
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
              <div>
                <p className="eyebrow">Curated collection</p>
                <h2 className="mt-2 font-heading text-3xl">
                  {isFiltered ? 'Matching products' : 'All products'}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {total} {total === 1 ? 'product' : 'products'}
              </p>
            </div>
            {queryError ? <p role="alert" className="mb-5 rounded-xl border border-destructive p-4 text-sm text-destructive">{queryError} Clear the filter and try again.</p> : null}
            {products.length === 0 ? (
              <div className="rounded-3xl border bg-card px-6 py-16 text-center">
                <PackageOpen className="mx-auto size-10 text-primary" />
                <h2 className="mt-5 font-heading text-3xl">
                  {isFiltered
                    ? 'No products match yet'
                    : 'The first collection is being prepared'}
                </h2>
                <p className="mx-auto mt-3 max-w-lg leading-7 text-muted-foreground">
                  {isFiltered
                    ? 'Try clearing one filter or searching with a broader phrase.'
                    : 'Approved products will appear here as soon as HastaBazaar’s catalogue review is complete.'}
                </p>
                {isFiltered ? (
                  <Link
                    href="/shop"
                    className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    Clear all filters
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 xl:grid-cols-3">
                {products.map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.slug}`}
                    className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div
                      data-media-frame="cover"
                      className={mediaFrameClass(
                        'cover',
                        'aspect-[4/5] rounded-2xl bg-muted',
                      )}
                    >
                      {product.primaryMediaId ? (
                        <Image
                          src={`/api/product-media/${product.primaryMediaId}`}
                          alt={product.nameEn}
                          data-media-mode="cover"
                          width={720}
                          height={900}
                          unoptimized
                          sizes={mediaSizes.shopGrid}
                          className={mediaObjectClass(
                            'cover',
                            'transition-transform duration-500 group-hover:scale-[1.035]',
                          )}
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-muted-foreground">
                          <PackageOpen className="size-8" />
                          <span className="text-sm">Photo coming soon</span>
                        </div>
                      )}
                      <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-full bg-background/95 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                        {product.categoryName}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-primary">
                      {product.tradingName}
                    </p>
                    <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-6">
                      {product.nameEn}
                    </h2>
                    <p className="mt-3 flex items-center justify-between gap-2 text-base font-semibold">
                      {money(product.pricePaisa)}
                      <ArrowUpRight className="size-4 shrink-0 text-primary" />
                    </p>
                    <ProductDiscount pricePaisa={product.pricePaisa} originalPaisa={product.compareAtPricePaisa} />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {product.inventoryQuantity > 0
                        ? `${product.inventoryQuantity} available`
                        : 'Currently unavailable'}
                    </p>
                  </Link>
                ))}
              </div>
            )}
            {totalPages > 1 ? (
              <nav
                aria-label="Product pages"
                className="mt-10 flex items-center justify-center gap-3"
              >
                <PageLink
                  page={Math.max(1, safePage - 1)}
                  disabled={safePage <= 1}
                  params={params}
                >
                  Previous
                </PageLink>
                <span className="text-sm text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <PageLink
                  page={Math.min(totalPages, safePage + 1)}
                  disabled={safePage >= totalPages}
                  params={params}
                >
                  Next
                </PageLink>
              </nav>
            ) : null}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function PageLink({
  page,
  disabled,
  params,
  children,
}: {
  page: number;
  disabled: boolean;
  params: ShopSearchParams;
  children: React.ReactNode;
}) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      if (key !== 'page') next.append(key, item);
  }
  next.set('page', String(page));
  return disabled ? (
    <span
      aria-disabled="true"
      className="rounded-full border px-4 py-2 text-sm text-muted-foreground opacity-50"
    >
      {children}
    </span>
  ) : (
    <Link
      href={`/shop?${next.toString()}`}
      className="rounded-full border px-4 py-2 text-sm font-semibold hover:bg-muted"
    >
      {children}
    </Link>
  );
}
