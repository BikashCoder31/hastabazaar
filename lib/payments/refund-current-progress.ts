import { checkoutCommitClock } from '../checkout/commit-policy-guards';
import { bankSatisfiedReceiptReturnSql } from './receipt-return-bank-satisfaction';

export type ContinuingRefundState='open'|'processing'|'uncertain'|'completed'|'blocked';
export interface RefundCurrentProgress{
 status:'returned_for_review'|'retry_pending'|'retry_processing'|'retry_uncertain'|'retry_completed'|'corrected'|'returned_recorded'|'needs_reconciliation';
 label:string;message:string;pendingReview:boolean;hasUnfinishedRetry:boolean;hasCorrection:boolean;returnedCashPaisa:number;retryStates:ContinuingRefundState[];
}
const states=new Set<ContinuingRefundState>(['open','processing','uncertain','completed','blocked']);
const advice:Record<RefundCurrentProgress['status'],{label:string;message:string}>={
 returned_for_review:{label:'Bank-returned refund under review',message:'The bank returned part or all of the original refund. Finance is reviewing the continuing obligation; the earlier paid notice is historical.'},
 retry_pending:{label:'Continuing refund pending',message:'The bank returned part or all of the original refund. A separate continuing refund is pending. The original paid notice does not confirm the new payment.'},
 retry_processing:{label:'Continuing refund processing',message:'The bank returned part or all of the original refund. The separate continuing refund is being processed; its completion is not yet confirmed.'},
 retry_uncertain:{label:'Continuing refund outcome uncertain',message:'The bank returned part or all of the original refund. The continuing refund outcome is uncertain. Finance must reconcile it before another payment.'},
 retry_completed:{label:'Continuing refund completed',message:'The bank returned part or all of the original refund. The separately recorded continuing refund is completed. The original payment and bank-return history remain available.'},
 corrected:{label:'Returned refund has a recorded correction',message:'The bank returned part or all of the original refund. An entitlement correction was recorded; review the original decision and current refund details. A correction is not a new payment.'},
 returned_recorded:{label:'Bank return has separate recorded dispositions',message:'The bank returned part or all of the original refund. Its separate recorded dispositions and any continuing payment are shown in refund details.'},
 needs_reconciliation:{label:'Current refund progress needs reconciliation',message:'The bank returned part or all of the original refund. Its linked current progress needs reconciliation; the earlier paid notice is not current payment confirmation.'},
};

/** Current source fence for a separately authorized paid-case closure. This does
 * not prove the original payment: its existing native paid/physical guards remain.
 */
export function refundBankReturnSettlementSql(refundIdSql:string){return `NOT EXISTS(
 SELECT 1 FROM customer_refund_reversals reversal
 JOIN refund_obligations original ON original.id=reversal.obligation_id
 LEFT JOIN customer_refund_reversal_dispositions disposition ON disposition.reversal_id=reversal.id
 WHERE original.source_kind='return_refund' AND original.source_id=${refundIdSql}
 AND (disposition.id IS NULL OR NOT (
  (disposition.kind='retain' AND EXISTS(SELECT 1 FROM refund_obligations retry
   WHERE retry.id=disposition.retry_obligation_id AND retry.source_kind='receipt_return'
    AND retry.source_id=reversal.receipt_id AND retry.receipt_id=reversal.receipt_id
    AND retry.customer_id=original.customer_id AND retry.state='completed'))
  OR (disposition.kind='restore' AND EXISTS(SELECT 1 FROM seller_recovery_liability_corrections correction
   JOIN seller_recovery_cases recovery_case ON recovery_case.id=correction.case_id
   WHERE correction.id=disposition.correction_id AND recovery_case.refund_id=original.source_id))
 )))`;}

/** Sanitized current advice after a real recorded bank return. Historical paid facts
 * remain unchanged. This read projection grants no authority or payment/closure action.
 */
