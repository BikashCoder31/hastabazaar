export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/' },
  openGraph: {
    title: 'Hastabazaar — Products, Gifts & Crafts in Nepal',
    description: 'Discover new products, gifts, jewellery, textiles and homeware from makers and independent sellers in Nepal.',
    siteName: 'Hastabazaar',
    url: 'https://hastabazaar.com/',
    type: 'website',
  },
};
import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Bell,
  HandHeart,
  Heart,
  MapPin,
  MessageCircle,
  Package,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  UserRound,
} from 'lucide-react';

import { categoryImage as getCategoryImage } from '@/lib/catalog/category-presentation';
import { ProductSlider } from '@/components/catalog/product-slider';
import { HomepageHeroCarousel } from '@/components/homepage/homepage-hero-carousel';
import { HomepageOccasionCarousel } from '@/components/homepage/homepage-occasion-carousel';
import { CraftDetails } from '@/components/homepage/craft-details';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import {
  mediaFrameClass,
  mediaObjectClass,
} from '@/lib/media/responsive-media';
import { requireDatabase } from '@/lib/db/d1';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import {
  listActiveHomepagePromotions,
  listActiveOccasions,
  listHomepageLatestProducts,
  listHomepagePromotedProducts,
  listHomepageTopProducts,
  listPublicDiscoveryCategories,
} from '@/lib/db/repositories/products';
import { CURRENT_HERO_RECOVERY_SLIDES } from '@/lib/homepage/hero-slides';
import { CURRENT_OCCASION_RECOVERY_SLIDES } from '@/lib/homepage/occasion-slides';
import { brandStructuredData } from '@/lib/seo/brand';
import { safeJsonLd } from '@/lib/seo/discovery';

const customerShortcuts = [
  {
    title: 'My orders',
    detail: 'Orders, receipts & tracking',
    href: '/account/orders',
    icon: Package,
  },
  {
    title: 'My wishlist',
    detail: 'Keep your favourites close',
    href: '/account/wishlist',
    icon: Heart,
  },
  {
    title: 'My account',
    detail: 'Profile & contact details',
    href: '/account',
    icon: UserRound,
  },
  {
    title: 'Saved addresses',
    detail: 'Your delivery destinations',
    href: '/account/addresses',
    icon: MapPin,
  },
  {
    title: 'Notifications',
    detail: 'Updates on your orders',
    href: '/account/notifications',
    icon: Bell,
  },
  {
    title: 'Track a guest order',
    detail: 'Find your secure receipt',
    href: '/help#tracking',
    icon: ShoppingBag,
  },
  {
    title: 'Returns & refunds',
    detail: 'Help after delivery',
    href: '/help#returns',
    icon: RotateCcw,
  },
  {
    title: 'Help & complaints',
    detail: 'Let’s work it out together',
    href: '/help#complaints',
    icon: MessageCircle,
  },
];

export const dynamic = 'force-dynamic';

async function resolveHomepageHero(database: D1Database) {
  try {
    const effective = await getEffectiveBusinessSetting(
      database,
      'homepage_hero_slides',
      Date.now(),
    );
    if (effective.value.filter((slide) => slide.enabled).length < 3) {
      throw new RangeError(
        'Published homepage hero has fewer than three enabled slides.',
      );
    }
    return {
      slides: effective.value,
      source: 'published' as const,
      warning: null,
    };
  } catch {
    return {
      slides: CURRENT_HERO_RECOVERY_SLIDES,
      source: 'recovery' as const,
      warning: 'Published hero configuration could not be used.',
    };
  }
}

async function resolveHomepageOccasions(database: D1Database) {
  try {
    const effective = await getEffectiveBusinessSetting(
      database,
      'homepage_occasion_slides',
      Date.now(),
    );
    if (effective.value.filter((slide) => slide.enabled).length < 2) {
      throw new RangeError(
        'Published homepage occasion carousel has fewer than two enabled slides.',
      );
    }
    return effective.value;
  } catch {
    return CURRENT_OCCASION_RECOVERY_SLIDES;
  }
}

