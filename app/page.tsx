import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, Bell, CircleHelp, Eye, Heart, MapPin, MessageCircle,
  Package, ReceiptText, ShieldCheck, Store, UserRound,
} from 'lucide-react';

import { signInPath } from '@/app/auth';
import { readAccountYourTurn } from '@/app/account/account-overview-data';
import { CraftDetails } from '@/components/homepage/craft-details';
import { HomepageHeroCarousel } from '@/components/homepage/homepage-hero-carousel';
import { HomepageOccasionCarousel } from '@/components/homepage/homepage-occasion-carousel';
import { HomepageNewArrivals, HomepageProductCard } from '@/components/homepage/homepage-products';
import styles from '@/components/homepage/homepage.module.css';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import { getCustomerReadContext } from '@/lib/auth/customer';
import { categoryImage } from '@/lib/catalog/category-presentation';
import { companyPublicContacts } from '@/lib/content/company-details';
import { requireDatabase } from '@/lib/db/d1';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { listWishlist } from '@/lib/db/repositories/customers';
import { getPublishedLoyaltyTerms } from '@/lib/db/repositories/loyalty';
import {
  listActiveHomepagePromotions,
  listActiveOccasions,
  listHomepageLatestProducts,
  listHomepagePromotedProducts,
  listHomepageTopProducts,
  listPublicDiscoveryCategories,
} from '@/lib/db/repositories/products';
import { listHomepageMakers } from '@/lib/homepage/homepage-storefront-data';
import { CURRENT_HERO_RECOVERY_SLIDES } from '@/lib/homepage/hero-slides';
import { CURRENT_OCCASION_RECOVERY_SLIDES } from '@/lib/homepage/occasion-slides';
import { mediaFrameClass, mediaObjectClass } from '@/lib/media/responsive-media';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';
import { brandStructuredData } from '@/lib/seo/brand';
import { safeJsonLd } from '@/lib/seo/discovery';
import { managedMakerDisplayName, type CraftExperienceBand } from '@/lib/sellers/participation';

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
export const dynamic = 'force-dynamic';

const careShortcuts = [
  { title: 'My orders', detail: 'Orders, receipts & tracking', href: '/account/orders', Icon: Package },
  { title: 'My wishlist', detail: 'Keep your favourites close', href: '/account/wishlist', Icon: Heart },
  { title: 'My account', detail: 'Profile & contact details', href: '/account', Icon: UserRound },
  { title: 'Saved addresses', detail: 'Your delivery destinations', href: '/account/addresses', Icon: MapPin },
  { title: 'Notifications', detail: 'Updates on your orders', href: '/account/notifications', Icon: Bell },
  { title: 'Track an order', detail: 'With your order number', href: '/track', Icon: ReceiptText },
];

const promises = [
  {
    Icon: ShieldCheck, title: 'A considered collection',
    text: 'Sellers and product listings are reviewed before they become part of the marketplace.',
  },
  {
    Icon: Eye, title: 'Details before you decide',
    text: 'Read each listing for materials, making details, origin information, and the seller behind the product.',
  },
  {
    Icon: CircleHelp, title: 'Help when you need it',
    text: 'Keep track of orders and find support for delivery, item returns, refunds, and complaints.',
  },
];

const experienceLabels: Record<CraftExperienceBand, string> = {
  beginner: 'Beginner',
  less_than_one_year: 'Less than one year',
  one_to_three_years: '1–3 years',
  four_to_ten_years: '4–10 years',
  more_than_ten_years: 'More than ten years',
};

const offerDate = new Intl.DateTimeFormat('en-NP', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kathmandu',
});

async function resolveHomepageHero(database: D1Database, now: number) {
  try {
    const effective = await getEffectiveBusinessSetting(database, 'homepage_hero_slides', now);
    return effective.value.filter(slide => slide.enabled).length >= 3 ? effective.value : CURRENT_HERO_RECOVERY_SLIDES;
  } catch {
    return CURRENT_HERO_RECOVERY_SLIDES;
  }
}

