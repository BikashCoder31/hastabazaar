import { readOriginalBuyerLinePricing } from '../db/repositories/order-item-pricing-snapshots';
import { APPROVED_BILLING_VERSION } from '../documents/billing';
import { paymentGuard } from '../payments/manual-receipts';
import { VARIANT_PRICING_RULE_VERSION } from '../products/variant-pricing';
import { usesSellerShipmentDelivery } from '../returns/seller-shipment-delivery';

/** Read original issued line allocations; never substitute current campaign terms. */
export async function recordedBenefitRefund(db:D1Database,input:{orderId:string;orderItemId?:string;amount:number;wallet:number;referral:number}){
 const saved=await db.prepare("SELECT snapshot_json AS snapshot FROM order_documents WHERE order_id=? AND kind='order_statement' ORDER BY issued_at,id LIMIT 1").bind(input.orderId).first<{snapshot:string}>();
 if(!saved)return null;
 const snapshot=JSON.parse(saved.snapshot) as {billing?:{version?:string};items?:{orderItemId:string;lineTotalPaisa:number;billingWalletPaisa:number;billingPromotionPaisa:number}[]};
 if(snapshot.billing?.version!=='approved-2026-10-21')return null;
 const invalid=()=>{throw new Error('Original benefit allocation requires reconciliation.');};
 const safe=(value:number)=>Number.isSafeInteger(value)&&value>=0;
 if(!safe(input.amount)||!Array.isArray(snapshot.items)||!snapshot.items.length)return invalid();
 const lines=(await db.prepare('SELECT id,line_total_paisa AS amount,fulfillment_status AS status FROM order_items WHERE order_id=?').bind(input.orderId).all<{id:string;amount:number;status:string}>()).results;
 if(lines.length!==snapshot.items.length||new Set(snapshot.items.map(item=>item.orderItemId)).size!==lines.length)return invalid();
 let wallet=BigInt(0),referral=BigInt(0);
 for(const item of snapshot.items){const line=lines.find(line=>line.id===item.orderItemId);if(!line||line.amount!==item.lineTotalPaisa||![item.lineTotalPaisa,item.billingWalletPaisa,item.billingPromotionPaisa].every(safe)||BigInt(item.billingWalletPaisa)+BigInt(item.billingPromotionPaisa)>BigInt(line.amount))return invalid();wallet+=BigInt(item.billingWalletPaisa);referral+=BigInt(item.billingPromotionPaisa);}
 if(wallet!==BigInt(input.wallet)||referral!==BigInt(input.referral))return invalid();
 const remaining=lines.filter(line=>line.status!=='cancelled'),selected=input.orderItemId?remaining.find(line=>line.id===input.orderItemId):remaining.length===1?remaining[0]:null;
 if(!selected||!selected.amount)return invalid();const original=snapshot.items.find(item=>item.orderItemId===selected.id)!;
 const prior=await db.prepare("SELECT COALESCE(SUM(r.item_amount_paisa),0) AS merchandise,COALESCE(SUM(r.wallet_credit_paisa),0) AS wallet,COALESCE(SUM(r.referral_discount_paisa),0) AS referral FROM refunds r JOIN return_requests rr ON rr.id=r.return_request_id WHERE r.order_id=? AND rr.order_item_id=? AND r.status<>'rejected'").bind(input.orderId,selected.id).first<{merchandise:number;wallet:number;referral:number}>();
 if(prior&&![prior.merchandise,prior.wallet,prior.referral].every(safe))return invalid();
 const cumulative=BigInt(prior?.merchandise??0)+BigInt(input.amount);if(cumulative>BigInt(selected.amount))return invalid();
 const combined=BigInt(original.billingWalletPaisa)+BigInt(original.billingPromotionPaisa),offset=combined*cumulative/BigInt(selected.amount),walletCumulative=combined?offset*BigInt(original.billingWalletPaisa)/combined:BigInt(0);
 const walletPaisa=Number(walletCumulative)-Number(prior?.wallet??0),discountPaisa=Number(offset-walletCumulative)-Number(prior?.referral??0);
 if(!safe(walletPaisa)||!safe(discountPaisa)||walletPaisa+discountPaisa>input.amount)return invalid();
 return {walletPaisa,discountPaisa};
}

