import type {CommandContext} from '../workflows/contracts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {paymentGuard} from './manual-receipts';
import {financeEvidenceReferenceGuards} from './refund-evidence';
import {refundCommand,refundIndependence,refundEvent,refundText,RefundObligationError} from './refund-obligations';
import {getSellerRecoveryReview} from './seller-recovery';
import {recoveryNoticeStatements} from './recovery-notices';
import {responseScopeContains} from '../orders/response-sql';
import {financialNoticeStatements} from '../operations/financial-notices';

async function retainedReversalInterestGuards(db:D1Database,actorId:string,obligationId:string,receiptId:string){
 const predicate=`EXISTS(SELECT 1 FROM refund_obligations original JOIN company_money_receipts receipt ON receipt.id=? JOIN company_payment_account_versions account ON account.id=receipt.account_version_id JOIN company_payment_accounts head ON head.id=account.account_id JOIN company_payment_account_versions latest ON latest.id=head.latest_version_id WHERE original.id=? AND NOT ${responseScopeContains(db,'account.conflicts_json','?')} AND NOT ${responseScopeContains(db,'latest.conflicts_json','?')} AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases retained WHERE retained.refund_id=original.source_id AND (json_extract(retained.original_source_json,'$.ownerId')=? OR json_extract(retained.original_source_json,'$.customerId')=?)))`,values=[receiptId,obligationId,actorId,actorId,actorId,actorId];
 if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new RefundObligationError('An eligible operator without a retained original party or company account interest must review this returned credit.',403);
 return paymentGuard(db,predicate,values);
}

/** A bank reversal does not by itself cancel the underlying customer or seller obligation. */
export const CUSTOMER_REFUND_REVERSAL_BLOCKER='Review the returned customer refund credit and explicitly retain or correct the continuing obligation before collecting seller recovery.';
export function customerRefundReversalPendingSql(refundId:string){return `EXISTS(SELECT 1 FROM customer_refund_reversals reversal JOIN refund_obligations original ON original.id=reversal.obligation_id WHERE original.source_kind='return_refund' AND original.source_id=${refundId} AND NOT EXISTS(SELECT 1 FROM customer_refund_reversal_dispositions disposition WHERE disposition.reversal_id=reversal.id))`;}
export async function readCustomerRefundReversals(db:D1Database,refundId:string){return (await db.prepare(`SELECT reversal.id,reversal.packet_id packetId,reversal.receipt_id receiptId,reversal.amount_paisa amountPaisa,reversal.created_at createdAt,disposition.kind dispositionKind,disposition.retry_obligation_id retryObligationId,disposition.correction_id correctionId FROM customer_refund_reversals reversal JOIN refund_obligations original ON original.id=reversal.obligation_id LEFT JOIN customer_refund_reversal_dispositions disposition ON disposition.reversal_id=reversal.id WHERE original.source_kind='return_refund' AND original.source_id=? ORDER BY reversal.created_at,reversal.id`).bind(refundId).all<{id:string;packetId:string;receiptId:string;amountPaisa:number;createdAt:number;dispositionKind:string|null;retryObligationId:string|null;correctionId:string|null}>()).results;}

