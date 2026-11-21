import type { ReactNode } from 'react';
import Link from 'next/link';
import { Banknote, Check, ChevronDown, MessageCircle, RotateCcw, Star, Store, Truck } from 'lucide-react';
import { ProductOfferPrice, ProductOfferProvider } from '@/components/catalog/product-offer-selection';
import { ProductGallery } from '@/components/catalog/product-gallery';
import { ProductDelivery } from '@/components/commerce/product-delivery';
import type { DeliveryRates } from '@/lib/checkout/delivery-rates';
import { formatNepalDateOnly } from '@/lib/dates/nepal-calendar';
import type { PublicProductRow } from '@/lib/db/repositories/products';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';
import { productReturnDisclosure } from '@/lib/returns/presentation';

interface StorefrontProductDetailProps {
  product: PublicProductRow & { media: readonly { id: string; altEn: string; mimeType?: string; src?: string }[] };
  deliveryRates: DeliveryRates | null;
  purchaseActions?: ReactNode;
  hasReviews?: boolean;
  rating?: { value: number; count: number } | null;
  preview?: { offerId?: string; preparationRecorded: boolean };
}

const marketplace = phaseOneMarketplacePolicy.value;
const detailLink = 'inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const box = 'rounded-2xl border border-[#e2d6c2] bg-[#fffdf9]';

function preparationLabel({ madeToOrder, preparationDays }: PublicProductRow) {
  const time = preparationDays === 0 ? 'Ready to dispatch' : `${preparationDays} ${preparationDays === 1 ? 'day' : 'days'} before dispatch`;
  return madeToOrder ? (preparationDays > 0 ? `Made to order · ${time}` : 'Made to order') : time;
}

export function StorefrontProductDetail({ product, deliveryRates, purchaseActions, hasReviews, rating, preview }: StorefrontProductDetailProps) {
  const sellerName = product.makerName ?? product.tradingName;
  const sellerLabel = product.participationRoute === 'managed_maker' ? 'Supplied by' : 'Sold by';
  const sellerHref = `/makers/${encodeURIComponent(product.sellerId)}`;
  const showsDelivery = preview ? preview.preparationRecorded : product.purchasable;
  return (
    <ProductOfferProvider productId={product.id} offerSet={product.offerSet} preview={Boolean(preview)} initialOfferId={preview?.offerId}>
      <div className="min-w-0">
        <ProductGallery key={product.id} media={product.media} productName={product.nameEn} />
      </div>
      <div className="min-w-0">
        {preview ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-[#46536f]"><Store className="size-4 shrink-0" aria-hidden="true" />{sellerLabel} {sellerName}</p>
        ) : (
          <Link href={sellerHref} className={`${detailLink} text-[#46536f] hover:underline`}><Store className="size-4 shrink-0 text-[#95692b]" aria-hidden="true" />{sellerName || 'Seller shop'}</Link>
        )}
        <h1 className="mt-1 wrap-break-word font-heading text-[clamp(1.875rem,3.7vw,2.875rem)] leading-tight font-semibold tracking-tight text-[#14213d]">{product.nameEn}</h1>
        {!preview ? (
          <Link href="#reviews" className={`${detailLink} wrap-break-word text-[#46536f] hover:underline`}>
            {rating ? <><Star className="size-4 shrink-0 fill-[#a47325] text-[#a47325]" aria-hidden="true" />{rating.value} out of 5 · {rating.count} {rating.count === 1 ? 'review' : 'reviews'}</>
              : hasReviews ? 'Read reviews' : 'No published reviews yet'}
          </Link>
        ) : null}
        <ProductOfferPrice pricePaisa={product.pricePaisa} compareAtPricePaisa={product.compareAtPricePaisa} priceFrom={product.priceFrom}
          purchasable={product.purchasable} inventoryQuantity={product.inventoryQuantity} preview={Boolean(preview)} />
        <section className="my-5" aria-label="Product description">
          <p className="whitespace-pre-line wrap-break-word text-base leading-7 text-[#46536f]">{product.descriptionEn}</p>
        </section>
        {!preview ? purchaseActions : null}
        <ProductPurchaseFacts product={product} deliveryRates={showsDelivery ? deliveryRates : null} showsDelivery={showsDelivery} preview={Boolean(preview)} />
      </div>
      <section className="mt-4 min-w-0 border-t border-[#d9c8ae] pt-7 md:col-span-2 md:mt-10 md:pt-10">
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2 lg:gap-12">
          <ProductDetails product={product} showsDelivery={showsDelivery} preview={Boolean(preview)} />
          <section className={`${box} min-w-0 p-5 sm:p-6`} aria-label="Seller">
            <p className="text-sm text-[#675b4e]">{sellerLabel}</p>
            <h2 className="mt-1 wrap-break-word font-heading text-2xl font-semibold">{sellerName || 'Seller information'}</h2>
            {product.producer && product.producer !== sellerName ? <p className="mt-2 wrap-break-word text-sm text-[#46536f]">Maker or brand: {product.producer}</p> : null}
            <p className="mt-3 wrap-break-word text-sm leading-6 text-[#46536f]">
              {product.participationRoute === 'managed_maker'
                ? product.legalSellerName ? `Sold and invoiced by ${product.legalSellerName}` : 'Seller and invoice identity require review'
                : 'Through Hastabazaar'}
            </p>
            {!preview ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link href={sellerHref} className={`${detailLink} border border-[#d9c8ae] px-3`}>Visit shop</Link>
                <Link href="/help" className={`${detailLink} px-2`}>
                  <MessageCircle className="size-4 shrink-0" aria-hidden="true" /> Ask a question
                </Link>
              </div>
            ) : null}
          </section>
        </div>
        {product.originStory ? <section className={`${box} mt-7 p-5 sm:p-6`}>
          <h2 className="font-heading text-2xl">The story behind this product</h2>
          <p className="mt-3 whitespace-pre-line wrap-break-word leading-7 text-[#46536f]">{product.originStory}</p>
        </section> : null}
      </section>
    </ProductOfferProvider>
  );
}