interface TenderOffsets {
  itemPaisa: number;
  walletPaisa: number;
  discountPaisa: number;
  promoPaisa: number;
}

interface MerchandiseTender extends TenderOffsets {
  sellerPrincipalPaisa: number;
  platformAdditionPaisa: number;
  taxPaisa: number;
}

export interface OriginalBuyerMerchandiseRefundQuote extends MerchandiseTender {
  orderId: string;
  orderItemId: string;
  pricingRuleVersion: typeof VARIANT_PRICING_RULE_VERSION;
  usesVariantPricing: boolean;
  originalQuantity: number;
  quantity: number;
  /** Order-wide gross merchandise already reserved when this quote was read. */
  basePaisa: number;
  cashMerchandisePaisa: number;
  unitOrdinals: readonly number[];
  cancellationVersion: number;
  hasDeliveryUnits: boolean;
  prior: TenderOffsets & { quantity: number; refundCount: number };
}

function reconcileOriginalTender(): never {
  throw new Error('Reconcile the original saved buyer merchandise and tender before approving this refund.');
}

function money(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) return reconcileOriginalTender();
  return BigInt(value);
}

/** Position cumulative offsets together, so rounding cannot turn a funded unit into cash. */
function tenderForUnits(original: MerchandiseTender, quantity: number, ordinals: readonly number[]): MerchandiseTender {
  const zero = BigInt(0);
  const count = BigInt(quantity);
  const gross = money(original.itemPaisa);
  const wallet = money(original.walletPaisa);
  const combined = wallet + money(original.discountPaisa) + money(original.promoPaisa);
  const seller = money(original.sellerPrincipalPaisa);
  const platform = money(original.platformAdditionPaisa);
  const tax = money(original.taxPaisa);
  const prefix = (amount: bigint, position: bigint) => {
    const remainder = amount % count;
    return (amount / count) * position + (position < remainder ? position : remainder);
  };
  const grossAt = (position: bigint) => prefix(seller, position) + prefix(platform, position) + prefix(tax, position);
  const offsetAt = (position: bigint) => gross ? (combined * grossAt(position)) / gross : zero;
  const walletAt = (offset: bigint) => combined ? (offset * wallet) / combined : zero;

  let principalPart = zero, platformPart = zero, taxPart = zero, walletPart = zero, offsetPart = zero;
  for (const ordinal of ordinals) {
    const end = BigInt(ordinal);
    const start = end - BigInt(1);
    principalPart += prefix(seller, end) - prefix(seller, start);
    platformPart += prefix(platform, end) - prefix(platform, start);
    taxPart += prefix(tax, end) - prefix(tax, start);
    const endOffset = offsetAt(end), startOffset = offsetAt(start);
    offsetPart += endOffset - startOffset;
    walletPart += walletAt(endOffset) - walletAt(startOffset);
  }
  const discount = Number(offsetPart - walletPart);
  return {
    itemPaisa: Number(principalPart + platformPart + taxPart),
    sellerPrincipalPaisa: Number(principalPart), platformAdditionPaisa: Number(platformPart), taxPaisa: Number(taxPart),
    walletPaisa: Number(walletPart), discountPaisa: original.discountPaisa ? discount : 0,
    promoPaisa: original.promoPaisa ? discount : 0,
  };
}

