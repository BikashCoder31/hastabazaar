import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ArrowRight, Boxes, ClipboardClock, PackageCheck, ShoppingBag } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerProductStats } from '@/lib/db/repositories/products';

export const dynamic = 'force-dynamic';

export default async function SellerDashboardPage() {
  const seller = await requireSellerPage('/seller');
  const stats = await getSellerProductStats(
    requireDatabase(env as unknown as { DB?: D1Database }),
    seller.sellerId,
  );
  const cards = [
    { label: 'All products', value: stats.total, icon: ShoppingBag },
    { label: 'Awaiting review', value: stats.awaitingReview, icon: ClipboardClock },
    { label: 'Published', value: stats.published, icon: PackageCheck },
    { label: 'Low stock', value: stats.lowStock, icon: Boxes },
  ];
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="eyebrow">Seller workspace</p><h1 className="mt-2 font-heading text-4xl tracking-tight">Welcome, {seller.tradingName}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Add accurate product information, maintain stock, and follow each listing through review.</p></div>
        <Link href="/seller/products/new" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">Add a product <ArrowRight className="size-4" /></Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}><CardHeader className="grid grid-cols-[1fr_auto] items-center"><CardTitle className="font-sans text-sm text-muted-foreground">{label}</CardTitle><Icon className="size-5 text-primary" /></CardHeader><CardContent><p className="font-heading text-4xl tabular-nums">{value}</p></CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle>Before submitting</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-3"><p><strong className="text-foreground">Use your own photos.</strong> Show the actual item clearly from useful angles.</p><p><strong className="text-foreground">Describe materials honestly.</strong> Include origin, maker, dimensions, care, and safety details.</p><p><strong className="text-foreground">Keep stock current.</strong> Set quantity to zero as soon as an item is unavailable.</p></CardContent></Card>
    </div>
  );
}
