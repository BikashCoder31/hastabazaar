import { StorefrontProductDetail } from '../../../components/catalog/storefront-product-detail';
import {OfferAddToCart} from '@/components/commerce/offer-add-to-cart';
import {getDeliveryRates} from '@/lib/db/repositories/delivery-rates';

import {publicUrl,productStructuredData,publishedRating,safeJsonLd} from '@/lib/seo/discovery';
import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  PackageCheck,
  Star,
} from 'lucide-react';


import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireDatabase } from '@/lib/db/d1';
import { getPublishedProductBySlug, getUnavailablePublishedProductBySlug } from '@/lib/db/repositories/products';
import { getCustomerReadContext } from '@/lib/auth/customer';
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
import { RecentlyViewed } from '@/components/catalog/recently-viewed';

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

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  if (!product) {
    const unavailable = await getUnavailablePublishedProductBySlug(database, slug);
    if (!unavailable) notFound();
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main tabIndex={-1} id="main-content" className="shell py-16 sm:py-24">
          <Link href="/shop" className="section-link">← Back to collection</Link>
          <section className="mt-8 max-w-2xl rounded-3xl border bg-card p-8 sm:p-12">
            <p className="eyebrow">Currently unavailable</p>
            <h1 className="mt-3 font-heading text-4xl tracking-tight">{unavailable.nameEn}</h1>
            <p className="mt-4 leading-7 text-muted-foreground">
              This product cannot be purchased right now. Existing buyers can still use their order history for delivery, support, returns, and refunds.
            </p>
            <Link href="/shop" className="section-link mt-6">Browse available products →</Link>
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  }
  const deliveryRates=await getDeliveryRates(database);
  const { customer, authenticated } = await getCustomerReadContext();
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
        <StorefrontProductDetail
          product={product}
          deliveryRates={deliveryRates}
          hasReviews={reviews.length > 0}
          purchaseActions={
            <>
              <OfferAddToCart productId={product.id} available={product.inventoryQuantity} purchasable={product.purchasable}/>
              <div className="mt-3">
                <WishlistButton
                  productId={product.id}
                  initialSaved={saved}
                  signInPath={authenticated ? undefined : signInPath(`/products/${product.slug}`)}
                />
              </div>
            </>
          }
        />
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
              {reviewable && customer ? (
                <>
                  <h2 className="font-heading text-2xl">Review this item</h2>
                  <ReviewForm
                    actorId={customer.userId}
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
        <RecentlyViewed currentProductId={product.id} authenticated={Boolean(customer)} />
      </main>
      <SiteFooter />
    </div>
  );
}
