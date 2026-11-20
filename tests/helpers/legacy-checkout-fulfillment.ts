import assert from 'node:assert/strict';
import {prepareSellerParcels,listParcels,operateParcel} from '../../lib/operations/parcels';
import {prepareLegacyCodReceipt} from './legacy-cod-receipt';

/** Real native custody and collection on the inspected original checkout; no paid/status injection. */
export async function deliverLegacyCheckout(db:D1Database,input:{orderId:string;requestId:string;at:number}){
 assert.ok((await db.prepare('PRAGMA database_list').all<{file:string}>()).results.every(row=>row.file===''));
 const original=(await db.prepare('SELECT placed_at at FROM orders WHERE id=?').bind(input.orderId).first<{at:number}>())!;
 const at=Math.max(input.at,original.at+4);
 await prepareSellerParcels(db,{orderId:input.orderId,actorId:'super-1',requestId:input.requestId+'-setup',now:at-3});
 // The original test starts at a prepared stock handoff; preparation is not a claim of cash.
 await db.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=?").bind(input.orderId).run();
 const collections:Array<()=>Promise<void>>=[];
 for(const initial of await listParcels(db,input.orderId)){
  for(const[action,index]of [['assign',0],['dispatch',1],['deliver',2]] as const){const p=(await listParcels(db,input.orderId)).find(p=>p.id===initial.id)!;await operateParcel(db,{jobId:p.id,actorId:'super-1',action,version:p.version,note:'Record the actual fictional original checkout parcel custody.',requestId:input.requestId+'-'+p.sellerId+'-'+action,now:at-2+index,...(action==='assign'?{method:'courier',courierName:'Fictional carrier',trackingCode:'MANUAL-TEST-1'}:{})});}
  const delivered=(await listParcels(db,input.orderId)).find(p=>p.id===initial.id)!;
  const command={jobId:delivered.id,actorId:'super-1',action:'collect' as const,version:delivered.version,amountPaisa:delivered.codDuePaisa,reference:'FICTIONAL-ORIGINAL-CUSTOMER-CASH',note:'Record actual independently evidenced fictional COD customer collection.',requestId:input.requestId+'-'+delivered.sellerId+'-cash',now:at+1};
  collections.push(()=>operateParcel(db,command));
 }
 return{deliveredAt:at,collect:async()=>{for(const collect of collections)await collect();},remit:async()=>{
  for(const p of await listParcels(db,input.orderId)){
   const reference='FICTIONAL-CARRIER-REMITTANCE';await operateParcel(db,{jobId:p.id,actorId:'super-1',action:'propose_remittance',version:p.version,amountPaisa:p.collectedPaisa,reference,note:'Retain a carrier claim separately from independently received company cash.',requestId:input.requestId+'-'+p.sellerId+'-claim',now:at+2});
   const receipt=await prepareLegacyCodReceipt(db,{jobId:p.id,actorId:'super-1',requestId:input.requestId+'-'+p.sellerId+'-company',amountPaisa:p.collectedPaisa,reference});await receipt.confirm();await receipt.confirm();
  }
 }};
}
