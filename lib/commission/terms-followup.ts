import {getRegisteredFeeOffers,FeePolicyError} from './coordinated-policy';
import {CommissionRateUnavailableError} from '../db/repositories/business-settings';
import {getManagedTermsOffers} from '../managed-commerce/accepted-terms';
import {feeTermsCadence,routineFeeEmailReady,FEE_DAY_MS} from './terms-cadence';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {digestFormRequest} from '../forms/submission';
import {validMailRecipient} from '../email/delivery-attempts';
import {sellerNotificationEmail} from '../sellers/registration-email';
class FeeFollowupPermissionError extends FeePolicyError{constructor(message:string){super(message,403);}}

type Offer={key:string;versionId:string;accepted:boolean;route:'registered_seller'|'managed_maker';ownerId:string;basisPoints:number;effectiveAt:number;publishedAt:number;firstSubjectAt:number};
type Case={id:string;sellerId:string;versionId:string;offerKey:string;route:string;state:'open'|'accepted'|'replaced';revision:number;publishedAt:number;effectiveAt:number;createdAt:number;observedAt:number;noticeId:string|null;staffEventId:string|null;lastContactAt:number|null;lastReplyAt:number|null;holdReviewedAt:number|null;superAdminReviewedAt:number|null;nextReviewAt:number|null;technicalIssueAt:number|null;technicalOwnerId:string|null;technicalResolvedAt:number|null;deliveryIssueAt:number|null;deliveryResolvedAt:number|null};
const columns='id,seller_id AS sellerId,source_version_id AS versionId,offer_key AS offerKey,route,state,revision,published_at AS publishedAt,effective_at AS effectiveAt,created_at AS createdAt,observed_at AS observedAt,last_notice_event_id AS noticeId,last_staff_event_id AS staffEventId,last_contact_at AS lastContactAt,last_reply_at AS lastReplyAt,hold_reviewed_at AS holdReviewedAt,super_admin_reviewed_at AS superAdminReviewedAt,next_review_at AS nextReviewAt,technical_issue_at AS technicalIssueAt,technical_owner_id AS technicalOwnerId,technical_resolved_at AS technicalResolvedAt,delivery_issue_at AS deliveryIssueAt,delivery_resolved_at AS deliveryResolvedAt';
function guard(db:D1Database,predicate:string,values:unknown[]){const id=crypto.randomUUID();return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
async function coveredOffers(db:D1Database,sellerId:string,now:number):Promise<Offer[]|null>{
 const seller=await db.prepare("SELECT s.user_id AS ownerId,s.created_at AS createdAt,u.status AS accountStatus,s.status,p.participation_route AS route,p.commercial_model AS model FROM seller_profiles s JOIN users u ON u.id=s.user_id LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=? AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('customer','seller'))").bind(sellerId).first<{ownerId:string;createdAt:number;accountStatus:string;status:string;route:string|null;model:string|null}>();
 if(!seller||seller.accountStatus!=='active'||!['submitted','under_review','approved'].includes(seller.status))return null;
 if(seller.route==='managed_maker'&&seller.model!=='managed_sale_linked_percentage_v1')return [];
 const raw=seller.route==='managed_maker'?await getManagedTermsOffers(db,sellerId,now):await getRegisteredFeeOffers(db,sellerId,now),offers:Offer[]=[];
 for(const item of [raw.current,...raw.upcoming]){
  const managed='retentionBps' in item,versionId=managed?item.settingVersionIds.retention:item.versionId;if(!versionId)continue;
  const version=await db.prepare("SELECT published_at AS publishedAt,created_at AS createdAt FROM business_setting_versions WHERE id=? AND status='published' AND created_at<=?").bind(versionId,now).first<{publishedAt:number|null;createdAt:number}>();if(!version)continue;
  offers.push({key:await digestFormRequest({offer:managed?item.id:item.context,owner:seller.ownerId}),versionId,accepted:!!item.accepted,route:managed?'managed_maker':'registered_seller',ownerId:seller.ownerId,basisPoints:managed?item.retentionBps:item.basisPoints,effectiveAt:managed?item.effectiveFrom:item.effectiveFrom??0,publishedAt:version.publishedAt??version.createdAt,firstSubjectAt:Math.max(seller.createdAt,version.publishedAt??version.createdAt)});
 }
 return offers;
}
export async function currentFeeCaseState(db:D1Database,caseId:string,now:number):Promise<'open'|'accepted'|'replaced'|'unavailable'>{
 const current=await db.prepare(`SELECT ${columns} FROM commission_terms_cases WHERE id=?`).bind(caseId).first<Case>();if(!current)return 'unavailable';const offers=await coveredOffers(db,current.sellerId,now);if(offers===null)return 'unavailable';const offer=offers.find(item=>item.key===current.offerKey);return offer?offer.accepted?'accepted':'open':'replaced';
}
function eventInsert(db:D1Database,row:Case,eventId:string,key:string,kind:string,dueAt:number,now:number,routine:boolean,actorId:string|null,detail:unknown={}){return db.prepare('INSERT INTO commission_terms_events(id,case_id,event_key,kind,due_at,created_at,routine,actor_id,detail_json) VALUES(?,?,?,?,?,?,?,?,?)').bind(eventId,row.id,key,kind,dueAt,now,routine?1:0,actorId,JSON.stringify(detail));}
async function noticeStatements(db:D1Database,row:Case,eventId:string,kind:string,now:number,routine:boolean,ownerEmail:boolean){return operationalBusinessNotificationStatements(db,{kind:'fee.terms',sourceId:eventId,eventId,actorId:'',now,status:kind,ownerEmail,detail:kind==='policy_cancelled'?'The announced future selling fee was cancelled. Its acceptance is retained as history. Review the actual current and upcoming terms; unrelated holds remain separate.':kind==='policy_replaced'?'A new published version replaces the earlier scheduled selling fee. Review the new common start and accept its exact terms; earlier acceptance does not grant consent to this version.':kind==='accepted'?'Acceptance is recorded for the exact fee terms. Upcoming terms start on their common date; separate readiness checks still apply.':kind==='hold_started'?'New orders are paused until the current selling fee is accepted. Existing orders, refunds, payouts and dashboard work keep their own rules. Review your exact terms or ask for help.':'Review your exact selling fee terms and common start. Accepting upcoming terms does not satisfy missing current terms. Sign in to review or ask for help.'});}

/** Safe to repeat after a lost acknowledgement. Reading a case never grants consent. */
export async function reconcileSellerFeeCases(db:D1Database,sellerId:string,now:number){
 const offers=await coveredOffers(db,sellerId,now);if(offers===null)return;
 const existing=(await db.prepare(`SELECT ${columns} FROM commission_terms_cases WHERE seller_id=? AND state<>'replaced' ORDER BY created_at,id`).bind(sellerId).all<Case>()).results;
 for(const old of existing)if(old.state!=='replaced'&&!offers.some(offer=>offer.key===old.offerKey)){
  const cancelled=await db.prepare('SELECT c.created_at AS cancelledAt FROM commission_common_cancellations c JOIN commission_common_policies p ON p.id=c.policy_id WHERE (p.registered_setting_id=? OR p.managed_setting_id=?) AND c.replacement_id IS NULL').bind(old.versionId,old.versionId).first<{cancelledAt:number}>(),eventId=cancelled?crypto.randomUUID():null;
  const statements=[...guard(db,'EXISTS(SELECT 1 FROM commission_terms_cases WHERE id=? AND revision=?)',[old.id,old.revision]),db.prepare("UPDATE commission_terms_cases SET state='replaced',last_notice_event_id=COALESCE(?,last_notice_event_id),revision=revision+1 WHERE id=?").bind(eventId,old.id)];
  if(cancelled&&eventId)statements.push(eventInsert(db,old,eventId,`${old.id}:policy_cancelled`,'policy_cancelled',cancelled.cancelledAt,now,false,null),...await noticeStatements(db,old,eventId,'policy_cancelled',now,false,true));await db.batch(statements);
 }
 for(const offer of offers){
  let row=existing.find(item=>item.offerKey===offer.key);if(!row&&offer.accepted)continue; // Observed historical consent is not a new acceptance event.
  if(!row){const id=crypto.randomUUID(),timing=feeTermsCadence({publishedAt:offer.publishedAt,effectiveAt:offer.effectiveAt,createdAt:offer.firstSubjectAt},now);
   await db.batch([...guard(db,"EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND u.status='active') AND EXISTS(SELECT 1 FROM business_setting_versions WHERE id=? AND status='published')",[sellerId,offer.ownerId,offer.versionId]),db.prepare("INSERT OR IGNORE INTO commission_terms_cases(id,seller_id,source_version_id,offer_key,route,state,published_at,effective_at,created_at,observed_at,next_review_at) VALUES(?,?,?,?,?,'open',?,?,?,?,?)").bind(id,sellerId,offer.versionId,offer.key,offer.route,offer.publishedAt,offer.effectiveAt,offer.firstSubjectAt,now,timing.longOpenReviewDueAt),db.prepare('INSERT OR IGNORE INTO commission_terms_email_controls(seller_id) VALUES(?)').bind(sellerId)]);
   row=await db.prepare(`SELECT ${columns} FROM commission_terms_cases WHERE seller_id=? AND offer_key=?`).bind(sellerId,offer.key).first<Case>()??undefined;if(!row)throw new FeePolicyError('The exact fee follow-up case could not be confirmed.',503);
   await db.prepare("INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline) VALUES(?,'commission_terms',?,?,?,?,?,?,1)").bind(crypto.randomUUID(),row.id,row.id,row.createdAt,timing.assignmentDueAt,timing.calendarVersion,now).run();
  }
  const taskTiming=feeTermsCadence(row,now);
  await db.prepare("INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline) VALUES(?,'commission_terms',?,?,?,?,?,?,1)").bind(crypto.randomUUID(),row.id,row.id,row.createdAt,taskTiming.assignmentDueAt,taskTiming.calendarVersion,now).run();
  if(offer.accepted){if(row.state==='accepted')continue;const eventId=crypto.randomUUID(),key=`${row.id}:accepted`;
   await db.batch([...guard(db,'EXISTS(SELECT 1 FROM commission_terms_cases WHERE id=? AND revision=?)',[row.id,row.revision]),eventInsert(db,row,eventId,key,'accepted',now,now,false,null),db.prepare("UPDATE commission_terms_cases SET state='accepted',last_notice_event_id=?,revision=revision+1 WHERE id=?").bind(eventId,row.id),...await noticeStatements(db,row,eventId,'accepted',now,false,true)]);continue;
  }
  const timing=feeTermsCadence(row,now);let notice=timing.notice;
  const holdKey=`${row.id}:hold_started:${timing.holdStartedAt}`;
  if(timing.held&&!await db.prepare('SELECT 1 FROM commission_terms_events WHERE event_key=?').bind(holdKey).first()){
   await db.batch([...guard(db,'EXISTS(SELECT 1 FROM commission_terms_cases WHERE id=? AND revision=?)',[row.id,row.revision]),eventInsert(db,row,crypto.randomUUID(),holdKey,'hold_started',timing.holdStartedAt,now,false,null),db.prepare('UPDATE commission_terms_cases SET revision=revision+1 WHERE id=?').bind(row.id)]);row.revision++;
   notice??={kind:'hold_started',dueAt:timing.holdStartedAt,routine:false};
  }
  if(!notice)continue;
  const isReplacement=notice.kind==='publication'&&!!await db.prepare('SELECT 1 FROM commission_common_policies WHERE (registered_setting_id=? OR managed_setting_id=?) AND replaces_id IS NOT NULL').bind(row.versionId,row.versionId).first();
  const noticeKind=isReplacement?'policy_replaced':notice.kind,noticeRoutine=isReplacement?false:notice.routine;
  const key=`${row.id}:${noticeKind}:${notice.dueAt}`,prior=await db.prepare('SELECT id FROM commission_terms_events WHERE event_key=?').bind(key).first<{id:string}>(),eventId=prior?.id??crypto.randomUUID();
  const controls=await db.prepare('SELECT revision,last_routine_queued_at AS queuedAt,last_personal_contact_at AS contactAt FROM commission_terms_email_controls WHERE seller_id=?').bind(sellerId).first<{revision:number;queuedAt:number|null;contactAt:number|null}>();if(!controls)throw new FeePolicyError('The shared reminder control is unavailable.',503);
  const emailExists=!!await db.prepare("SELECT 1 FROM notification_messages WHERE related_id=? AND template_key='business.fee.terms' AND audience_role='seller' AND channel='email'").bind(eventId).first(),ownerEmail=!noticeRoutine||(!emailExists&&routineFeeEmailReady(now,controls.queuedAt,controls.contactAt));
  if(prior&&(!ownerEmail||emailExists))continue;
  const statements=[...guard(db,'EXISTS(SELECT 1 FROM commission_terms_cases WHERE id=? AND revision=?)',[row.id,row.revision])];if(!prior)statements.push(eventInsert(db,row,eventId,key,noticeKind,notice.dueAt,now,noticeRoutine,null));
  statements.push(db.prepare("UPDATE commission_terms_cases SET state='open',last_notice_event_id=?,revision=revision+1 WHERE id=?").bind(eventId,row.id));
  if(noticeRoutine&&ownerEmail)statements.push(...guard(db,'EXISTS(SELECT 1 FROM commission_terms_email_controls WHERE seller_id=? AND revision=?)',[sellerId,controls.revision]),db.prepare('UPDATE commission_terms_email_controls SET last_routine_queued_at=?,revision=revision+1 WHERE seller_id=?').bind(now,sellerId));
  statements.push(...await noticeStatements(db,row,eventId,noticeKind,now,noticeRoutine,ownerEmail));await db.batch(statements);
 }
 await reconcileFeeStaffFollowup(db,sellerId,now);
}

/** Shared source check used immediately before bell projection and email dispatch. */
export async function currentFeeEvent(db:D1Database,eventId:string,now:number){
 const event=await db.prepare(`SELECT e.id,e.case_id AS caseId,e.kind,e.routine,e.due_at AS dueAt,e.created_at AS eventCreatedAt,c.last_notice_event_id AS noticeId,c.last_staff_event_id AS staffEventId,c.published_at AS publishedAt,c.effective_at AS effectiveAt,c.created_at AS createdAt,s.user_id AS ownerId FROM commission_terms_events e JOIN commission_terms_cases c ON c.id=e.case_id JOIN seller_profiles s ON s.id=c.seller_id WHERE e.id=?`).bind(eventId).first<{id:string;caseId:string;kind:string;routine:number;dueAt:number;eventCreatedAt:number;noticeId:string|null;staffEventId:string|null;publishedAt:number;effectiveAt:number;createdAt:number;ownerId:string}>();
 if(!event)return null;const state=await currentFeeCaseState(db,event.caseId,now);if(event.kind==='accepted')return state==='accepted'&&event.noticeId===event.id?event:null;
 if(event.kind==='policy_cancelled')return state==='replaced'&&event.noticeId===event.id&&await db.prepare('SELECT 1 FROM commission_terms_cases t JOIN commission_common_policies p ON (p.registered_setting_id=t.source_version_id OR p.managed_setting_id=t.source_version_id) JOIN commission_common_cancellations c ON c.policy_id=p.id WHERE t.id=? AND c.replacement_id IS NULL').bind(event.caseId).first()?event:null;
 if(state!=='open')return null;if(['followup','contact','hold_review','super_admin_review','technical_issue','technical_assign','technical_resolved'].includes(event.kind))return event.staffEventId===event.id?event:null;
 if(event.kind==='manual_resend')return event.noticeId===event.id&&now<event.eventCreatedAt+FEE_DAY_MS?event:null;
 if(event.noticeId!==event.id)return null;const timing=feeTermsCadence(event,now);if(event.kind==='hold_started')return timing.held?event:null;
 if(event.kind==='policy_replaced')return !timing.held&&timing.notice?.kind==='publication'?event:null;
 return timing.notice?.kind===event.kind&&timing.notice.dueAt===event.dueAt?event:null;
}

export async function recordFeeTermsContact(db:D1Database,ctx:CommandContext,input:{caseId:string;action:'contact'|'hold_review'|'super_admin_review'|'technical_issue'|'technical_assign'|'technical_resolved'|'manual_resend';technicalOwnerId?:string;outcome:string;note:string;nextAction:string;nextUpdateAt:number}){
 const role=['super_admin_review','technical_assign'].includes(input.action)?'super_admin':undefined,authority=await staffMutationGuard(db,ctx.actorId,'seller.application.review',FeeFollowupPermissionError,role);
 if(input.note.trim().length<10||input.note.length>1000||input.nextAction.trim().length<5||input.nextAction.length>500||!Number.isSafeInteger(input.nextUpdateAt)||input.nextUpdateAt<=ctx.now||input.nextUpdateAt>ctx.now+7*FEE_DAY_MS||!['reached','unreachable','help_needed','declined','not_ready','technical_issue','support_path'].includes(input.outcome))throw new FeePolicyError('Record a truthful bounded outcome, next action and review within seven days.',400);
 const source={action:'commission.terms.'+input.action,subjectType:'commission_terms_case',subjectId:input.caseId},receipt=await commandReceipt(db,ctx,source,input);if(receipt.replayed)return receipt.result;
 const row=await db.prepare(`SELECT ${columns} FROM commission_terms_cases WHERE id=?`).bind(input.caseId).first<Case>();if(!row||ctx.expectedRevision!==String(row.revision)||await currentFeeCaseState(db,row.id,ctx.now)!=='open')throw new FeePolicyError('Review the current unresolved fee case.');
 const owner=await db.prepare("SELECT s.user_id AS id FROM seller_profiles s WHERE s.id=?").bind(row.sellerId).first<{id:string}>();if(owner?.id===ctx.actorId)throw new FeePolicyError('A personally conflicted actor cannot record this staff follow-up.',403);
 const eventId=crypto.randomUUID(),statements=[...authority.statements,...guard(db,"EXISTS(SELECT 1 FROM commission_terms_cases WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id=? AND user_id<>?) AND EXISTS(SELECT 1 FROM business_setting_versions WHERE id=? AND status='published' AND (effective_until IS NULL OR effective_until>?))",[row.id,row.revision,row.sellerId,owner!.id,ctx.actorId,row.versionId,ctx.now]),eventInsert(db,row,eventId,`${row.id}:${ctx.requestId}`,input.action,ctx.now,ctx.now,input.action==='manual_resend',ctx.actorId,input),receipt.insert({id:eventId})];
 if(input.action==='contact'){statements.push(db.prepare('UPDATE commission_terms_cases SET last_contact_at=?,last_reply_at=CASE WHEN ?=\'unreachable\' THEN last_reply_at ELSE ? END WHERE id=?').bind(ctx.now,input.outcome,ctx.now,row.id));if(input.outcome!=='unreachable')statements.push(db.prepare('UPDATE commission_terms_email_controls SET last_personal_contact_at=?,revision=revision+1 WHERE seller_id=?').bind(ctx.now,row.sellerId));}
 if(input.action==='hold_review')statements.push(db.prepare('UPDATE commission_terms_cases SET hold_reviewed_at=? WHERE id=?').bind(ctx.now,row.id));
 if(input.action==='super_admin_review')statements.push(db.prepare('UPDATE commission_terms_cases SET super_admin_reviewed_at=? WHERE id=?').bind(ctx.now,row.id));
 if(input.action==='technical_issue')statements.push(db.prepare('UPDATE commission_terms_cases SET technical_issue_at=COALESCE(technical_issue_at,?),technical_resolved_at=NULL WHERE id=?').bind(ctx.now,row.id));
 if(input.action==='technical_assign'){
  if(typeof input.technicalOwnerId!=='string')throw new FeePolicyError('Choose a current technical support owner.',400);
  const technicalAuthority=await staffMutationGuard(db,input.technicalOwnerId,'seller.application.review',FeePolicyError);statements.push(...technicalAuthority.statements);
  statements.push(...guard(db,"EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN ('admin','super_admin'))",[input.technicalOwnerId]),db.prepare('UPDATE commission_terms_cases SET technical_owner_id=? WHERE id=?').bind(input.technicalOwnerId,row.id));
 }
 if(input.action==='technical_resolved'){
  if(row.technicalIssueAt===null||input.outcome!=='support_path')throw new FeePolicyError('Record a tested fix or usable support path for the reported technical issue.',400);
  statements.push(...guard(db,"EXISTS(SELECT 1 FROM commission_terms_cases WHERE id=? AND technical_owner_id=?) OR EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role='super_admin')",[row.id,ctx.actorId,ctx.actorId]),db.prepare('UPDATE commission_terms_cases SET technical_resolved_at=? WHERE id=?').bind(ctx.now,row.id));
 }
 if(input.action==='manual_resend'){
  const control=await db.prepare('SELECT revision,last_routine_queued_at AS queuedAt,last_personal_contact_at AS contactAt FROM commission_terms_email_controls WHERE seller_id=?').bind(row.sellerId).first<{revision:number;queuedAt:number|null;contactAt:number|null}>();if(!control||!routineFeeEmailReady(ctx.now,control.queuedAt,control.contactAt))throw new FeePolicyError('A routine reminder or meaningful contact was recorded within the past 24 hours. Keep the shared follow-up history.');
  statements.push(...guard(db,'EXISTS(SELECT 1 FROM commission_terms_email_controls WHERE seller_id=? AND revision=?)',[row.sellerId,control.revision]),db.prepare('UPDATE commission_terms_email_controls SET last_routine_queued_at=?,revision=revision+1 WHERE seller_id=?').bind(ctx.now,row.sellerId),db.prepare('UPDATE commission_terms_cases SET last_notice_event_id=? WHERE id=?').bind(eventId,row.id),...await noticeStatements(db,row,eventId,'manual_resend',ctx.now,true,true));
 }
 statements.push(db.prepare('UPDATE commission_terms_cases SET last_staff_event_id=?,next_review_at=?,revision=revision+1 WHERE id=?').bind(eventId,input.nextUpdateAt,row.id),...await operationalBusinessNotificationStatements(db,{kind:'fee.followup',sourceId:eventId,eventId,actorId:ctx.actorId,now:ctx.now,status:input.action,detail:'A staff follow-up was recorded. Review the exact current case, outcome and next action. Contact does not grant fee acceptance.'}));await db.batch(statements);return {id:eventId};
}

export async function feeCaseWork(db:D1Database,row:Case,now:number){
 const timing=feeTermsCadence(row,now),task=await db.prepare("SELECT t.id,t.owner_id AS ownerId,t.revision,EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=t.owner_id AND u.status='active' AND r.role='super_admin') AS ownerEligible FROM review_tasks t WHERE t.source_type='commission_terms' AND t.source_id=?").bind(row.id).first<{id:string;ownerId:string|null;revision:number;ownerEligible:number}>();
 const due:{kind:string;dueAt:number}[]= [];let technicalOwnerEligible=false;
 if(now>=timing.outreachAt&&!task?.ownerEligible)due.push({kind:'assign_owner',dueAt:timing.assignmentDueAt});
 if(!timing.held&&now>=timing.outreachAt&&(row.lastContactAt===null||row.lastContactAt<timing.outreachAt))due.push({kind:'first_guidance',dueAt:timing.preHoldContactDueAt});
 if(timing.held){
  if(row.holdReviewedAt===null||row.holdReviewedAt<timing.holdStartedAt)due.push({kind:'review_current_hold',dueAt:timing.contactDueAt});
  if(row.lastContactAt===null||row.lastContactAt<timing.holdStartedAt-FEE_DAY_MS)due.push({kind:'first_contact',dueAt:timing.contactDueAt});
  const attempts=await db.prepare("SELECT COUNT(*) AS count FROM commission_terms_events WHERE case_id=? AND kind='contact' AND created_at>=?").bind(row.id,timing.holdStartedAt-FEE_DAY_MS).first<{count:number}>();
  if((row.lastReplyAt===null||row.lastReplyAt<timing.holdStartedAt)&&Number(attempts?.count??0)<2)due.push({kind:'second_contact',dueAt:timing.retryDueAt});
  if(row.superAdminReviewedAt===null||row.superAdminReviewedAt<timing.holdStartedAt)due.push({kind:'super_admin_review',dueAt:timing.superAdminReviewDueAt});
  due.push({kind:'weekly_review',dueAt:row.nextReviewAt??timing.longOpenReviewDueAt});
 }
 if(row.technicalIssueAt!==null&&(row.technicalResolvedAt===null||row.technicalResolvedAt<row.technicalIssueAt)){
  const ownerReady=row.technicalOwnerId&&await db.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN ('admin','super_admin')").bind(row.technicalOwnerId).first();
  technicalOwnerEligible=Boolean(ownerReady);
  if(!ownerReady)due.push({kind:'technical_owner',dueAt:row.technicalIssueAt+FEE_DAY_MS});due.push({kind:'technical_support_path',dueAt:row.technicalIssueAt+2*FEE_DAY_MS});
 }
 if(row.deliveryIssueAt!==null&&(row.deliveryResolvedAt===null||row.deliveryResolvedAt<row.deliveryIssueAt)&&!task?.ownerEligible)due.push({kind:'delivery_issue_owner',dueAt:row.deliveryIssueAt+FEE_DAY_MS});
 return {timing,task,technicalOwnerEligible,actions:due.sort((a,b)=>a.dueAt-b.dueAt),overdue:due.filter(item=>item.dueAt<=now)};
}
async function reconcileFeeStaffFollowup(db:D1Database,sellerId:string,now:number){
 const rows=(await db.prepare(`SELECT ${columns} FROM commission_terms_cases WHERE seller_id=? AND state='open'`).bind(sellerId).all<Case>()).results;
 for(const row of rows){if(await currentFeeCaseState(db,row.id,now)!=='open')continue;
  const delivery = await db.prepare(`SELECT u.email,i.answers_json AS registrationAnswers,
    EXISTS(SELECT 1 FROM notification_messages n WHERE n.related_id=? AND n.audience_role='seller' AND n.channel='email' AND n.status='failed') AS failed,
    EXISTS(SELECT 1 FROM notification_messages n WHERE n.related_id=? AND n.audience_role='seller' AND n.channel='email' AND n.status='sent') AS sent
    FROM seller_profiles s JOIN users u ON u.id=s.user_id
    LEFT JOIN seller_registration_intakes i ON i.user_id=u.id AND i.seller_id=s.id WHERE s.id=?`)
    .bind(row.noticeId,row.noticeId,row.sellerId).first<{ email: string; registrationAnswers: string | null; failed: number; sent: number }>();
  const invalidAddress = !delivery || !validMailRecipient(sellerNotificationEmail(delivery.email,delivery.registrationAnswers) ?? '');
  const wasDeliveryOpen = row.deliveryIssueAt !== null && (row.deliveryResolvedAt === null || row.deliveryResolvedAt < row.deliveryIssueAt);
  if((invalidAddress||delivery?.failed)&&!wasDeliveryOpen){const changed=await db.prepare('UPDATE commission_terms_cases SET delivery_issue_at=?,delivery_resolved_at=NULL,revision=revision+1 WHERE id=? AND revision=?').bind(now,row.id,row.revision).run();if(!changed.meta.changes)continue;row.deliveryIssueAt=now;row.deliveryResolvedAt=null;row.revision++;}
  else if(wasDeliveryOpen&&!invalidAddress&&delivery?.sent){const changed=await db.prepare('UPDATE commission_terms_cases SET delivery_resolved_at=?,revision=revision+1 WHERE id=? AND revision=?').bind(now,row.id,row.revision).run();if(!changed.meta.changes)continue;row.deliveryResolvedAt=now;row.revision++;}
  const work=await feeCaseWork(db,row,now),technicalOpen=row.technicalIssueAt!==null&&(row.technicalResolvedAt===null||row.technicalResolvedAt<row.technicalIssueAt),deliveryOpen=row.deliveryIssueAt!==null&&(row.deliveryResolvedAt===null||row.deliveryResolvedAt<row.deliveryIssueAt),attention=work.overdue.length>0||now>=work.timing.outreachAt||technicalOpen||deliveryOpen;if(!attention)continue;
  const week=Math.max(0,Math.floor((now-work.timing.longOpenReviewDueAt)/(7*FEE_DAY_MS))),technicalDay=technicalOpen?Math.max(0,Math.floor((now-row.technicalIssueAt!)/FEE_DAY_MS)):null,key=await digestFormRequest({caseId:row.id,overdue:work.overdue,owner:work.task?.ownerEligible?work.task.ownerId:null,week,technicalDay,deliveryIssue:deliveryOpen?row.deliveryIssueAt:null});if(await db.prepare('SELECT 1 FROM commission_terms_events WHERE event_key=?').bind(key).first())continue;
  const id=crypto.randomUUID(),dueAt=work.overdue[0]?.dueAt??work.timing.outreachAt;
  await db.batch([...guard(db,"EXISTS(SELECT 1 FROM commission_terms_cases WHERE id=? AND revision=? AND state='open')",[row.id,row.revision]),eventInsert(db,row,id,key,'followup',dueAt,now,false,null,{overdue:work.overdue,technicalOpen,week}),db.prepare('UPDATE commission_terms_cases SET last_staff_event_id=?,revision=revision+1 WHERE id=?').bind(id,row.id),...await operationalBusinessNotificationStatements(db,{kind:'fee.followup',sourceId:id,eventId:id,actorId:'',now,detail:'A selling fee case requires current staff attention. Review ownership, original deadlines, delivery issues and the next appropriate help step. No deadline grants acceptance.'})]);
 }
}

/** One grouped staff email covers each newly held case exactly once. */
export async function queueFeeHoldBatch(db:D1Database,now:number){
 const candidates=(await db.prepare("SELECT e.id,e.case_id AS caseId FROM commission_terms_events e WHERE e.kind='hold_started' AND NOT EXISTS(SELECT 1 FROM commission_terms_hold_batch_events b WHERE b.event_id=e.id) ORDER BY e.created_at,e.id LIMIT 50").all<{id:string;caseId:string}>()).results,events=[] as {id:string;caseId:string}[];for(const event of candidates)if(await currentFeeCaseState(db,event.caseId,now)==='open')events.push(event);if(!candidates.length)return null;
 const id=crypto.randomUUID(),statements=[db.prepare('INSERT INTO commission_terms_hold_batches(id,created_at) VALUES(?,?)').bind(id,now)];for(const event of candidates)statements.push(db.prepare('INSERT INTO commission_terms_hold_batch_events(event_id,batch_id) VALUES(?,?)').bind(event.id,id));if(events.length)statements.push(...await operationalBusinessNotificationStatements(db,{kind:'fee.holds',sourceId:id,eventId:id,actorId:'',now,detail:'Sellers entered a current selling fee hold. Open the shared follow-up queue to review every current affected seller, owner and contact deadline. Existing order work and historical money remain independent.'}));await db.batch(statements);return events.length?id:null;
}
export async function currentFeeHoldBatch(db:D1Database,batchId:string,now:number){const events=(await db.prepare('SELECT e.case_id AS caseId FROM commission_terms_hold_batch_events b JOIN commission_terms_events e ON e.id=b.event_id WHERE b.batch_id=?').bind(batchId).all<{caseId:string}>()).results;for(const event of events)if(await currentFeeCaseState(db,event.caseId,now)==='open')return true;return false;}
export async function getFeeTermsWorkspace(db:D1Database,actorId:string,now:number=Date.now()){
 const authority=await staffMutationGuard(db,actorId,'seller.application.review',FeeFollowupPermissionError),statements=[...authority.statements],work=[];
 const rows=(await db.prepare(`SELECT ${columns} FROM commission_terms_cases WHERE state<>'replaced' ORDER BY created_at,id`).all<Case>()).results;
 for(const row of rows){
  const seller=await db.prepare('SELECT user_id AS ownerId,trading_name AS name,status,updated_at AS updatedAt FROM seller_profiles WHERE id=?').bind(row.sellerId).first<{ownerId:string;name:string;status:string;updatedAt:number}>();
  if(!seller||seller.ownerId===actorId)continue;
  const state=await currentFeeCaseState(db,row.id,now);if(state==='replaced')continue;
  // The immutable offer key binds its original party. A changed current owner
  // cannot turn a retained personal case into an independent staff case.
  const offers=row.route==='managed_maker'?await getManagedTermsOffers(db,row.sellerId,now):await getRegisteredFeeOffers(db,row.sellerId,now);
  let sourceBound=false;
  for(const offer of [offers.current,...offers.upcoming]){
   const managed='retentionBps' in offer,versionId=managed?offer.settingVersionIds.retention:offer.versionId;
   if(versionId===row.versionId&&await digestFormRequest({offer:managed?offer.id:offer.context,owner:seller.ownerId})===row.offerKey){sourceBound=true;break;}
  }
  if(!sourceBound)throw new FeePolicyError('The original fee follow-up party/source could not be verified. Refresh the source before reading private history.',503);
  const history=(await db.prepare('SELECT kind,created_at AS createdAt,detail_json AS detailJson FROM commission_terms_events WHERE case_id=? ORDER BY created_at DESC,id DESC LIMIT 30').bind(row.id).all<{kind:string;createdAt:number;detailJson:string}>()).results;
  work.push({...row,state,sellerName:seller.name,history:history.map(event=>({...event,detail:JSON.parse(event.detailJson) as {note?:string;nextAction?:string;outcome?:string}})),...await feeCaseWork(db,row,now)});
  statements.push(...guard(db,`EXISTS(SELECT 1 FROM commission_terms_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=? AND c.revision=? AND c.source_version_id=? AND c.offer_key=? AND c.state=? AND s.user_id=? AND s.user_id<>? AND s.trading_name=? AND s.status=? AND s.updated_at=?)`,[row.id,row.revision,row.versionId,row.offerKey,row.state,seller.ownerId,actorId,seller.name,seller.status,seller.updatedAt]));
 }
 // Final native authority/source checks run after every asynchronous private read.
 await staffMutationGuard(db,actorId,'seller.application.review',FeeFollowupPermissionError);
 try{await db.batch(statements);}catch{
  await staffMutationGuard(db,actorId,'seller.application.review',FeeFollowupPermissionError);
  for(const item of work)if(await db.prepare('SELECT 1 FROM seller_profiles WHERE id=? AND user_id=?').bind(item.sellerId,actorId).first())throw new FeeFollowupPermissionError('This private staff source is now personally related to the signed-in actor.');
  throw new FeePolicyError('The fee follow-up source changed during the read. Refresh the exact current source.',409);
 }
 return work;
}
export async function getFeeTermsCase(db:D1Database,id:string,now:number){const row=await db.prepare(`SELECT ${columns} FROM commission_terms_cases WHERE id=?`).bind(id).first<Case>();if(!row)return null;const seller=await db.prepare('SELECT user_id AS ownerId,trading_name AS sellerName FROM seller_profiles WHERE id=?').bind(row.sellerId).first<{ownerId:string;sellerName:string}>();return {...row,ownerId:seller?.ownerId??'',sellerName:seller?.sellerName??row.sellerId,state:await currentFeeCaseState(db,id,now),...await feeCaseWork(db,row,now)};}

/** Delivery reservation supplements enqueue throttling; delayed workers cannot burst mail. */
export async function claimFeeRoutineDelivery(db:D1Database,messageId:string,token:string,now:number):Promise<{cancel?:boolean;deferUntil?:number;claimed?:boolean}>{
 const source=await db.prepare("SELECT e.id,e.routine,c.seller_id AS sellerId FROM notification_messages n JOIN commission_terms_events e ON e.id=n.related_id JOIN commission_terms_cases c ON c.id=e.case_id WHERE n.id=? AND n.template_key='business.fee.terms' AND n.audience_role='seller' AND n.channel='email'").bind(messageId).first<{id:string;routine:number;sellerId:string}>();if(!source)return {};
 if(!await currentFeeEvent(db,source.id,now))return {cancel:true};if(!source.routine)return {};
 const control=await db.prepare('SELECT revision,last_routine_sent_at AS sentAt,last_routine_message_id AS lastMessage,last_personal_contact_at AS contactAt,routine_claim_message_id AS claimMessage,routine_claim_until AS claimUntil FROM commission_terms_email_controls WHERE seller_id=?').bind(source.sellerId).first<{revision:number;sentAt:number|null;lastMessage:string|null;contactAt:number|null;claimMessage:string|null;claimUntil:number}>();if(!control)throw new FeePolicyError('Routine delivery control is unavailable.',503);
 const nextAt=Math.max(control.contactAt===null?0:control.contactAt+FEE_DAY_MS,control.sentAt===null||control.lastMessage===messageId?0:control.sentAt+FEE_DAY_MS,control.claimMessage===messageId?0:control.claimUntil);if(nextAt>now)return {deferUntil:nextAt};
 const claim=await db.prepare('UPDATE commission_terms_email_controls SET routine_claim_token=?,routine_claim_message_id=?,routine_claim_until=?,revision=revision+1 WHERE seller_id=? AND revision=?').bind(token,messageId,now+15*60000,source.sellerId,control.revision).run();if(!claim.meta.changes)return {deferUntil:now+60000};
 if(!await currentFeeEvent(db,source.id,now)){await finishFeeRoutineDelivery(db,token,null,now);return {cancel:true};}return {claimed:true};
}
export async function finishFeeRoutineDelivery(db:D1Database,token:string,messageId:string|null,now:number){
 if(messageId)await db.prepare('UPDATE commission_terms_email_controls SET last_routine_sent_at=?,last_routine_message_id=?,routine_claim_token=NULL,routine_claim_message_id=NULL,routine_claim_until=0,revision=revision+1 WHERE routine_claim_token=?').bind(now,messageId,token).run();
 else await db.prepare('UPDATE commission_terms_email_controls SET routine_claim_token=NULL,routine_claim_message_id=NULL,routine_claim_until=0,revision=revision+1 WHERE routine_claim_token=?').bind(token).run();
}

/** Scheduler-only bounded scan. Cursor progress never changes the effective fee gate. */
export async function processFeeTermsScan(db:D1Database,now:number,limit=25){
 if(!Number.isSafeInteger(now)||now<=0||!Number.isInteger(limit)||limit<1||limit>100)throw new FeePolicyError('Use a bounded authoritative terms scan.',400);
 const scan=await db.prepare("SELECT `cursor`,revision FROM commission_terms_scan_state WHERE id='default'").first<{cursor:string;revision:number}>();if(!scan)throw new FeePolicyError('Fee follow-up schema readiness is required.',503);
 const sellers=(await db.prepare("SELECT s.id FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id>? AND u.status='active' AND s.status IN ('submitted','under_review','approved') ORDER BY s.id LIMIT ?").bind(scan.cursor,limit).all<{id:string}>()).results;
 const failures:{sellerId:string;code:'commission_rate_unavailable'|'source_requires_review';message:string}[]=[];
 for(const seller of sellers){
  try{await reconcileSellerFeeCases(db,seller.id,now);}
  catch(error){
   const missingRate=error instanceof CommissionRateUnavailableError;
   failures.push({sellerId:seller.id,code:missingRate?'commission_rate_unavailable':'source_requires_review',message:missingRate||error instanceof FeePolicyError?error.message:'The exact terms source or concurrent case outcome requires another scan.'});
  }
 }
 const cursor=sellers.length===limit?sellers.at(-1)!.id:'';await db.prepare("UPDATE commission_terms_scan_state SET `cursor`=?,revision=revision+1 WHERE id='default' AND revision=?").bind(cursor,scan.revision).run();const holdBatch=await queueFeeHoldBatch(db,now);return {scanned:sellers.length,cursor,failures,holdBatch};
}