function ProductPurchaseFacts({ product, deliveryRates, showsDelivery, preview }: {
  product: PublicProductRow;
  deliveryRates: DeliveryRates | null;
  showsDelivery: boolean;
  preview: boolean;
}) {
  const returns = productReturnDisclosure(Boolean(product.returnEligible), product.returnConditions, marketplace.returns);
  const eligible = Boolean(product.returnEligible) && marketplace.returns.changeOfMindEnabled;
  return (
    <>
      {showsDelivery ? <p className="mt-4 flex items-start gap-2 text-sm text-[#1f664b]"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{preparationLabel(product)}</p> : null}
      <section aria-label="Delivery and returns" className={`${box} mt-4 divide-y divide-[#e2d6c2] text-sm`}>
        {!preview && showsDelivery && marketplace.shipping.codEnabled ? <div className="flex gap-3 p-4">
          <Banknote className="mt-0.5 size-4 shrink-0 text-[#a8232e]" aria-hidden="true" />
          <div><h2 className="font-semibold">Cash on delivery</h2><p className="mt-0.5 text-[#46536f]">Pay the courier when your parcel arrives. Your receipt is in My orders.</p></div>
        </div> : null}
        {deliveryRates ? <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            <Truck className="size-4 shrink-0 text-[#a8232e]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Delivery to your area</span>
              <span className="mt-0.5 block text-[#46536f]">Rates and dates are confirmed at checkout.</span>
            </span>
            <span className="font-semibold text-[#a8232e] underline underline-offset-4">Check<span className="sr-only"> delivery</span></span>
          </summary>
          <div className="px-4 pb-4"><ProductDelivery rates={deliveryRates} preparationDays={product.preparationDays} madeToOrder={Boolean(product.madeToOrder)} /></div>
        </details> : null}
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            <RotateCcw className="size-4 shrink-0 text-[#a8232e]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{eligible ? `${marketplace.returns.generalRequestWindowDays} days to ask for a return` : 'Not eligible for change-of-mind returns'}</span>
              <span className="mt-0.5 block text-[#46536f]">Wrong, damaged or faulty items can still be reviewed.</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-[#46536f]" aria-hidden="true" />
          </summary>
          <div className="space-y-2 px-4 pb-3 leading-6 text-[#46536f]">
            <p className="font-medium">{returns.eligibility}</p>
            <p className="whitespace-pre-line wrap-break-word">{returns.conditions}</p>
            <p>{returns.protection}</p>
            <p>After delivery, request a return from your secure receipt or My orders. We use the policy saved with your order.</p>
            <Link href="/returns" className={`${detailLink} text-[#a8232e] underline`}>Return policy & help</Link>
          </div>
        </details>
      </section>
    </>
  );
}

function ProductDetails({ product, showsDelivery, preview }: { product: PublicProductRow; showsDelivery: boolean; preview: boolean }) {
  const rows: Array<[string, ReactNode]> = [
    ['Materials', product.materials], ['Dimensions', product.dimensions], ['Size', product.size], ['Colour', product.colour],
    ['Variations', product.variations], ['Specifications', product.specifications], ['Country of origin', product.originDisclosure],
    ['Care', product.careInstructions], ['Safe use', product.safetyInformation], ['Warranty or guarantee', product.warranty],
    ['Manufactured', product.manufacturedAt == null ? null : formatNepalDateOnly(product.manufacturedAt)],
    ['Expiry', product.expiresAt == null ? null : formatNepalDateOnly(product.expiresAt)],
    ['Platform SKU', product.sku || '—'], ['Preparation', showsDelivery ? preparationLabel(product) : preview ? 'Preparation time not provided.' : 'Ordering is not available yet.'],
  ];
  for (const [key, label] of [
    ['brand', 'Brand'], ['model', 'Model'], ['condition', 'Condition'], ['unitContents', 'In the box'], ['packQuantity', 'Pieces in one sales unit'],
    ['sizeGuide', 'Size guide'], ['warrantyProvider', 'Warranty provider'], ['warrantyDuration', 'Warranty duration'], ['warrantyTerms', 'Warranty terms'],
  ] as const) {
    const value = product.offerSet?.details?.[key];
    if (value) rows.push([label, Array.isArray(value) ? value.join(', ') : value]);
  }
  return (
    <div>
      <h2 className="font-heading text-3xl font-semibold">The details</h2>
      {rows.some(([, value]) => Boolean(value)) ? (
        <dl className="mt-5 divide-y divide-[#e2d6c2] border-y border-[#e2d6c2] text-sm">
          {rows.map(([label, value]) => value ? <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <dt className="wrap-break-word text-[#675b4e]">{label}</dt>
            <dd className="whitespace-pre-line wrap-break-word text-[#14213d]">{value}</dd>
          </div> : null)}
        </dl>
      ) : null}
    </div>
  );
}