export default async function Home() {
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [
    promoted,
    latestProducts,
    topProducts,
    activePromotions,
    categories,
    occasions,
    resolvedHero,
    occasionSlides,
  ] = await Promise.all([
    listHomepagePromotedProducts(database),
    listHomepageLatestProducts(database),
    listHomepageTopProducts(database),
    listActiveHomepagePromotions(database),
    listPublicDiscoveryCategories(database),
    listActiveOccasions(database),
    resolveHomepageHero(database),
    resolveHomepageOccasions(database),
  ]);
  const heroSlides = resolvedHero.slides;
  const topSliderProducts =
    topProducts.length > 0
      ? topProducts
      : promoted.map((product) => ({ ...product, label: 'Featured' as const }));
  const offerDate = new Intl.DateTimeFormat('en-NP', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kathmandu',
  });
  const homepageCategories = categories;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(brandStructuredData) }} />
      <SiteHeader />
      <main tabIndex={-1} id="main-content">
        <h1 className="sr-only">Hastabazaar — Products, gifts and crafts from makers and sellers in Nepal</h1>
        <HomepageHeroCarousel slides={heroSlides} />

        <div id="categories" className="homepage-category-wrap shell">
          <section className="homepage-category-panel">
            <div className="homepage-category-heading">
              <h2>Shop by category</h2>
              <Link href="/categories" className="homepage-category-all">
                View all categories <ArrowRight className="size-4" />
              </Link>
            </div>
            <nav
              aria-label="Shop featured craft categories"
              className="homepage-category-list"
              style={{
                gridTemplateColumns: 'none',
                gridAutoFlow: 'column',
                gridAutoColumns: 'minmax(7.5rem, 1fr)',
              }}
            >
              {homepageCategories.map((category) => {
                const categoryImage = getCategoryImage(category);
                return (
                  <Link
                    key={category.id}
                    href={'/shop?category=' + encodeURIComponent(category.slug)}
                    className="homepage-category-item"
                  >
                    <span
                      data-media-frame="cover"
                      className={mediaFrameClass(
                        'cover',
                        'homepage-category-image',
                      )}
                    >
                      {categoryImage ? (
                        <Image
                          data-media-mode="cover"
                          src={categoryImage.src}
                          unoptimized={Boolean(category.imageId)}
                          alt={categoryImage.alt}
                          fill
                          sizes="112px"
                          className={mediaObjectClass('cover')}
                        />
                      ) : (
                        <Package
                          aria-hidden="true"
                          className="absolute inset-0 m-auto size-9 text-primary/60"
                        />
                      )}
                    </span>
                    <span>{category.nameEn}</span>
                  </Link>
                );
              })}
              <Link href="/categories" className="homepage-category-item">
                <span className="homepage-category-more">
                  <Sparkles aria-hidden="true" />
                </span>
                <span>All categories</span>
              </Link>
            </nav>
            {homepageCategories.length === 0 ? (
              <p className="mt-5 text-muted-foreground">
                Our craft collections are being prepared. Browse all available
                products in the shop.
              </p>
            ) : null}
          </section>
        </div>

        <section className="shell py-4 sm:py-6">
          <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              {
                icon: HandHeart,
                label: 'Discover the seller',
                detail: 'Seller details on each product page',
              },
              {
                icon: Banknote,
                label: 'Cash on delivery',
                detail: 'Pay when your order arrives',
              },
              {
                icon: ShieldCheck,
                label: 'Care beyond checkout',
                detail: 'Order support, returns & refunds',
              },
            ].map(({ icon: Icon, label, detail }) => (
              <div
                key={label}
                className="flex items-center gap-3 px-4 py-4 lg:px-7"
              >
                <Icon className="size-6 shrink-0 text-[#b5121b]" />
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {activePromotions.length > 0 && promoted.length > 0 ? (
          <section id="offers" className="shell py-10 sm:py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Current offers</p>
                <h2 className="section-heading mt-3">
                  Worth knowing about now.
                </h2>
              </div>
              <Link href="/shop" className="section-link">
                Browse all products <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <div className="mt-7 grid gap-3 md:grid-cols-3">
              {activePromotions.map((promotion, index) => (
                <article
                  key={promotion.id}
                  className={
                    index === 0
                      ? 'rounded-3xl bg-[#142d56] p-6 text-white md:col-span-2'
                      : 'rounded-3xl border bg-card p-6'
                  }
                >
                  <p
                    className={
                      index === 0
                        ? 'text-xs font-bold uppercase tracking-[0.16em] text-[#f4c46b]'
                        : 'eyebrow'
                    }
                  >
                    Current marketplace offer
                  </p>
                  <h3 className="mt-3 font-heading text-2xl leading-tight">
                    {promotion.nameEn}
                  </h3>
                  <p
                    className={
                      index === 0
                        ? 'mt-3 text-sm leading-6 text-white/75'
                        : 'mt-3 text-sm leading-6 text-muted-foreground'
                    }
                  >
                    {promotion.productCount}{' '}
                    {promotion.productCount === 1
                      ? 'product on offer'
                      : 'products on offer'}
                    {' · '}Available through{' '}
                    {offerDate.format(promotion.endsAt)}
                  </p>
                  <Link
                    href="#offer-products"
                    className={
                      index === 0
                        ? 'mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-5 text-sm font-semibold hover:bg-white/10'
                        : 'section-link mt-5'
                    }
                  >
                    See offer products <ArrowRight className="size-4" />
                  </Link>
                </article>
              ))}
            </div>
            <div id="offer-products" className="mt-8 scroll-mt-24">
              <ProductSlider
                products={promoted}
                label="Current offer products"
              />
            </div>
          </section>
        ) : null}

        <section
          id="latest-products"
          className="bg-secondary/45 py-10 sm:py-14"
        >
          <div className="homepage-product-shell shell">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">NEW TO HASTABAZAAR</p>
                <h2 className="section-heading mt-3">New arrivals.</h2>
              </div>
              <Link href="/shop?sort=newest" className="section-link">
                Shop all new arrivals <ArrowRight className="size-4" />
              </Link>
            </div>
            {latestProducts.length > 0 ? (
              <div className="mt-8">
                <ProductSlider
                  products={latestProducts}
                  label="Latest seller products"
                  wideDesktop
                />
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border bg-card p-7 sm:p-9">
                <h3 className="font-heading text-2xl">
                  Fresh finds are on the way.
                </h3>
                <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                  New products will appear here as soon as they’re ready
                  to shop.
                </p>
                <Link href="#categories" className="section-link mt-5">
                  Explore craft categories <ArrowDown className="size-4" />
                </Link>
              </div>
            )}
          </div>
        </section>

        {topSliderProducts.length > 0 ? (
          <section id="top-products" className="shell py-10 sm:py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">
                  {topProducts.length > 0 ? 'Popular with shoppers' : 'Featured finds'}
                </p>
                <h2 className="section-heading mt-3">
                  {topProducts.length > 0
                    ? 'Top products right now.'
                    : 'Featured by Hastabazaar.'}
                </h2>
              </div>
              <Link href="/shop" className="section-link">
                Explore the shop <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <div className="mt-8">
              <ProductSlider
                products={topSliderProducts}
                label={topProducts.length > 0 ? 'Top products' : 'Featured products'}
              />
            </div>
          </section>
        ) : null}

        <section className="shell pb-8 pt-4" aria-label="Browse gift occasions">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-2xl">Find your occasion</h2>
            <Link href="/occasions" className="section-link">
              All gift occasions <ArrowRight className="size-4" />
            </Link>
          </div>
          <nav
            aria-label="Gift occasions"
            className="mt-4 flex flex-wrap gap-2"
          >
            {occasions.map((occasion) => (
              <Link
                key={occasion.id}
                href={'/shop?occasion=' + encodeURIComponent(occasion.slug)}
                className="inline-flex min-h-11 items-center rounded-full border bg-card px-5 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {occasion.nameEn}
              </Link>
            ))}
          </nav>
        </section>

        <HomepageOccasionCarousel slides={occasionSlides} />

        <CraftDetails />

        <section id="our-standard" className="shell py-10 sm:py-14">
          <div className="max-w-2xl">
            <p className="eyebrow">The Hastabazaar promise</p>
            <h2 className="section-heading mt-3">
              Good craft. Thoughtful care.
            </h2>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: 'A considered collection',
                text: 'Sellers and product listings are reviewed before they become part of the marketplace.',
              },
              {
                icon: HandHeart,
                title: 'Details before you decide',
                text: 'Read each listing for materials, making details, origin information, and the seller behind the product.',
              },
              {
                icon: MessageCircle,
                title: 'Help when you need it',
                text: 'Keep track of orders and find support for delivery, item returns, refunds, and complaints.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="border-t-2 border-primary/25 pt-6"
              >
                <Icon className="size-6 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-3 leading-7 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="customer-care" className="border-t bg-secondary/50">
          <div className="shell py-12 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Your Hastabazaar</p>
                <h2 className="section-heading mt-3">
                  Everything, a little closer.
                </h2>
              </div>
              <Link href="/help" className="section-link">
                Visit the help centre <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {customerShortcuts.map(({ icon: Icon, title, detail, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-start gap-3 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50"
                >
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {detail}
                    </p>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
            <div className="mt-7 flex flex-col justify-between gap-5 rounded-2xl bg-card px-6 py-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <Store className="size-6 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">Made by you. Discovered here.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Find your place in our community of makers.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Link href="/sell" className="section-link">
                  Become a seller <ArrowUpRight className="size-4" />
                </Link>
                <Link href="/seller" className="section-link">
                  Seller dashboard <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
