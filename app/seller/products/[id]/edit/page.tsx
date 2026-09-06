import { env } from 'cloudflare:workers';
import { notFound, redirect } from 'next/navigation';

import { ProductSubmissionForm } from '@/components/seller/product-submission-form';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  getSellerProductForRevision,
  listActiveCategories,
  listActiveOccasions,
} from '@/lib/db/repositories/products';

export const dynamic = 'force-dynamic';

export default async function ReviseProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seller = await requireSellerPage(`/seller/products/${id}/edit`);
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [product, categories, occasions] = await Promise.all([
    getSellerProductForRevision(database, seller.sellerId, id),
    listActiveCategories(database),
    listActiveOccasions(database),
  ]);
  if (!product) notFound();
  if (product.status !== 'needs_changes') redirect('/seller/products');
  return (
    <div className="space-y-7">
      <div><p className="eyebrow">Changes requested</p><h1 className="mt-2 font-heading text-4xl tracking-tight">Revise {product.nameEn}</h1><p className="mt-3 max-w-3xl rounded-xl border border-amber-600/25 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Reviewer note:</strong> {product.reviewNote}</p></div>
      <ProductSubmissionForm categories={categories} occasions={occasions} initial={product} />
    </div>
  );
}
