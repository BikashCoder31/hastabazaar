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
import { getProductMaterialSuggestions } from '@/lib/products/material-settings';

export const dynamic = 'force-dynamic';

export default async function ReviseProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seller = await requireSellerPage(`/seller/products/${id}/edit`);
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [product, categories, occasions, materialSuggestions] = await Promise.all([
    getSellerProductForRevision(database, seller.sellerId, id),
    listActiveCategories(database),
    listActiveOccasions(database),
    getProductMaterialSuggestions(database),
  ]);
  if (!product) notFound();
  if (!['draft', 'needs_changes', 'rejected', 'approved', 'published'].includes(product.status)) {
    redirect('/seller/products');
  }
  const needsCorrection = product.status === 'needs_changes' || product.status === 'rejected';
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">{needsCorrection ? 'Changes required' : 'Edit product'}</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">
          Revise {product.nameEn}
        </h1>
        {needsCorrection ? (
          <p className="mt-3 max-w-3xl rounded-xl border border-amber-600/25 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <strong>{product.status === 'rejected' ? 'Reason for rejection' : 'Reviewer note'}:</strong>{' '}
            {product.reviewNote || 'Review the listing and correct the requested information.'}
          </p>
        ) : (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Product identity and historical orders are preserved. Saved catalogue changes are submitted for approval before they return to the storefront.
          </p>
        )}
      </div>
      <ProductSubmissionForm
        categories={categories}
        occasions={occasions}
        initial={product}
        materialSuggestions={materialSuggestions}
      />
    </div>
  );
}
