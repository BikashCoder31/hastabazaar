import { SIMULATED_RECORD_LABEL } from '@/lib/staging/environment';
import { buildFormAnswerInsert } from './form-answers';
import { staffMutationGuard } from './staff-mutation-guard';
import { digestFormRequest } from '../../forms/submission';
import type { FormAnswerSnapshot } from '../../forms/types';

export async function issueManagedInvoiceGroups(
  database:D1Database,
  options:{orderId:string;requestId:string;now:number},
):Promise<number>{
  const order=await database.prepare(`SELECT order_number AS orderNumber,customer_email AS customerEmail,
    payment_status AS paymentStatus,currency,delivered_at AS deliveredAt FROM orders
    WHERE id=? AND status='delivered' AND payment_status='paid'`).bind(options.orderId).first<{orderNumber:string;customerEmail:string;paymentStatus:string;currency:string;deliveredAt:number}>();
  if(!order)return 0;
  const rows=await database.prepare(`SELECT s.invoice_issuer_reference AS issuerReference,
    s.legal_seller_reference AS legalSellerReference,s.agreement_version AS agreementVersion,
    i.id AS orderItemId,i.product_name_snapshot AS productName,i.sku_snapshot AS sku,
    i.quantity,i.unit_price_paisa AS unitPricePaisa,i.line_total_paisa AS lineTotalPaisa
    FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id
    WHERE i.order_id=? ORDER BY s.invoice_issuer_reference,i.id`).bind(options.orderId).all<{issuerReference:string;legalSellerReference:string;agreementVersion:string;orderItemId:string;productName:string;sku:string;quantity:number;unitPricePaisa:number;lineTotalPaisa:number}>();
  const groups=new Map<string,typeof rows.results>();
  for(const row of rows.results)groups.set(row.issuerReference,[...(groups.get(row.issuerReference)??[]),row]);
  if(!groups.size)return 0;
  const statements:D1PreparedStatement[]=[];let index=0;
  for(const [issuerReference,items] of groups){index+=1;const invoiceNumber=`SIM-INV-${order.orderNumber}-${index}`;const payload=`${invoiceNumber}|${order.orderNumber}|${issuerReference}`;const snapshot={simulationLabel:SIMULATED_RECORD_LABEL,taxDocument:false,reviewStatus:'SIMULATED_NOT_LEGAL_OR_TAX_APPROVED',orderNumber:order.orderNumber,issuerReference,legalSellerReference:items[0]!.legalSellerReference,agreementVersion:items[0]!.agreementVersion,currency:order.currency,customerEmail:order.customerEmail,issuedAt:options.now,items:items.map(({orderItemId,productName,sku,quantity,unitPricePaisa,lineTotalPaisa})=>({orderItemId,productName,sku,quantity,unitPricePaisa,lineTotalPaisa})),productTotalPaisa:items.reduce((sum,item)=>sum+Number(item.lineTotalPaisa),0)};
    statements.push(database.prepare(`INSERT OR IGNORE INTO managed_invoice_groups(id,order_id,issuer_reference,invoice_number,snapshot_json,barcode_payload,qr_payload,simulation_label,status,request_id,issued_at,voided_at)
      VALUES (?,?,?,?,?,?,?,?,'issued',?,?,NULL)`).bind(crypto.randomUUID(),options.orderId,issuerReference,invoiceNumber,JSON.stringify(snapshot),invoiceNumber,`hastabazaar-simulated-invoice:${encodeURIComponent(payload)}`,SIMULATED_RECORD_LABEL,`${options.requestId}:${index}`,options.now));
  }
  const results=await database.batch(statements);return results.reduce((sum,result)=>sum+Number(result.meta.changes??0),0);
}

