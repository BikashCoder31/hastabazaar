import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { Heart } from 'lucide-react';

import { WishlistButton } from '@/components/account/wishlist-button';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listWishlist } from '@/lib/db/repositories/customers';

function money(paisa: number) { return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100); }

export default async function WishlistPage() {
  const customer = await requireCustomerPage('/account/wishlist');
  const items = await listWishlist(requireDatabase(env as unknown as { DB?: D1Database }), customer.userId);
  return <div><p className="eyebrow">Saved for later</p><h1 className="mt-2 font-heading text-4xl">Your wishlist</h1>{items.length ? <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <article key={item.id} className="overflow-hidden rounded-2xl border bg-card"><Link href={`/products/${item.slug}`}><div className="aspect-[4/3] bg-muted">{item.primaryMediaId ? <Image src={`/api/product-media/${item.primaryMediaId}`} alt={item.nameEn} width={720} height={540} unoptimized className="h-full w-full object-cover" /> : null}</div><div className="p-5"><p className="text-sm font-semibold text-primary">{item.tradingName}</p><h2 className="mt-1 font-semibold">{item.nameEn}</h2><p className="mt-2 font-heading text-xl">{money(item.pricePaisa)}</p></div></Link><div className="px-5 pb-5"><WishlistButton productId={item.id} initialSaved compact /></div></article>)}</div> : <div className="mt-7 rounded-2xl border border-dashed p-12 text-center"><Heart className="mx-auto size-9 text-primary" /><p className="mt-4 font-semibold">Your wishlist is empty</p><Link href="/shop" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">Find handmade gifts</Link></div>}</div>;
}
