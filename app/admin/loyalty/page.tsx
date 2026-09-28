import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getLoyaltyState } from '@/lib/db/repositories/loyalty';
import { LoyaltyManager } from '@/components/admin/loyalty-manager';

export const dynamic = 'force-dynamic';
const loyaltyObservedAt = () => Date.now();
export default async function LoyaltyPage() {
  const actor = await requireStaffPage('/admin/loyalty', 'admin.invite');
  if (actor.role !== 'super_admin') redirect('/staff-access-denied');
  const initialState = await getLoyaltyState(
    requireDatabase(env as unknown as { DB?: D1Database }),
    actor.id,
    loyaltyObservedAt(),
    actor.authSubject,
  );
  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <p className="eyebrow">Super Admin · Controls</p>
        <h1 className="section-title">Daily loyalty points</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Manage platform-funded daily earning with finite dates and point
          budgets. Review cumulative issuance, redeemed credit and outstanding
          exposure before saving and publishing terms.
        </p>
      </div>
      <LoyaltyManager
        role={actor.role}
        ownerId={actor.id}
        initialState={initialState}
      />
    </div>
  );
}
