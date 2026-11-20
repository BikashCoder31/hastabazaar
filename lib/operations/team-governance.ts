import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';

import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {operationalBusinessNotificationStatements} from './business-notifications';
export {processTeamGovernanceDue,teamReviewSource} from './team-governance-tasks';

export class TeamGovernanceConflict extends Error{}
export class TeamGovernanceAccessConflict extends TeamGovernanceConflict{}
const beforeWriteFailures=new WeakSet<object>();
export function teamFailureBeforeWrite(error:unknown){return typeof error==='object'&&error!==null&&beforeWriteFailures.has(error);}
export const teamDutyCatalogue=[
 {id:'seller_operations',department:'Seller operations',label:'Application and readiness review',permission:'seller.application.review',reserved:false},
 {id:'products',department:'Products & storefront',label:'Product review',permission:'product.review',reserved:false},
 {id:'product_publication',department:'Products & storefront',label:'Product publication',permission:'product.publish',reserved:false},
 {id:'orders',department:'Orders & delivery',label:'Order follow-up',permission:'order.manage',reserved:false},
 {id:'customer_care',department:'Customer care',label:'Support and clarification',permission:'support.manage',reserved:false},
 {id:'return_entitlement',department:'Customer care',label:'Standard return entitlement',permission:'refund.approve.standard',reserved:false},
 {id:'finance_preparation',department:'Finance',label:'Financial packet preparation',permission:'payout.prepare',reserved:false},
 {id:'incoming_payment',department:'Finance',label:'Ordinary incoming receipt verification',permission:'payment.receipt.verify',reserved:false},
 {id:'finance_payout',department:'Finance',label:'Daily14:00 payout queue review',permission:'payout.prepare',reserved:false},
 {id:'finance_reconciliation',department:'Finance',label:'Daily18:00 reconciliation review',permission:'payout.prepare',reserved:false},
 {id:'finance_execution',department:'Finance',label:'Reserved outgoing payment stages',permission:'payout.approve',reserved:true},
 {id:'finance_exceptions',department:'Finance',label:'Reserved receipt exceptions and recovery',permission:'payment.receipt.verify',reserved:true},
 {id:'identity_bank',department:'Seller operations',label:'Reserved identity and bank review',permission:'seller.application.review',reserved:true},
 {id:'team_governance',department:'Policies & operations',label:'Staff access and coverage',permission:'admin.permissions.manage',reserved:true},
 {id:'policy_coordination',department:'Policies & operations',label:'Assigned policy and procedure coordination',permission:'account.self.manage',reserved:false},
 {id:'system_incidents',department:'Systems',label:'Scoped incident response',permission:'system.incidents.manage',reserved:false},
] as const;
function duty(id:string){const result=teamDutyCatalogue.find(value=>value.id===id);if(!result)throw new TeamGovernanceConflict('Choose a supported responsibility.');return result;}
export function teamGuard(db:D1Database,predicate:string,values:unknown[]=[]){const id=crypto.randomUUID();return [db.prepare('INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN '+predicate+' THEN 1 ELSE 0 END').bind(id,...values),db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(id)];}
function text(value:unknown,min=8,max=1000){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new TeamGovernanceConflict('Add a clear reason or next action.');return value.trim();}
function time(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0)throw new TeamGovernanceConflict('Choose a valid date and time.');return Number(value);}
export async function teamUserAvailable(db:D1Database,userId:string,now=Date.now()){return (await db.prepare('SELECT available FROM team_availability WHERE user_id=? AND starts_at<=? AND ends_at>? ORDER BY revision DESC LIMIT 1').bind(userId,now,now).first<{available:number}>())?.available!==0;}
export function teamAvailabilityGuards(db:D1Database,userId:string){const clock=checkoutCommitClock(db);return teamGuard(db,`COALESCE((SELECT available FROM team_availability WHERE user_id=? AND starts_at<=${clock} AND ends_at>${clock} ORDER BY revision DESC LIMIT 1),1)=1`,[userId]);}
async function eligible(db:D1Database,userId:string,id:string){const d=duty(id);try{return await staffMutationGuard(db,userId,d.permission,TeamGovernanceConflict,d.reserved?'super_admin':undefined);}catch(error){if(error instanceof TeamGovernanceConflict)return null;throw error;}}
type DutyRow={primaryId:string|null;revision:number};
/** Eligibility is not a business-case approval: review-task authority still excludes source parties. */
export async function readTeamDutyCoverage(db:D1Database,id:string,options:{now?:number}={}){
 const now=options.now??Date.now(),definition=duty(id),row=await db.prepare('SELECT primary_user_id AS primaryId,revision FROM team_duties WHERE id=?').bind(id).first<DutyRow>();
 const backups=(await db.prepare('SELECT user_id AS userId,position FROM team_duty_backups WHERE duty_id=? ORDER BY position,user_id').bind(id).all<{userId:string;position:number}>()).results;
 const handoff=await db.prepare("SELECT to_user_id AS userId,from_user_id AS fromUserId,id,revision FROM team_handoffs WHERE duty_id=? AND state='accepted' AND starts_at<=? AND ends_at>? ORDER BY created_at DESC,id DESC LIMIT 1").bind(id,now,now).first<{userId:string;fromUserId:string|null;id:string;revision:number}>();
 const pending=await db.prepare("SELECT id FROM team_handoffs WHERE duty_id=? AND state='pending' AND ends_at>? ORDER BY starts_at,id LIMIT 1").bind(id,now).first<{id:string}>();
 const candidates=[...(handoff?[handoff.userId]:[]),...(row?.primaryId?[row.primaryId]:[]),...backups.map(value=>value.userId)],seen=new Set<string>();
 const assessed:{userId:string;eligible:boolean;available:boolean}[]=[];let activeOwnerId:string|null=null;const guards:D1PreparedStatement[]=[];
 for(const userId of candidates){if(seen.has(userId))continue;seen.add(userId);const authority=await eligible(db,userId,id),isAvailable=await teamUserAvailable(db,userId,now);assessed.push({userId,eligible:!!authority,available:isAvailable});if(!activeOwnerId&&authority&&isAvailable){activeOwnerId=userId;guards.push(...authority.statements,...teamAvailabilityGuards(db,userId));}}
 const predicate=row?'EXISTS(SELECT 1 FROM team_duties WHERE id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM team_duties WHERE id=?)',values=row?[id,row.revision]:[id];
 guards.push(...teamGuard(db,predicate,values));
 const clock=checkoutCommitClock(db),activeHandoff="SELECT id FROM team_handoffs WHERE duty_id=? AND state='accepted' AND starts_at<="+clock+' AND ends_at>'+clock+' ORDER BY created_at DESC,id DESC LIMIT 1';
 guards.push(...teamGuard(db,handoff?'('+activeHandoff+')=? AND EXISTS(SELECT 1 FROM team_handoffs WHERE id=? AND revision=?)':'NOT EXISTS('+activeHandoff+')',handoff?[id,handoff.id,handoff.id,handoff.revision]:[id]));
 return {...definition,primaryId:row?.primaryId??null,revision:row?.revision??null,activeHandoff:handoff,backups:backups.map(value=>({...value,...assessed.find(candidate=>candidate.userId===value.userId)})),candidates:assessed,activeOwnerId,backupId:assessed.find(value=>value.userId!==activeOwnerId&&value.eligible&&value.available)?.userId??null,gaps:[...(!row?.primaryId?['No primary assigned']:[]),...(row?.primaryId&&!assessed.find(value=>value.userId===row.primaryId)?.eligible?['Primary no longer has this duty authority']:[]),...(!backups.length?['No backup assigned']:[]),...(pending?['Proposed handoff receipt is still pending']:[]),...(activeOwnerId&&activeOwnerId!==row?.primaryId&&handoff?.userId!==activeOwnerId?['Substitute receipt not confirmed']:[]),...(!activeOwnerId?['Unassigned — eligible coverage needed']:[])],predicate,values,guards};
}
export type TeamCommand={action:string;sourceId:string;reason:string;primaryId?:string|null;backupIds?:string[];startsAt?:number;endsAt?:number;available?:boolean;toUserId?:string;title?:string;body?:string;family?:string;userIds?:string[];nextAction?:string;permissions?:unknown};
export async function executeTeamGovernance(db:D1Database,ctx:CommandContext&{authSubject?:string},input:TeamCommand){
 let attemptedCommit=false;
 try{
 const personal=['accept_handoff','acknowledge_procedure','complete_policy_review','complete_checkpoint'].includes(input.action),authority=await staffMutationGuard(db,ctx.actorId,personal?'account.self.manage':'admin.permissions.manage',TeamGovernanceConflict,personal?undefined:'super_admin');
 const fence=await(await import('./team-read-fence')).teamReadFence(db,ctx.actorId,ctx.authSubject);
 const replay=async()=>{const result=await readTeamSavedOutcome(db,ctx.actorId,ctx.requestId,{action:input.action,sourceId:input.sourceId,authSubject:ctx.authSubject});await fence();if(!result)throw new TeamGovernanceConflict('The original Team outcome could not be confirmed.');return result;};
 const receipt=await commandReceipt(db,ctx,{action:'team.'+input.action,subjectType:'team_governance',subjectId:input.sourceId},input);if(receipt.replayed)return await replay();
 const reason=text(input.reason),statements=[...authority.statements,...fence.statements()];let id=input.sourceId,revision=0,formerOwnerId:string|null=null;
 if(input.action==='save_duty'){
  const definition=duty(id),backups=input.backupIds??[];if(backups.length>20||new Set(backups).size!==backups.length||input.primaryId&&backups.includes(input.primaryId))throw new TeamGovernanceConflict('Backups must be ordered distinct people, separate from the primary.');
  for(const userId of [...(input.primaryId?[input.primaryId]:[]),...backups]){const allowed=await eligible(db,userId,id);if(!allowed)throw new TeamGovernanceConflict('Choose actual staff with this duty permission and required reserved authority; a roster never grants access.');statements.push(...allowed.statements);}
  const row=await db.prepare('SELECT revision,primary_user_id AS primaryId FROM team_duties WHERE id=?').bind(id).first<{revision:number;primaryId:string|null}>();if(row?ctx.expectedRevision!==String(row.revision):ctx.expectedRevision!==null)throw new TeamGovernanceConflict('Coverage changed. Refresh and review its current version.');formerOwnerId=row?.primaryId&&row.primaryId!==input.primaryId?row.primaryId:null;
  revision=row?row.revision+1:0;
  statements.push(...teamGuard(db,row?'EXISTS(SELECT 1 FROM team_duties WHERE id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM team_duties WHERE id=?)',row?[id,row.revision]:[id]));
  if(row)statements.push(db.prepare('UPDATE team_duties SET primary_user_id=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?').bind(input.primaryId??null,ctx.now,ctx.actorId,id,row.revision));
  else statements.push(db.prepare('INSERT INTO team_duties(id,department,label,required_permission,reserved_super_admin,primary_user_id,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,definition.department,definition.label,definition.permission,definition.reserved?1:0,input.primaryId??null,ctx.now,ctx.actorId));
  statements.push(db.prepare('DELETE FROM team_duty_backups WHERE duty_id=?').bind(id),...backups.map((user,index)=>db.prepare('INSERT INTO team_duty_backups(duty_id,user_id,position) VALUES(?,?,?)').bind(id,user,index)));
 }else if(input.action==='availability'){
  const startsAt=time(input.startsAt),endsAt=time(input.endsAt);if(endsAt<=startsAt||typeof input.available!=='boolean')throw new TeamGovernanceConflict('Choose a bounded availability interval.');
  const head=await db.prepare('SELECT MAX(revision) AS revision FROM team_availability WHERE user_id=?').bind(id).first<{revision:number|null}>();if(head?.revision!==null&&head?.revision!==undefined?ctx.expectedRevision!==String(head.revision):ctx.expectedRevision!==null)throw new TeamGovernanceConflict('Availability changed. Review the latest recorded interval before correcting it.');
  revision=(head?.revision??-1)+1;statements.push(...teamGuard(db,'COALESCE((SELECT MAX(revision) FROM team_availability WHERE user_id=?),-1)=?',[id,head?.revision??-1]));
  statements.push(...teamGuard(db,"EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN('admin','super_admin'))",[id]));
  statements.push(db.prepare('INSERT INTO team_availability(id,user_id,starts_at,ends_at,available,reason,revision,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,startsAt,endsAt,input.available?1:0,reason,revision,ctx.actorId,ctx.now));
 }else if(input.action==='propose_handoff'){
  const coverage=await readTeamDutyCoverage(db,id,{now:ctx.now}),startsAt=time(input.startsAt),endsAt=time(input.endsAt);
  if(ctx.expectedRevision!==String(coverage.revision)||endsAt<=startsAt||!input.toUserId||input.toUserId===coverage.primaryId)throw new TeamGovernanceConflict('Choose a distinct eligible substitute and current coverage version.');
  const substitute=await eligible(db,input.toUserId,id);if(!substitute)throw new TeamGovernanceConflict('The proposed substitute lacks this duty authority.');
  statements.push(...coverage.guards,...substitute.statements,...teamGuard(db,"NOT EXISTS(SELECT 1 FROM team_handoffs WHERE duty_id=? AND state IN('pending','accepted') AND starts_at<? AND ends_at>?)",[input.sourceId,endsAt,startsAt]));id=crypto.randomUUID();
  statements.push(db.prepare("INSERT INTO team_handoffs(id,duty_id,from_user_id,to_user_id,starts_at,ends_at,state,actor_id,created_at) VALUES(?,?,?,?,?,?,'pending',?,?)").bind(id,input.sourceId,coverage.primaryId??(coverage.activeOwnerId===input.toUserId?null:coverage.activeOwnerId),input.toUserId,startsAt,endsAt,ctx.actorId,ctx.now));
 }else if(input.action==='accept_handoff'||input.action==='cancel_handoff'){
  const h=await db.prepare('SELECT duty_id AS dutyId,to_user_id AS toUserId,state,revision FROM team_handoffs WHERE id=?').bind(id).first<{dutyId:string;toUserId:string;state:string;revision:number}>();
  if(!h||ctx.expectedRevision!==String(h.revision)||(input.action==='accept_handoff'?h.state!=='pending'||h.toUserId!==ctx.actorId:!['pending','accepted'].includes(h.state)))throw new TeamGovernanceConflict('Only the current proposed substitute can accept; an authorized current handoff may be cancelled with its exact version.');
  if(input.action==='accept_handoff'){const substitute=await eligible(db,ctx.actorId,h.dutyId);if(!substitute||!await teamUserAvailable(db,ctx.actorId,ctx.now))throw new TeamGovernanceConflict('Current available duty authority is required.');statements.push(...substitute.statements,...teamAvailabilityGuards(db,ctx.actorId));}
  statements.push(...teamGuard(db,"EXISTS(SELECT 1 FROM team_handoffs WHERE id=? AND revision=? AND state=? AND ends_at>"+checkoutCommitClock(db)+')',[id,h.revision,h.state]));revision=h.revision+1;
  statements.push(db.prepare('UPDATE team_handoffs SET state=?,revision=revision+1,accepted_at=CASE WHEN ?=1 THEN COALESCE(accepted_at,?) ELSE accepted_at END WHERE id=? AND revision=?').bind(input.action==='accept_handoff'?'accepted':'cancelled',input.action==='accept_handoff'?1:0,ctx.now,id,h.revision));
 }else if(input.action==='publish_procedure'){
  duty(id);const title=text(input.title,5,160),body=text(input.body,30,20000),users=input.userIds??[];
  const head=await db.prepare('SELECT MAX(version) AS version FROM team_procedures WHERE family=?').bind(id).first<{version:number|null}>(),old=head?.version??0;
  if(old?ctx.expectedRevision!==String(old):ctx.expectedRevision!==null)throw new TeamGovernanceConflict('The procedure version changed. Review its current text.');
  statements.push(...teamGuard(db,'COALESCE((SELECT MAX(version) FROM team_procedures WHERE family=?),0)=?',[id,old]));
  statements.push(db.prepare('UPDATE team_procedures SET retired_at=? WHERE family=? AND retired_at IS NULL').bind(ctx.now,id));revision=old+1;id=crypto.randomUUID();
  statements.push(db.prepare('INSERT INTO team_procedures(id,family,version,title,body,owner_id,published_at) VALUES(?,?,?,?,?,?,?)').bind(id,input.sourceId,revision,title,body,ctx.actorId,ctx.now));
  for(const userId of new Set(users)){statements.push(...teamGuard(db,"EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN('admin','super_admin'))",[userId]));statements.push(db.prepare('INSERT INTO team_procedure_assignments(procedure_id,user_id,assigned_at) VALUES(?,?,?)').bind(id,userId,ctx.now));}
 }else if(input.action==='acknowledge_procedure'){
  const original=await db.prepare('SELECT native_source_id AS sourceId,native_source_sha256 AS sha FROM team_procedures WHERE id=?').bind(id).first<{sourceId:string|null;sha:string|null}>();
  if(original?.sourceId){const proof=await(await import('../legal-procedures/lifecycle')).getActiveLegalProcedureProof(db,ctx.now);if(!proof||proof.active.id!==original.sourceId||proof.active.document.sha256!==original.sha)throw new TeamGovernanceConflict('The native operating procedure changed or was withdrawn. Review the current version.');statements.push(...proof.guards);}
  const already=await db.prepare('SELECT acknowledged_at AS acknowledgedAt FROM team_procedure_assignments WHERE procedure_id=? AND user_id=?').bind(id,ctx.actorId).first<{acknowledgedAt:number|null}>();
  if(already?.acknowledgedAt!==null&&already?.acknowledgedAt!==undefined){const result={id,revision:0};attemptedCommit=true;await db.batch([...authority.statements,...fence.statements(),receipt.insert(result)]);await fence();return result;}
  statements.push(...teamGuard(db,'EXISTS(SELECT 1 FROM team_procedure_assignments a JOIN team_procedures p ON p.id=a.procedure_id WHERE a.procedure_id=? AND a.user_id=? AND p.retired_at IS NULL)',[id,ctx.actorId]));
  statements.push(db.prepare('UPDATE team_procedure_assignments SET acknowledged_at=COALESCE(acknowledged_at,?) WHERE procedure_id=? AND user_id=?').bind(ctx.now,id,ctx.actorId));
  statements.push(db.prepare("UPDATE team_governance_tasks SET state='completed',completed_at=?,revision=revision+1 WHERE kind='procedure_ack' AND source_id=? AND state='open'").bind(ctx.now,id+':'+ctx.actorId));
 }else if(input.action==='assign_native_procedure'){
  if(input.sourceId!=='native_operating_procedure')throw new TeamGovernanceConflict('Use the canonical operating procedure reference.');
  const proof=await(await import('../legal-procedures/lifecycle')).getActiveLegalProcedureProof(db,ctx.now);if(!proof)throw new TeamGovernanceConflict('The original operating procedure is not currently active. Use its protected approval and activation editor.');
  statements.push(...proof.guards);revision=proof.active.sequence;
  const existing=await db.prepare('SELECT id FROM team_procedures WHERE family=? AND version=?').bind('native_operating_procedure',revision).first<{id:string}>();id=existing?.id??crypto.randomUUID();
  if(!existing){statements.push(db.prepare("UPDATE team_procedures SET retired_at=? WHERE family='native_operating_procedure' AND retired_at IS NULL").bind(ctx.now),db.prepare("INSERT INTO team_procedures(id,family,version,title,body,owner_id,published_at,native_source_type,native_source_id,native_source_sha256) VALUES(?,'native_operating_procedure',?,'Company operating procedure','',?,?,'internal_legal_procedure',?,?)").bind(id,revision,ctx.actorId,ctx.now,proof.active.id,proof.active.document.sha256));}
  for(const userId of new Set(input.userIds??[])){statements.push(...teamGuard(db,"EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN('admin','super_admin'))",[userId]),db.prepare('INSERT OR IGNORE INTO team_procedure_assignments(procedure_id,user_id,assigned_at) VALUES(?,?,?)').bind(id,userId,ctx.now));}
 }else if(input.action==='complete_access_review'){
  const target=await db.prepare("SELECT COALESCE(p.version,0) AS version FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN('admin','super_admin') LIMIT 1").bind(id).first<{version:number}>();if(!target)throw new TeamGovernanceConflict('This account no longer has active staff work access.');
  if(ctx.expectedRevision!==String(target.version))throw new TeamGovernanceConflict('Review the current exact grant version before confirming its access review.');
  statements.push(...teamGuard(db,'COALESCE((SELECT version FROM staff_permission_profiles WHERE user_id=?),0)=?',[id,target.version]));
  statements.push(db.prepare('INSERT INTO team_access_reviews(id,user_id,grant_version,completed_at,reviewer_id,reason,request_id) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,target.version,ctx.now,ctx.actorId,reason,ctx.requestId),db.prepare("UPDATE team_governance_tasks SET state='completed',completed_at=?,revision=revision+1 WHERE kind='access_review' AND subject_user_id=? AND state='open'").bind(ctx.now,id));
 }else if(input.action==='complete_checkpoint'){
  const row=await db.prepare('SELECT duty_id AS dutyId,revision,due_at AS dueAt,completed_at AS completedAt FROM team_checkpoints WHERE id=?').bind(id).first<{dutyId:string;revision:number;dueAt:number;completedAt:number|null}>();if(!row||row.completedAt!==null||ctx.expectedRevision!==String(row.revision)||ctx.now<row.dueAt)throw new TeamGovernanceConflict('Refresh the current due appointment before recording its result.');
  const required=await eligible(db,ctx.actorId,row.dutyId);if(!required)throw new TeamGovernanceConflict('This appointment needs its actual eligible Finance authority.');statements.push(...required.statements,...teamGuard(db,'EXISTS(SELECT 1 FROM team_checkpoints WHERE id=? AND revision=? AND completed_at IS NULL AND due_at<='+checkoutCommitClock(db)+')',[id,row.revision]));revision=row.revision+1;
  const coverage=await readTeamDutyCoverage(db,row.dutyId,{now:ctx.now});if(authority.role!=='super_admin'&&coverage.activeOwnerId!==ctx.actorId&&coverage.backupId!==ctx.actorId)throw new TeamGovernanceConflict('Use the actual current appointment owner, eligible backup or Super Admin.');statements.push(...coverage.guards);
  statements.push(db.prepare('UPDATE team_checkpoints SET completed_at=?,completed_by=?,next_action=?,revision=revision+1 WHERE id=? AND revision=?').bind(ctx.now,ctx.actorId,text(input.nextAction),id,row.revision),db.prepare("UPDATE team_governance_tasks SET state='completed',completed_at=?,revision=revision+1 WHERE kind='checkpoint' AND source_id=? AND state='open'").bind(ctx.now,id));
 }else if(input.action==='review_invitation_grant'){
  const permissions=(await import('../marketplace/permissions')).validateAdminPermissions(input.permissions);
  statements.push(...teamGuard(db,"EXISTS(SELECT 1 FROM staff_invitations WHERE id=? AND role='admin' AND status='pending' AND expires_at>"+checkoutCommitClock(db)+')',[id]));
  const saved=await db.prepare('SELECT grant_version AS version FROM staff_invitation_grants WHERE invitation_id=?').bind(id).first<{version:number}>();if(saved?ctx.expectedRevision!==String(saved.version):ctx.expectedRevision!==null)throw new TeamGovernanceConflict('Refresh the exact pending invitation access selection.');
  statements.push(...teamGuard(db,saved?'EXISTS(SELECT 1 FROM staff_invitation_grants WHERE invitation_id=? AND grant_version=?)':'NOT EXISTS(SELECT 1 FROM staff_invitation_grants WHERE invitation_id=?)',saved?[id,saved.version]:[id]));revision=(saved?.version??0)+1;
  statements.push(db.prepare('INSERT INTO staff_invitation_grants(invitation_id,permissions_json,grant_version,created_by,created_at) VALUES(?,?,?,?,?) ON CONFLICT(invitation_id) DO UPDATE SET permissions_json=excluded.permissions_json,grant_version=excluded.grant_version,created_by=excluded.created_by,created_at=excluded.created_at').bind(id,JSON.stringify(permissions),revision,ctx.actorId,ctx.now));
 }else if(input.action==='schedule_policy_review'){
  const dueAt=time(input.endsAt);if(dueAt<=ctx.now||!input.toUserId)throw new TeamGovernanceConflict('Choose the actual coordinator and explicit future review deadline.');
  statements.push(...(await staffMutationGuard(db,input.toUserId,'account.self.manage',TeamGovernanceConflict)).statements);
  let reference:Record<string,unknown>;
  if(input.sourceId==='service_calendar')reference={type:'service_calendar',version:'continuous-v1'};
  else if(input.sourceId.startsWith('setting:')){const row=await db.prepare('SELECT id,setting_key AS key,version,revision,status FROM business_setting_versions WHERE id=?').bind(input.sourceId.slice(8)).first<{id:string;key:string;version:number;revision:number;status:string}>();if(!row)throw new TeamGovernanceConflict('Select the exact original native setting version.');reference={type:'business_setting',...row};statements.push(...teamGuard(db,'EXISTS(SELECT 1 FROM business_setting_versions WHERE id=? AND revision=? AND status=?)',[row.id,row.revision,row.status]));}
  else if(input.sourceId==='native_operating_procedure'){const proof=await(await import('../legal-procedures/lifecycle')).getActiveLegalProcedureProof(db,ctx.now);if(!proof)throw new TeamGovernanceConflict('Only an actually active native procedure can be assigned for this current review.');reference={type:'internal_legal_procedure',id:proof.active.id,sha256:proof.active.document.sha256};statements.push(...proof.guards);}
  else throw new TeamGovernanceConflict('Choose the actual native policy version or approved current calendar.');
  id=crypto.randomUUID();statements.push(db.prepare("INSERT INTO team_governance_tasks(id,kind,source_id,duty_id,subject_user_id,created_at,due_at,state,source_reference_json) VALUES(?,'policy_review',?,(SELECT id FROM team_duties WHERE id='policy_coordination'),?,?,?,'open',?)").bind(id,id,input.toUserId,ctx.now,dueAt,JSON.stringify(reference)));
 }else if(input.action==='complete_policy_review'){
  const row=await db.prepare("SELECT revision,subject_user_id AS ownerId,source_reference_json AS reference FROM team_governance_tasks WHERE id=? AND kind='policy_review' AND state='open'").bind(id).first<{revision:number;ownerId:string;reference:string}>();if(!row||ctx.expectedRevision!==String(row.revision)||row.ownerId!==ctx.actorId&&authority.role!=='super_admin')throw new TeamGovernanceConflict('Only the current assigned coordinator or Super Admin can record this original review.');
  const reference=JSON.parse(row.reference) as Record<string,unknown>;
  if(reference.type==='business_setting')statements.push(...teamGuard(db,'EXISTS(SELECT 1 FROM business_setting_versions WHERE id=? AND revision=? AND status=?)',[reference.id,reference.revision,reference.status]));
  if(reference.type==='internal_legal_procedure'){const proof=await(await import('../legal-procedures/lifecycle')).getActiveLegalProcedureProof(db,ctx.now);if(!proof||proof.active.id!==reference.id||proof.active.document.sha256!==reference.sha256)throw new TeamGovernanceConflict('The actual native policy changed; preserve this review and select its current source explicitly.');statements.push(...proof.guards);}
  text(input.nextAction);statements.push(...teamGuard(db,"EXISTS(SELECT 1 FROM team_governance_tasks WHERE id=? AND revision=? AND state='open' AND subject_user_id=?)",[id,row.revision,row.ownerId]),db.prepare("UPDATE team_governance_tasks SET state='completed',completed_at=?,revision=revision+1 WHERE id=? AND revision=?").bind(ctx.now,id,row.revision));revision=row.revision+1;
 }else if(input.action==='offboard_staff'){
  const target=await db.prepare("SELECT COALESCE(p.version,0) AS version,EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='super_admin') AS superAdmin FROM users u LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.id=? AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN('admin','super_admin'))").bind(id).first<{version:number;superAdmin:number}>();if(!target||ctx.expectedRevision!==String(target.version))throw new TeamGovernanceConflict('Review the current staff role and exact grant version.');
  statements.push(...teamGuard(db,'COALESCE((SELECT version FROM staff_permission_profiles WHERE user_id=?),0)=?',[id,target.version]));
  if(target.superAdmin){const predicate="EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id<>? AND u.status='active' AND u.auth_subject IS NOT NULL AND r.role='super_admin')";if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(id).first())throw new TeamGovernanceConflict('This is the last usable Super Admin. Use the established protected account-security/recovery process for compromise containment.');statements.push(...teamGuard(db,predicate,[id]));}
  statements.push(...await(await import('./team-access-impact')).staffAccessGovernanceStatements(db,{userId:id,actorId:ctx.actorId,requestId:ctx.requestId,now:ctx.now,grantVersion:target.version,action:'team.offboard_staff'}),db.prepare("DELETE FROM user_roles WHERE user_id=? AND role IN('admin','super_admin')").bind(id));
 }else throw new TeamGovernanceConflict('This governance action is not supported.');
 const result={id,revision};let sourceType='duty',logicalId=input.sourceId,noticeDuty='team_governance',recipientId:string|null=null,procedureId:string|null=null;
 if(input.action==='save_duty'){noticeDuty=input.sourceId;recipientId=input.primaryId??null;}
 if(input.action==='availability'){sourceType='availability';recipientId=input.sourceId;}
 if(['propose_handoff','accept_handoff','cancel_handoff'].includes(input.action)){
  sourceType='handoff';logicalId=id;
  const h=input.action==='propose_handoff'?{dutyId:input.sourceId,toUserId:input.toUserId!,fromUserId:(await readTeamDutyCoverage(db,input.sourceId,{now:ctx.now})).activeOwnerId}:await db.prepare('SELECT duty_id AS dutyId,to_user_id AS toUserId,from_user_id AS fromUserId FROM team_handoffs WHERE id=?').bind(id).first<{dutyId:string;toUserId:string;fromUserId:string|null}>();if(!h)throw new TeamGovernanceConflict('The original handoff is unavailable.');noticeDuty=h.dutyId;recipientId=h.toUserId;formerOwnerId=h.fromUserId;
 }
 if(input.action==='publish_procedure'||input.action==='assign_native_procedure'){sourceType='procedure';noticeDuty=input.action==='publish_procedure'?input.sourceId:'policy_coordination';procedureId=id;}
 if(input.action==='acknowledge_procedure'){sourceType='procedure_ack';logicalId=id+':'+ctx.actorId;procedureId=id;recipientId=ctx.actorId;const family=(await db.prepare('SELECT family FROM team_procedures WHERE id=?').bind(id).first<{family:string}>())?.family;noticeDuty=family==='native_operating_procedure'?'policy_coordination':family??'team_governance';}
 if(input.action==='complete_access_review'){sourceType='access_review';recipientId=id;}
 if(input.action==='review_invitation_grant')sourceType='invitation';
 if(input.action==='offboard_staff')sourceType='staff';
 if(input.action==='schedule_policy_review'||input.action==='complete_policy_review'){sourceType='policy_review';logicalId=id;noticeDuty='policy_coordination';recipientId=input.toUserId??(await db.prepare('SELECT subject_user_id AS id FROM team_governance_tasks WHERE id=?').bind(id).first<{id:string}>())?.id??null;}
 if(input.action==='complete_checkpoint'){sourceType='checkpoint';noticeDuty=(await db.prepare('SELECT duty_id AS id FROM team_checkpoints WHERE id=?').bind(id).first<{id:string}>())?.id??'team_governance';recipientId=(await readTeamDutyCoverage(db,noticeDuty,{now:ctx.now})).activeOwnerId;}
 const eventId=crypto.randomUUID(),kind=sourceType==='handoff'?'team.handoff':'team.governance',status=input.action+':'+noticeDuty,family='team.'+sourceType;
 const head=await db.prepare('SELECT revision FROM operational_notice_states WHERE family=? AND source_id=?').bind(family,logicalId).first<{revision:number}>();
 const nativeSourceId=procedureId?(await db.prepare('SELECT native_source_id AS id FROM team_procedures WHERE id=?').bind(procedureId).first<{id:string|null}>())?.id??(input.action==='assign_native_procedure'?(await(await import('../legal-procedures/lifecycle')).getActiveLegalProcedureProof(db,ctx.now))?.active.id:null):null;
 statements.push(db.prepare('INSERT INTO team_governance_events(id,source_type,source_id,action,actor_id,created_at,reason,details_json,request_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(eventId,sourceType,logicalId,input.action,ctx.actorId,ctx.now,reason,JSON.stringify({revision,dutyId:noticeDuty,recipientId,formerOwnerId,procedureId,nativeSourceId,recommendation:input.action==='complete_policy_review'?input.nextAction:undefined}),ctx.requestId));
 if(head)statements.push(db.prepare('UPDATE operational_notice_states SET current_event_id=?,current_status=?,revision=revision+1 WHERE family=? AND source_id=? AND revision=?').bind(eventId,status,family,logicalId,head.revision),...teamGuard(db,'changes()=1'));
 else statements.push(db.prepare('INSERT INTO operational_notice_states(family,source_id,current_event_id,current_status) VALUES(?,?,?,?)').bind(family,logicalId,eventId,status));
 statements.push(...await operationalBusinessNotificationStatements(db,{kind,sourceId:eventId,eventId,status,actorId:ctx.actorId,now:ctx.now,detail:'The recorded responsibility or procedure changed. Open the protected Team workspace for the current permitted next action.'}),receipt.insert(result));
 attemptedCommit=true;
 try{await db.batch(statements);}catch{const recovered=await commandReceipt(db,ctx,{action:'team.'+input.action,subjectType:'team_governance',subjectId:input.sourceId},input);if(recovered.replayed)return await replay();await fence();throw new TeamGovernanceConflict('Authority or coverage changed before save. Refresh and review the current record.');}
 if(input.action==='offboard_staff')await(await import('./team-access-reconciliation')).attemptStaffAccessReconciliation(db,ctx.now);
 if(['availability','accept_handoff','save_duty'].includes(input.action))await(await import('./team-coverage-dispatch')).attemptTeamTaskCoverage(db,ctx.now,input.action==='availability'?input.sourceId:formerOwnerId??undefined);
 await fence();return result;
 }catch(error){if(!attemptedCommit&&typeof error==='object'&&error!==null)beforeWriteFailures.add(error);throw error;}
}
export async function getTeamWorkspace(db:D1Database,actorId:string,options:{now?:number}={}){
 const fence=await(await import('./team-read-fence')).teamReadFence(db,actorId);
 const authority=await staffMutationGuard(db,actorId,'account.self.manage',TeamGovernanceConflict),now=options.now??Date.now();
 const data=await import('./team-workspace-data');
 const coverage=await Promise.all(teamDutyCatalogue.map(value=>readTeamDutyCoverage(db,value.id,{now})));
 const safeCoverage=coverage.map(({guards:_guards,predicate:_predicate,values:_values,candidates:_candidates,...value})=>value);
 const ownHandoffs=(await db.prepare('SELECT id,duty_id AS dutyId,from_user_id AS fromUserId,to_user_id AS toUserId,starts_at AS startsAt,ends_at AS endsAt,state,revision FROM team_handoffs WHERE to_user_id=? OR from_user_id=? ORDER BY starts_at DESC LIMIT 100').bind(actorId,actorId).all()).results;
 const policyTasks=(await db.prepare("SELECT id,subject_user_id AS ownerId,created_at AS createdAt,due_at AS dueAt,state,revision,source_reference_json AS sourceReference FROM team_governance_tasks WHERE kind='policy_review'"+(authority.role==='super_admin'?'':' AND subject_user_id=?')+' ORDER BY due_at,id LIMIT 100').bind(...(authority.role==='super_admin'?[]:[actorId])).all<{id:string;ownerId:string;createdAt:number;dueAt:number;state:string;revision:number;sourceReference:string}>()).results;
 if(authority.role!=='super_admin'){
  const ownCoverage=safeCoverage.filter(value=>value.primaryId===actorId||value.backups.some(backup=>backup.userId===actorId)||ownHandoffs.some(h=>h.dutyId===value.id&&['pending','accepted'].includes(String(h.state))&&Number(h.endsAt)>now));
  const ids=new Set(ownCoverage.flatMap(value=>[value.primaryId,value.activeOwnerId,...value.backups.map(b=>b.userId)]).filter((id):id is string=>!!id));
  const contacts=ids.size?(await db.prepare("SELECT id,display_name AS displayName,email FROM users WHERE status='active' AND id IN ("+[...ids].map(()=>'?').join(',')+") AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=users.id AND r.role IN('admin','super_admin'))").bind(...ids).all()).results:[];
  const access=await(await import('../db/repositories/staff-permissions')).getStaffPermissionProfile(db,actorId);
  const ownDutyIds=ownCoverage.filter(duty=>duty.permission==='payout.prepare').map(duty=>duty.id),checkpoints=ownDutyIds.length?(await db.prepare('SELECT id,duty_id AS dutyId,kind,due_at AS dueAt,completed_at AS completedAt,next_action AS nextAction,revision FROM team_checkpoints WHERE duty_id IN('+ownDutyIds.map(()=>'?').join(',')+') ORDER BY due_at DESC,id LIMIT 40').bind(...ownDutyIds).all()).results:[];
  const output={mode:'own' as const,observedAt:now,coverage:ownCoverage,procedures:await data.readTeamProcedures(db,actorId,now),handoffs:ownHandoffs,policyTasks,checkpoints,contacts,access:{permissions:access.permissions,version:access.version,legacy:access.updatedAt===null}};
  const proof=(await import('./team-own-scope')).teamOwnScopeProof(db,actorId,output);await fence(proof);return output;
 }
 const [people,policyRegister,procedures,invitations,handoffs,checkpoints,history,myProcedures,procedureAssignments,availability]=await Promise.all([
  data.readTeamDirectory(db,now),data.readTeamPolicyRegister(db,now),data.readTeamProcedures(db,null,now),
  db.prepare("SELECT i.id,i.email,i.role,i.status AS storedStatus,CASE WHEN i.status='pending' AND i.expires_at<=? THEN 'expired' ELSE i.status END AS status,i.created_at AS createdAt,i.expires_at AS expiresAt,g.permissions_json AS permissionsJson,g.grant_version AS grantVersion FROM staff_invitations i LEFT JOIN staff_invitation_grants g ON g.invitation_id=i.id ORDER BY i.created_at DESC,i.id DESC LIMIT 100").bind(now).all(),
  db.prepare('SELECT id,duty_id AS dutyId,from_user_id AS fromUserId,to_user_id AS toUserId,starts_at AS startsAt,ends_at AS endsAt,state,revision FROM team_handoffs ORDER BY starts_at DESC,id LIMIT 100').all(),
  db.prepare('SELECT id,duty_id AS dutyId,nepal_date AS nepalDate,kind,due_at AS dueAt,completed_at AS completedAt,completed_by AS completedBy,next_action AS nextAction,revision FROM team_checkpoints ORDER BY due_at DESC,id LIMIT 40').all(),
  db.prepare('SELECT id,source_type AS sourceType,source_id AS sourceId,action,actor_id AS actorId,created_at AS createdAt,reason FROM team_governance_events ORDER BY created_at DESC,id DESC LIMIT 100').all(),
  data.readTeamProcedures(db,actorId,now),db.prepare('SELECT procedure_id AS procedureId,user_id AS userId,assigned_at AS assignedAt,acknowledged_at AS acknowledgedAt FROM team_procedure_assignments ORDER BY assigned_at DESC LIMIT 200').all(),
  db.prepare('SELECT id,user_id AS userId,starts_at AS startsAt,ends_at AS endsAt,available,reason,revision FROM team_availability WHERE ends_at>? ORDER BY starts_at,id LIMIT 100').bind(now).all(),
 ]);
 const upcomingCoverage=(await import('./team-future-coverage')).upcomingTeamCoverage(now,availability.results,handoffs.results,safeCoverage,people);
 const output={mode:'full' as const,observedAt:now,people,coverage:safeCoverage,policyRegister,procedures,policyTasks,myProcedures,procedureAssignments:procedureAssignments.results,availability:availability.results,upcomingCoverage,invitations:invitations.results,handoffs:handoffs.results,checkpoints:checkpoints.results,history:history.results,calendar:{mode:'Continuous coverage — temporary',version:'continuous-v1',timeZone:'Asia/Kathmandu',fixedHours:'Deferred'}};
 await fence();return output;
}
export async function readTeamSavedOutcome(db:D1Database,actorId:string,requestId:string,options:{action?:string;sourceId?:string;authSubject?:string}={}){
 const fence=await(await import('./team-read-fence')).teamReadFence(db,actorId,options.authSubject);
 const row=await db.prepare("SELECT action,subject_id AS sourceId,command_result_json AS result FROM audit_logs WHERE HEX(actor_id)=HEX(?) AND HEX(request_id)=HEX(?) AND subject_type='team_governance' AND action LIKE 'team.%' AND command_key IS NOT NULL LIMIT 1").bind(actorId,requestId).first<{action:string;sourceId:string;result:string}>();if(!row){await fence();return null;}
 if(options.action!==undefined&&row.action!=='team.'+options.action||options.sourceId!==undefined&&row.sourceId!==options.sourceId)throw new TeamGovernanceConflict('The saved reference belongs to a different original Team action.');
 await staffMutationGuard(db,actorId,'account.self.manage',TeamGovernanceConflict);
 if(row.action==='team.accept_handoff'){const handoff=await db.prepare('SELECT duty_id AS dutyId,to_user_id AS toUserId FROM team_handoffs WHERE id=?').bind(row.sourceId).first<{dutyId:string;toUserId:string}>();if(!handoff||handoff.toUserId!==actorId||!await eligible(db,actorId,handoff.dutyId))throw new TeamGovernanceConflict('Current authority to this original handoff is required.');}
 else if(row.action==='team.complete_policy_review'){if(!await db.prepare("SELECT 1 FROM team_governance_tasks WHERE id=? AND kind='policy_review' AND subject_user_id=?").bind(row.sourceId,actorId).first())await staffMutationGuard(db,actorId,'admin.permissions.manage',TeamGovernanceConflict,'super_admin');}
 else if(row.action==='team.complete_checkpoint'){const source=await db.prepare('SELECT duty_id AS id,completed_by AS actor FROM team_checkpoints WHERE id=?').bind(row.sourceId).first<{id:string;actor:string|null}>();if(!source||source.actor!==actorId||!await eligible(db,actorId,source.id))throw new TeamGovernanceConflict('Current authority to this original appointment is required.');}
 else if(row.action!=='team.acknowledge_procedure')await staffMutationGuard(db,actorId,'admin.permissions.manage',TeamGovernanceConflict,'super_admin');
 const result:unknown=JSON.parse(row.result);if(!result||typeof result!=='object'||Array.isArray(result)||!('id' in result)||typeof result.id!=='string'||!result.id||result.id.length>191||!('revision' in result)||!Number.isSafeInteger(result.revision)||Number(result.revision)<0)throw new TeamGovernanceConflict('The original Team receipt is unavailable.');
 await fence();return result as {id:string;revision:number};
}

