import {operationalNotificationRequestId} from './event-catalog';
import type {CurrentOperationalNotice,OperationalSourceDescriptor} from './financial-notice-sources';
import {reviewTaskReminderSource,reviewTaskReminderRecipientAllowed} from '../workflows/review-tasks';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';

export interface ReviewTaskAssignmentEvidence {taskId:string;revision:number;ownerId:string|null;previousOwnerId:string|null;sourceRevision:string;}
class AssignmentNoticeDenied extends Error{}
const jsonFunction=(db:D1Database)=>(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract';
export async function reviewAssignmentKey(actorId:string|null,requestId:string,taskId:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(actorId===null?['review-task-coverage',requestId,taskId]:[actorId,requestId])));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
function evidence(value:unknown):ReviewTaskAssignmentEvidence|null{if(!value||typeof value!=='object')return null;const v=value as Record<string,unknown>;return typeof v.taskId==='string'&&typeof v.sourceRevision==='string'&&Number.isSafeInteger(v.revision)&&Number(v.revision)>0&&(v.ownerId===null||typeof v.ownerId==='string')&&(v.previousOwnerId===null||typeof v.previousOwnerId==='string')?v as unknown as ReviewTaskAssignmentEvidence:null;}
export async function readReviewAssignment(db:D1Database,key:string){if(!/^[a-f0-9]{64}$/.test(key))return null;const receipt=await db.prepare("SELECT subject_id taskId,command_result_json result FROM audit_logs WHERE command_key=? AND subject_type='review_task' AND action IN('review_task.assigned','review_task.coverage_rerouted')").bind(key).first<{taskId:string;result:string}>();if(!receipt)return null;let parsed;try{parsed=evidence(JSON.parse(receipt.result));}catch{return null;}return parsed&&parsed.taskId===receipt.taskId?parsed:null;}