export async function readRefundCurrentProgress(db:D1Database,refundId:string):Promise<RefundCurrentProgress|null>{
 const rows=(await db.prepare(`SELECT reversal.amount_paisa AS amountPaisa,disposition.kind,
   disposition.retry_obligation_id AS expectedRetryId,disposition.correction_id AS correctionId,
   retry.id AS retryId,retry.state AS retryState
  FROM customer_refund_reversals reversal
  JOIN refund_obligations original ON original.id=reversal.obligation_id
  LEFT JOIN customer_refund_reversal_dispositions disposition ON disposition.reversal_id=reversal.id
  LEFT JOIN refund_obligations retry ON retry.id=disposition.retry_obligation_id
   AND retry.source_kind='receipt_return' AND retry.source_id=reversal.receipt_id
   AND retry.receipt_id=reversal.receipt_id AND retry.customer_id=original.customer_id
  WHERE original.source_kind='return_refund' AND original.source_id=?
  ORDER BY reversal.created_at,reversal.id`).bind(refundId).all<{amountPaisa:number;kind:string|null;expectedRetryId:string|null;correctionId:string|null;retryId:string|null;retryState:ContinuingRefundState|null}>()).results;
 if(!rows.length)return null;
 const pendingReview=rows.some(row=>row.kind===null),hasCorrection=rows.some(row=>row.kind==='restore'),retained=rows.filter(row=>row.kind==='retain');
 const retryStates=[...new Set(retained.flatMap(row=>row.retryState&&states.has(row.retryState)?[row.retryState]:[]))];
 const returnedCashPaisa=rows.reduce((total,row)=>total+Number(row.amountPaisa),0);
 const invalid=!Number.isSafeInteger(returnedCashPaisa)||returnedCashPaisa<=0||rows.some(row=>row.kind!==null&&row.kind!=='retain'&&row.kind!=='restore'||row.kind==='retain'&&(!row.retryId||row.retryId!==row.expectedRetryId||!row.retryState||!states.has(row.retryState))||row.kind==='restore'&&!row.correctionId);
 const hasUnfinishedRetry=retained.some(row=>!row.retryId||row.retryState!=='completed');
 const status:RefundCurrentProgress['status']=invalid?'needs_reconciliation':pendingReview?'returned_for_review':retryStates.includes('uncertain')?'retry_uncertain':retryStates.includes('processing')?'retry_processing':hasUnfinishedRetry?'retry_pending':hasCorrection&&retained.length?'returned_recorded':hasCorrection?'corrected':retained.length?'retry_completed':'needs_reconciliation';
 return{status,...advice[status],pendingReview,hasUnfinishedRetry,hasCorrection,returnedCashPaisa,retryStates};
}

export const customerRefundDelayReasons = {
 payment_details_needed: 'We need your payment details before we can send the refund.',
 payment_details_verification: 'We are verifying the payment details you sent.',
 company_funding_review: 'Finance is confirming funds for your approved payment.',
 bank_processing: 'Finance is checking the progress of your refund payment.',
 bank_outcome_reconciliation: 'Finance is checking the bank outcome before any further payment action.',
} as const;

export type CustomerRefundDelayReason = keyof typeof customerRefundDelayReasons;

export interface CustomerRefundPaymentProgress {
 status: 'approved' | 'payment_details_needed' | 'submitted' | 'reconciling' | 'confirmed_settled';
 label: string;
 message: string;
 delay: {reason:string;nextUpdateAt:number} | null;
}

export function refundEventValueSql(db:D1Database,path:string) {
 const json = (db as D1Database & {dialect?:string}).dialect === 'mariadb' ? 'JSON_VALUE' : 'json_extract';
 return `${json}(native_event.private_details_json,'$.${path}')`;
}

function destinationStatusSql() {
 return `(SELECT destination.status FROM refund_destination_heads head JOIN refund_destination_versions destination
  ON destination.id=head.version_id AND destination.obligation_id=head.obligation_id WHERE head.obligation_id=original.id)`;
}

export function currentRefundDelayReasonSql(reasonSql:string) {
 const destination=destinationStatusSql();
 const owesCash=`original.cash_paisa>${bankSatisfiedReceiptReturnSql()}`;
 const bankPacket=(state:'processing'|'uncertain')=>`EXISTS(SELECT 1 FROM outgoing_payment_packets packet
  WHERE packet.obligation_id=original.id AND packet.state='${state}' AND packet.currency='NPR' AND packet.amount_paisa>0
   AND packet.account_version_id IS NOT NULL AND packet.destination_version_id IS NOT NULL)`;
 return `CASE ${reasonSql}
  WHEN 'payment_details_needed' THEN original.state='open' AND ${owesCash} AND COALESCE(${destination},'missing') IN('missing','rejected')
  WHEN 'payment_details_verification' THEN original.state='open' AND ${owesCash} AND ${destination}='submitted'
  WHEN 'company_funding_review' THEN original.state='blocked' AND ${owesCash}
  WHEN 'bank_processing' THEN original.state='processing' AND ${bankPacket('processing')}
  WHEN 'bank_outcome_reconciliation' THEN original.state='uncertain' AND ${bankPacket('uncertain')}
  ELSE 0 END`;
}

export function currentRefundDelaySql(db:D1Database) {
 const reason=refundEventValueSql(db,'reasonCode');
 const nextUpdate=refundEventValueSql(db,'nextUpdateAt');
 const revision=refundEventValueSql(db,'obligationRevision');
 return `original.revision=${revision} AND original.next_update_at=${nextUpdate}
  AND original.next_update_at>${checkoutCommitClock(db)} AND (${currentRefundDelayReasonSql(reason)})`;
}

/** Retained acknowledgment for the original exact processing packet. */
export function currentRefundBankSubmissionSql(db:D1Database) {
 const value=(path:string)=>refundEventValueSql(db,path);
 return `original.state='processing' AND EXISTS(
  SELECT 1 FROM outgoing_payment_packets packet
  JOIN finance_evidence_intents intent ON intent.id=${value('evidenceReference')}
  JOIN finance_evidence_files evidence ON evidence.id=intent.id
  WHERE packet.obligation_id=original.id AND packet.id=${value('packetId')}
    AND packet.state='processing' AND packet.currency='NPR' AND packet.amount_paisa>0
    AND packet.revision=${value('packetRevision')} AND packet.amount_paisa=${value('amountPaisa')}
    AND packet.account_version_id=${value('accountVersionId')} AND packet.destination_version_id=${value('destinationVersionId')}
    AND ${value('acknowledgedAt')} BETWEEN packet.started_at AND native_event.created_at
    AND intent.scope_kind='obligation' AND intent.scope_id=original.id AND intent.uploaded_by<>original.customer_id
 )`;
}