export interface ManagedInvoiceSnapshot {
  simulationLabel:string;taxDocument:false;reviewStatus:string;orderNumber:string;
  issuerReference:string;legalSellerReference:string;agreementVersion:string;currency:string;
  customerEmail:string;issuedAt:number;productTotalPaisa:number;
  items:readonly {orderItemId:string;productName:string;sku:string;quantity:number;unitPricePaisa:number;lineTotalPaisa:number}[];
}
export async function getManagedInvoiceGroup(database:D1Database,options:{orderNumber:string;invoiceId:string;receiptTokenHash:string|null;customerId:string|null}){
  const row=await database.prepare(`SELECT g.id,g.invoice_number AS invoiceNumber,g.status,g.snapshot_json AS snapshotJson,
    g.barcode_payload AS barcodePayload,g.qr_payload AS qrPayload,g.simulation_label AS simulationLabel,g.issued_at AS issuedAt
    FROM managed_invoice_groups g JOIN orders o ON o.id=g.order_id
    WHERE o.order_number=? AND g.id=? AND ((? IS NOT NULL AND o.receipt_token_hash=?) OR (? IS NOT NULL AND o.customer_id=?)) LIMIT 1`).bind(
      options.orderNumber,options.invoiceId,options.receiptTokenHash,options.receiptTokenHash,options.customerId,options.customerId,
    ).first<{id:string;invoiceNumber:string;status:string;snapshotJson:string;barcodePayload:string;qrPayload:string;simulationLabel:string;issuedAt:number}>();
  if(!row)return null;
  return {...row,snapshot:JSON.parse(row.snapshotJson) as ManagedInvoiceSnapshot,adjustments:await listManagedInvoiceAdjustments(database,row.id)};
}

export type ManagedInvoiceAdjustmentKind='credit_note'|'debit_note';
export interface ManagedInvoiceAdjustmentSnapshot {
  simulationLabel:string;taxDocument:false;reviewStatus:'SIMULATED_NOT_LEGAL_OR_TAX_APPROVED';
  originalInvoiceNumber:string;orderNumber:string;issuerReference:string;currency:string;
  kind:ManagedInvoiceAdjustmentKind;amountPaisa:number;reasonCode:string;note:string;issuedAt:number;
}

export interface ManagedInvoiceAdjustment {
  id:string;invoiceGroupId:string;adjustmentNumber:string;kind:ManagedInvoiceAdjustmentKind;
  amountPaisa:number;reasonCode:string;note:string;snapshot:ManagedInvoiceAdjustmentSnapshot;
  simulationLabel:string;createdBy:string;issuedAt:number;
}


export class ManagedInvoiceAdjustmentError extends Error {}

function adjustmentText(label:string,value:string,minimum:number,maximum:number):string{
  const result=value.trim();
  const unsafe=Array.from(result).some(character=>{const code=character.charCodeAt(0);return character==='<'||character==='>'||code<=31||code===127;});
  if(result.length<minimum||result.length>maximum||unsafe)throw new ManagedInvoiceAdjustmentError(`${label} is invalid.`);
  return result;
}

