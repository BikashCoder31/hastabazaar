import assert from 'node:assert/strict';
import {earnedMaker} from './company-store-financial-fixture';
import {prepareManagedPayout} from '../../lib/db/repositories/managed-settlements';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../../lib/payments/payout-transfers';
import {createCustomerReturnRequest,reviewReturnAsAdmin} from '../../lib/db/repositories/returns';
import * as refunds from '../../lib/payments/refund-obligations';
import {getReturnHandling,recordReturnHandling} from '../../lib/returns/handling';
import {advanceReturnAsAdmin} from '../../lib/db/repositories/returns';

/** Retain parcel custody and the matching original collection in the in-memory historical fixture. */
export function appendHistoricalManagedCodCustody(f:Awaited<ReturnType<typeof earnedMaker>>,jobId:string){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const total=Number(f.sqlite.prepare('SELECT grand_total_paisa FROM orders WHERE id=?').get(f.orderId)?.grand_total_paisa);
 assert.ok(Number.isSafeInteger(total)&&total>0);
 f.sqlite.prepare("INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at) VALUES(?,?,?,'outbound','delivered','reviewer',?,?,?)").run(jobId,f.orderId,f.sellerId,jobId,f.now,f.now+7);
 f.sqlite.prepare("INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,collected_paisa,remitted_paisa,method,courier_name,delivered_at,created_at) VALUES(?,?,?,?,'courier','Fictional Historical Courier',?,?)").run(jobId,total,total,total,f.now+7,f.now);
 f.sqlite.prepare("INSERT INTO parcel_cash_records(id,shipping_job_id,kind,amount_paisa,evidence_reference,status,created_by,created_at) VALUES(?,?,'collection',?,?,'posted','reviewer',?)").run(jobId+'-collection',jobId,total,'FICTIONAL-'+jobId.toUpperCase()+'-COLLECTION',f.now+7);
}

/** Explicit historical fictional commerce source; all financial execution uses real domain packets. */
export async function managedRecoveryFixture(responsibility:'seller'|'platform'='seller',quantity:1|2=1,legacyMissingResponsibility=false){
 const f=await earnedMaker(true,undefined,quantity);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const ctx=f.payoutSources.ctx,environment=f.context.environment;
 appendHistoricalManagedCodCustody(f,'original-managed-custody');
 const payoutId=await prepareManagedPayout(f.db,{...f.context,requestId:'original-managed-recovery-payout'});
 const payout=await preparePayoutTransfer(f.db,ctx('managed-recovery-packet'),{model:'managed',payoutId,accountVersionId:f.payoutSources.accountVersionId,environment,reason:'Prepare the exact original native earned amount and independently verified beneficiary.'});
 await approvePayoutTransfer(f.db,ctx('managed-recovery-payout-approved','0'),{packetId:payout.id,environment,reason:'Approve the original actual fictional company funding for this native payout.'});
 await startPayoutTransfer(f.db,ctx('managed-recovery-payout-started','1'),{packetId:payout.id,environment,reason:'Record the original fictional manual seller transfer instruction once.'});
 const originalPaidPaisa=Number(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(payoutId)!.amount_paisa);
 await recordPayoutTransferOutcome(f.db,ctx('managed-recovery-payout-paid','2'),{packetId:payout.id,environment,outcome:'paid',amountPaisa:originalPaidPaisa,bankAt:Date.now()-10,transactionIdentity:'FICTIONAL-MANAGED-ORIGINAL-SELLER-DEBIT',evidenceReference:'FICTIONAL-MANAGED-ORIGINAL-SELLER-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual original completed fictional bank debit and exact retained beneficiary.'});
 const refund=await completeManagedRecoveryRefund(f,responsibility,'managed-recovery',100000/quantity,legacyMissingResponsibility);
 return {...f,ctx,payoutId,originalPaidPaisa,...refund};
 }catch(error){f.dispose();throw error;}
}

