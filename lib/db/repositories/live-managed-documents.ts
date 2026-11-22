import type {ReceiptGroup,BillingContext} from '../../documents/billing';
import type {OrderDocumentSnapshot} from './orders';
type LiveInvoiceSnapshot=ReceiptGroup&{recordKind:'live';taxDocument:false;orderNumber:string;currency:'NPR';issuedAt:number;customer:BillingContext['customer'];deliveryAddress:BillingContext['deliveryAddress']};
/** Read the original commercial artifact through the same customer/receipt capability as the order. */
export async function getLiveManagedInvoiceDocument(db:D1Database,input:{orderNumber:string;invoiceId:string;receiptTokenHash:string|null;customerId:string|null}){
 const row=await db.prepare(`SELECT g.id,g.invoice_number invoiceNumber,g.status,g.issued_at issuedAt,g.qr_payload qrPayload,g.snapshot_json snapshotJson,d.snapshot_json orderSnapshotJson
  FROM managed_invoice_groups g JOIN orders o ON o.id=g.order_id JOIN order_documents d ON d.order_id=o.id AND d.kind='order_statement'
  WHERE g.record_kind='live' AND g.simulation_label IS NULL AND o.order_number=? AND g.id=?
   AND ((? IS NOT NULL AND o.receipt_token_hash=?) OR (? IS NOT NULL AND o.customer_id=?)) LIMIT 1`)
  .bind(input.orderNumber,input.invoiceId,input.receiptTokenHash,input.receiptTokenHash,input.customerId,input.customerId)
  .first<{id:string;invoiceNumber:string;status:string;issuedAt:number;qrPayload:string;snapshotJson:string;orderSnapshotJson:string}>();
 if(!row)return null;
 const {snapshotJson,orderSnapshotJson,...document}=row,original=JSON.parse(snapshotJson) as LiveInvoiceSnapshot,order=JSON.parse(orderSnapshotJson) as OrderDocumentSnapshot;
 if(original.recordKind!=='live'||original.taxDocument!==false||!order.billing||original.orderNumber!==input.orderNumber)throw new Error('The original commercial document needs source review.');
 const group:ReceiptGroup={...original,billNumber:row.invoiceNumber,canonicalInvoiceId:row.id};
 const snapshot:OrderDocumentSnapshot={...order,documentTitle:'Company commercial invoice',issuedAt:row.issuedAt,items:group.items,itemSubtotalPaisa:group.goodsPaisa,deliveryChargePaisa:group.deliveryPaisa,buyerPlatformFeePaisa:group.serviceFeePaisa,walletCreditPaisa:group.walletPaisa,promoDiscountPaisa:group.promotionPaisa,referralDiscountPaisa:0,grandTotalPaisa:group.totalPaisa,billing:{...order.billing,company:group.issuer,customer:original.customer,deliveryAddress:original.deliveryAddress,receiptGroups:[group]}};
 // Internal correction reasons and payment/bank source identifiers are not customer document fields.
 const adjustments=(await db.prepare(`SELECT id,adjustment_number adjustmentNumber,kind,amount_paisa amountPaisa,issued_at issuedAt FROM managed_invoice_adjustments WHERE invoice_group_id=? AND record_kind='live' ORDER BY issued_at,id`).bind(row.id).all<{id:string;adjustmentNumber:string;kind:'credit_note'|'debit_note';amountPaisa:number;issuedAt:number}>()).results;
 return {...document,snapshot,group,adjustments};
}
export type LiveManagedInvoiceDocument=NonNullable<Awaited<ReturnType<typeof getLiveManagedInvoiceDocument>>>;
