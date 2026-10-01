import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Package } from 'lucide-react';
import { WishlistButton } from '@/components/account/wishlist-button';
import type { WishlistProductRow } from '@/lib/db/repositories/customers';

export function SavedProductGrid({
  items,
}: {
  items: readonly WishlistProductRow[];
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="overflow-hidden rounded-2xl border bg-card"
        >
          <Link href={`/products/${item.slug}`} className="group block">
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
              {item.primaryMediaId ? (
                <Image
                  src={`/api/product-media/${item.primaryMediaId}`}
                  alt={item.nameEn}
                  fill
                  unoptimized
                  sizes="(min-width: 1280px) 25vw, (min-width: 640px) 40vw, 100vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <Package className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
              )}
              {item.inventoryQuantity < 1 ? (
                <span className="absolute left-3 top-3 rounded-full bg-background/95 px-3 py-1.5 text-xs font-semibold">
                  Currently unavailable
                </span>
              ) : null}
            </div>
            <div className="p-5 pb-3">
              <p className="text-sm font-semibold text-primary">
                {item.tradingName}
              </p>
              <h2 className="mt-1 line-clamp-2 min-h-12 font-semibold leading-6">
                {item.nameEn}
              </h2>
              <p className="mt-3 flex items-center justify-between gap-3 text-lg font-semibold">
                {new Intl.NumberFormat('en-NP', {
                  style: 'currency',
                  currency: 'NPR',
                }).format(item.pricePaisa / 100)}
                <ArrowUpRight className="size-4 text-primary" />
              </p>
            </div>
          </Link>
          <div className="px-5 pb-5">
            <WishlistButton productId={item.id} initialSaved compact />
          </div>
        </article>
      ))}
    </div>
  );
}
