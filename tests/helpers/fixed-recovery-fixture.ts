import assert from 'node:assert/strict';
import {readyMaker} from './company-store-lifecycle-fixture';
import {verifiedPayoutSources} from './verified-payout-sources';
import * as fixed from '../../lib/managed-commerce/fixed-supply';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../../lib/payments/payout-transfers';

export async function fixedRecoveryFixture(outcome:'paid'|'prepared'|'no_debit'|'debit_returned'|'uncertain'='paid'){
 const f=await readyMaker(Date.now()-12*86400000);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 // Fictional initial historical supplier terms; never replace an existing sale/model.
 f.sqlite.prepare("UPDATE seller_participation_profiles SET application_stage='active',commercial_model='managed_fixed_supplier_price_v1',payout_beneficiary_reference='SIM-FIXED-RECOVERY',managed_agreement_version='FICTIONAL-FIXED-RECOVERY',managed_agreement_language='en',managed_agreement_accepted_at=? WHERE seller_id=?").run(f.now,f.sellerId);
 const sources=await verifiedPayoutSources(f,f.sellerId),environment=f.activation.environment,ctx=sources.ctx;
 const recordId=await fixed.createFixedSupplyRecord(f.db,{sellerId:f.sellerId,productId:'cup',quantity:2,agreedUnitPaisa:40000,createdBy:f.actorId,agreementVersion:'FICTIONAL-FIXED-RECOVERY',agreementLanguage:'en',payoutBeneficiaryReference:sources.beneficiaryReference,requestId:'recovery-supply-proposed',now:Date.now(),environment});
 await fixed.decideFixedSupplyRecord(f.db,{recordId,actorId:'reviewer',action:'accept',quantityAccepted:2,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'FICTIONAL-ACCEPTED-SUPPLIER-GOODS',reason:'Independently inspect and accept the original fictional fixed-price supplier goods.',requestId:'recovery-supply-accepted',now:Date.now(),environment});
 const payoutId=await fixed.prepareFixedSupplierPayment(f.db,{recordId,actorId:'reviewer',destinationReference:sources.beneficiaryReference,requestId:'recovery-supply-payment',now:Date.now(),environment});
 const packet=await preparePayoutTransfer(f.db,ctx('recovery-supplier-packet'),{model:'fixed',payoutId,accountVersionId:sources.accountVersionId,environment,reason:'Prepare the exact accepted supply obligation independently of customer resale.'});
 if(outcome!=='prepared'){
 await approvePayoutTransfer(f.db,ctx('recovery-supplier-approval','0'),{packetId:packet.id,environment,reason:'Approve the original actual fictional company funding and independently verified bank.'});
 await startPayoutTransfer(f.db,ctx('recovery-supplier-start','1'),{packetId:packet.id,environment,reason:'Record the one fictional original supplier instruction without automatic external payment.'});
 if(outcome==='paid')await recordPayoutTransferOutcome(f.db,ctx('recovery-supplier-paid','2'),{packetId:packet.id,environment,outcome:'paid',amountPaisa:80000,bankAt:Date.now()-10,transactionIdentity:'FICTIONAL-FIXED-ORIGINAL-DEBIT',evidenceReference:'FICTIONAL-FIXED-ORIGINAL-DEBIT-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual original completed fictional supplier payment and exact beneficiary.'});
 else await recordPayoutTransferOutcome(f.db,ctx('recovery-supplier-not-paid','2'),{packetId:packet.id,environment,outcome:outcome==='uncertain'?'uncertain':'failed',...(outcome==='no_debit'?{failureBasis:'no_debit' as const,noDebitConfirmed:true}:outcome==='debit_returned'?{failureBasis:'debit_returned' as const,returnedDebitConfirmed:true,returnedAmountPaisa:80000}:{}),evidenceReference:'FICTIONAL-FIXED-ORIGINAL-OUTCOME',reason:'Retain the actual fictional original instruction outcome before reconciling its native source reservation.'});
 }
 await fixed.addFixedSupplyAdjustment(f.db,{recordId,actorId:'reviewer',kind:'defect',amountPaisa:20000,reason:'Approve the independently inspected original supply defect amount under its accepted supplier terms.',requestId:'recovery-approved-supply-defect',now:Date.now(),environment});
 const adjustmentId=String(f.sqlite.prepare('SELECT id FROM managed_supplier_adjustments WHERE obligation_id=?').get(recordId)!.id);
 return {...f,ctx,environment,sources,recordId,payoutId,packetId:packet.id,adjustmentId};
 }catch(error){f.dispose();throw error;}
}
