import { env } from 'cloudflare:workers';
import { PrivacyRequestForm } from '@/components/account/privacy-request-form';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listDataRightsRequests } from '@/lib/db/repositories/operations';
export const dynamic = 'force-dynamic';
export default async function PrivacyPage() {
  const customer = await requireCustomerPage('/account/privacy');
  const rows = await listDataRightsRequests(
    requireDatabase(env as unknown as { DB?: D1Database }),
    customer.userId,
  );
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Privacy</p>
        <h1 className="section-title">Your data rights</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Deletion is reviewed against order, tax, fraud-prevention, and audit
          retention duties; immutable audit facts are not silently erased.
        </p>
      </div>
      <PrivacyRequestForm />
      <div className="space-y-3">
        <h2 className="font-heading text-2xl">Request history</h2>
        {rows.length ? (
          rows.map((row) => (
            <article key={row.id} className="rounded-2xl border bg-card p-5">
              <div className="flex justify-between gap-3">
                <strong>{row.referenceNumber}</strong>
                <span className="capitalize">
                  {row.status.replaceAll('_', ' ')}
                </span>
              </div>
              <p className="mt-2 text-sm capitalize">
                {row.requestType.replaceAll('_', ' ')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{row.detail}</p>
              {row.resolution ? (
                <p className="mt-2 text-sm">
                  <strong>Resolution:</strong> {row.resolution}
                </p>
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        )}
      </div>
    </div>
  );
}
