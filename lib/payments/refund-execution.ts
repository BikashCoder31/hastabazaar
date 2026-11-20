import {actualRecoveryAllocationSql} from './recovery-receipt-accounting';
import {actualManualReceiptUseSql} from './receipt-use-accounting';
import {bankSatisfiedReceiptUseSql} from './receipt-return-bank-satisfaction';
import {financeEvidenceReferenceGuards} from './refund-evidence';
import {refundEventValueSql} from './refund-current-progress';
import {verifiedCodCashSql} from './refund-cod-proof';
import {postCancellationGrossSql} from '../db/repositories/platform-service-fee';
import {lawfulServiceFeeRefundTotalSql} from '../db/repositories/platform-service-fee-refunds';
import {prepareLawfulServiceFeeRefundStatements} from '../db/repositories/platform-service-fee-refunds';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import type {CommandContext} from '../workflows/contracts';
import {prepareReturnOperationStatements} from '../db/repositories/returns';
import {responseScopeContains} from '../orders/response-sql';
import {paymentGuard} from './manual-receipts';
import {preparePaymentException} from './payment-exceptions';
import {currentFundingAccount,fundingAvailableSql,getRefundFundingAvailability} from './refund-funding';
import {getRefundObligation,orderActualCashSql,originalRefundCashReservationsSql,refundCommand,refundEvent,refundIndependence,refundText,returnRefundCostCoverage,RefundObligationError,type RefundObligation,type SavedVariantRefundPricingEffect} from './refund-obligations';

interface Packet{id:string;obligationId:string;fundingStatementId:string|null;accountVersionId:string|null;destinationVersionId:string|null;amountPaisa:number;state:string;revision:number;startedAt:number|null;}
/** A fee or merchandise completion cannot conceal still-unpaid cancellation cash. */
function orderRefundStatus(db:D1Database,orderId:string){
 const clock=checkoutCommitClock(db),cash=`COALESCE((SELECT SUM(r.amount_paisa-r.wallet_credit_paisa-r.referral_discount_paisa-r.promo_discount_paisa) FROM refunds r WHERE r.order_id=orders.id AND r.status='paid'),0)+COALESCE((SELECT SUM(r.cash_paisa) FROM refund_obligations r WHERE r.order_id=orders.id AND r.source_kind<>'return_refund' AND r.state='completed'),0)+COALESCE((SELECT SUM(json_extract(a.next_json,'$.request.amountPaisa')) FROM audit_logs a WHERE a.subject_type='order' AND a.subject_id=orders.id AND a.action='platform_service_fee.refunded' AND json_extract(a.next_json,'$.executionPacketId') IS NULL),0)`;
 const disposed=`COALESCE((SELECT SUM(amount_paisa) FROM refunds WHERE order_id=orders.id AND status='paid'),0)+${lawfulServiceFeeRefundTotalSql('orders')}>=${postCancellationGrossSql()}`;
 return [db.prepare(`UPDATE orders SET payment_status=CASE WHEN (${disposed}) AND (${cash})>=(${orderActualCashSql('orders')}) THEN 'refunded' ELSE 'part_refunded' END,updated_at=${clock} WHERE id=?`).bind(orderId),db.prepare(`UPDATE payments SET status=(SELECT payment_status FROM orders WHERE id=payments.order_id),updated_at=${clock} WHERE order_id=?`).bind(orderId)];
}
async function packetRow(db:D1Database,id:string){const row=await db.prepare('SELECT id,obligation_id AS obligationId,funding_statement_id AS fundingStatementId,account_version_id AS accountVersionId,destination_version_id AS destinationVersionId,amount_paisa AS amountPaisa,state,revision,started_at AS startedAt FROM outgoing_payment_packets WHERE id=?').bind(id).first<Packet>();if(!row)throw new RefundObligationError('Open the original outgoing payment packet.');return row;}

