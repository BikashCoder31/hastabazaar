import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listRiderReports, riderPolicy } from '@/lib/riders/repository';
import {
  RiderAdminAction,
  RiderPolicyForm,
} from '@/components/admin/rider-controls';
export const dynamic = 'force-dynamic';
export default async function RidersPage() {
  const staff = await requireStaffPage('/admin/riders', 'order.manage');
  if (staff.role !== 'super_admin') notFound();
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const superAdmin = true;
  const people = superAdmin
    ? (
        await db
          .prepare(
            'SELECT p.user_id AS id,p.status,p.version,p.application_id AS applicationId,p.open_box_eligible AS openBoxEligible,u.email,a.legal_name AS legalName,a.phone,a.district,a.identity_type AS identityType,a.identity_number AS identityNumber FROM rider_profiles p JOIN users u ON u.id=p.user_id JOIN rider_applications a ON a.id=p.application_id ORDER BY p.updated_at DESC LIMIT 100',
          )
          .all<{
            id: string;
            status: string;
            version: number;
            applicationId: string;
            email: string;
            legalName: string;
            phone: string;
            district: string;
            identityType: string;
            identityNumber: string;
            openBoxEligible: number;
          }>()
      ).results
    : [];
  const reports = await listRiderReports(db);
  return (
    <div className="space-y-6">
      <AdminPageTitle><h1 className="text-3xl font-semibold">Rider operations</h1></AdminPageTitle>
      <p>
        Only Super Admin can review rider identity, assignments and evidence.
        Rider applications and self-service are currently on hold. Delivery,
        collection and remittance remain separate records.
      </p>
      <Link className="underline" href="/admin/orders">
        Open order assignments
      </Link>
      <nav aria-label="Rider form answer history" className="flex flex-wrap gap-4 text-sm">
        {superAdmin ? <Link className="underline" href="/admin/riders/form-history?kind=application">Application answers</Link> : null}
        <Link className="underline" href="/admin/riders/form-history?kind=report">Report answers</Link>
        <Link className="underline" href="/admin/riders/form-history?kind=code">Code-verification context</Link>
        {superAdmin ? <Link className="underline" href="/admin/riders/form-history?kind=remittance">Remittance answers</Link> : null}
      </nav>
      {superAdmin ? (
        <>
          <RiderPolicyForm policy={await riderPolicy(db)} />
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Rider applications</h2>
            {people.map((p) => (
              <article className="rounded-xl border p-4" key={p.id}>
                <h3 className="font-semibold">
                  {p.legalName} · {p.status}
                </h3>
                <p>
                  {p.email} · {p.phone} · {p.district}
                </p>
                <p>
                  {p.identityType}: {p.identityNumber}
                </p>
                <p>
                  Open-box rider eligibility:{' '}
                  {p.openBoxEligible ? 'approved' : 'not approved'}
                </p>
                <a
                  className="underline"
                  href={
                    '/api/rider/media/' + p.applicationId + '?kind=identity'
                  }
                >
                  Review private identity document
                </a>
                <RiderAdminAction
                  action="review"
                  fields={{ userId: p.id, version: p.version }}
                  label="Record Super Admin decision"
                />
                {p.status === 'approved' ? (
                  <RiderAdminAction
                    action="open_box_eligibility"
                    fields={{
                      userId: p.id,
                      version: p.version,
                      eligible: !p.openBoxEligible,
                    }}
                    label={
                      p.openBoxEligible
                        ? 'Remove open-box eligibility'
                        : 'Approve open-box eligibility'
                    }
                  />
                ) : null}
              </article>
            ))}
          </section>
        </>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">
          Handover and exception reports
        </h2>
        {!reports.length ? <p>No rider reports.</p> : null}
        {reports.map((r) => (
          <article className="rounded-xl border p-4" key={r.id}>
            <h3 className="font-semibold">
              {r.orderNumber} · {r.kind.replaceAll('_', ' ')} · {r.status}
            </h3>
            <p>{r.note}</p>
            {r.openBoxOutcome !== 'not_applicable' ? (
              <p>
                Open-box outcome: {r.openBoxOutcome.replaceAll('_', ' ')}. This
                records only what was inspected and is not a waiver of a later
                valid complaint.
              </p>
            ) : null}
            <p>
              Reported cash: NPR {(r.cashPaisa / 100).toFixed(2)}. Responsible
              person: operations review queue.
            </p>
            <Link className="underline" href={'/admin/orders/' + r.orderId}>
              Open source parcel and cash records
            </Link>
            {r.mime ? (
              <a className="ml-4 underline" href={'/api/rider/media/' + r.id}>
                Review private proof
              </a>
            ) : null}
            {r.reviewNote ? <p>Review: {r.reviewNote}</p> : null}
            {r.status === 'pending' ? (
              <>
                <RiderAdminAction
                  action="confirm"
                  fields={{ reportId: r.id, version: r.currentVersion }}
                  label="Confirm reviewed report"
                />
                <RiderAdminAction
                  action="reject"
                  fields={{ reportId: r.id }}
                  label="Reject and request correction"
                />
              </>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
