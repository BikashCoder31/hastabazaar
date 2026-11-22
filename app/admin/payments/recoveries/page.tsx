import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getRecoveryFinanceWorkspace} from '@/lib/payments/recovery-workspace';
import {SellerRecoveryReview} from '@/components/admin/seller-recovery-review';
import {can} from '@/lib/marketplace/permissions';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function RecoveryQueuePage({searchParams}:{searchParams?:Promise<{returnTo?:string}>}={}){
 const actor=await requireStaffPage('/admin/payments/recoveries',['payout.prepare','refund.view']);
 const query=await searchParams;
 return <SellerRecoveryReview actorId={actor.id} workspace={await getRecoveryFinanceWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),actor.id)}
  returnTo={query?.returnTo===undefined?undefined:safeAdminReturnTo(query.returnTo)}
  canManageRecoveries={can(actor,'payout.prepare')}
  canReviewRefunds={can(actor,'refund.approve.standard')||can(actor,'refund.view')} canOpenOrder={can(actor,'order.manage')}
  canVerifyIncoming={can(actor,'payment.receipt.verify')}/>;
}
