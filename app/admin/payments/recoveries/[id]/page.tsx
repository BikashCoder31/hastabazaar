import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getRecoveryFinanceWorkspace} from '@/lib/payments/recovery-workspace';
import {SellerRecoveryReview} from '@/components/admin/seller-recovery-review';
import {can} from '@/lib/marketplace/permissions';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function RecoveryCasePage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{returnTo?:string}>}){
 const {id}=await params;
 const actor=await requireStaffPage('/admin/payments/recoveries/'+encodeURIComponent(id),'payout.prepare');
 const query=await searchParams;
 return <SellerRecoveryReview actorId={actor.id} workspace={await getRecoveryFinanceWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,id)}
  returnTo={query?.returnTo===undefined?undefined:safeAdminReturnTo(query.returnTo)}
  canReviewRefunds={can(actor,'refund.approve.standard')} canOpenOrder={can(actor,'order.manage')}
  canVerifyIncoming={can(actor,'payment.receipt.verify')}/>;
}
