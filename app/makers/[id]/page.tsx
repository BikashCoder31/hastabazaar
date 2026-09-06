import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { requireDatabase } from '@/lib/db/d1';
import { getPublicMakerProfile, listPublishedProductsByMaker } from '@/lib/db/repositories/customers';

function money(paisa: number) { return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100); }

export default async function MakerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [maker, products] = await Promise.all([getPublicMakerProfile(database, id), listPublishedProductsByMaker(database, id)]);
  if (!maker) notFound();
  return <div className="min-h-screen"><SiteHeader /><main><section className="border-b bg-secondary/30"><div className="shell py-12"><p className="eyebrow">Approved Hathkriti maker</p><h1 className="mt-3 font-heading text-5xl">{maker.tradingName}</h1><div className="mt-5 flex flex-wrap gap-4 text-sm text-muted-foreground"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Verified seller</span><span className="flex items-center gap-2"><MapPin className="size-4 text-primary" /> {maker.district}, {maker.province}</span></div>{maker.businessDescription ? <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{maker.businessDescription}</p> : null}</div></section><section className="shell py-12"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">From this maker</p><h2 className="mt-2 font-heading text-3xl">Published collection</h2></div><p className="text-sm text-muted-foreground">{maker.productCount} product{maker.productCount === 1 ? '' : 's'}</p></div><div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.map((product) => <Link href={`/products/${product.slug}`} key={product.id} className="group"><div className="aspect-[4/5] overflow-hidden rounded-2xl bg-muted">{product.primaryMediaId ? <Image src={`/api/product-media/${product.primaryMediaId}`} alt={product.nameEn} width={720} height={900} unoptimized className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" /> : null}</div><h3 className="mt-4 font-semibold">{product.nameEn}</h3><p className="mt-1 font-heading text-xl">{money(product.pricePaisa)}</p></Link>)}</div></section></main><SiteFooter /></div>;
}