/** Binds actual collected tender and all existing native refund reservations under the original order lock. */
export async function refundSourceGuards(db:D1Database,row:RefundObligation){
 if(row.sourceKind==='return_refund'){
  const snapshot=JSON.parse(row.sourceSnapshotJson) as {amount:number;wallet:number;referral:number;promo:number;caseId:string;variantPricingEffect?:SavedVariantRefundPricingEffect};
  const coverage = returnRefundCostCoverage(snapshot.variantPricingEffect);
  const orderCash = row.cashPaisa > 0
    ? `CASE WHEN o.payment_mode='cod' THEN ${verifiedCodCashSql(db,'o')} ELSE ${orderActualCashSql()} END`
    : orderActualCashSql();
  const sellerCodCash = row.cashPaisa > 0
    ? verifiedCodCashSql(db,'o','i')
    : `COALESCE((SELECT SUM(p.collected_paisa) FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id
        WHERE j.order_id=o.id AND j.seller_id=i.seller_id AND j.direction='outbound'),0)`;
  const predicate=`EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id
    JOIN return_requests c ON c.id=r.return_request_id JOIN order_items i ON i.id=c.order_item_id
    WHERE r.id=? AND o.id=? AND o.customer_id=? AND c.id=? AND r.status IN('approved','processing','failed')
      AND r.amount_paisa=? AND r.wallet_credit_paisa=? AND r.referral_discount_paisa=? AND r.promo_discount_paisa=?
      AND (r.is_high_value=0 OR r.high_value_approved_by IS NOT NULL) AND (${coverage.predicate})
      AND ${originalRefundCashReservationsSql()}<=(${orderCash})
      AND (o.payment_mode<>'cod' OR COALESCE((SELECT SUM(x.amount_paisa-x.wallet_credit_paisa-x.referral_discount_paisa-x.promo_discount_paisa)
        FROM refunds x JOIN return_requests xc ON xc.id=x.return_request_id JOIN order_items xi ON xi.id=xc.order_item_id
        WHERE x.order_id=o.id AND xi.seller_id=i.seller_id AND x.status<>'rejected'),0)
        <=${sellerCodCash}))`;
  const values=[row.sourceId,row.orderId,row.customerId,snapshot.caseId,snapshot.amount,snapshot.wallet,snapshot.referral,snapshot.promo,...coverage.values];
  const reconciliation = 'The actual original collected cash, remaining entitlement or source allocations need reconciliation before payment.';
  let matched;
  try {
    matched = await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first();
  } catch (error) {
    if (snapshot.variantPricingEffect === undefined) throw error;
    throw new RefundObligationError(reconciliation);
  }
  if (!matched) throw new RefundObligationError(reconciliation);
  return [db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(row.orderId),...paymentGuard(db,predicate,values)];
 }
 if(row.sourceKind==='cancellation'){
  const predicate=`EXISTS(SELECT 1 FROM cancellation_refund_sources c JOIN orders o ON o.id=c.order_id WHERE c.id=? AND c.order_id=? AND c.customer_id=? AND c.cash_paisa=? AND c.state='authorized' AND ${originalRefundCashReservationsSql()}<=(${orderActualCashSql()}))`;
  const values=[row.sourceId,row.orderId,row.customerId,row.cashPaisa];if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new RefundObligationError('Reconcile the original cancellation entitlement and collected cash before payment.');
  return [db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(row.orderId),...paymentGuard(db,predicate,values)];
 }
 if(row.sourceKind==='service_fee'){
  const predicate=`EXISTS(SELECT 1 FROM lawful_fee_refund_authorizations f JOIN orders o ON o.id=f.order_id WHERE f.id=? AND f.order_id=? AND f.customer_id=? AND f.amount_paisa=? AND f.state='authorized' AND ${originalRefundCashReservationsSql()}<=(${orderActualCashSql()}))`;
  const values=[row.sourceId,row.orderId,row.customerId,row.cashPaisa];if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new RefundObligationError('Reconcile the original authorized fee and actual collected cash before payment.');
  return [db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(row.orderId),...paymentGuard(db,predicate,values)];
 }
 if(row.sourceKind==='receipt_return'){
  const predicate=`EXISTS(SELECT 1 FROM company_money_receipts r JOIN manual_receipt_uses u ON u.receipt_id=r.id WHERE r.id=? AND r.payer_user_id=? AND r.status='verified' AND r.currency='NPR' AND u.id=? AND u.kind='return' AND u.target_id=? AND u.amount_minor-${bankSatisfiedReceiptUseSql('u')}=? AND u.state='reserved' AND r.amount_minor>=COALESCE((SELECT SUM(x.amount_minor) FROM company_receipt_reversals x WHERE x.receipt_id=r.id),0)+(COALESCE((SELECT SUM(${actualManualReceiptUseSql('x')}) FROM manual_receipt_uses x WHERE x.receipt_id=r.id AND x.state<>'released'),0)+COALESCE((SELECT SUM(${actualRecoveryAllocationSql('recovery_use')}) FROM seller_recovery_allocations recovery_use WHERE recovery_use.receipt_id=r.id),0)))`;
  const values=[row.receiptId,row.customerId,row.receiptUseId,row.id,row.cashPaisa];if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new RefundObligationError('Reconcile the original payer, actual receipt and reserved unused balance.');
  return [db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=?').bind(row.receiptId),...paymentGuard(db,predicate,values)];
 }
 throw new RefundObligationError('This source needs its native refund allocation mapping before execution.');
}
async function boundSources(db:D1Database,ctx:CommandContext,row:RefundObligation,packet:Pick<Packet,'accountVersionId'|'fundingStatementId'|'destinationVersionId'>){
 if(row.cashPaisa===0){if(packet.accountVersionId!==null||packet.fundingStatementId!==null||packet.destinationVersionId!==null)throw new RefundObligationError('An original credit-only restoration has no external bank destination or funding source.');return {funding:null,statements:[...await refundIndependence(db,ctx.actorId,row.customerId,row.orderId,row.receiptId),...await refundSourceGuards(db,row)]};}
 const account=await currentFundingAccount(db,packet.accountVersionId!,ctx.actorId),funding=await getRefundFundingAvailability(db,account.id);
 if(funding.id!==packet.fundingStatementId)throw new RefundObligationError('The company funding evidence changed. Reprepare the unsent packet.');
 const destination=await db.prepare("SELECT d.id,d.revision FROM refund_destination_versions d JOIN refund_destination_heads h ON h.version_id=d.id AND h.obligation_id=d.obligation_id WHERE d.id=? AND d.obligation_id=? AND d.status='verified'").bind(packet.destinationVersionId,row.id).first<{id:string;revision:number}>();
 if(!destination)throw new RefundObligationError('Verify the current exact beneficiary before approving or starting this packet.');
 return {funding,statements:[...await refundIndependence(db,ctx.actorId,row.customerId,row.orderId,row.receiptId),...await refundSourceGuards(db,row),
  ...paymentGuard(db,`EXISTS(SELECT 1 FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id JOIN company_funding_accounts f ON f.account_id=a.id WHERE v.id=? AND v.revision=? AND v.status='verified' AND a.latest_version_id=v.id AND f.statement_id=? AND NOT ${responseScopeContains(db,'v.conflicts_json','?')})`,[account.id,account.revision,funding.id,ctx.actorId]),
  ...paymentGuard(db,"EXISTS(SELECT 1 FROM refund_destination_heads h JOIN refund_destination_versions d ON d.id=h.version_id WHERE h.obligation_id=? AND h.version_id=? AND d.revision=? AND d.status='verified')",[row.id,destination.id,destination.revision]) ]};
}
function obligationState(db:D1Database,ctx:CommandContext,row:RefundObligation,state:string){return [db.prepare(`UPDATE refund_obligations SET state=?,revision=revision+1,owner_id=?,next_update_at=${checkoutCommitClock(db)}+86400000 WHERE id=? AND revision=?`).bind(state,ctx.actorId,row.id,row.revision),...paymentGuard(db,'changes()=1')];}
export async function prepareRefundPacket(db:D1Database,ctx:CommandContext,input:{obligationId:string;destinationVersionId:string|null;fundingStatementId:string|null;reason:string}){
 const row=await getRefundObligation(db,input.obligationId);if(!row)throw new RefundObligationError('Open the original refund obligation.');
 const cmd=await refundCommand(db,ctx,'packet_prepared',row.id,input);if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number};
 refundText(input.reason,'packet preparation reason',10);if(ctx.expectedRevision!==String(row.revision)||row.state!=='open')throw new RefundObligationError('Review the current original obligation and its pending payment attempt.');
 const statement=await db.prepare('SELECT account_version_id AS versionId FROM company_funding_statements WHERE id=?').bind(input.fundingStatementId).first<{versionId:string}>();if(row.cashPaisa>0&&!statement)throw new RefundObligationError('Verify actual available company funds first.');
 const sources=await boundSources(db,ctx,row,{accountVersionId:statement?.versionId??null,fundingStatementId:input.fundingStatementId,destinationVersionId:input.destinationVersionId}),id=crypto.randomUUID();
 return cmd.commit([...sources.statements,...obligationState(db,ctx,row,'open'),db.prepare(`INSERT INTO outgoing_payment_packets(id,obligation_id,funding_statement_id,account_version_id,destination_version_id,amount_paisa,currency,state,prepared_by,prepared_at) VALUES(?,?,?,?,?,?,'NPR','prepared',?,${checkoutCommitClock(db)})`).bind(id,row.id,input.fundingStatementId,statement?.versionId??null,input.destinationVersionId,row.cashPaisa,ctx.actorId),await refundEvent(db,ctx,row.id,'packet_prepared','The exact refund packet is prepared for the required approval.',{packetId:id,reason:input.reason})],{id,revision:0});
}
async function approveRefundPacketAttempt(db:D1Database,ctx:CommandContext,input:{packetId:string;reason:string},retry=1):Promise<{id:string;revision:number;blocked?:boolean}>{
 const packet=await packetRow(db,input.packetId),row=(await getRefundObligation(db,packet.obligationId))!,cmd=await refundCommand(db,ctx,'packet_approved',row.id,input,true);if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(packet.revision)||packet.state!=='prepared'||row.state!=='open')throw new RefundObligationError('Approve the current unsent prepared packet.');refundText(input.reason,'funding approval reason',10);
 const sources=await boundSources(db,ctx,row,packet);if(sources.funding&&sources.funding.availablePaisa<packet.amountPaisa){
  const followup=await preparePaymentException(db,{sourceKey:'refund:'+row.id,orderId:row.orderId,receiptId:row.receiptId,kind:'refund_funding',reason:'The original authorized refund needs additional available company funding. Restricted customer/seller money remains protected. '+input.reason,ownerId:ctx.actorId,now:ctx.now});
  return cmd.commit([...sources.statements,...paymentGuard(db,`EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=? AND ${fundingAvailableSql()}<?)`,[packet.fundingStatementId,packet.amountPaisa]),...obligationState(db,ctx,row,'blocked'),...followup,await refundEvent(db,ctx,row.id,'funding_blocked','Your refund remains approved. Finance is arranging the required funding and will provide the next update within 24 hours.',{packetId:packet.id,availablePaisa:sources.funding.availablePaisa,reason:input.reason})],{id:packet.id,revision:packet.revision,blocked:true});
 }
 try{return await cmd.commit([...sources.statements,...(sources.funding?[db.prepare('UPDATE company_funding_accounts SET revision=revision+1 WHERE statement_id=?').bind(packet.fundingStatementId),...paymentGuard(db,'changes()=1'),
  ...paymentGuard(db,`EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=? AND ${fundingAvailableSql()}>=?)`,[packet.fundingStatementId,packet.amountPaisa])]:[]),
  db.prepare(`UPDATE outgoing_payment_packets SET state='approved',revision=revision+1,approved_by=?,approved_at=${checkoutCommitClock(db)} WHERE id=? AND revision=? AND state='prepared'`).bind(ctx.actorId,packet.id,packet.revision),...paymentGuard(db,'changes()=1'),...obligationState(db,ctx,row,'open'),db.prepare("UPDATE manual_payment_exceptions SET state='resolved',revision=revision+1,updated_at="+checkoutCommitClock(db)+" WHERE source_key=? AND kind='refund_funding' AND state='open'").bind('refund:'+row.id),await refundEvent(db,ctx,row.id,'packet_approved','The exact refund amount and verified funding are approved. No transfer has been recorded.',{packetId:packet.id,reason:input.reason})],{id:packet.id,revision:packet.revision+1});
 }catch(error){
  // A lost native funding race is an owned business shortage, not an unexplained retry prompt.
  // One bounded reread preserves all original source, permission and CAS checks on the retry.
  if(retry>0){const latest=await packetRow(db,input.packetId);
   if(latest.state==='prepared'&&latest.revision===packet.revision&&latest.accountVersionId&&(await getRefundFundingAvailability(db,latest.accountVersionId)).availablePaisa<latest.amountPaisa)
    return approveRefundPacketAttempt(db,ctx,input,retry-1);
  }
  throw error;
 }
}
export async function approveRefundPacket(db:D1Database,ctx:CommandContext,input:{packetId:string;reason:string}){return approveRefundPacketAttempt(db,ctx,input);}

