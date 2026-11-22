import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {HomepageAccessBoundary} from '@/components/admin/homepage-access-boundary';
import { Eye, EyeOff, ImageIcon, PanelsTopLeft, Search } from 'lucide-react';

import { HomepageHeroManager } from '@/components/admin/homepage-hero-manager';
import { HomepageOccasionManager } from '@/components/admin/homepage-occasion-manager';
import { HomepageVisibilityControl } from '@/components/admin/homepage-visibility-control';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { loadQueryPresentationConfig, queryFieldPresentation } from '@/lib/catalog/shop-query';
import {
  getEffectiveBusinessSetting,
  listBusinessSettingHistory,
} from '@/lib/db/repositories/business-settings';
import { listHomepageHeroMediaForAdmin } from '@/lib/db/repositories/homepage-hero';
import { listHomepageProductControls } from '@/lib/db/repositories/products';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

export const dynamic = 'force-dynamic';

const homepageObservedAt = () => Date.now();

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
  const actor=await requireStaffPage('/admin/homepage', 'business_settings.view');
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? '';
  const visibility = ['visible', 'hidden'].includes(params.visibility ?? '')
    ? (params.visibility as 'visible' | 'hidden')
    : 'all';
  const requestedPage = Number.parseInt(params.page ?? '1', 10);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const asOf = homepageObservedAt();
  const [
    result,
    hero,
    heroHistory,
    heroMedia,
    occasionSlides,
    occasionHistory,
    filterPresentation,
  ] = await Promise.all([
    listHomepageProductControls(database, {
      query,
      visibility,
      page,
      pageSize: 30,
    }),
    getEffectiveBusinessSetting(database, 'homepage_hero_slides', asOf),
    listBusinessSettingHistory(database, 'homepage_hero_slides'),
    listHomepageHeroMediaForAdmin(database),
    getEffectiveBusinessSetting(database, 'homepage_occasion_slides', asOf),
    listBusinessSettingHistory(database, 'homepage_occasion_slides'),
    loadQueryPresentationConfig(database, 'staff.homepage-filter'),
  ]);
  const searchField = queryFieldPresentation('staff.homepage-filter', filterPresentation.config, 'q', {
    label: 'Search products', placeholder: 'Search product, SKU, or seller' });
  const visibilityField = queryFieldPresentation('staff.homepage-filter', filterPresentation.config, 'visibility', { label: 'Homepage visibility' });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const currentActor=await requireStaffPage('/admin/homepage','business_settings.view');
  if(currentActor.id!==actor.id)redirect(pageHref(page,query,visibility));

  return (
    <HomepageAccessBoundary actorId={actor.id}><div className="space-y-7">
      <StaffFormHistoryLinks entries={[{kind:'homepage-hero-settings',label:'Homepage hero answers'},
        {kind:'homepage-occasion-settings',label:'Homepage occasion answers'},
        {kind:'homepage-visibility',label:'Product visibility answers'}]} />
      <HomepageHeroManager
        actorId={actor.id}
        initialSlides={hero.value}
        initialMedia={heroMedia}
        history={heroHistory}
        asOf={asOf}
      />

      <HomepageOccasionManager
        actorId={actor.id}
        initialSlides={occasionSlides.value}
        history={occasionHistory}
        asOf={asOf}
      />

      <div className="border-t pt-8">
        <p className="eyebrow">Product merchandising</p>
        <h2 className="mt-2 font-heading text-4xl tracking-tight">
          Homepage products
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Hide or restore individual published products across Offers, Latest,
          and Top Products. This never unpublishes the listing or removes it
          from the shop.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <form
            data-form-id="staff.homepage-filter"
            className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]"
            action="/admin/homepage"
          >
            <label className="relative">
              <span className="sr-only">{searchField.label}</span>
              <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <input
                name="q"
                defaultValue={query}
                maxLength={100}
                placeholder={searchField.placeholder}
                aria-describedby={searchField.helpText ? 'homepage-query-help' : undefined}
                className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
              />
            </label>
            <select
              name="visibility"
              defaultValue={visibility}
              aria-label={visibilityField.label}
              aria-describedby={visibilityField.helpText ? 'homepage-visibility-help' : undefined}
              className="h-10 min-w-0 max-w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All products</option>
              <option value="visible">Homepage eligible</option>
              <option value="hidden">Hidden from homepage</option>
            </select>
            <Button variant="workspace-primary" size="workspace" type="submit">Apply filters</Button>
          </form>
          {searchField.helpText ? <p id="homepage-query-help" className="text-sm text-muted-foreground">{searchField.helpText}</p> : null}
          {visibilityField.helpText ? <p id="homepage-visibility-help" className="text-sm text-muted-foreground">{visibilityField.helpText}</p> : null}
          {filterPresentation.unavailable ? <output className="block text-sm text-muted-foreground">Filter presentation is unavailable. Standard filters remain available.</output> : null}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              {result.total} published product{result.total === 1 ? '' : 's'}{' '}
              found
            </p>
            <Link href="/" target="_blank" className="section-link underline">
              Open customer homepage
            </Link>
          </div>
        </CardContent>
      </Card>

      {result.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <PanelsTopLeft className="size-9 text-muted-foreground" />
            <h2 className="mt-4 font-heading text-xl">
              No matching published products
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Clear the filters or publish an approved product first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {result.items.map((product) => (
            <Card key={product.id} className="py-0">
              <CardContent className="flex flex-col gap-4 p-4 min-[480px]:flex-row">
                <div
                  data-media-frame="cover"
                  className={mediaFrameClass(
                    'cover',
                    'flex size-24 shrink-0 items-center justify-center rounded-xl bg-muted',
                  )}
                >
                  {product.primaryMediaId ? (
                    <Image
                      data-media-mode="cover"
                      src={`/api/product-media/${product.primaryMediaId}`}
                      alt=""
                      width={96}
                      height={96}
                      sizes={mediaSizes.adminThumbnail}
                      unoptimized
                      className={mediaObjectClass('cover')}
                    />
                  ) : (
                    <ImageIcon className="size-7 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="section-link block min-w-0 wrap-anywhere text-base underline"
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
                    {money(product.pricePaisa)} · Stock{' '}
                    {product.inventoryQuantity}
                  </p>
                  <HomepageVisibilityControl
                    actorId={actor.id}
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
        <nav
          aria-label="Homepage product pages"
          className="flex items-center justify-center gap-3"
        >
          {page > 1 ? (
            <Link href={pageHref(page - 1, query, visibility)} className="section-link underline">
              Previous
            </Link>
          ) : null}
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1, query, visibility)} className="section-link underline">
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div></HomepageAccessBoundary>
  );
}
