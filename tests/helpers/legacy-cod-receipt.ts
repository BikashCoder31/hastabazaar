import assert from 'node:assert/strict';
import {recordCompanyCashReceipt} from '../../lib/payments/cash-receipts';
import {reconcileCodReceipt} from '../../lib/payments/cod-reconciliation';

/** Explicit actual fictional receipt and immutable retry input, only for inspected memory fixtures. */
export async function prepareLegacyCodReceipt(db:D1Database,input:{jobId:string;actorId:string;requestId:string;amountPaisa:number;reference:string}){
 assert.ok((await db.prepare('PRAGMA database_list').all<{file:string}>()).results.every(row=>row.file===''));
 const claim=await db.prepare("SELECT id FROM parcel_cash_records WHERE shipping_job_id=? AND kind='remittance' AND status='pending' AND evidence_reference=?").bind(input.jobId,input.reference).first<{id:string}>();assert.ok(claim);
 const now=Date.now(),receipt=await recordCompanyCashReceipt(db,{actorId:input.actorId,requestId:input.requestId+':cash',expectedRevision:null,now},{handoverIdentity:'FICTIONAL-'+input.requestId,collectorName:'Fictional independent carrier',collectorUserId:null,custodyReference:'FICTIONAL-ACTUAL-COMPANY-CUSTODY',amountPaisa:input.amountPaisa,occurredAt:now,evidenceReference:'FICTIONAL-INDEPENDENT-COUNTED-CASH-'+input.requestId,actualHandoverConfirmed:true,reason:'Count actual fictional company cash separately from the claimed carrier remittance.'});
 const parcel=(await db.prepare('SELECT version FROM shipping_parcels WHERE shipping_job_id=?').bind(input.jobId).first<{version:number}>())!;
 const context={actorId:input.actorId,requestId:input.requestId+':reconcile',expectedRevision:String(parcel.version),now:Date.now()},command={jobId:input.jobId,receiptId:receipt.id,expectedReceiptRevision:0,amountPaisa:input.amountPaisa,cashRecordId:claim.id,deductions:[],evidenceReference:'FICTIONAL-ACTUAL-PARCEL-RECEIPT-ALLOCATION',reason:'Match the independently received company cash to this exact original collected parcel.'};
 return{receiptId:receipt.id,context,command,confirm:(target:D1Database=db)=>reconcileCodReceipt(target,context,command)};
}