/** A real second original refund on another purchased unit, in the same inspected fictional order. */
export async function completeManagedRecoveryRefund(f:Awaited<ReturnType<typeof earnedMaker>>,responsibility:'seller'|'platform',prefix:string,itemRefundPaisa:number,legacyMissingResponsibility=false){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const ctx=f.payoutSources.ctx;
 const order=f.sqlite.prepare('SELECT order_number FROM orders WHERE id=?').get(f.orderId)!;
 const request=await createCustomerReturnRequest(f.db,{orderNumber:String(order.order_number),customerId:'buyer',receiptTokenHash:null,orderItemId:f.itemId,quantity:1,reason:'defective',requestedResolution:'refund',detail:'The original delivered product has a documented latent defect requiring continuing problem support.',locale:'en-NP',idempotencyKey:`${prefix}-return`,evidence:[],now:Date.now()});
 await reviewReturnAsAdmin(f.db,{returnRequestId:request.id,actorId:'reviewer',actorRole:'super_admin',action:'approve',responsibility,outcome:'refund',itemRefundPaisa,note:'Approve the original latent-defect refund and independently reviewed responsibility despite the elapsed ordinary return window.',publicMessageEn:'Your original refund is authorized; Finance will arrange its actual payment.',publicMessageNe:'फिर्ता रकम स्वीकृत भयो। भुक्तानी बाँकी छ।',requestId:`${prefix}-refund-authorized`,now:Date.now()});
 const refundId=String(f.sqlite.prepare('SELECT id FROM refunds WHERE return_request_id=?').get(request.id)!.id);
 const obligation=await refunds.openRefundObligation(f.db,ctx(`${prefix}-obligation`),{kind:'return_refund',sourceId:refundId,reason:'Fund the original customer refund independently of the original seller payout and any recovery.'});
 f.sqlite.exec('CREATE TABLE IF NOT EXISTS user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL)');
 f.sqlite.prepare('INSERT INTO user_sessions VALUES(?,?,?,?,?)').run(`${prefix}-SESSION`,'buyer',Date.now()+3600000,Date.now()-1000,Date.now());
 const destination=await refunds.submitRefundDestination(f.db,{...ctx(`${prefix}-destination`),actorId:'buyer',sessionHash:`${prefix}-SESSION`},{obligationId:obligation.id,details:{holder:'Fictional Buyer',bank:'Fictional Customer Bank',branch:'Fictional Branch',accountNumber:'TEST-MANAGED-REFUND',currency:'NPR'},relationship:'own_account',authorization:'I authorize my original refund to this exact customer-owned account.',evidenceReference:'FICTIONAL-MANAGED-CUSTOMER-INSTRUCTIONS',reason:'Retain authenticated original customer instructions for independent verification.'});
 await refunds.verifyRefundDestination(f.db,ctx(`${prefix}-destination-verified`,'0'),{versionId:destination.id,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-MANAGED-CUSTOMER-OWNERSHIP',reason:'Independently review the original customer beneficiary ownership and relationship.'});
 const packet=await refunds.prepareRefundPacket(f.db,ctx(`${prefix}-refund-packet`,'0'),{obligationId:obligation.id,destinationVersionId:destination.id,fundingStatementId:f.payoutSources.fundingId,reason:'Use actual company funding for the original customer obligation without waiting for recovery.'});
 await refunds.approveRefundPacket(f.db,ctx(`${prefix}-refund-approved`,'0'),{packetId:packet.id,reason:'One eligible Super Admin approves the exact original customer funding and verified destination.'});
 await refunds.startRefundPacket(f.db,ctx(`${prefix}-refund-started`,'1'),{packetId:packet.id,reason:'Record the one original fictional manual customer refund instruction.'});
 // Only this inspected historical setup may model the old writer that lacked
 // the original responsibility compensation. All tested calls use f.db.
 let omitted=0;
 const completionDb=legacyMissingResponsibility?{prepare(sql:string){
  if(sql.includes("'original_refund_component_responsibility'")){omitted++;return {bind(){return f.db.prepare('SELECT 1');}} as unknown as D1PreparedStatement;}
  return f.db.prepare(sql);
 },batch:f.db.batch.bind(f.db)} as D1Database:f.db;
 await refunds.recordRefundPacketOutcome(completionDb,ctx(`${prefix}-refund-paid`,'2'),{packetId:packet.id,outcome:'paid',amountPaisa:itemRefundPaisa,bankAt:Date.now()-10,transactionIdentity:'FICTIONAL-MANAGED-ORIGINAL-CUSTOMER-REFUND-'+prefix,evidenceReference:'FICTIONAL-MANAGED-CUSTOMER-REFUND-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm actual original customer cash return without conditioning it on seller recovery.'});
 if(legacyMissingResponsibility)assert.equal(omitted,1,'Only the old missing original compensation is simulated.');
 return {refundId,obligationId:obligation.id};
}

/** Two original purchased units, no outgoing seller payout, one actual refunded unit. */
export async function unpaidManagedRefundFixture(responsibility:'seller'|'platform'='platform',legacyMissingResponsibility=true){
 const f=await earnedMaker(true,undefined,2);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const ctx=f.payoutSources.ctx;
 appendHistoricalManagedCodCustody(f,'unpaid-original-custody');
 const refund=await completeManagedRecoveryRefund(f,responsibility,'unpaid-original-refund',50000,legacyMissingResponsibility);
 const caseId=String(f.sqlite.prepare('SELECT return_request_id FROM refunds WHERE id=?').get(refund.refundId)!.return_request_id),handling=(await getReturnHandling(f.db,caseId))!;
 await recordReturnHandling(f.db,ctx('unpaid-original-physical-review',String(handling.revision)),{caseId,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The original physical return is waived after the documented product review.',privateNote:'The eligible reviewer confirmed the fictional no-return basis before closing physical care.',evidenceReference:'FICTIONAL-UNPAID-ORIGINAL-PHYSICAL-REVIEW'});
 await advanceReturnAsAdmin(f.db,{returnRequestId:caseId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'The actual original refund and physical disposition are complete.',publicMessageEn:'Your original refund case is complete.',publicMessageNe:'Original refund case complete.',requestId:'unpaid-original-physical-complete',now:Date.now()});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_payouts').get()!.n,0);
 return {...f,ctx,...refund};
 }catch(error){f.dispose();throw error;}
}
