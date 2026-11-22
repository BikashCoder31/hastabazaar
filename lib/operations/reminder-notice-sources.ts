import { aftercareFollowup, aftercareDueFacts } from '../returns/followup';
import {readRecoveryFollowup,recoveryReviewSource,recoveryContactReviewSource} from '../payments/recovery-followup';
import {reviewTaskReminderSource,reviewTaskReminderRecipientAllowed} from '../workflows/review-tasks';
import {incidentFollowupFacts,incidentReviewSource} from './incident-review';
import {teamUserAvailable} from './team-governance';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {liveSnapshotPartySql} from '../managed-commerce/live-financial-party-sql';
import {operationalNotificationRequestId} from './event-catalog';
import {effectiveRefundBindingDeadlineSql} from '../payments/refund-deadlines';
import {linkedOriginalRefundConflictSql} from '../payments/refund-party-scope';
import type {Permission} from '../marketplace/permissions';
import type {CurrentOperationalNotice,OperationalSourceDescriptor,SourceOperationalEvent} from './financial-notice-sources';

export type ReminderFamily='return_request'|'complaint'|'recovery'|'review_task'|'system_incident'|'refund_obligation';
export interface ReminderFact{family:ReminderFamily;sourceId:string;milestone:string;sourceRevision:string;dueAt:number;ownerId:string|null;backupId:string|null;orderId:string|null;customerPrompt:boolean;sellerPrompt:boolean;permission:Permission;alternativeStaffPermission?:Permission;predicate:string;values:unknown[]}
export interface ReminderMilestone{id:string;family:ReminderFamily;sourceId:string;milestone:string;sourceRevision:string;dueAt:number}
class ReminderAuthorityError extends Error{}
function orderPartyGuard(){return `NOT EXISTS(SELECT 1 FROM orders original_order WHERE original_order.id=? AND original_order.customer_id=u.id) AND NOT EXISTS(SELECT 1 FROM order_items original_item JOIN seller_profiles maker ON maker.id=original_item.seller_id WHERE original_item.order_id=? AND maker.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM order_items original_item JOIN managed_commercial_snapshots original_party ON original_party.order_item_id=original_item.id WHERE original_item.order_id=? AND ${liveSnapshotPartySql('original_party','u.id')})`;}

const openRefundReminderStates = "obligation.state IN ('open','processing','uncertain','blocked')";

export function refundReminderSelectionSql() {
  const bindingDeadline = effectiveRefundBindingDeadlineSql('obligation');
  return `SELECT obligation.id FROM refund_obligations obligation
    WHERE obligation.id>? AND ${openRefundReminderStates}
      AND (obligation.next_update_at<=? OR ${bindingDeadline}<=?)
    ORDER BY obligation.id LIMIT 1`;
}

function refundPartyGuard(db:D1Database) {
  return `NOT EXISTS(SELECT 1 FROM refund_obligations original
    WHERE original.id=? AND (original.customer_id=u.id OR EXISTS(
      SELECT 1 FROM company_receipt_conflicts conflict
      WHERE conflict.receipt_id=original.receipt_id AND conflict.user_id=u.id) OR ${linkedOriginalRefundConflictSql(db,'original.receipt_id','u.id')}))`;
}

async function refundReminderFacts(db:D1Database,sourceId:string,now:number):Promise<ReminderFact[]> {
  const bindingDeadline = effectiveRefundBindingDeadlineSql('obligation');
  const row = await db.prepare(`SELECT obligation.revision,obligation.owner_id ownerId,
    obligation.backup_id backupId,obligation.order_id orderId,obligation.next_update_at nextUpdateAt,
    ${bindingDeadline} bindingDueAt
    FROM refund_obligations obligation WHERE obligation.id=? AND ${openRefundReminderStates}`)
    .bind(sourceId).first<{revision:number;ownerId:string;backupId:string|null;orderId:string|null;nextUpdateAt:number;bindingDueAt:number|null}>();
  if (!row) return [];

  const base = {family:'refund_obligation' as const,sourceId,ownerId:row.ownerId,backupId:row.backupId,
    orderId:row.orderId,customerPrompt:false,sellerPrompt:false,permission:'refund.approve.standard' as const};
  const current = `EXISTS(SELECT 1 FROM refund_obligations obligation
    WHERE obligation.id=? AND obligation.revision=? AND ${openRefundReminderStates} AND`;
  const due = (date:number) => Number.isSafeInteger(date) && date>0 && date<=now;
  const facts:ReminderFact[] = [];
  if (row.bindingDueAt!==null && due(row.bindingDueAt)) {
    facts.push({...base,milestone:'binding_due',sourceRevision:String(row.bindingDueAt),dueAt:row.bindingDueAt,
      predicate:`${current} ${bindingDeadline}=?)`,values:[sourceId,row.revision,row.bindingDueAt]});
  }
  if (due(row.nextUpdateAt)) {
    facts.push({...base,milestone:'promised_update',sourceRevision:String(row.revision),dueAt:row.nextUpdateAt,
      predicate:`${current} obligation.next_update_at=?)`,values:[sourceId,row.revision,row.nextUpdateAt]});
  }
  return facts;
}

