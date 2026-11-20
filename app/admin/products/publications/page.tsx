import { AdminPageTitle } from '@/components/admin/page-help';
import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {listReviewTasks} from '@/lib/workflows/review-tasks';
import {SharedReviewQueue} from '@/components/admin/shared-review-queue';
export const dynamic='force-dynamic';
export default async function ProductPublicationQueue(){
 const actor=await requireStaffPage('/admin/products/publications','product.publish'),tasks=(await listReviewTasks(requireDatabase(env as unknown as {DB?:D1Database}),actor.id)).filter(task=>task.sourceType==='product_intake_review'&&['ready_for_decision','resolved'].includes(task.sourceStatus));
 return <div className="space-y-6"><header><AdminPageTitle><h1 className="font-heading text-3xl">Approved versions awaiting publication</h1></AdminPageTitle><p className="mt-2 text-muted-foreground">Publish the exact recorded approval after checking current permissions and evidence. The first-review record remains intact.</p></header><SharedReviewQueue tasks={tasks} actorId={actor.id}/></div>;
}
