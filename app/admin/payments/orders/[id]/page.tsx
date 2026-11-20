import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getPaidManualReleaseReview,ManualPaymentError} from '@/lib/payments/manual-receipts';
import {PaidOrderRelease} from '@/components/admin/paid-order-release';
export const dynamic='force-dynamic';
export default async function PaymentOrderPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,viewer=await requireStaffPage('/admin/payments/orders/'+encodeURIComponent(id),'order.manage');
 const review=await getPaidManualReleaseReview(requireDatabase(env as unknown as {DB?:D1Database}),viewer.id,id).catch(error=>{
  if(error instanceof ManualPaymentError&&error.status===404)notFound();throw error;
 });
 return <PaidOrderRelease review={review} actorId={viewer.id}/>;
}
