import { loadSellerDashboardTerms } from '@/lib/sellers/dashboard-terms';
import {getSellerReadiness} from '@/lib/sellers/readiness';
import {SellerReadinessSummary} from './readiness-summary';
import {SellerOnboardingChecklist} from './onboarding-checklist';
import {getSellerOnboardingChecklist} from '@/lib/sellers/onboarding-checklist';
import { managedClearanceBlock } from '@/lib/sellers/onboarding';
import { getManagedMakerAuthority } from '@/lib/managed-commerce/maker-authority';
import { publicProfileEditableAt } from '@/lib/sellers/public-profile';
import { hasDeferredBankDetails } from '@/lib/sellers/onboarding';
import { SellerProductsDescription } from '@/components/seller/seller-products-description';
import {SellerAccessBoundary} from '@/components/seller/seller-access-boundary';
import { SellerRegistrationDetails } from '@/components/seller/seller-registration-intake-form';
import { loadSellerApplicationTerms } from '@/lib/sellers/application-terms';
import { MakerProductWorkspace } from '@/components/seller/maker-product-workspace';
import { ManagedTermsAcceptance } from '@/components/seller/managed-terms-acceptance';
import { ManagedTermsRecovery } from '@/components/seller/managed-terms-recovery';
import { RegisteredTransitionForm } from '@/components/seller/registered-transition-form';

import { env } from 'cloudflare:workers';
import Link from 'next/link';
import {readSellerWorkspaceTasks,assertSellerWorkspaceViewer} from '@/lib/seller/workspace-tasks';
import {SellerWorkspaceTaskList} from './workspace-task-list';
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
import {getSellerEarnings} from '@/lib/seller/earnings';
import { applicationCapabilities, managedMakerDisplayName } from '@/lib/sellers/participation';




const stageGuidance = {
  draft: ['Complete and submit the application.', 'Maker'],
  submitted: ['Hastabazaar must begin the review.', 'Hastabazaar'],
  under_review: ['Wait for the current review or respond if contacted.', 'Hastabazaar'],
  changes_requested: ['Review the requested corrections and update the application.', 'Maker'],
  approved_for_activation: ['Hastabazaar will review the remaining checks for taking orders.', 'Hastabazaar'],
  active: ['Only separately approved products may be published.', 'Hastabazaar'],
  rejected: ['Review the recorded decision; selling is unavailable.', 'Hastabazaar'],
  suspended: ['Existing obligations are handled according to the recorded suspension scope.', 'Hastabazaar'],
} as const;

function historyCursor(at?: string, id?: string) {
  const timestamp = at ? Number(at) : NaN;
  return Number.isSafeInteger(timestamp) && timestamp >= 0 && id && id.length <= 191
    ? { createdAt: timestamp, id } : undefined;
}

