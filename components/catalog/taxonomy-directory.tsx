import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, Gift, Heart, Package, Sparkles } from 'lucide-react';
import { categoryImage } from '@/lib/catalog/category-presentation';
import { queryFieldPresentation } from '@/lib/catalog/shop-query';
import type { DiscoveryCategory, OccasionGroup } from '@/lib/catalog/taxonomy-discovery';
import type { OccasionRow } from '@/lib/db/repositories/products';
import type { PublishedFormConfig } from '@/lib/forms/types';
import { formatPaisaExact } from '@/lib/marketplace/money-display';

const shell = 'mx-auto w-[calc(100%-2rem)] max-w-[1264px] md:w-[calc(100%-6rem)]';
const title = 'font-heading text-[clamp(2.5rem,5vw,3.75rem)] font-medium leading-[1.03] tracking-tight';
const panelTitle = 'font-heading text-[clamp(2rem,3vw,2.25rem)] font-medium leading-[1.1] tracking-tight';
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#14213D]';

const occasionStyles = [
  { card: 'bg-[#A8232E] text-white', icon: 'bg-white/15 text-white', Symbol: Sparkles },
  { card: 'bg-[#F3E6C9] text-[#14213D]', icon: 'bg-[#14213D] text-[#F3E6C9]', Symbol: Gift },
  { card: 'border border-[#E4DACA] bg-white text-[#14213D]', icon: 'bg-[#F8E1DE] text-[#A8232E]', Symbol: Heart },
  { card: 'bg-[#14213D] text-white', icon: 'bg-[#F3E6C9] text-[#14213D]', Symbol: CalendarDays },
  { card: 'bg-[#E1EEE5] text-[#1F4D35]', icon: 'bg-[#2C6A4A] text-white', Symbol: Gift },
];

function shopTaxonomyHref(kind: 'category' | 'occasion', slug: string) {
  return `/shop?${kind}=${encodeURIComponent(slug)}`;
}

function CategoryCards({ entries }: { entries: readonly DiscoveryCategory[] }) {
  const largeGrid = entries.length >= 5;
  return (
    <section aria-label="All categories" className={`grid auto-rows-[11.875rem] grid-cols-2 gap-3 md:auto-rows-[15rem] md:gap-[18px] lg:auto-rows-[18.75rem] ${largeGrid ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      {entries.map((entry, index) => {
        const image = categoryImage(entry);
        const wide = largeGrid && (index === 0 || index === 5 || index === 6);
        const tall = largeGrid && index === 0;
        return (
          <Link key={entry.id} href={shopTaxonomyHref('category', entry.slug)} data-media-frame="cover"
            className={`group relative isolate flex min-h-[11.875rem] min-w-0 flex-col justify-end overflow-hidden rounded-[22px] bg-[#e6d8c4] text-white ${wide || entries.length === 1 ? 'col-span-2' : ''} ${tall ? 'lg:row-span-2' : ''} ${entries.length === 1 ? 'lg:col-span-3' : ''} ${focus}`}>
            {image ? (
              <Image data-media-mode="cover" src={image.src} alt="" fill
                unoptimized={Boolean(entry.imageId)}
                sizes={wide
                  ? '(min-width: 1360px) 630px, (min-width: 1024px) calc(50vw - 57px), (min-width: 768px) calc(100vw - 96px), calc(100vw - 32px)'
                  : '(min-width: 1360px) 410px, (min-width: 1024px) 30vw, calc(50vw - 24px)'}
                className="object-cover motion-safe:transition-transform motion-safe:group-hover:scale-[1.025]" />
            ) : (
              <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
                <Package className="size-12 text-[#14213D]/65" />
              </div>
            )}
            <div className="absolute inset-0 bg-linear-to-t from-[#14213D]/90 via-[#14213D]/15 to-transparent" />
            {entry.productCount === undefined ? null : (
              <span className="absolute top-4 left-3 z-10 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-[#14213D] md:left-4">
                {entry.productCount} {entry.productCount === 1 ? 'piece' : 'pieces'}
              </span>
            )}
            <div className="relative flex min-w-0 items-end justify-between gap-2 p-3.5 md:gap-3 md:p-[22px]">
              <div className="min-w-0">
                <h2 className="font-heading text-[clamp(1.375rem,2.6vw,2.125rem)] font-medium leading-[1.05]">{entry.nameEn}</h2>
                {entry.nameNe ? <p lang="ne" className="mt-0.5 text-sm text-[#F3E6C9]">{entry.nameNe}</p> : null}
              </div>
              <span aria-hidden="true" className="grid size-[34px] shrink-0 place-items-center rounded-full bg-white text-[#14213D] md:size-11">
                <ArrowRight className="size-4" />
              </span>
            </div>
          </Link>
        );
      })}
    </section>
  );
}

