import { getManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import { getAcceptedManagedTerms, getManagedTermsOffers } from '@/lib/managed-commerce/accepted-terms';
import { getManagedMakerAuthority } from '@/lib/managed-commerce/maker-authority';
import { MakerProductWorkspace } from '@/components/seller/maker-product-workspace';
import { ManagedTermsAcceptance } from '@/components/seller/managed-terms-acceptance';
import { ManagedTermsRecovery } from '@/components/seller/managed-terms-recovery';
import { RegisteredTransitionForm } from '@/components/seller/registered-transition-form';
import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { MakerApplicationProfileForm } from '@/components/seller/maker-application-profile-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerParticipationForUser } from '@/lib/db/repositories/seller-applications';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { getManagedFinanceSummary } from '@/lib/db/repositories/managed-settlements';
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

function historyCursor(at?: string, id?: string) {
  const timestamp = at ? Number(at) : NaN;
  return Number.isSafeInteger(timestamp) && timestamp >= 0 && id && id.length <= 191
    ? { createdAt: timestamp, id } : undefined;
}

export default async function SellerApplicationProgressPage({ searchParams }: {
  searchParams?: Promise<{ appAt?: string; appId?: string; makerAt?: string; makerId?: string; draftAt?: string; draftId?: string }>;
} = {}) {
  const customer = await requireCustomerPage('/sell/application');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const profile = await getSellerParticipationForUser(database, customer.userId);
  if (!profile) redirect('/sell');
  const query = await searchParams;
  const [applications, makerProfiles] = await Promise.all([
    listFormAnswersForSubjectPage(database, { subjectType: 'seller', subjectId: profile.sellerId,
      formId: 'seller.application', after: historyCursor(query?.appAt, query?.appId) }),
    listFormAnswersForSubjectPage(database, { subjectType: 'seller', subjectId: profile.sellerId,
      formId: 'seller.maker-profile', after: historyCursor(query?.makerAt, query?.makerId) }),
  ]);
  const allowed = await Promise.all([...applications.answers, ...makerProfiles.answers]
    .map((answer) => authorizeFormAnswerRead(database, { id: customer.userId, role: 'customer' }, answer)));
  if (allowed.some((value) => !value)) redirect('/sell');
  const nextHistory = (kind: 'app' | 'maker', next: { createdAt: number; id: string } | null) => {
    if (!next) return null;
    const link = new URLSearchParams();
    link.set(`${kind}At`, String(next.createdAt));
    link.set(`${kind}Id`, next.id);
    const other = kind === 'app' ? 'maker' : 'app';
    const otherAt = kind === 'app' ? query?.makerAt : query?.appAt;
    const otherId = kind === 'app' ? query?.makerId : query?.appId;
    if (otherAt && otherId) { link.set(`${other}At`, otherAt); link.set(`${other}Id`, otherId); }
    if (query?.draftAt && query?.draftId) { link.set('draftAt', query.draftAt); link.set('draftId', query.draftId); }
    return `/sell/application?${link.toString()}`;
  };
  const clock = await database.prepare("SELECT unixepoch('now') * 1000 AS now").first<{ now: number }>();
  const program = await getEffectiveBusinessSetting(database, 'managed_maker_program_mode', Number(clock?.now ?? 0));
  const capabilities = applicationCapabilities(profile.applicationStage, program.value);
  let makerCanWrite = false;
  if (profile.participationRoute === 'managed_maker') {
    try { await getManagedMakerAuthority(database, customer.userId, Number(clock?.now ?? 0)); makerCanWrite = true; }
    catch { /* Restricted makers retain read-only history. */ }
  }
  const [offers, accepted] = profile.participationRoute === 'managed_maker' ? await Promise.all([
    getManagedTermsOffers(database, profile.sellerId, Number(clock?.now ?? 0)),
    getAcceptedManagedTerms(database, profile.sellerId, Number(clock?.now ?? 0)),
  ]) : [null, null];
  const managedTerms = profile.participationRoute === 'managed_maker' && profile.applicationStage === 'changes_requested' ? await getManagedMakerApplicationTerms(database) : undefined;
  const finance = profile.participationRoute === 'managed_maker' || Boolean(await database.prepare('SELECT 1 FROM managed_entitlements WHERE seller_id=? LIMIT 1').bind(profile.sellerId).first())
    ? await getManagedFinanceSummary(database, profile.sellerId)
    : null;
  const draftCursor = historyCursor(query?.draftAt, query?.draftId);
  const draftRows = (await database.prepare(
    `SELECT id, name_en AS nameEn, status, updated_at AS updatedAt FROM products
     WHERE seller_id = ? AND NOT EXISTS(SELECT 1 FROM product_deletions WHERE product_id=products.id)
     ${draftCursor ? 'AND (updated_at < ? OR (updated_at = ? AND id < ?))' : ''}
     ORDER BY updated_at DESC, id DESC LIMIT 51`,
  ).bind(profile.sellerId, ...(draftCursor ? [draftCursor.createdAt, draftCursor.createdAt, draftCursor.id] : []))
    .all<{ id: string; nameEn: string; status: string; updatedAt: number }>()).results;
  const drafts = draftRows.slice(0, 50);
  const nextDraft = draftRows.length > 50 ? drafts[49] : null;
  const nextDraftLink = (() => {
    if (!nextDraft) return null;
    const link = new URLSearchParams();
    link.set('draftAt', String(nextDraft.updatedAt));
    link.set('draftId', nextDraft.id);
    if (query?.appAt && query?.appId) { link.set('appAt', query.appAt); link.set('appId', query.appId); }
    if (query?.makerAt && query?.makerId) { link.set('makerAt', query.makerAt); link.set('makerId', query.makerId); }
    return `/sell/application?${link.toString()}`;
  })();
  const [nextAction, responsible] = stageGuidance[profile.applicationStage];
  return <div className="min-h-screen bg-background"><SiteHeader /><main className="shell space-y-8 py-10" id="main-content" tabIndex={-1}>
    <header><p className="eyebrow">Application progress</p><h1 className="mt-2 font-heading text-4xl">{profile.participationRoute === 'managed_maker' ? managedMakerDisplayName(profile.publicName) : profile.publicName}</h1><p className="mt-3 text-muted-foreground">Route: {profile.participationRoute === 'managed_maker' ? 'Hastabazaar Managed Maker' : 'Registered Seller'} · Stage: {profile.applicationStage.replaceAll('_', ' ')}</p></header>
    <section className="grid gap-4 md:grid-cols-3">
      <StatusCard title="Program readiness" state={program.value.replaceAll('_',' ')} body={program.value === 'applications_only' ? 'Profiles, review progress, and private product drafts are available. Selling and live commercial agreements remain disabled.' : 'The implemented simulated route is available only in guarded local staging; production remains blocked.'} />
      <StatusCard title="Maker readiness" state={profile.applicationStage.replaceAll('_', ' ')} body={`Responsible: ${responsible}. Next: ${nextAction}`} />
      <StatusCard title="Product readiness" state="Separate product review" body="Drafts stay private. Submit a complete product for review; staff publish only after maker and product approval." />
    </section>
    {finance ? <section className="rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">Managed Maker settlement</h2><p className="mt-2 text-sm text-muted-foreground">Simulated amounts keep calculated, earned, held, eligible, and paid states separate. Delivery cash reconciliation is tracked separately.</p><dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[
      ['Calculated',finance.calculatedPaisa],['Earned',finance.earnedPaisa],['Held',finance.heldPaisa],['Eligible',finance.eligiblePaisa],['Paid',finance.paidPaisa],
    ].map(([label,value])=><div key={String(label)}><dt className="text-xs uppercase text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">NPR {(Number(value)/100).toFixed(2)}</dd></div>)}</dl></section> : null}
    {capabilities.editProfile && (profile.participationRoute !== 'managed_maker' || makerCanWrite) ? <section><h2 className="font-heading text-2xl">Shared maker profile</h2><MakerApplicationProfileForm profile={profile} managedTerms={managedTerms} /></section> : null}
    {offers && makerCanWrite ? <><ManagedTermsAcceptance key={`${customer.userId}:${profile.sellerId}:${offers.current.id}`} ownerId={customer.userId} sellerId={profile.sellerId} offer={offers.current} future={false} alreadyAccepted={Boolean(accepted)} />
      {offers.upcoming.map(offer => <ManagedTermsAcceptance key={offer.id} ownerId={customer.userId} sellerId={profile.sellerId} offer={offer} future alreadyAccepted={Boolean(offer.accepted)} />)}</> : null}
    {offers&&makerCanWrite?<ManagedTermsRecovery ownerId={customer.userId} sellerId={profile.sellerId} visibleOfferIds={[offers.current.id,...offers.upcoming.map(offer=>offer.id)]}/>:null}
    {profile.applicationStage==='active' ? <RegisteredTransitionForm sellerId={profile.sellerId} ownerId={customer.userId}/> : null}
    <section className="space-y-4" aria-label="Application answer history">
      <h2 className="font-heading text-2xl">Application answer history</h2>
      {applications.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {!applications.answers.length ? <p>No saved application answers yet.</p> : null}
      {applications.nextCursor ? <Link className="section-link" href={nextHistory('app', applications.nextCursor)!}>Next 50 applications</Link> : null}
    </section>
    <section className="space-y-4" aria-label="Maker profile answer history">
      <h2 className="font-heading text-2xl">Maker profile answer history</h2>
      {makerProfiles.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {!makerProfiles.answers.length ? <p>No saved maker profile answers yet.</p> : null}
      {makerProfiles.nextCursor ? <Link className="section-link" href={nextHistory('maker', makerProfiles.nextCursor)!}>Next 50 profile edits</Link> : null}
    </section>
    <MakerProductWorkspace products={drafts} canWrite={profile.participationRoute === 'managed_maker' ? makerCanWrite : capabilities.prepareProductDrafts} nextUrl={nextDraftLink} />
  </main><SiteFooter /></div>;
}

function StatusCard({ title, state, body }: { title: string; state: string; body: string }) {
  return <article className="rounded-2xl border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p><h2 className="mt-2 text-lg font-bold capitalize">{state}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></article>;
}
