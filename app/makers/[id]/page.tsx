import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireDatabase } from '@/lib/db/d1';
import {
  getPublicMakerProfile,
  listPublishedProductsByMaker,
} from '@/lib/db/repositories/customers';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';
import { managedMakerDisplayName } from '@/lib/sellers/participation';
import {getReviewedPublicProfileExtras} from '@/lib/sellers/public-profile-media';

function money(paisa: number | null) {
  if(paisa===null)return 'Price unavailable';
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export default async function MakerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [maker, products] = await Promise.all([
    getPublicMakerProfile(database, id),
    listPublishedProductsByMaker(database, id),
  ]);
  if (!maker) notFound();
  const extras=await getReviewedPublicProfileExtras(database,id);
  const displayName =
    maker.participationRoute === 'managed_maker'
      ? managedMakerDisplayName(maker.tradingName)
      : maker.tradingName;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main tabIndex={-1} id="main-content">
        <section className="border-b bg-secondary/30">
          <div className="shell py-12">
            <p className="eyebrow">{maker.participationRoute === 'managed_maker' ? 'Managed maker profile' : 'Seller profile'}</p>
            <h1 className="mt-3 font-heading text-5xl">{displayName}</h1>
            <div className="mt-5 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />{' '}
                {maker.participationRoute === 'managed_maker'
                  ? 'Approved Managed Maker'
                  : 'Approved seller'}
              </span>
              <span className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" aria-hidden="true" /> {maker.publicCity}
              </span>
            </div>
            {maker.businessDescription ? (
              <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
                {maker.businessDescription}
              </p>
            ) : null}
            {extras?.specialties?<p className="mt-4 max-w-3xl whitespace-pre-wrap">{extras.specialties}</p>:null}
            {extras?.craftExperience.length?<ul className="mt-4 space-y-2">{extras.craftExperience.map((entry,index)=><li key={index}>{entry.craft} · {({beginner:'Beginner',less_than_one_year:'Less than one year',one_to_three_years:'1–3 years',four_to_ten_years:'4–10 years',more_than_ten_years:'More than ten years'})[entry.band]}</li>)}</ul>:null}
            {extras?<div className="mt-4 flex flex-wrap gap-4">{Object.entries(extras.socialLinks).filter(([,url])=>url&&/^https:\/\//i.test(url)).map(([network,url])=><a key={network} href={url} target="_blank" rel="noopener noreferrer" className="capitalize underline">{network}</a>)}</div>:null}
            {extras?.media.length?<div className="mt-6 grid max-w-3xl gap-5 sm:grid-cols-2">{extras.media.map(file=><figure key={file.id}>{file.kind==='profile_image'?<Image data-media-mode="cover" src={`/api/profile-media/${file.id}`} alt={file.caption||`Profile photo from ${displayName}`} width={600} height={600} unoptimized className="aspect-square w-full rounded-xl object-cover"/>:<a href={`/api/profile-media/${file.id}`} target="_blank" rel="noopener noreferrer" className="block rounded-xl border p-4 underline">View original maker video</a>}{file.caption?<figcaption className="mt-2 text-sm">{file.caption}</figcaption>:null}</figure>)}</div>:null}
          </div>
        </section>
        <section className="shell py-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{maker.participationRoute === 'managed_maker' ? 'From this maker' : 'From this seller'}</p>
              <h2 className="mt-2 font-heading text-3xl">
                Published collection
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {maker.productCount} product{maker.productCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <Link
                href={`/products/${product.slug}`}
                key={product.id}
                className="group"
              >
                <div
                  data-media-frame="cover"
                  className={mediaFrameClass(
                    'cover',
                    'aspect-[4/5] rounded-2xl bg-muted',
                  )}
                >
                  {product.primaryMediaId ? (
                    <Image
                      src={`/api/product-media/${product.primaryMediaId}`}
                      alt={product.nameEn}
                      data-media-mode="cover"
                      width={720}
                      height={900}
                      unoptimized
                      sizes={mediaSizes.makerGrid}
                      className={mediaObjectClass(
                        'cover',
                        'transition-transform group-hover:scale-[1.03]',
                      )}
                    />
                  ) : null}
                </div>
                <h3 className="mt-4 font-semibold">{product.nameEn}</h3>
                {product.purchasable === false ? <p className="mt-1 text-sm text-muted-foreground">Not available to order yet</p> : null}
                <p className="mt-1 font-heading text-xl">
                  {product.priceFrom?'From ':''}{money(product.pricePaisa)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
