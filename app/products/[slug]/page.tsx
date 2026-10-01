import {getDeliveryRates} from '@/lib/db/repositories/delivery-rates';
import { ProductDiscount } from '@/components/catalog/product-discount';
import {publicUrl,productStructuredData,publishedRating,safeJsonLd} from '@/lib/seo/discovery';
import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Star,
  Store,
} from 'lucide-react';

import { AddToCart } from '@/components/commerce/add-to-cart';
import { ProductDelivery } from '@/components/commerce/product-delivery';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';
import { productReturnDisclosure } from '@/lib/returns/presentation';
import { ProductGallery } from '@/components/catalog/product-gallery';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireDatabase } from '@/lib/db/d1';
import { getPublishedProductBySlug } from '@/lib/db/repositories/products';
import { getCustomerUser } from '@/lib/auth/customer';
import {
  getReviewableOrderItem,
  isWishlisted,
  listPublishedReviews,
} from '@/lib/db/repositories/customers';
import { WishlistButton } from '@/components/account/wishlist-button';
import { ReviewForm } from '@/components/account/review-form';
import {ReviewPhotos,PublicSellerReply} from '@/components/commerce/review-attachments';
import {getReviewExtras} from '@/lib/db/repositories/review-extras';
import { signInPath } from '@/app/auth';

export const dynamic = 'force-dynamic';

