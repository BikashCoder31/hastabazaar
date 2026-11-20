import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getTeamTaskDestination} from '@/lib/operations/team-task-destination';
import {TeamGovernanceConflict} from '@/lib/operations/team-governance';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function TeamTaskPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<Record<string,string|string[]|undefined>>}){
 const {id}=await params,query=await(searchParams??Promise.resolve({} as Record<string,string|string[]|undefined>)),actor=await requireStaffPage('/admin/team/tasks/'+encodeURIComponent(id),'account.self.manage');
 let destination:string;
 try{destination=(await getTeamTaskDestination(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,id)).href;}
 catch(error){if(error instanceof TeamGovernanceConflict)notFound();throw error;}
 redirect(query.returnTo===undefined?destination:withAdminReturnTo(destination,safeAdminReturnTo(query.returnTo,'/admin/team')));
}
