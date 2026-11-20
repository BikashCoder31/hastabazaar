import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ImageIcon, PackageCheck } from 'lucide-react';

import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listProductsForReview } from '@/lib/db/repositories/products';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

export const dynamic = 'force-dynamic';

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export default async function ProductReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string;seller?:string }>;
}) {
  const params=await searchParams,publishedOnly=params.view==='published',sellerId=params.seller?.slice(0,100);
  await requireStaffPage('/admin/products', 'product.review');
  const products = await listProductsForReview(
    requireDatabase(env as unknown as { DB?: D1Database }),
    100,
    publishedOnly,
    sellerId,
  );
  return (
    <div className="space-y-7">
      <div>
        <AdminPageTitle>
          <h1 className="font-heading text-4xl tracking-tight">
            {publishedOnly ? 'Published products' : 'Product review queue'}
          </h1>
        </AdminPageTitle>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Review product facts and photos before approval. Approved products
          require a separate publish action.
        </p>
      </div>
      <nav className="flex flex-wrap gap-4">
        <Link href="/admin/products/intakes" className="section-link">Product intake and assistance</Link>
        <Link href={sellerId?`/admin/products?seller=${encodeURIComponent(sellerId)}`:'/admin/products'} className="section-link">
          Review queue
        </Link>
        <Link href={`/admin/products?view=published${sellerId?'&seller='+encodeURIComponent(sellerId):''}`} className="section-link">
          Published products
        </Link>
      </nav>
      {products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <PackageCheck className="size-9 text-muted-foreground" />
            <h2 className="mt-4 font-heading text-xl">
              {publishedOnly
                ? 'No published products'
                : 'The product queue is clear'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {publishedOnly
                ? 'Published listings will appear here for review and unpublishing.'
                : 'No listings are waiting for review or publication.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {products.map((product) => (
            <Card key={product.id} className="py-0">
              <CardContent className="flex gap-4 p-4">
                <div
                  data-media-frame="cover"
                  className={mediaFrameClass(
                    'cover',
                    'flex size-24 shrink-0 items-center justify-center rounded-xl bg-muted',
                  )}
                >
                  {product.primaryMediaId ? (
                    <Image
                      data-media-mode="cover"
                      src={`/api/product-media/${product.primaryMediaId}`}
                      alt=""
                      width={96}
                      height={96}
                      sizes={mediaSizes.adminThumbnail}
                      unoptimized
                      className={mediaObjectClass('cover')}
                    />
                  ) : (
                    <ImageIcon className="size-7 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold">{product.nameEn}</h2>
                    <StatusBadge status={product.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {product.tradingName} · {product.categoryName}
                  </p>
                  <p className="mt-1 text-sm">
                    {money(product.pricePaisa)} · Stock{' '}
                    {product.inventoryQuantity}
                  </p>
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    Review listing <ArrowRight className="size-4" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