/** All deadlines are retained domain facts. Assignment and mail retries never create a new clock. */
export async function reminderFacts(db:D1Database,family:ReminderFamily,sourceId:string,now:number):Promise<ReminderFact[]>{
 if(family==='refund_obligation')return refundReminderFacts(db,sourceId,now);
 if(family==='system_incident'){
  const source=await incidentReviewSource(db,sourceId,now);if(!source.needsAction)return [];
  const current=await incidentFollowupFacts(db,sourceId,now),ownerId=current.ownerId&&await teamUserAvailable(db,current.ownerId,now)?current.ownerId:null,backupId=current.backupId&&await teamUserAvailable(db,current.backupId,now)?current.backupId:null;
  const base={family,sourceId,sourceRevision:source.revision,ownerId,backupId,orderId:null,customerPrompt:false,sellerPrompt:false,permission:'system.incidents.manage' as const,predicate:source.predicate,values:source.values};
  const result:ReminderFact[]=[];
  if(current.midpoint&&!ownerId)result.push({...base,milestone:'unclaimed_midpoint',dueAt:current.midpointAt});
  if(current.acknowledgeOverdue)result.push({...base,milestone:'acknowledge_due',dueAt:current.acknowledgeDueAt});
  if(current.planOverdue)result.push({...base,milestone:'plan_due',dueAt:current.planDueAt});
  // The first containment plan is also the first update. Keep one due action for it.
  else if(current.updateOverdue&&current.nextUpdateAt!==null)result.push({...base,milestone:'promised_update',dueAt:current.nextUpdateAt});
  return result;
 }
 if(family==='return_request'||family==='complaint'){
  const row=await aftercareFollowup(db,family,sourceId);if(!row)return [];
  return aftercareDueFacts(row,now).map(due=>({family,sourceId,milestone:due.kind,sourceRevision:String(due.kind==='first_review'?row.firstReceivedAt:due.kind.startsWith('clarification')?row.clarificationAt:due.kind==='promised_update'?row.nextUpdateAt:row.lastSubstantiveAt),dueAt:due.dueAt,ownerId:row.ownerId,backupId:row.backupId,orderId:row.orderId,customerPrompt:due.customerPrompt,sellerPrompt:due.kind==='clarification_reminder'&&row.waitingFor==='seller',permission:'support.manage',...(family==='return_request'?{alternativeStaffPermission:'order.manage' as const}:{}),predicate:family==='return_request'?"EXISTS(SELECT 1 FROM return_handling h JOIN return_requests original ON original.id=h.case_id WHERE h.case_id=? AND h.revision=? AND original.status=?)":"EXISTS(SELECT 1 FROM complaints WHERE id=? AND followup_revision=? AND status=?)",values:[sourceId,row.revision,row.status]}));
 }
 if(family==='review_task'){
  const current=await reviewTaskReminderSource(db,sourceId,now);if(!current?.needsAction||!current.hasDeadline)return [];
  // Approved Team policy: alert the eligible backup halfway through the ORIGINAL
  // first-action allowance; do not catch up that alert after the overdue target.
  const deadlineStart=current.current.deadlineStartedAt??current.task.startedAt,midpoint=deadlineStart+Math.floor((current.task.dueAt-deadlineStart)/2),overdue=now>=current.task.dueAt;
  if(!overdue&&(current.ownerId!==null||now<midpoint))return [];
  return [{family,sourceId,milestone:overdue?'review_due':'unclaimed_midpoint',sourceRevision:current.current.revision,dueAt:overdue?current.task.dueAt:midpoint,ownerId:current.ownerId,backupId:current.current.backupId??null,orderId:current.current.orderId??null,customerPrompt:false,sellerPrompt:false,permission:current.current.permission,alternativeStaffPermission:current.current.alternativePermission,predicate:current.current.predicate+' AND EXISTS(SELECT 1 FROM review_tasks WHERE id=? AND source_revision=?)',values:[...current.current.values,sourceId,current.current.revision]}];
 }
 const view=await readRecoveryFollowup(db,sourceId,now),row=await db.prepare('SELECT revision,plan_json planJson,next_action_at nextActionAt FROM seller_recovery_cases WHERE id=?').bind(sourceId).first<{revision:number;planJson:string|null;nextActionAt:number}>();if(!row)return [];
 const result:ReminderFact[]=[],base={family,sourceId,ownerId:view.ownerId,backupId:view.backupId,orderId:null,customerPrompt:false,sellerPrompt:false,permission:'payout.prepare' as const,predicate:'EXISTS(SELECT 1 FROM seller_recovery_cases WHERE id=? AND revision=?)',values:[sourceId,row.revision]};
 for(const [milestone,work] of [['original_review',await recoveryReviewSource(db,sourceId)],['contact_review',await recoveryContactReviewSource(db,sourceId,now)]] as const)if(work.needsAction&&now>=work.dueAt)result.push({...base,milestone,sourceRevision:work.revision,dueAt:work.dueAt,permission:work.permission,predicate:work.predicate,values:work.values});
 if(view.reminderDue&&view.reminderAt!==null)result.push({...base,milestone:'day3_response',sourceRevision:String(view.responseDueAt),dueAt:view.reminderAt,sellerPrompt:true});
 const proposal=row.planJson?String((JSON.parse(row.planJson) as {proposalId?:string}).proposalId??''):'';
 for(const item of view.installments)if(item.overdue)result.push({...base,milestone:'installment_'+item.index,sourceRevision:proposal,dueAt:item.dueAt});
 if(!result.some(fact=>fact.milestone!=='day3_response')&&['arrangement','reconciliation','disputed','followup'].includes(view.phase)&&now>=row.nextActionAt)result.push({...base,milestone:'owned_next_action',sourceRevision:String(row.nextActionAt),dueAt:row.nextActionAt});
 return result;
}
export async function reminderMilestoneIdentity(fact:Pick<ReminderFact,'family'|'sourceId'|'milestone'|'sourceRevision'|'dueAt'>){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([fact.family,fact.sourceId,fact.milestone,fact.sourceRevision,fact.dueAt])));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function readReminderMilestone(db:D1Database,id:string){return db.prepare('SELECT id,family,source_id sourceId,milestone,source_revision sourceRevision,due_at dueAt FROM operational_reminder_milestones WHERE id=?').bind(id).first<ReminderMilestone>();}
async function currentFact(db:D1Database,row:ReminderMilestone,now:number){return (await reminderFacts(db,row.family,row.sourceId,now)).find(fact=>fact.milestone===row.milestone&&fact.sourceRevision===row.sourceRevision&&fact.dueAt===row.dueAt)??null;}
async function staffAllowed(db:D1Database,fact:ReminderFact,userId:string,now:number){
 if(fact.family==='review_task')return reviewTaskReminderRecipientAllowed(db,fact.sourceId,userId,now);
 try{await staffMutationGuard(db,userId,fact.permission,ReminderAuthorityError);}catch(error){if(!(error instanceof ReminderAuthorityError))throw error;if(!fact.alternativeStaffPermission)return false;try{await staffMutationGuard(db,userId,fact.alternativeStaffPermission,ReminderAuthorityError);}catch(second){if(second instanceof ReminderAuthorityError)return false;throw second;}}
 if(fact.family==='system_incident'&&!await db.prepare("SELECT 1 FROM user_roles WHERE user_id=? AND role='super_admin'").bind(userId).first()&&!await teamUserAvailable(db,userId,now))return false;
 if(fact.orderId&&!await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND '+orderPartyGuard()).bind(userId,...Array.from({length:3},()=>fact.orderId)).first())return false;
 if(fact.family==='refund_obligation'&&!await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND '+refundPartyGuard(db)).bind(userId,fact.sourceId).first())return false;
 if(fact.family==='recovery'){
  const {getSellerRecoveryReview}=await import('../payments/seller-recovery');try{await getSellerRecoveryReview(db,userId,fact.sourceId);}catch(error){if(error instanceof Error&&'status' in error&&error.status===403)return false;throw error;}
 }
 return true;
}

/** Milestones are committed first; failed queue handoff is recoverable by the next bounded scan. */
export async function reminderOperationalSource(db:D1Database,e:SourceOperationalEvent):Promise<OperationalSourceDescriptor|null>{
 if(e.kind!=='workflow.reminder')return null;
 const row=await readReminderMilestone(db,e.sourceId);if(!row)return null;
 const fact=await currentFact(db,row,e.now??Date.now());if(!fact)return null;
 const base:OperationalSourceDescriptor={guard:'EXISTS(SELECT 1 FROM operational_reminder_milestones WHERE id=? AND id=?) AND '+fact.predicate,guardValues:[e.sourceId,e.eventId,...fact.values],ownerSql:null,ownerValues:[],audience:'staff',staffPermission:fact.permission,relatedType:'operational_reminder',subject:fact.milestone==='clarification_reminder'?'Requested clarification is still outstanding':'Original follow-up needs attention',staffGuard:'1=1',staffGuardValues:[],...fact.alternativeStaffPermission?{alternativeStaffPermission:fact.alternativeStaffPermission}:{}};
 if(fact.customerPrompt){base.audience='customer';base.ownerSql='SELECT customer_id FROM orders WHERE id=?';base.ownerValues=[fact.orderId];}
 else if(fact.sellerPrompt){base.audience='seller';base.ownerSql=fact.family==='recovery'?'SELECT maker.user_id FROM seller_recovery_cases original JOIN seller_profiles maker ON maker.id=original.seller_id WHERE original.id=?':fact.family==='return_request'?'SELECT maker.user_id FROM return_requests original JOIN order_items item ON item.id=original.order_item_id JOIN seller_profiles maker ON maker.id=item.seller_id WHERE original.id=?':'SELECT maker.user_id FROM complaints original JOIN order_items item ON item.id=original.order_item_id JOIN seller_profiles maker ON maker.id=item.seller_id WHERE original.id=?';base.ownerValues=[fact.sourceId];}
 const eligible=[];for(const id of new Set([fact.ownerId,fact.backupId].filter((id):id is string=>!!id)))if(await staffAllowed(db,fact,id,e.now??Date.now()))eligible.push(id);
 if(fact.family==='refund_obligation'){
  base.subject=fact.milestone==='binding_due'?'Refund binding deadline is due':'Refund update is due';
 }
 const chosen=eligible.length?'(EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role=\'super_admin\') OR u.id IN('+eligible.map(()=>'?').join(',')+'))':fact.family==='system_incident'||fact.family==='refund_obligation'?"EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='super_admin')":'1=1';
 base.staffGuard=chosen;base.staffGuardValues=eligible;
 if(fact.family==='system_incident'){const clock=checkoutCommitClock(db);base.staffGuard+=` AND (EXISTS(SELECT 1 FROM user_roles oversight WHERE oversight.user_id=u.id AND oversight.role='super_admin') OR COALESCE((SELECT available FROM team_availability availability WHERE availability.user_id=u.id AND availability.starts_at<=${clock} AND availability.ends_at>${clock} ORDER BY availability.revision DESC LIMIT 1),1)=1)`;}
 if(fact.orderId){base.staffGuard+=' AND '+orderPartyGuard();base.staffGuardValues.push(...Array.from({length:3},()=>fact.orderId));}
 if(fact.family==='refund_obligation'){base.staffGuard+=' AND '+refundPartyGuard(db);base.staffGuardValues.push(fact.sourceId);}
 if(fact.family==='recovery'){
  const scalar=(name:string)=>`${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract'}(original.original_source_json,'$.${name}')`;
  base.staffGuard+=` AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases original JOIN seller_profiles maker ON maker.id=original.seller_id WHERE original.id=? AND (maker.user_id=u.id OR ${scalar('ownerId')}=u.id OR ${scalar('customerId')}=u.id OR ${scalar('originalCustomerId')}=u.id))`;base.staffGuardValues.push(fact.sourceId);
 }
 return base;
}

export async function isCurrentReminderNotice(db:D1Database,notice:CurrentOperationalNotice,now=Date.now()){
 if(notice.template!=='business.workflow.reminder')return true;if(!notice.relatedId||!notice.userId)return false;
 const row=await readReminderMilestone(db,notice.relatedId);if(!row)return false;const fact=await currentFact(db,row,now);if(!fact)return false;
 const descriptor=await reminderOperationalSource(db,{kind:'workflow.reminder',sourceId:row.id,eventId:row.id,now});if(!descriptor)return false;
 if(notice.audience==='staff'){if(!await staffAllowed(db,fact,notice.userId,now)||!await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND '+descriptor.staffGuard).bind(notice.userId,...descriptor.staffGuardValues??[]).first())return false;}
 else if(notice.audience!==descriptor.audience||!descriptor.ownerSql||!await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND u.id IN('+descriptor.ownerSql+')').bind(notice.userId,...descriptor.ownerValues).first())return false;
 const owner=descriptor.ownerSql&&await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND u.id IN('+descriptor.ownerSql+')').bind(notice.userId,...descriptor.ownerValues).first();
 for(const key of owner?['owner',notice.userId]:[notice.userId])if(notice.requestId===await operationalNotificationRequestId(notice.template,row.id,key,notice.channel))return true;
 return false;
}
