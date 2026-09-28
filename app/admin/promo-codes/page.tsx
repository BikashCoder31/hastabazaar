import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listPromoCampaigns } from '@/lib/db/repositories/promo-codes';
import { PromoCodeManager } from '@/components/admin/promo-code-manager';

export const dynamic = 'force-dynamic';
export default async function PromoCodesPage() {
  const staff = await requireStaffPage('/admin/promo-codes', 'admin.invite');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const initialPage = await listPromoCampaigns(
    requireDatabase(env as unknown as { DB?: D1Database }),
    { actorId: staff.id },
  );
  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <p className="eyebrow">Super Admin · Controls</p>
        <h1 className="section-title">Promo codes</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Manage platform-funded customer discounts with finite dates, usage and
          budgets. Draft, publish and pause independently. Featured product
          promotions are managed in Homepage products.
        </p>
      </div>
      <PromoCodeManager role={staff.role} initialPage={initialPage} />
    </div>
  );
}
