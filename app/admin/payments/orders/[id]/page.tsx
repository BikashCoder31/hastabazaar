import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getPaidManualReleaseReview,ManualPaymentError} from '@/lib/payments/manual-receipts';
import {getManualPaymentWorkspace} from '@/lib/payments/manual-payment-workspace';
import {readBankTransferQueue} from '@/lib/payments/bank-transfer-queue';
import {PaidOrderRelease} from '@/components/admin/paid-order-release';
import {ManualPaymentReview} from '@/components/admin/manual-payment-review';
import {can} from '@/lib/marketplace/permissions';
export const dynamic='force-dynamic';
export default async function PaymentOrderPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,viewer=await requireStaffPage('/admin/payments/orders/'+encodeURIComponent(id),'order.manage');
 const db=requireDatabase(env as unknown as {DB?:D1Database});
 const review=await getPaidManualReleaseReview(db,viewer.id,id).catch(error=>{
  if(error instanceof ManualPaymentError&&error.status===404)notFound();throw error;
 });
 if(can(viewer,'payment.receipt.verify')){
  const [workspace,bankTransfer]=await Promise.all([getManualPaymentWorkspace(db,viewer.id,id),readBankTransferQueue(db,viewer.id,id)]);
  return <ManualPaymentReview workspace={workspace} bankTransfer={bankTransfer} actorId={viewer.id} superAdmin={viewer.role==='super_admin'}
   exact canRelease returnTo="/admin/payments?view=incoming"/>;
 }
 return <PaidOrderRelease review={review} actorId={viewer.id}/>;
}
