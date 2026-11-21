import { AdminPageTitle } from '@/components/admin/page-help';
import { SellerApplicationQueue } from '@/components/admin/seller-application-queue';
import { sellerDocumentLabel } from '@/components/admin/seller-document-label';
import { StepLine, type StepLineStep } from '@/components/ui/step-line';
import {registrationEvidenceKinds} from '@/lib/sellers/document-policy';
import { AcceptedAgreementSnapshot } from '@/components/admin/accepted-agreement-snapshot';
import { AccountRecoveryAssistance } from '@/components/admin/account-recovery-assistance';
import { getManagedMakerDetailsForReview, getManagedMakerApplicationTerms, ManagedMakerAuthorityError, managedAgreementVersionForSeller } from '@/lib/db/repositories/managed-maker-details';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '@/lib/sellers/managed-identity';
import { CompanySellingIdentity } from '@/components/seller/managed-maker-identity-fields';
import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import {ReviewBackLink} from '@/components/admin/review-back-link';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ExternalLink,
  FileCheck2,
  History,
  MapPin,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { SellerReviewActions } from '@/components/admin/seller-review-actions';
import { ManagedMakerActivationForm } from '@/components/admin/managed-maker-activation-form';
import {ManagedLiveActivationPanel} from '@/components/admin/managed-live-activation-panel';
import { getAcceptedManagedTerms } from '@/lib/managed-commerce/accepted-terms';
import { ManagedProgramReview } from '@/components/admin/managed-program-review';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerApplicationForReview, listSellerApplicationsForReview } from '@/lib/db/repositories/seller-applications';
import { getSellerGovernance, restrictionIsActive } from '@/lib/db/repositories/seller-governance';
import { can } from '@/lib/marketplace/permissions';

import { isPendingPayoutReference } from '@/lib/sellers/onboarding';
import { getManagedProgramWorkspace } from '@/lib/managed-commerce/program-workspace';
import {privateBankWorkspace} from '@/lib/sellers/bank-details';
import {SellerBankEvidence} from '@/components/admin/seller-bank-evidence';
import {PublicProfileReview} from '@/components/admin/public-profile-review';
import {getPublicProfileWorkspace} from '@/lib/sellers/public-profile';
import {getSellerReadiness} from '@/lib/sellers/readiness';
import {SellerReadinessSummary} from '@/components/seller/readiness-summary';
import {SellerOnboardingChecklist} from '@/components/seller/onboarding-checklist';
import {getSellerOnboardingChecklist} from '@/lib/sellers/onboarding-checklist';

import {SharedReviewQueue} from '@/components/admin/shared-review-queue';
import {listReviewTasks} from '@/lib/workflows/review-tasks';
import { reviewTaskHref } from '@/lib/admin/review-task-links';
import { reviewTaskLabels, reviewTaskOpen } from '@/lib/admin/review-queue-view';
import { getReviewedPublicProfileExtras } from '@/lib/sellers/public-profile-media';
import { SellerRecord } from './seller-record';
import {
  approvalWork, readPaidPayoutHistory, readSellerMoney, readSellerOpenWork, readSellerOrders, readSellerProducts, readSellerStanding,
  sellerRecordDate, sellerRecordTabs, type RecordListItem, type SellerRecordTab,
} from './seller-record-data';
import { SellerBankReview } from '@/components/admin/seller-bank-review';
import { SellerDocumentReview } from '@/components/admin/seller-document-review';
import { StaffReviewAccessBoundary } from '@/components/admin/staff-review-access-boundary';
import { cancellationCauseSchemaAvailable } from '@/lib/cancellation/attribution';
import { listSellerStaffNotes } from '@/lib/admin/seller-notes';
import { SellerNotesCard } from './seller-notes-card';

export const dynamic = 'force-dynamic';

function readAcceptedManagedTerms(database: D1Database, sellerId: string) {
  return getAcceptedManagedTerms(database, sellerId, Date.now());
}

async function readManagedApplicationTerms(database: D1Database, sellerId: string) {
  const version = await managedAgreementVersionForSeller(database, sellerId);
  return getManagedMakerApplicationTerms(database, Date.now(), version);
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kathmandu',
});

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm leading-6">{children || '—'}</dd>
    </div>
  );
}

