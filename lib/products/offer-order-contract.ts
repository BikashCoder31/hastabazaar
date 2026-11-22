import {captureOfferSnapshot,type OfferSnapshot} from '../workflows/contracts';
import {OfferError} from './offer-support';
/** Shared historical contract for checkout, invoices, fulfillment, cancellations, returns/refunds and reports. */
export interface OrderOfferSnapshot extends OfferSnapshot {readonly publicVersionId?:string|null;readonly sku:string;readonly sellerSku:string|null;readonly productName:string;readonly mediaId:string|null;readonly baseUnit:'piece'|'gram'|'millilitre'|null;readonly unitsPerOffer:number|null;readonly legacySelectionUnknown:boolean}
export function captureOrderOfferSnapshot(input:OrderOfferSnapshot):OrderOfferSnapshot{
 const unknownLegacyUnits=input.legacySelectionUnknown===true&&input.baseUnit===null&&input.unitsPerOffer===null;
 if(typeof input.sku!=='string'||!input.sku.trim()||input.sku.length>191||typeof input.productName!=='string'||!input.productName.trim()||input.productName.length>1000||input.sellerSku!==null&&(typeof input.sellerSku!=='string'||input.sellerSku.length>80)||input.mediaId!==null&&typeof input.mediaId!=='string'||!unknownLegacyUnits&&(!['piece','gram','millilitre'].includes(input.baseUnit??'')||!Number.isSafeInteger(input.unitsPerOffer)||(input.unitsPerOffer??0)<1)||typeof input.legacySelectionUnknown!=='boolean')throw new OfferError('The exact order offer facts are incomplete.',400);
 return Object.freeze({...captureOfferSnapshot(input),...(input.publicVersionId!==undefined?{publicVersionId:input.publicVersionId}:{}),sku:input.sku,sellerSku:input.sellerSku,productName:input.productName,mediaId:input.mediaId,baseUnit:input.baseUnit,unitsPerOffer:input.unitsPerOffer,legacySelectionUnknown:input.legacySelectionUnknown});
}
/** Trusted repositories call this after checking their existing order/customer/seller access. */
export async function getOrderItemOfferSnapshot(db:D1Database,orderItemId:string):Promise<OrderOfferSnapshot|null>{const row=await db.prepare('SELECT snapshot_json AS snapshot FROM order_item_offer_snapshots WHERE order_item_id=?').bind(orderItemId).first<{snapshot:string}>();return row?captureOrderOfferSnapshot(JSON.parse(row.snapshot)):null;}
// Checkout inserts order_items.offer_reservation_id in the SAME batch as prepareOfferReservation().
// Native guards bind customer/product/quantity/price/SKU and freeze this snapshot on item insertion.

/** Enrich only rows already selected by the caller's native owner/role scope. */
export async function withOrderOfferSnapshots<T>(db:D1Database,rows:readonly T[],itemId:(row:T)=>string):Promise<Array<T&{offerSnapshot:OrderOfferSnapshot|null}>> {
 const ids=[...new Set(rows.map(itemId))],snapshots=new Map<string,OrderOfferSnapshot>();
 for(let offset=0;offset<ids.length;offset+=50){const chunk=ids.slice(offset,offset+50);const result=await db.prepare(`SELECT order_item_id AS id,snapshot_json AS snapshot FROM order_item_offer_snapshots WHERE order_item_id IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk).all<{id:string;snapshot:string}>();for(const row of result.results)snapshots.set(row.id,captureOrderOfferSnapshot(JSON.parse(row.snapshot)));}
 return rows.map(row=>({...row,offerSnapshot:snapshots.get(itemId(row))??null}));
}
