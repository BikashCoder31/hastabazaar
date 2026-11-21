import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ImageIcon, MapPin, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { MakerWorkshopVideo } from '@/components/catalog/maker-workshop-video';
import { requireDatabase } from '@/lib/db/d1';
import {
  getPublicMakerProfile,
  listPublishedProductsByMaker,
  type MakerProductRow,
} from '@/lib/db/repositories/customers';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { mediaFrameClass, mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';
import { managedMakerDisplayName, type CraftExperienceBand } from '@/lib/sellers/participation';
import { getReviewedPublicProfileExtras } from '@/lib/sellers/public-profile-media';

const shell = 'mx-auto w-[calc(100%-2rem)] max-w-[1264px] md:w-[calc(100%-6rem)]';
const sectionHeading = 'font-heading text-[clamp(2rem,3.5vw,2.5rem)] font-medium leading-[1.1] tracking-tight';
const action = 'inline-flex min-h-11 min-w-0 max-w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold focus-visible:outline-[#14213D]';
const experienceLabels: Record<CraftExperienceBand, string> = {
  beginner: 'Beginner',
  less_than_one_year: 'Less than one year',
  one_to_three_years: '1–3 years',
  four_to_ten_years: '4–10 years',
  more_than_ten_years: 'More than ten years',
};

type ProfileMedia = NonNullable<Awaited<ReturnType<typeof getReviewedPublicProfileExtras>>>['media'][number];

function profileMediaHref(id: string) {
  return '/api/profile-media/' + encodeURIComponent(id);
}

function WorkshopPhoto({ photo, makerName, lead = false }: {
  photo: ProfileMedia; makerName: string; lead?: boolean;
}) {
  return (
    <figure className="min-w-0">
      <div data-media-frame="cover" className={`relative overflow-hidden rounded-[20px] bg-[#E8DDCB] ${lead ? 'aspect-[5/4]' : 'h-56 md:h-[300px]'}`}>
        <Image src={profileMediaHref(photo.id)} alt={photo.caption ? '' : `Workshop photo from ${makerName}`} fill
          unoptimized priority={lead} data-media-mode="cover"
          sizes="(min-width: 1360px) 610px, (min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </div>
      {photo.caption ? <figcaption className="mt-2 text-sm text-[#465573]">{photo.caption}</figcaption> : null}
    </figure>
  );
}

function WorkshopGallery({ photos, videos, cover, makerName }: {
  photos: readonly ProfileMedia[]; videos: readonly ProfileMedia[]; cover?: ProfileMedia; makerName: string;
}) {
  return (
    <section aria-labelledby="maker-workshop" className="bg-white py-12 md:py-[72px]">
      <div className={shell}>
        <h2 id="maker-workshop" className={sectionHeading}>Inside the <em className="text-[#A8232E]">workshop</em></h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <div key={photo.id} className={index === 0 ? 'md:col-span-2' : ''}>
              <WorkshopPhoto photo={photo} makerName={makerName} />
            </div>
          ))}
          {videos.map(video => (
            <MakerWorkshopVideo key={video.id} src={profileMediaHref(video.id)}
              poster={cover ? profileMediaHref(cover.id) : undefined}
              caption={video.caption} inline={video.kind === 'maker_video'} />
          ))}
        </div>
      </div>
    </section>
  );
}

