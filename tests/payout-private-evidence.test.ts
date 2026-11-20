import assert from 'node:assert/strict';
import test from 'node:test';
import {PNG} from 'pngjs';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {uploadFinanceEvidence,readFinanceEvidence} from '../lib/payments/refund-evidence';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
void test('a payout outcome accepts only private files bound to its original company source and denies foreign evidence access',async()=>{
 const f=await payoutTransferFixture();try{
 const objects=new Map<string,ArrayBuffer>(),bucket={async get(key:string){const value=objects.get(key);return value?{body:new Blob([value]).stream(),arrayBuffer:async()=>value}:null;},async put(key:string,value:ArrayBuffer){objects.set(key,value);}} as unknown as R2Bucket;
 const png=new PNG({width:2,height:2});png.data.fill(255);const bytes=new Uint8Array(PNG.sync.write(png)).buffer,file=new File([bytes],'bank-outcome.png',{type:'image/png'});
 const wrong=await uploadFinanceEvidence(f.db,bucket,f.ctx('wrong-payout-evidence'),{kind:'obligation',id:f.obligationId},file,'staff');
 const packet=await preparePayoutTransfer(f.db,f.ctx('evidence-payout-prepare'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Review original earnings and actual funding before one manual instruction.'});
 await approvePayoutTransfer(f.db,f.ctx('evidence-payout-approve','0'),{packetId:packet.id,reason:'Approve this exact source and beneficiary as the eligible Super Admin.'});
 await startPayoutTransfer(f.db,f.ctx('evidence-payout-start','1'),{packetId:packet.id,reason:'Record one fictional manual instruction without calling any real bank.'});
 const input={packetId:packet.id,outcome:'paid' as const,amountPaisa:20000,bankAt:Date.now(),transactionIdentity:'FICTIONAL-PRIVATE-EVIDENCED-PAYOUT',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Independently verify the completed original debit and exact retained beneficiary.',evidenceReference:wrong.id};
 await assert.rejects(recordPayoutTransferOutcome(f.db,f.ctx('wrong-evidence-outcome','2'),input));
 assert.equal(f.sqlite.prepare('SELECT state FROM payout_transfer_packets WHERE id=?').get(packet.id)!.state,'processing');
 const evidence=await uploadFinanceEvidence(f.db,bucket,f.ctx('right-payout-evidence'),{kind:'company_account',id:f.accountVersionId},file,'staff');
 await assert.rejects(readFinanceEvidence(f.db,bucket,'payout-owner',evidence.id,'staff'));
 await recordPayoutTransferOutcome(f.db,f.ctx('right-evidence-outcome','2'),{...input,evidenceReference:evidence.id});
 assert.equal(f.sqlite.prepare('SELECT state FROM payout_transfer_packets WHERE id=?').get(packet.id)!.state,'paid');
 const response=await readFinanceEvidence(f.db,bucket,'reviewer',evidence.id,'staff');assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control')!,/private.*no-store/);
 }finally{f.dispose();}
});