async function loadProduct(slug: string) {
  return getPublishedProductBySlug(
    requireDatabase(env as unknown as { DB?: D1Database }),
    slug,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: 'Product not found', robots:{index:false,follow:false} };
  return {
    alternates:{canonical:publicUrl('/products/'+encodeURIComponent(product.slug))},
    openGraph:{type:'website',title:product.nameEn,description:product.descriptionEn.slice(0,155),url:publicUrl('/products/'+encodeURIComponent(product.slug)),images:product.media.slice(0,1).map(m=>({url:publicUrl('/api/product-media/'+encodeURIComponent(m.id)),alt:product.nameEn}))},
    title: product.nameEn,
    description: product.descriptionEn.slice(0, 155),
  };
}

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const deliveryRates=await getDeliveryRates(database);
  const customer = await getCustomerUser();
  const [reviews, saved, reviewable, myReview, rating] = await Promise.all([
    listPublishedReviews(database, product.id),
    customer ? isWishlisted(database, customer.userId, product.id) : false,
    customer
      ? getReviewableOrderItem(database, customer.userId, product.id)
      : null,
    customer ? database.prepare('SELECT status FROM product_reviews WHERE customer_id=? AND product_id=? ORDER BY created_at DESC LIMIT 1').bind(customer.userId,product.id).first<{status:string}>() : null,
    publishedRating(database,product.id),
  ]);
  const extras=await getReviewExtras(database,reviews.map(r=>r.id));
  const returns = productReturnDisclosure(Boolean(product.returnEligible), product.returnConditions, phaseOneMarketplacePolicy.value.returns);
  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(productStructuredData(product,rating))}} />
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="shell py-8 sm:py-12">
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to collection
        </Link>
        <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:gap-16">
          <div className="min-w-0 lg:sticky lg:top-40 lg:self-start">
            <ProductGallery
              key={product.id}
              media={product.media}
              productName={product.nameEn}
            />
          </div>
          <div className="min-w-0">
            <p className="eyebrow">{product.categoryName}</p>
            <h1 className="mt-3 font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
              {product.nameEn}
            </h1>
            <p className="mt-5 font-heading text-3xl">
              {money(product.pricePaisa)}
            </p>
            <ProductDiscount pricePaisa={product.pricePaisa} originalPaisa={product.compareAtPricePaisa} />
            <p
              className={`mt-4 inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${product.inventoryQuantity > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-muted text-muted-foreground'}`}
            >
              {product.inventoryQuantity > 0
                ? `${product.inventoryQuantity} available`
                : 'Currently unavailable'}
            </p>
            <div className="mt-5">
              <Link
                href={`/makers/${product.sellerId}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                <Store className="size-4" />
                By {product.tradingName}
              </Link>
              {reviews.length ? (
                <Link
                  href="#reviews"
                  className="ml-5 inline-flex text-sm font-semibold text-primary hover:underline"
                >
                  Read reviews
                </Link>
              ) : null}
            </div>
            <section aria-label="Delivery and returns" className="mt-5 space-y-4 rounded-2xl border bg-secondary/30 p-4 sm:p-5">
              <ProductDelivery rates={deliveryRates} preparationDays={product.preparationDays} madeToOrder={Boolean(product.madeToOrder)} />
              <div className="border-t pt-4 text-sm leading-6">
                <h3 className="flex items-center gap-2 font-semibold"><RotateCcw className="size-4 text-primary" aria-hidden="true" />Returns & conditions</h3>
                <p className="mt-2 font-medium">{returns.eligibility}</p>
                <p className="mt-2 whitespace-pre-line break-words text-muted-foreground">{returns.conditions}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer font-medium text-primary">Item problems, exclusions & how to request</summary>
                  <p className="mt-2 text-muted-foreground">{returns.protection}</p>
                  <p className="mt-2 text-muted-foreground">After delivery, request a return for this item from your secure receipt or My orders. Requests are reviewed under the policy saved with your order.</p>
                  <Link href="/returns" className="mt-2 inline-block font-semibold text-primary underline">Return policy & help</Link>
                </details>
              </div>
            </section>
            <AddToCart
              productId={product.id}
              available={product.inventoryQuantity}
            />
            <div className="mt-3">
              <WishlistButton
                productId={product.id}
                initialSaved={saved}
                signInPath={
                  customer
                    ? undefined
                    : signInPath(`/products/${product.slug}`)
                }
              />
            </div>
            <h2 className="mt-8 border-t pt-7 font-heading text-2xl">
              Product description
            </h2>
            <p className="mt-4 whitespace-pre-line text-base leading-8 text-muted-foreground">
              {product.descriptionEn}
            </p>
            <dl className="mt-6 grid gap-5 rounded-2xl border bg-card p-5 text-base sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Maker</dt>
                <dd className="mt-1 text-muted-foreground">
                  {product.producer ? product.producer + ' · sold by ' : 'Sold by '}
                  <Link
                    href={`/makers/${product.sellerId}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {product.tradingName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Origin</dt>
                <dd className="mt-1 text-muted-foreground">Nepal</dd>
              </div>
              {product.materials ? <div>
                <dt className="font-semibold">Materials</dt>
                <dd className="mt-1 text-muted-foreground">
                  {product.materials}
                </dd>
              </div> : null}
              {product.dimensions ? (
                <div>
                  <dt className="font-semibold">Dimensions</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {product.dimensions}
                  </dd>
                </div>
              ) : null}
              {product.size ? (
                <div><dt className="text-sm text-muted-foreground">Size</dt><dd className="mt-1 font-medium">{product.size}</dd></div>
              ) : null}
              {product.colour ? (
                <div><dt className="text-sm text-muted-foreground">Colour</dt><dd className="mt-1 font-medium">{product.colour}</dd></div>
              ) : null}
              {product.variations ? (
                <div><dt className="text-sm text-muted-foreground">Variations</dt><dd className="mt-1 whitespace-pre-wrap font-medium">{product.variations}</dd></div>
              ) : null}
              {product.specifications ? (
                <div><dt className="text-sm text-muted-foreground">Specifications</dt><dd className="mt-1 whitespace-pre-wrap font-medium">{product.specifications}</dd></div>
              ) : null}
              <div>
                <dt className="font-semibold">Preparation</dt>
                <dd className="mt-1 text-muted-foreground">
                  {product.madeToOrder ? 'Made to order · ' : ''}
                  {product.preparationDays === 0
                    ? 'Ready to dispatch'
                    : `${product.preparationDays} day${product.preparationDays === 1 ? '' : 's'} before dispatch`}
                </dd>
              </div>
              {product.careInstructions ? (
                <div>
                  <dt className="font-semibold">Care</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {product.careInstructions}
                  </dd>
                </div>
              ) : null}
              {product.safetyInformation ? (
                <div>
                  <dt className="font-semibold">Safe use</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {product.safetyInformation}
                  </dd>
                </div>
              ) : null}
              {product.warranty ? (
                <div>
                  <dt className="font-semibold">Warranty or guarantee</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {product.warranty}
                  </dd>
                </div>
              ) : null}
              {product.manufacturedAt ? (
                <div>
                  <dt className="font-semibold">Manufactured</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {new Date(product.manufacturedAt).toLocaleDateString(
                      'en-NP',
                    )}
                  </dd>
                </div>
              ) : null}
              {product.expiresAt ? (
                <div>
                  <dt className="font-semibold">Expiry</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {new Date(product.expiresAt).toLocaleDateString('en-NP')}
                  </dd>
                </div>
              ) : null}
              {product.licenceReference ? (
                <div>
                  <dt className="font-semibold">Licence reference</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {product.licenceReference}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-6 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" /> Verified seller
              </p>
              <p className="flex items-center gap-2">
                <PackageCheck className="size-4 text-primary" /> Reviewed
                listing
              </p>
              {product.returnEligible ? (
                <p className="flex items-center gap-2">
                  <RotateCcw className="size-4 text-primary" /> Standard returns
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <section id="reviews" className="mt-14 border-t pt-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div>
              <p className="eyebrow">Verified purchases</p>
              <h2 className="mt-2 font-heading text-3xl">Customer reviews</h2>
              {reviews.length ? (
                <div className="mt-6 space-y-4">
                  {reviews.map((review) => (
                    <article
                      key={review.id}
                      className="rounded-2xl border bg-card p-5"
                    >
                      <div
                        className="flex items-center gap-1 text-amber-600"
                        aria-label={`${review.rating} out of 5 stars`}
                      >
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            className={`size-4 ${index < review.rating ? 'fill-current' : ''}`}
                          />
                        ))}
                      </div>
                      {review.title ? (
                        <h3 className="mt-3 font-semibold">{review.title}</h3>
                      ) : null}
                      <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-muted-foreground">
                        {review.body}
                      </p>
                      <p className="mt-3 text-xs font-semibold">
                        {review.customerName}
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-primary"><PackageCheck className="size-3.5" aria-hidden="true"/> Verified purchase</span>
                      </p>
                      <ReviewPhotos photos={extras.photos.filter(p=>p.reviewId===review.id)}/>
                      <PublicSellerReply reply={extras.replies.find(r=>r.reviewId===review.id)}/>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">
                  No published reviews yet.
                </p>
              )}
            </div>
            <div>
              {reviewable ? (
                <>
                  <h2 className="font-heading text-2xl">Review this item</h2>
                  <ReviewForm
                    productId={product.id}
                    orderItemId={reviewable.orderItemId}
                    orderNumber={reviewable.orderNumber}
                  />
                </>
              ) : (
                <div className="rounded-2xl bg-secondary/35 p-5 text-sm leading-6 text-muted-foreground">
                  {myReview ? (myReview.status==='pending' ? 'Thank you—your review and photos are awaiting moderation.' : myReview.status==='published' ? 'Thank you for sharing your verified-purchase review.' : 'Your review was not published. Contact support if you need help with the decision.') : 'Reviews can be submitted after a signed-in customer receives this product.'}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