async function resolveHomepageOccasions(database: D1Database, now: number) {
  try {
    const effective = await getEffectiveBusinessSetting(database, 'homepage_occasion_slides', now);
    return effective.value.filter(slide => slide.enabled).length >= 2 ? effective.value : CURRENT_OCCASION_RECOVERY_SLIDES;
  } catch {
    return CURRENT_OCCASION_RECOVERY_SLIDES;
  }
}

async function readHomepage(database: D1Database) {
  const now = Date.now();
  const [
    promoted, latestProducts, topProducts, activePromotions, categories, occasions, heroSlides,
    occasionSlides, makers, loyalty, { customer, authenticated },
  ] = await Promise.all([
    listHomepagePromotedProducts(database, now),
    listHomepageLatestProducts(database),
    listHomepageTopProducts(database, { now, limit: 5 }),
    listActiveHomepagePromotions(database, now),
    listPublicDiscoveryCategories(database),
    listActiveOccasions(database),
    resolveHomepageHero(database, now),
    resolveHomepageOccasions(database, now),
    listHomepageMakers(database, now),
    getPublishedLoyaltyTerms(database, now),
    getCustomerReadContext(),
  ]);

  const [actions, wishlist] = customer ? await Promise.all([
    readAccountYourTurn(database, customer),
    listWishlist(database, customer.userId),
  ]) : [null, []] as const;
  return {
    promoted, latestProducts, topProducts, activePromotions, categories, occasions, heroSlides,
    occasionSlides, makers, loyalty, customer, authenticated, actions, wishlist,
  };
}

