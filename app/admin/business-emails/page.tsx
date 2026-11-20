import { AdminPageTitle } from '@/components/admin/page-help';
import Link from 'next/link';
import type { DeliveryMailService } from '@/lib/email/delivery-attempts';
import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { readBusinessEmailPageEvidence } from '@/lib/operations/business-email-page';
import { BusinessEmailProcessor } from '@/components/admin/business-email-processor';
import { EmailDeliveryHealth } from '@/components/admin/email-delivery-health';
export const dynamic = 'force-dynamic';
export default async function BusinessEmails() {
  const actor = await requireStaffPage(
    '/admin/business-emails',
    'email.delivery.manage',
  );
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const { rows, summary, overview } = await readBusinessEmailPageEvidence(database, actor.id, {
    ...env, NODE_ENV: process.env.NODE_ENV,
    EMAIL: (env as unknown as { EMAIL?: DeliveryMailService }).EMAIL,
  });
  return (
    <div className="space-y-6">
      <AdminPageTitle><h1 className="font-heading text-3xl">Email delivery</h1></AdminPageTitle>
      <p>
        Automatic sending and due reminders use the shared saved notification
        work. Delivery failures do not undo completed business actions.
      </p>
      <EmailDeliveryHealth overview={overview} />
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">
          Recovery tools
        </summary>
        <p className="my-3 text-sm">
          Optional exceptional processing respects current claims, provider
          backoff, authorization and uncertain outcomes. It is not required to
          restart normal automatic sending.
        </p>
        <BusinessEmailProcessor />
      </details>
      <section
        className="rounded-xl border p-4"
        aria-label="Business email queue attention"
      >
        <h2 className="font-semibold">Operations queue attention</h2>
        <p className="mt-2">
          Pending: {summary.pending}. Due now: {summary.due}. Oldest pending:{' '}
          {summary.oldestAgeMinutes} minutes. Failed: {summary.failures}. Needs
          intervention: {summary.intervention}. Outcome uncertain:{' '}
          {summary.uncertain}. Active sending leases: {summary.activeLeases}.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Delivery authorization emails are claimed first. Expired codes and
          obsolete or unauthorized messages are suppressed with a retained
          reason instead of being replayed.
        </p>
      </section>
      <p className="text-sm text-muted-foreground">
        Temporary failures retry after 5, 10, 20, 40 and 60 minutes, then hourly
        while still relevant. Attempts remain cumulative. Recipient or setup
        faults need correction; uncertain outcomes require reconciliation and
        are never blindly resent. Sent to mail service confirms provider
        acceptance, not inbox delivery or reading.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="p-3 text-left">
            Latest 100 explicit business email records
          </caption>
          <thead>
            <tr>
              {[
                'Update',
                'Audience / masked recipient',
                'Status',
                'Attempts',
                'Next eligible attempt',
              ].map((h) => (
                <th key={h} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  <p>{r.subject}</p>
                  {r.sourceReference ? (
                    <Link
                      className="mt-1 inline-flex min-h-9 items-center underline"
                      href={r.sourceReference}
                    >
                      Open authorized source
                    </Link>
                  ) : null}
                </td>
                <td className="p-3">
                  <p>{r.audience}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.maskedRecipient ?? 'No eligible recipient recorded'}
                  </p>
                </td>
                <td className="p-3">
                  <p>{r.displayStatus}</p>
                  {r.failureCategory ? (
                    <p className="mt-1 text-xs">
                      {r.failureCategory === 'permanent_recipient'
                        ? 'Correct the verified recipient through the source account.'
                        : r.failureCategory === 'configuration'
                          ? 'An authorized operator must correct email setup.'
                          : r.failureCategory === 'unknown'
                            ? 'Reconcile provider evidence before another send.'
                            : 'Temporary failure; automatic backoff applies.'}
                    </p>
                  ) : null}
                </td>
                <td className="p-3">{r.attempts}</td>
                <td className="p-3">
                  {[
                    'uncertain',
                    'intervention',
                    'accepted',
                    'captured',
                  ].includes(r.deliveryState)
                    ? 'No automatic resend'
                    : new Date(
                        Math.max(r.nextAt, r.leaseUntil, r.createdAt),
                      ).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
