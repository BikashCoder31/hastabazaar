import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { ImageIcon, PackagePlus } from 'lucide-react';

import { StatusBadge } from '@/components/admin/status-badge';
import { InventoryEditor } from '@/components/seller/inventory-editor';
import { Card, CardContent } from '@/components/ui/card';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { listSellerProducts } from '@/lib/db/repositories/products';

export const dynamic = 'force-dynamic';

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100);
}

export default async function SellerProductsPage() {
  const seller = await requireSellerPage('/seller/products');
  const products = await listSellerProducts(
    requireDatabase(env as unknown as { DB?: D1Database }),
    seller.sellerId,
  );
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="eyebrow">Catalogue</p><h1 className="mt-2 font-heading text-4xl tracking-tight">My products</h1><p className="mt-2 text-sm text-muted-foreground">Review listing status and keep available quantity accurate.</p></div>
        <Link href="/seller/products/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><PackagePlus className="size-4" /> Add product</Link>
      </div>
      {products.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-14 text-center"><PackagePlus className="size-9 text-muted-foreground" /><h2 className="mt-4 font-heading text-xl">Add your first product</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Listings remain private until Hathkriti reviews and publishes them.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <Card key={product.id} className="py-0"><CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {product.primaryMediaId ? <Image src={`/api/product-media/${product.primaryMediaId}`} alt="" width={80} height={80} unoptimized className="h-full w-full object-cover" /> : <ImageIcon className="size-7 text-muted-foreground" />}
                </div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold">{product.nameEn}</h2><StatusBadge status={product.status} /></div><p className="mt-1 text-sm text-muted-foreground">SKU {product.sku} · {money(product.pricePaisa)}</p>{product.reviewNote && product.status === 'needs_changes' ? <><p className="mt-2 text-sm text-amber-800">Review note: {product.reviewNote}</p><Link href={`/seller/products/${product.id}/edit`} className="mt-2 inline-flex text-sm font-semibold text-primary hover:underline">Revise and resubmit</Link></> : null}</div>
              </div>
              <InventoryEditor productId={product.id} quantity={product.inventoryQuantity} />
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
