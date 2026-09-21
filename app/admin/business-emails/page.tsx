import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  businessEmailQueue,
  businessEmailQueueSummary,
} from '@/lib/operations/business-notifications';
import { BusinessEmailProcessor } from '@/components/admin/business-email-processor';
export const dynamic = 'force-dynamic';
export default async function BusinessEmails() {
  await requireStaffPage('/admin/business-emails', 'admin.invite');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [rows, summary] = await Promise.all([
    businessEmailQueue(database),
    businessEmailQueueSummary(database),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl">Business emails</h1>
      <p>
        Seller application and product-review updates are queued with the
        business action. Only the affected owner and authorized staff who need
        to act receive them.
      </p>
      <BusinessEmailProcessor />
      <section className="rounded-xl border p-4" aria-label="Business email queue attention">
        <h2 className="font-semibold">Operations queue attention</h2>
        <p className="mt-2">
          Pending: {summary.pending}. Due now: {summary.due}. Oldest pending:{' '}
          {summary.oldestAgeMinutes} minutes. Failed: {summary.failures}.
          Exhausted and needing review: {summary.exhausted}. Active sending
          leases: {summary.activeLeases}.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Delivery authorization emails are claimed first. Expired codes and
          obsolete or unauthorized messages are suppressed with a retained
          reason instead of being replayed.
        </p>
      </section>
      <p className="text-sm text-muted-foreground">
        Sending has a 15-minute lock. Failed attempts use bounded backoff, with
        at most five attempts. Mail server accepted does not
        confirm inbox placement or reading. A connection failure after mail
        acceptance may cause a duplicate on retry. Exhausted attempts require
        staff review; no automatic reset is performed.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="p-3 text-left">
            Latest 100 explicit business email records
          </caption>
          <thead>
            <tr>
              {['Update', 'Audience', 'Status', 'Attempts'].map((h) => (
                <th key={h} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.subject}</td>
                <td className="p-3">{r.audience}</td>
                <td className="p-3">{r.displayStatus}</td>
                <td className="p-3">{r.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
