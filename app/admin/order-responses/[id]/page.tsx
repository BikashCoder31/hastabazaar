import { AdminPageTitle } from '@/components/admin/page-help';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
import {requireStaffPage} from '@/lib/auth/staff';
import {env} from 'cloudflare:workers';
import {ReviewBackLink} from '@/components/admin/review-back-link';
import {notFound} from 'next/navigation';
import {requireDatabase} from '@/lib/db/d1';
import {readPreparationWorkspace} from '@/lib/orders/response-workspace';
import {OrderPreparationWorkspace} from '@/components/commerce/order-preparation-workspace';
import {StaffReviewAccessBoundary} from '@/components/admin/staff-review-access-boundary';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function PreparationPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{returnTo?:string}>}){
 const {id}=await params,viewer=await requireStaffPage(`/admin/order-responses/${id}`,'order.manage');if(!viewer)notFound();
 const workspace=await readPreparationWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),viewer.id,id,'staff',{actorAuthSubject:viewer.authSubject});if(!workspace)notFound();
 const returnTo=safeAdminReturnTo((await searchParams)?.returnTo,`/admin/orders/${encodeURIComponent(workspace.orderId)}`);
 const problem=workspace.portions.flatMap(portion=>portion.cases).find(entry=>entry.id===id&&(entry.kind==='cannot_fulfill'||entry.kind==='delay'&&entry.proposedReadyAt!==null));
 return <div className="mx-auto max-w-4xl space-y-5 text-[#14213D]"><ReviewBackLink returnTo={returnTo} actorId={viewer.id}/><StaffReviewAccessBoundary actorId={viewer.id} sourceId={workspace.orderId}>
  <div className="space-y-5"><AdminPageTitle><h1 className="section-title">{problem?.kind==='delay'?'Seller delay':problem?'Seller can’t fulfil this order':'Order preparation'}</h1></AdminPageTitle>
   {problem?<section className="space-y-3 rounded-2xl border border-[#E4DACA] bg-white p-5 sm:p-6">
    <p className="font-mono text-sm text-[#46536F]">{workspace.orderNumber} · <span className="capitalize">{problem.state}</span></p>
    <OrderPreparationWorkspace workspace={workspace} problemCaseId={problem.id}/>
    <Link href={`/admin/order-responses/${encodeURIComponent(workspace.orderId)}`} className="section-link inline-flex min-h-11 items-center">Open full order preparation</Link>
   </section>:<OrderPreparationWorkspace workspace={workspace}/>}
  </div>
 </StaffReviewAccessBoundary></div>;
}
