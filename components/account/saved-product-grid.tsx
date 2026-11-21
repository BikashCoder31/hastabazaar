import Image from 'next/image';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { WishlistButton } from '@/components/account/wishlist-button';
import { AddSavedToBag } from '@/components/account/add-saved-to-bag';
import type { WishlistProductRow } from '@/lib/db/repositories/customers';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { mediaFrameClass, mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';

export function SavedProductGrid({ items }: { items: readonly WishlistProductRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {items.map(item => {
        const href = '/products/' + encodeURIComponent(item.slug);
        const enabled = item.purchasable !== false && item.inventoryQuantity > 0 && item.pricePaisa !== null;
        const options = item.offerSet?.offers.filter(offer => offer.orderable) ?? [];
        const selected = item.offerSet?.axes.length === 0 && options.length === 1 ? options[0] : null;
        const offer = selected && item.offerSet ? {
          offerId: selected.id, versionId: selected.versionId, pricePaisa: selected.pricePaisa, publicVersionId: item.offerSet.publicVersionId,
        } : undefined;
        return (
          <article key={item.id} className="flex min-w-0 flex-col gap-2">
            <div className="relative min-w-0">
              <Link href={href} className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8232e]" aria-label={item.nameEn}>
                <div data-media-frame="cover" className={mediaFrameClass('cover', 'account-surface aspect-square rounded-xl border border-[#e3d8c7] bg-[#fdfbf7]')}>
                  {item.primaryMediaId ? (
                    <Image src={`/api/product-media/${item.primaryMediaId}`} alt={item.nameEn} fill unoptimized
                      data-media-mode="cover" sizes={mediaSizes.savedProduct}
                      className={mediaObjectClass('cover')} />
                  ) : <Package className="absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />}
                </div>
              </Link>
              <div className="absolute right-1 top-1 max-w-[calc(100%-0.5rem)]">
                <WishlistButton productId={item.id} initialSaved compact iconOnly />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <Link href={href} className="block min-h-11 rounded-md text-sm leading-snug focus-visible:outline-2 focus-visible:outline-[#a8232e]">
                <span className="block break-words font-semibold">{item.nameEn}</span>
                <span className="mt-0.5 block text-[#465573]">{item.pricePaisa === null ? 'Price unavailable' : (item.priceFrom ? 'From ' : '') + formatPaisaExact(item.pricePaisa)}</span>
              </Link>
              {!enabled ? <p className="mt-1 text-xs text-muted-foreground">Currently unavailable</p> : null}
            </div>
            <AddSavedToBag productId={item.id} href={href} enabled={enabled} offer={offer} choose={Boolean(item.offerSet && !offer)} />
          </article>
        );
      })}
    </div>
  );
}
