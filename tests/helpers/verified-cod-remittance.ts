import assert from 'node:assert/strict';
import {recordCompanyCashReceipt} from '../../lib/payments/cash-receipts';
import {reconcileCodReceipt} from '../../lib/payments/cod-reconciliation';

/** Fictional actual cash, in an already isolated test database. A carrier claim alone is never company money. */
export async function confirmFixtureRemittance(db:D1Database,input:{jobId:string;actorId:string;requestId:string;amountPaisa:number;reference:string}){
 const record=await db.prepare("SELECT id FROM parcel_cash_records WHERE shipping_job_id=? AND kind='remittance' AND status='pending' AND evidence_reference=?").bind(input.jobId,input.reference).first<{id:string}>();assert.ok(record);
 const now=Date.now(),receipt=await recordCompanyCashReceipt(db,{actorId:input.actorId,requestId:input.requestId+':verified-cash',expectedRevision:null,now},{handoverIdentity:'FICTIONAL-'+input.requestId,collectorName:'Fictional independent carrier collector',collectorUserId:null,custodyReference:'FICTIONAL-COUNTED-AUTHORIZED-COMPANY-CUSTODY',amountPaisa:input.amountPaisa,occurredAt:now,evidenceReference:'FICTIONAL-INDEPENDENT-SIGNED-HANDOVER-'+input.requestId,actualHandoverConfirmed:true,reason:'Independently count and verify actual fictional company cash, separately from the carrier claim.'});
 const parcel=await db.prepare('SELECT version FROM shipping_parcels WHERE shipping_job_id=?').bind(input.jobId).first<{version:number}>();assert.ok(parcel);
 return reconcileCodReceipt(db,{actorId:input.actorId,requestId:input.requestId+':reconcile',expectedRevision:String(parcel.version),now:Date.now()},{jobId:input.jobId,receiptId:receipt.id,expectedReceiptRevision:0,amountPaisa:input.amountPaisa,cashRecordId:record.id,deductions:[],evidenceReference:'FICTIONAL-PARCEL-CASH-ALLOCATION',reason:'Match the independent actual company cash receipt to the original collected parcel.'});
}
