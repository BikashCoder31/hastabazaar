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

const recordColumns = [
  { title: 'Update', width: 'w-[28%]' },
  { title: 'Audience / masked recipient', width: 'w-[21%]' },
  { title: 'Status', width: 'w-[24%]' },
  { title: 'Attempts', width: 'w-[11%]' },
  { title: 'Next eligible attempt', width: 'w-[16%]' },
];

export default async function BusinessEmails() {
  const actor = await requireStaffPage(
    '/admin/business-emails',
    'email.delivery.manage',
  );
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const { rows, summary, overview } = await readBusinessEmailPageEvidence(
    database,
    actor.id,
    {
      ...env,
      NODE_ENV: process.env.NODE_ENV,
      EMAIL: (env as unknown as { EMAIL?: DeliveryMailService }).EMAIL,
    },
  );
  const records = rows.map((row) => ({
    id: row.id,
    update: (
      <>
        <p className="font-medium">{row.subject}</p>
        {row.sourceReference ? (
          <Link
            className="section-link mt-1 underline"
            href={row.sourceReference}
          >
            Open authorized source
          </Link>
        ) : null}
      </>
    ),
    details: [
      <>
        <p>{row.audience}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.maskedRecipient ?? 'No eligible recipient recorded'}
        </p>
      </>,
      <>
        <p>{row.displayStatus}</p>
        {row.failureCategory ? (
          <p className="mt-1 text-xs">
            {row.failureCategory === 'permanent_recipient'
              ? 'Correct the verified recipient through the source account.'
              : row.failureCategory === 'configuration'
                ? 'An authorized operator must correct email setup.'
                : row.failureCategory === 'unknown'
                  ? 'Reconcile provider evidence before another send.'
                  : 'Temporary failure; automatic backoff applies.'}
          </p>
        ) : null}
      </>,
      row.attempts,
      ['uncertain', 'intervention', 'accepted', 'captured'].includes(
        row.deliveryState,
      )
        ? 'No automatic resend'
        : new Date(
            Math.max(row.nextAt, row.leaseUntil, row.createdAt),
          ).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' }),
    ],
  }));
  return (
    <div className="space-y-6">
      <AdminPageTitle>
        <h1 className="font-heading text-3xl">Email delivery</h1>
      </AdminPageTitle>
      <Link href="/admin/business-emails/preview" className="section-link min-h-11 underline underline-offset-4">
        Preview email templates
      </Link>
      <p>
        Automatic sending and due reminders use the shared saved notification
        work. Delivery failures do not undo completed business actions.
      </p>
      <EmailDeliveryHealth overview={overview} />
      <details className="rounded-xl border p-4">
        <summary className="min-h-11 content-center cursor-pointer font-semibold">
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
      <section aria-labelledby="business-email-records">
        <h2
          id="business-email-records"
          className="px-3 py-2 text-sm font-semibold"
        >
          Latest 100 explicit business email records
        </h2>
        <ul className="divide-y text-sm md:hidden">
          {records.map((record) => (
            <li key={record.id} className="space-y-3 px-3 py-4 wrap-anywhere">
              {record.update}
              <dl className="grid grid-cols-2 gap-3">
                {record.details.map((detail, index) => (
                  <div key={recordColumns[index + 1].title} className="min-w-0">
                    <dt className="font-medium text-muted-foreground">
                      {recordColumns[index + 1].title}
                    </dt>
                    <dd>{detail}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <table
          aria-labelledby="business-email-records"
          className="hidden w-full table-fixed text-left text-sm md:table"
        >
          <thead>
            <tr>
              {recordColumns.map((column) => (
                <th
                  key={column.title}
                  scope="col"
                  className={'wrap-anywhere p-3 ' + column.width}
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-t">
                <td className="wrap-anywhere p-3">{record.update}</td>
                {record.details.map((detail, index) => (
                  <td
                    key={recordColumns[index + 1].title}
                    className="wrap-anywhere p-3"
                  >
                    {detail}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
