import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getReferralCampaign } from '@/lib/db/repositories/wallet';
import { ReferralSettings } from '@/components/admin/referral-settings';

export const dynamic = 'force-dynamic';
const money = (p: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    p / 100,
  );
export default async function ReferralAdmin() {
  const staff = await requireStaffPage('/admin/referrals');
  if (staff.role !== 'super_admin')
    return <p>Only the Super Admin can manage referral offers.</p>;
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [campaign, totals, redemptions] = await Promise.all([
    getReferralCampaign(db),
    db
      .prepare(
        'SELECT COALESCE(SUM(balance_paisa),0) AS balance FROM wallet_accounts',
      )
      .first<{ balance: number }>(),
    db
      .prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(r.reward_paisa),0) AS promised,
   COALESCE(SUM(o.referral_discount_paisa),0) AS discounts FROM referral_redemptions r INNER JOIN orders o ON o.id=r.order_id WHERE o.status<>'cancelled'`)
      .first<{ count: number; promised: number; discounts: number }>(),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Customer loyalty</p>
        <h1 className="mt-3 font-heading text-4xl">
          Referrals & shopping credit
        </h1>
        <p className="mt-3 text-muted-foreground">
          Cash on delivery remains the payment method. No deposits, withdrawals,
          or manual balance top-ups.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Outstanding shopping credit', money(totals?.balance || 0)],
          ['Accepted referral orders', String(redemptions?.count || 0)],
          [
            'Discounts + potential rewards',
            money((redemptions?.discounts || 0) + (redemptions?.promised || 0)),
          ],
        ].map(([label, value]) => (
          <div className="rounded-2xl border bg-card p-5" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="font-heading text-2xl">Offer settings</h2>
        <ReferralSettings campaign={campaign} />
      </section>
    </div>
  );
}
