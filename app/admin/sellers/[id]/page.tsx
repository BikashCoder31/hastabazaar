import { AdminPageTitle } from '@/components/admin/page-help';
import { SellerApplicationQueue, sellerInitials } from '@/components/admin/seller-application-queue';
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
import { SellerGovernanceActions } from '@/components/admin/seller-governance-actions';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerApplicationForReview, listSellerApplicationsForReview } from '@/lib/db/repositories/seller-applications';
import { getSellerGovernance } from '@/lib/db/repositories/seller-governance';
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
  const observedAt=Date.now(),readiness=await getSellerReadiness(database,id,observedAt).catch(()=>null);
  const evidence=await getSellerApplicationForReview(database,id,staff.id)
    .then(application=>({kind:'read' as const,application}))
    .catch((error:unknown)=>{if(error instanceof ManagedMakerAuthorityError)return{kind:'restricted' as const};throw error;});
  if(evidence.kind==='restricted')return{kind:'restricted' as const,observedAt,readiness};
  if(!evidence.application)return{kind:'missing' as const,observedAt,readiness};
  const publicProfile=await getPublicProfileWorkspace(database,id,staff.id,'staff',Date.now());
  const bank=staff.role==='super_admin'?await privateBankWorkspace(database,id,staff.id,'staff',Date.now()):null;
  return{kind:'full' as const,observedAt,readiness,application:evidence.application,publicProfile,bank};
}

export default async function SellerApplicationPage({
  params,searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?:Promise<{returnTo?:string}>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(
    `/admin/sellers/${id}`,
    'seller.application.review',
  );
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const returnTarget=(await searchParams)?.returnTo;
  const backHref=safeAdminReturnTo(returnTarget,'/admin/sellers');
  const reviewTasks=await listReviewTasks(database,staff.id,id).catch(()=>null);

  const evidence=await readSellerReviewEvidence(database,id,staff);
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
  const applications = applying ? await listSellerApplicationsForReview(database) : [];
  const sellerName = application.tradingName.trim() || application.legalName.trim() || application.applicationReference;
  const registrationReviewed = readiness?.checks.find(check => check.id === 'application')?.status === 'ready';
  const identityReviewed = readiness?.checks.find(check => check.id === 'identity')?.status === 'ready';
  const termsAccepted = readiness?.checks.find(check => check.id === 'terms')?.status === 'ready';
  const applicationSteps: StepLineStep[] = [
    { id: 'registration', label: 'Registration', state: registrationReviewed ? 'complete' : 'current', detail: registrationReviewed ? 'Application approved' : 'Check the shop and contact details' },
    { id: 'documents', label: 'Documents', state: identityReviewed ? 'complete' : registrationReviewed ? 'current' : 'upcoming', detail: application.documentCount ? application.documentCount + ' uploaded' : 'No documents yet' },
    { id: 'agreement', label: 'Agreement & go live', state: readiness?.newOrders ? 'complete' : registrationReviewed && identityReviewed ? 'current' : 'upcoming', detail: readiness?.newOrders ? 'Can accept new orders' : termsAccepted ? 'Agreement accepted' : 'Check the seller agreement' },
  ];
  const onboarding = staff.role === 'super_admin' ? await getSellerOnboardingChecklist(database, {
    sellerId: application.id, ownerId: application.userId, stage: application.applicationStage ?? application.status,
    readiness, viewer: { kind: 'admin', actorId: staff.id },
  }) : null;
  const approvedForActivation = application.status === 'under_review' && application.applicationStage === 'approved_for_activation';
  const registrationIntake = application.status === 'under_review' && Boolean(await database
    .prepare('SELECT 1 FROM seller_registration_intakes WHERE seller_id=? AND user_id=?')
    .bind(application.id, application.userId).first());
  const recoveryTarget = staff.role === 'super_admin' && application.userId !== staff.id
    ? await database.prepare(`SELECT u.id,u.email,u.display_name AS displayName,CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='admin') THEN 'admin' ELSE 'seller' END AS role FROM users u WHERE u.id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('seller','admin')) AND NOT EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='super_admin')`).bind(application.userId).first<{id:string;email:string;displayName:string;role:'admin'|'seller'}>()
    : null;
  const [managedDetails, managedTerms] = application.participationRoute === 'managed_maker'
    ? await Promise.all([getManagedMakerDetailsForReview(database,id,staff.id),readManagedApplicationTerms(database,id)]) : [null,null];
  const operationalAddresses=await database.prepare(`SELECT purpose,locality FROM seller_operational_addresses WHERE seller_id=? AND purpose IN ('pickup','returns') ORDER BY purpose`)
    .bind(id).all<{purpose:string;locality:string}>();
  const governance = await getSellerGovernance(database, id);
  const managedProgram = await getManagedProgramWorkspace(database, id);
  const acceptedManagedTerms = application.participationRoute === 'managed_maker'
    ? await readAcceptedManagedTerms(database, id) : null;

  return (
    <StaffReviewAccessBoundary actorId={staff.id} sourceId={id}><div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <AdminPageTitle><h1 className="font-heading text-3xl tracking-tight">Sellers</h1></AdminPageTitle>
        <ReviewBackLink actorId={staff.id} returnTo={backHref}/>
      </header>
      <div className={applying ? 'grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(13rem,15rem)_minmax(0,1fr)]' : 'min-w-0'}>
        {applying ? <SellerApplicationQueue applications={applications} selected={id} /> : null}
        <article className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-[#A8232E] text-lg font-bold text-white">{sellerInitials(sellerName)}</span>
          <div className="min-w-0">
            <h2 className="break-words font-heading text-2xl tracking-tight md:text-3xl">{sellerName}</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {application.applicationReference} · Applied {dateTimeFormatter.format(application.createdAt)} · {application.representativeName} · {application.district}
            </p>
          </div>
        </div>
        <StatusBadge status={approvedForActivation ? 'approved_for_activation' : application.status} />
      </div>

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
          <ManagedProgramReview sellerId={application.id} workspace={managedProgram} canReviewPaymentTransfers={can(staff, 'payout.prepare') && application.userId !== staff.id} canReviewPaymentHistory={can(staff, 'payout.approve') && application.userId !== staff.id} />
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

              {can(staff, 'seller.suspend') ? (
                <SellerGovernanceActions
                  sellerId={application.id}
                  current={governance.restriction}
                />
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
                      className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
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
import { SellerBankReview } from '@/components/admin/seller-bank-review';
import { SellerDocumentReview } from '@/components/admin/seller-document-review';
import {StaffReviewAccessBoundary} from '@/components/admin/staff-review-access-boundary';