async function nativeReturnOperation(db:D1Database,ctx:CommandContext,row:RefundObligation,packetId:string,action:'start_refund'|'complete_refund'|'fail_refund',reference?:string){
 if(row.sourceKind!=='return_refund')return [];
 const snapshot=JSON.parse(row.sourceSnapshotJson) as {caseId:string};
 return prepareReturnOperationStatements(db,{returnRequestId:snapshot.caseId,actorId:ctx.actorId,actorRole:'super_admin',action,note:'Recorded through the original verified refund execution packet '+packetId,publicMessageEn:action==='complete_refund'?'Your refund payment and original credit restoration are recorded.':action==='start_refund'?'Your approved refund has entered manual processing.':'The original attempt has a confirmed unsuccessful outcome; Finance will review the next step.',publicMessageNe:action==='complete_refund'?'फिर्ता भुक्तानी र मौलिक क्रेडिट फिर्ता अभिलेख भयो।':'फिर्ता रकमको वर्तमान प्रक्रिया अभिलेख भयो।',reference,requestId:ctx.requestId,now:ctx.now},{packetId});
}
export async function startRefundPacket(db:D1Database,ctx:CommandContext,input:{packetId:string;reason:string}){
 const packet=await packetRow(db,input.packetId),row=(await getRefundObligation(db,packet.obligationId))!,cmd=await refundCommand(db,ctx,'packet_started',row.id,input,true);if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(packet.revision)||packet.state!=='approved'||row.state!=='open')throw new RefundObligationError('Only the exact currently approved unsent packet can begin processing.');refundText(input.reason,'manual instruction reason',10);
 const sources=await boundSources(db,ctx,row,packet),native=await nativeReturnOperation(db,ctx,row,packet.id,'start_refund');
 return cmd.commit([...sources.statements,...(sources.funding?[db.prepare('UPDATE company_funding_accounts SET revision=revision+1 WHERE statement_id=?').bind(packet.fundingStatementId),...paymentGuard(db,'changes()=1'),...paymentGuard(db,`EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=? AND ${fundingAvailableSql()}>=0)`,[packet.fundingStatementId])]:[]),
  db.prepare(`UPDATE outgoing_payment_packets SET state='processing',revision=revision+1,started_by=?,started_at=${checkoutCommitClock(db)} WHERE id=? AND revision=? AND state='approved'`).bind(ctx.actorId,packet.id,packet.revision),...paymentGuard(db,'changes()=1'),...native,...obligationState(db,ctx,row,'processing'),await refundEvent(db,ctx,row.id,'packet_started','The original manual payment instruction is processing. Its outcome must be reconciled before another attempt.',{packetId:packet.id,reason:input.reason})],{id:packet.id,revision:packet.revision+1});
}
export interface RefundPacketOutcome{packetId:string;outcome:'uncertain'|'paid'|'failed';reason:string;evidenceReference:string;transactionIdentity?:string;bankAt?:number;amountPaisa?:number;failureBasis?:'not_sent'|'no_debit'|'debit_returned';bankFinalityConfirmed?:boolean;completedTransferConfirmed?:boolean;exactBeneficiaryConfirmed?:boolean;creditRestorationConfirmed?:boolean;}
export async function recordRefundPacketOutcome(db:D1Database,ctx:CommandContext,input:RefundPacketOutcome){
 const packet=await packetRow(db,input.packetId),row=(await getRefundObligation(db,packet.obligationId))!,cmd=await refundCommand(db,ctx,'packet_outcome',row.id,input,true);if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number;state:string};
 if(ctx.expectedRevision!==String(packet.revision)||!['processing','uncertain'].includes(packet.state)||!['uncertain','paid','failed'].includes(input.outcome))throw new RefundObligationError('Reconcile the original processing or uncertain attempt. Do not create a replacement transfer.');
 refundText(input.reason,'actual bank-outcome reason',10);const outcomeEvidence=refundText(input.evidenceReference,'independent bank outcome evidence');
 if(packet.amountPaisa>0&&input.outcome==='failed'&&Array.from(outcomeEvidence).length<8)
  throw new RefundObligationError('Record the actual independent bank outcome evidence.',400);
 const clock=checkoutCommitClock(db),nativeNow=(await db.prepare(`SELECT ${clock} AS now`).first<{now:number}>())!.now;
 let transaction:string|null=null,hash:string|null=null,bankAt:number|null=null;
 if(input.outcome==='paid'&&packet.amountPaisa===0){if(input.amountPaisa!==0||input.creditRestorationConfirmed!==true)throw new RefundObligationError('Confirm restoration of this original credit-only tender.');
 }else if(input.outcome==='paid'){
  if(input.completedTransferConfirmed!==true||input.exactBeneficiaryConfirmed!==true||input.amountPaisa!==packet.amountPaisa||!Number.isSafeInteger(input.bankAt)||input.bankAt!<=0||input.bankAt!>nativeNow)throw new RefundObligationError('Match the exact actual completed bank amount and non-future transaction date.');
  transaction=refundText(input.transactionIdentity,'independent bank transaction identity',4,120);bankAt=input.bankAt!;
  const account=await db.prepare('SELECT account_id AS id FROM company_payment_account_versions WHERE id=?').bind(packet.accountVersionId).first<{id:string}>();
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([account!.id,transaction.normalize('NFKC').trim().toUpperCase()])));hash=Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
 }else if(input.outcome==='failed'&&!['not_sent','no_debit','debit_returned'].includes(input.failureBasis??''))throw new RefundObligationError('Confirm no completed debit, no sent instruction, or an actual returned debit before releasing the reservation.');
 let releaseGuards:D1PreparedStatement[]=[];
 if(input.outcome==='failed'){
  // A later uncertainty notice does not undo an earlier bank acknowledgment.
  const retained=`SELECT native_event.id FROM refund_obligation_events native_event
   WHERE native_event.obligation_id=? AND native_event.action='packet_submitted' AND ${refundEventValueSql(db,'packetId')}=?`;
  const acknowledgment=await db.prepare(retained).bind(row.id,packet.id).first<{id:string}>();
  if(acknowledgment&&input.failureBasis==='not_sent')
   throw new RefundObligationError('The bank acknowledged this instruction. It cannot be released as not sent.');
  if(acknowledgment){
   const finality=`EXISTS(SELECT 1 FROM refund_obligation_events native_event
      JOIN finance_evidence_intents acknowledged ON acknowledged.id=${refundEventValueSql(db,'evidenceReference')}
        AND acknowledged.scope_kind='obligation' AND acknowledged.scope_id=native_event.obligation_id
      JOIN finance_evidence_files original_proof ON original_proof.id=acknowledged.id
      JOIN finance_evidence_intents i ON i.id=? AND i.scope_kind='obligation' AND i.scope_id=native_event.obligation_id
        AND i.content_hash<>acknowledged.content_hash
      JOIN finance_evidence_files f ON f.id=i.id
      JOIN users uploader ON uploader.id=i.uploaded_by AND uploader.status='active'
      JOIN user_roles uploader_role ON uploader_role.user_id=uploader.id AND uploader_role.role='super_admin'
      WHERE native_event.id=? AND native_event.obligation_id=? AND native_event.action='packet_submitted'
        AND ${refundEventValueSql(db,'packetId')}=? AND uploader.id<>?)`;
   const values=[outcomeEvidence,acknowledgment.id,row.id,packet.id,row.customerId];
   if(input.bankFinalityConfirmed!==true||!/^fin-file-[a-f0-9]{64}$/.test(outcomeEvidence)||
      !await db.prepare('SELECT 1 WHERE '+finality).bind(...values).first())
    throw new RefundObligationError('Retain separate private proof that the bank closed the acknowledged instruction and confirm its final outcome.');
   releaseGuards=paymentGuard(db,finality,values);
  }else releaseGuards=paymentGuard(db,`NOT EXISTS(${retained})`,[row.id,packet.id]);
 }
 const native=input.outcome==='uncertain'?[]:await nativeReturnOperation(db,ctx,row,packet.id,input.outcome==='paid'?'complete_refund':'fail_refund',transaction??(packet.amountPaisa===0?'CREDIT-'+row.id:undefined));
 if(row.sourceKind==='service_fee'&&input.outcome==='paid'){
  const source=JSON.parse(row.sourceSnapshotJson) as {legalBasis:string;caseReference:string};
  const fee=await prepareLawfulServiceFeeRefundStatements(db,{orderId:row.orderId!,amountPaisa:row.cashPaisa,actorId:ctx.actorId,legalBasis:source.legalBasis,caseReference:source.caseReference,paymentReference:transaction!,requestId:ctx.requestId+'-fee',now:nativeNow},{packetId:packet.id,obligationId:row.id});
  native.push(...fee.statements,db.prepare("UPDATE lawful_fee_refund_authorizations SET state='paid' WHERE id=? AND state='authorized'").bind(row.sourceId),...paymentGuard(db,'changes()=1'));
 }

 // Actual late outcomes retain their original source/destination, even if a later version is now current.
 const statements=[...await financeEvidenceReferenceGuards(db,outcomeEvidence,{kind:'obligation',id:row.id}),...await refundIndependence(db,ctx.actorId,row.customerId,row.orderId,row.receiptId),...releaseGuards,
  ...(packet.accountVersionId?paymentGuard(db,`EXISTS(SELECT 1 FROM company_payment_account_versions v WHERE v.id=? AND NOT ${responseScopeContains(db,'v.conflicts_json','?')})`,[packet.accountVersionId,ctx.actorId]):[]),
  ...(hash?[db.prepare(`INSERT INTO company_outgoing_bank_identities(identity_hash,packet_kind,packet_id,account_version_id,transaction_identity,amount_paisa,bank_at,recorded_at) VALUES(?,'refund',?,?,?,?,?,${clock})`).bind(hash,packet.id,packet.accountVersionId,transaction,packet.amountPaisa,bankAt)]:[]),
  db.prepare(`UPDATE outgoing_payment_packets SET state=?,revision=revision+1,recorded_by=?,recorded_at=${clock},bank_at=?,transaction_identity=?,transaction_identity_hash=?,evidence_reference=? WHERE id=? AND revision=? AND state=?`).bind(input.outcome,ctx.actorId,bankAt,transaction,hash,input.evidenceReference,packet.id,packet.revision,packet.state),...paymentGuard(db,'changes()=1'),...native,
  ...obligationState(db,ctx,row,input.outcome==='paid'?'completed':input.outcome==='failed'?'open':'uncertain'),
  await refundEvent(db,ctx,row.id,'packet_'+input.outcome,input.outcome==='paid'?'The actual refund transfer is confirmed. Physical return and any seller recovery remain separate.':input.outcome==='uncertain'?'The original bank outcome is still being checked. No replacement payment will be sent while it is uncertain.':'The original attempt has confirmed failure evidence. A new reviewed packet is required before retrying.',{...input,sourceAccountVersionId:packet.accountVersionId,destinationVersionId:packet.destinationVersionId})];
 if(row.sourceKind==='cancellation'&&input.outcome==='paid')statements.push(db.prepare("UPDATE cancellation_refund_sources SET state='paid' WHERE id=? AND state='authorized'").bind(row.sourceId),...paymentGuard(db,'changes()=1'),db.prepare(`UPDATE manual_payment_exceptions SET state='resolved',revision=revision+1,updated_at=${clock},last_event_id=? WHERE source_key=? AND state<>'resolved'`).bind(ctx.requestId,'cancellation-refund:'+row.sourceId));
 if(row.sourceKind==='receipt_return'&&input.outcome==='paid')statements.push(db.prepare("UPDATE manual_receipt_uses SET state='returned',revision=revision+1 WHERE id=? AND target_id=? AND state='reserved' AND amount_minor=?").bind(row.receiptUseId,row.id,row.originalCashPaisa),...paymentGuard(db,'changes()=1'));
 if(input.outcome==='uncertain')statements.push(...await preparePaymentException(db,{sourceKey:'refund:'+row.id,orderId:row.orderId,receiptId:row.receiptId,kind:'outgoing_uncertain',reason:'Urgent reconciliation of the original outgoing refund; amount remains reserved and no resend is permitted.',ownerId:ctx.actorId,now:nativeNow}));
 else statements.push(db.prepare(`UPDATE manual_payment_exceptions SET state='resolved',revision=revision+1,updated_at=${clock},last_event_id=? WHERE source_key=? AND state<>'resolved'`).bind(ctx.requestId,'refund:'+row.id));
 if(input.outcome==='paid'&&row.orderId)statements.push(...orderRefundStatus(db,row.orderId));
 return cmd.commit(statements,{id:packet.id,revision:packet.revision+1,state:input.outcome});
}

