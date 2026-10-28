import { buildCode39Barcode } from '@/lib/documents/machine-codes';
/* oxlint-disable next/no-img-element -- Print documents use exact logo/private stamp URLs without an optimization proxy. */
import { amountInWords, documentDate, documentTime, documentMoney, formatBillNumber, type ReceiptGroup } from '@/lib/documents/billing';
import type { OrderDocumentSnapshot } from '@/lib/db/repositories/orders';
import type { NepalAddress } from '@/lib/shipping/provider';

const styles=`
.bill-paper{box-sizing:border-box;width:100%;max-width:210mm;margin:0 auto 24px;padding:28px;background:white;color:black;font:12px Arial,Helvetica,sans-serif;line-height:1.45}
.bill-header{display:grid;grid-template-columns:64px minmax(0,1fr) 190px;gap:14px;align-items:start;border-bottom:1px solid #aaa;padding-bottom:14px}
.bill-logo{width:64px;height:64px;object-fit:contain}.bill-company h2{font-size:17px;font-weight:700;margin:0 0 5px}.bill-company p{margin:3px 0;overflow-wrap:anywhere}
.bill-barcode{width:190px;max-width:100%;text-align:center}.bill-barcode svg{width:100%;height:48px}.bill-barcode p{font-size:10px;margin:3px 0 0}
.bill-title{font-size:19px;font-weight:700;margin:18px 0 15px}.bill-references{display:grid;grid-template-columns:1.2fr 1fr;gap:8px 22px;border-bottom:1px solid #aaa;padding-bottom:14px}.bill-references p{margin:0;overflow-wrap:anywhere}
.bill-payment{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:13px 0}.bill-addresses{display:grid;grid-template-columns:1fr 1fr;border:1px solid #aaa;margin:8px 0 16px}.bill-addresses section{padding:12px;min-width:0}.bill-addresses section+section{border-left:1px solid #aaa}.bill-addresses h3{font-size:13px;font-weight:700;margin:0 0 8px}.bill-addresses p{margin:4px 0;overflow-wrap:anywhere}
.bill-sellers{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:15px}.bill-sellers p{margin:3px 0;overflow-wrap:anywhere}
.bill-scroll{overflow-x:auto;max-width:100%}.bill-table{width:100%;min-width:670px;table-layout:fixed;border-collapse:collapse;font-size:10px}.bill-table th,.bill-table td{border:1px solid #aaa;padding:7px 5px;vertical-align:top;overflow-wrap:anywhere}.bill-table th{text-align:left;font-weight:700}.bill-table .bill-number{text-align:right;font-variant-numeric:tabular-nums}.bill-table td p{margin:3px 0}.bill-table strong{font-size:11px}.bill-ref{font-size:9px}
.bill-price-note{font-size:10px;margin:8px 0}.bill-summary{display:grid;grid-template-columns:1fr 270px;gap:22px;margin-top:18px;break-inside:avoid}.bill-summary p{margin:4px 0}.bill-summary dl{margin:0}.bill-summary dl div{display:flex;justify-content:space-between;gap:18px;margin:6px 0}.bill-summary dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}.bill-total{border-top:1px solid #aaa;padding-top:9px;font-weight:700;font-size:14px}.bill-authorization{margin:24px 0 0 auto;width:200px;min-height:115px;text-align:right;break-inside:avoid}.bill-stamp{display:block;width:136px;height:auto;margin:0 auto 8px}.bill-authorization p{border-top:1px solid #aaa;padding-top:6px;font-size:11px}.bill-channel{display:flex;align-items:center;gap:12px;margin-top:25px;font-size:11px}.bill-channel img{width:45px;height:45px;object-fit:contain}
.bill-summary dt{min-width:0;overflow-wrap:anywhere}
@media(max-width:640px){.bill-paper{padding:16px;font-size:11px}.bill-header{grid-template-columns:44px minmax(0,1fr);gap:10px}.bill-logo{width:44px;height:44px}.bill-company h2{font-size:15px}.bill-barcode{grid-column:1/-1;justify-self:end;width:180px}.bill-references{grid-template-columns:1fr;gap:7px}.bill-summary{grid-template-columns:1fr;gap:12px}.bill-addresses section{padding:9px}.bill-title{font-size:18px}.bill-summary dl{max-width:300px;width:100%;margin-left:auto}}
@container(max-width:640px){.bill-paper{padding:16px;font-size:11px}.bill-header{grid-template-columns:44px minmax(0,1fr);gap:10px}.bill-logo{width:44px;height:44px}.bill-company h2{font-size:15px}.bill-barcode{grid-column:1/-1;justify-self:end;width:180px}.bill-references{grid-template-columns:1fr;gap:7px}.bill-summary{grid-template-columns:1fr;gap:12px}.bill-addresses section{padding:9px}.bill-title{font-size:18px}.bill-summary dl{max-width:300px;width:100%;margin-left:auto}}
@media print{@page{size:A4;margin:10mm}.bill-paper{max-width:none;padding:0;margin:0;background:white;break-after:page;font-size:9pt}.bill-paper:last-child{break-after:auto}.bill-scroll{overflow:visible}.bill-table{min-width:0;font-size:7.3pt}.bill-table strong{font-size:8pt}.bill-table th,.bill-table td{padding:5pt 3pt}.bill-table thead{display:table-header-group}.bill-table tr{break-inside:avoid}.bill-header{grid-template-columns:48pt minmax(0,1fr) 140pt}.bill-logo{width:48pt;height:48pt}.bill-barcode{width:140pt}.bill-company h2{font-size:12.5pt}.bill-title{font-size:12pt}.bill-summary{grid-template-columns:1fr 200pt}.bill-stamp{width:102pt}.bill-authorization{width:145pt}.bill-channel{font-size:8pt}.bill-screen-only{display:none!important}}
`;

