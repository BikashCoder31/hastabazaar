import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { requireAuthenticatedUser } from '@/app/auth';
import {
  CustomerAuthorizationError,
  requireExistingCustomerApi,
  type CustomerUser,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getRewards } from '@/lib/db/repositories/loyalty';
import { RewardsPanel } from '@/components/account/rewards-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My Rewards | HastaBazaar' };

// The server request clock is used only by the read-only repository projection.
function readRewards(database: D1Database, customer: CustomerUser) {
  return getRewards(
    database,
    customer.userId,
    Date.now(),
    undefined,
    undefined,
    customer.authSubject,
  );
}

export default async function RewardsPage() {
  await requireAuthenticatedUser('/account/rewards');
  let customer;
  try {
    customer = await requireExistingCustomerApi();
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      redirect('/account-access-denied');
    throw error;
  }
  const rewards = await readRewards(
    requireDatabase(env as unknown as { DB?: D1Database }),
    customer,
  );
  return (
    <RewardsPanel
      key={customer.authSubject}
      subjectId={customer.authSubject}
      initialRewards={rewards}
    />
  );
}
