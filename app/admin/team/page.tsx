import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {getTeamWorkspace} from '@/lib/operations/team-governance';
import {TeamWorkspace} from '@/components/admin/team-workspace';
import {StaffPermissionManager} from '@/components/admin/staff-permission-manager';
import {StaffInvitationManager} from '@/components/admin/staff-invitation-manager';
import {AccountRecoveryAssistance} from '@/components/admin/account-recovery-assistance';
import {listStaffMembers} from '@/lib/db/repositories/staff';
import {getStaffPermissionProfile,listStaffPermissionChanges} from '@/lib/db/repositories/staff-permissions';
import {listStaffAccessHistory} from '@/lib/db/repositories/staff-access-history';
import {teamReadFence} from '@/lib/operations/team-read-fence';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function TeamAccessPage(props?:{searchParams?:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await requireStaffPage('/admin/team'),db=requireDatabase(env as unknown as {DB?:D1Database});
 const query=await(props?.searchParams??Promise.resolve({} as Record<string,string|string[]|undefined>)),pageFence=await teamReadFence(db,actor.id),model=await getTeamWorkspace(db,actor.id);
 const returnTo=safeAdminReturnTo(query.returnTo);
 if(model.mode==='own')return <TeamWorkspace model={model} actorId={actor.id} returnTo={returnTo}/>;
 const [members,changes,history]=await Promise.all([listStaffMembers(db),listStaffPermissionChanges(db),listStaffAccessHistory(db,actor.id)]);
 const superIds=new Set(members.filter(member=>member.role==='super_admin').map(member=>member.id));
 const permissionMembers=await Promise.all(members.filter(member=>member.role==='admin'&&!superIds.has(member.id)).map(async member=>({...await getStaffPermissionProfile(db,member.id),displayName:member.displayName,email:member.email})));
 const peoplePanel=<section className="space-y-5"><h2 className="font-heading text-xl">Secure access controls and history</h2><p className="text-sm">Compare Added / Removed / Retained access before applying each person&apos;s change. Saved templates do not update everyone automatically. Role removal is separate from the buyer account and protected account security.</p><StaffPermissionManager actorId={actor.id} members={permissionMembers} {...changes} history={history} staffNames={Object.fromEntries(members.map(member=>[member.id,member.displayName]))}/><section className="space-y-3" aria-label="Assisted account recovery"><h3 className="font-semibold">Protected assisted account recovery</h3>{permissionMembers.filter(member=>member.userId!==actor.id).map(member=><AccountRecoveryAssistance key={member.userId} actorId={actor.id} targetId={member.userId} displayName={member.displayName} email={member.email} targetRole="admin"/>)}</section><h3 className="font-semibold">Create exact staff access</h3><StaffInvitationManager actorId={actor.id} pendingInvitations={model.invitations.filter(invite=>invite.status==='pending').map(invite=>({id:String(invite.id),email:String(invite.email)}))}/><p className="text-sm">Invitations expire after seven days. Delivery and verified-account acceptance are separate; unreviewed old pending access cannot activate a broad legacy grant.</p></section>;
 const value=(key:string)=>typeof query[key]==='string'?query[key] as string:undefined;
 const tab=['people','coverage','calendar','identity','policies'].includes(value('tab')??'')?value('tab'):'people';
 await pageFence();
 return <TeamWorkspace model={model} actorId={actor.id} tab={tab} peoplePanel={peoplePanel} returnTo={returnTo} filters={{department:value('department'),status:value('status'),permission:value('permission')}}/>;
}