function Address({address}:{address?:NepalAddress}) {
  return address?<><p>{address.locality}{address.ward?`, Ward ${address.ward}`:''}</p><p>{address.municipality}, {address.district}</p><p>{address.province}, Nepal</p></>:null;
}
export function ApprovedBillingDocument({snapshot,kind,documentNumber,group,stampSource,notice}:{
  snapshot:OrderDocumentSnapshot;kind:'order_statement'|'payment_receipt';documentNumber:string;group?:ReceiptGroup;stampSource?:string;notice?:string;
}) {
  const billing=snapshot.billing;if(!billing)return null;
  const receipt=kind==='payment_receipt';
  const issuer=receipt&&group?group.issuer:billing.company;
  const items=receipt&&group?group.items:snapshot.items;
  const company=issuer.kind==='company';
  const barcode=!receipt?buildCode39Barcode(snapshot.orderNumber):null;
  const gross=items.reduce((sum,item)=>sum+(item.listPricePaisa??item.unitPricePaisa)*item.quantity,0);
  const goods=items.reduce((sum,item)=>sum+item.lineTotalPaisa,0);
  const priceReduction=gross-goods;
  const total=receipt&&group?group.totalPaisa:snapshot.grandTotalPaisa;
  const promotions=receipt&&group?group.promotionPaisa:(snapshot.promoDiscountPaisa??0)+(snapshot.referralDiscountPaisa??0);
  const wallet=receipt&&group?group.walletPaisa:snapshot.walletCreditPaisa??0;
  const delivery=receipt&&group?group.deliveryPaisa:snapshot.deliveryChargePaisa;
  const fee=receipt&&group?group.serviceFeePaisa:snapshot.buyerPlatformFeePaisa;
  const customerFee=receipt&&group?group.customerServiceFee:snapshot.customerServiceFee;
  const number=receipt?(group?.billNumber??(group?.billSequence?formatBillNumber(group.billSequence):'Pending review')):snapshot.orderNumber;
  const sellers=[...new Map(items.filter(item=>item.issuer?.kind==='registered').map(item=>[item.issuer!.reference,item.issuer!])).values()];
  return <article className="bill-paper" data-approved-billing={billing.version} data-document-reference={documentNumber}>
    <style>{styles}</style>
    <header className="bill-header">
      {company?<img data-media-mode="contain" className="bill-logo object-contain" src="/brand/hastabazaar-logo-lockup-640.png" alt="Hastabazaar" width={64} height={64}/>:<span/>}
      <div className="bill-company"><h2>{issuer.legalName}</h2><p>{issuer.address}</p><p>PAN: {issuer.pan}</p>
        {company?<p>billing@hastabazaar.com | www.hastabazaar.com</p>:issuer.storeName?<p>Store: {issuer.storeName}</p>:null}</div>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An inline vector barcode needs its accessible image role. */}
      {barcode?<div className="bill-barcode" data-order-barcode><svg viewBox={`0 0 ${barcode.width} 62`} aria-label={`Barcode ${snapshot.orderNumber}`} role="img" shapeRendering="crispEdges">
        <rect width={barcode.width} height={62} fill="white"/>{barcode.bars.map(bar=><rect key={bar.x} x={bar.x} y={2} width={bar.width} height={58} fill="black"/>)}</svg><p>{snapshot.orderNumber}</p></div>:<span/>}
    </header>
    <h1 className="bill-title">{receipt?'RECEIPT':'ORDER INVOICE'}</h1>
    {notice?<output className="block"><strong>{notice}</strong></output>:null}
    {group?.scope==='order_charges'?<p>Delivery and platform service charges for this order.</p>:null}
    <div className="bill-references"><p>{receipt?'Bill no.:':'Order confirmation no.:'} {number}</p><p>Date: {documentDate(snapshot.issuedAt)}</p>
      {receipt?<><p>Order no.: {snapshot.orderNumber}</p><span/><p>Related Order Invoice: {snapshot.orderNumber}</p></>:<p>Order placed (NPT): {documentDate(snapshot.issuedAt)}, {documentTime(snapshot.issuedAt)}</p>}</div>
    <div className="bill-payment"><p>Payment mode: {snapshot.paymentMethod}</p><p>Status: {snapshot.paymentStatus==='paid'?'Paid':'Unpaid'}</p>{!receipt&&snapshot.paymentStatus!=='paid'?<p>Due: On delivery</p>:null}</div>
    <div className="bill-addresses"><section><h3>BILL TO</h3><p><strong>{billing.customer.name||billing.customer.email}</strong></p><Address address={billing.billingAddress}/><p>Customer phone: {billing.customer.phone}</p></section>
      <section><h3>DELIVER TO</h3><p><strong>{billing.deliveryAddress.recipientName}</strong></p><Address address={billing.deliveryAddress}/>{billing.deliveryAddress.landmark?<p>Landmark: {billing.deliveryAddress.landmark}</p>:null}<p>Customer phone (delivery): {billing.deliveryAddress.phone}</p></section></div>
    {!receipt&&sellers.length?<div className="bill-sellers">{sellers.map(seller=><section key={seller.reference}><strong>Legal seller: {seller.legalName}</strong><p>Business PAN: {seller.pan}</p><p>{seller.address}</p></section>)}</div>:null}
    <div className="bill-scroll"><table className="bill-table"><colgroup>{(receipt?['5%','53%','7%','7%','14%','14%']:['5%','27%','11%','11%','10%','5%','10%','10%','11%']).map((width,index)=><col key={index} style={{width}}/>)}</colgroup>
      <thead><tr>{(receipt?['S.N.','Description / supplier','Qty','Unit','Rate (NPR)','Amount (NPR)']:['S.N.','Product / shop','Platform SKU','Seller SKU','Variant size / colour','Qty','List price (NPR)','Unit price* (NPR)','Amount (NPR)']).map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{items.map((item,index)=><tr key={item.orderItemId??`${item.sku}-${index}`}><td>{index+1}</td><td><strong>{item.productName}</strong><p>{item.makerName?'Supplied by '+item.makerName:'Sold by '+item.sellerName}</p>
        <p className="bill-ref">{item.makerName?'Supplier ref:':'Seller ref:'} {item.sellerId||'—'}</p>
        {receipt?<><p className="bill-ref">Platform SKU: {item.sku}</p><p className="bill-ref">Seller SKU: {item.sellerSku||'—'}</p></>:null}</td>
        {receipt?<><td>{item.quantity}</td><td>pc</td><td className="bill-number">{documentMoney(item.listPricePaisa??item.unitPricePaisa)}</td></>:<><td>{item.sku}</td><td>{item.sellerSku||'—'}</td><td>{item.variant||'—'}</td><td>{item.quantity} pc</td><td className="bill-number">{documentMoney(item.listPricePaisa??item.unitPricePaisa)}</td><td className="bill-number">{documentMoney(item.unitPricePaisa)}</td></>}
        <td className="bill-number">{documentMoney(receipt?(item.listPricePaisa??item.unitPricePaisa)*item.quantity:item.lineTotalPaisa)}</td></tr>)}</tbody></table></div>
    {!receipt?<p className="bill-price-note">*Unit price is after item discounts. Amount = quantity x unit price.</p>:null}
    <div className="bill-summary"><div><strong>In words:</strong><p>{amountInWords(total)}</p></div><dl>
      <div><dt>{receipt?'Subtotal':'Items at list prices'}</dt><dd>{documentMoney(gross)}</dd></div>
      {priceReduction>0?<div><dt>Item discounts</dt><dd>−{documentMoney(priceReduction)}</dd></div>:null}
      {promotions>0?<div><dt>Promo / referral savings</dt><dd>−{documentMoney(promotions)}</dd></div>:null}
      {wallet>0?<div><dt>Shopping credit</dt><dd>−{documentMoney(wallet)}</dd></div>:null}
      {!receipt||delivery>0?<div><dt>Delivery / shipping</dt><dd>{documentMoney(delivery)}</dd></div>:null}
      {customerFee?.source==='customer_v2'?<>
        <div><dt>Standard customer service fee at placement</dt><dd>{documentMoney(customerFee.standardPaisa)}</dd></div>
        {customerFee.waivedPaisa>0?<div><dt>Full customer fee waiver · {customerFee.campaign?.name}</dt><dd>−{documentMoney(customerFee.waivedPaisa)}</dd></div>:null}
        {customerFee.netPaisa!==fee?<div><dt>Original net customer service fee</dt><dd>{documentMoney(customerFee.netPaisa)}</dd></div>:null}
        <div><dt>{customerFee.netPaisa===fee?'Net customer service fee':'Customer service fee after cancellations'}</dt><dd>{documentMoney(fee)}</dd></div>
      </>:!receipt||fee>0?<div><dt>Recorded customer service fee</dt><dd>{documentMoney(fee)}</dd></div>:null}
      <div className="bill-total"><dt>{receipt?'TOTAL (NPR)':'ORDER TOTAL (NPR)'}</dt><dd>{documentMoney(total)}</dd></div></dl></div>
    {receipt&&!company?<div className="bill-channel"><img data-media-mode="contain" className="object-contain" src="/brand/hastabazaar-logo-lockup-640.png" alt="Hastabazaar" width={45} height={45}/><p><strong>Ordered through Hastabazaar</strong><br/>billing@hastabazaar.com | www.hastabazaar.com</p></div>:null}
    {receipt?<div className="bill-authorization">{company&&stampSource?<img data-media-mode="contain" data-company-stamp className="bill-stamp object-contain" src={stampSource} alt="Hasta Bazaar Private Limited company stamp" width={136} height={118}/>:null}<p>Authorized signature / stamp</p></div>:null}
  </article>;
}
