import { getManagedMakerDetailsForReview, getManagedMakerApplicationTerms, ManagedMakerAuthorityError } from '@/lib/db/repositories/managed-maker-details';
import { CompanySellingIdentity } from '@/components/seller/managed-maker-identity-fields';
import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  ExternalLink,
  FileCheck2,
  History,
  MapPin,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { SellerReviewActions } from '@/components/admin/seller-review-actions';
import { ManagedMakerActivationForm } from '@/components/admin/managed-maker-activation-form';
import { ManagedProgramReview } from '@/components/admin/managed-program-review';
import { SellerGovernanceActions } from '@/components/admin/seller-governance-actions';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerApplicationForReview } from '@/lib/db/repositories/seller-applications';
import { getSellerGovernance } from '@/lib/db/repositories/seller-governance';
import { can } from '@/lib/marketplace/permissions';
import { managedMakerDisplayName } from '@/lib/sellers/participation';
import { getManagedProgramWorkspace } from '@/lib/managed-commerce/program-workspace';

export const dynamic = 'force-dynamic';

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
      <dd className="mt-1 text-sm leading-6">{children || '—'}</dd>
    </div>
  );
}

export default async function SellerApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(
    `/admin/sellers/${id}`,
    'seller.application.review',
  );
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const application = await getSellerApplicationForReview(database, id, staff.id).catch(error => {
    if (error instanceof ManagedMakerAuthorityError) redirect('/staff-access-denied');
    throw error;
  });
  if (!application) notFound();
  const [managedDetails, managedTerms] = application.participationRoute === 'managed_maker'
    ? await Promise.all([getManagedMakerDetailsForReview(database,id,staff.id),getManagedMakerApplicationTerms(database)]) : [null,null];
  const governance = await getSellerGovernance(database, id);
  const managedProgram = await getManagedProgramWorkspace(database, id);

  return (
    <div className="space-y-7">
      <StaffFormHistoryLinks entries={[{kind:'seller-review-action',subjectId:id,label:'Seller review answers'},
        ...(staff.role === 'super_admin' ? [{kind:'seller-governance' as const,subjectId:id,label:'Seller governance answers'}] : [])]} />
      <Link
        href="/admin/sellers"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to sellers
      </Link>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">{application.applicationReference}</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">
            {application.tradingName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Legal name: {application.legalName}
          </p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Selected route</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">{application.participationRoute === 'managed_maker' ? 'Hastabazaar Managed Maker' : 'Registered Seller'}</p>
            <p className="text-muted-foreground">Application stage: {(application.applicationStage ?? application.status).replaceAll('_', ' ')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Activation readiness</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">Applications Only</p>
            <p className="text-muted-foreground">Profile and product drafts may continue. Selling stays restricted until program, maker, and product readiness are all satisfied.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Outstanding responsibility</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">{application.participationRoute === 'managed_maker' ? 'Hastabazaar / external adviser' : 'Reviewer'}</p>
            <p className="text-muted-foreground">{application.participationRoute === 'managed_maker' ? 'Commercial model, reviewed agreement, legal seller, invoice issuer, supplier requirements, and payout beneficiary remain unassigned.' : 'Verify registration evidence, applicable agreement, payout details, and product review requirements.'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <div className="space-y-6">
          {managedTerms ? <CompanySellingIdentity terms={managedTerms}/> : null}
          {application.participationRoute === 'managed_maker' ? <Card><CardHeader><CardTitle>Private Managed Maker agreement and identity</CardTitle></CardHeader><CardContent>
            {managedDetails ? <dl className="grid gap-4 sm:grid-cols-2"><Detail label="Government ID">{managedDetails.governmentIdType.replaceAll('_',' ')} {managedDetails.governmentIdDescription}</Detail>
              <Detail label="Personal PAN (private)">{managedDetails.personalPan ?? 'Not supplied'}</Detail><Detail label="Accepted agreement">{managedDetails.agreementVersion}</Detail>
              <Detail label="Accepted at">{dateTimeFormatter.format(new Date(managedDetails.agreementAcceptedAt))}</Detail><Detail label="Accepted by">{managedDetails.agreementAcceptedBy}</Detail>
              <Detail label="Historical accepted terms"><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(JSON.parse(managedDetails.agreementSnapshotJson),null,2)}</pre></Detail></dl>
              : <p>Current government ID and Managed Maker agreement acceptance have not been supplied. Request changes before approving activation.</p>}
          </CardContent></Card> : null}
          <ManagedProgramReview sellerId={application.id} workspace={managedProgram} />
          <Card>
            <CardHeader>
              <CardTitle>Public maker profile preview</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Public identity">{application.participationRoute === 'managed_maker' && application.publicName ? managedMakerDisplayName(application.publicName) : application.publicName ?? application.tradingName}</Detail>
                <Detail label="Public city/town">{application.publicCity ?? application.municipality}</Detail>
                <Detail label="Legal seller reference">{application.legalSellerReference ?? 'Not assigned'}</Detail>
                <Detail label="Invoice issuer reference">{application.invoiceIssuerReference ?? 'Not assigned'}</Detail>
                <Detail label="Payout beneficiary reference">{application.payoutBeneficiaryReference ?? 'Not assigned'}</Detail>
                <Detail label="Return destination">{application.returnDestinationType?.replaceAll('_', ' ') ?? 'Not configured'}</Detail>
              </dl>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">Private registration, home/workshop address, evidence, commercial terms, and commission values are excluded from this public preview.</p>
            </CardContent>
          </Card>

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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" /> Registration and
                tax
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
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
                <Detail label="Verified receiving account reference">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="size-5 text-primary" /> Evidence
                documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {application.documents.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold capitalize">
                      {document.kind.replaceAll('_', ' ')}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {document.originalName} ·{' '}
                      {formatBytes(document.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={document.status} />
                    <a
                      href={`/api/admin/seller-documents/${document.id}`}
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Application decision</CardTitle>
            </CardHeader>
            <CardContent>
              <SellerReviewActions
                sellerId={application.id}
                status={application.status}
                participationRoute={application.participationRoute}
                applicationStage={application.applicationStage}
              />
              {application.participationRoute === 'managed_maker' && application.applicationStage === 'approved_for_activation' ? (
                <div className="mt-5"><ManagedMakerActivationForm sellerId={application.id} companyAccount={managedTerms?.account}/></div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-5 text-primary" /> Moderation history
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
      </div>
    </div>
  );
}