/** The original receipt, not a second event store, proves both sides of one assignment. */
export async function reviewAssignmentOperationalSource(db:D1Database,e:{sourceId:string;eventId:string;status?:string;assignment?:ReviewTaskAssignmentEvidence;now?:number}):Promise<OperationalSourceDescriptor|null>{
 const mode=e.status;if(!['assigned','released'].includes(mode??'')||e.eventId!==e.sourceId+':'+mode||!/^[a-f0-9]{64}$/.test(e.sourceId))return null;
 const saved=e.assignment?evidence(e.assignment):await readReviewAssignment(db,e.sourceId);if(!saved||saved.ownerId===saved.previousOwnerId)return null;
 const current=await reviewTaskReminderSource(db,saved.taskId,e.now);if(!current||current.task.sourceRevision!==saved.sourceRevision||current.current.revision!==saved.sourceRevision||mode==='assigned'&&!current.needsAction)return null;
 const j=jsonFunction(db),clock=checkoutCommitClock(db),receipt=`EXISTS(SELECT 1 FROM audit_logs assignment_receipt WHERE assignment_receipt.command_key=? AND assignment_receipt.subject_type='review_task' AND assignment_receipt.subject_id=? AND assignment_receipt.action IN('review_task.assigned','review_task.coverage_rerouted') AND ${j}(assignment_receipt.command_result_json,'$.revision')=? AND COALESCE(${j}(assignment_receipt.command_result_json,'$.ownerId'),'')=? AND COALESCE(${j}(assignment_receipt.command_result_json,'$.previousOwnerId'),'')=? AND ${j}(assignment_receipt.command_result_json,'$.sourceRevision')=?)`;
 const values:unknown[]=[e.sourceId,saved.taskId,saved.revision,saved.ownerId??'',saved.previousOwnerId??'',saved.sourceRevision];
 const taskGuard=mode==='assigned'?"EXISTS(SELECT 1 FROM review_tasks assignment_task WHERE assignment_task.id=? AND assignment_task.revision=? AND COALESCE(assignment_task.owner_id,'')=? AND assignment_task.source_revision=?)":"EXISTS(SELECT 1 FROM review_tasks assignment_task WHERE assignment_task.id=? AND assignment_task.revision>=? AND COALESCE(assignment_task.owner_id,'')<>? AND assignment_task.source_revision=?)";
 values.push(saved.taskId,saved.revision,mode==='assigned'?saved.ownerId??'':saved.previousOwnerId??'',saved.sourceRevision);
 let guard=receipt+' AND '+taskGuard;
 if(mode==='released'){if(!saved.previousOwnerId)return null;guard+=` AND NOT EXISTS(SELECT 1 FROM audit_logs regained WHERE regained.subject_type='review_task' AND regained.subject_id=? AND regained.action IN('review_task.assigned','review_task.coverage_rerouted') AND ${j}(regained.command_result_json,'$.revision')>? AND ${j}(regained.command_result_json,'$.ownerId')=?)`;values.push(saved.taskId,saved.revision,saved.previousOwnerId);}
 // Before the original batch the source CAS is supplied by its owning command; afterwards use the fresh native source fence too.
 if(current.task.revision>=saved.revision){guard+=' AND ('+current.current.predicate+')';values.push(...current.current.values);}
 const superSql="EXISTS(SELECT 1 FROM user_roles assignment_super WHERE assignment_super.user_id=u.id AND assignment_super.role='super_admin')";
 const conflicts=[...new Set([current.current.ownerId,...current.current.conflictIds??[]].filter(Boolean))];
 const staffGuard=(mode==='released'?'u.id=?':`(u.id=? OR ${superSql}) AND u.id<>? AND NOT EXISTS(SELECT 1 FROM team_availability absent WHERE absent.user_id=u.id AND absent.revision=(SELECT latest.revision FROM team_availability latest WHERE latest.user_id=u.id AND latest.starts_at<=${clock} AND latest.ends_at>${clock} ORDER BY latest.revision DESC LIMIT 1) AND absent.available=0)`)+(mode==='assigned'&&conflicts.length?' AND u.id NOT IN ('+conflicts.map(()=>'?').join(',')+')':'');
 return{guard,guardValues:values,ownerSql:null,ownerValues:[],audience:'staff',staffPermission:mode==='released'?'account.self.manage':current.current.permission,alternativeStaffPermission:mode==='assigned'?current.current.alternativePermission:undefined,relatedType:'review_task_assignment',subject:mode==='released'?'Previous work assignment released':saved.ownerId?'Work assigned to you':'Work needs eligible coverage',staffGuard,staffGuardValues:mode==='released'?[saved.previousOwnerId]:[saved.ownerId??'',saved.previousOwnerId??'',...conflicts]};
}
export async function reviewTaskAssignmentNoticeStatements(db:D1Database,input:{key:string;actorId:string|null;now:number;assignment:ReviewTaskAssignmentEvidence}){
 if(input.assignment.ownerId===input.assignment.previousOwnerId)return[];const{operationalBusinessNotificationStatements}=await import('./business-notifications');const statements:D1PreparedStatement[]=[];
 for(const mode of ['assigned','released']as const){if(mode==='released'&&!input.assignment.previousOwnerId)continue;statements.push(...await operationalBusinessNotificationStatements(db,{kind:'workflow.assignment',sourceId:input.key,eventId:input.key+':'+mode,status:mode,actorId:input.actorId??'',now:input.now,assignment:input.assignment,detail:mode==='released'?'You are no longer assigned to this previous work. Open your current responsibilities for any work that still belongs to you.':'Your work assignment changed. Open the protected destination for the current authorized task and next action.'}));}return statements;
}
export async function isCurrentReviewAssignmentNotice(db:D1Database,notice:CurrentOperationalNotice,now=Date.now()){
 if(notice.template!=='business.workflow.assignment'||notice.relatedType!=='review_task_assignment'||notice.audience!=='staff'||!notice.relatedId||!notice.userId)return false;
 const saved=await readReviewAssignment(db,notice.relatedId);if(!saved)return false;
 for(const mode of ['assigned','released']as const){if(notice.requestId!==await operationalNotificationRequestId(notice.template,notice.relatedId+':'+mode,notice.userId,notice.channel))continue;
  const descriptor=await reviewAssignmentOperationalSource(db,{sourceId:notice.relatedId,eventId:notice.relatedId+':'+mode,status:mode,assignment:saved,now});if(!descriptor)return false;
  try{await staffMutationGuard(db,notice.userId,mode==='released'?'account.self.manage':descriptor.staffPermission!,AssignmentNoticeDenied);}catch(error){if(error instanceof AssignmentNoticeDenied){if(mode==='released'||!descriptor.alternativeStaffPermission)return false;try{await staffMutationGuard(db,notice.userId,descriptor.alternativeStaffPermission,AssignmentNoticeDenied);}catch(other){if(other instanceof AssignmentNoticeDenied)return false;throw other;}}else throw error;}
  if(mode==='assigned'&&!await reviewTaskReminderRecipientAllowed(db,saved.taskId,notice.userId,now))return false;
  return!!await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND u.status=\'active\' AND '+descriptor.guard+' AND '+descriptor.staffGuard).bind(notice.userId,...descriptor.guardValues,...descriptor.staffGuardValues??[]).first();
 }return false;
}