export async function SellerApplicationWorkspace({ searchParams, embedded = false, section = 'all' }: {
  embedded?: boolean; section?: 'all'|'home'|'profile'|'registration'|'products'|'finance';
  searchParams?: Promise<{ appAt?: string; appId?: string; makerAt?: string; makerId?: string; draftAt?: string; draftId?: string }>;
} = {}) {
  const customer = await requireCustomerPage('/sell/application');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const profile = await getSellerParticipationForUser(database, customer.userId);
  if (!profile) redirect('/sell');
  const registrationIntake = !embedded && ['active', 'approved_for_activation'].includes(profile.applicationStage) &&
    Boolean(await database.prepare('SELECT 1 FROM seller_registration_intakes WHERE seller_id=? AND user_id=?')
      .bind(profile.sellerId, customer.userId).first());
  const showOverview = section === 'home' || section === 'all';
  const [readiness, currentWork] = showOverview ? await Promise.all([
    getSellerReadiness(database, profile.sellerId).catch(() => null),
    readSellerWorkspaceTasks(database, customer.userId, { limit: 8 }).catch(() => null),
  ]) : [null, null];
  const onboarding = showOverview ? await getSellerOnboardingChecklist(database, {
    sellerId: profile.sellerId, ownerId: customer.userId, stage: profile.applicationStage,
    readiness, viewer: { kind: 'seller' },
  }) : null;
  const [profileEditableAt, deferBank] = await Promise.all([publicProfileEditableAt(database, profile.sellerId), hasDeferredBankDetails(database, profile.sellerId)]);
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
  const intakeTerms = await loadSellerApplicationTerms(database, Number(clock?.now ?? 0));
  const capabilities = applicationCapabilities(profile.applicationStage, program.value);
  let makerCanWrite = false;
  if (profile.participationRoute === 'managed_maker') {
    try { await getManagedMakerAuthority(database, customer.userId, Number(clock?.now ?? 0)); makerCanWrite = true; }
    catch { /* Restricted makers retain read-only history. */ }
  }
  const { offers, accepted, managedTerms, unavailable: termsUnavailable } = profile.participationRoute === 'managed_maker'
    ? await loadSellerDashboardTerms(database, profile.sellerId, Number(clock?.now ?? 0), profile.applicationStage === 'changes_requested')
    : { offers: null, accepted: null, managedTerms: undefined, unavailable: false };
  const managedFinance = (section==='all'||section==='finance')&&(profile.participationRoute === 'managed_maker' || Boolean(await database.prepare('SELECT 1 FROM managed_entitlements WHERE seller_id=? LIMIT 1').bind(profile.sellerId).first()))
    ? (await getSellerEarnings(database, profile.sellerId)).managed
    : null;
  const finance=managedFinance?.summary??null;
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
  const displayedStage = profile.applicationStage==='submitted' ? 'Under review (queued)' : profile.applicationStage.replaceAll('_', ' ');
  const show = (area: typeof section) => section === 'all' || section === area;
  const Content = embedded ? 'div' : 'main';
  await assertSellerWorkspaceViewer(database,customer.userId,profile.sellerId);
  return <SellerAccessBoundary actorId={customer.userId}><div className={embedded ? 'space-y-6' : 'min-h-screen bg-background'}>{!embedded ? <SiteHeader /> : null}<Content className={embedded ? 'space-y-8' : 'shell space-y-8 py-10'} id={embedded ? undefined : 'main-content'} tabIndex={embedded ? undefined : -1}>
    <header><p className="eyebrow">Application progress</p><h1 className="mt-2 font-heading text-4xl">{profile.participationRoute === 'managed_maker' ? managedMakerDisplayName(profile.publicName) : profile.publicName}</h1><p className="mt-3 text-muted-foreground">Route: {profile.participationRoute === 'managed_maker' ? 'Hastabazaar Managed Maker' : 'Registered Seller'} · Stage: {displayedStage}</p></header>
    {onboarding ? <SellerOnboardingChecklist model={onboarding} /> : null}
    <section className="grid gap-4 md:grid-cols-3">
      {profile.participationRoute==='managed_maker' ? <p className="rounded-xl border p-4 text-sm md:col-span-3">{managedClearanceBlock} Existing incomplete applications and their accepted terms remain recorded. Staff can request missing evidence; nothing is deleted or treated as accepted for you.</p> : null}
      {!showOverview ? <p className="md:col-span-3">Application: {displayedStage}. Responsible: {responsible}. Next: {nextAction}</p> : null}
      {registrationIntake ? <div className="space-y-2 md:col-span-3">
        <p>Check for any outstanding registration, document, or payout requirements in Seller Center.</p>
        <div className="flex flex-wrap gap-4">
          <Link className="section-link" href="/seller/registration">Registration &amp; documents</Link>
          <Link className="section-link" href="/seller/finance">Finance</Link>
        </div>
      </div> : null}
    </section>
    {showOverview ? <><SellerWorkspaceTaskList model={currentWork} compact unavailable={!currentWork}/><div id="seller-readiness" className="scroll-mt-28"><SellerReadinessSummary readiness={readiness}/></div></> : null}
    {termsUnavailable ? <output className="block rounded-xl border p-4 text-sm">Commercial terms are not available yet. You can update your registration details and prepare private product drafts. Agreement acceptance and selling remain unavailable until the required settings are published.</output> : null}
    {show('finance') ? <SellerBankDetailsForm accountId={customer.userId} /> : null}
    {show('registration') ? <SellerRegistrationDetails accountId={customer.userId} accountEmail={customer.email}
      managedTerms={intakeTerms.managed.status === 'ready' ? intakeTerms.managed.terms : undefined}
      registeredTerms={intakeTerms.registered.status === 'ready' ? intakeTerms.registered.terms : undefined} /> : null}
    {show('products') ? <><SellerProductsDescription /><Link href="/seller/products/intakes" className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm">Resume saved product workspaces and assistance</Link></> : null}
    {show('finance') && finance ? <section className="rounded-2xl border bg-card p-6"><h2 className="font-heading text-2xl">{managedFinance?.recordKind==='live'?'Actual Managed Maker settlement':'Managed Maker simulation history'}</h2><p className="mt-2 text-sm text-muted-foreground">{managedFinance?.recordKind==='live'?'Actual original sale-linked amounts keep calculated, earned, held, eligible, and paid states separate.':'Simulation amounts are retained history and are excluded from actual payable funds.'} Delivery cash reconciliation is tracked separately.</p><dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[
      ['Calculated',finance.calculatedPaisa],['Earned',finance.earnedPaisa],['Held',finance.heldPaisa],['Eligible',finance.eligiblePaisa],['Paid',finance.paidPaisa],
    ].map(([label,value])=><div key={String(label)}><dt className="text-xs uppercase text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">NPR {(Number(value)/100).toFixed(2)}</dd></div>)}</dl>{managedFinance?.simulationHistory?<p className="mt-4 text-sm text-muted-foreground">Separate simulation history: calculated NPR {(managedFinance.simulationHistory.calculatedPaisa/100).toFixed(2)}; recorded paid NPR {(managedFinance.simulationHistory.paidPaisa/100).toFixed(2)}. These amounts are excluded from actual settlement.</p>:null}</section> : null}
    {show('profile') && capabilities.editProfile && (profile.participationRoute !== 'managed_maker' || makerCanWrite) ? <section><h2 className="font-heading text-2xl">Shop & profile</h2>{profile.participationRoute==='managed_maker'&&profile.applicationStage==='changes_requested'?<MakerApplicationProfileForm profile={profile} managedTerms={managedTerms} editableAt={profileEditableAt} deferBank={deferBank}/>:<p className="mt-3"><Link className="section-link" href="/seller/profile">Prepare your private profile draft and review progress →</Link></p>}</section> : null}
    {show('registration') && offers && makerCanWrite ? <div id="selling-fee-terms" className="scroll-mt-28 space-y-4"><ManagedTermsAcceptance key={`${customer.userId}:${profile.sellerId}:${offers.current.id}`} ownerId={customer.userId} sellerId={profile.sellerId} offer={offers.current} future={false} alreadyAccepted={Boolean(accepted)} />
      {offers.upcoming.map(offer => <ManagedTermsAcceptance key={offer.id} ownerId={customer.userId} sellerId={profile.sellerId} offer={offer} future alreadyAccepted={Boolean(offer.accepted)} />)}</div> : null}
    {show('registration')&&offers&&makerCanWrite?<ManagedTermsRecovery ownerId={customer.userId} sellerId={profile.sellerId} visibleOfferIds={[offers.current.id,...offers.upcoming.map(offer=>offer.id)]}/>:null}
    {show('registration') && profile.applicationStage==='active' ? <RegisteredTransitionForm sellerId={profile.sellerId} ownerId={customer.userId}/> : null}
    {show('registration') ? <section className="space-y-4" aria-label="Application answer history">
      <h2 className="font-heading text-2xl">Application answer history</h2>
      {applications.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {!applications.answers.length ? <p>No saved application answers yet.</p> : null}
      {applications.nextCursor ? <Link className="section-link" href={nextHistory('app', applications.nextCursor)!}>Next 50 applications</Link> : null}
    </section> : null}
    {show('profile') ? <section className="space-y-4" aria-label="Maker profile answer history">
      <h2 className="font-heading text-2xl">Maker profile answer history</h2>
      {makerProfiles.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {!makerProfiles.answers.length ? <p>No saved maker profile answers yet.</p> : null}
      {makerProfiles.nextCursor ? <Link className="section-link" href={nextHistory('maker', makerProfiles.nextCursor)!}>Next 50 profile edits</Link> : null}
    </section> : null}
    {show('products') ? <MakerProductWorkspace products={drafts} canWrite={profile.participationRoute === 'managed_maker' ? makerCanWrite : capabilities.prepareProductDrafts} nextUrl={nextDraftLink} /> : null}
  </Content>{!embedded ? <SiteFooter /> : null}</div></SellerAccessBoundary>;
}

import { SellerBankDetailsForm } from '@/components/seller/bank-details-form';

