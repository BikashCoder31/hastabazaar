import {actualRecoveryAllocationSql,verifiedRecoveryReceiptSql} from './recovery-receipt-accounting';
import {readRecoveryCalculationReviews} from './recovery-calculation-reviews';
import {getSellerRecoveryReview,readSellerRecoverySource,SellerRecoveryError} from './seller-recovery';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {calculateServiceDueAt,CONTINUOUS_CALENDAR_VERSION} from '../workflows/service-clock';
import {operationalNotificationRequestId} from '../operations/event-catalog';
import {paymentGuard} from './manual-receipts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {ensureReviewTask} from '../workflows/review-tasks';
import {pendingRecoveryDisputes} from './recovery-disputes';
import {recoveryArrangementReviewWork} from './recovery-arrangements';

const day=86400000;
class ContactAuthorityError extends SellerRecoveryError {constructor(message:string){super(message,403);}}
async function facts(db:D1Database,id:string){
 const event=await db.prepare("SELECT e.id,e.revision,e.request_id AS requestId,e.created_at AS createdAt,NOT EXISTS(SELECT 1 FROM seller_recovery_events earlier WHERE earlier.case_id=e.case_id AND earlier.action='approved' AND earlier.revision<e.revision) AS isFirst FROM seller_recovery_events e WHERE e.case_id=? AND e.action='approved' ORDER BY e.revision DESC LIMIT 1").bind(id).first<{id:string;revision:number;requestId:string;createdAt:number;isFirst:number}>();
 const row=await db.prepare(`SELECT c.id,c.source_kind AS kind,c.source_id AS sourceId,c.revision,c.state,c.owner_id AS ownerId,c.backup_id AS backupId,c.approved_at AS approvedAt,c.approved_cap_paisa AS approvedCap,c.disputed_paisa AS disputed,c.confirmed_paisa AS confirmed,
  c.created_at AS createdAt,c.first_review_due_at AS firstReviewDueAt,c.next_action_at AS nextActionAt,c.plan_json AS planJson,c.blocker,s.user_id AS sellerOwner,json_extract(c.original_source_json,'$.ownerId') AS originalOwner,json_extract(c.original_source_json,'$.customerId') AS originalCustomer,
  c.confirmed_paisa-c.absorbed_paisa-COALESCE((SELECT SUM(history.amount_paisa) FROM seller_recovery_historical_attributions history WHERE history.case_id=c.id),0)+COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.case_id=c.id AND restored.allocation_id IS NULL),0)-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND (a.receipt_id IS NULL OR EXISTS(SELECT 1 FROM company_money_receipts receipt WHERE receipt.id=a.receipt_id AND ${verifiedRecoveryReceiptSql('receipt')}))),0) AS remaining,
  EXISTS(SELECT 1 FROM seller_recovery_proposals p WHERE p.case_id=c.id AND p.case_revision>=?) AS proposed,
  (EXISTS(SELECT 1 FROM seller_recovery_events e WHERE e.case_id=c.id AND e.action='disputed' AND e.revision>?) OR EXISTS(SELECT 1 FROM seller_recovery_repayment_claims q WHERE q.case_id=c.id AND (q.case_revision>=? OR q.case_revision IS NULL AND ?=1 OR EXISTS(SELECT 1 FROM seller_recovery_claim_events response WHERE response.claim_id=q.id AND response.action='evidence_supplied' AND response.case_revision>=?)))) AS respondedByDispute,
  EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN seller_recovery_events e ON e.request_id=a.request_id WHERE a.case_id=c.id AND e.revision>?) AS respondedByPayment
  FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?`).bind(event?.revision??0,event?.revision??0,event?.revision??0,event?.isFirst??0,event?.revision??0,event?.revision??0,id)
  .first<{id:string;kind:'refund'|'supplier_adjustment';sourceId:string;revision:number;state:string;ownerId:string;backupId:string|null;approvedAt:number|null;approvedCap:number;confirmed:number;disputed:number;createdAt:number;firstReviewDueAt:number;nextActionAt:number;planJson:string|null;blocker:string|null;sellerOwner:string;originalOwner:string;originalCustomer:string|null;remaining:number;proposed:number;respondedByDispute:number;respondedByPayment:number}>();
 if(!row)throw new SellerRecoveryError('Open the original recovery case.',404);
 const original=await readSellerRecoverySource(db,{kind:row.kind,id:row.sourceId});
 row.blocker=row.blocker??original.blocker??(original.historicalReview&&original.historicalReview.recordedPaisa!==original.historicalReview.recognizedPaisa?'Review the older historical counter against explicit attribution records.':null)??(row.approvedCap>0&&original.confirmedPaisa!==row.confirmed?'Review the changed original liability before requesting collection.':null);
 const needsResponse=row.approvedCap>0&&row.remaining>0&&!row.blocker&&!row.disputed&&!row.proposed&&!row.respondedByDispute&&!row.respondedByPayment&&['open','part_recovered'].includes(row.state);
 const inboxKey=event?await operationalNotificationRequestId('business.seller.recovery',event.requestId,'owner','in_app'):null;
 const emailKey=event?await operationalNotificationRequestId('business.seller.recovery',event.requestId,'owner','email'):null;
 const inbox=inboxKey?await db.prepare("SELECT id,created_at AS createdAt FROM notification_messages WHERE request_id=? AND recipient_user_id=? AND related_id=? AND channel='in_app'").bind(inboxKey,row.sellerOwner,id).first<{id:string;createdAt:number}>():null;
 const email=emailKey?await db.prepare("SELECT id,sent_at AS sentAt FROM notification_messages WHERE request_id=? AND recipient_user_id=? AND related_id=? AND channel='email' AND status='sent' AND delivery_transport='provider' AND sent_at IS NOT NULL").bind(emailKey,row.sellerOwner,id).first<{id:string;sentAt:number}>():null;
 return {row,original,needsResponse,event,inbox,email};
}
type ApprovalNotice={id:string;requestId:string};
/** Internal read; the caller must authorize the original owner or independent Finance actor. */
export async function readRecoveryContactHistory(db:D1Database,caseId:string){
 return (await db.prepare(`SELECT contact.id,contact.method,contact.actual_at AS actualAt,contact.recorded_at AS recordedAt,
  COALESCE(modern.response_due_at,legacy.response_due_at) AS responseDueAt
  FROM seller_recovery_contacts contact LEFT JOIN seller_recovery_response_windows modern ON modern.contact_id=contact.id
  LEFT JOIN seller_recovery_contact_windows legacy ON legacy.contact_id=contact.id
  WHERE contact.case_id=? ORDER BY contact.recorded_at,contact.id`).bind(caseId).all<{id:string;method:string;actualAt:number;recordedAt:number;responseDueAt:number|null}>()).results;
}
async function windowRow(db:D1Database,id:string,event:ApprovalNotice|null){
 if(!event)return null;
 return db.prepare(`SELECT contact_id AS contactId,started_at AS startedAt,reminder_at AS reminderAt,response_due_at AS responseDueAt,review_due_at AS reviewDueAt FROM seller_recovery_response_windows WHERE case_id=? AND approval_event_id=?
 UNION ALL SELECT w.contact_id,w.started_at,w.reminder_at,w.response_due_at,w.review_due_at FROM seller_recovery_contact_windows w JOIN seller_recovery_contacts c ON c.id=w.contact_id WHERE w.case_id=? AND c.notice_request_id=? LIMIT 1`).bind(id,event.id,id,event.requestId).first<{contactId:string;startedAt:number;reminderAt:number;responseDueAt:number;reviewDueAt:number}>();
}
function windowStatement(db:D1Database,caseId:string,approvalId:string,contactId:string,start:number){
 const review=calculateServiceDueAt({startedAt:start+7*day,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION});
 return db.prepare(`INSERT OR IGNORE INTO seller_recovery_response_windows(id,case_id,approval_event_id,contact_id,started_at,reminder_at,response_due_at,review_due_at,calendar_version) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),caseId,approvalId,contactId,start,start+3*day,start+7*day,review,CONTINUOUS_CALENDAR_VERSION);
}

/** Internal source observer. A captured/legacy/unknown transport cannot establish real handoff. */
export async function observeRecoveryEmailContact(db:D1Database,caseId:string,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw new SellerRecoveryError('Use the current authoritative contact clock.');
 const f=await facts(db,caseId),existing=await windowRow(db,caseId,f.event);if(existing)return existing;
 if(!f.needsResponse||!f.event||!f.inbox||!f.email||f.email.sentAt>now)return null;
 const id=crypto.randomUUID(),requestId='recovery-email:'+f.email.id,start=Math.max(f.inbox.createdAt,f.email.sentAt);
 await db.batch([...paymentGuard(db,'EXISTS(SELECT 1 FROM seller_recovery_cases WHERE id=? AND revision=?)',[caseId,f.row.revision]),
  db.prepare(`INSERT OR IGNORE INTO seller_recovery_contacts(id,case_id,notice_request_id,inbox_message_id,email_message_id,method,actual_at,evidence_reference,reason,request_id,recorded_at)
   VALUES(?,?,?,?,?,'provider_handoff',?,'Original successful provider handoff','The itemized notice is available in the inbox and the provider accepted its email.',?,?)`)
   .bind(id,caseId,f.event.requestId,f.inbox.id,f.email.id,f.email.sentAt,requestId,now),
  db.prepare(`INSERT OR IGNORE INTO seller_recovery_response_windows(id,case_id,approval_event_id,contact_id,started_at,reminder_at,response_due_at,review_due_at,calendar_version)
   SELECT ?,?,?,id,?,?,?,?,? FROM seller_recovery_contacts WHERE request_id=? AND case_id=?`)
   .bind(crypto.randomUUID(),caseId,f.event.id,start,start+3*day,start+7*day,calculateServiceDueAt({startedAt:start+7*day,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION}),CONTINUOUS_CALENDAR_VERSION,requestId,caseId)]);
 return windowRow(db,caseId,f.event);
}

/** A factual contact record does not change liability, approval or the financial revision. */
export async function recordRecoveryContact(db:D1Database,ctx:CommandContext,input:{caseId:string;actualAt:number;evidenceReference:string;reason:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.prepare',ContactAuthorityError);
 await getSellerRecoveryReview(db,ctx.actorId,input.caseId);
 const receipt=await commandReceipt(db,ctx,{action:'seller.recovery.contact',subjectType:'seller_recovery',subjectId:input.caseId},input);
 if(receipt.replayed)return receipt.result as {id:string};
 const f=await facts(db,input.caseId),existing=await windowRow(db,input.caseId,f.event);
 if(!f.event||!f.inbox||ctx.expectedRevision!==String(f.row.revision)||!Number.isSafeInteger(input.actualAt)||input.actualAt<f.event.createdAt||input.actualAt>ctx.now||input.reason.trim().length<10||input.reason.length>1500||input.evidenceReference.trim().length<8||input.evidenceReference.length>1500)
  throw new SellerRecoveryError('Record actual contact after the itemized notice, with its current case revision and evidence.',400);
 const id=crypto.randomUUID(),result={id},clock=checkoutCommitClock(db);
 await db.batch([...authority.statements,...paymentGuard(db,'EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=? AND c.revision=? AND s.user_id=?)',[input.caseId,f.row.revision,f.row.sellerOwner]),
  db.prepare(`INSERT INTO seller_recovery_contacts(id,case_id,notice_request_id,inbox_message_id,method,actor_id,actual_at,evidence_reference,reason,request_id,recorded_at) VALUES(?,?,?,?,'staff_contact',?,?,?,?,?,${clock})`)
   .bind(id,input.caseId,f.event.requestId,f.inbox.id,ctx.actorId,input.actualAt,input.evidenceReference.trim(),input.reason.trim(),ctx.requestId),
  ...(f.needsResponse&&!existing?[windowStatement(db,input.caseId,f.event.id,id,Math.max(input.actualAt,f.inbox.createdAt))]:[]),...authority.statements,receipt.insert(result)]);
 return result;
}

/** Internal projection: callers must enforce the staff or original-owner boundary before returning it. */
export async function readRecoveryFollowup(db:D1Database,caseId:string,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw new SellerRecoveryError('Use the current authoritative follow-up clock.');
 const f=await facts(db,caseId),window=await windowRow(db,caseId,f.event),remaining=Math.max(0,f.row.remaining);
 const contactNeeded=f.needsResponse&&!window&&now>=(f.event?.createdAt??now)+5*60000;
 const responseOverdue=f.needsResponse&&!!window&&now>=window.responseDueAt;
 const reminderDue=f.needsResponse&&!!window&&now>=window.reminderAt&&now<window.responseDueAt;
 const plan=f.row.planJson?JSON.parse(f.row.planJson) as {proposalId?:string}:null;
 const proposal=plan?.proposalId?await db.prepare('SELECT id,amount_paisa AS amount,installments_json AS installmentsJson FROM seller_recovery_proposals WHERE id=? AND case_id=?').bind(plan.proposalId,caseId).first<{id:string;amount:number;installmentsJson:string}>():null;
 let settled=proposal?Math.max(0,proposal.amount-remaining):0;
 let protectedAmount=f.row.blocker?remaining:Math.min(remaining,f.row.disputed);
 const installments=proposal?(JSON.parse(proposal.installmentsJson) as {amountPaisa:number;dueAt:number}[]).map((item,index)=>{const covered=Math.min(settled,item.amountPaisa);settled-=covered;const outstanding=item.amountPaisa-covered,paused=Math.min(protectedAmount,outstanding);protectedAmount-=paused;return {...item,index,settledPaisa:covered,remainingPaisa:outstanding,pausedPaisa:paused,collectiblePaisa:outstanding-paused,overdue:outstanding>paused&&now>=item.dueAt};}):[];
 return {caseId,revision:f.row.revision,ownerId:f.row.ownerId,backupId:f.row.backupId,sellerOwner:f.row.sellerOwner,needsResponse:f.needsResponse,
  phase:f.row.blocker||f.row.remaining<0?'reconciliation':f.row.disputed?'disputed':!remaining?'closed':proposal?'arrangement':f.row.approvedCap===0?'review':responseOverdue?'response_review':contactNeeded?'contact_needed':f.needsResponse?'awaiting_response':'followup',
  responseDueAt:window?.responseDueAt??null,reminderAt:window?.reminderAt??null,reviewDueAt:window?.reviewDueAt??null,reminderDue,responseOverdue,
  firstReviewDueAt:f.row.firstReviewDueAt,nextActionAt:f.row.nextActionAt,installments,unplannedPaisa:proposal?Math.max(0,remaining-proposal.amount):remaining,
  contactWork:contactNeeded?{key:'contact:'+f.event!.requestId,startedAt:f.event!.createdAt+5*60000,dueAt:calculateServiceDueAt({startedAt:f.event!.createdAt+5*60000,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION}),nextAction:'Confirm delivery of the itemized statement and record actual contact; do not mark the seller late.'}:null};
}

/** Shared owned work uses the retained contact/deadline identity, never today's date as a new source. */
export async function recoveryContactReviewSource(db:D1Database,caseId:string,now:number){
 const f=await facts(db,caseId),view=await readRecoveryFollowup(db,caseId,now),window=await windowRow(db,caseId,f.event);
 const task=view.contactWork??(view.responseOverdue&&window?{key:'response:'+window.contactId,startedAt:window.responseDueAt,dueAt:window.reviewDueAt}:null);
 return {revision:task?.key??'inactive:'+caseId,ownerId:f.row.sellerOwner,sellerId:f.original.sellerId,conflictIds:[f.original.customerId,f.row.originalOwner,f.row.originalCustomer].filter((v):v is string=>!!v),
  initialReviewerId:f.row.ownerId,backupId:f.row.backupId,startedAt:task?.startedAt??f.row.createdAt,dueAt:task?.dueAt??f.row.firstReviewDueAt,
  hasDeadline:true,permission:'payout.prepare' as const,reserved:false,needsAction:!!task,nextActor:'Finance',status:view.phase,nextUpdateAt:f.row.nextActionAt,
  predicate:`EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=? AND c.revision=? AND s.user_id=?
    AND ((SELECT COUNT(*) FROM seller_recovery_response_windows w WHERE w.case_id=c.id AND w.approval_event_id=?)+(SELECT COUNT(*) FROM seller_recovery_contact_windows w JOIN seller_recovery_contacts prior ON prior.id=w.contact_id WHERE w.case_id=c.id AND prior.notice_request_id=?))=?)`,values:[caseId,f.row.revision,f.row.sellerOwner,f.event?.id??null,f.event?.requestId??null,window?1:0]};
}
export async function ensureRecoveryContactWork(db:D1Database,caseId:string,now=Date.now()){
 await observeRecoveryEmailContact(db,caseId,now);
 const current=await recoveryContactReviewSource(db,caseId,now);
 return current.needsAction?ensureReviewTask(db,{sourceType:'recovery_contact',sourceId:caseId,now}):null;
}

/** First review and each still-unresolved dispute retain their actual submission clocks. */
export async function recoveryReviewSource(db:D1Database,caseId:string){
 const f=await facts(db,caseId),pending=f.row.disputed?await pendingRecoveryDisputes(db,caseId):[];
 const correction=f.row.approvedCap===0?await db.prepare('SELECT id,created_at AS createdAt,review_due_at AS dueAt FROM seller_recovery_liability_corrections WHERE case_id=? ORDER BY case_revision DESC LIMIT 1').bind(caseId).first<{id:string;createdAt:number;dueAt:number}>():null;
 const arrangement=await recoveryArrangementReviewWork(db,caseId,f.row.remaining,f.row);
 const calculation=(await readRecoveryCalculationReviews(db,caseId)).find(review=>review.status==='pending');
 const terminal=!f.row.blocker&&['closed_no_balance','recovered','absorbed'].includes(f.row.state);
 const candidates=[...(calculation?[{key:'calculation:'+calculation.id,startedAt:calculation.createdAt,dueAt:calculation.dueAt,status:'calculation_review'}]:[]),...(arrangement?[arrangement]:[]),...(pending[0]?[{key:'dispute:'+pending[0].id,startedAt:pending[0].createdAt,dueAt:pending[0].dueAt,status:'dispute_review'}]:[]),
  ...(correction&&f.row.remaining>0?[{key:'correction:'+correction.id,startedAt:correction.createdAt,dueAt:correction.dueAt,status:'corrected_arrangement_review'}]:!correction&&!f.row.approvedAt&&!terminal?[{key:'initial:'+caseId,startedAt:f.row.createdAt,dueAt:f.row.firstReviewDueAt,status:'original_review'}]:[])];
 const task=candidates.sort((a,b)=>a.dueAt-b.dueAt)[0]??null;
 return {revision:task?.key??'inactive:'+caseId,ownerId:f.row.sellerOwner,sellerId:f.original.sellerId,conflictIds:[f.original.customerId,f.row.originalOwner,f.row.originalCustomer].filter((v):v is string=>!!v),
  initialReviewerId:f.row.ownerId,backupId:f.row.backupId,startedAt:task?.startedAt??f.row.createdAt,dueAt:task?.dueAt??f.row.firstReviewDueAt,
  hasDeadline:true,permission:task?.status==='calculation_review'?'payout.approve' as const:'payout.prepare' as const,reserved:task?.status==='calculation_review',needsAction:!!task,nextActor:'Finance',status:task?.status??'reviewed',nextUpdateAt:task?.dueAt??f.row.nextActionAt,
  predicate:'EXISTS(SELECT 1 FROM seller_recovery_cases WHERE id=? AND revision=?)',values:[caseId,f.row.revision]};
}
export async function ensureRecoveryReviewWork(db:D1Database,caseId:string,now=Date.now()){
 const current=await recoveryReviewSource(db,caseId);return current.needsAction?ensureReviewTask(db,{sourceType:'recovery_review',sourceId:caseId,now}):null;
}
