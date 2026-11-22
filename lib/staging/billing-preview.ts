/** Fictional render-only fixtures. This module never creates an order or writes a database. */
import { companyDetails } from '../content/company-details';
import { APPROVED_BILLING_VERSION, withReceiptGroups, type BillingIssuer } from '../documents/billing';
import type { OrderDocumentSnapshot } from '../db/repositories/orders';
import { COMPANY_STAMP_VERSION, mayApplyCompanyStamp } from '../documents/company-stamp';

export function billingPreviewSnapshot(kind:'company'|'registered'|'mixed'='mixed',now=Date.now()):OrderDocumentSnapshot {
  const company:BillingIssuer={reference:companyDetails.entityReference,kind:'company',legalName:companyDetails.legalName,
    pan:companyDetails.pan,address:companyDetails.registeredOffice,taxMode:'PAN'};
  const other:BillingIssuer={reference:'fixture-shop-b',kind:'registered',legalName:'Bamboo Home Enterprises',
    storeName:'Bamboo Home Nepal',pan:'123456789',address:'Lalitpur, Bagmati, Nepal (sample)',taxMode:'PAN'};
  const address={recipientName:'Sample Customer',phone:'98XX XXX XX2 (sample)',province:'Madhesh Province',district:'Parsa',
    municipality:'Birgunj Metropolitan City',ward:'11',locality:'Sample Delivery Lane (sample)',landmark:'Near sample community centre'};
  const item=(second:boolean)=>({orderItemId:second?'fixture-line-b':'fixture-line-a',productId:second?'fixture-product-b':'fixture-product-a',
    sellerId:second?'fixture-supplier-b':'fixture-supplier-a',productName:second?'Handwoven bamboo basket':'Mithila hand-painted notebook',
    sellerName:kind==='registered'||(kind==='mixed'&&second)?'Bamboo Home Nepal':'Hastabazaar',
    makerName:kind==='registered'||(kind==='mixed'&&second)?null:'Mithila Craft House',
    issuer:kind==='registered'||(kind==='mixed'&&second)?other:company,
    sku:second?'SAMPLE-BK-01':'SAMPLE-NB-01',sellerSku:second?'BHN-BK-M-NT':'MCH-NB-A5-BL',
    variant:second?'Medium / Natural':'A5 / Blue',quantity:second?1:2,
    listPricePaisa:second?120000:65000,unitPricePaisa:second?115000:62500,lineTotalPaisa:second?115000:125000});
  const result=withReceiptGroups({documentTitle:'Order Invoice',taxDocument:false,orderNumber:'SAMPLE-ORDER-001',issuedAt:now,
    currency:'NPR',paymentMethod:'Cash on delivery',paymentStatus:'paid',
    billing:{version:APPROVED_BILLING_VERSION,receiptIssuance:'simulation',company,customer:{name:'Sample Customer',email:'customer@local.hastabazaar.test',phone:address.phone},
      deliveryAddress:address,billingAddress:{...address,locality:'Sample Billing Lane (sample)',landmark:undefined}},
    items:[item(false),item(true)],itemSubtotalPaisa:240000,deliveryChargePaisa:15000,buyerPlatformFeePaisa:1000,
    taxTotalPaisa:0,grandTotalPaisa:256000});
  result.billing!.receiptGroups?.forEach(group=>{group.billSequence=1;group.stampVersion=COMPANY_STAMP_VERSION;
    if(!mayApplyCompanyStamp(group))delete group.stampVersion;});
  return result;
}
