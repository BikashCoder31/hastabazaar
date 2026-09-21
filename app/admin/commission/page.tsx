import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { CommissionSettings } from '@/components/admin/commission-settings';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getCommissionSetting } from '@/lib/db/repositories/marketplace-settings';

export const dynamic = 'force-dynamic';

export default async function CommissionPage() {
  await requireStaffPage('/admin/commission', 'commercial_policy.manage');
  const setting = await getCommissionSetting(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Commercial policy</p>
        <h1 className="section-title">Marketplace commission</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          The policy-bound current rate is {setting.percent}% for new order items.
          Historical orders, refunds, invoices, commissions, and settlements
          keep their stored snapshots.
        </p>
        {setting.updatedAt ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated{' '}
            {new Date(setting.updatedAt).toLocaleString('en-NP', {
              timeZone: 'Asia/Kathmandu',
            })}
            {setting.updatedByName ? ` by ${setting.updatedByName}` : ''}.
          </p>
        ) : null}
      </div>
      <CommissionSettings percent={setting.percent} />
      <div className="max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 dark:bg-amber-950/20">
        <p className="font-semibold">One authoritative configuration source</p>
        <p className="mt-2">
          Rate changes are created, reviewed, future-dated, and audited in
          Business Settings. This page no longer provides a second editor.
        </p>
        <Link
          href="/admin/business-settings"
          className="mt-3 inline-flex font-semibold text-primary underline"
        >
          Open controlled Business Settings
        </Link>
      </div>
    </div>
  );
}