async function readPaymentProgress(db:D1Database,id:string,forReturn:boolean):Promise<CustomerRefundPaymentProgress|null> {
 const match=forReturn?"original.source_kind='return_refund' AND original.source_id=?":'original.id=?';
 const bankSatisfied=bankSatisfiedReceiptReturnSql();
 const cash=`original.cash_paisa-(${bankSatisfied})`;
 const eventPacket=refundEventValueSql(db,'packetId');
 const row=await db.prepare(`SELECT original.state,original.cash_paisa AS originalCash,${cash} AS cash,
   original.next_update_at AS nextUpdateAt,${destinationStatusSql()} AS destinationStatus,
   EXISTS(SELECT 1 FROM outgoing_payment_packets packet WHERE packet.obligation_id=original.id AND packet.state='processing') AS processingPacket,
   EXISTS(SELECT 1 FROM refund_obligation_events native_event WHERE native_event.obligation_id=original.id
    AND native_event.action='packet_submitted' AND ${currentRefundBankSubmissionSql(db)}) AS bankSubmitted,
   EXISTS(SELECT 1 FROM outgoing_payment_packets packet WHERE packet.obligation_id=original.id
    AND packet.state='paid' AND packet.amount_paisa=${cash} AND packet.recorded_by IS NOT NULL
    AND ((packet.amount_paisa>0 AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank
      WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.identity_hash=packet.transaction_identity_hash
        AND bank.account_version_id=packet.account_version_id AND bank.amount_paisa=packet.amount_paisa
        AND bank.bank_at=packet.bank_at AND bank.transaction_identity=packet.transaction_identity))
      OR (packet.amount_paisa=0 AND original.wallet_paisa>0 AND EXISTS(
        SELECT 1 FROM refund_obligation_events native_event WHERE native_event.obligation_id=original.id
          AND native_event.action='packet_paid' AND ${eventPacket}=packet.id)))) AS paymentConfirmed,
   (SELECT ${refundEventValueSql(db,'reasonCode')} FROM operational_notice_states marker
    JOIN refund_obligation_events native_event ON native_event.id=marker.current_event_id AND native_event.obligation_id=original.id
    WHERE marker.family='finance.refund' AND marker.source_id=original.id AND marker.current_status='customer_delay'
      AND native_event.action='customer_delay' AND ${currentRefundDelaySql(db)}) AS delayReason
  FROM refund_obligations original WHERE ${match}`).bind(id).first<{
   state:string;originalCash:number;cash:number;nextUpdateAt:number;destinationStatus:string|null;
   processingPacket:number;bankSubmitted:number;paymentConfirmed:number;delayReason:CustomerRefundDelayReason|null;
  }>();
 if(!row)return null;
 const delay=row.delayReason?{reason:customerRefundDelayReasons[row.delayReason],nextUpdateAt:row.nextUpdateAt}:null;
 if(row.state==='completed'&&(row.paymentConfirmed||row.originalCash>0&&row.cash===0)){
  const message=row.cash>0?'The refund payment has settled.':row.originalCash>0
   ?'The bank returned the verified amount directly to its original payer.':'Your original wallet credit has been restored.';
  return {status:'confirmed_settled',label:'Confirmed settled',message,delay:null};
 }
 if(row.state==='uncertain'||row.state==='completed'||row.state==='processing'&&!row.processingPacket){
  return {status:'reconciling',label:'Reconciling',message:'Finance is checking the original refund outcome before taking further payment action.',delay};
 }
 if(row.bankSubmitted){
  return {status:'submitted',label:'Submitted',message:'The bank has acknowledged the refund instruction. Settlement is still pending.',delay};
 }
 if(row.state==='open'&&row.cash>0&&(!row.destinationStatus||row.destinationStatus==='rejected')){
  return {status:'payment_details_needed',label:'Payment details needed',message:'Provide private payment details so Finance can verify where to send this refund.',delay};
 }
 const message=row.state==='processing'?'Finance is preparing the approved payment or original credit restoration.':row.state==='blocked'
  ?'Finance is confirming funds for your approved refund.':row.destinationStatus==='submitted'
  ?'Finance is verifying your saved payment details.':'Finance is reviewing the approved refund for payment.';
 return {status:'approved',label:'Approved',message,delay};
}

export function readCustomerRefundPaymentProgress(db:D1Database,obligationId:string) {
 return readPaymentProgress(db,obligationId,false);
}

export function readReturnRefundPaymentProgress(db:D1Database,refundId:string) {
 return readPaymentProgress(db,refundId,true);
}
