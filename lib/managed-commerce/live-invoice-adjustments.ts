import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {paymentGuard} from '../payments/manual-receipts';
import {issueLiveManagedInvoiceAdjustment,ManagedLiveFinancialError} from './live-billing';

export const LIVE_INVOICE_ADJUSTMENT_FORM_ID='system.live-invoice-adjustment';
const reference=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{2,190}$/.test(value);
class ReadAuthorityError extends ManagedLiveFinancialError {constructor(message:string){super(message,403);}}
async function originalInvoice(db:D1Database,actorId:string,invoiceId:string){
 const authority=await staffMutationGuard(db,actorId,'refund.approve.standard',ReadAuthorityError,'super_admin');
 const row=await db.prepare(`SELECT g.id,g.invoice_number AS invoiceNumber,g.order_id AS orderId,g.snapshot_json AS snapshotJson,o.customer_id AS customerId,o.status
   FROM managed_invoice_groups g JOIN orders o ON o.id=g.order_id WHERE g.id=? AND g.record_kind='live'`).bind(invoiceId).first<{id:string;invoiceNumber:string;orderId:string;snapshotJson:string;customerId:string;status:string}>();
 if(!row)throw new ManagedLiveFinancialError('Open the original actual invoice.',404);
 const financialScopeId=(JSON.parse(row.snapshotJson) as {financialScopeId:string}).financialScopeId;
 const independent=`EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id<>?) AND NOT EXISTS(
   SELECT 1 FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id
   JOIN seller_profiles seller ON seller.id=s.seller_id JOIN managed_live_activation_decisions original_owner ON original_owner.id=s.live_activation_decision_id
   WHERE i.order_id=? AND s.live_financial_scope_id=? AND (seller.user_id=? OR original_owner.owner_id=? OR s.live_customer_id=? OR s.live_customer_id IS NULL))`;
 const values=[row.orderId,actorId,row.orderId,financialScopeId,actorId,actorId,actorId];
 if(!await db.prepare('SELECT 1 WHERE '+independent).bind(...values).first())throw new ReadAuthorityError('An operator without a current or retained interest must review this invoice.');
 await db.batch([...authority.statements,...paymentGuard(db,independent,values)]);
 return row;
}
export async function getLiveInvoiceAdjustmentReview(db:D1Database,actorId:string,invoiceId:string){
 const invoice=await originalInvoice(db,actorId,invoiceId);
 const original=JSON.parse(invoice.snapshotJson) as {goodsPaisa:number;deliveryPaisa:number;serviceFeePaisa:number;promotionPaisa:number;items:{orderItemId:string}[]};
 const itemIds=[...new Set(original.items.map(item=>item.orderItemId))];
 const credited=await db.prepare("SELECT COALESCE(SUM(amount_paisa),0) amount FROM managed_invoice_adjustments WHERE invoice_group_id=? AND record_kind='live' AND kind='credit_note'").bind(invoiceId).first<{amount:number}>();
 const remainingPaisa=original.goodsPaisa+original.deliveryPaisa+original.serviceFeePaisa-original.promotionPaisa-Number(credited?.amount??0);
 const refunds=await db.prepare(`SELECT r.id AS sourceId,'refund' AS sourceKind,r.amount_paisa AS amountPaisa FROM refunds r
   JOIN return_requests c ON c.id=r.return_request_id WHERE r.order_id=? AND r.status='paid'
   AND c.order_item_id IN (${itemIds.map(()=>'?').join(',')||'NULL'})
   AND NOT EXISTS(SELECT 1 FROM managed_live_invoice_adjustment_sources a WHERE a.invoice_group_id=? AND a.source_kind='refund' AND a.source_id=r.id)
   ORDER BY r.id LIMIT 50`).bind(invoice.orderId,...itemIds,invoiceId).all<{sourceId:string;sourceKind:'refund'|'cancellation';amountPaisa:number}>();
 const sources=refunds.results.filter(row=>row.amountPaisa>0&&row.amountPaisa<=remainingPaisa);
 if(invoice.status==='cancelled'&&remainingPaisa>0&&!await db.prepare("SELECT 1 FROM managed_live_invoice_adjustment_sources WHERE invoice_group_id=? AND source_kind='cancellation' AND source_id=?").bind(invoiceId,invoice.orderId).first())sources.push({sourceId:invoice.orderId,sourceKind:'cancellation',amountPaisa:remainingPaisa});
 const adjustments=await db.prepare("SELECT id,adjustment_number AS number,amount_paisa AS amountPaisa,issued_at AS issuedAt FROM managed_invoice_adjustments WHERE invoice_group_id=? AND record_kind='live' ORDER BY issued_at DESC,id DESC LIMIT 50").bind(invoiceId).all<{id:string;number:string;amountPaisa:number;issuedAt:number}>();
 return {id:invoiceId,invoiceNumber:invoice.invoiceNumber,remainingPaisa,sources,adjustments:adjustments.results,needsReconciliation:refunds.results.length!==sources.filter(source=>source.sourceKind==='refund').length};
}
export async function runLiveInvoiceAdjustment(db:D1Database,actorId:string,invoiceId:string,body:Record<string,unknown>){
 const input=body.input as Record<string,unknown>|undefined;
 if(body.sourceFormId!==LIVE_INVOICE_ADJUSTMENT_FORM_ID||body.expectedRevision!==null||!reference(body.requestId)||Object.keys(body).sort().join(',')!=='expectedRevision,input,requestId,sourceFormId'||!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).sort().join(',')!=='reason,sourceId,sourceKind'||!['refund','cancellation'].includes(String(input.sourceKind))||!reference(input.sourceId)||typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.length>1000)throw new ManagedLiveFinancialError('Use the exact original invoice correction form.',400);
 await originalInvoice(db,actorId,invoiceId);
 return issueLiveManagedInvoiceAdjustment(db,{actorId,requestId:body.requestId,expectedRevision:null,now:Date.now()},{invoiceGroupId:invoiceId,sourceKind:input.sourceKind as 'refund'|'cancellation',sourceId:input.sourceId,reason:input.reason});
}
export async function recoverLiveInvoiceAdjustment(db:D1Database,actorId:string,invoiceId:string,attempt:string){
 if(!reference(attempt))throw new ManagedLiveFinancialError('Use the original saved action reference.',400);
 await originalInvoice(db,actorId,invoiceId);
 const saved=await db.prepare("SELECT command_result_json AS result FROM audit_logs WHERE actor_id=? AND request_id=? AND action='managed.live.invoice.adjustment' AND subject_type='managed_invoice_group' AND subject_id=? AND command_key IS NOT NULL").bind(actorId,attempt,invoiceId).first<{result:string}>();
 return saved?JSON.parse(saved.result) as {id:string;invoiceGroupId:string}:null;
}
