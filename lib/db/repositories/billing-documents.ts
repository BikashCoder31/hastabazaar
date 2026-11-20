import { APPROVED_BILLING_VERSION } from '../../documents/billing';
import { digestFormRequest } from '../../forms/submission';
import type { OrderDocumentSnapshot } from './orders';

/** Payment receipts refer to the already issued actual invoice; they do not issue another bill. */
export async function withLiveInvoiceReferences(database:D1Database,orderId:string,snapshot:OrderDocumentSnapshot):Promise<OrderDocumentSnapshot>{
  if(!snapshot.billing?.receiptGroups?.length)return snapshot;
  const rows=(await database.prepare("SELECT id,issuer_reference issuerReference,invoice_number invoiceNumber FROM managed_invoice_groups WHERE order_id=? AND record_kind='live'").bind(orderId).all<{id:string;issuerReference:string;invoiceNumber:string}>()).results;
  if(!rows.length)return snapshot;
  return {...snapshot,billing:{...snapshot.billing,receiptGroups:snapshot.billing.receiptGroups.map(group=>{
    const original=rows.find(row=>row.issuerReference===group.issuer.reference);
    return original?{...group,billNumber:original.invoiceNumber,canonicalInvoiceId:original.id}:group;
  })}};
}

/** Execute immediately after the parent receipt insert, in the SAME guarded batch.
 * Each atomic INSERT SELECT reserves the next issuer number; a failed batch rolls
 * back both receipt and reservation. Existing issued documents are never renumbered.
 */
export async function receiptNumberStatements(database:D1Database,options:{
  snapshot:OrderDocumentSnapshot;requestId:string;now:number;
}):Promise<D1PreparedStatement[]> {
  if(options.snapshot.billing?.version!==APPROVED_BILLING_VERSION||options.snapshot.billing.receiptIssuance!=='simulation')return [];
  const statements:D1PreparedStatement[]=[];
  for(const [index,group] of (options.snapshot.billing.receiptGroups??[]).entries()) {
    if(group.canonicalInvoiceId)continue;
    if(!group.key||group.key.length>191)throw new Error('Receipt issuer reference is invalid.');
    const requestId='receipt-number:'+await digestFormRequest({requestId:options.requestId,issuer:group.key});
    const path=`$.billing.receiptGroups[${index}]`;
    const guard=`d.request_id=? AND d.status='issued'
      AND json_extract(d.snapshot_json,'$.billing.version')=?
      AND json_extract(d.snapshot_json,'${path}.key')=?
      AND json_extract(d.snapshot_json,'${path}.billSequence') IS NULL`;
    const bindings=[options.requestId,APPROVED_BILLING_VERSION,group.key];
    statements.push(database.prepare(`/* billing-issuer-lock */ SELECT ? AS issuer`).bind(group.key));
    statements.push(database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,
      previous_json,next_json,request_id,ip_hash,created_at)
      SELECT ?,NULL,'billing.receipt.numbered','billing_issuer',?,'Receipt number reserved with the new receipt',NULL,
        json_object('sequence',(SELECT COALESCE(MAX(CAST(json_extract(numbered.next_json,'$.sequence') AS INTEGER)),0)+1
          FROM audit_logs numbered WHERE numbered.action='billing.receipt.numbered'
            AND numbered.subject_type='billing_issuer' AND numbered.subject_id=?)),?,NULL,?
      WHERE EXISTS(SELECT 1 FROM order_documents d WHERE ${guard})`)
      .bind(crypto.randomUUID(),group.key,group.key,requestId,options.now,...bindings));
    statements.push(database.prepare(`UPDATE order_documents AS d SET snapshot_json=json_set(d.snapshot_json,
      '${path}.billSequence',(SELECT CAST(json_extract(numbered.next_json,'$.sequence') AS INTEGER)
        FROM audit_logs numbered WHERE numbered.request_id=? AND numbered.action='billing.receipt.numbered'))
      WHERE ${guard} AND EXISTS(SELECT 1 FROM audit_logs numbered WHERE numbered.request_id=?)`)
      .bind(requestId,...bindings,requestId));
  }
  return statements;
}
