export const metadata = {
  alternates: { canonical: 'https://hastabazaar.com/' },
  openGraph: {
    title: 'HastaBazaar — Handmade with a human story',
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
  BriefcaseBusiness,
  Cake,
  Flower2,
  Gift,
  HandHeart,
  Heart,
  House,
  Lamp,
  MapPin,
  MessageCircle,
  Package,
  Paintbrush,
  Palette,
  Plane,
  RotateCcw,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Sprout,
  Store,
  UserRound,
  Gem,
  type LucideIcon,
} from 'lucide-react';

import { ProductSlider } from '@/components/catalog/product-slider';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireDatabase } from '@/lib/db/d1';
import {
  listActiveOccasions,
  listActiveHomepagePromotions,
  listHomepageLatestProducts,
  listHomepagePromotedProducts,
  listHomepageTopProducts,
  listPublicDiscoveryCategories,
} from '@/lib/db/repositories/products';

const categoryIcons: Record<string, LucideIcon> = {
  gifts: Gift,
  'home-decor': Lamp,
  'jewelry-accessories': Gem,
  'traditional-textiles': Shirt,
  lifestyle: ShoppingBag,
  'art-paintings': Palette,
  pottery: HandHeart,
  'wood-bamboo-craft': Sprout,
  'personalized-gifts': Paintbrush,
  'corporate-gifting': BriefcaseBusiness,
};
const occasionIcons: Record<string, LucideIcon> = {
  'birthday-gifts': Cake,
  'wedding-gifts': Heart,
  'dashain-gifts': Flower2,
  'tihar-gifts': Sparkles,
  'mothers-day': Flower2,
  'fathers-day': Gift,
  anniversary: Heart,
  'corporate-gifts': BriefcaseBusiness,
  'nepali-gifts-abroad': Plane,
  housewarming: House,
  'personalized-gifts': Paintbrush,
};
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

