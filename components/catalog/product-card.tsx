import { ProductDiscount } from '@/components/catalog/product-discount';
import { SellerDisclosure } from '@/components/commerce/seller-disclosure';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import type { FeaturedProduct } from '@/lib/catalog/featured-products';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

export function ProductCard({
  product,
  sizes = mediaSizes.productGrid,
}: {
  product: FeaturedProduct;
  sizes?: string;
}) {
  const href = `/products/${encodeURIComponent(product.slug)}`;
  return (
    <Link href={href} className="group block min-w-0 rounded-2xl">
      <div
        data-media-frame="cover"
        className={mediaFrameClass(
          'cover',
          'aspect-[4/5] rounded-[1.4rem] bg-muted',
        )}
      >
        <Image
          src={product.image}
          alt={product.imageAlt}
          data-media-mode="cover"
          fill
          unoptimized={product.image.startsWith('/api/')}
          sizes={sizes}
          className={mediaObjectClass(
            'cover',
            'transition-transform duration-500 group-hover:scale-[1.035]',
          )}
        />
        <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-full bg-background/95 px-3 py-1.5 text-xs font-semibold backdrop-blur sm:left-3 sm:top-3">
          {product.label ?? product.category}
        </span>
      </div>
      <div className="mt-4">
        <h3 className="line-clamp-2 min-h-12 text-base font-semibold leading-6">
          {product.name}
        </h3>
        {product.tradingName ? (
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {product.makerName ?? product.tradingName}
          </p>
        ) : null}
        {product.tradingName ? <SellerDisclosure managed={product.participationRoute==='managed_maker'} supplierName={product.makerName??product.tradingName} legalSellerName={product.legalSellerName}/> : null}
        <p className="mt-2 flex items-center justify-between gap-2 text-sm font-semibold text-primary">
          NPR {product.price}
          <ArrowUpRight className="size-4 shrink-0" />
        </p>
        {product.pricePaisa ? <ProductDiscount pricePaisa={product.pricePaisa} originalPaisa={product.compareAtPricePaisa} /> : null}
      </div>
    </Link>
  );
}