type CategorySearchPresentation = { config: PublishedFormConfig | null; unavailable: boolean };

function CategoryNextSteps({ occasions, search }: {
  occasions: readonly OccasionRow[];
  search?: CategorySearchPresentation;
}) {
  const field = queryFieldPresentation('catalog.header-search', search?.config, 'q', {
    label: 'Search the shop',
    placeholder: 'e.g. dhaka shawl, brass, Thimi',
  });
  return (
    <div className="mt-12 grid gap-[18px] lg:mt-[72px] lg:grid-cols-2">
      <section className="min-w-0 rounded-[22px] bg-[#14213D] p-7 text-white sm:p-[30px]" aria-labelledby="discover-by-occasion">
        <h2 id="discover-by-occasion" className={panelTitle}>Shopping for someone?</h2>
        <p className="mt-2 text-sm text-[#D2DAE9]">Start with the occasion instead.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {occasions.slice(0, 3).map(occasion => (
            <Link href={shopTaxonomyHref('occasion', occasion.slug)} key={occasion.id}
              className="inline-flex min-h-11 min-w-0 items-center rounded-full border border-white/30 px-3.5 text-sm text-white hover:border-white focus-visible:outline-white">
              {occasion.nameEn}
            </Link>
          ))}
          <Link href="/occasions" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#F3E6C9] px-3.5 text-sm font-semibold text-[#14213D] focus-visible:outline-white">
            All occasions <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </section>
      <section className="min-w-0 rounded-[22px] border border-[#E4DACA] bg-white p-7 sm:p-[30px]" aria-labelledby="discover-by-search">
        <h2 id="discover-by-search" className={panelTitle}>Know what you want?</h2>
        <p className="mt-2 text-sm text-[#465573]">Search by product, material or maker.</p>
        <form data-form-id="catalog.header-search" action="/shop" method="get" className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="category-discovery-search" className="sr-only">{field.label}</label>
          <input id="category-discovery-search" name="q" type="search" maxLength={100} placeholder={field.placeholder}
            aria-describedby={field.helpText ? 'category-discovery-search-help' : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-[#D7C7AD] px-3 text-sm placeholder:text-[#736656]" />
          <button type="submit" className="min-h-11 rounded-[10px] bg-[#A8232E] px-5 text-sm font-semibold text-white hover:bg-[#8F1E27]">Search</button>
        </form>
        {field.helpText ? <p id="category-discovery-search-help" className="mt-2 text-sm text-[#465573]">{field.helpText}</p> : null}
        {search?.unavailable ? <output className="mt-2 block text-sm text-[#465573]">Search settings couldn’t load. You can still search.</output> : null}
      </section>
    </div>
  );
}

function OccasionCards({ entries }: { entries: readonly OccasionRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:gap-3.5 lg:grid-cols-4">
      {entries.map((entry, index) => {
        const { card, icon, Symbol } = occasionStyles[index % occasionStyles.length];
        return (
          <Link key={entry.id} id={`occasion-${entry.slug}`} href={shopTaxonomyHref('occasion', entry.slug)}
            className={`flex min-h-[140px] min-w-0 scroll-mt-44 flex-col justify-between gap-4 rounded-[20px] p-4 md:min-h-[170px] md:gap-7 md:p-[22px] ${card} ${focus}`}>
            <span aria-hidden="true" className={`grid size-11 place-items-center rounded-[13px] ${icon}`}><Symbol className="size-[21px]" /></span>
            <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2">
              <span className="min-w-0">
                <span className="block font-heading text-[clamp(1.3125rem,2.1vw,1.625rem)] font-medium leading-[1.05]">{entry.nameEn}</span>
                {entry.nameNe ? <span lang="ne" className="mt-0.5 block text-sm opacity-90">{entry.nameNe}</span> : null}
              </span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function InSeason({ occasion }: { occasion: OccasionRow }) {
  return (
    <section aria-labelledby="in-season-title" className="grid overflow-hidden rounded-[24px] bg-[#14213D] text-white lg:min-h-[360px] lg:grid-cols-[1.1fr_1fr]">
      <div className="relative min-h-[260px] overflow-hidden lg:min-h-[360px]" data-media-frame="cover">
        <Image src="/homepage/meaningful-gifts-hero.webp" alt="" fill data-media-mode="cover"
          sizes="(min-width: 1440px) 662px, (min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </div>
      <div className="flex flex-col items-start justify-center gap-3 px-5 py-[26px] md:p-9 lg:p-10">
        <span className="rounded-full bg-[#E8C27A] px-2.5 py-1 text-xs font-semibold text-[#14213D]">In season now</span>
        <h2 id="in-season-title" className="font-heading text-[clamp(2.125rem,3.4vw,2.875rem)] font-medium leading-[1.06]">
          Gifts for <em className="font-medium text-[#E8C27A]">{occasion.nameEn}</em>
        </h2>
        <p className="max-w-lg text-[#D2DAE9]">Find gifts for the people and moments you’re celebrating.</p>
        <Link href={shopTaxonomyHref('occasion', occasion.slug)}
          className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-white px-4 py-2 text-sm font-semibold text-[#14213D] focus-visible:outline-white">
          Shop this occasion <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      </div>
    </section>
  );
}

function OccasionContent({ entries, occasionGroups, featuredOccasion, priceCaps }: {
  entries: readonly OccasionRow[];
  occasionGroups: readonly OccasionGroup[];
  featuredOccasion: OccasionRow | null;
  priceCaps: readonly number[];
}) {
  return (
    <>
      {featuredOccasion ? <InSeason occasion={featuredOccasion} /> : null}
      {priceCaps.length ? (
        <nav aria-label="Browse by budget" className="flex flex-wrap items-center gap-2.5 text-sm">
          <span className="mr-1 font-semibold">By budget</span>
          {priceCaps.map(cap => (
            <Link key={cap} href={`/shop?maxPrice=${cap / 100}`}
              className={`inline-flex min-h-11 items-center rounded-full border border-[#D7C7AD] bg-[#FFFDFA] px-3.5 hover:border-[#14213D] ${focus}`}>
              Up to {formatPaisaExact(cap).replace(/\.00$/, '')}
            </Link>
          ))}
        </nav>
      ) : null}
      {occasionGroups.length ? occasionGroups.map(({ name, entries: groupEntries }, index) => (
        <section key={name} aria-labelledby={`occasion-group-${index}`}>
          <h2 id={`occasion-group-${index}`} className="mb-4 font-heading text-3xl font-medium leading-tight">{name}</h2>
          <OccasionCards entries={groupEntries} />
        </section>
      )) : entries.length ? <section aria-label="All gift occasions"><OccasionCards entries={entries} /></section> : null}
    </>
  );
}

export function TaxonomyDirectory({
  kind,
  entries,
  occasionLinks = [],
  occasionGroups = [],
  featuredOccasion = null,
  priceCaps = [],
  categorySearch,
}: {
  kind: 'category' | 'occasion';
  entries: readonly DiscoveryCategory[];
  occasionLinks?: readonly OccasionRow[];
  occasionGroups?: readonly OccasionGroup[];
  featuredOccasion?: OccasionRow | null;
  priceCaps?: readonly number[];
  categorySearch?: CategorySearchPresentation;
}) {
  const categories = kind === 'category';
  const breadcrumb = categories ? 'Categories' : 'Gifts by occasion';
  return (
    <section className={`${shell} pt-7 pb-16 text-[#14213D] md:pt-8 md:pb-[88px]`} aria-labelledby="taxonomy-heading">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-[#465573]" aria-label="Breadcrumb">
        <Link href="/" className="inline-flex min-h-11 items-center hover:underline">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{breadcrumb}</span>
      </nav>
      <h1 id="taxonomy-heading" className={title}>
        {categories
          ? <>Shop by <em className="text-[#A8232E]">craft</em></>
          : <>A gift for <em className="text-[#A8232E] max-sm:inline-block">every occasion</em></>}
      </h1>
      <p className="mt-2 max-w-[42rem] text-base leading-relaxed text-[#465573] sm:text-[17px]">
        {categories
          ? 'Every category is made up of reviewed sellers and makers from across Nepal. Pick a craft to see everything in it.'
          : 'Start with the moment, then find something that feels like them. Delivery dates are confirmed at checkout.'}
      </p>
      <div className="mt-9 space-y-9 md:space-y-10">
        {categories ? (
          entries.length ? <CategoryCards entries={entries} /> : null
        ) : (
          <OccasionContent entries={entries} occasionGroups={occasionGroups} featuredOccasion={featuredOccasion} priceCaps={priceCaps} />
        )}
        {!entries.length ? (
          <p className="rounded-2xl border border-[#E4DACA] bg-white p-5 text-[#465573]">
            {categories ? 'Categories' : 'Gift occasions'} are being prepared.{' '}
            <Link href="/shop" className="section-link underline">Browse the shop</Link>
          </p>
        ) : null}
      </div>
      {categories ? <CategoryNextSteps occasions={occasionLinks} search={categorySearch} /> : null}
    </section>
  );
}
