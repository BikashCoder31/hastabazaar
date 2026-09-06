import { env } from 'cloudflare:workers';
import { PrivacyActions } from '@/components/admin/privacy-actions';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listDataRightsRequests } from '@/lib/db/repositories/operations';
export const dynamic = 'force-dynamic';
export default async function AdminPrivacyPage() {
  const staff = await requireStaffPage('/admin/privacy', 'support.manage');
  const rows = await listDataRightsRequests(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Compliance operations</p>
        <h1 className="section-title">Data-rights requests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admins investigate and assign. A Super Admin must approve, reject, or
          complete every request.
        </p>
      </div>
      {rows.length ? (
        rows.map((row) => (
          <article key={row.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <strong>{row.referenceNumber}</strong>
                <p className="text-sm">
                  {row.customerName} · {row.customerEmail}
                </p>
              </div>
              <span className="capitalize">
                {row.status.replaceAll('_', ' ')}
              </span>
            </div>
            <p className="mt-3 text-sm capitalize">
              {row.requestType.replaceAll('_', ' ')}
            </p>
            <p className="text-sm text-muted-foreground">{row.detail}</p>
            <PrivacyActions
              id={row.id}
              canDecide={staff.role === 'super_admin'}
            />
          </article>
        ))
      ) : (
        <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          No requests.
        </p>
      )}
    </div>
  );
}
