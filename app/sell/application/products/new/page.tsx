import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ProductSubmissionForm } from '@/components/seller/product-submission-form';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerParticipationForUser } from '@/lib/db/repositories/seller-applications';
import { listActiveCategories, listActiveOccasions } from '@/lib/db/repositories/products';
import { applicationCapabilities } from '@/lib/sellers/participation';
import { getProductMaterialSuggestions } from '@/lib/products/material-settings';
import { getManagedMakerAuthority } from '@/lib/managed-commerce/maker-authority';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Prepare product draft', robots: { index: false, follow: false } };

export default async function ApplicantProductDraftPage() {
  const customer = await requireCustomerPage('/sell/application/products/new');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const profile = await getSellerParticipationForUser(database, customer.userId);
  if (!profile) redirect('/sell');
  if (!applicationCapabilities(profile.applicationStage, 'applications_only').prepareProductDrafts) redirect('/sell/application');
  if (profile.participationRoute === 'managed_maker') {
    try { await getManagedMakerAuthority(database, customer.userId, Date.now()); }
    catch { redirect('/sell/application'); }
  }
  const [categories, occasions, materialSuggestions] = await Promise.all([listActiveCategories(database), listActiveOccasions(database),getProductMaterialSuggestions(database)]);
  return <main className="shell space-y-7 py-10" id="main-content" tabIndex={-1}>
    <Link className="section-link" href="/sell/application">← Application progress</Link>
    <header><p className="eyebrow">Private preparation</p><h1 className="mt-2 font-heading text-4xl">Prepare a product draft</h1><p className="mt-3 max-w-2xl text-muted-foreground">This complete draft reuses the existing product photo and product-specific video system. Saving it does not submit, publish, or enable orders.</p></header>
    <ProductSubmissionForm categories={categories} occasions={occasions} materialSuggestions={materialSuggestions} mode="draft"
      workspaceMode={profile.participationRoute === 'managed_maker' ? 'maker' : 'seller'} returnUrl="/sell/application"
      submitUrl={profile.participationRoute === 'managed_maker' ? '/api/seller/products?intent=draft&workspace=maker' : '/api/seller/products?intent=draft'} />
  </main>;
}
