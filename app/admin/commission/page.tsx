import { env } from 'cloudflare:workers';
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
    </div>
  );
}
