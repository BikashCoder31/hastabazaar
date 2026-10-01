import { can } from '@/lib/marketplace/permissions';
import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Boxes,
  FileText,
  History,
  Images,
  Store,
} from 'lucide-react';

import { ProductReviewActions } from '@/components/admin/product-review-actions';
import { HomepageVisibilityControl } from '@/components/admin/homepage-visibility-control';
import { ProductClassificationForm } from '@/components/admin/product-classification-form';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  getProductForReview,
  listActiveCategories,
  listActiveOccasions,
} from '@/lib/db/repositories/products';

export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kathmandu',
});
function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-6">{children || '—'}</dd>
    </div>
  );
}

export default async function ProductReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(`/admin/products/${id}`, 'product.review');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [product, categories, occasions] = await Promise.all([
    getProductForReview(database, id),
    listActiveCategories(database),
    listActiveOccasions(database),
  ]);
  if (!product) notFound();
  return (
    <div className="space-y-7">
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to product queue
      </Link>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">SKU {product.sku}</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">
            {product.nameEn}
          </h1>
        </div>
        <StatusBadge status={product.status} />
      </div>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Images className="size-5 text-primary" /> Product photos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {product.media.map((media) => (
                  <figure
                    key={media.id}
                    className="overflow-hidden rounded-xl border bg-muted"
                  >
                    <Image
                      src={`/api/product-media/${media.id}`}
                      alt={media.altEn}
                      width={800}
                      height={800}
                      unoptimized
                      className="aspect-square w-full object-cover"
                    />
                    <figcaption className="truncate p-2 text-xs text-muted-foreground">
                      {media.originalName}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-5 text-primary" /> Listing details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Description
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-7">
                  {product.descriptionEn}
                </p>
              </div>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Category">{product.categoryName}</Detail>
                <Detail label="Gift occasions">{product.occasionNames}</Detail>
                <Detail label="Producer">{product.producer}</Detail>
                <Detail label="Origin">Nepal</Detail>
                <Detail label="Materials">{product.materials}</Detail>
                <Detail label="Dimensions">{product.dimensions}</Detail>
                <Detail label="Size">{product.size}</Detail>
                <Detail label="Colour">{product.colour}</Detail>
                <Detail label="Variations">{product.variations}</Detail>
                <Detail label="Specifications">{product.specifications}</Detail>
                <Detail label="Preparation">
                  {product.madeToOrder ? 'Made to order · ' : ''}
                  {product.preparationDays} day(s)
                </Detail>
                <Detail label="Care">{product.careInstructions}</Detail>
                <Detail label="Safety">{product.safetyInformation}</Detail>
                <Detail label="Warranty">{product.warranty}</Detail>
                <Detail label="Return conditions">
                  {product.returnConditions}
                </Detail>
                <Detail label="Manufactured">
                  {product.manufacturedAt
                    ? dateFormatter.format(new Date(product.manufacturedAt))
                    : 'Not applicable'}
                </Detail>
                <Detail label="Expires">
                  {product.expiresAt
                    ? dateFormatter.format(new Date(product.expiresAt))
                    : 'Not applicable'}
                </Detail>
                <Detail label="Licence">{product.licenceReference}</Detail>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="size-5 text-primary" /> Seller and commercial
                details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Seller">{product.tradingName}</Detail>
                <Detail label="Selling price">
                  {money(product.pricePaisa)}
                </Detail>
                <Detail label="Original price">
                  {product.compareAtPricePaisa
                    ? money(product.compareAtPricePaisa)
                    : '—'}
                </Detail>
                <Detail label="Return eligible">
                  {product.returnEligible ? 'Yes' : 'No'}
                </Detail>
                <Detail label="Available stock">
                  <span className="inline-flex items-center gap-2">
                    <Boxes className="size-4 text-primary" />
                    {product.inventoryQuantity}
                  </span>
                </Detail>
              </dl>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          {staff.role === 'super_admin' ? (
            <Card>
              <CardHeader>
                <CardTitle>Homepage visibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  This controls Offers, Latest, and Top Products only. The
                  listing remains published and available in the shop.
                </p>
                <HomepageVisibilityControl
                  productId={product.id}
                  productName={product.nameEn}
                  hidden={Boolean(product.homepageHidden)}
                  version={product.homepageVersion}
                  lastReason={product.homepageReason}
                />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Review decision</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductReviewActions
                productId={product.id}
                canUnpublish={staff.role === 'super_admin'}
                canPublish={can(staff, 'product.publish')}
                status={product.status}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Discovery classification</CardTitle>
            </CardHeader>
            <CardContent>
              {can(staff, 'catalog.manage') && <ProductClassificationForm
                productId={product.id}
                categoryId={product.categoryId}
                occasionIds={
                  product.occasionIds?.split(',').filter(Boolean) ?? []
                }
                categories={categories}
                occasions={occasions}
              />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-5 text-primary" /> Review history
              </CardTitle>
            </CardHeader>
            <CardContent>
              {product.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No staff review action has been recorded.
                </p>
              ) : (
                <ol className="space-y-5">
                  {product.history.map((event) => (
                    <li
                      key={event.id}
                      className="border-l-2 border-primary/25 pl-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={event.toStatus} />
                        <span className="text-xs text-muted-foreground">
                          {dateFormatter.format(new Date(event.createdAt))}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6">{event.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        By {event.actorName} · {event.actorEmail}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
