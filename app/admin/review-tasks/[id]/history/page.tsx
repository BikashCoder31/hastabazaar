import Link from 'next/link';
import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {reviewTaskAssignmentHistory,ReviewTaskConflict} from '@/lib/workflows/review-tasks';
import {sellerTaskTimestamp as sellerDate} from '@/lib/seller/task-presentation';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function AssignmentHistoryPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{returnTo?:string}>}){
 const{id}=await params,actor=await requireStaffPage('/admin/review-tasks/'+encodeURIComponent(id)+'/history','account.self.manage');
 let history;try{history=await reviewTaskAssignmentHistory(requireDatabase(env),actor.id,id);}catch(error){if(error instanceof ReviewTaskConflict)notFound();throw error;}
 return <main className="mx-auto max-w-4xl space-y-5"><Link className="section-link" href={safeAdminReturnTo((await searchParams)?.returnTo,'/admin#seller-review-queue')}>Back to permitted work</Link><h1 className="font-heading text-3xl">Work assignment history</h1><p className="text-sm">These records explain responsibility changes. They do not record a payment, approval, substantive review or completed incident repair.</p>{history.length?<ol className="space-y-3">{history.map(item=><li key={item.id} className="rounded-xl border p-4"><p className="font-medium">{item.system?'Automatic coverage reconciliation':'Authorized staff assignment'}</p><p className="text-sm">{sellerDate(item.occurredAt)} · Actor: {item.actorId??'System; no human action attributed'}</p><p className="text-sm">Previous owner: {item.previousOwnerId??'Unassigned'} · New owner: {item.ownerId??'Unassigned — eligible coverage needed'}</p><p>{item.reason}</p></li>)}</ol>:<p>No assignment change has been recorded for this retained task.</p>}</main>;
}
