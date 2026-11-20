import { AdminPageTitle } from '@/components/admin/page-help';
import Link from 'next/link';
import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getFeeTermsWorkspace} from '@/lib/commission/terms-followup';
import {listReviewTasks} from '@/lib/workflows/review-tasks';
import {FeeTermsFollowup} from '@/components/admin/fee-terms-followup';
import {SharedReviewQueue} from '@/components/admin/shared-review-queue';
import {ReviewBackLink} from '@/components/admin/review-back-link';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function FeeTermsFollowupPage({searchParams}:{searchParams?:Promise<{returnTo?:string}>}={}){
 const actor=await requireStaffPage('/admin/commission/terms','seller.application.review'),db=requireDatabase(env as unknown as {DB?:D1Database}),back=safeAdminReturnTo((await searchParams)?.returnTo),[cases,tasks,owners]=await Promise.all([getFeeTermsWorkspace(db,actor.id),listReviewTasks(db,actor.id),db.prepare("SELECT DISTINCT u.id,u.display_name AS name FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin') ORDER BY u.display_name,u.id").all<{id:string;name:string}>()]);
 return <div className="space-y-6"><ReviewBackLink actorId={actor.id} returnTo={back}/><AdminPageTitle><h1 className="section-title">Selling fee follow-up</h1></AdminPageTitle><Link href={withAdminReturnTo('/admin/commission',withAdminReturnTo('/admin/commission/terms',back))} className="section-link">Fee policy and original earnings</Link><SharedReviewQueue tasks={tasks.filter(task=>task.sourceType==='commission_terms')} actorId={actor.id}/><FeeTermsFollowup key={actor.id} actorId={actor.id} cases={cases} superAdmin={actor.role==='super_admin'} technicalOwners={owners.results}/></div>;
}
