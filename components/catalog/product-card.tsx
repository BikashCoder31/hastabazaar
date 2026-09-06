import Image from 'next/image';

import type { FeaturedProduct } from '@/lib/catalog/featured-products';

export function ProductCard({ product }: { product: FeaturedProduct }) {
  return (
    <article className="group">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[1.4rem] bg-muted">
        <Image
          src={product.image}
          alt={product.imageAlt}
          fill
          sizes="(min-width: 1024px) 24vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold backdrop-blur">
          {product.category}
        </span>
      </div>
      <div className="mt-4">
        <h3 className="line-clamp-2 min-h-12 text-base font-semibold leading-6">
          {product.name}
        </h3>
        <p className="mt-2 font-heading text-xl">NPR {product.price}</p>
      </div>
    </article>
  );
}
