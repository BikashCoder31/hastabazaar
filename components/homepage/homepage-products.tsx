'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Heart } from 'lucide-react';
import { WishlistButton } from '@/components/account/wishlist-button';
import { SellerDisclosure } from '@/components/commerce/seller-disclosure';
import type { HomepageProduct } from '@/lib/db/repositories/products';
import { mediaFrameClass, mediaObjectClass } from '@/lib/media/responsive-media';
import { productSavings } from '@/lib/products/discount';
import styles from './homepage.module.css';

const money = new Intl.NumberFormat('en-NP', { maximumFractionDigits: 2 });
const arrivedSizes = '(min-width: 1360px) 300px, (min-width: 1024px) calc(25vw - 40px), (min-width: 640px) calc(33vw - 32px), calc(50vw - 24px)';
const rankedSizes = '(min-width: 1360px) 240px, (min-width: 1024px) calc(20vw - 32px), (min-width: 640px) calc(33vw - 32px), 224px';

export function HomepageProductCard({
  product,
  rank,
  saved = false,
  signInHref,
  canSave = false,
}: {
  product: HomepageProduct;
  rank?: number;
  saved?: boolean;
  signInHref?: string;
  canSave?: boolean;
}) {
  const price = product.price ? `${product.priceFrom ? 'From ' : ''}NPR ${product.price}` : 'Price unavailable';
  const savings = product.priceFrom || product.pricePaisa == null ? null : productSavings(product.pricePaisa, product.compareAtPricePaisa);
  const readyToDispatch = product.purchasable && product.madeToOrder === false && product.preparationDays === 0;
  const tag = savings
    ? { label: '−' + savings.label.replace(' off', ''), tone: 'discount' }
    : product.madeToOrder
      ? { label: 'Made to order', tone: 'made' }
      : readyToDispatch
        ? { label: 'Ready to dispatch', tone: 'ready' }
        : { label: product.label, tone: 'default' };

  return (
    <article aria-label={product.name} className={styles.product + (rank ? ' ' + styles.ranked : '')}>
      <Link href={'/products/' + encodeURIComponent(product.slug)} className={styles.productLink}>
        <div data-media-frame="cover" className={mediaFrameClass('cover', styles.photo)}>
          <Image data-media-mode="cover" src={product.image} alt={product.imageAlt} fill sizes={rank ? rankedSizes : arrivedSizes}
            unoptimized={product.image.startsWith('/api/')} className={mediaObjectClass('cover')} />
          {rank ? <span className={styles.rank} aria-hidden="true">{rank}</span> : tag.label ? (
            <span className={styles.tag} data-label={tag.tone}>{tag.label}</span>
          ) : null}
        </div>
        <h3>{product.name}</h3>
        {rank ? (
          <p>{price}{product.tradingName ? ' · ' + (product.makerName ?? product.tradingName) : null}</p>
        ) : (
          <>
            {product.tradingName ? <p>by {product.makerName ?? product.tradingName}</p> : null}
            <div className={styles.price}>
              <strong>{price}</strong>
              {savings && product.compareAtPricePaisa ? <del>NPR {money.format(product.compareAtPricePaisa / 100)}</del> : null}
            </div>
          </>
        )}
        {product.participationRoute === 'managed_maker' && product.tradingName ? (
          <SellerDisclosure managed supplierName={product.makerName ?? product.tradingName} legalSellerName={product.legalSellerName} />
        ) : null}
        {product.purchasable === false ? <p>Not available to order yet</p> : null}
      </Link>
      {canSave ? (
        <div className={styles.save}>
          {signInHref ? (
            <a href={signInHref} target="_top" aria-label={'Sign in to save ' + product.name} className={styles.guestHeart}>
              <Heart size={18} aria-hidden="true" />
            </a>
          ) : (
            <WishlistButton productId={product.id} initialSaved={saved} compact iconOnly />
          )}
        </div>
      ) : null}
    </article>
  );
}

export function HomepageNewArrivals({
  products,
  savedIds,
  signInHref,
}: {
  products: readonly HomepageProduct[];
  savedIds: readonly string[];
  signInHref?: string;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const categories = [...new Map(products.map(product => [product.categorySlug ?? product.category, product.category])).entries()];
  const selected = categories.some(([key]) => key === filter) ? filter : null;
  const visible = selected ? products.filter(product => (product.categorySlug ?? product.category) === selected) : products;
  const moreParams = new URLSearchParams({ sort: 'newest' });
  if (selected && visible[0]?.categorySlug) moreParams.set('category', visible[0].categorySlug);

  return (
    <section id="latest-products" aria-labelledby="new-arrivals-heading" className={styles.section + ' scroll-mt-44'}>
      <div className={styles.shell}>
        <div className={styles.heading}>
          <div>
            <h2 id="new-arrivals-heading">New arrivals</h2>
            <p>Freshly listed by makers and sellers across Nepal.</p>
          </div>
          {categories.length > 1 ? (
            <fieldset className={styles.filters}>
              <legend className="sr-only">Filter new arrivals</legend>
              <button type="button" className={styles.chip} aria-pressed={selected === null} onClick={() => setFilter(null)}>All</button>
              {categories.map(([key, label]) => (
                <button key={key} type="button" className={styles.chip} aria-pressed={selected === key} onClick={() => setFilter(key)}>{label}</button>
              ))}
            </fieldset>
          ) : null}
        </div>
        {visible.length ? (
          <>
            <p className="sr-only" aria-live="polite">{visible.length} {visible.length === 1 ? 'product' : 'products'}</p>
            <div className={styles.arrivals}>
              {visible.map(product => <HomepageProductCard key={product.id} product={product} saved={savedIds.includes(product.id)} signInHref={signInHref} canSave />)}
            </div>
            <div className="mt-8 flex justify-center">
              <Link href={'/shop?' + moreParams.toString()} className={styles.outlinedButton}>
                See all new arrivals <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border bg-white p-6">
            <h3 className="font-heading text-2xl">Fresh finds are on the way.</h3>
            <p className="mt-2">New products will appear here as soon as they’re ready to shop.</p>
            <Link href="#categories" className={styles.more}>Explore craft categories <ArrowDown size={16} aria-hidden="true" /></Link>
          </div>
        )}
      </div>
    </section>
  );
}
