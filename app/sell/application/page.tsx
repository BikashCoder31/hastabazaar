import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { MakerApplicationProfileForm } from '@/components/seller/maker-application-profile-form';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerParticipationForUser } from '@/lib/db/repositories/seller-applications';
import { applicationCapabilities, managedMakerDisplayName } from '@/lib/sellers/participation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Application progress', robots: { index: false, follow: false } };

const stageGuidance = {
  draft: ['Complete and submit the application.', 'Maker'],
  submitted: ['Hastabazaar must begin the review.', 'Hastabazaar'],
  under_review: ['Wait for the current review or respond if contacted.', 'Hastabazaar'],
  changes_requested: ['Review the requested corrections and update the application.', 'Maker'],
  approved_for_activation: ['Program and activation conditions must be confirmed.', 'Hastabazaar'],
  active: ['Only separately approved products may be published.', 'Hastabazaar'],
  rejected: ['Review the recorded decision; selling is unavailable.', 'Hastabazaar'],
  suspended: ['Existing obligations are handled according to the recorded suspension scope.', 'Hastabazaar'],
} as const;

export default async function SellerApplicationProgressPage() {
  const customer = await requireCustomerPage('/sell/application');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const profile = await getSellerParticipationForUser(database, customer.userId);
  if (!profile) redirect('/sell');
  const capabilities = applicationCapabilities(profile.applicationStage, 'applications_only');
  const drafts = (await database.prepare(
    `SELECT id, name_en AS nameEn, status, updated_at AS updatedAt FROM products
     WHERE seller_id = ? AND status = 'draft' ORDER BY updated_at DESC LIMIT 50`,
  ).bind(profile.sellerId).all<{ id: string; nameEn: string; status: string; updatedAt: number }>()).results;
  const [nextAction, responsible] = stageGuidance[profile.applicationStage];
  return <div className="min-h-screen bg-background"><SiteHeader /><main className="shell space-y-8 py-10" id="main-content" tabIndex={-1}>
    <header><p className="eyebrow">Application progress</p><h1 className="mt-2 font-heading text-4xl">{profile.participationRoute === 'managed_maker' ? managedMakerDisplayName(profile.publicName) : profile.publicName}</h1><p className="mt-3 text-muted-foreground">Route: {profile.participationRoute === 'managed_maker' ? 'Hastabazaar Managed Maker' : 'Registered Seller'} · Stage: {profile.applicationStage.replaceAll('_', ' ')}</p></header>
    <section className="grid gap-4 md:grid-cols-3">
      <StatusCard title="Program readiness" state="Applications Only" body="Profiles, review progress, and private product drafts are available. Selling and live commercial agreements remain disabled." />
      <StatusCard title="Maker readiness" state={profile.applicationStage.replaceAll('_', ' ')} body={`Responsible: ${responsible}. Next: ${nextAction}`} />
      <StatusCard title="Product readiness" state="Drafts only" body="Each product needs separate review. Drafts are not customer-visible and cannot accept orders." />
    </section>
    {capabilities.editProfile ? <section><h2 className="font-heading text-2xl">Shared maker profile</h2><MakerApplicationProfileForm profile={profile} /></section> : null}
    <section className="rounded-2xl border bg-card p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-heading text-2xl">Private product drafts</h2><p className="mt-2 text-sm text-muted-foreground">Product materials and origin stories remain attached to each product. Nothing here is published.</p></div>{capabilities.prepareProductDrafts ? <Link className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground" href="/sell/application/products/new">Prepare a product draft</Link> : null}</div>{drafts.length ? <ul className="mt-5 divide-y">{drafts.map((draft) => <li className="py-3" key={draft.id}>{draft.nameEn} · private draft</li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No product drafts yet.</p>}</section>
  </main><SiteFooter /></div>;
}

function StatusCard({ title, state, body }: { title: string; state: string; body: string }) {
  return <article className="rounded-2xl border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p><h2 className="mt-2 text-lg font-bold capitalize">{state}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></article>;
}

