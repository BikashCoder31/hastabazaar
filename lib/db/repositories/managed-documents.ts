import { SIMULATED_RECORD_LABEL } from '@/lib/staging/environment';

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
      VALUES (?,?,?,?,?,?,?,?,'issued',?,?,NULL)`).bind(crypto.randomUUID(),options.orderId,issuerReference,invoiceNumber,JSON.stringify(snapshot),payload,`hastabazaar-simulated-invoice:${encodeURIComponent(payload)}`,SIMULATED_RECORD_LABEL,`${options.requestId}:${index}`,options.now));
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
  return row?{...row,snapshot:JSON.parse(row.snapshotJson) as ManagedInvoiceSnapshot}:null;
}
