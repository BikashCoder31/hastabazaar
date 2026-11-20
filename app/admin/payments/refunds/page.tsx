import {notFound} from 'next/navigation';
import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getRefundFinanceWorkspace,resolveReceiptReturnFinanceNotice} from '@/lib/payments/refund-workspace';
import {RefundFundingReview,type RefundFinanceQuery} from '@/components/admin/refund-funding-review';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
import {RefundObligationError} from '@/lib/payments/refund-obligations';
import {can} from '@/lib/marketplace/permissions';
export const dynamic='force-dynamic';
export default async function RefundFinancePage({searchParams}:{searchParams:Promise<RefundFinanceQuery&{returnTo?:string}>}){
 const actor=await requireStaffPage('/admin/payments/refunds','refund.approve.standard'),query=await searchParams,db=requireDatabase(env as unknown as {DB?:D1Database});
 let obligationId=query.obligation;
 if(query.returnLoss||query.returnSatisfaction){
  if(query.returnLoss&&query.returnSatisfaction||query.obligation)notFound();
  const sourceId=query.returnLoss??query.returnSatisfaction!;
  obligationId=await resolveReceiptReturnFinanceNotice(db,actor.id,query.returnLoss?'loss':'satisfaction',sourceId)??undefined;
  if(!obligationId)notFound();
 }
 if(query.pageSize!==undefined&&(typeof query.pageSize!=='string'||!/^\d{1,3}$/.test(query.pageSize)))notFound();
 let workspace:Awaited<ReturnType<typeof getRefundFinanceWorkspace>>;
 try{workspace=await getRefundFinanceWorkspace(db,actor.id,query.case,obligationId,{search:query.search,cursor:query.cursor,sourceCursor:query.sourceCursor,limit:query.pageSize===undefined?undefined:Number(query.pageSize)});}catch(error){if(error instanceof RefundObligationError&&error.status===400)notFound();throw error;}
 return <RefundFundingReview workspace={workspace} actorId={actor.id} query={query}
  returnTo={query.returnTo===undefined?undefined:safeAdminReturnTo(query.returnTo)}
  canReviewRecoveries={can(actor,'payout.prepare')} canOpenOrder={can(actor,'order.manage')}
  canVerifyIncoming={can(actor,'payment.receipt.verify')}/>;
}
