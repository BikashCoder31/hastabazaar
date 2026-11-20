import type { NepalAddress } from '../shipping/provider';
import type { OrderDocumentSnapshot } from '../db/repositories/orders';
import type { OrderCustomerFeeView } from '../db/repositories/customer-service-fees';
import type { OrderOfferSnapshot } from '../products/offer-order-contract';

export const APPROVED_BILLING_VERSION = 'approved-2026-10-21' as const;
export interface BillingIssuer {
  reference: string;
  kind: 'company' | 'registered';
  legalName: string;
  pan: string;
  address: string;
  taxMode: 'PAN' | 'VAT' | 'BOTH' | 'NONE';
  storeName?: string;
}
export interface BillingContext {
  version: typeof APPROVED_BILLING_VERSION;
  /** No commercial numbering until issuer clearance and an opening sequence are approved. */
  receiptIssuance?: 'simulation' | 'pending_clearance';
  company: BillingIssuer;
  customer: { name?: string; email: string; phone: string };
  deliveryAddress: NepalAddress;
  /** Captured only when the customer actually supplied a billing address. */
  billingAddress?: NepalAddress;
  receiptGroups?: ReceiptGroup[];
  receiptReviewReason?: string;
}
export interface BillingLineIdentity {
  /** Exact original selection and unit price; never substitute current catalogue facts. */
  offerSnapshot?: OrderOfferSnapshot | null;
  orderItemId?: string;
  productId?: string;
  sellerId?: string;
  sellerSku?: string | null;
  listPricePaisa?: number;
  variant?: string | null;
  issuer?: BillingIssuer;
  /** Sealed using the existing COD/cancellation allocation, not a new settlement rule. */
  billingPromotionPaisa?: number;
  billingWalletPaisa?: number;
}
export interface ReceiptGroup {
  key: string;
  issuer: BillingIssuer;
  billNumber: string | null;
  /** Reference to the one retained actual invoice; never a request for another number. */
  canonicalInvoiceId?: string;
  billSequence?: number;
  stampVersion?: string;
  scope?: 'goods' | 'order_charges';
  items: OrderDocumentSnapshot['items'];
  goodsPaisa: number;
  deliveryPaisa: number;
  serviceFeePaisa: number;
  customerServiceFee?: OrderCustomerFeeView;
  promotionPaisa: number;
  walletPaisa: number;
  totalPaisa: number;
}

export function formatBillNumber(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError('Bill sequence is invalid.');
  return String(sequence).padStart(2, '0');
}
export function documentDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Kathmandu',day:'numeric',month:'long',year:'numeric'}).format(timestamp);
}
export function documentTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Kathmandu',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(timestamp);
}
export function documentMoney(paisa: number): string {
  return new Intl.NumberFormat('en-NP',{minimumFractionDigits:2,maximumFractionDigits:2}).format(paisa/100);
}

