import { AdminPageTitle } from '@/components/admin/page-help';
import {env} from 'cloudflare:workers';
import {redirect} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {can} from '@/lib/marketplace/permissions';
import {listReviewTasks} from '@/lib/workflows/review-tasks';
import {SharedReviewQueue} from '@/components/admin/shared-review-queue';
export const dynamic='force-dynamic';
export default async function ProductAssistanceQueue(){
 const staff=await requireStaffPage('/admin/products/intakes');if(!can(staff,'product.review')&&!can(staff,'support.manage'))redirect('/staff-access-denied');
 const tasks=(await listReviewTasks(requireDatabase(env as unknown as {DB?:D1Database}),staff.id)).filter(task=>task.sourceType.startsWith('product_intake_'));
 return <div className="space-y-6"><header><AdminPageTitle><h1 className="font-heading text-3xl">Intake and first reviews</h1></AdminPageTitle><p className="mt-2 text-muted-foreground">Incomplete information is retained under one case. Confirm actual facts with the owner; assistance does not publish a listing.</p></header><SharedReviewQueue tasks={tasks} actorId={staff.id}/></div>;
}