/** Quote an open return from its purchased units and original sealed buyer tender. */
export async function quoteOriginalBuyerMerchandiseRefund(db: D1Database, input: {
  orderId: string; orderItemId: string; quantity: number; unitOrdinals?: readonly number[];
}): Promise<OriginalBuyerMerchandiseRefundQuote | null> {
  const { orderId, orderItemId, quantity } = input;
  const snapshots = await readOriginalBuyerLinePricing(db, orderId);
  if (!snapshots) return null;
  if (!Number.isSafeInteger(quantity) || quantity < 1) return reconcileOriginalTender();

  const [order, statementRow, lines, refunds] = await Promise.all([
    db.prepare(`SELECT item_subtotal_paisa AS subtotal,tax_total_paisa AS tax,wallet_credit_paisa AS wallet,
      referral_discount_paisa AS referral,promo_discount_paisa AS promo,cancellation_version AS cancellationVersion,
      delivery_rate_snapshot_json AS deliverySnapshot,
      COALESCE((SELECT SUM(item_amount_paisa) FROM refunds WHERE order_id=o.id AND status<>'rejected'),0) AS basePaisa
      FROM orders o WHERE id=?`).bind(orderId).first<{
      subtotal: number; tax: number; wallet: number; referral: number; promo: number;
      cancellationVersion: number; deliverySnapshot: string | null; basePaisa: number;
    }>(),
    db.prepare("SELECT snapshot_json AS statement FROM order_documents WHERE order_id=? AND kind='order_statement' ORDER BY issued_at,id LIMIT 1")
      .bind(orderId).first<{ statement: string }>(),
    db.prepare(`SELECT id,quantity,unit_price_paisa AS unitPrice,line_total_paisa AS lineTotal,
      COALESCE(commission_base_paisa,line_total_paisa-seller_discount_paisa) AS sellerPrincipal,
      seller_discount_paisa AS sellerDiscount,tax_paisa AS tax,referral_discount_paisa AS referral,
      promo_discount_paisa AS promo,fulfillment_status AS status FROM order_items WHERE order_id=?`)
      .bind(orderId).all<{
      id: string; quantity: number; unitPrice: number; lineTotal: number; sellerPrincipal: number;
      sellerDiscount: number; tax: number; referral: number; promo: number; status: string;
    }>(),
    db.prepare(`SELECT r.id,rr.quantity,r.item_amount_paisa AS itemPaisa,r.wallet_credit_paisa AS walletPaisa,
      r.referral_discount_paisa AS discountPaisa,r.promo_discount_paisa AS promoPaisa
      FROM refunds r JOIN return_requests rr ON rr.id=r.return_request_id
      WHERE r.order_id=? AND rr.order_item_id=? AND r.status<>'rejected'`)
      .bind(orderId, orderItemId).all<TenderOffsets & { id: string; quantity: number }>(),
  ]);
  if (!order || !statementRow || !lines.results.length || (order.referral && order.promo)) return reconcileOriginalTender();
  const statement = JSON.parse(statementRow.statement) as {
    billing?: { version?: string };
    items?: { orderItemId: string; quantity: number; unitPricePaisa: number; lineTotalPaisa: number;
      billingWalletPaisa: number; billingPromotionPaisa: number }[];
  } | null;
  if (statement?.billing?.version !== APPROVED_BILLING_VERSION ||
      !Array.isArray(statement.items) || statement.items.length !== lines.results.length) return reconcileOriginalTender();
  const billed = new Map(statement.items.map(line => [line.orderItemId, line]));
  if (billed.size !== lines.results.length) return reconcileOriginalTender();

  const zero = BigInt(0);
  let subtotal = zero, tax = zero, wallet = zero, referral = zero, promo = zero;
  let original: MerchandiseTender | undefined;
  let originalQuantity = 0;
  for (const line of lines.results) {
    const bill = billed.get(line.id);
    if (!bill || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || bill.quantity !== line.quantity ||
      money(bill.unitPricePaisa) * BigInt(line.quantity) !== money(bill.lineTotalPaisa) ||
      money(line.promo) + money(line.referral) !== money(bill.billingPromotionPaisa)) return reconcileOriginalTender();
    const saved = snapshots.get(line.id);
    const unitCount = BigInt(line.quantity);
    const seller = money(line.sellerPrincipal);
    const addition = saved ? money(saved.additionPaisa) * unitCount : zero;
    const gross = seller + addition + money(line.tax);
    const discounts = money(line.referral) + money(line.promo);
    const shoppingCredit = money(bill.billingWalletPaisa);
    const cash = gross - discounts - shoppingCredit;
    if (seller !== money(line.unitPrice) * unitCount - money(line.sellerDiscount) ||
        money(bill.lineTotalPaisa) - money(line.sellerDiscount) !== seller + addition ||
        cash < zero || gross > BigInt(Number.MAX_SAFE_INTEGER) || (line.promo && line.referral))
      return reconcileOriginalTender();
    if (saved && (saved.ruleVersion !== VARIANT_PRICING_RULE_VERSION || saved.quantity !== line.quantity ||
        saved.sellerBasePaisa !== line.unitPrice || saved.commission?.basePaisa !== line.sellerPrincipal ||
        saved.customerUnitPaisa !== bill.unitPricePaisa || saved.customerSubtotalPaisa !== bill.lineTotalPaisa ||
        saved.discounts?.sellerFundedPaisa !== line.sellerDiscount || saved.discounts?.platformPromoPaisa !== line.promo ||
        saved.discounts?.platformReferralPaisa !== line.referral || saved.taxPaisa !== line.tax ||
        saved.creditAppliedPaisa !== bill.billingWalletPaisa || money(saved.customerTotalPaisa) !== gross - discounts ||
        money(saved.cashPayablePaisa) !== cash)) return reconcileOriginalTender();
    if (!saved && line.lineTotal !== bill.lineTotalPaisa) return reconcileOriginalTender();

    subtotal += money(bill.lineTotalPaisa);
    tax += money(line.tax);
    wallet += shoppingCredit;
    referral += money(line.referral);
    promo += money(line.promo);
    if (line.id === orderItemId && line.status !== 'cancelled') {
      originalQuantity = line.quantity;
      original = {
        itemPaisa: Number(gross), sellerPrincipalPaisa: line.sellerPrincipal, platformAdditionPaisa: Number(addition),
        taxPaisa: line.tax, walletPaisa: bill.billingWalletPaisa, discountPaisa: line.referral, promoPaisa: line.promo,
      };
    }
  }
  if (!original || subtotal !== money(order.subtotal) || tax !== money(order.tax) || wallet !== money(order.wallet) ||
      referral !== money(order.referral) || promo !== money(order.promo)) return reconcileOriginalTender();
  money(order.basePaisa);
  money(order.cancellationVersion);

  const prior = { quantity: 0, refundCount: refunds.results.length, itemPaisa: 0, walletPaisa: 0, discountPaisa: 0, promoPaisa: 0 };
  for (const refund of refunds.results) {
    if (!Number.isSafeInteger(refund.quantity) || refund.quantity < 1) return reconcileOriginalTender();
    prior.quantity += refund.quantity;
    for (const component of ['itemPaisa', 'walletPaisa', 'discountPaisa', 'promoPaisa'] as const) {
      prior[component] = Number(money(prior[component]) + money(refund[component]));
      money(prior[component]);
    }
  }
  if (prior.quantity + quantity > originalQuantity || prior.itemPaisa > order.basePaisa) return reconcileOriginalTender();

  const hasDeliveryUnits = usesSellerShipmentDelivery(order.deliverySnapshot);
  let priorOrdinals = Array.from({ length: prior.quantity }, (_, index) => index + 1);
  let availableOrdinals = Array.from({ length: quantity }, (_, index) => prior.quantity + index + 1);
  if (hasDeliveryUnits) {
    const { results: slots } = await db.prepare(`SELECT u.unit_ordinal AS ordinal,c.unit_ordinal AS claimed,c.refund_id AS refundId
      FROM order_delivery_unit_allocations u LEFT JOIN order_delivery_unit_claims c
        ON c.order_item_id=u.order_item_id AND c.unit_ordinal=u.unit_ordinal
      WHERE u.order_id=? AND u.order_item_id=? ORDER BY u.unit_ordinal`)
      .bind(orderId, orderItemId).all<{ ordinal: number; claimed: number | null; refundId: string | null }>();
    if (slots.length !== originalQuantity || slots.some((slot, index) => slot.ordinal !== index + 1))
      return reconcileOriginalTender();
    const reserved = new Map(refunds.results.map(refund => [refund.id, refund.quantity]));
    priorOrdinals = [];
    availableOrdinals = [];
    for (const slot of slots) {
      if (slot.claimed === null) {
        availableOrdinals.push(slot.ordinal);
      } else {
        const remaining = slot.refundId ? reserved.get(slot.refundId) : undefined;
        if (!slot.refundId || !remaining) return reconcileOriginalTender();
        reserved.set(slot.refundId, remaining - 1);
        priorOrdinals.push(slot.ordinal);
      }
    }
    if ([...reserved.values()].some(count => count !== 0)) return reconcileOriginalTender();
  }

  const unitOrdinals = input.unitOrdinals
    ? [...input.unitOrdinals].sort((left, right) => left - right)
    : availableOrdinals.slice(0, quantity);
  if (unitOrdinals.length !== quantity || new Set(unitOrdinals).size !== quantity ||
      unitOrdinals.some(ordinal => !availableOrdinals.includes(ordinal))) return reconcileOriginalTender();
  const previous = tenderForUnits(original, originalQuantity, priorOrdinals);
  if (previous.itemPaisa !== prior.itemPaisa || previous.walletPaisa !== prior.walletPaisa ||
      previous.discountPaisa !== prior.discountPaisa || previous.promoPaisa !== prior.promoPaisa) return reconcileOriginalTender();
  const tender = tenderForUnits(original, originalQuantity, unitOrdinals);
  const cashMerchandisePaisa = tender.itemPaisa - tender.walletPaisa - tender.discountPaisa - tender.promoPaisa;
  return {
    ...tender, orderId, orderItemId, originalQuantity, quantity, basePaisa: order.basePaisa, cashMerchandisePaisa,
    unitOrdinals, cancellationVersion: order.cancellationVersion, hasDeliveryUnits, prior,
    pricingRuleVersion: VARIANT_PRICING_RULE_VERSION, usesVariantPricing: snapshots.has(orderItemId),
  };
}