function receiptMoney(value: unknown): number {
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) value=Number(value);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value<0)
    throw new Error('Recorded receipt money needs financial review.');
  return value;
}
function receiptSum(values: readonly number[]): number {
  const total=values.reduce((sum,value)=>sum+BigInt(value),BigInt(0));
  if(total<BigInt(0)||total>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Receipt allocation needs financial review.');
  return Number(total);
}
/** Native aggregate expressions may return exact integer strings. Validate them
 * at the document boundary before arithmetic; never round or coerce other values.
 */
function normalizeReceiptMoney(snapshot:OrderDocumentSnapshot):OrderDocumentSnapshot {
  const normalized={...snapshot};
  for(const field of ['itemSubtotalPaisa','deliveryChargePaisa','buyerPlatformFeePaisa','taxTotalPaisa','grandTotalPaisa'] as const)
    normalized[field]=receiptMoney(snapshot[field]);
  for(const field of ['walletCreditPaisa','referralDiscountPaisa','promoDiscountPaisa','originalPromoDiscountPaisa','currentPromoDiscountPaisa','refundedPromoDiscountPaisa'] as const)
    if(snapshot[field]!==undefined)normalized[field]=receiptMoney(snapshot[field]);
  normalized.items=snapshot.items.map(item=>{
    const line={...item,unitPricePaisa:receiptMoney(item.unitPricePaisa),lineTotalPaisa:receiptMoney(item.lineTotalPaisa)};
    for(const field of ['listPricePaisa','billingPromotionPaisa','billingWalletPaisa'] as const)
      if(item[field]!==undefined)line[field]=receiptMoney(item[field]);
    return line;
  });
  return normalized;
}

/** Derive display groups only from captured order evidence, never current seller profiles. */
export function buildReceiptGroups(snapshot: OrderDocumentSnapshot): ReceiptGroup[] {
  if (snapshot.billing?.version !== APPROVED_BILLING_VERSION) return [];
  snapshot=normalizeReceiptMoney(snapshot);
  const groups=new Map<string,ReceiptGroup>();
  const ids=new Set<string>();
  for (const item of snapshot.items) {
    const issuer=item.issuer;
    if (!issuer || !issuer.reference || !issuer.legalName || !issuer.address || !/^\d{9}$/.test(issuer.pan))
      throw new Error('Recorded receipt issuer needs identity review.');
    if (issuer.taxMode !== 'PAN') throw new Error('This seller needs its own approved bill format; the current receipt format is PAN only.');
    if (!item.orderItemId || ids.has(item.orderItemId)) throw new Error('Recorded receipt line identity needs review.');
    ids.add(item.orderItemId);
    let group=groups.get(issuer.reference);
    if (!group) {
      group={key:issuer.reference,issuer:{...issuer},billNumber:null,items:[],goodsPaisa:0,
        deliveryPaisa:0,serviceFeePaisa:0,promotionPaisa:0,walletPaisa:0,totalPaisa:0};
      groups.set(issuer.reference,group);
    } else if (JSON.stringify(group.issuer)!==JSON.stringify(issuer)) throw new Error('Conflicting recorded issuer identity needs review.');
    group.items=[...group.items,{...item}]; group.goodsPaisa=receiptSum([group.goodsPaisa,item.lineTotalPaisa]);
  }
  const result=[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key,'en'));
  // Keep the full collected amount evidenced even when all goods belong to
  // independent sellers. This is a separate company charge receipt, not their goods bill.
  if (!result.some(group=>group.issuer.kind==='company') &&
      (snapshot.deliveryChargePaisa>0||snapshot.buyerPlatformFeePaisa>0||(snapshot.customerServiceFee?.waivedPaisa??0)>0)) {
    const issuer=snapshot.billing!.company;
    result.push({key:issuer.reference,issuer:{...issuer},scope:'order_charges',billNumber:null,items:[],goodsPaisa:0,
      deliveryPaisa:0,serviceFeePaisa:0,promotionPaisa:0,walletPaisa:0,totalPaisa:0});
  }
  const promotionTotal=receiptSum([snapshot.promoDiscountPaisa??0,snapshot.referralDiscountPaisa??0]);
  const walletTotal=snapshot.walletCreditPaisa??0;
  // Never move a recorded penny to a different seller when rendering a receipt.
  const allocation=(field:'billingPromotionPaisa'|'billingWalletPaisa',expected:number)=>{
    const values=Object.fromEntries(result.map(group=>[group.key,group.items.reduce((sum,item)=>{
      const value=item[field]??(expected===0?0:NaN);
      if(!Number.isSafeInteger(value)||value<0)throw new Error('Recorded receipt discount allocation needs review.');
      return receiptSum([sum,value]);
    },0)]));
    if(receiptSum(Object.values(values))!==expected)throw new Error('Recorded receipt discount allocation needs review.');
    return values;
  };
  const promotions=allocation('billingPromotionPaisa',promotionTotal);
  const wallets=allocation('billingWalletPaisa',walletTotal);
  const companyGroups=result.filter(group=>group.issuer.kind==='company');
  if (companyGroups.length>1) throw new Error('Different company issuers need charge allocation review.');
  for (const group of result) {
    // Independent sellers' goods receipts never duplicate platform delivery/service charges.
    if (group===companyGroups[0]) {group.deliveryPaisa=snapshot.deliveryChargePaisa;group.serviceFeePaisa=snapshot.buyerPlatformFeePaisa;
      if(snapshot.customerServiceFee)group.customerServiceFee=snapshot.customerServiceFee;}
    group.promotionPaisa=promotions[group.key]??0;group.walletPaisa=wallets[group.key]??0;
    group.totalPaisa=receiptSum([group.goodsPaisa,group.deliveryPaisa,group.serviceFeePaisa,-group.promotionPaisa,-group.walletPaisa]);
  }
  if(receiptSum(result.map(group=>group.totalPaisa))!==snapshot.grandTotalPaisa)
    throw new Error('Receipt totals need financial review.');
  return result;
}

/** Preserve operational payment capture even when statutory issuer evidence needs review. */
export function withReceiptGroups(snapshot: OrderDocumentSnapshot): OrderDocumentSnapshot {
  if(snapshot.billing?.version!==APPROVED_BILLING_VERSION)return snapshot;
  try{snapshot=normalizeReceiptMoney(snapshot);return {...snapshot,documentTitle:'Receipt',billing:{...snapshot.billing!,receiptGroups:buildReceiptGroups(snapshot)}};}
  catch(error){return {...snapshot,documentTitle:'Receipt',billing:{...snapshot.billing!,receiptGroups:[],
    receiptReviewReason:error instanceof Error?error.message:'Receipt identity needs review.'}};}
}

export function mergeRecordedReceiptItems(original:OrderDocumentSnapshot['items'],current:OrderDocumentSnapshot['items']):OrderDocumentSnapshot['items'] {
  const recorded=new Map(original.filter(item=>item.orderItemId).map(item=>[item.orderItemId,item]));
  return current.map(item=>({...recorded.get(item.orderItemId),...item}));
}

const small=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve',
  'thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
function words(value:number):string {
  if(value<20)return small[value]!;
  if(value<100)return tens[Math.floor(value/10)]+(value%10?' '+words(value%10):'');
  for(const [amount,label] of [[1_000_000_000,'billion'],[1_000_000,'million'],[1000,'thousand'],[100,'hundred']] as const)
    if(value>=amount)return words(Math.floor(value/amount))+' '+label+(value%amount?' '+words(value%amount):'');
  throw new RangeError('Amount is invalid.');
}
export function amountInWords(paisa:number):string {
  if(!Number.isSafeInteger(paisa)||paisa<0)throw new RangeError('Amount is invalid.');
  const value=words(Math.floor(paisa/100))+' Nepalese rupees'+(paisa%100?' and '+words(paisa%100)+' paisa':'')+' only.';
  return value[0]!.toUpperCase()+value.slice(1);
}
