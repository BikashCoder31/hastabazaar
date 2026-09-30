import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Gift, Package } from 'lucide-react';
import { categoryImage } from '@/lib/catalog/category-presentation';
import type { CategoryRow } from '@/lib/db/repositories/products';

export function TaxonomyDirectory({
  kind,
  entries,
}: {
  kind: 'category' | 'occasion';
  entries: readonly CategoryRow[];
}) {
  const categories = kind === 'category';
  const Icon = categories ? Package : Gift;
  return (
    <section
      className="shell py-10 sm:py-16"
      aria-labelledby="taxonomy-heading"
    >
      <Link
        href="/"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        Home
      </Link>
      <p className="eyebrow mt-8">
        {categories
          ? 'Find your kind of craft'
          : 'Thoughtful gifts, every occasion'}
      </p>
      <h1 id="taxonomy-heading" className="section-title mt-3">
        {categories ? 'All categories' : 'All gift occasions'}
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
        {categories
          ? 'Explore every active collection. Choose a category to see its available products.'
          : 'Choose an occasion to explore matching gifts. New collections may still be awaiting their first products.'}
      </p>
      {entries.length ? (
        <div className="mt-9 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {entries.map((entry) => {
            const image = categories ? categoryImage(entry) : null;
            return (
              <Link
                key={entry.id}
                href={`/shop?${kind}=${encodeURIComponent(entry.slug)}`}
                className="group min-w-0 overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <div data-media-frame="cover" className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-secondary/60">
                  {image ? (
                    <Image
                      data-media-mode="cover"
                      src={image.src}
                      unoptimized={Boolean(entry.imageId)}
                      alt={image.alt}
                      fill
                      sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
                      className="object-cover"
                    />
                  ) : (
                    <Icon
                      aria-hidden="true"
                      className="size-12 text-primary/60"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <h2 className="min-w-0 break-words font-semibold">
                    {entry.nameEn}
                  </h2>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="mt-8 rounded-2xl border p-6 text-muted-foreground">
          {categories ? 'Categories' : 'Gift occasions'} are being prepared.{' '}
          <Link href="/shop" className="underline">
            Browse the shop
          </Link>{' '}
          in the meantime.
        </p>
      )}
    </section>
  );
}
