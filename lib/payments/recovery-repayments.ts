import {getVerifiedCompanyReceivingAccount} from './company-accounts';
import {readOwnedSellerRecovery,getSellerRecoveryReview,SellerRecoveryError} from './seller-recovery';
import {paymentGuard} from './manual-receipts';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {CONTINUOUS_CALENDAR_VERSION,calculateServiceDueAt} from '../workflows/service-clock';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {ensureReviewTask} from '../workflows/review-tasks';

class AccessError extends SellerRecoveryError {constructor(message:string){super(message,403);}}
const ownerPredicate=`EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN users u ON u.id=s.user_id
 WHERE c.id=? AND s.user_id=? AND json_extract(c.original_source_json,'$.ownerId')=s.user_id AND u.status='active')`;
const due=(now:number)=>calculateServiceDueAt({startedAt:now,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION});
function bounded(value:string,min:number,max:number,label:string){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new SellerRecoveryError('Review '+label+'.',400);return value.trim();}
function evidence(value:string|null){if(value!==null){bounded(value,8,1500,'the supporting evidence reference');if(value.startsWith('fin-file-'))throw new SellerRecoveryError('Use evidence retained for this recovery; a file reference from another financial source cannot grant access.',400);}}
async function owner(db:D1Database,caseId:string,actorId:string){if(!await db.prepare('SELECT 1 WHERE '+ownerPredicate).bind(caseId,actorId).first())throw new AccessError('Open your own original recovery statement.');}
async function receipt(db:D1Database,ctx:CommandContext,action:string,caseId:string,input:unknown){return commandReceipt(db,ctx,{action:'seller.recovery.'+action,subjectType:'seller_recovery',subjectId:caseId},input);}
function notice(db:D1Database,ctx:CommandContext,claimId:string,status:string,detail:string){return operationalBusinessNotificationStatements(db,{kind:'seller.recovery.claim',sourceId:claimId,eventId:ctx.requestId,actorId:ctx.actorId,now:ctx.now,status,detail});}
type Claim={id:string;caseId:string;submittedBy:string;amountPaisa:number;paymentReference:string;claimedAt:number;accountVersionId:string|null;evidenceReference:string|null;note:string;status:'submitted'|'needs_evidence'|'receipt_verified'|'not_received';revision:number;createdAt:number;firstReviewDueAt:number;nextReviewAt:number|null;receiptId:string|null;receiptRevision:number|null;publicMessage:string|null;operationId:string;receiptCurrent:number};
const columns=`q.id,q.case_id AS caseId,q.submitted_by AS submittedBy,q.amount_paisa AS amountPaisa,q.payment_reference AS paymentReference,q.claimed_at AS claimedAt,
 q.account_version_id AS accountVersionId,q.evidence_reference AS evidenceReference,q.note,q.status,q.revision,q.created_at AS createdAt,
 q.first_review_due_at AS firstReviewDueAt,q.next_review_at AS nextReviewAt,q.receipt_id AS receiptId,q.receipt_revision AS receiptRevision,q.public_message AS publicMessage,q.operation_request_id AS operationId,
 EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=q.receipt_id AND r.status='verified' AND r.currency='NPR'
 AND ((r.amount_minor=q.amount_paisa AND r.payer_user_id=q.submitted_by AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id<>q.case_id)) OR EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id=q.case_id AND t.owner_user_id=q.submitted_by AND t.payer_user_id=r.payer_user_id AND (r.amount_minor=q.amount_paisa OR t.amount_paisa>=q.amount_paisa AND r.amount_minor>=q.amount_paisa))) AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals v WHERE v.receipt_id=r.id)) AS receiptCurrent`;
