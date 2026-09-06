import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PackageCheck, RotateCcw, ShieldCheck, Star, Store } from 'lucide-react';

import { AddToCart } from '@/components/commerce/add-to-cart';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireDatabase } from '@/lib/db/d1';
import { getPublishedProductBySlug } from '@/lib/db/repositories/products';
import { getCustomerUser } from '@/lib/auth/customer';
import { getReviewableOrderItem, isWishlisted, listPublishedReviews } from '@/lib/db/repositories/customers';
import { WishlistButton } from '@/components/account/wishlist-button';
import { ReviewForm } from '@/components/account/review-form';
import { chatGPTSignInPath } from '@/app/chatgpt-auth';

export const dynamic = 'force-dynamic';

async function loadProduct(slug: string) {
  return getPublishedProductBySlug(
    requireDatabase(env as unknown as { DB?: D1Database }),
    slug,
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: 'Product not found' };
  return { title: product.nameEn, description: product.descriptionEn.slice(0, 155) };
}

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100);
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const customer = await getCustomerUser();
  const [reviews, saved, reviewable] = await Promise.all([
    listPublishedReviews(database, product.id),
    customer ? isWishlisted(database, customer.userId, product.id) : false,
    customer ? getReviewableOrderItem(database, customer.userId, product.id) : null,
  ]);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="shell py-8 sm:py-12">
        <Link href="/shop" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to collection</Link>
        <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:gap-16">
          <div className="grid gap-3 sm:grid-cols-2">{product.media.map((media, index) => <div key={media.id} className={`overflow-hidden rounded-2xl bg-muted ${index === 0 ? 'sm:col-span-2' : ''}`}><Image src={`/api/product-media/${media.id}`} alt={media.altEn} width={1000} height={1000} unoptimized className={`w-full object-cover ${index === 0 ? 'aspect-[6/5]' : 'aspect-square'}`} /></div>)}</div>
          <div className="lg:sticky lg:top-28 lg:self-start"><p className="eyebrow">{product.categoryName}</p><h1 className="mt-3 font-heading text-4xl leading-tight tracking-tight sm:text-5xl">{product.nameEn}</h1>{product.nameNe ? <p className="mt-2 text-xl" lang="ne">{product.nameNe}</p> : null}<p className="mt-5 font-heading text-3xl">{money(product.pricePaisa)}</p>{product.compareAtPricePaisa ? <p className="mt-1 text-sm text-muted-foreground line-through">{money(product.compareAtPricePaisa)}</p> : null}<p className={`mt-4 inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${product.inventoryQuantity > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{product.inventoryQuantity > 0 ? `${product.inventoryQuantity} available` : 'Currently unavailable'}</p><p className="mt-7 whitespace-pre-line text-base leading-8 text-muted-foreground">{product.descriptionEn}</p>
            <dl className="mt-8 grid gap-4 rounded-2xl border bg-card p-5 text-sm"><div><dt className="font-semibold">Maker</dt><dd className="mt-1 text-muted-foreground">{product.producer} · sold by <Link href={`/makers/${product.sellerId}`} className="font-semibold text-primary hover:underline">{product.tradingName}</Link></dd></div><div><dt className="font-semibold">Materials</dt><dd className="mt-1 text-muted-foreground">{product.materials}</dd></div>{product.dimensions ? <div><dt className="font-semibold">Dimensions</dt><dd className="mt-1 text-muted-foreground">{product.dimensions}</dd></div> : null}{product.careInstructions ? <div><dt className="font-semibold">Care</dt><dd className="mt-1 text-muted-foreground">{product.careInstructions}</dd></div> : null}</dl>
            <AddToCart productId={product.id} available={product.inventoryQuantity} />
            <div className="mt-3"><WishlistButton productId={product.id} initialSaved={saved} signInPath={customer ? undefined : chatGPTSignInPath(`/products/${product.slug}`)} /></div>
            <div className="mt-6 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3"><p className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Verified seller</p><p className="flex items-center gap-2"><PackageCheck className="size-4 text-primary" /> Reviewed listing</p>{product.returnEligible ? <p className="flex items-center gap-2"><RotateCcw className="size-4 text-primary" /> Standard returns</p> : null}</div><p className="mt-8 flex items-start gap-2 rounded-xl bg-secondary/40 p-4 text-sm leading-6 text-muted-foreground"><Store className="mt-1 size-4 shrink-0 text-primary" />Cash on delivery is available across Nepal. Delivery charges are calculated from the destination district.</p>
          </div>
        </div>
        <section className="mt-14 border-t pt-10"><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]"><div><p className="eyebrow">Verified purchases</p><h2 className="mt-2 font-heading text-3xl">Customer reviews</h2>{reviews.length ? <div className="mt-6 space-y-4">{reviews.map((review) => <article key={review.id} className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-1 text-amber-600" aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`size-4 ${index < review.rating ? 'fill-current' : ''}`} />)}</div>{review.title ? <h3 className="mt-3 font-semibold">{review.title}</h3> : null}<p className="mt-2 text-sm leading-7 text-muted-foreground">{review.body}</p><p className="mt-3 text-xs font-semibold">{review.customerName} · verified purchase</p></article>)}</div> : <p className="mt-5 text-sm text-muted-foreground">No published reviews yet.</p>}</div><div>{reviewable ? <><h2 className="font-heading text-2xl">Review this item</h2><ReviewForm productId={product.id} orderItemId={reviewable.orderItemId} orderNumber={reviewable.orderNumber} /></> : <div className="rounded-2xl bg-secondary/35 p-5 text-sm leading-6 text-muted-foreground">Reviews can be submitted after a signed-in customer receives this product.</div>}</div></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}