/** Capture observation clocks with the authoritative reads, before rendering the view. */
async function readSellerReviewEvidence(database:D1Database,id:string,staff:{id:string;role:'admin'|'super_admin'}){
  const observedAt=Date.now();
  const [readiness,evidence] = await Promise.all([
    getSellerReadiness(database,id,observedAt).catch(()=>null),
    getSellerApplicationForReview(database,id,staff.id)
      .then(application=>({kind:'read' as const,application}))
      .catch((error:unknown)=>{if(error instanceof ManagedMakerAuthorityError)return{kind:'restricted' as const};throw error;}),
  ]);
  if(evidence.kind==='restricted')return{kind:'restricted' as const,observedAt,readiness};
  if(!evidence.application)return{kind:'missing' as const,observedAt,readiness};
  const [publicProfile, bank] = await Promise.all([
    getPublicProfileWorkspace(database,id,staff.id,'staff',observedAt),
    staff.role==='super_admin'?privateBankWorkspace(database,id,staff.id,'staff',observedAt):null,
  ]);
  return{kind:'full' as const,observedAt,readiness,application:evidence.application,publicProfile,bank};
}

export default async function SellerApplicationPage({
  params,searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?:Promise<{returnTo?:string;tab?:string;page?:string}>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(
    `/admin/sellers/${id}`,
    'seller.application.review',
  );
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const query = await searchParams;
  const backHref = safeAdminReturnTo(query?.returnTo, '/admin/sellers');
  const recordHref = '/admin/sellers/' + encodeURIComponent(id);
  function hrefFor(tab: SellerRecordTab, page = 1) {
    const filters = new URLSearchParams();
    if (tab !== 'work') filters.set('tab', tab);
    if (page > 1) filters.set('page', String(page));
    if (query?.returnTo) filters.set('returnTo', backHref);
    return recordHref + (filters.size ? '?' + filters : '');
  }
  const [reviewTasks, evidence] = await Promise.all([
    listReviewTasks(database,staff.id,id).catch(()=>null),
    readSellerReviewEvidence(database,id,staff),
  ]);
  const {observedAt,readiness}=evidence;
  if(evidence.kind==='restricted'){
    const summary=await database.prepare('SELECT p.display_name AS name,s.application_reference AS reference FROM seller_profiles s JOIN seller_public_profile_states p ON p.seller_id=s.id WHERE s.id=?').bind(id).first<{name:string;reference:string|null}>();
    if(!summary)notFound();
    const publicWorkspace=await getPublicProfileWorkspace(database,id,staff.id,'staff',observedAt);
    return <div className="space-y-6"><ReviewBackLink actorId={staff.id} returnTo={backHref}/><header><AdminPageTitle><h1 className="section-title">{summary.name||'Seller workspace'}</h1></AdminPageTitle><p className="mt-2 text-sm text-muted-foreground">{summary.reference}</p><p>Operational summary. Government identity, protected evidence and full bank comparison require their authorized reviewer.</p></header><SellerReadinessSummary readiness={readiness} audience="staff"/><SharedReviewQueue tasks={reviewTasks??[]} actorId={staff.id} unavailable={reviewTasks===null} sellerDirectoryAvailable/><PublicProfileReview actorId={staff.id} sellerId={id} workspace={publicWorkspace} canReview={false}/></div>;
  }
  if(evidence.kind==='missing')notFound();
  const {application,publicProfile,bank}=evidence;
  const applying = ['submitted', 'under_review', 'needs_changes'].includes(application.status);
  const sellerName = application.tradingName.trim() || application.legalName.trim() || application.applicationReference;
  const independent = application.userId !== staff.id;
  const allowedOrders = independent && can(staff, 'order.manage');
  const cancellationSchema = allowedOrders ? cancellationCauseSchemaAvailable(database) : false;
  const allowedProducts = independent && can(staff, 'product.review');
  const allowedFinance = independent && can(staff, 'payout.prepare');
  const allowedRestrictions = can(staff, 'seller.suspend');
  const registered = application.participationRoute !== 'managed_maker';
  const tabs = sellerRecordTabs.filter(([key]) => key === 'orders' ? allowedOrders : key === 'products' ? allowedProducts : true);
  const tab = tabs.find(([key]) => key === query?.tab)?.[0] ?? 'work';
  const requestedPage = Number(query?.page);
  const page = (tab === 'orders' || tab === 'products') && Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000
    ? requestedPage : 1;
  const registrationReviewed = readiness?.checks.find(check => check.id === 'application')?.status === 'ready';
  const identityReviewed = readiness?.checks.find(check => check.id === 'identity')?.status === 'ready';
  const termsAccepted = readiness?.checks.find(check => check.id === 'terms')?.status === 'ready';
  const applicationSteps: StepLineStep[] = [
    { id: 'registration', label: 'Registration', state: registrationReviewed ? 'complete' : 'current', detail: registrationReviewed ? 'Application approved' : 'Check the shop and contact details' },
    { id: 'documents', label: 'Documents', state: identityReviewed ? 'complete' : registrationReviewed ? 'current' : 'upcoming', detail: application.documentCount ? application.documentCount + ' uploaded' : 'No documents yet' },
    { id: 'agreement', label: 'Agreement & go live', state: readiness?.newOrders ? 'complete' : registrationReviewed && identityReviewed ? 'current' : 'upcoming', detail: readiness?.newOrders ? 'Can accept new orders' : termsAccepted ? 'Agreement accepted' : 'Check the seller agreement' },
  ];
  const approvedForActivation = application.status === 'under_review' && application.applicationStage === 'approved_for_activation';
  const [
    onboarding, intake, recoveryTarget, managedDetails, managedTerms,
    operationalAddresses, governance, managedProgram, acceptedManagedTerms,
    applications, publicExtras, standing, money, extraWork, tabRows, payoutHistory, staffNotes,
  ] = await Promise.all([
    staff.role === 'super_admin' ? getSellerOnboardingChecklist(database, {
      sellerId: application.id, ownerId: application.userId, stage: application.applicationStage ?? application.status,
      readiness, viewer: { kind: 'admin', actorId: staff.id },
    }) : null,
    application.status === 'under_review' ? database
      .prepare('SELECT 1 FROM seller_registration_intakes WHERE seller_id=? AND user_id=?')
      .bind(application.id, application.userId).first() : null,
    staff.role === 'super_admin' && independent
      ? database.prepare(`SELECT u.id,u.email,u.display_name AS displayName,CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='admin') THEN 'admin' ELSE 'seller' END AS role FROM users u WHERE u.id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('seller','admin')) AND NOT EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='super_admin')`).bind(application.userId).first<{id:string;email:string;displayName:string;role:'admin'|'seller'}>()
      : null,
    registered ? null : getManagedMakerDetailsForReview(database,id,staff.id),
    registered ? null : readManagedApplicationTerms(database,id),
    database.prepare(`SELECT purpose,locality FROM seller_operational_addresses WHERE seller_id=? AND purpose IN ('pickup','returns') ORDER BY purpose`)
      .bind(id).all<{purpose:string;locality:string}>(),
    getSellerGovernance(database, id),
    getManagedProgramWorkspace(database, id),
    registered ? null : readAcceptedManagedTerms(database, id),
    applying ? listSellerApplicationsForReview(database) : [],
    getReviewedPublicProfileExtras(database, id, observedAt).catch(() => null),
    readSellerStanding(database, id, staff, independent, cancellationSchema),
    allowedFinance && registered ? readSellerMoney(database, id, observedAt) : null,
    independent ? readSellerOpenWork(database, id, staff, observedAt) : null,
    tab === 'orders' ? readSellerOrders(database, id, staff.id, page, cancellationSchema) : tab === 'products' ? readSellerProducts(database, id, page) : [],
    tab === 'history' && allowedFinance && registered ? readPaidPayoutHistory(database, id) : [],
    independent ? listSellerStaffNotes(database, application.id) : null,
  ]);
  const registrationIntake = Boolean(intake);
  const restricted = restrictionIsActive(governance.restriction, observedAt);
  const since = application.history.reduce<number | null>((approvedAt, event) => event.toStatus === 'approved'
    ? Math.min(approvedAt ?? event.createdAt, event.createdAt) : approvedAt, null);
  const publicPhoto = publicExtras?.media.find(media => media.kind === 'profile_image');
  const summary = [
    application.productCategories,
    [application.locality, application.district].filter(Boolean).join(', '),
    since ? 'Seller since ' + sellerRecordDate.format(since) : application.applicationReference,
  ].filter((part): part is string => Boolean(part));
  const status = restricted ? { label: 'New orders paused' }
    : readiness?.newOrders ? { label: 'Active', good: true }
    : { label: (approvedForActivation ? 'approved for activation' : application.status.replaceAll('_', ' ')).replace(/^./, letter => letter.toUpperCase()) };
  const work = [
    ...(extraWork?.rows ?? []),
    ...(money?.approvals.map(approval => approvalWork(approval, id, can(staff, 'payout.approve'))) ?? []),
    ...(reviewTasks ?? []).filter(task => reviewTaskOpen(task) && task.sourceType !== 'order_response' && task.sourceType !== 'return_request')
      .map((task): RecordListItem => ({
        id: 'review-' + task.id, at: task.startedAt,
        title: reviewTaskLabels[task.sourceType] + (task.recordTitle ? ' · ' + task.recordTitle : ''),
        detail: task.sourceStatus.replaceAll('_', ' ') + ' · ' + sellerRecordDate.format(task.startedAt),
        status: task.status === 'awaiting_review' ? 'Your turn' : task.status === 'waiting_on_seller' ? 'Seller’s turn' : 'Open',
        href: reviewTaskHref(task, hrefFor('work')),
      })),
  ].sort((a, b) => Number(b.status === 'Late') - Number(a.status === 'Late') || b.at - a.at);
  const verifiedBank = bank?.current?.details;
  const bankSummary = bank ? {
    label: verifiedBank ? `${verifiedBank.bankName}, account ending ${verifiedBank.bankAccountNumber.slice(-4)}` : 'Bank details',
    status: bank.status, href: '#seller-bank',
  } : null;
  const restrictionNotes = allowedRestrictions ? governance.events.flatMap(event => {
    const { id, privateReason, createdAt, actorName } = event;
    return typeof id === 'string' && typeof privateReason === 'string' && privateReason.trim()
      && typeof createdAt === 'number' && Number.isFinite(createdAt) && typeof actorName === 'string'
      ? [{ id, text: privateReason, at: createdAt, actor: actorName }] : [];
  }) : [];
  const history = tab === 'history' ? application.history.map((event): RecordListItem => ({
    id: event.id, title: 'Application ' + event.toStatus.replaceAll('_', ' '),
    detail: [sellerRecordDate.format(event.createdAt), event.actorName].filter(Boolean).join(' · '), status: 'Record',
    href: '#seller-history', at: event.createdAt,
  })) : [];
  if (tab === 'history' && bank?.current?.verifiedAt) history.push({
    id: bank.current.id, title: 'Bank account verified', detail: sellerRecordDate.format(bank.current.verifiedAt),
    status: 'Record', href: '#seller-bank', at: bank.current.verifiedAt,
  });
  if (tab === 'history') history.push(...payoutHistory);
  history.sort((a,b) => b.at - a.at);
  const payoutsHref = allowedFinance ? registered ? withAdminReturnTo('/admin/payouts?sellerId=' + encodeURIComponent(id), hrefFor(tab, page))
    : '#seller-managed-program' : null;
  const recoveryHref = allowedFinance && registered ? withAdminReturnTo('/admin/payments/recoveries', hrefFor(tab, page)) : null;

  return (
    <StaffReviewAccessBoundary actorId={staff.id} sourceId={id}><div className="space-y-5">
      <ReviewBackLink actorId={staff.id} returnTo={backHref}/>
      <SellerRecord
        name={sellerName} avatar={publicPhoto ? '/api/profile-media/' + encodeURIComponent(publicPhoto.id) : undefined}
        meta={summary} status={status} sellerId={id} phone={application.supportPhone} email={application.supportEmail}
        restriction={governance.restriction} restricted={restricted} mayManageSeller={allowedRestrictions}
        tabs={tabs} tab={tab} hrefFor={hrefFor} page={page} workCount={work.length}
        workLimited={Boolean(extraWork?.limited) || (money?.waitingCount ?? 0) > (money?.approvals.length ?? 0)}
        workUnavailable={reviewTasks === null}
        rows={tab === 'work' ? work : tab === 'history' ? history : tabRows}
        standing={standing} money={money} registered={registered} payoutsHref={payoutsHref} recoveryHref={recoveryHref}
        documents={application.documents} bank={bankSummary} agreement={application.sellerAgreementAcceptedAt}
        notes={<SellerNotesCard key={staff.id + ':' + application.id} actorId={staff.id} sellerId={application.id}
          staffNotes={staffNotes} restrictionNotes={restrictionNotes} />}
      />
      <div className={applying ? 'grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(13rem,15rem)_minmax(0,1fr)]' : 'min-w-0'}>
        {applying ? <SellerApplicationQueue applications={applications} selected={id} /> : null}
        <article aria-label="Seller application and evidence" className="min-w-0 space-y-6">

      {applying ? <StepLine steps={applicationSteps} label="Seller review progress" className="md:max-lg:grid-cols-1" /> : null}

          <Card id="seller-evidence" className="scroll-mt-28">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="size-5 text-primary" /> Documents
              </CardTitle>
              <p className="text-sm text-muted-foreground">Files open in a private viewer. We record every download.</p>
            </CardHeader>
            <CardContent>
              {!application.documents.length ? <p className="text-sm text-muted-foreground">No documents yet.</p> : null}
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {application.documents.map((document) => (
                <div
                  key={document.id}
                  className="min-w-0 overflow-hidden rounded-xl border bg-card"
                >
                  <a href={`/api/admin/seller-documents/${document.id}`} target="_blank" rel="noreferrer"
                    aria-label={'Open ' + sellerDocumentLabel(document.kind) + ' in the private viewer'}
                    className="grid aspect-[8/5] max-h-44 place-items-center bg-[#EEE5D5] bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,rgba(255,255,255,0.32)_8px,rgba(255,255,255,0.32)_16px)] text-[#665747] hover:bg-[#e5d9c6]">
                    <FileCheck2 aria-hidden="true" className="size-6" />
                  </a>
                  <div className="space-y-2 p-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">
                      {sellerDocumentLabel(document.kind)}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {document.originalName} ·{' '}
                      {formatBytes(document.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {document.kind==='bank_verification' ? <a href={`/api/admin/seller-documents/${document.id}?details=payout`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Submitted bank details</a> : null}
                    <StatusBadge status={document.status} />

                  </div>
                  {staff.role === 'super_admin' && (registrationEvidenceKinds as readonly string[]).includes(document.kind) ? <Link className="section-link inline-flex min-h-11 items-center" href={`/admin/seller-documents/${document.id}/review`}>Document history</Link> : null}
                  {staff.role === 'super_admin' && (registrationEvidenceKinds as readonly string[]).includes(document.kind) ? <SellerDocumentReview actorId={staff.id} sellerId={id} documentId={document.id} expectedReviewId={document.reviewId??null} canDecide={document.status==='pending'}/> : null}
                  </div>
                </div>
              ))}
              </div>
            </CardContent>
          </Card>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Shop details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-3 md:grid-cols-2">
              <Detail label="Shop name">{application.tradingName}</Detail>
              <Detail label="Crafts">{application.productCategories}</Detail>
              <Detail label="Pickup area">{operationalAddresses.results.find(address => address.purpose === 'pickup')?.locality ?? application.locality}</Detail>
              <Detail label="Contact">{application.supportEmail}</Detail>
            </dl>
          </CardContent>
        </Card>
          <Card id="seller-history" className="scroll-mt-28">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-5 text-primary" /> History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {application.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No staff review action has been recorded yet.
                </p>
              ) : (
                <ol className="space-y-5">
                  {application.history.map((event) => (
                    <li
                      key={event.id}
                      className="border-l-2 border-primary/25 pl-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={event.toStatus} />
                        <span className="text-xs text-muted-foreground">
                          {dateTimeFormatter.format(new Date(event.createdAt))}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6">{event.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        By {event.actorName} · {event.actorEmail}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
      </div>
          <Card id="seller-decision" className="scroll-mt-28">
            <CardHeader>
              <CardTitle>Application decision</CardTitle>
            </CardHeader>
            <CardContent>
              <SellerReviewActions
                sellerId={application.id}
                status={application.status}
                participationRoute={application.participationRoute}
                applicationStage={application.applicationStage}
                registrationIntake={registrationIntake}
              />
              {application.participationRoute === 'managed_maker' && application.applicationStage === 'approved_for_activation' && managedTerms?.version!==MANAGED_SUPPLIER_AGREEMENT_VERSION ? (
                <div className="mt-5"><ManagedMakerActivationForm sellerId={application.id} companyAccount={managedTerms?.account} acceptedTerms={acceptedManagedTerms ? { detailId: acceptedManagedTerms.detailId, retentionBps: acceptedManagedTerms.retentionBps, agreementVersion: acceptedManagedTerms.agreementVersion } : null}/></div>
              ) : null}
            </CardContent>
          </Card>
      {recoveryTarget ? <AccountRecoveryAssistance actorId={staff.id} targetId={recoveryTarget.id} displayName={recoveryTarget.displayName} email={recoveryTarget.email} targetRole={recoveryTarget.role} /> : null}
      <StaffFormHistoryLinks returnTo={withAdminReturnTo('/admin/sellers/'+encodeURIComponent(id),backHref)} entries={[{kind:'seller-review-action',subjectId:id,label:'Seller review answers'},
        ...(staff.role === 'super_admin' ? [{kind:'seller-governance' as const,subjectId:id,label:'Seller governance answers'}] : [])]} />
      {onboarding ? <SellerOnboardingChecklist model={onboarding} /> : null}

      <nav aria-label="Seller review sections" className="flex flex-wrap gap-2">
        {[['seller-readiness','Readiness'],['seller-identity','Identity & terms'],['seller-registration','Registration'],['seller-evidence','Documents'],['seller-decision','Application decision'],['seller-history','Review history']].filter(([target])=>target!=='seller-identity'||application.participationRoute==='managed_maker').map(([target,label])=><a key={target} href={'#'+target} className="inline-flex min-h-11 items-center rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">{label}</a>)}
      </nav>
      <div id="seller-readiness" className="scroll-mt-28"><SellerReadinessSummary readiness={readiness} audience="staff"/></div>
      {application.participationRoute==='managed_maker'&&staff.role==='super_admin'&&application.userId!==staff.id
        ? <div id="seller-live-trading" className="scroll-mt-28"><ManagedLiveActivationPanel key={id} actorId={staff.id} sellerId={id}/></div> : null}
      <SharedReviewQueue tasks={reviewTasks??[]} actorId={staff.id} unavailable={reviewTasks===null} sellerDirectoryAvailable/>

      <div className="min-w-0">
        <div className="space-y-6">
          {bank?<div id="seller-bank" className="scroll-mt-28"><SellerBankEvidence workspace={bank}/></div>:null}
          {bank?<SellerBankReview actorId={staff.id} sellerId={id} revision={bank.revision} canDecide={application.userId!==staff.id&&bank.change?.status==='open'&&!!bank.proposed}/>:null}
          {bank?.change?.status==='open'&&bank.proposed&&application.userId===staff.id?<p>You cannot review your own bank evidence. An eligible nonconflicted Super Admin must review this case.</p>:null}
          {managedTerms ? <CompanySellingIdentity terms={managedTerms}/> : null}
          {application.participationRoute === 'managed_maker' ? <Card id="seller-identity" className="scroll-mt-28"><CardHeader><CardTitle>Private Managed Maker agreement and identity</CardTitle></CardHeader><CardContent>
            {managedDetails ? <dl className="grid gap-4 sm:grid-cols-2"><Detail label="Government ID">{managedDetails.governmentIdType.replaceAll('_',' ')} {managedDetails.governmentIdDescription}</Detail>
              <Detail label="Personal PAN (private)">{managedDetails.personalPan ?? 'Not supplied'}</Detail><Detail label="Accepted agreement">{managedDetails.agreementVersion}</Detail>
              <Detail label="Accepted at">{dateTimeFormatter.format(new Date(managedDetails.agreementAcceptedAt))}</Detail><Detail label="Accepted by">{managedDetails.agreementAcceptedBy}</Detail>
              <div className="sm:col-span-2"><Detail label="Historical accepted terms"><AcceptedAgreementSnapshot json={managedDetails.agreementSnapshotJson} /></Detail></div></dl>
              : <p>Current government ID and Managed Maker agreement acceptance have not been supplied. Request changes before approving activation.</p>}
          </CardContent></Card> : null}
          <div id="seller-managed-program" className="scroll-mt-28">
            <ManagedProgramReview sellerId={application.id} workspace={managedProgram} canReviewPaymentTransfers={allowedFinance} canReviewPaymentHistory={can(staff, 'payout.approve') && independent} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Recorded commercial references (private)</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Legal seller reference">{application.legalSellerReference ?? 'Not assigned'}</Detail>
                <Detail label="Invoice issuer reference">{application.invoiceIssuerReference ?? 'Not assigned'}</Detail>
                <Detail label="Payout beneficiary reference">{application.payoutBeneficiaryReference ?? 'Not assigned'}</Detail>
                <Detail label="Return destination">{application.returnDestinationType?.replaceAll('_', ' ') ?? 'Not configured'}</Detail>
              </dl>
            </CardContent>
          </Card>
          <PublicProfileReview actorId={staff.id} sellerId={id} workspace={publicProfile} canReview={staff.role==='super_admin'&&application.userId!==staff.id}/>
          <Card>
            <CardHeader>
              <CardTitle>Seller-role restrictions and deletion safety</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Current recorded state">
                  {governance.restriction?.mode ?? 'Active (no restriction recorded)'}
                </Detail>
                <Detail label="Existing obligations">
                  {governance.restriction?.obligationMode?.replaceAll('_', ' ') ??
                    'Normal processing'}
                </Detail>
                <Detail label="Suspension end">
                  {governance.restriction?.suspendedUntil
                    ? dateTimeFormatter.format(
                        new Date(governance.restriction.suspendedUntil),
                      )
                    : '—'}
                </Detail>
                <Detail label="Decision version">
                  {governance.restriction?.version ?? 0}
                </Detail>
              </dl>

              {allowedRestrictions ? (
                <a href="#seller-order-controls" className="section-link inline-flex min-h-11 items-center">Open seller restrictions</a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Restriction changes and deletion preflights require Super
                  Admin authority. This review remains read-only.
                </p>
              )}

              {governance.preflights.length > 0 ? (
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold">Recent deletion preflights</h3>
                  {governance.preflights.map((preflight) => (
                    <div key={preflight.id} className="rounded-lg border p-3 text-sm">
                      <p className="font-semibold">
                        {preflight.status.replaceAll('_', ' ')} ·{' '}
                        {dateTimeFormatter.format(new Date(preflight.createdAt))}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Retention periods remain category-specific production
                        readiness gates. A legal or dispute hold overrides
                        ordinary deletion eligibility.
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="size-5 text-primary" /> Maker profile
                media
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {application.profileMedia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No optional maker profile media was supplied.
                </p>
              ) : application.profileMedia.map((media) => (
                <div
                  key={media.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold capitalize">
                      {media.kind.replaceAll('_', ' ')}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {media.originalName} · {formatBytes(media.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={media.moderationStatus} />
                    <a
                      href={`/api/admin/seller-profile-media/${media.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
                    >
                      Open <ExternalLink className="size-4" />
                    </a>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card id="seller-registration" className="scroll-mt-28">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" /> Registration and
                tax
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Legal name">{application.legalName}</Detail>
                <Detail label="Applicant type">{application.applicantType ?? 'Legacy application (not reclassified)'}</Detail>
                <Detail label="Registration authority">
                  {application.registrationAuthority}
                </Detail>
                <Detail label="Registration number">
                  {application.registrationNumber}
                </Detail>
                <Detail label="Tax mode">{application.taxMode === 'NONE' ? 'Not supplied for Managed Maker application' : application.taxMode}</Detail>
                <Detail label="PAN / VAT number">
                  {application.taxRegistrationNumber}
                </Detail>
                <Detail label="Agreement version">
                  {application.sellerAgreementVersion}
                </Detail>
                <Detail label="Agreement accepted">
                  {application.sellerAgreementAcceptedAt
                    ? dateTimeFormatter.format(
                        new Date(application.sellerAgreementAcceptedAt),
                      )
                    : '—'}
                </Detail>
                  <Detail label={isPendingPayoutReference(application.payoutAccountReference??'') ? 'Submitted bank details — pending verification' : 'Verified receiving account reference'}>
                  {application.payoutAccountReference}
                </Detail>
                <Detail label="Written settlement terms reference">
                  {application.settlementTermsReference}
                </Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-5 text-primary" /> Representative and
                business
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Representative">
                  {application.representativeName}
                </Detail>
                <Detail label="Email">{application.supportEmail}</Detail>
                <Detail label="Phone">{application.supportPhone}</Detail>
                <Detail label="Product categories">
                  {application.productCategories}
                </Detail>
                <div className="sm:col-span-2">
                  <Detail label="Business description">
                    {application.businessDescription}
                  </Detail>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-5 text-primary" /> Operating address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6">
                {application.locality}
                {application.ward ? `, Ward ${application.ward}` : ''},{' '}
                {application.municipality}, {application.district},{' '}
                {application.province}, Nepal
              </p>
              <dl className="mt-4 space-y-3">{operationalAddresses.results.map(address=><Detail key={address.purpose} label={address.purpose==='pickup'?'Private pickup address':'Private return address'}>{address.locality}</Detail>)}</dl>
            </CardContent>
          </Card>
        </div>
      </div>
      </article>
    </div>
    </div></StaffReviewAccessBoundary>
  );
}

