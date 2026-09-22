'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';

import { ProductCard } from '@/components/catalog/product-card';
import { Button } from '@/components/ui/button';
import type { FeaturedProduct } from '@/lib/catalog/featured-products';
import { mediaSizes } from '@/lib/media/responsive-media';

export function ProductSlider({
  products,
  label,
  wideDesktop = false,
}: {
  products: readonly FeaturedProduct[];
  label: string;
  wideDesktop?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  function move(direction: -1 | 1) {
    const element = scroller.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(260, element.clientWidth * 0.82),
      behavior: 'smooth',
    });
  }

  return (
    <div className="relative">
      {products.length > 1 ? (
        <div className="mb-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label={`Show previous ${label}`}
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label={`Show next ${label}`}
            onClick={() => move(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
      <div
        ref={scroller}
        aria-label={label}
        className="homepage-product-scroller flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3 sm:gap-6"
      >
        {products.map((product) => (
          <div
            key={product.slug}
            className={
              wideDesktop
                ? 'min-w-0 shrink-0 basis-[78%] snap-start sm:basis-[42%] lg:basis-[calc(25%-1.125rem)] 2xl:basis-[calc(20%-1.2rem)]'
                : 'min-w-0 shrink-0 basis-[78%] snap-start sm:basis-[42%] lg:basis-[calc(25%-1.125rem)]'
            }
          >
            <ProductCard product={product} sizes={mediaSizes.productSlider} />
          </div>
        ))}
      </div>
    </div>
  );
}