/** Void only a provably unsent packet; a processing/uncertain transfer keeps its original reservation. */
export async function voidUnsentRefundPacket(db:D1Database,ctx:CommandContext,input:{packetId:string;notSentConfirmed:boolean;reason:string;evidenceReference:string}){
 const packet=await packetRow(db,input.packetId),row=(await getRefundObligation(db,packet.obligationId))!,cmd=await refundCommand(db,ctx,'packet_voided',row.id,input,true);if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(packet.revision)||!['prepared','approved'].includes(packet.state)||packet.startedAt!==null||input.notSentConfirmed!==true)throw new RefundObligationError('Only a verified unsent packet may release its funding; reconcile an initiated or unknown outcome.');
 refundText(input.reason,'unsent packet disposition',10);const evidence=refundText(input.evidenceReference,'evidence that no instruction was sent');
 if(packet.amountPaisa>0&&Array.from(evidence).length<8)
  throw new RefundObligationError('Record the actual evidence that no instruction was sent.',400);
 return cmd.commit([...await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'obligation',id:row.id}),...await refundIndependence(db,ctx.actorId,row.customerId,row.orderId,row.receiptId),db.prepare("UPDATE outgoing_payment_packets SET state='void',revision=revision+1,recorded_by=?,recorded_at=?,evidence_reference=? WHERE id=? AND revision=? AND state IN('prepared','approved') AND started_at IS NULL").bind(ctx.actorId,ctx.now,input.evidenceReference,packet.id,packet.revision),...paymentGuard(db,'changes()=1'),...obligationState(db,ctx,row,'open'),await refundEvent(db,ctx,row.id,'packet_voided','An unsent instruction was retired. Any replacement needs a fresh exact approval.',input)],{id:packet.id,revision:packet.revision+1});
}

