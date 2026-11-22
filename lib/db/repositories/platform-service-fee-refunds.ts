import {paymentGuard} from '../../payments/manual-receipts';
import { staffMutationGuard } from './staff-mutation-guard';
import { postCancellationGrossSql } from './platform-service-fee';

export class ServiceFeeRefundConflict extends Error {}
type Input = Readonly<{ orderId: string; amountPaisa: number; actorId: string; legalBasis: string;
  caseReference: string; paymentReference: string; requestId: string; now: number }>;
export const SERVICE_FEE_REFUND_ACTION = 'platform_service_fee.refunded';
export function lawfulServiceFeeRefundTotalSql(orderAlias = 'orders') {
  if (!/^[a-z_]+$/.test(orderAlias)) throw new TypeError('Invalid order alias.');
  return `(SELECT COALESCE(SUM(json_extract(a.next_json,'$.request.amountPaisa')),0) FROM audit_logs a
    WHERE a.subject_type='order' AND a.subject_id=${orderAlias}.id AND a.action='${SERVICE_FEE_REFUND_ACTION}')`;
}
const feeRefundTotal = lawfulServiceFeeRefundTotalSql();
const gross = postCancellationGrossSql();
const allRefunds = `(SELECT COALESCE(SUM(amount_paisa),0) FROM refunds WHERE order_id=orders.id AND status<>'rejected')`;

/** Append-only, typed record of a legally required refund ALREADY PAID separately.
 * Existing refund rows are merchandise/credit records protected by wallet guards.
 * Fee exceptions live in the audit journal and never change those allocations.
 */
export async function prepareLawfulServiceFeeRefundStatements(db:D1Database,input:Input,execution?:{packetId:string;obligationId:string}) {
  const authority = await staffMutationGuard(db,input.actorId,'business_settings.manage',ServiceFeeRefundConflict,'super_admin');
  if(!execution)throw new ServiceFeeRefundConflict('Use the original authorized fee obligation and its verified actual execution packet before recording payment.');
  if (!Number.isSafeInteger(input.amountPaisa) || input.amountPaisa<=0 || !Number.isSafeInteger(input.now) || input.now<=0 ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) || !input.orderId || input.orderId.length>120)
    throw new ServiceFeeRefundConflict('Enter a valid saved fee amount and request.');
  const legalBasis=input.legalBasis.trim(),caseReference=input.caseReference.trim(),paymentReference=input.paymentReference.trim();
  if (legalBasis.length<20 || legalBasis.length>2000 || caseReference.length<3 || caseReference.length>120 || paymentReference.length<3 || paymentReference.length>120)
    throw new ServiceFeeRefundConflict('Record the legal basis, case reference and completed refund payment reference.');
  const payload={orderId:input.orderId,amountPaisa:input.amountPaisa,legalBasis,caseReference,paymentReference,actorId:input.actorId};
  const previous=await db.prepare('SELECT id,next_json AS payload FROM audit_logs WHERE action=? AND request_id=? LIMIT 1')
    .bind(SERVICE_FEE_REFUND_ACTION,input.requestId).first<{id:string;payload:string}>();
  if(previous){
    if(JSON.stringify(JSON.parse(previous.payload).request)!==JSON.stringify(payload))throw new ServiceFeeRefundConflict('This request was already used for different refund details.');
    return {id:previous.id,status:'paid' as const,statements:[] as D1PreparedStatement[]};
  }
  const order=await db.prepare(`SELECT buyer_platform_fee_paisa AS fee,return_policy_snapshot_json AS terms FROM orders WHERE id=?`)
    .bind(input.orderId).first<{fee:number;terms:string}>();
  if(!order)throw new ServiceFeeRefundConflict('Reconcile the original collected fee and its recorded execution packet.');
  if(!order.fee || input.amountPaisa>order.fee)throw new ServiceFeeRefundConflict('The refund exceeds the saved Platform service fee.');
  const id=crypto.randomUUID(),guardId=crypto.randomUUID();
  const statements:D1PreparedStatement[]=[
    db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(input.orderId),
    ...authority.statements,
    ...paymentGuard(db,`EXISTS(SELECT 1 FROM outgoing_payment_packets p JOIN refund_obligations r ON r.id=p.obligation_id
      JOIN lawful_fee_refund_authorizations f ON f.id=r.source_id WHERE p.id=? AND p.obligation_id=? AND r.source_kind='service_fee'
      AND r.order_id=? AND f.order_id=r.order_id AND f.state='authorized' AND f.amount_paisa=? AND p.amount_paisa=f.amount_paisa
      AND p.state='paid' AND p.recorded_by=? AND p.bank_at IS NOT NULL AND p.transaction_identity_hash IS NOT NULL AND length(p.evidence_reference)>=8)`,[execution.packetId,execution.obligationId,input.orderId,input.amountPaisa,input.actorId]),
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=?
      AND buyer_platform_fee_paisa=? AND return_policy_snapshot_json=? AND ${feeRefundTotal}+?<=buyer_platform_fee_paisa
      AND ${feeRefundTotal}+${allRefunds}+?<=${gross})
      AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE action=? AND request_id=?) THEN 1 ELSE 0 END`)
      .bind(guardId,input.orderId,order.fee,order.terms,input.amountPaisa,input.amountPaisa,SERVICE_FEE_REFUND_ACTION,input.requestId),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES (?,?,?,'order',?,?,?,?,?)`)
      .bind(id,input.actorId,SERVICE_FEE_REFUND_ACTION,input.orderId,legalBasis,JSON.stringify({executionPacketId:execution.packetId,refundObligationId:execution.obligationId,kind:'lawful_platform_service_fee_refund_v1',status:'paid',liability:'platform',request:payload,savedFeePaisa:order.fee,savedTerms:JSON.parse(order.terms)}),input.requestId,input.now),
    // A fee-only exception must not put merchandise earnings on hold.
    db.prepare(`UPDATE orders SET payment_status='refunded',updated_at=? WHERE id=? AND payment_status='part_refunded'
      AND (SELECT COALESCE(SUM(amount_paisa),0) FROM refunds WHERE order_id=orders.id AND status='paid')+${feeRefundTotal}>=${gross}`)
      .bind(input.now,input.orderId),
  ];
  return {id,status:'paid' as const,statements};
}

/** Legacy callers cannot turn a reference into an actual completed transfer. */
export async function recordLawfulServiceFeeRefund(db:D1Database,input:Input){return prepareLawfulServiceFeeRefundStatements(db,input);}

export async function serviceFeeRefundSummary(db:D1Database,orderId:string){
  return db.prepare(`SELECT buyer_platform_fee_paisa AS chargedPaisa,${feeRefundTotal} AS refundedPaisa,COALESCE((SELECT SUM(f.amount_paisa) FROM lawful_fee_refund_authorizations f WHERE f.order_id=orders.id AND f.state='authorized'),0) AS authorizedPaisa FROM orders WHERE id=?`)
    .bind(orderId).first<{chargedPaisa:number;refundedPaisa:number;authorizedPaisa:number}>();
}
