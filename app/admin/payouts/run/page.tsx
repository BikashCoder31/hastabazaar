import { env } from 'cloudflare:workers';
import { AdminPageHelpProvider } from '@/components/admin/page-help';
import { adminNavigation } from '@/lib/admin/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { can } from '@/lib/marketplace/permissions';
import { readPayoutRun } from './run-data';
import { PayoutRunWorkspace } from './run-workspace';

export const dynamic = 'force-dynamic';

export default async function PayoutRunPage() {
  const pathname = '/admin/payouts/run';
  const staff = await requireStaffPage(pathname, 'payout.approve');
  const data = await readPayoutRun(requireDatabase(env as unknown as { DB?: D1Database }), staff.id);
  const procedureHref = adminNavigation(staff.role, staff.permissions)
    .find(item => item.href === '/admin/legal-policies/active')?.href;
  const help = {
    pathname,
    title: 'The ' + data.calendar.weekday + ' payout run',
    sentences: [
      'Payouts are ticked when their items were delivered, their delivery hold has passed, there are no open returns, and the bank account is verified.',
      'The current delivery hold is ' + data.holdDays + (data.holdDays === 1 ? ' day.' : ' days.') + ' Each payout uses the hold saved with its earnings.',
      'Untick any you want to hold. Anything with a problem is listed below and stays out of the run.',
    ],
    procedureHref,
  };
  return <AdminPageHelpProvider help={help}>
    <PayoutRunWorkspace {...data} actorId={staff.id} canViewTransfers={can(staff, 'payout.prepare')} />
  </AdminPageHelpProvider>;
}