export async function issueManagedInvoiceAdjustment(database:D1Database,options:{
  invoiceGroupId:string;kind:ManagedInvoiceAdjustmentKind;amountPaisa:number;reasonCode:string;
  note:string;actorId:string;requestId:string;now:number;approvedReasonCodes:readonly string[];
  form?:{requestId:string;versionId:string;answers:FormAnswerSnapshot};
}):Promise<{id:string;adjustmentNumber:string;created:boolean}>{
  if(options.kind!=='credit_note'&&options.kind!=='debit_note')throw new ManagedInvoiceAdjustmentError('Adjustment kind is invalid.');
  if(!Number.isSafeInteger(options.amountPaisa)||options.amountPaisa<=0||options.amountPaisa>1_000_000_000_000)throw new ManagedInvoiceAdjustmentError('Adjustment amount is invalid.');
  if(!Number.isSafeInteger(options.now)||options.now<0)throw new ManagedInvoiceAdjustmentError('Adjustment time is invalid.');
  const reasonCode=adjustmentText('Adjustment reason',options.reasonCode,1,80);
  if(!options.approvedReasonCodes.includes(reasonCode))throw new ManagedInvoiceAdjustmentError('Adjustment reason is not approved.');
  const note=adjustmentText('Adjustment note',options.note,12,500);
  const requestId=adjustmentText('Request id',options.requestId,8,191);
  if(options.form?.requestId!==undefined && options.form.requestId!==requestId)throw new ManagedInvoiceAdjustmentError('Form request does not match the adjustment.');
  const permission=options.form?await staffMutationGuard(database,options.actorId,'tax_policy.manage',ManagedInvoiceAdjustmentError):null;
  const formDigest=options.form?await digestFormRequest({invoiceGroupId:options.invoiceGroupId,kind:options.kind,
    amountPaisa:options.amountPaisa,reasonCode,note,actorId:options.actorId,versionId:options.form.versionId,
    answers:options.form.answers}):null;
  const duplicate=await database.prepare(`SELECT id,adjustment_number AS adjustmentNumber,invoice_group_id AS invoiceGroupId,
    kind,amount_paisa AS amountPaisa,reason_code AS reasonCode,note,created_by AS actorId
    FROM managed_invoice_adjustments WHERE request_id=? LIMIT 1`).bind(requestId).first<{id:string;adjustmentNumber:string;invoiceGroupId:string;kind:string;amountPaisa:number;reasonCode:string;note:string;actorId:string}>();
  if(duplicate){
    const audit=await database.prepare("SELECT next_json AS nextJson FROM audit_logs WHERE request_id=? AND action='invoice.adjustment.issued' AND subject_type='managed_invoice_adjustment' AND subject_id=? AND actor_id=?")
      .bind(`${requestId}:audit`,duplicate.id,options.actorId).first<{nextJson:string}>();
    let recordedDigest:unknown=null;try{recordedDigest=JSON.parse(audit?.nextJson??'null')?.formDigest;}catch{}
    if(duplicate.invoiceGroupId!==options.invoiceGroupId||duplicate.kind!==options.kind||duplicate.amountPaisa!==options.amountPaisa||
      duplicate.reasonCode!==reasonCode||duplicate.note!==note||duplicate.actorId!==options.actorId||
      (options.form?recordedDigest!==formDigest:recordedDigest!==undefined&&recordedDigest!==null))
      throw new ManagedInvoiceAdjustmentError('Request reference was already used for another adjustment.');
    return {id:duplicate.id,adjustmentNumber:duplicate.adjustmentNumber,created:false};
  }
  const invoice=await database.prepare(`SELECT g.id,g.invoice_number AS invoiceNumber,g.issuer_reference AS issuerReference,
    g.snapshot_json AS snapshotJson,g.simulation_label AS simulationLabel,o.order_number AS orderNumber,o.currency
    FROM managed_invoice_groups g JOIN orders o ON o.id=g.order_id
    WHERE g.id=? AND g.status='issued' LIMIT 1`).bind(options.invoiceGroupId).first<{id:string;invoiceNumber:string;issuerReference:string;snapshotJson:string;simulationLabel:string;orderNumber:string;currency:string}>();
  if(!invoice||invoice.simulationLabel!==SIMULATED_RECORD_LABEL)throw new ManagedInvoiceAdjustmentError('An issued simulated invoice is required.');
  const original=JSON.parse(invoice.snapshotJson) as ManagedInvoiceSnapshot;
  const count=await database.prepare('SELECT COUNT(*) AS count FROM managed_invoice_adjustments WHERE invoice_group_id=?').bind(invoice.id).first<{count:number}>();
  const sequence=Number(count?.count??0)+1;
  const prefix=options.kind==='credit_note'?'SIM-CR':'SIM-DR';
  const adjustmentNumber=`${prefix}-${invoice.invoiceNumber}-${sequence}`;
  const id=crypto.randomUUID();
  const snapshot:ManagedInvoiceAdjustmentSnapshot={
    simulationLabel:SIMULATED_RECORD_LABEL,taxDocument:false,reviewStatus:'SIMULATED_NOT_LEGAL_OR_TAX_APPROVED',
    originalInvoiceNumber:invoice.invoiceNumber,orderNumber:invoice.orderNumber,issuerReference:invoice.issuerReference,
    currency:invoice.currency,kind:options.kind,amountPaisa:options.amountPaisa,reasonCode,note,issuedAt:options.now,
  };
  const invoiceGuardId=crypto.randomUUID();
  await database.batch([
    ...(permission?.statements??[]),
    ...(options.form?[database.prepare("INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM managed_invoice_groups WHERE id=? AND status='issued' AND simulation_label=?) THEN 1 ELSE 0 END").bind(invoiceGuardId,invoice.id,SIMULATED_RECORD_LABEL),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(invoiceGuardId)]:[]),
    database.prepare(`INSERT INTO managed_invoice_adjustments(id,invoice_group_id,adjustment_number,kind,amount_paisa,reason_code,note,snapshot_json,simulation_label,request_id,created_by,issued_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,invoice.id,adjustmentNumber,options.kind,options.amountPaisa,reasonCode,note,JSON.stringify(snapshot),SIMULATED_RECORD_LABEL,requestId,options.actorId,options.now),
    database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
      VALUES (?,?,'invoice.adjustment.issued','managed_invoice_adjustment',?,?,NULL,?,?,NULL,?)`).bind(crypto.randomUUID(),options.actorId,id,note,JSON.stringify({invoiceGroupId:invoice.id,kind:options.kind,amountPaisa:options.amountPaisa,reasonCode,originalProductTotalPaisa:original.productTotalPaisa,...(formDigest?{formDigest}:{})}),`${requestId}:audit`,options.now),
    ...(options.form?[buildFormAnswerInsert(database,{formId:'staff.invoice-adjustment',requestId,versionId:options.form.versionId,
      subjectType:'managed_invoice_adjustment',subjectId:id,actorId:options.actorId,answers:options.form.answers,now:options.now})]:[]),
  ]);
  return {id,adjustmentNumber,created:true};
}