/** Internal only: callers enforce Finance or original-owner access before projecting these private claims. */
export async function readRecoveryRepaymentClaims(db:D1Database,caseId:string){
 const claims=(await db.prepare(`SELECT ${columns} FROM seller_recovery_repayment_claims q WHERE q.case_id=? ORDER BY q.created_at,q.id`).bind(caseId).all<Claim>()).results;
 const events=(await db.prepare(`SELECT e.claim_id AS claimId,e.action,e.reason,e.details_json AS detailsJson,e.created_at AS createdAt FROM seller_recovery_claim_events e JOIN seller_recovery_repayment_claims q ON q.id=e.claim_id WHERE q.case_id=? ORDER BY e.created_at,e.revision`).bind(caseId).all<{claimId:string;action:string;reason:string;detailsJson:string;createdAt:number}>()).results;
 return claims.map(q=>({...q,history:events.filter(e=>e.claimId===q.id).map(e=>({...e,details:JSON.parse(e.detailsJson) as {publicMessage?:string;evidenceReference?:string|null;note?:string}}))}));
}
async function claimRow(db:D1Database,caseId:string,id:string){const row=await db.prepare(`SELECT ${columns} FROM seller_recovery_repayment_claims q WHERE q.id=? AND q.case_id=?`).bind(id,caseId).first<Claim>();if(!row)throw new SellerRecoveryError('Open the original repayment claim.',404);return row;}

export async function getRecoveryRepaymentView(db:D1Database,actorId:string,caseId:string){
 await owner(db,caseId,actorId);const current=await readOwnedSellerRecovery(db,actorId,caseId);
 const receiving=current.position.collectiblePaisa>0&&!current.reconciliation?await getVerifiedCompanyReceivingAccount(db):null;
 const claims=(await readRecoveryRepaymentClaims(db,caseId)).filter(q=>q.submittedBy===actorId).map(q=>({id:q.id,revision:q.revision,amountPaisa:q.amountPaisa,paymentReference:q.paymentReference,claimedAt:q.claimedAt,
  status:q.status==='receipt_verified'&&!q.receiptCurrent?'receipt_reconciliation':q.status,createdAt:q.createdAt,nextReviewAt:q.nextReviewAt,firstReviewDueAt:q.firstReviewDueAt,publicMessage:q.publicMessage,
  history:q.history.map(e=>({createdAt:e.createdAt,message:e.details.publicMessage??(e.action==='evidence_supplied'?e.reason:null)})).filter(e=>e.message)}));
 await owner(db,caseId,actorId);
 return {instructions:receiving?{...receiving,reference:'HB-RECOVERY-'+caseId,maximumCollectiblePaisa:current.position.collectiblePaisa}:null,claims};
}

