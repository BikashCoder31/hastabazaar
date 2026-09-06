import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';

import { ProductCard } from '@/components/catalog/product-card';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { featuredProducts } from '@/lib/catalog/featured-products';
import { requireDatabase } from '@/lib/db/d1';
import { listHomepagePromotedProducts } from '@/lib/db/repositories/products';

const categories = [
  ['Gifts', 'gifts'],
  ['Home décor', 'home-decor'],
  ['Jewelry & accessories', 'jewelry-accessories'],
  ['Traditional textiles', 'traditional-textiles'],
  ['Lifestyle', 'lifestyle'],
  ['Art & paintings', 'art-paintings'],
  ['Pottery', 'pottery'],
  ['Wood/bamboo craft', 'wood-bamboo-craft'],
  ['Personalized gifts', 'personalized-gifts'],
  ['Corporate gifting', 'corporate-gifting'],
] as const;

const occasions = [
  ['Birthday gifts', 'birthday-gifts'],
  ['Wedding gifts', 'wedding-gifts'],
  ['Dashain gifts', 'dashain-gifts'],
  ['Tihar gifts', 'tihar-gifts'],
  ["Mother's Day", 'mothers-day'],
  ["Father's Day", 'fathers-day'],
  ['Anniversary', 'anniversary'],
  ['Corporate gifts', 'corporate-gifts'],
  ['Nepali gifts abroad', 'nepali-gifts-abroad'],
  ['Housewarming', 'housewarming'],
  ['Personalized gifts', 'personalized-gifts'],
] as const;

export const dynamic = 'force-dynamic';

export default async function Home() {
  const promoted = await listHomepagePromotedProducts(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  const homepageProducts = promoted.length > 0 ? promoted : featuredProducts;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="overflow-hidden border-b border-border/70">
          <div className="shell grid gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
            <div className="max-w-2xl">
              <p className="eyebrow">Nepal’s handmade marketplace</p>
              <h1 className="mt-4 max-w-xl font-heading text-5xl leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                Objects with a human story.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
                Discover thoughtful craft, jewellery, textiles, and homeware
                made with patience—not mass production.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="#catalog"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Explore the collection <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="#our-standard"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-background px-6 text-base font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Our craft standard
                </Link>
              </div>
            </div>

            <div
              className="hero-collage"
              aria-label="A preview of handmade products"
            >
              <div className="hero-image hero-image-primary">
                <Image
                  src="/catalog/macrame-crossbody.jpg"
                  alt="Handmade cream macramé crossbody bag"
                  fill
                  priority
                  sizes="(min-width: 1024px) 32vw, 70vw"
                  className="object-cover"
                />
              </div>
              <div className="hero-image hero-image-secondary">
                <Image
                  src="/catalog/embroidered-clutch.jpg"
                  alt="Colourful embroidered handcrafted clutch"
                  fill
                  priority
                  sizes="(min-width: 1024px) 18vw, 38vw"
                  className="object-cover"
                />
              </div>
              <p className="hero-note">
                <span className="font-heading text-2xl">85</span>
                <span>pieces ready to curate</span>
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-border/70 bg-card">
          <div className="shell flex flex-col gap-5 py-6 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Browse by category
            </p>
            <nav
              aria-label="Product collections"
              className="flex flex-wrap gap-2"
            >
              {categories.map(([category, slug]) => (
                <Link
                  key={category}
                  href={`/shop?category=${slug}`}
                  className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {category}
                </Link>
              ))}
            </nav>
          </div>
        </section>

        <section className="border-b border-border/70 bg-secondary/35">
          <div className="shell grid gap-8 py-12 lg:grid-cols-[0.7fr_1.3fr] lg:items-start">
            <div>
              <p className="eyebrow">Shop by occasion</p>
              <h2 className="mt-3 font-heading text-4xl tracking-tight">
                A thoughtful gift for the moment.
              </h2>
              <p className="mt-4 max-w-md leading-7 text-muted-foreground">
                Start with the celebration, then refine by craft category or
                search for a material and maker.
              </p>
            </div>
            <nav aria-label="Gift occasions" className="flex flex-wrap gap-3">
              {occasions.map(([occasion, slug]) => (
                <Link
                  key={occasion}
                  href={`/shop?occasion=${slug}`}
                  className="rounded-2xl border bg-background px-4 py-3 text-sm font-semibold transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {occasion}{' '}
                  <span aria-hidden="true" className="ml-1 text-primary">
                    ↗
                  </span>
                </Link>
              ))}
            </nav>
          </div>
        </section>

        <section id="catalog" className="shell scroll-mt-24 py-16 lg:py-24">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow">From the archive</p>
              <h2 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">
                A first look at the collection
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              These pieces were preserved from the earlier marketplace and are
              ready for review before the public catalogue is finalized.
            </p>
          </div>

          <div className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {homepageProducts.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        </section>

        <section
          id="our-standard"
          className="border-y border-border/70 bg-secondary/55"
        >
          <div className="shell py-16 lg:py-20">
            <div className="max-w-2xl">
              <p className="eyebrow">The Hathkriti standard</p>
              <h2 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">
                Built for craft, prepared with care.
              </h2>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-border bg-border md:grid-cols-3">
              <article className="standard-card">
                <span className="standard-index" aria-hidden="true">
                  01
                </span>
                <h3>Curated, not crowded</h3>
                <p>
                  Every listing will be reviewed for clarity, quality, and fit.
                </p>
              </article>
              <article className="standard-card">
                <span className="standard-index" aria-hidden="true">
                  02
                </span>
                <h3>Made with intention</h3>
                <p>
                  We foreground materials, process, and the hands behind each
                  piece.
                </p>
              </article>
              <article className="standard-card">
                <span className="standard-index" aria-hidden="true">
                  03
                </span>
                <h3>Ready for real orders</h3>
                <p>
                  Payments, delivery, returns, and support will be tested before
                  launch.
                </p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