/** Add after the order lock, before recording the refund and its unit claims. */
export function prepareOriginalBuyerMerchandiseRefundGuard(
  db: D1Database, quote: OriginalBuyerMerchandiseRefundQuote,
): D1PreparedStatement[] {
  return paymentGuard(db, `EXISTS(SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id
      WHERE i.id=? AND o.id=? AND i.quantity=? AND i.fulfillment_status<>'cancelled' AND o.cancellation_version=?
      AND (SELECT COUNT(*) FROM order_item_pricing_snapshots s WHERE s.order_id=o.id AND s.order_item_id=i.id)=?)
    AND (SELECT COALESCE(SUM(item_amount_paisa),0) FROM refunds WHERE order_id=? AND status<>'rejected')=?
    AND EXISTS(SELECT 1 FROM (
      SELECT COUNT(*) AS refund_count,COALESCE(SUM(rr.quantity),0) AS quantity,
        COALESCE(SUM(r.item_amount_paisa),0) AS merchandise,COALESCE(SUM(r.wallet_credit_paisa),0) AS wallet,
        COALESCE(SUM(r.referral_discount_paisa),0) AS referral,COALESCE(SUM(r.promo_discount_paisa),0) AS promo
      FROM refunds r JOIN return_requests rr ON rr.id=r.return_request_id
      WHERE r.order_id=? AND rr.order_item_id=? AND r.status<>'rejected'
    ) prior_refunds WHERE prior_refunds.refund_count=? AND prior_refunds.quantity=? AND prior_refunds.merchandise=?
      AND prior_refunds.wallet=? AND prior_refunds.referral=? AND prior_refunds.promo=?)
    ${quote.hasDeliveryUnits ? `AND NOT EXISTS(SELECT 1 FROM order_delivery_unit_claims
      WHERE order_item_id=? AND unit_ordinal IN (${quote.unitOrdinals.map(() => '?').join(',')}))` : ''}`,
  [quote.orderItemId, quote.orderId, quote.originalQuantity, quote.cancellationVersion, Number(quote.usesVariantPricing),
    quote.orderId, quote.basePaisa,
    quote.orderId, quote.orderItemId, quote.prior.refundCount, quote.prior.quantity, quote.prior.itemPaisa,
    quote.prior.walletPaisa, quote.prior.discountPaisa, quote.prior.promoPaisa,
    ...(quote.hasDeliveryUnits ? [quote.orderItemId, ...quote.unitOrdinals] : [])]);
}
