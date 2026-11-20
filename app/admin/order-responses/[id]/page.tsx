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
export const dynamic='force-dynamic';
export default async function PreparationPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{returnTo?:string}>}){
 const {id}=await params,viewer=await requireStaffPage(`/admin/order-responses/${id}`,'order.manage');if(!viewer)notFound();
 const workspace=await readPreparationWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),viewer.id,id,'staff',{actorAuthSubject:viewer.authSubject});if(!workspace)notFound();
 const returnTo=safeAdminReturnTo((await searchParams)?.returnTo,`/admin/orders/${encodeURIComponent(workspace.orderId)}`);
 return <main className="mx-auto max-w-4xl space-y-5 p-6"><ReviewBackLink returnTo={returnTo} actorId={viewer.id}/><StaffReviewAccessBoundary actorId={viewer.id} sourceId={workspace.orderId}><div className="space-y-5"><AdminPageTitle><h1 className="section-title">Order preparation</h1></AdminPageTitle><OrderPreparationWorkspace workspace={workspace}/></div></StaffReviewAccessBoundary></main>;
}
