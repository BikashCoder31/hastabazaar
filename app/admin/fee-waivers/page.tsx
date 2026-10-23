import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getAuthorizedCustomerFeeWaiverState } from '@/lib/db/repositories/customer-fee-waivers';
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
  const identity = { actorId: actor.id, authSubject: actor.authSubject };
  const [customerState, legacyHistory] = await Promise.all([
    getAuthorizedCustomerFeeWaiverState(db, identity),
    getAuthorizedFeeWaiverState(db, identity),
  ]);
  const initialState = { feeTarget: 'customer_service_fee' as const, ...presentFeeWaiverState(customerState, campaignControlsObservedAt()) };
  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <p className="eyebrow">Super Admin · Controls</p>
        <h1 className="section-title">Customer service fee waivers</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Automatically waive the whole positive customer service fee once per order
          during a published campaign. Overlapping campaigns do not stack. Seller
          commission and Managed Maker commercial terms still apply.
        </p>
      </div>
      <FeeWaiverManager initialState={initialState} legacyHistory={legacyHistory} />
    </div>
  );
}
