import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {digestFormRequest} from '../forms/client-submission';
import {caseBusinessNotificationStatements} from '../operations/business-notifications';
import {buildFormAnswerInsert} from '../db/repositories/form-answers';
import type {CommerceForm} from '../db/repositories/commerce-form-replay';
export type AftercareSource='return_request'|'complaint';
export class AftercareConflict extends Error{}
export interface AftercareFollowup {sourceType:AftercareSource;sourceId:string;ownerId:string;backupId:string|null;waitingFor:'none'|'customer'|'seller'|'carrier'|'platform';nextUpdateAt:number;nextAction:string;publicMessage:string;privateNote:string;newClarification:boolean}
interface Source {id:string;orderId:string;status:string;revision:number;ownerId:string|null;backupId:string|null;firstReceivedAt:number;firstDueAt:number;firstActionAt:number|null;nextUpdateAt:number|null;waitingFor:string;clarificationAt:number|null;clarificationDueAt:number|null;lastSubstantiveAt:number;now:number}
export async function aftercareFollowup(db:D1Database,type:AftercareSource,id:string){
 const clock=checkoutCommitClock(db);
 if(type==='return_request')return db.prepare(`SELECT r.id,i.order_id AS orderId,r.status,h.revision,h.owner_id AS ownerId,h.backup_id AS backupId,h.first_received_at AS firstReceivedAt,h.first_due_at AS firstDueAt,h.first_action_at AS firstActionAt,h.next_update_at AS nextUpdateAt,h.waiting_for AS waitingFor,h.clarification_at AS clarificationAt,h.clarification_due_at AS clarificationDueAt,COALESCE((SELECT MAX(e.created_at) FROM return_request_events e WHERE e.return_request_id=r.id),r.requested_at) AS lastSubstantiveAt,${clock} AS now FROM return_requests r JOIN return_handling h ON h.case_id=r.id JOIN order_items i ON i.id=r.order_item_id WHERE r.id=?`).bind(id).first<Source>();
 if(type==='complaint')return db.prepare(`SELECT id,order_id AS orderId,status,followup_revision AS revision,assigned_to AS ownerId,backup_id AS backupId,created_at AS firstReceivedAt,first_due_at AS firstDueAt,first_action_at AS firstActionAt,next_update_at AS nextUpdateAt,waiting_for AS waitingFor,clarification_at AS clarificationAt,clarification_due_at AS clarificationDueAt,COALESCE((SELECT MAX(e.created_at) FROM complaint_events e WHERE e.complaint_id=complaints.id AND e.action<>'admin_assign_to_me'),created_at) AS lastSubstantiveAt,${clock} AS now FROM complaints WHERE id=?`).bind(id).first<Source>();
 throw new AftercareConflict('Choose an existing return or complaint source.');
}
function guard(db:D1Database,predicate:string,values:unknown[]=[]){const id=crypto.randomUUID();return[db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
async function eligible(db:D1Database,actorId:string,type:AftercareSource,orderId:string){
 if(await db.prepare('SELECT 1 FROM orders o WHERE o.id=? AND (o.customer_id=? OR EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=o.id AND s.user_id=?))').bind(orderId,actorId,actorId).first())throw new AftercareConflict('Choose an eligible operator without a personal customer or supplier interest.');
 let authority;try{authority=await staffMutationGuard(db,actorId,'support.manage',AftercareConflict);}catch(error){if(type!=='return_request'||!(error instanceof AftercareConflict))throw error;authority=await staffMutationGuard(db,actorId,'order.manage',AftercareConflict);}
 return {...authority,statements:[...authority.statements,...guard(db,'EXISTS(SELECT 1 FROM orders o WHERE o.id=? AND (o.customer_id IS NULL OR o.customer_id<>?) AND NOT EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=o.id AND s.user_id=?))',[orderId,actorId,actorId])]};
}
export async function recordAftercareFollowup(db:D1Database,ctx:CommandContext,input:AftercareFollowup,form?:CommerceForm){
 const row=await aftercareFollowup(db,input.sourceType,input.sourceId);if(!row)throw new AftercareConflict('The original case needs reconciliation.');
 const actor=await eligible(db,ctx.actorId,input.sourceType,row.orderId),owner=await eligible(db,input.ownerId,input.sourceType,row.orderId),backup=input.backupId?await eligible(db,input.backupId,input.sourceType,row.orderId):null;
 const formId=input.sourceType==='return_request'?'staff.return-case-action':'staff.complaint-case-action';if(form&&form.answers.formId!==formId)throw new AftercareConflict('Use the current case action form.');
 const receipt=await commandReceipt(db,ctx,{action:'aftercare.followup',subjectType:input.sourceType,subjectId:input.sourceId},form?{...input,form}:input);if(receipt.replayed)return receipt.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(row.revision)||['resolved','closed','rejected'].includes(row.status))throw new AftercareConflict('Refresh this open case before setting its next action.');
 for(const [value,max] of [[input.nextAction,1500],[input.publicMessage,1500],[input.privateNote,3000]] as const)if(typeof value!=='string'||value.trim().length<10||value.length>max)throw new AftercareConflict('Retain a concrete next action, factual public update and private evidence note.');
 if(!['none','customer','seller','carrier','platform'].includes(input.waitingFor)||typeof input.newClarification!=='boolean'||!Number.isSafeInteger(input.nextUpdateAt)||input.nextUpdateAt<=row.now)throw new AftercareConflict('Record the actual waiting party and a future owned update.');
 if(input.backupId===input.ownerId)throw new AftercareConflict('Choose a different eligible backup, or leave the backup gap visible.');
 if(!['customer','seller'].includes(input.waitingFor)&&input.nextUpdateAt>row.now+86400000)throw new AftercareConflict('Keep the next substantive update within 24 elapsed hours.');
 const clarification=['customer','seller'].includes(input.waitingFor),newQuestion=clarification&&(row.waitingFor!==input.waitingFor||row.clarificationAt===null||input.newClarification);
 const clock=checkoutCommitClock(db),eventId=crypto.randomUUID(),returned=input.sourceType==='return_request',table=returned?'return_handling':'complaints',idColumn=returned?'case_id':'id',versionColumn=returned?'revision':'followup_revision',ownerColumn=returned?'owner_id':'assigned_to';
 const status=input.waitingFor==='customer'?(returned&&['requested','under_investigation','needs_customer_changes'].includes(row.status)?'needs_customer_changes':returned?row.status:'waiting_customer'):row.status==='needs_customer_changes'?'under_investigation':row.status==='waiting_customer'?'investigating':row.status;
 const statements=[db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(row.orderId),...actor.statements,...owner.statements,...backup?.statements??[],
  ...guard(db,`${input.nextUpdateAt}>${clock} AND EXISTS(SELECT 1 FROM ${returned?'return_requests':'complaints'} WHERE id=? AND status=?)`,[row.id,row.status]),
  db.prepare(`UPDATE ${table} SET ${ownerColumn}=?,backup_id=?,next_update_at=?,waiting_for=?,first_action_at=COALESCE(first_action_at,${clock}),clarification_at=CASE WHEN ? THEN ${clock} ELSE clarification_at END,clarification_due_at=CASE WHEN ? THEN ${clock}+172800000 ELSE clarification_due_at END,${versionColumn}=${versionColumn}+1 WHERE ${idColumn}=? AND ${versionColumn}=?`).bind(input.ownerId,input.backupId,input.nextUpdateAt,input.waitingFor,newQuestion?1:0,newQuestion?1:0,row.id,row.revision),...guard(db,'changes()=1'),
  db.prepare(`UPDATE ${returned?'return_requests':'complaints'} SET status=?,operation_request_id=?,updated_at=${clock} WHERE id=? AND status=?`).bind(status,ctx.requestId,row.id,row.status),...guard(db,'changes()=1'),
  db.prepare(`INSERT INTO aftercare_followup_events(id,source_type,source_id,revision,actor_id,owner_id,backup_id,waiting_for,next_update_at,next_action,public_message,private_note,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,${clock})`).bind(eventId,input.sourceType,row.id,row.revision+1,ctx.actorId,input.ownerId,input.backupId,input.waitingFor,input.nextUpdateAt,input.nextAction.trim(),input.publicMessage.trim(),input.privateNote.trim(),ctx.requestId),
  db.prepare(`INSERT INTO ${returned?'return_request_events':'complaint_events'}(id,${returned?'return_request_id':'complaint_id'},from_status,to_status,action,actor_id,actor_type,public_message_en,public_message_ne,internal_note,request_id,created_at) VALUES(?,?,?,?,'owned_followup',?,?,?,?,?,?,${clock})`).bind(eventId,row.id,row.status,status,ctx.actorId,actor.role,input.publicMessage.trim(),input.publicMessage.trim(),input.privateNote.trim(),ctx.requestId),
  db.prepare(`UPDATE review_tasks SET owner_id=?,revision=revision+1,updated_at=${clock} WHERE source_type=? AND source_id=? AND source_revision=?`).bind(input.ownerId,input.sourceType,row.id,row.id),
  ...await caseBusinessNotificationStatements(db,{sourceType:input.sourceType,sourceId:row.id,eventId:ctx.requestId,actorId:ctx.actorId,action:'owned_followup',now:row.now})];
 if(form)statements.push(buildFormAnswerInsert(db,{formId,requestId:ctx.requestId,versionId:form.versionId,subjectType:input.sourceType,subjectId:row.id,actorId:ctx.actorId,answers:form.answers,now:row.now}));
 const result={id:row.id,revision:row.revision+1,...(form?{formContextDigest:await digestFormRequest({versionId:form.versionId,answers:form.answers})}:{})};statements.push(receipt.insert(result));
 try{await db.batch(statements);}catch(error){const saved=await commandReceipt(db,ctx,{action:'aftercare.followup',subjectType:input.sourceType,subjectId:input.sourceId},form?{...input,form}:input);if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}
export function aftercareDueFacts(row:Source,now:number){
 const facts:{kind:string;dueAt:number;customerPrompt:boolean}[]=[];
 if(['resolved','closed','rejected'].includes(row.status))return facts;
 if(row.firstActionAt===null&&now>=row.firstDueAt)facts.push({kind:'first_review',dueAt:row.firstDueAt,customerPrompt:false});
 const clarifying=['customer','seller'].includes(row.waitingFor)&&row.clarificationAt!==null&&row.clarificationDueAt!==null;
 if(clarifying&&now>=row.clarificationAt!+86400000&&now<row.clarificationDueAt!)facts.push({kind:'clarification_reminder',dueAt:row.clarificationAt!+86400000,customerPrompt:row.waitingFor==='customer'});
 if(clarifying&&now>=row.clarificationDueAt!)facts.push({kind:'clarification_due',dueAt:row.clarificationDueAt!,customerPrompt:false});
 const defaultUpdate=row.firstActionAt===null?Infinity:row.lastSubstantiveAt+86400000;
 const updateDue=clarifying?(row.nextUpdateAt!==null&&row.nextUpdateAt<row.clarificationAt!+86400000?row.nextUpdateAt:Infinity):Math.min(row.nextUpdateAt??Infinity,defaultUpdate);
 if(now>=updateDue)facts.push({kind:row.nextUpdateAt===updateDue?'promised_update':'substantive_update',dueAt:updateDue,customerPrompt:false});
 return facts;
}

export async function publicAftercareFollowup(db:D1Database,type:AftercareSource,id:string){
 const row=await aftercareFollowup(db,type,id);if(!row)return null;let ownershipMissing=!row.ownerId;
 if(row.ownerId)try{await eligible(db,row.ownerId,type,row.orderId);}catch(error){if(!(error instanceof AftercareConflict))throw error;ownershipMissing=true;}
 return {status:row.status,firstReceivedAt:row.firstReceivedAt,firstDueAt:row.firstDueAt,firstActionAt:row.firstActionAt,nextUpdateAt:row.nextUpdateAt,waitingFor:row.waitingFor,ownershipMissing};
}
export type PublicAftercareFollowup=Awaited<ReturnType<typeof publicAftercareFollowup>>;