function MakerProductCard({ product }: { product: MakerProductRow }) {
  const dispatch = product.purchasable
    ? Number(product.madeToOrder) === 1 ? 'Made to order'
      : product.preparationDays === 0 && product.inventoryQuantity > 0 ? 'Ready to dispatch' : null
    : null;
  return (
    <Link href={`/products/${product.slug}`} className="group min-w-0 rounded-[16px] focus-visible:outline-[#14213D]">
      <div data-media-frame="cover" className={mediaFrameClass('cover', 'aspect-square rounded-[16px] bg-[#E8DDCB]')}>
        {product.primaryMediaId ? (
          <Image src={`/api/product-media/${product.primaryMediaId}`} alt={product.nameEn} data-media-mode="cover"
            width={600} height={600} unoptimized sizes={mediaSizes.makerGrid}
            className={mediaObjectClass('cover', 'motion-safe:transition-transform motion-safe:group-hover:scale-[1.025]')} />
        ) : <div aria-hidden="true" className="absolute inset-0 grid place-items-center"><ImageIcon className="size-8 text-[#6C6255]" /></div>}
      </div>
      <h3 className="mt-3 text-sm font-bold leading-snug sm:text-base">{product.nameEn}</h3>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-1.5">
        <p className="text-sm font-bold sm:text-base">
          {product.pricePaisa === null ? 'Price unavailable' : `${product.priceFrom ? 'From ' : ''}${formatPaisaExact(product.pricePaisa).replace(/\.00$/, '')}`}
        </p>
        {dispatch ? <p className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dispatch === 'Ready to dispatch' ? 'bg-[#E1EEE5] text-[#1F4D35]' : 'bg-[#EDE4D3] text-[#14213D]'}`}>{dispatch}</p> : null}
      </div>
      {product.purchasable === false ? <p className="mt-1.5 text-sm text-[#465573]">Not available to order yet</p> : null}
    </Link>
  );
}

export default async function MakerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [maker, products] = await Promise.all([
    getPublicMakerProfile(database, id),
    listPublishedProductsByMaker(database, id),
  ]);
  if (!maker) notFound();
  const extras = await getReviewedPublicProfileExtras(database, id);
  const managed = maker.participationRoute === 'managed_maker';
  const displayName = managed ? managedMakerDisplayName(maker.tradingName) : maker.tradingName;
  const [leadPhoto, ...workshopPhotos] = extras?.media.filter(file => file.kind === 'profile_image') ?? [];
  const videos = extras?.media.filter(file => file.kind !== 'profile_image') ?? [];
  const galleryPhotos = !workshopPhotos.length && videos.length && leadPhoto ? [leadPhoto] : workshopPhotos;
  const socialLinks = Object.entries(extras?.socialLinks ?? {}).filter(([, url]) => url && /^https:\/\//i.test(url));
  const commonCategory = products[0]?.categorySlug && products.every(product => product.categorySlug === products[0].categorySlug)
    ? products[0] : null;

  return (
    <>
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="bg-[#F3EEE3] text-[#14213D]">
        <section aria-labelledby="maker-name" className={`${shell} grid items-center gap-7 py-8 md:py-10 lg:gap-12 lg:pb-14 ${leadPhoto ? 'lg:grid-cols-2' : ''}`}>
          {leadPhoto ? (
            <div className="lg:order-2">
              <WorkshopPhoto photo={leadPhoto} makerName={maker.tradingName} lead />
            </div>
          ) : null}
          <div className="min-w-0">
            <nav className="flex flex-wrap items-center gap-x-2 text-sm text-[#465573]" aria-label="Breadcrumb">
              <Link href="/" className="inline-flex min-h-11 items-center hover:underline">Home</Link>
              <span aria-hidden="true">/</span>
              <Link href="/shop" className="inline-flex min-h-11 items-center hover:underline">Shop</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{maker.tradingName}</span>
            </nav>
            <h1 id="maker-name" className="mt-1 font-heading text-[clamp(2.5rem,5vw,4rem)] font-medium leading-[1.03] tracking-tight">{displayName}</h1>
            <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#E1EEE5] px-3 py-1 text-[#1F4D35]">
                <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
                {managed ? 'Approved Managed Maker' : 'Approved seller'}
              </p>
              {maker.publicCity ? (
                <p className="inline-flex items-center gap-1.5 rounded-full border border-[#E4DACA] bg-white px-3 py-1 text-[#465573]">
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />{maker.publicCity}
                </p>
              ) : null}
            </div>
            {maker.businessDescription ? <p className="mt-4 max-w-3xl whitespace-pre-line text-[17px] leading-relaxed text-[#3C4B65]">{maker.businessDescription}</p> : null}
            {extras && (extras.craftExperience.length > 0 || extras.specialties) ? (
              <dl className="mt-4 grid items-stretch gap-3 sm:grid-cols-2">
                {extras.craftExperience.length ? (
                  <div className="rounded-[16px] border border-[#E4DACA] bg-white p-4">
                    <dt className="text-sm text-[#63584A]">Craft experience</dt>
                    {extras.craftExperience.map(entry => (
                      <dd key={`${entry.craft}:${entry.band}`} className="mt-2 text-sm font-bold">
                        {entry.craft} · {experienceLabels[entry.band]}
                      </dd>
                    ))}
                  </div>
                ) : null}
                {extras.specialties ? (
                  <div className="rounded-[16px] border border-[#E4DACA] bg-white p-4">
                    <dt className="text-sm text-[#63584A]">Specialties</dt>
                    <dd className="mt-2 whitespace-pre-wrap text-[15px] leading-snug">{extras.specialties}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2.5">
              {products.length ? (
                <Link href="#maker-products" className={`${action} bg-[#A8232E] text-white hover:bg-[#8F1E27]`}>
                  See their work <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              ) : null}
              {socialLinks.map(([network, url]) => (
                <a key={network} href={url} target="_blank" rel="noopener noreferrer" className={`${action} border border-[#D7C7AD] bg-white capitalize`}>
                  {network} <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {galleryPhotos.length || videos.length ? (
          <WorkshopGallery photos={galleryPhotos} videos={videos} cover={leadPhoto} makerName={maker.tradingName} />
        ) : null}

        <section id="maker-products" aria-labelledby="maker-collection" className={`${shell} scroll-mt-44 py-12 md:py-[72px]`}>
          <div className="flex flex-wrap items-end justify-between gap-x-5">
            <div className="min-w-0">
              <h2 id="maker-collection" className={sectionHeading}>From this maker</h2>
              <p className="mt-1 text-[15px] text-[#465573]">{products.length} {products.length === 1 ? 'piece' : 'pieces'} from {maker.tradingName}</p>
            </div>
            <Link href={commonCategory ? `/shop?category=${encodeURIComponent(commonCategory.categorySlug)}` : '/shop'}
              className="inline-flex min-h-11 min-w-0 items-center text-sm font-semibold text-[#A8232E] underline underline-offset-4 focus-visible:outline-[#14213D]">
              {commonCategory ? `Shop all ${commonCategory.categoryName.toLowerCase()}` : 'Shop all products'}
            </Link>
          </div>
          {products.length ? (
            <div className="mt-5 grid grid-cols-2 gap-4 md:mt-10 md:grid-cols-3 md:gap-6 xl:grid-cols-4">
              {products.map(product => <MakerProductCard key={product.id} product={product} />)}
            </div>
          ) : <p className="mt-6 text-[#465573]">There are no pieces from this maker in the shop yet.</p>}
          <p className="mt-12 flex items-start gap-3 rounded-[13px] bg-[#ECE3D2] p-4 text-sm leading-relaxed text-[#344361] md:mt-[88px]">
            <ShieldCheck className="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
            <span>Hastabazaar reviews every seller before they can list. Something wrong with a piece? Open your order and choose <Link href="/account/orders" className="inline-flex min-h-11 items-center font-semibold text-[#A8232E] underline underline-offset-4 focus-visible:outline-[#14213D]">Get help</Link>.</span>
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
