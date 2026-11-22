import type {CommandContext} from '../workflows/contracts';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {ManualPaymentError,paymentGuard} from './manual-receipts';
import {responseScopeContains} from '../orders/response-sql';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {refundEvent} from './refund-obligations';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {actualManualReceiptUseSql} from './receipt-use-accounting';
export {actualManualReceiptUseSql as actualReceiptUseSql} from './receipt-use-accounting';
class LossAuthorityError extends Error{readonly status=403;}
export interface CompletedReceiptReturnInput{receiptUseId:string;packetId:string;amountPaisa:number;}
export interface ReceiptReturnBankLossPlan extends CompletedReceiptReturnInput{id:string;reviewId:string;reversalId:string;receiptId:string;useRevision:number;obligationId:string;customerId:string;}
export const RECEIPT_RETURN_BANK_LOSS_MESSAGE='Your original completed return remains paid. Finance reconciled a later bank reversal as a company cost; no new amount is due from you.';
/** Alias arguments are internal SQL only. Paid bank proof is mandatory; reserved/uncertain is never a loss. */
export function completedReceiptReturnProofSql(use='used',receipt='receipt',packet='packet',obligation='original'){
 return `${use}.kind='return' AND ${use}.state='returned' AND ${use}.receipt_id=${receipt}.id AND ${obligation}.id=${use}.target_id AND ${obligation}.receipt_use_id=${use}.id AND ${obligation}.source_kind='receipt_return' AND ${obligation}.source_id=${receipt}.id AND ${obligation}.receipt_id=${receipt}.id AND ${obligation}.customer_id=${receipt}.payer_user_id AND ${obligation}.currency='NPR' AND ${obligation}.wallet_paisa=0 AND ${obligation}.cash_paisa=${use}.amount_minor AND ${obligation}.state='completed' AND ${packet}.obligation_id=${obligation}.id AND ${packet}.state='paid' AND ${packet}.currency='NPR' AND ${packet}.amount_paisa=${actualManualReceiptUseSql(use)}+${completedReturnUseLossSql(use+'.id')} AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=${packet}.id AND bank.amount_paisa=${packet}.amount_paisa AND bank.account_version_id=${packet}.account_version_id AND bank.identity_hash=${packet}.transaction_identity_hash AND bank.bank_at=${packet}.bank_at) AND EXISTS(SELECT 1 FROM refund_destination_versions destination WHERE destination.id=${packet}.destination_version_id AND destination.obligation_id=${obligation}.id AND destination.status='verified' AND destination.relationship IN('own_account','original_payer'))`;
}
export function completedReturnUseLossSql(useId:string){return `COALESCE((SELECT SUM(prior_loss.amount_paisa) FROM receipt_return_bank_losses prior_loss JOIN seller_recovery_receipt_reversal_reviews prior_review ON prior_review.id=prior_loss.review_id WHERE prior_loss.receipt_use_id=${useId} AND prior_review.state='completed'),0)`;}
export function completedReceiptReturnLossSql(receipt:string){return `COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss JOIN seller_recovery_receipt_reversal_reviews review ON review.id=loss.review_id WHERE loss.receipt_id=${receipt} AND review.state='completed'),0)`;}
export function receiptReturnLossInterestSql(db:D1Database,actor:string,receipt='receipt',packet='packet',original='original'){
 return `${actor}<>${original}.customer_id AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=${receipt}.id AND conflict.user_id=${actor}) AND NOT EXISTS(SELECT 1 FROM company_payment_account_versions account WHERE account.id IN(${receipt}.account_version_id,${packet}.account_version_id) AND ${responseScopeContains(db,'account.conflicts_json',actor)}) AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id WHERE (EXISTS(SELECT 1 FROM seller_recovery_allocations allocation WHERE allocation.receipt_id=${receipt}.id AND allocation.case_id=c.id) OR EXISTS(SELECT 1 FROM customer_refund_reversals returned JOIN refund_obligations paid ON paid.id=returned.obligation_id WHERE returned.receipt_id=${receipt}.id AND paid.source_kind='return_refund' AND paid.source_id=c.refund_id)) AND (seller.user_id=${actor} OR json_extract(c.original_source_json,'$.ownerId')=${actor} OR json_extract(c.original_source_json,'$.customerId')=${actor} OR EXISTS(SELECT 1 FROM refunds linked_refund JOIN orders linked_order ON linked_order.id=linked_refund.order_id WHERE linked_refund.id=c.refund_id AND linked_order.customer_id=${actor})))`;
}
export async function readReceiptReturnBankLossCandidates(db:D1Database,receiptId:string){return (await db.prepare(`SELECT used.id receiptUseId,packet.id packetId,original.id obligationId,used.revision useRevision,used.amount_minor amountPaisa,${actualManualReceiptUseSql('used')}-(COALESCE(pool.used_paisa,0)-${completedReturnUseLossSql('used.id')}) availableLossPaisa FROM manual_receipt_uses used JOIN company_money_receipts receipt ON receipt.id=used.receipt_id JOIN refund_obligations original ON original.id=used.target_id JOIN outgoing_payment_packets packet ON packet.obligation_id=original.id LEFT JOIN receipt_return_bank_loss_pools pool ON pool.receipt_use_id=used.id WHERE receipt.id=? AND ${completedReceiptReturnProofSql()} ORDER BY used.id,packet.id`).bind(receiptId).all<{receiptUseId:string;packetId:string;obligationId:string;useRevision:number;amountPaisa:number;availableLossPaisa:number}>()).results;}
/** Composes only into the common actual-bank reversal review transaction. */
export async function prepareReceiptReturnBankLosses(db:D1Database,ctx:CommandContext,input:{reviewId:string;reversalId:string;completedReturns?:CompletedReceiptReturnInput[];companyLossApproved?:boolean}){
 const proposed=input.completedReturns??[];
 if(!Array.isArray(proposed)||proposed.length>100||proposed.some(row=>!row||typeof row!=='object'||Array.isArray(row))||new Set(proposed.map(row=>row.receiptUseId)).size!==proposed.length)throw new ManualPaymentError('Identify each actually completed original-payer return once.',400);
 if(!proposed.length)return {parts:[] as ReceiptReturnBankLossPlan[],amountPaisa:0,guards:[] as D1PreparedStatement[],inserts:[] as D1PreparedStatement[]};
 if(input.companyLossApproved!==true)throw new ManualPaymentError('Explicitly approve the company cost of the actual reversed credit backing this completed return.',400);
 const authority=await staffMutationGuard(db,ctx.actorId,'payment.receipt.verify',LossAuthorityError,'super_admin').catch(error=>{if(error instanceof LossAuthorityError)throw new ManualPaymentError(error.message,403);throw error;}),parts:ReceiptReturnBankLossPlan[]=[],guards:D1PreparedStatement[]=[...authority.statements];
 let total=BigInt(0);
 for(const row of proposed){
 if(!row||Object.keys(row).some(key=>!['receiptUseId','packetId','amountPaisa'].includes(key))||typeof row.receiptUseId!=='string'||typeof row.packetId!=='string'||!row.receiptUseId||!row.packetId||!Number.isSafeInteger(row.amountPaisa)||row.amountPaisa<=0)throw new ManualPaymentError('Use the exact completed return, paid packet and positive paisa amount.',400);
 const proof=`SELECT used.receipt_id receiptId,used.revision useRevision,original.id obligationId,original.customer_id customerId FROM manual_receipt_uses used JOIN company_money_receipts receipt ON receipt.id=used.receipt_id JOIN refund_obligations original ON original.id=used.target_id JOIN outgoing_payment_packets packet ON packet.obligation_id=original.id JOIN company_receipt_reversals reversal ON reversal.receipt_id=receipt.id WHERE reversal.id=? AND used.id=? AND packet.id=? AND receipt.kind='bank_credit' AND receipt.currency='NPR' AND ${completedReceiptReturnProofSql()}`;
 const bound=[input.reversalId,row.receiptUseId,row.packetId];
 const original=await db.prepare(proof).bind(...bound).first<{receiptId:string;useRevision:number;obligationId:string;customerId:string}>();
 if(!original)throw new ManualPaymentError('Review an actually completed original-payer return with remaining bank-loss capacity and no personal interest. Reserved or uncertain payments remain held.');
 const interest=`EXISTS(SELECT 1 FROM company_money_receipts receipt JOIN refund_obligations original ON original.id=? JOIN outgoing_payment_packets packet ON packet.id=? WHERE receipt.id=? AND ${receiptReturnLossInterestSql(db,'?')})`;
 const interestValues=[original.obligationId,row.packetId,original.receiptId,...Array.from({length:(interest.match(/\?/g)??[]).length-3},()=>ctx.actorId)];
 if(!await db.prepare('SELECT 1 WHERE '+interest).bind(...interestValues).first())throw new ManualPaymentError('Use an eligible reviewer without a current or retained personal interest in this completed return.',403);
 const capacity=`EXISTS(SELECT 1 FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=? AND ?>0 AND ?<=backing.amount_paisa-(COALESCE((SELECT used_paisa FROM receipt_return_bank_loss_pools pool WHERE pool.receipt_use_id=backing.receipt_use_id),0)-${completedReturnUseLossSql('backing.receipt_use_id')}))`,capacityValues=[row.receiptUseId,row.amountPaisa,row.amountPaisa];
 if(!await db.prepare('SELECT 1 WHERE '+capacity).bind(...capacityValues).first())throw new ManualPaymentError('Review the remaining bank-loss capacity of this actually completed original-payer return.');
 guards.push(...paymentGuard(db,interest,interestValues),...paymentGuard(db,capacity,capacityValues));
 total+=BigInt(row.amountPaisa);if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new ManualPaymentError('The bank loss exceeds the supported exact range.',400);
 parts.push({id:crypto.randomUUID(),reviewId:input.reviewId,reversalId:input.reversalId,...row,...original});guards.push(...paymentGuard(db,`EXISTS(${proof})`,bound));
 }
 const inserts=parts.map(part=>db.prepare(`INSERT INTO receipt_return_bank_losses(id,review_id,reversal_id,receipt_id,receipt_use_id,use_revision,packet_id,obligation_id,amount_paisa,actor_id,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,${checkoutCommitClock(db)})`).bind(part.id,part.reviewId,part.reversalId,part.receiptId,part.receiptUseId,part.useRevision,part.packetId,part.obligationId,part.amountPaisa,ctx.actorId,ctx.requestId));
 return {parts,amountPaisa:Number(total),guards,inserts};
}
export async function receiptReturnBankLossHistoryStatements(db:D1Database,ctx:CommandContext,parts:ReceiptReturnBankLossPlan[]){
 const statements:D1PreparedStatement[]=[];
 for(const part of parts){statements.push(await refundEvent(db,{...ctx,requestId:ctx.requestId+':return-loss:'+part.id},part.obligationId,'receipt_return_bank_loss',RECEIPT_RETURN_BANK_LOSS_MESSAGE,{reviewId:part.reviewId,lossId:part.id,reversalId:part.reversalId,amountPaisa:part.amountPaisa}),...await operationalBusinessNotificationStatements(db,{kind:'payment.return_loss',sourceId:part.id,eventId:ctx.requestId,actorId:ctx.actorId,now:ctx.now,status:'company_bank_loss',detail:RECEIPT_RETURN_BANK_LOSS_MESSAGE}));}
 return statements;
}







