import { env } from 'cloudflare:workers';

import { ProductSubmissionForm } from '@/components/seller/product-submission-form';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  listActiveCategories,
  listActiveOccasions,
} from '@/lib/db/repositories/products';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  await requireSellerPage('/seller/products/new');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [categories, occasions] = await Promise.all([
    listActiveCategories(database),
    listActiveOccasions(database),
  ]);
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">New listing</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">
          Submit a product
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
          Provide enough information for customers and HastaBazaar’s reviewer to
          understand exactly what is being sold.
        </p>
      </div>
      <ProductSubmissionForm categories={categories} occasions={occasions} />
    </div>
  );
}
