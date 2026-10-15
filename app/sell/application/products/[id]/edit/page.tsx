import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ProductSubmissionForm } from '@/components/seller/product-submission-form';
import { requireManagedMakerPage } from '@/lib/auth/managed-maker';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerProductForRevision, listActiveCategories, listActiveOccasions } from '@/lib/db/repositories/products';
import { getProductMaterialSuggestions } from '@/lib/products/material-settings';
export const dynamic = 'force-dynamic';
export default async function MakerProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const maker = await requireManagedMakerPage(`/sell/application/products/${encodeURIComponent(id)}/edit`);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [product, categories, occasions, materials] = await Promise.all([
    getSellerProductForRevision(db, maker.sellerId, id), listActiveCategories(db), listActiveOccasions(db), getProductMaterialSuggestions(db),
  ]);
  if (!product) notFound();
  if (!['draft', 'needs_changes', 'rejected', 'approved', 'published'].includes(product.status)) redirect('/sell/application');
  return <main className="shell space-y-7 py-10" id="main-content" tabIndex={-1}>
    <Link className="section-link" href="/sell/application">← Maker workspace</Link>
    <header><h1 className="font-heading text-4xl">Update {product.nameEn}</h1>
      <p className="mt-3 text-muted-foreground">Save and submit your product for review. Publication is a separate staff decision.</p>
      {product.reviewNote ? <p className="mt-3 rounded-xl border p-4">Reviewer note: {product.reviewNote}</p> : null}</header>
    <ProductSubmissionForm categories={categories} occasions={occasions} initial={product} materialSuggestions={materials}
      workspaceMode="maker" returnUrl="/sell/application" submitUrl={`/api/seller/products/${encodeURIComponent(id)}?workspace=maker`} />
  </main>;
}
