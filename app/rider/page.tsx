import { RiderCodeVerification } from '@/components/rider/rider-code';
import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import {
  riderProfile,
  riderPolicy,
  listRiderReports,
} from '@/lib/riders/repository';
import { RiderSharing } from '@/components/delivery/rider-sharing';
import {
  RiderApplicationForm,
  RiderRemittanceForm,
  RiderReportForm,
} from '@/components/rider/rider-forms';
import type { NepalAddress } from '@/lib/shipping/provider';
import { riderFinanceDashboard } from '@/lib/riders/operations-policy';
export const dynamic = 'force-dynamic';
export default async function RiderPage() {
  const user = await requireCustomerPage('/rider'),
    db = requireDatabase(env as unknown as { DB?: D1Database }),
    profile = await riderProfile(db, user.userId);
  const policy = await riderPolicy(db);
  const jobs =
    profile?.status === 'approved'
      ? (
          await db
            .prepare(
              "SELECT j.id,j.status,o.payment_mode AS paymentMode,o.order_number AS orderNumber,o.shipping_address_json AS addressJson,p.version,p.cod_due_paisa-p.collected_paisa AS remaining,p.open_box_required AS openBoxRequired,p.open_box_snapshot_json AS openBoxSnapshotJson FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE p.rider_user_id=? AND p.method='own_rider' AND o.status IN ('confirmed','packing','ready_for_pickup','dispatched') AND j.status NOT IN ('delivered','returned','cancelled') ORDER BY j.created_at",
            )
            .bind(user.userId)
            .all<{
              id: string;
              status: string;
              orderNumber: string;
              paymentMode: string;
              addressJson: string;
              version: number;
              remaining: number;
              openBoxRequired: number;
              openBoxSnapshotJson: string | null;
            }>()
        ).results
      : [];
  const reports =
    profile?.status === 'approved'
      ? await listRiderReports(db, user.userId)
      : [];
  const finance =
    profile?.status === 'approved'
      ? await riderFinanceDashboard(db, user.userId)
      : null;
  return (
    <main tabIndex={-1} id="main-content" className="shell space-y-6 py-8">
      <Link className="underline" href="/account">
        Switch to customer dashboard
      </Link>
      <h1 className="text-3xl font-semibold">Rider dashboard</h1>
      {profile ? (
        <section className="rounded-xl border p-4">
          <h2 className="font-semibold">Verification: {profile.status}</h2>
          <p>
            {profile.legalName} · {profile.district}
          </p>
          <p>
            Open-box eligibility is snapshotted per assignment from approved
            product, district, and rider settings; it is not a global checkbox.
          </p>
          {profile.reviewNote ? (
            <p>Staff review: {profile.reviewNote}</p>
          ) : null}
        </section>
      ) : null}
      {!profile || profile.status === 'rejected' ? (
        <RiderApplicationForm />
      ) : null}
      {profile?.status === 'approved' ? (
        <>
          <p>
            Only your current assignments are shown. Browser location sharing
            requires this page and device to remain active. Staff confirms
            handover and COD reports.
          </p>
          {finance ? (
            <section className="space-y-2 rounded-xl border p-4">
              <h2 className="font-semibold">Cash and simulated trip ledger</h2>
              <p>
                Cash held: NPR {(finance.heldPaisa / 100).toFixed(2)} · active
                uncollected COD exposure: NPR{' '}
                {(finance.assignedUncollectedPaisa / 100).toFixed(2)} · current
                limit:{' '}
                {finance.limitPaisa === null
                  ? 'not configured'
                  : `NPR ${(finance.limitPaisa / 100).toFixed(2)}`}
              </p>
              <p>
                Simulated earned trip compensation: NPR{' '}
                {(finance.simulatedCompensationEarnedPaisa / 100).toFixed(2)}.
                This never offsets customer cash or seller/maker balances.
              </p>
              {finance.hasOverdueRemittance ? (
                <p role="alert" className="text-destructive">
                  Remittance is overdue. Complete or safely return parcels
                  already held; new assignments remain restricted until finance
                  records receipt.
                </p>
              ) : null}
              {finance.obligations.map((obligation) => (
                <p
                  key={obligation.id}
                  className={obligation.overdue ? 'text-destructive' : ''}
                >
                  Remittance due{' '}
                  {new Date(obligation.dueAt).toLocaleString('en-NP', {
                    timeZone: 'Asia/Kathmandu',
                  })}{' '}
                  · outstanding NPR{' '}
                  {(obligation.outstandingPaisa / 100).toFixed(2)}
                </p>
              ))}
              <p className="text-xs text-muted-foreground">
                Receiving destination label: {finance.receivingAccountLabel}. No
                transfer occurs in this staging workflow.
              </p>
              {finance.remittanceJobs.map((job) => (
                <RiderRemittanceForm
                  key={job.jobId}
                  jobId={job.jobId}
                  orderNumber={job.orderNumber}
                  outstandingPaisa={job.outstandingPaisa}
                />
              ))}
            </section>
          ) : null}
          <h2 className="text-2xl font-semibold">
            Assigned parcels ({jobs.length})
          </h2>
          {!jobs.length ? <p>No active assignments.</p> : null}
          {jobs.map((job) => {
            let a: Partial<NepalAddress> = {};
            try {
              a = JSON.parse(job.addressJson) as NepalAddress;
            } catch {}
            const pending = reports.some(
              (r) => r.jobId === job.id && r.status === 'pending',
            );
            return (
              <article key={job.id} className="space-y-4 rounded-xl border p-5">
                <h3 className="text-xl font-semibold">
                  {job.orderNumber} · {job.status.replaceAll('_', ' ')}
                </h3>
                <p>
                  {a.recipientName} · {a.phone}
                </p>
                <p>
                  {a.locality}, {a.municipality}, {a.district} · Ward{' '}
                  {a.ward ?? '—'}
                </p>
                <p>{a.landmark}</p>
                {a.location ? (
                  <a
                    className="underline"
                    href={
                      'https://www.openstreetmap.org/?mlat=' +
                      a.location.latitude +
                      '&mlon=' +
                      a.location.longitude +
                      '#map=17/' +
                      a.location.latitude +
                      '/' +
                      a.location.longitude
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open destination map
                  </a>
                ) : (
                  <p>No map pin. Use the written address.</p>
                )}
                <RiderSharing
                  parcel
                  orderId={job.id}
                  dispatched={job.status === 'dispatched'}
                />
                {job.status === 'dispatched' &&
                !pending &&
                job.paymentMode !== 'cod' &&
                policy.otpScope === 'prepaid_only' ? (
                  <RiderCodeVerification
                    key={job.id + ':' + job.version}
                    jobId={job.id}
                    version={job.version}
                  />
                ) : null}
                {job.status === 'dispatched' && !pending ? (
                  <RiderReportForm
                    jobId={job.id}
                    version={job.version}
                    remaining={job.remaining}
                    openBoxRequired={job.openBoxRequired === 1}
                  />
                ) : pending ? (
                  <p>
                    Responsible person: operations staff review queue. Next
                    action: staff checks your pending report.
                  </p>
                ) : null}
                {reports
                  .filter((r) => r.jobId === job.id)
                  .map((r) => (
                    <div className="rounded-lg bg-muted p-3" key={r.id}>
                      <p>
                        {r.kind.replaceAll('_', ' ')} · {r.status}
                      </p>
                      <p>{r.note}</p>
                      {r.openBoxOutcome !== 'not_applicable' ? (
                        <p>
                          Open-box outcome:{' '}
                          {r.openBoxOutcome.replaceAll('_', ' ')}
                        </p>
                      ) : null}
                      {r.reviewNote ? (
                        <p>Next action / review: {r.reviewNote}</p>
                      ) : null}
                      {r.status === 'rejected' ? (
                        <p>
                          Responsible person: you. Submit a replacement report
                          for this current assignment; the original remains
                          retained.
                        </p>
                      ) : null}
                      {r.mime ? (
                        <a
                          className="underline"
                          href={'/api/rider/media/' + r.id}
                        >
                          View private evidence
                        </a>
                      ) : null}
                    </div>
                  ))}
              </article>
            );
          })}
          <section>
            <h2 className="text-xl font-semibold">Recent report history</h2>
            {reports.map((r) => (
              <p key={r.id}>
                {r.orderNumber}: {r.kind.replaceAll('_', ' ')} · {r.status}
              </p>
            ))}
          </section>
        </>
      ) : profile ? (
        <p>
          Assignment and private delivery access become available after Super
          Admin approval. Suspended riders cannot access delivery work.
        </p>
      ) : null}
    </main>
  );
}
