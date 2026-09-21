import Link from 'next/link';
import {emailQueueSummary} from '@/lib/operations/email-queue';
import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { orderProgress } from '@/lib/orders/progress';
import { OrderEmailRetry } from '@/components/admin/order-email-retry';

const emailStatusLabel: Record<string, string> = {
  queued: 'Queued',
  sending: 'Sending',
  retry: 'Retry waiting',
  sent: 'Mail server accepted',
  cancelled: 'Obsolete update suppressed',
};
const queueObservedAt = () => Date.now();
const emailTime = (value: number) => new Date(value).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' });

export const dynamic = 'force-dynamic';
export default async function OrderEmails() {
  await requireStaffPage('/admin/order-emails', 'order.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const now = queueObservedAt();
  const [jobs, counts, summary] = await Promise.all([
    db
      .prepare(`SELECT j.id,o.id AS orderId,j.lease_until AS leaseUntil,o.order_number AS orderNumber,j.order_status AS orderStatus,j.status,j.attempts,j.created_at AS createdAt,j.failure_code AS failureCode,j.next_attempt_at AS nextAttemptAt
      FROM order_email_jobs j INNER JOIN orders o ON o.id=j.order_id ORDER BY j.created_at DESC LIMIT 50`)
      .all<{
        id: string;
        orderId: string;
        leaseUntil: number;
        orderNumber: string;
        orderStatus: string;
        status: string;
        attempts: number;
        createdAt: number;
        failureCode: string | null;
        nextAttemptAt: number;
      }>(),
    db
      .prepare(
        'SELECT status,COUNT(*) AS count FROM order_email_jobs GROUP BY status',
      )
      .all<{ status: string; count: number }>(),
    emailQueueSummary(db),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Customer communication</p>
        <h1 className="mt-3 font-heading text-4xl">Order emails</h1>
        <p className="mt-3 text-muted-foreground">
          Emails are queued when an order changes. Sent means accepted by the
          mail server; inbox placement is not guaranteed.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {counts.results.map((row) => (
          <p key={row.status} className="rounded-xl border bg-card px-4 py-3">
            <span>{emailStatusLabel[row.status] ?? row.status}</span>:{' '}
            <strong>{row.count}</strong>
          </p>
        ))}
      </div>
      <section className="rounded-xl border p-4" aria-label="Email queue attention">
        <h2 className="font-semibold">Operations staff: queue attention</h2>
        <p className="mt-2">Oldest pending update: {summary.oldestAgeMinutes} minutes. Due now: {summary.due ?? 0}. Failed email attempts awaiting retry: {summary.failures ?? 0}. Exhausted messages needing review: {summary.exhausted ?? 0}. Expired sending locks: {summary.expiredLeases ?? 0}.</p>
        <p className="mt-2 text-sm text-muted-foreground">Check delays above 15 minutes and recurring failures. If the queue does not move, verify the scheduled sender and email settings. An expired lock means the previous sender did not finish recording a result; the email can be picked up by the next eligible attempt.</p>
      </section>
      <section className="rounded-xl border p-4" aria-label="Email status definitions">
        <h2 className="font-semibold">What each email status means</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div><dt className="font-semibold">Queued</dt><dd>Waiting for an eligible sender run.</dd></div>
          <div><dt className="font-semibold">Sending</dt><dd>A sender has claimed the email for up to 15 minutes. Wait while the lock is active.</dd></div>
          <div><dt className="font-semibold">Retry waiting</dt><dd>The last email attempt failed. It becomes eligible again after five minutes.</dd></div>
          <div><dt className="font-semibold">Mail server accepted</dt><dd>The mail server accepted the email. This does not confirm inbox placement or that the customer read it.</dd></div>
          <div><dt className="font-semibold">Obsolete update suppressed</dt><dd>The order moved to a newer state before this queued message was sent. The retained record explains why it was not replayed.</dd></div>
        </dl>
      </section>
      <OrderEmailRetry />
      <p className="text-sm text-muted-foreground">
        Retries become eligible after five minutes. Active email attempts have a
        15-minute lock. Orders are preserved if email delivery fails.
      </p>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-left text-sm">
          <caption className="p-4 text-left font-semibold">
            Latest 50 updates
          </caption>
          <thead>
            <tr>
              {['Order', 'Update', 'Email status', 'Attempts', 'Last failure', 'Next action / eligible time (Nepal)'].map((h) => (
                <th className="p-4" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.results.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="p-4 font-semibold"><Link className="underline underline-offset-4" href={`/admin/orders/${encodeURIComponent(j.orderId)}`}>{j.orderNumber}</Link></td>
                <td className="p-4">{orderProgress(j.orderStatus).label}</td>
                <td className="p-4">{emailStatusLabel[j.status] ?? j.status}</td>
                <td className="p-4">{j.attempts}</td>
                <td className="p-4">{j.failureCode === 'delivery_failed' ? 'Email attempt failed' : j.failureCode === 'obsolete_order_state' ? 'A newer order state made this message obsolete' : '—'}</td>
                <td className="p-4">{j.status === 'sent' || j.status === 'cancelled' ? 'No send action needed' : j.attempts >= 5 ? 'Automatic attempts exhausted; staff must review configuration or provider health' : j.status === 'sending' && j.leaseUntil > now ? 'Wait for active sender until ' + emailTime(j.leaseUntil) : Math.max(j.nextAttemptAt, j.leaseUntil) > now ? 'Eligible after ' + emailTime(Math.max(j.nextAttemptAt, j.leaseUntil)) : j.status === 'sending' ? 'Lock expired; eligible for another attempt' : 'Eligible for the next sender run'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!jobs.results.length ? (
          <p className="p-4 text-muted-foreground">
            New order updates will appear here.
          </p>
        ) : null}
      </div>
    </div>
  );
}