export default async function Home() {
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const {
    promoted, latestProducts, topProducts, activePromotions, categories, occasions, heroSlides,
    occasionSlides, makers, loyalty, customer, authenticated, actions, wishlist,
  } = await readHomepage(database);
  const needsCustomer = actions ? actions.questions.length + actions.banks.length + actions.cases.length : 0;
  const firstName = customer?.displayName.trim().split(/\s+/)[0];
  const rankedProducts = topProducts.length ? topProducts : promoted.slice(0, 5);
  const liveCheckIn = loyalty.status === 'active';
  const signInHref = customer ? undefined : authenticated ? '/account-access-denied' : signInPath('/#latest-products');

  return (
    <div className={styles.page + ' min-h-screen'}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(brandStructuredData) }} />
      <SiteHeader />
      <main tabIndex={-1} id="main-content">
        <h1 className="sr-only">Hastabazaar — Products, gifts and crafts from makers and sellers in Nepal</h1>
        <HomepageHeroCarousel slides={heroSlides} returnDays={phaseOneMarketplacePolicy.value.returns.generalRequestWindowDays} />

        <div id="categories" className={styles.shell + ' scroll-mt-44'}>
          <section className={styles.categoryPanel} aria-labelledby="category-panel-heading">
            <div className={styles.heading}>
              <h2 id="category-panel-heading">Shop by category</h2>
              <Link href="/categories" className={styles.more}>All categories <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
            {categories.length ? (
              <nav aria-label="Shop featured craft categories">
                {categories.map(category => {
                  const photo = categoryImage(category);
                  return (
                    <Link key={category.id} href={'/shop?category=' + encodeURIComponent(category.slug)} className={styles.category}>
                      <div data-media-frame="cover" className={mediaFrameClass('cover')}>
                        {photo ? (
                          <Image data-media-mode="cover" src={photo.src} alt={photo.alt} fill
                            sizes="(min-width: 1440px) 190px, (min-width: 1024px) 16vw, (min-width: 640px) 29vw, 132px"
                            unoptimized={Boolean(category.imageId)} className={mediaObjectClass('cover')} />
                        ) : <Package aria-hidden="true" className="absolute inset-0 m-auto size-8 text-primary/60" />}
                      </div>
                      <span className={styles.categoryName}>
                        <strong>{category.nameEn}</strong><ArrowRight size={16} aria-hidden="true" />
                      </span>
                      {category.nameNe ? <small lang="ne">{category.nameNe}</small> : null}
                    </Link>
                  );
                })}
              </nav>
            ) : <p>Our craft collections are being prepared. Browse all available products in the shop.</p>}
          </section>
          {customer ? (
            <div className={styles.welcome}>
              <strong><UserRound size={17} aria-hidden="true" /> Welcome back{firstName ? ', ' + firstName : ''}</strong>
              {needsCustomer ? <p className="flex flex-wrap items-center gap-2"><CustomerActingChip actor="you" yourTurn />
                {needsCustomer} {needsCustomer === 1 ? 'thing needs' : 'things need'} you</p> : <p>You’re caught up on orders and requests.</p>}
              <Link href="/account" className={styles.more}>Open your account <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
          ) : null}
        </div>

        {activePromotions.length || liveCheckIn ? (
          <section id="offers" aria-labelledby="offers-heading" className={styles.section + ' scroll-mt-44'}>
            <div className={styles.shell}>
              <div className={styles.heading}>
                <div>
                  <h2 id="offers-heading">Current offers</h2>
                  <p>Running now. Each one shows its dates and terms.</p>
                </div>
              </div>
              <div className={styles.offers}>
                {activePromotions.map(promotion => (
                  <article key={promotion.id} className={styles.ticket}>
                    <div className={styles.ticketStub}>
                      <strong>{promotion.productCount}</strong>{promotion.productCount === 1 ? 'product' : 'products'}
                    </div>
                    <div className={styles.ticketDetail}>
                      <h3>{promotion.nameEn}</h3>
                      <p>{offerDate.format(promotion.startsAt)} – {offerDate.format(promotion.endsAt)}</p>
                      <Link href="/terms">Offer terms</Link>
                    </div>
                  </article>
                ))}
                {liveCheckIn ? (
                  <article className={styles.ticket} data-rewards>
                    <div className={styles.ticketStub}><strong>+{loyalty.dailyPoints}</strong>points</div>
                    <div className={styles.ticketDetail}>
                      <h3>Daily check-in</h3>
                      <p>Points turn into shopping credit{loyalty.endsAt ? ' · Until ' + offerDate.format(loyalty.endsAt) : ''}</p>
                      <Link href="/rewards-terms">How it works</Link>
                    </div>
                  </article>
                ) : null}
              </div>
              {promoted.length ? (
                <details id="offer-products" className="mt-4 scroll-mt-44">
                  <summary className="min-h-11 w-fit cursor-pointer rounded-md py-2.5 text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">
                    See products on offer
                  </summary>
                  <div className={styles.arrivals}>
                    {promoted.map(product => <HomepageProductCard key={product.id} product={product} />)}
                  </div>
                </details>
              ) : null}
            </div>
          </section>
        ) : null}

        <HomepageNewArrivals products={latestProducts} savedIds={wishlist.map(item => item.id)} signInHref={signInHref} />

        {rankedProducts.length ? (
          <section id="top-products" aria-labelledby="popular-heading" className={styles.section + ' ' + styles.white + ' scroll-mt-44'}>
            <div className={styles.shell}>
              <div className={styles.heading}>
                <div>
                  <h2 id="popular-heading">{topProducts.length ? 'Popular with shoppers' : 'Featured finds'}</h2>
                  <p>{topProducts.length ? 'The pieces people are ordering most right now.' : 'Explore products currently featured by Hastabazaar.'}</p>
                </div>
                <Link href="/shop" className={styles.more}>Shop all <ArrowRight size={17} aria-hidden="true" /></Link>
              </div>
              <ol aria-label={topProducts.length ? 'Popular products ranked by orders' : 'Featured products'} className={styles.scroller}>
                {rankedProducts.map((product, index) => (
                  <li key={product.slug}><HomepageProductCard product={product} rank={index + 1} /></li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        <HomepageOccasionCarousel slides={occasionSlides}>
          <nav aria-label="Gift occasions">
            {occasions.map(occasion => (
              <Link key={occasion.id} href={'/occasions#occasion-' + encodeURIComponent(occasion.slug)}>
                {occasion.nameEn}{occasion.nameNe ? <span lang="ne">{occasion.nameNe}</span> : null}
              </Link>
            ))}
            <Link href="/occasions">All occasions <ArrowRight size={15} aria-hidden="true" /></Link>
          </nav>
        </HomepageOccasionCarousel>
        <CraftDetails />

        <section aria-labelledby="meet-the-makers" className={styles.section}>
          <div className={styles.shell}>
            <div className={styles.heading}>
              <div>
                <h2 id="meet-the-makers">Meet the makers</h2>
                <p>Every product names the seller behind it. Visit their shop to see more of their work.</p>
              </div>
              <Link href="/shop" className={styles.more}>Browse the collection <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
            {makers.length ? (
              <ul className={styles.scroller}>
                {makers.map(maker => {
                  const managed = maker.participationRoute === 'managed_maker';
                  return (
                    <li key={maker.id}>
                      <Link href={'/makers/' + encodeURIComponent(maker.id)} className={styles.maker}>
                        <div data-media-frame="cover" className={mediaFrameClass('cover', styles.makerPhoto)}>
                          {maker.image ? (
                            <Image data-media-mode="cover" src={maker.image.src} alt={maker.image.alt} fill sizes="(min-width: 1024px) 25vw, 280px" unoptimized
                              className={mediaObjectClass('cover')} />
                          ) : <Store aria-hidden="true" className="absolute inset-0 m-auto size-9 text-primary/60" />}
                        </div>
                        <div className={styles.makerInfo}>
                          <h3>{managed ? managedMakerDisplayName(maker.tradingName) : maker.tradingName}</h3>
                          {maker.publicCity ? <p><MapPin size={15} aria-hidden="true" /> {maker.publicCity}</p> : null}
                          <p><ShieldCheck size={15} className="text-[#236a4d]" aria-hidden="true" /> {managed ? 'Approved Managed Maker' : 'Approved seller'}</p>
                          {maker.experience ? <span className={styles.craftBand}>{maker.experience.craft} · {experienceLabels[maker.experience.band]}</span> : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[#46536f]">Visit a product in the shop to find out who made or sourced it.</p>}
          </div>
        </section>

        <section id="our-standard" aria-labelledby="standard-heading" className={styles.section + ' ' + styles.white + ' scroll-mt-44'}>
          <div className={styles.shell}>
            <div className={styles.heading}><h2 id="standard-heading">Good craft. <em>Thoughtful care.</em></h2></div>
            <div className={styles.standards}>
              {promises.map(({ Icon, title, text }) => (
                <article key={title}>
                  <Icon size={26} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="customer-care" aria-labelledby="care-heading" className={styles.section + ' scroll-mt-44'}>
          <div className={styles.shell}>
            <div className={styles.heading}>
              <div>
                <h2 id="care-heading">Everything, <em>a little closer.</em></h2>
                <p>Your orders, saved pieces and help — one tap from anywhere on Hastabazaar.</p>
              </div>
            </div>
            <div className={styles.care}>
              <div className={styles.shortcuts}>
                {careShortcuts.map(({ Icon, title, detail, href }) => (
                  <Link key={href} href={href} className={styles.shortcut}>
                    <span className={styles.shortcutIcon}><Icon size={19} aria-hidden="true" /></span>
                    <span><strong>{title}</strong><small>{detail}</small></span>
                  </Link>
                ))}
              </div>
              <aside className={styles.helpCard}>
                <h3>Let&apos;s work it out together</h3>
                <p>Order support, returns &amp; refunds. Start from your order, or talk to us.</p>
                <Link href="/help" className={styles.helpButton}>Visit the help centre</Link>
                <a href={companyPublicContacts.whatsappUrl} target="_blank" rel="noopener noreferrer" className={styles.helpButton}>
                  <MessageCircle size={17} aria-hidden="true" /> WhatsApp {companyPublicContacts.supportPhone}
                </a>
              </aside>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
