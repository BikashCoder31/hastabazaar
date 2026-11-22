import {actualManualReceiptUseSql} from './receipt-use-accounting';
import {getSellerRecoveryReview,readOwnedSellerRecovery,SellerRecoveryError} from './seller-recovery';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {paymentGuard,ManualPaymentError} from './manual-receipts';
import {recoveryNoticeStatements} from './recovery-notices';
import {actualRecoveryAllocationSql,pendingRecoveryReceiptReversalSql} from './recovery-receipt-accounting';

class AuthorityError extends ManualPaymentError {constructor(message:string){super(message,403);}}
function text(value:string,min:number){if(typeof value!=='string'||value.trim().length<min||value.length>1500||/[\p{Cc}<>]/u.test(value)||value.startsWith('fin-file-'))throw new SellerRecoveryError('Retain the actual case attribution evidence, reason and seller explanation.',400);return value.trim();}
const remaining=`r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)-COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0)`;
/** Bind one actual credit to its reviewed case; never rewrite its factual payer. */
export async function approveRecoveryRepaymentAttribution(db:D1Database,ctx:CommandContext,input:{caseId:string;receiptId:string;receiptRevision:number;amountPaisa:number;reviewDigest:string;evidenceReference:string;reason:string;publicMessage:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payment.receipt.verify',AuthorityError,'super_admin');
 const review=await getSellerRecoveryReview(db,ctx.actorId,input.caseId);
 const read=()=>commandReceipt(db,ctx,{action:'seller.recovery.repayment_attributed',subjectType:'seller_recovery',subjectId:input.caseId},input),command=await read();
 if(command.replayed)return command.result as {id:string;attributionId:string;revision:number};
 if(ctx.expectedRevision!==String(review.case.revision)||input.reviewDigest!==review.reviewDigest||!Number.isSafeInteger(input.receiptRevision)||input.receiptRevision<0||!Number.isSafeInteger(input.amountPaisa)||input.amountPaisa<=0||input.amountPaisa>review.position.collectiblePaisa||review.case.blocker||review.source.blocker||review.unreconciledReceiptPaisa>0||review.source.confirmedPaisa!==review.case.confirmedPaisa)throw new SellerRecoveryError('Refresh the approved case, exact attribution amount and actual receipt.');
 const evidence=text(input.evidenceReference,8),reason=text(input.reason,10),publicMessage=text(input.publicMessage,10);
 if(await db.prepare('SELECT 1 FROM seller_recovery_repayment_attributions WHERE receipt_id=?').bind(input.receiptId).first())throw new SellerRecoveryError('This actual credit already has a retained case attribution. Review its original allocation or original-payer return.');
 const actual=await db.prepare(`SELECT r.payer_user_id AS payerId,control.revision,${remaining} AS remainingPaisa FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.id=? AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR' AND NOT EXISTS(SELECT 1 FROM customer_refund_reversals returned_customer WHERE returned_customer.receipt_id=r.id) AND NOT ${pendingRecoveryReceiptReversalSql('r.id')}`).bind(input.receiptId).first<{payerId:string|null;revision:number;remainingPaisa:number}>();
 if(!actual?.payerId)throw new SellerRecoveryError('Keep unidentified money owned for Finance review until actual payer evidence is established.');
 if(actual.payerId===ctx.actorId||!await db.prepare('SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM company_receipt_conflicts WHERE receipt_id=? AND user_id=?)').bind(input.receiptId,ctx.actorId).first())throw new AuthorityError('An eligible operator without a personal payer interest must review this attribution.');
 if(actual.revision!==input.receiptRevision||actual.remainingPaisa<input.amountPaisa)throw new SellerRecoveryError('Refresh the current actual receipt revision and unused balance.');
 if(await db.prepare("SELECT 1 FROM seller_recovery_allocations WHERE receipt_id=? UNION ALL SELECT 1 FROM manual_receipt_uses WHERE receipt_id=? AND state<>'released'").bind(input.receiptId,input.receiptId).first())throw new SellerRecoveryError('Review the retained earlier receipt use; do not silently reuse money across cases.');
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db),result={id:input.caseId,attributionId:id,revision:review.case.revision+1};
 try{await db.batch([...authority.statements,
  db.prepare(`INSERT INTO seller_recovery_repayment_attributions(id,case_id,case_revision,receipt_id,receipt_revision,payer_user_id,owner_user_id,amount_paisa,actor_id,request_id,evidence_reference,reason,public_message,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,${clock})`).bind(id,input.caseId,review.case.revision,input.receiptId,input.receiptRevision,actual.payerId,review.source.ownerId,input.amountPaisa,ctx.actorId,ctx.requestId,evidence,reason,publicMessage),
  db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=? AND revision=?').bind(input.receiptId,input.receiptRevision),...paymentGuard(db,'changes()=1'),
  db.prepare(`UPDATE seller_recovery_cases SET revision=revision+1,updated_at=${clock} WHERE id=? AND revision=?`).bind(input.caseId,review.case.revision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'repayment_attributed',?,?,?,?,${clock})`).bind(crypto.randomUUID(),input.caseId,result.revision,ctx.actorId,reason,JSON.stringify({attributionId:id,amountPaisa:input.amountPaisa,publicMessage}),ctx.requestId),
  ...await recoveryNoticeStatements(db,ctx,input.caseId,'repayment_attributed',publicMessage+' Attribution itself allocates no money; only approved allocations reduce the statement balance.'),
  ...authority.statements,command.insert(result)]);
 }catch(error){const saved=await read();if(saved.replayed)return saved.result as typeof result;throw error;}return result;
}

/** Both preflight and commit use this predicate; the storage trigger independently retains its boundary. */
export async function recoveryRepaymentCashGuard(db:D1Database,input:{caseId:string;receiptId:string;ownerId:string;amountPaisa:number}){
 const predicate=`EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=? AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR' AND NOT EXISTS(SELECT 1 FROM customer_refund_reversals returned_customer WHERE returned_customer.receipt_id=r.id) AND NOT ${pendingRecoveryReceiptReversalSql('r.id')} AND ?<=${remaining}
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id<>?)
  AND ((r.payer_user_id=? AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id))
   OR EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id=? AND t.owner_user_id=? AND t.payer_user_id=r.payer_user_id
    AND ?<=t.amount_paisa-COALESCE((SELECT SUM(${actualRecoveryAllocationSql('a')}) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))))`;
 const values=[input.receiptId,input.amountPaisa,input.caseId,input.ownerId,input.caseId,input.ownerId,input.amountPaisa];
 const valid=Number.isSafeInteger(input.amountPaisa)&&input.amountPaisa>0;
 return {allowed:valid&&!!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first(),statements:paymentGuard(db,valid?predicate:'0',valid?values:[])};
}

export async function readOwnedRecoveryRepaymentAttributions(db:D1Database,actorId:string,caseId:string){
 await readOwnedSellerRecovery(db,actorId,caseId);
 const rows=(await db.prepare('SELECT amount_paisa AS amountPaisa,public_message AS message,created_at AS createdAt FROM seller_recovery_repayment_attributions WHERE case_id=? AND owner_user_id=? ORDER BY created_at,id').bind(caseId,actorId).all<{amountPaisa:number;message:string;createdAt:number}>()).results;
 await readOwnedSellerRecovery(db,actorId,caseId);return rows;
}

export async function getRecoveryRepaymentAttributionView(db:D1Database,actorId:string,caseId:string){
 const authority=await staffMutationGuard(db,actorId,'payment.receipt.verify',AuthorityError,'super_admin');await getSellerRecoveryReview(db,actorId,caseId);
 const receipts=(await db.prepare(`SELECT r.id,control.revision,r.amount_minor AS amountPaisa,r.account_version_id AS accountVersionId,r.payer_user_id AS payerId,r.payer_reference AS payerReference,${remaining} AS remainingPaisa,
  t.case_id AS attributedCaseId,t.amount_paisa AS approvedPaisa,t.public_message AS publicMessage,t.evidence_reference AS evidenceReference,t.reason AS reason,t.actor_id AS attributedBy,t.created_at AS attributedAt,exception.owner_id AS reviewOwnerId,exception.next_update_at AS nextReviewAt,
  (SELECT id FROM refund_obligations WHERE source_kind='receipt_return' AND source_id=r.id) AS returnObligationId
  FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id LEFT JOIN seller_recovery_repayment_attributions t ON t.receipt_id=r.id
  LEFT JOIN manual_payment_exceptions exception ON exception.source_key='receipt:'||r.id
  WHERE r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR' AND NOT EXISTS(SELECT 1 FROM customer_refund_reversals returned_customer WHERE returned_customer.receipt_id=r.id) AND NOT ${pendingRecoveryReceiptReversalSql('r.id')}
  AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=r.id AND conflict.user_id=?)
  AND (t.case_id=? OR t.id IS NULL AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.receipt_id=r.id) AND NOT EXISTS(SELECT 1 FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'))
  ORDER BY r.confirmed_at,r.id LIMIT 100`).bind(actorId,caseId).all<{id:string;revision:number;amountPaisa:number;accountVersionId:string;payerId:string|null;payerReference:string;remainingPaisa:number;attributedCaseId:string|null;approvedPaisa:number|null;publicMessage:string|null;evidenceReference:string|null;reason:string|null;attributedBy:string|null;attributedAt:number|null;reviewOwnerId:string|null;nextReviewAt:number|null;returnObligationId:string|null}>()).results;
 await db.batch(authority.statements);return {receipts};
}