export async function recordCustomerRefundReversal(db:D1Database,ctx:CommandContext,input:{packetId:string;receiptId:string;receiptRevision:number;amountPaisa:number;actualReversalConfirmed:boolean;evidenceReference:string;reason:string}){
 const packet=await db.prepare(`SELECT p.id,p.revision,p.state,p.obligation_id obligationId,o.customer_id customerId,o.order_id orderId,o.source_kind sourceKind FROM outgoing_payment_packets p JOIN refund_obligations o ON o.id=p.obligation_id WHERE p.id=?`).bind(input.packetId).first<{id:string;revision:number;state:string;obligationId:string;customerId:string;orderId:string|null;sourceKind:string}>();
 if(!packet)throw new RefundObligationError('Open the original paid refund packet.');
 const retainedGuards=await retainedReversalInterestGuards(db,ctx.actorId,packet.obligationId,input.receiptId);
 const command=await refundCommand(db,ctx,'customer_reversal_recorded',packet.obligationId,input,true);if(command.receipt.replayed)return command.receipt.result as {id:string};
 if(packet.state!=='paid'||packet.sourceKind!=='return_refund'||ctx.expectedRevision!==String(packet.revision)||input.actualReversalConfirmed!==true||!Number.isSafeInteger(input.amountPaisa)||input.amountPaisa<=0||!Number.isSafeInteger(input.receiptRevision)||input.receiptRevision<0)throw new RefundObligationError('Record the actual returned credit against the original paid merchandise refund.');
 refundText(input.reason,'actual reversal reason',10);refundText(input.evidenceReference,'independent returned bank credit evidence');
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db);
 const affected=await db.prepare(`SELECT id,revision FROM seller_recovery_cases WHERE refund_id=(SELECT source_id FROM refund_obligations WHERE id=?) ORDER BY id`).bind(packet.obligationId).all<{id:string;revision:number}>();
 const recoveryStatements:D1PreparedStatement[]=[],publicMessage='The bank returned an original customer refund. Collection is paused while Finance reviews the continuing obligation and responsibility; this bank return alone does not cancel the original liability.';
 for(const row of affected.results){
  const caseContext={...ctx,requestId:ctx.requestId+':'+row.id};
  recoveryStatements.push(db.prepare(`UPDATE seller_recovery_cases SET next_action_at=${clock}+86400000,updated_at=${clock},revision=revision+1 WHERE id=? AND revision=?`).bind(row.id,row.revision),...paymentGuard(db,'changes()=1'),
   db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'customer_refund_reversed',?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.id,row.revision+1,ctx.actorId,input.reason,JSON.stringify({reversalId:id,publicMessage}),caseContext.requestId),
   ...await recoveryNoticeStatements(db,caseContext,row.id,'customer_refund_reversed',publicMessage));
 }
 return command.commit([...retainedGuards,...await refundIndependence(db,ctx.actorId,packet.customerId,packet.orderId,input.receiptId),...await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'obligation',id:packet.obligationId}),
  db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=? AND revision=?').bind(input.receiptId,input.receiptRevision),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO customer_refund_reversals(id,packet_id,obligation_id,receipt_id,amount_paisa,actor_id,request_id,evidence_reference,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,${clock})`).bind(id,packet.id,packet.obligationId,input.receiptId,input.amountPaisa,ctx.actorId,ctx.requestId,input.evidenceReference,input.reason),
  await refundEvent(db,ctx,packet.obligationId,'customer_refund_reversed','The bank returned part or all of the original refund. Finance is reviewing the continuing obligation and will provide an update.',{reversalId:id,...input}),
  ...await financialNoticeStatements(db,ctx,{kind:'finance.refund',sourceId:packet.obligationId,status:'customer_refund_reversed'}),
  ...recoveryStatements,
 ],{id});
}

async function currentReversal(db:D1Database,reversalId:string,caseId:string){const row=await db.prepare(`SELECT reversal.id,reversal.obligation_id obligationId,reversal.receipt_id receiptId,reversal.amount_paisa amountPaisa,original.customer_id customerId,original.order_id orderId FROM customer_refund_reversals reversal JOIN refund_obligations original ON original.id=reversal.obligation_id JOIN seller_recovery_cases c ON c.refund_id=original.source_id WHERE reversal.id=? AND c.id=? AND original.source_kind='return_refund' AND NOT EXISTS(SELECT 1 FROM customer_refund_reversal_dispositions d WHERE d.reversal_id=reversal.id)`).bind(reversalId,caseId).first<{id:string;obligationId:string;receiptId:string;amountPaisa:number;customerId:string;orderId:string|null}>();if(!row)throw new RefundObligationError('Review the original unresolved customer refund reversal and linked seller recovery.');return row;}

