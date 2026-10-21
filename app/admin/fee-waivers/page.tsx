import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getAuthorizedFeeWaiverState } from '@/lib/db/repositories/fee-waivers';
import { presentFeeWaiverState } from '@/lib/marketplace/fee-waiver-presentation';
import { FeeWaiverManager } from '@/components/admin/fee-waiver-manager';

export const dynamic = 'force-dynamic';
const campaignControlsObservedAt = () => Date.now();
export default async function FeeWaiversPage() {
  const actor = await requireStaffPage(
    '/admin/fee-waivers',
    'commercial_policy.manage',
  );
  if (actor.role !== 'super_admin') redirect('/staff-access-denied');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const initialState = presentFeeWaiverState(
    await getAuthorizedFeeWaiverState(db, {
      actorId: actor.id,
      authSubject: actor.authSubject,
    }),
    campaignControlsObservedAt(),
  );
  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <p className="eyebrow">Super Admin · Controls</p>
        <h1 className="section-title">Marketplace fee waivers</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Waive the full marketplace fee on eligible Registered Seller orders
          placed during a published campaign. Standard accepted commission terms
          stay recorded. Managed Maker commercial terms are separate.
        </p>
      </div>
      <FeeWaiverManager initialState={initialState} />
    </div>
  );
}