export async function listManagedInvoiceAdjustments(database:D1Database,invoiceGroupId:string):Promise<ManagedInvoiceAdjustment[]>{
  const rows=await database.prepare(`SELECT id,invoice_group_id AS invoiceGroupId,adjustment_number AS adjustmentNumber,kind,
    amount_paisa AS amountPaisa,reason_code AS reasonCode,note,snapshot_json AS snapshotJson,
    simulation_label AS simulationLabel,created_by AS createdBy,issued_at AS issuedAt
    FROM managed_invoice_adjustments WHERE invoice_group_id=? ORDER BY issued_at DESC,id DESC`).bind(invoiceGroupId).all<Omit<ManagedInvoiceAdjustment,'snapshot'>&{snapshotJson:string}>();
  return rows.results.map(({snapshotJson,...row})=>({...row,snapshot:JSON.parse(snapshotJson) as ManagedInvoiceAdjustmentSnapshot}));
}

export async function listManagedInvoiceGroupsForOrder(database:D1Database,orderId:string){
  const rows=await database.prepare(`SELECT g.id,g.invoice_number AS invoiceNumber,g.issuer_reference AS issuerReference,
    g.status,g.simulation_label AS simulationLabel,g.issued_at AS issuedAt,
    (SELECT COUNT(*) FROM managed_invoice_adjustments a WHERE a.invoice_group_id=g.id) AS adjustmentCount
    FROM managed_invoice_groups g WHERE g.order_id=? ORDER BY g.issued_at,g.id`).bind(orderId).all<{id:string;invoiceNumber:string;issuerReference:string;status:string;simulationLabel:string;issuedAt:number;adjustmentCount:number}>();
  return rows.results;
}
