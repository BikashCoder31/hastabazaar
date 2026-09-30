'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ProductCard } from '@/components/catalog/product-card';
import { SliderDots } from '@/components/ui/slider-dots';
import {
  activeProductSliderPosition,
  productSliderPositions,
} from '@/lib/catalog/product-slider-position';
import type { FeaturedProduct } from '@/lib/catalog/featured-products';
import { mediaSizes } from '@/lib/media/responsive-media';

// oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- A focusable scroll region lets keyboard users browse the product cards.
export function ProductSlider({
  products,
  label,
  wideDesktop = false,
}: {
  products: readonly FeaturedProduct[];
  label: string;
  wideDesktop?: boolean;
}) {
  const scroller = useRef<HTMLElement>(null);

  const [positions, setPositions] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let snaps: number[] = [];
    const selected = () =>
      setCurrent(activeProductSliderPosition(snaps, element.scrollLeft));
    const measure = () => {
      const left = element.getBoundingClientRect().left;
      snaps = productSliderPositions(
        Array.from(
          element.children,
          (child) =>
            child.getBoundingClientRect().left - left + element.scrollLeft,
        ),
        element.scrollWidth,
        element.clientWidth,
      );
      setPositions(snaps);
      selected();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    Array.from(element.children).forEach((child) => observer.observe(child));
    element.addEventListener('scroll', selected, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', selected);
      window.removeEventListener('resize', measure);
    };
  }, [products]);

  const selectPage = useCallback(
    (index: number) => {
      const element = scroller.current;
      if (!element || positions[index] === undefined) return;
      element.scrollTo({
        left: positions[index],
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    },
    [positions],
  );

  return (
    <div className="relative">
      <section
        onKeyDown={(event) => {
          if (
            event.defaultPrevented ||
            (event.target as HTMLElement).closest(
              'input, textarea, select, video',
            )
          )
            return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            selectPage(
              Math.max(
                0,
                Math.min(
                  positions.length - 1,
                  current + (event.key === 'ArrowRight' ? 1 : -1),
                ),
              ),
            );
          }
        }}
        ref={scroller}
        aria-label={label}
        aria-roledescription="carousel"
        tabIndex={0}
        className="homepage-product-scroller flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth motion-reduce:scroll-auto pb-3 sm:gap-6"
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
            <ProductCard
              product={product}
              sizes={
                wideDesktop
                  ? mediaSizes.productSliderWide
                  : mediaSizes.productSlider
              }
            />
          </div>
        ))}
      </section>
      <SliderDots
        label={`Choose ${label} page`}
        labels={positions.map(
          (_, index) =>
            `Show ${label} page ${index + 1} of ${positions.length}`,
        )}
        current={current}
        onSelect={selectPage}
        className="mt-1"
      />
    </div>
  );
}

// oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex
