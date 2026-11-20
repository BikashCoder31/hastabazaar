import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {FEE_PROGRAM_VIEWS,readFeeProgramWorkspace} from '@/lib/admin/fee-program-workspace';
import {FeeProgramWorkspaceView,type FeeProgramStatus} from '@/components/admin/fee-program-workspace';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function FeeProgramPage({searchParams=Promise.resolve({})}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}={}){
 const actor=await requireStaffPage('/admin/fees','commercial_policy.manage');
 const query=await searchParams,view=FEE_PROGRAM_VIEWS.find(v=>v.id===(query.view??'overview'))?.id,status=query.status??'all';
 if(!view||typeof status!=='string'||!['all','current','upcoming','draft','paused','ended','unknown','source'].includes(status))notFound();
 if(query.cohortAfter!==undefined&&(typeof query.cohortAfter!=='string'||!query.cohortAfter||query.cohortAfter.length>191))notFound();
 const workspace=await readFeeProgramWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),{id:actor.id,authSubject:actor.authSubject},{cohortAfter:query.cohortAfter,cohortRoute:view==='programs'?'managed_maker':undefined});
 return <FeeProgramWorkspaceView actorId={actor.id} workspace={workspace} view={view} status={status as FeeProgramStatus} cohortAfter={query.cohortAfter} returnTo={safeAdminReturnTo(query.returnTo)}/>;
}