export default async function Home() {
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [
    promoted,
    latestProducts,
    topProducts,
    activePromotions,
    categories,
    occasions,
  ] = await Promise.all([
    listHomepagePromotedProducts(database),
    listHomepageLatestProducts(database),
    listHomepageTopProducts(database),
    listActiveHomepagePromotions(database),
    listPublicDiscoveryCategories(database),
    listActiveOccasions(database),
  ]);
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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main tabIndex={-1} id="main-content">
        <section className="shell py-6 sm:py-8">
          <div className="grid overflow-hidden rounded-[2rem] bg-secondary lg:grid-cols-[1.05fr_1fr]">
            <div className="flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-12 lg:p-12">
              <p className="eyebrow flex items-center gap-2">
                <span className="h-px w-7 bg-primary" /> Handmade. Heartfelt.
                Nepali.
              </p>
              <h1 className="mt-5 max-w-xl font-heading text-[clamp(2.8rem,5.3vw,5rem)] leading-[1.03] tracking-[-0.045em]">
                A little craft.
                <br />A lot of{' '}
                <span className="italic text-primary">heart.</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Find a gift with meaning, a piece for your home, and a story
                worth keeping. Made by independent hands in Nepal.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/shop" className="storefront-button">
                  Explore the collection <ArrowRight className="size-4" />
                </Link>
                <Link
                  href={
                    activePromotions.length > 0 ? '#offers' : '#latest-products'
                  }
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-primary/25 px-5 py-3 font-semibold text-secondary-foreground transition-colors hover:bg-card"
                >
                  {activePromotions.length > 0
                    ? 'See current offers'
                    : 'See new products'}{' '}
                  <Sparkles className="size-4" />
                </Link>
              </div>
              <Link
                href="#categories"
                className="mt-9 inline-flex w-fit items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-primary"
              >
                Discover something you’ll love <ArrowDown className="size-4" />
              </Link>
            </div>
            <div className="grid min-h-80 grid-cols-[1.15fr_0.85fr] gap-3 p-4 pt-0 sm:min-h-[27rem] lg:min-h-[31rem] lg:p-5 lg:pl-0">
              <div className="hero-photo">
                <Image
                  src="/catalog/macrame-crossbody.jpg"
                  alt="Hand-knotted cream macrame crossbody bag"
                  fill
                  priority
                  sizes="(min-width: 1024px) 28vw, 55vw"
                  className="object-cover"
                />
                <div className="absolute inset-x-3 bottom-3 rounded-xl bg-white/95 p-4 text-[#172746] backdrop-blur-sm">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#2457b9]">
                    The beauty of handmade
                  </p>
                  <p className="mt-1 font-heading text-xl">
                    Every knot has a story.
                  </p>
                </div>
              </div>
              <div className="grid grid-rows-[1fr_auto] gap-3">
                <div className="hero-photo">
                  <Image
                    src="/catalog/embroidered-clutch.jpg"
                    alt="Colourful embroidered clutch with traditional mirror-work detailing"
                    fill
                    priority
                    sizes="(min-width: 1024px) 20vw, 40vw"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 rounded-2xl bg-[#183567] p-3 text-white sm:p-6">
                  <HandHeart className="size-7 text-[#f4c46b]" />
                  <p className="mt-3 font-heading text-xl leading-tight sm:text-2xl">
                    Made with
                    <br />
                    heart.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-white/75">
                    Craft, colour & a human touch.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 divide-y border-b py-3 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              {
                icon: HandHeart,
                label: 'Independent Nepali makers',
                detail: 'Discover the hands behind the craft',
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
                <Icon className="size-6 shrink-0 text-primary" />
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
                <p className="eyebrow">Approved offers</p>
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
                      ? 'eligible product'
                      : 'eligible products'}
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
          <div className="shell">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Updated from approved listings</p>
                <h2 className="section-heading mt-3">
                  Just added by our sellers.
                </h2>
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
                />
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border bg-card p-7 sm:p-9">
                <h3 className="font-heading text-2xl">
                  New products are coming soon.
                </h3>
                <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                  This space will update automatically when an approved seller
                  product with available stock and a product photo is published.
                </p>
                <Link href="#categories" className="section-link mt-5">
                  Browse craft categories <ArrowDown className="size-4" />
                </Link>
              </div>
            )}
          </div>
        </section>

        <section id="top-products" className="shell py-10 sm:py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">
                {topProducts.length > 0
                  ? 'Popular with shoppers'
                  : 'Selected with care'}
              </p>
              <h2 className="section-heading mt-3">
                {topProducts.length > 0
                  ? 'Top products right now.'
                  : 'Featured by HastaBazaar.'}
              </h2>
              <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                {topProducts.length > 0
                  ? 'Based on successfully delivered, non-cancelled purchases from the last 90 days.'
                  : 'Top products will be ranked here after enough successfully delivered purchases. Until then, only products from an active approved homepage promotion appear.'}
              </p>
            </div>
            <Link href="/shop" className="section-link">
              Explore the shop <ArrowUpRight className="size-4" />
            </Link>
          </div>
          {topSliderProducts.length > 0 ? (
            <div className="mt-8">
              <ProductSlider
                products={topSliderProducts}
                label={
                  topProducts.length > 0 ? 'Top products' : 'Featured products'
                }
              />
            </div>
          ) : (
            <p className="mt-7 rounded-2xl border bg-card p-6 text-muted-foreground">
              Popular products will appear after eligible seller listings
              receive completed deliveries.
            </p>
          )}
        </section>

        <section id="categories" className="shell py-10 sm:py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Follow your curiosity</p>
              <h2 className="section-heading mt-3">Find your kind of craft.</h2>
            </div>
            <Link href="/shop" className="section-link">
              Shop everything <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <nav
            aria-label="Shop by category"
            className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {categories.map((category, index) => {
              const Icon = categoryIcons[category.slug] ?? Gift;
              return (
                <Link
                  key={category.id}
                  href={'/shop?category=' + encodeURIComponent(category.slug)}
                  className="discovery-tile group"
                >
                  <span
                    className={
                      'flex size-11 items-center justify-center rounded-xl ' +
                      (index % 3 === 0
                        ? 'bg-secondary text-primary'
                        : index % 3 === 1
                          ? 'bg-accent/25 text-accent-foreground'
                          : 'bg-muted text-secondary-foreground')
                    }
                  >
                    <Icon className="size-6" strokeWidth={1.5} />
                  </span>
                  <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold leading-5">
                    {category.nameEn}
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </nav>
          {categories.length === 0 ? (
            <p className="mt-5 text-muted-foreground">
              Our craft collections are being prepared.{' '}
              <Link
                href="/shop"
                className="font-semibold text-primary underline"
              >
                Browse the shop
              </Link>
              .
            </p>
          ) : null}
        </section>

        <section
          id="occasions"
          className="my-8 bg-[#142d56] text-white sm:my-12"
        >
          <div className="shell grid gap-9 py-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-14 lg:py-16">
            <div className="self-center">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#f4c46b]">
                For their kind of special
              </p>
              <h2 className="section-heading mt-4 max-w-md">
                Big moments.
                <br />
                <span className="italic text-[#f4c46b]">Little surprises.</span>
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-white/75">
                Birthdays, festivals, thank-yous, or just because. Start with
                the occasion and find something that feels like them.
              </p>
              <p className="mt-6 flex items-start gap-2 text-sm leading-6 text-white/70">
                <MapPin className="mt-1 size-4 shrink-0" />
                Delivery is currently within Nepal.
              </p>
            </div>
            <nav
              aria-label="Shop gifts by occasion"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {occasions.map((occasion) => {
                const Icon = occasionIcons[occasion.slug] ?? Gift;
                return (
                  <Link
                    key={occasion.id}
                    href={'/shop?occasion=' + encodeURIComponent(occasion.slug)}
                    className="group flex min-h-28 flex-col items-start justify-between gap-4 rounded-xl border border-white/20 bg-white/5 p-4 transition-colors hover:border-[#f4c46b]/70 hover:bg-white/10 focus-visible:outline-[#f4c46b]"
                  >
                    <Icon className="size-5 text-[#f4c46b]" strokeWidth={1.5} />
                    <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
                      {occasion.nameEn}
                      <ArrowUpRight className="size-3.5 shrink-0 text-white/60" />
                    </span>
                  </Link>
                );
              })}
              <Link
                href="/shop?category=gifts"
                className="flex min-h-28 flex-col items-start justify-between gap-4 rounded-xl bg-[#f4c46b] p-4 font-semibold text-[#332608] transition-colors hover:bg-[#ffda97]"
              >
                <Gift className="size-5" />
                <span className="flex w-full items-center justify-between gap-2 text-sm">
                  Explore all gifts <ArrowRight className="size-4" />
                </span>
              </Link>
            </nav>
          </div>
        </section>

        <section id="makers" className="shell py-10 sm:py-14">
          <div className="grid overflow-hidden rounded-3xl border bg-card md:grid-cols-2">
            <div className="relative min-h-72 md:min-h-96">
              <Image
                src="/catalog/macrame-shelf.jpg"
                alt="Handmade macrame and wood shelf showing the texture of the knotted cotton"
                fill
                sizes="(min-width: 768px) 45vw, 100vw"
                className="object-cover object-[center_72%]"
              />
            </div>
            <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
              <p className="eyebrow">Meet the spirit of HastaBazaar</p>
              <h2 className="section-heading mt-4">
                Behind every piece,
                <br />
                there’s a person.
              </h2>
              <p className="mt-5 text-base leading-8 text-muted-foreground">
                From a carefully tied knot to a final hand-stitched detail, the
                maker is part of what makes it special. Discover their story on
                each product’s maker profile.
              </p>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
                <Link href="/shop" className="section-link">
                  Discover their work <ArrowRight className="size-4" />
                </Link>
                <Link href="/sell" className="section-link">
                  Share your craft <ArrowUpRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="our-standard" className="shell py-10 sm:py-14">
          <div className="max-w-2xl">
            <p className="eyebrow">The HastaBazaar promise</p>
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
                title: 'The maker comes first',
                text: 'Explore materials, making processes, and the independent sellers behind the things you love.',
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
                <p className="eyebrow">Your HastaBazaar</p>
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