export async function submitRecoveryRepaymentClaim(db:D1Database,ctx:CommandContext,input:{caseId:string;amountPaisa:number;paymentReference:string;claimedAt:number;accountVersionId:string|null;evidenceReference:string|null;note:string}){
 await owner(db,input.caseId,ctx.actorId);const current=await readOwnedSellerRecovery(db,ctx.actorId,input.caseId),read=()=>receipt(db,ctx,'claim_submitted',input.caseId,input),command=await read();
 if(command.replayed)return command.result as {id:string;claimId:string;revision:number};
 if(!Number.isSafeInteger(input.amountPaisa)||input.amountPaisa<=0||!Number.isSafeInteger(input.claimedAt)||input.claimedAt<0||input.claimedAt>ctx.now||ctx.expectedRevision!==String(current.row.revision))throw new SellerRecoveryError('Review the current statement and exact reported amount and payment date.');
 const reference=bounded(input.paymentReference,1,191,'the reported bank reference'),note=bounded(input.note,10,1500,'the payment description');evidence(input.evidenceReference);
 const accountPredicate="EXISTS(SELECT 1 FROM company_payment_account_versions WHERE id=? AND verified_at IS NOT NULL)";
 if(input.accountVersionId!==null&&!await db.prepare('SELECT 1 WHERE '+accountPredicate).bind(input.accountVersionId).first())throw new SellerRecoveryError('Identify an originally verified company account, or report the account as unknown.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([reference.toUpperCase(),input.amountPaisa,input.claimedAt,input.accountVersionId]))),fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(await db.prepare('SELECT 1 FROM seller_recovery_repayment_claims WHERE case_id=? AND fingerprint=?').bind(input.caseId,fingerprint).first())throw new SellerRecoveryError('This payment report already has a retained claim. Open the existing review.');
 const id=crypto.randomUUID(),result={id:input.caseId,claimId:id,revision:0},clock=checkoutCommitClock(db);
 try{await db.batch([...paymentGuard(db,ownerPredicate,[input.caseId,ctx.actorId]),...paymentGuard(db,`EXISTS(SELECT 1 FROM seller_recovery_cases WHERE id=? AND revision=?) AND ?<=${clock}`,[input.caseId,current.row.revision,input.claimedAt]),
  ...(input.accountVersionId===null?[]:paymentGuard(db,accountPredicate,[input.accountVersionId])),
  db.prepare(`INSERT INTO seller_recovery_repayment_claims(id,case_id,submitted_by,amount_paisa,payment_reference,claimed_at,account_version_id,evidence_reference,note,fingerprint,status,revision,created_at,first_review_due_at,next_review_at,operation_request_id,case_revision)
   VALUES(?,?,?,?,?,?,?,?,?,?,'submitted',0,${clock},?,?,?,?)`).bind(id,input.caseId,ctx.actorId,input.amountPaisa,reference,input.claimedAt,input.accountVersionId,input.evidenceReference,note,fingerprint,due(ctx.now),due(ctx.now),ctx.requestId,current.row.revision),
  db.prepare(`INSERT INTO seller_recovery_claim_events(id,claim_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,0,'submitted',?,?,?, ?,${clock})`).bind(crypto.randomUUID(),id,ctx.actorId,note,JSON.stringify(input),ctx.requestId),
  ...await notice(db,ctx,id,'submitted','Your payment report is retained for independent Finance matching. It is not proof of receipt and has not reduced the recovery balance. Open the statement for the review target.'),command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;if(await db.prepare('SELECT 1 FROM seller_recovery_repayment_claims WHERE case_id=? AND fingerprint=?').bind(input.caseId,fingerprint).first())throw new SellerRecoveryError('This payment report already has a retained claim. Open the existing review.');throw error;}
 return result;
}

export async function reviewRecoveryRepaymentClaim(db:D1Database,ctx:CommandContext,input:{caseId:string;claimId:string;decision:'needs_evidence'|'receipt_verified'|'not_received';receiptId:string|null;receiptRevision:number|null;reviewDigest:string;evidenceReference:string;reason:string;publicMessage:string;nextReviewAt:number|null}){
 const verified=input.decision==='receipt_verified',authority=await staffMutationGuard(db,ctx.actorId,verified?'payment.receipt.verify':'payout.prepare',AccessError,verified?'super_admin':undefined);
 const current=await getSellerRecoveryReview(db,ctx.actorId,input.caseId),q=await claimRow(db,input.caseId,input.claimId);
 if(q.submittedBy===ctx.actorId)throw new AccessError('An independent Finance reviewer must inspect this claim.');
 const read=()=>receipt(db,ctx,verified?'claim_receipt_verified':'claim_reviewed',input.caseId,input),command=await read();if(command.replayed)return command.result as {id:string;claimId:string;revision:number};
 if(!['needs_evidence','receipt_verified','not_received'].includes(input.decision)||ctx.expectedRevision!==String(q.revision)||input.reviewDigest!==current.reviewDigest)throw new SellerRecoveryError('Review the current original claim and statement before deciding.');
 if(q.status==='receipt_verified'&&q.receiptCurrent&&(input.decision!=='receipt_verified'||input.receiptId!==q.receiptId))throw new SellerRecoveryError('Retain the actual verified credit. A changed or reversed bank source requires its own recorded reconciliation.');
 const duplicated=()=>db.prepare('SELECT 1 FROM seller_recovery_repayment_claims WHERE receipt_id=? AND id<>?').bind(input.receiptId,q.id).first();
 if(verified&&await duplicated())throw new SellerRecoveryError('This actual credit is already matched to another retained report. Keep the duplicate report owned for review; it is not another payment.');
 bounded(input.reason,10,1500,'the private review reason');bounded(input.publicMessage,10,1500,'the seller-visible explanation');evidence(input.evidenceReference);bounded(input.evidenceReference,8,1500,'the independent evidence reference');
 if(verified?typeof input.receiptId!=='string'||!Number.isSafeInteger(input.receiptRevision)||(input.receiptRevision??-1)<0||input.nextReviewAt!==null:input.receiptId!==null||input.receiptRevision!==null)throw new SellerRecoveryError('Match an exact actual receipt or retain the unresolved claim without credit.');
 if(input.decision==='needs_evidence'? !Number.isSafeInteger(input.nextReviewAt)||(input.nextReviewAt??0)<=ctx.now:input.nextReviewAt!==null)throw new SellerRecoveryError('Record the next review date for an unresolved claim.');
 if(verified&&!await db.prepare(`SELECT 1 FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.id=? AND control.revision=? AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR' AND ((r.amount_minor=? AND r.payer_user_id=? AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id<>?)) OR EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id=? AND t.owner_user_id=? AND t.payer_user_id=r.payer_user_id AND (r.amount_minor=? OR t.amount_paisa>=? AND r.amount_minor>=?)))
  AND (? IS NULL OR r.account_version_id=?) AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals v WHERE v.receipt_id=r.id) AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts x WHERE x.receipt_id=r.id AND x.user_id=?)`).bind(input.receiptId,input.receiptRevision,q.amountPaisa,q.submittedBy,input.caseId,input.caseId,q.submittedBy,q.amountPaisa,q.amountPaisa,q.amountPaisa,q.accountVersionId,q.accountVersionId,ctx.actorId).first())throw new SellerRecoveryError('Independently match the exact amount, NPR currency, original company account and seller attribution against the current actual receipt. Keep unknown or unmatched reports owned for review; third-party or excess credits require retained case-specific Super Admin attribution first.');
 const clock=checkoutCommitClock(db),result={id:input.caseId,claimId:q.id,revision:q.revision+1};
 try{await db.batch([...authority.statements,...paymentGuard(db,`EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=? AND c.revision=? AND s.user_id=? AND json_extract(c.original_source_json,'$.ownerId')=?)`,[input.caseId,current.case.revision,q.submittedBy,q.submittedBy]),
  ...(input.nextReviewAt===null?[]:paymentGuard(db,`?>${clock}`,[input.nextReviewAt])),
  db.prepare(`UPDATE seller_recovery_repayment_claims SET status=?,receipt_id=?,receipt_revision=?,public_message=?,reviewed_by=?,reviewed_at=${clock},next_review_at=?,revision=revision+1,operation_request_id=? WHERE id=? AND revision=?`)
   .bind(input.decision,input.receiptId,input.receiptRevision,input.publicMessage.trim(),ctx.actorId,input.nextReviewAt,ctx.requestId,q.id,q.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_claim_events(id,claim_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,${clock})`).bind(crypto.randomUUID(),q.id,result.revision,input.decision,ctx.actorId,input.reason.trim(),JSON.stringify(input),ctx.requestId),
  ...await notice(db,ctx,q.id,input.decision,input.publicMessage.trim()+' Claim review itself allocates no money; the statement shows only actual approved repayments.'),...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;if(verified&&await duplicated())throw new SellerRecoveryError('This actual credit is already matched to another retained report. Keep the duplicate report owned for review; it is not another payment.');throw error;}return result;
}

export async function supplyRecoveryRepaymentEvidence(db:D1Database,ctx:CommandContext,input:{caseId:string;claimId:string;evidenceReference:string|null;note:string}){
 await owner(db,input.caseId,ctx.actorId);const q=await claimRow(db,input.caseId,input.claimId),read=()=>receipt(db,ctx,'claim_evidence_supplied',input.caseId,input),command=await read();
 if(command.replayed)return command.result as {id:string;claimId:string;revision:number};
 if(q.submittedBy!==ctx.actorId||ctx.expectedRevision!==String(q.revision)||!['submitted','needs_evidence'].includes(q.status))throw new SellerRecoveryError('Open your current unresolved claim to provide information.');
 evidence(input.evidenceReference);bounded(input.note,10,1500,'the additional information');const clock=checkoutCommitClock(db),result={id:input.caseId,claimId:q.id,revision:q.revision+1};
 try{await db.batch([...paymentGuard(db,ownerPredicate,[input.caseId,ctx.actorId]),
  db.prepare(`UPDATE seller_recovery_repayment_claims SET status='submitted',public_message=NULL,reviewed_by=NULL,reviewed_at=NULL,next_review_at=?,revision=revision+1,operation_request_id=? WHERE id=? AND revision=?`).bind(Math.min(q.nextReviewAt??due(ctx.now),due(ctx.now)),ctx.requestId,q.id,q.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_claim_events(id,claim_id,revision,action,actor_id,reason,details_json,request_id,created_at,case_revision) VALUES(?,?,?,'evidence_supplied',?,?,?,?,${clock},(SELECT revision FROM seller_recovery_cases WHERE id=?))`).bind(crypto.randomUUID(),q.id,result.revision,ctx.actorId,input.note.trim(),JSON.stringify(input),ctx.requestId,input.caseId),
  ...await notice(db,ctx,q.id,'evidence_supplied','Additional repayment information is retained for Finance review. Your original claim and any prior review remain in history; no repayment is created by this update.'),command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}

export async function recoveryRepaymentReviewSource(db:D1Database,id:string){
 const row=await db.prepare(`SELECT q.case_id AS caseId,c.seller_id AS sellerId,c.owner_id AS reviewer,c.backup_id AS backupId,json_extract(c.original_source_json,'$.customerId') AS customerId,o.customer_id AS currentCustomer,s.user_id AS currentOwner FROM seller_recovery_repayment_claims q JOIN seller_recovery_cases c ON c.id=q.case_id JOIN seller_profiles s ON s.id=c.seller_id LEFT JOIN refunds r ON r.id=c.refund_id LEFT JOIN orders o ON o.id=r.order_id WHERE q.id=?`).bind(id).first<{caseId:string;sellerId:string;reviewer:string;backupId:string|null;customerId:string|null;currentCustomer:string|null;currentOwner:string}>();
 if(!row)throw new SellerRecoveryError('Open the original repayment claim.',404);const q=await claimRow(db,row.caseId,id),uncertain=q.status==='receipt_verified'&&!q.receiptCurrent;
 const reversal=uncertain?await db.prepare('SELECT MIN(recorded_at) AS at FROM company_receipt_reversals WHERE receipt_id=?').bind(q.receiptId).first<{at:number|null}>():null;
 const reviewAt=uncertain?(reversal?.at??q.firstReviewDueAt):(q.nextReviewAt??q.firstReviewDueAt);
 return {revision:q.operationId+(uncertain?':reconcile':''),ownerId:q.submittedBy,sellerId:row.sellerId,conflictIds:[row.customerId,row.currentCustomer,row.currentOwner].filter((v):v is string=>!!v),initialReviewerId:row.reviewer,backupId:row.backupId,
  startedAt:uncertain?(reversal?.at??q.createdAt):q.createdAt,dueAt:reviewAt,hasDeadline:true,permission:'payout.prepare' as const,reserved:false,needsAction:['submitted','needs_evidence'].includes(q.status)||uncertain,
  nextActor:'Finance',status:uncertain?'receipt_reconciliation':q.status,nextUpdateAt:reviewAt,
  predicate:'EXISTS(SELECT 1 FROM seller_recovery_repayment_claims WHERE id=? AND revision=?)',values:[id,q.revision]};
}
export async function ensureRecoveryRepaymentWork(db:D1Database,claimId:string,now=Date.now()){
 const source=await recoveryRepaymentReviewSource(db,claimId);return source.needsAction?ensureReviewTask(db,{sourceType:'recovery_claim',sourceId:claimId,now}):null;
}
