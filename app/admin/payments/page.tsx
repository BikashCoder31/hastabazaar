import {can} from '@/lib/marketplace/permissions';
import Link from 'next/link';
import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getManualPaymentWorkspace,readCourierCashWorkspace} from '@/lib/payments/manual-payment-workspace';
import {readBankTransferQueue} from '@/lib/payments/bank-transfer-queue';
import {ManualPaymentReview} from '@/components/admin/manual-payment-review';
import {CourierCashWorkspace} from '@/components/admin/cod-courier-cash';
import {notFound} from 'next/navigation';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import {ManualPaymentError} from '@/lib/payments/manual-receipts';
export const dynamic='force-dynamic';
export default async function PaymentsPage({searchParams}:{searchParams:Promise<{order?:string;parcel?:string;remittance?:string;returnTo?:string;view?:string;lane?:string}>}){
 const params=await searchParams;
 if(['order','parcel','remittance'].some(key=>{const value=params[key as keyof typeof params];return value!==undefined&&typeof value!=='string';})||params.remittance&&!params.parcel||params.parcel&&!params.order)notFound();
 const focus=params.parcel!==undefined?{parcelId:params.parcel,...params.remittance!==undefined?{remittanceId:params.remittance}:{}}:undefined;
 const courierView=params.order===undefined&&!focus&&params.view!=='incoming';
 const viewer=await requireStaffPage('/admin/payments',courierView?['payment.receipt.verify','cod.view']:'payment.receipt.verify');
 const db=requireDatabase(env as unknown as {DB?:D1Database}),returnTo=safeAdminReturnTo(params.returnTo);
 if(courierView){
  const currentHref=withAdminReturnTo('/admin/payments',returnTo);
  const superAdmin=viewer.role==='super_admin';
  const cash=await readCourierCashWorkspace(db,viewer.id);
  return <CourierCashWorkspace cash={cash} actorId={viewer.id} superAdmin={superAdmin}
   incomingHref={can(viewer,'payment.receipt.verify')?withAdminReturnTo('/admin/payments?view=incoming',currentHref):undefined}
   returnTo={params.returnTo?returnTo:undefined}
   payoutHref={can(viewer,'payout.prepare')?withAdminReturnTo('/admin/payments/payouts',currentHref):undefined}
   refundsHref={can(viewer,'refund.approve.standard')||can(viewer,'refund.view')?withAdminReturnTo('/admin/payments/refunds',currentHref):undefined}/>;
 }
 let workspace:Awaited<ReturnType<typeof getManualPaymentWorkspace>>;
 try{workspace=await getManualPaymentWorkspace(db,viewer.id,params.order??null,focus);}catch(error){if(error instanceof ManualPaymentError&&(error.status===400||error.status===404))notFound();throw error;}
 const queue=focus?undefined:await readBankTransferQueue(db,viewer.id,params.order);
 if(queue&&(params.view==='incoming'||queue.orders.length>0)){
  return <ManualPaymentReview workspace={workspace} actorId={viewer.id} superAdmin={viewer.role==='super_admin'}
   returnTo={returnTo} bankTransfer={queue} exact={params.order!==undefined} initialLane={params.lane} canRelease={can(viewer,'order.manage')}/>;
 }
 const query=new URLSearchParams();for(const key of ['order','parcel','remittance'] as const)if(params[key])query.set(key,params[key]!);
 if(params.view==='incoming')query.set('view','incoming');
 const currentHref=withAdminReturnTo('/admin/payments'+(query.size?'?'+query.toString():'')+(params.parcel?'#cod-parcel-'+encodeURIComponent(params.parcel):''),returnTo);
 return <><Link className="mb-4 block underline" href={returnTo}>Back to previous view</Link>{can(viewer,'payout.prepare')?<Link className="mb-4 block underline" href={withAdminReturnTo('/admin/payments/payouts',currentHref)}>Payout transfers</Link>:null}{can(viewer,'refund.approve.standard')?<Link className="mb-4 block underline" href={withAdminReturnTo('/admin/payments/refunds',currentHref)}>Refunds and funding</Link>:null}<ManualPaymentReview workspace={workspace} actorId={viewer.id} superAdmin={viewer.role==='super_admin'} returnTo={returnTo}/></>;
}