export async function retainCustomerRefundRecovery(db:D1Database,ctx:CommandContext,input:{caseId:string;reversalId:string;retryObligationId:string;reviewDigest:string;stillValidObligationConfirmed:boolean;evidenceReference:string;reason:string;publicMessage:string}){
 await authorizeCustomerRefundRecoveryHistory(db,ctx.actorId,input.reversalId,input.caseId);
 const command=await refundCommand(db,ctx,'customer_reversal_retained',input.reversalId,input,true);if(command.receipt.replayed)return command.receipt.result as {id:string};
 const original=await currentReversal(db,input.reversalId,input.caseId),review=await getSellerRecoveryReview(db,ctx.actorId,input.caseId);
 if(input.stillValidObligationConfirmed!==true||ctx.expectedRevision!==String(review.case.revision)||input.reviewDigest!==review.reviewDigest)throw new RefundObligationError('Explicitly review the current still-valid obligation before retaining any seller collection.');
 refundText(input.reason,'still-valid obligation and responsibility basis',10);refundText(input.publicMessage,'seller explanation',10);refundText(input.evidenceReference,'continuing obligation evidence');
 const id=crypto.randomUUID(),clock=checkoutCommitClock(db);
 return command.commit([...await refundIndependence(db,ctx.actorId,original.customerId,original.orderId,original.receiptId),...await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'obligation',id:original.obligationId}),
 db.prepare(`INSERT INTO customer_refund_reversal_dispositions(id,reversal_id,case_id,case_revision,kind,retry_obligation_id,correction_id,actor_id,request_id,evidence_reference,reason,public_message,created_at) VALUES(?,?,?,?,'retain',?,NULL,?,?,?,?,?,${clock})`).bind(id,input.reversalId,input.caseId,review.case.revision,input.retryObligationId,ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage),
 db.prepare(`UPDATE seller_recovery_cases SET revision=revision+1,updated_at=${clock},next_action_at=${clock}+86400000 WHERE id=? AND revision=?`).bind(input.caseId,review.case.revision),...paymentGuard(db,'changes()=1'),
 db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'customer_reversal_retained',?,?,?,?,${clock})`).bind(crypto.randomUUID(),input.caseId,review.case.revision+1,ctx.actorId,input.reason,JSON.stringify({reversalId:input.reversalId,retryObligationId:input.retryObligationId,publicMessage:input.publicMessage}),ctx.requestId),
 await refundEvent(db,ctx,original.obligationId,'customer_reversal_retained','The original refund remains due. Its returned bank credit is reserved for a separately verified payment.',input),
 ...await financialNoticeStatements(db,ctx,{kind:'finance.refund',sourceId:original.obligationId,status:'customer_reversal_retained'}),
 ...await recoveryNoticeStatements(db,ctx,input.caseId,'customer_reversal_retained',input.publicMessage)],{id});
}

/** Saved outcomes retain both the original personal-interest checks and current case authority. */
export async function authorizeCustomerRefundRecoveryHistory(db:D1Database,actorId:string,reversalId:string,caseId?:string){
 const original=await db.prepare(`SELECT original.id obligationId,original.customer_id customerId,original.order_id orderId,reversal.receipt_id receiptId,c.id caseId FROM customer_refund_reversals reversal JOIN refund_obligations original ON original.id=reversal.obligation_id JOIN seller_recovery_cases c ON c.refund_id=original.source_id WHERE reversal.id=? AND original.source_kind='return_refund' AND (? IS NULL OR c.id=?)`).bind(reversalId,caseId??null,caseId??null).first<{obligationId:string;customerId:string;orderId:string|null;receiptId:string;caseId:string}>();
 if(!original)throw new RefundObligationError('Review the original customer reversal and its linked recovery.');
 await getSellerRecoveryReview(db,actorId,original.caseId);
 await refundIndependence(db,actorId,original.customerId,original.orderId,original.receiptId);
 await db.batch(await retainedReversalInterestGuards(db,actorId,original.obligationId,original.receiptId));
}

/** Called by the existing liability correction command. Both sides MUST be committed in its one batch. */
export async function customerRefundCorrectionDisposition(db:D1Database,ctx:CommandContext,input:{reversalId?:string;reversalIds?:string[];caseId:string;caseRevision:number;correctionId:string;evidenceReference:string;reason:string;publicMessage:string}){
 if(input.reversalId&&input.reversalIds)throw new RefundObligationError('Choose one explicit set of returned customer credits.');
 const ids=input.reversalIds??(input.reversalId?[input.reversalId]:[]);
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!id||id.length>191)||new Set(ids).size!==ids.length)throw new RefundObligationError('Identify every pending returned customer credit exactly once.');
 const pendingSql=`SELECT reversal.id FROM customer_refund_reversals reversal JOIN refund_obligations original ON original.id=reversal.obligation_id JOIN seller_recovery_cases c ON c.refund_id=original.source_id WHERE c.id=? AND original.source_kind='return_refund' AND NOT EXISTS(SELECT 1 FROM customer_refund_reversal_dispositions disposition WHERE disposition.reversal_id=reversal.id)`;
 const pending=await db.prepare(pendingSql).bind(input.caseId).all<{id:string}>();
 if(pending.results.length!==ids.length||pending.results.some(row=>!ids.includes(row.id)))throw new RefundObligationError('Review and include the exact complete set of pending returned credits for this original refund.');
 const originals=await Promise.all(ids.map(id=>currentReversal(db,id,input.caseId))),first=originals[0];
 if(originals.some(row=>row.obligationId!==first.obligationId))throw new RefundObligationError('Use credits belonging to this one original refund obligation.');
 const guards:D1PreparedStatement[]=[...paymentGuard(db,`(SELECT COUNT(*) FROM (${pendingSql}) pending)=? AND NOT EXISTS(SELECT 1 FROM (${pendingSql}) pending WHERE pending.id NOT IN(${ids.map(()=>'?').join(',')}))`,[input.caseId,ids.length,input.caseId,...ids])];
 for(const original of originals)guards.push(...await refundIndependence(db,ctx.actorId,original.customerId,original.orderId,original.receiptId));
 guards.push(...await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'obligation',id:first.obligationId}));
 return {guards,finish:[...originals.map(original=>db.prepare(`INSERT INTO customer_refund_reversal_dispositions(id,reversal_id,case_id,case_revision,kind,retry_obligation_id,correction_id,actor_id,request_id,evidence_reference,reason,public_message,created_at) VALUES(?,?,?,?,'restore',NULL,?,?,?,?,?,?,${checkoutCommitClock(db)})`).bind(crypto.randomUUID(),original.id,input.caseId,input.caseRevision,input.correctionId,ctx.actorId,ctx.requestId,input.evidenceReference,input.reason,input.publicMessage)),
 await refundEvent(db,ctx,first.obligationId,'customer_reversal_corrected','Finance recorded the corrected responsibility for the reviewed returned credits and restored any seller amount no longer owed.',{reversalIds:ids,correctionId:input.correctionId}),
 ...await financialNoticeStatements(db,ctx,{kind:'finance.refund',sourceId:first.obligationId,status:'customer_reversal_corrected'})]};
}

