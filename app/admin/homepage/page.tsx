import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { Eye, EyeOff, ImageIcon, PanelsTopLeft, Search } from 'lucide-react';

import { HomepageVisibilityControl } from '@/components/admin/homepage-visibility-control';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listHomepageProductControls } from '@/lib/db/repositories/products';

export const dynamic = 'force-dynamic';

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

function pageHref(page: number, query: string, visibility: string): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (visibility !== 'all') params.set('visibility', visibility);
  if (page > 1) params.set('page', String(page));
  const value = params.toString();
  return value ? `/admin/homepage?${value}` : '/admin/homepage';
}

export default async function HomepageProductControlsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; visibility?: string; page?: string }>;
}) {
  await requireStaffPage('/admin/homepage', 'admin.invite');
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? '';
  const visibility = ['visible', 'hidden'].includes(params.visibility ?? '')
    ? (params.visibility as 'visible' | 'hidden')
    : 'all';
  const requestedPage = Number.parseInt(params.page ?? '1', 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const result = await listHomepageProductControls(
    requireDatabase(env as unknown as { DB?: D1Database }),
    { query, visibility, page, pageSize: 30 },
  );
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Super Admin control</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">
          Homepage products
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Hide or restore individual published products across Offers, Latest,
          and Top Products. This never unpublishes the listing or removes it
          from the shop.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]" action="/admin/homepage">
            <label className="relative">
              <span className="sr-only">Search products</span>
              <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <input
                name="q"
                defaultValue={query}
                maxLength={100}
                placeholder="Search product, SKU, or seller"
                className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
              />
            </label>
            <select
              name="visibility"
              defaultValue={visibility}
              aria-label="Homepage visibility"
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All products</option>
              <option value="visible">Homepage eligible</option>
              <option value="hidden">Hidden from homepage</option>
            </select>
            <Button type="submit">Apply filters</Button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>{result.total} published product{result.total === 1 ? '' : 's'} found</p>
            <Link href="/" target="_blank" className="section-link">
              Open customer homepage
            </Link>
          </div>
        </CardContent>
      </Card>

      {result.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <PanelsTopLeft className="size-9 text-muted-foreground" />
            <h2 className="mt-4 font-heading text-xl">No matching published products</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Clear the filters or publish an approved product first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {result.items.map((product) => (
            <Card key={product.id} className="py-0">
              <CardContent className="flex gap-4 p-4">
                <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {product.primaryMediaId ? (
                    <Image
                      src={`/api/product-media/${product.primaryMediaId}`}
                      alt=""
                      width={96}
                      height={96}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-7 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="truncate font-semibold hover:underline"
                    >
                      {product.nameEn}
                    </Link>
                    {product.homepageHidden ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                        <EyeOff className="size-3" /> Hidden
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-primary">
                        <Eye className="size-3" /> Eligible
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {product.tradingName} · {product.categoryName}
                  </p>
                  <p className="text-sm">
                    {money(product.pricePaisa)} · Stock {product.inventoryQuantity}
                  </p>
                  <HomepageVisibilityControl
                    productId={product.id}
                    productName={product.nameEn}
                    hidden={Boolean(product.homepageHidden)}
                    version={product.homepageVersion}
                    lastReason={product.homepageReason}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Homepage product pages" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Button variant="outline" render={<Link href={pageHref(page - 1, query, visibility)} />}>
              Previous
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Button variant="outline" render={<Link href={pageHref(page + 1, query, visibility)} />}>
              Next
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
