import { AdminPageTitle } from '@/components/admin/page-help';
import {ProductAvailabilityPanel} from '@/components/products/product-availability-panel';
import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import {ReviewBackLink} from '@/components/admin/review-back-link';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import { can } from '@/lib/marketplace/permissions';
import { env } from 'cloudflare:workers';
import Image from 'next/image';

import { notFound, redirect } from 'next/navigation';
import {
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
import {staffMutationGuard} from '@/lib/db/repositories/staff-mutation-guard';
import {OfferError,offerGuard,productStaffPartyGuards} from '@/lib/products/offer-support';
import {
  mediaFrameClass,
  mediaObjectClass,
} from '@/lib/media/responsive-media';
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

class ProductReadAccessError extends OfferError{constructor(message:string){super(message,403);}}

export default async function ProductReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?:Promise<{returnTo?:string}>;
}) {
  const { id } = await params;
  let staff = await requireStaffPage(
    `/admin/products/${id}`,
    'product.review',
  );
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const backHref=safeAdminReturnTo((await searchParams)?.returnTo,'/admin/products'),currentHref=withAdminReturnTo('/admin/products/'+encodeURIComponent(id),backHref);
  const [product, categories, occasions] = await Promise.all([
    getProductForReview(database, id),
    listActiveCategories(database),
    listActiveOccasions(database),
  ]);
  if (!product) notFound();
  const retained=await database.prepare('SELECT l.draft_id AS draftId,c.id AS caseId FROM product_publication_links l LEFT JOIN product_intake_cases c ON c.draft_id=l.draft_id WHERE l.product_id=? ORDER BY c.cycle_number DESC LIMIT 1').bind(id).first<{draftId:string;caseId:string|null}>();

  const reader=await staffMutationGuard(database,staff.id,'product.review',ProductReadAccessError,staff.role);
  const parties=await productStaffPartyGuards(database,staff.id,id);
  await database.batch([...reader.statements,...parties,...offerGuard(database,'EXISTS(SELECT 1 FROM products WHERE id=? AND seller_id=? AND updated_at=?)',[id,product.sellerId,product.updatedAt])]);
  staff={...staff,role:reader.role,permissions:reader.permissions};
  if(retained?.caseId)redirect(withAdminReturnTo('/admin/products/intakes/'+encodeURIComponent(retained.caseId),backHref));
  if(retained)return <div className="space-y-5"><AdminPageTitle><h1 className="font-heading text-3xl">{product.nameEn}</h1></AdminPageTitle><p>The owner has a retained private workspace. Review becomes available when they explicitly share a candidate or request help.</p><ReviewBackLink returnTo={backHref} actorId={staff.id}/>{staff.role==='super_admin'&&<ProductAvailabilityPanel key={`${staff.id}:${id}`} actorId={staff.id} productId={id} scope="admin"/>}</div>;
  return (
    <div className="space-y-7">
      <ReviewBackLink returnTo={backHref} actorId={staff.id}/>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <AdminPageTitle>
            <h1 className="break-words font-heading text-3xl tracking-tight md:text-4xl">
              {product.nameEn}
            </h1>
          </AdminPageTitle>
          <p className="mt-2 break-words text-sm text-muted-foreground">{product.tradingName}{Number.isFinite(product.submittedAt) ? " · " + dateFormatter.format(product.submittedAt) : null}</p>
          <p className="mt-1 break-all text-sm text-muted-foreground">Platform SKU: {product.sku}</p>
          <p className="mt-1 break-all text-sm text-muted-foreground">Seller SKU: {product.sellerSku || '—'}</p>
        </div>
        <StatusBadge status={product.status} />
      </div>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Images className="size-5 text-primary" /> Product photos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!product.media.length ? <p className="text-sm text-muted-foreground">No photos yet.</p> : null}
              <div className="grid gap-3">
                {product.media.map((media) => (
                  <figure
                    key={media.id}
                    className="min-w-0 overflow-hidden rounded-xl border bg-muted"
                  >
                    <div
                      data-media-frame="contain"
                      className={mediaFrameClass('contain', 'aspect-square')}
                    >
                      {media.mimeType === 'video/mp4' ? (
                        <video
                          data-media-mode="contain"
                          src={`/api/product-media/${media.id}`}
                          controls
                          muted
                          playsInline
                          preload="metadata"
                          aria-label={
                            media.altEn ||
                            `Product demonstration of ${product.nameEn}`
                          }
                          className={mediaObjectClass(
                            'contain',
                            'absolute inset-0 bg-black',
                          )}
                        />
                      ) : (
                        <Image
                          data-media-mode="contain"
                          src={`/api/product-media/${media.id}`}
                          alt={media.altEn}
                          width={800}
                          height={800}
                          unoptimized
                          className={mediaObjectClass(
                            'contain',
                            'absolute inset-0',
                          )}
                        />
                      )}
                    </div>
                    <figcaption className="break-words p-2 text-xs text-muted-foreground">
                      {media.originalName}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </CardContent>
          </Card>
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="space-y-3">
              <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <div className="flex gap-1"><dt>Price</dt><dd className="font-bold">{money(product.pricePaisa)}</dd></div>
                <div className="flex gap-1"><dt>Stock</dt><dd className="font-bold">{product.inventoryQuantity}</dd></div>
                <div className="flex gap-1"><dt>Category</dt><dd className="font-bold">{product.categoryName}</dd></div>
                <div className="flex gap-1"><dt>Origin</dt><dd className="font-bold">{product.countryOfOrigin || 'Unknown'}</dd></div>
              </dl>
              <p className="whitespace-pre-line break-words text-sm leading-6">{product.descriptionEn}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Review decision</CardTitle>
            </CardHeader>
            <CardContent>
              {product.status === 'published' ? <p className="mb-4 rounded-xl border bg-muted p-3 text-sm">
                {product.publiclyVisible ? 'Visible in the public catalogue.' : 'Not visible in the public catalogue because seller eligibility is incomplete or restricted.'}{' '}
                {product.purchasable ? 'Commercial eligibility is met; stock and checkout checks still apply.' : 'Customers cannot order until commercial eligibility is met.'}
              </p> : null}
              <ProductReviewActions
                productId={product.id}
                canUnpublish={staff.role === 'super_admin'}
                canPublish={can(staff, 'product.publish')}
                status={product.status}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-5 text-primary" /> Listing details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Category">{product.categoryName}</Detail>
                <Detail label="Gift occasions">{product.occasionNames}</Detail>
                <Detail label="Producer">{product.producer}</Detail>
                <Detail label="Origin">{product.countryOfOrigin?.trim() || 'Unknown'}</Detail>
                <Detail label="Origin evidence status">
                  {product.originEvidenceStatus === 'verified'
                    ? 'Verified origin'
                    : product.originEvidenceStatus === 'seller_declared'
                      ? 'Seller declared; unverified'
                      : 'Unverified stored value'}
                </Detail>
                {product.originEvidenceReference ? (
                  <Detail label="Origin evidence reference (private)">{product.originEvidenceReference}</Detail>
                ) : null}
                <Detail label="Materials">{product.materials}</Detail>
                <Detail label="Product-origin story">
                  {product.originStory}
                </Detail>
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
                  actorId={staff.id}
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
              <CardTitle>Discovery classification</CardTitle>
            </CardHeader>
            <CardContent>
              {can(staff, 'catalog.manage') && (
                <ProductClassificationForm
                  productId={product.id}
                  categoryId={product.categoryId}
                  occasionIds={
                    product.occasionIds?.split(',').filter(Boolean) ?? []
                  }
                  categories={categories}
                  occasions={occasions}
                />
              )}
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
      <StaffFormHistoryLinks returnTo={currentHref} entries={[{kind:'product-review',subjectId:id,label:'Product decision answers'},
        ...(staff.role === 'super_admin' ? [{kind:'homepage-visibility' as const,subjectId:id,label:'Homepage visibility answers'}] : [])]} />
    </div>
  );
}

