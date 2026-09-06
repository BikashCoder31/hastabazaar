import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ImageIcon, PackageCheck } from 'lucide-react';

import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listProductsForReview } from '@/lib/db/repositories/products';

export const dynamic = 'force-dynamic';

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100);
}

export default async function ProductReviewQueuePage() {
  await requireStaffPage('/admin/products', 'product.review');
  const products = await listProductsForReview(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return (
    <div className="space-y-7">
      <div><p className="eyebrow">Catalogue controls</p><h1 className="mt-2 font-heading text-4xl tracking-tight">Product review queue</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Review product facts and photos before approval. Approved products require a separate publish action.</p></div>
      {products.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-14 text-center"><PackageCheck className="size-9 text-muted-foreground" /><h2 className="mt-4 font-heading text-xl">The product queue is clear</h2><p className="mt-2 text-sm text-muted-foreground">No listings are waiting for review or publication.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {products.map((product) => (
            <Card key={product.id} className="py-0"><CardContent className="flex gap-4 p-4">
              <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">{product.primaryMediaId ? <Image src={`/api/product-media/${product.primaryMediaId}`} alt="" width={96} height={96} unoptimized className="h-full w-full object-cover" /> : <ImageIcon className="size-7 text-muted-foreground" />}</div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold">{product.nameEn}</h2><StatusBadge status={product.status} /></div><p className="mt-1 text-sm text-muted-foreground">{product.tradingName} · {product.categoryName}</p><p className="mt-1 text-sm">{money(product.pricePaisa)} · Stock {product.inventoryQuantity}</p><Link href={`/admin/products/${product.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Review listing <ArrowRight className="size-4" /></Link></div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
