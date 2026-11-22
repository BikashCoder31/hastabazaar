import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout} from '../lib/managed-commerce/live-payout-operations';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
import {replaceLiveMakerBank} from './helpers/live-maker-current-proof-fixture';

async function expiresBeforeCommit(f:Awaited<ReturnType<typeof deliveredLiveFinancialFixture>>,kind:'bank'|'identity'){
 const expiry=Date.now()+60000;
 if(kind==='bank')f.sqlite.prepare("UPDATE seller_documents SET valid_until=? WHERE id=(SELECT b.document_id FROM seller_beneficiary_versions b JOIN seller_profiles s ON s.payout_account_reference='BENEFICIARY:'||b.id WHERE s.id=?)").run(expiry,f.sellerId);
 else{
  f.sqlite.prepare("UPDATE seller_documents SET valid_until=? WHERE seller_id=? AND kind IN('representative_identity','pan_certificate') AND status='verified'").run(expiry,f.sellerId);
  // Validity is initial test evidence. Genuinely reverify the bank before any
  // payout captures this identity revision; the tested race changes only time.
  await replaceLiveMakerBank(f,'expiry-initial-current-bank','Fictional Live Maker');
 }
 let raced=false;
 return {arm(){f.setBeforeBatch(()=>{raced=true;const now=expiry+1;f.sqlite.function('strftime',{varargs:true},(...args)=>args[0]==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));});},assertRaced(){assert.equal(raced,true,'The actual financial batch must cross the real retained validity boundary.');}};
}
void test('actual sent payout reconciliation remains available after current identity and bank documents expire',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
 await expiresBeforeCommit(f,'identity');const boundary=await expiresBeforeCommit(f,'bank');
 const native=await prepare(f),packet=await preparePayoutTransfer(f.db,f.ctx('sent-before-expiry'),{model:'managed',payoutId:native.id,accountVersionId:f.sources.accountVersionId,reason:'Prepare the original actual payout while current documents remain valid.'});
 await approvePayoutTransfer(f.db,f.ctx('sent-before-expiry-approved','0'),{packetId:packet.id,reason:'Approve the exact actual funding and current original beneficiary.'});
 await startPayoutTransfer(f.db,f.ctx('sent-before-expiry-started','1'),{packetId:packet.id,reason:'Record the original actual instruction as sent before expiry.'});
 boundary.arm();
 const ctx=f.ctx('sent-after-expiry-truthful','2'),input={packetId:packet.id,outcome:'paid' as const,amountPaisa:69000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-SENT-BEFORE-EXPIRY-DEBIT',evidenceReference:'FICTIONAL-ACTUAL-SENT-OUTCOME-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Retain truthful evidence of the original actual debit despite later document expiry.'};
 await recordPayoutTransferOutcome(f.db,ctx,input);boundary.assertRaced();await recordPayoutTransferOutcome(f.db,ctx,input);
 assert.equal(f.sqlite.prepare('SELECT state FROM payout_transfer_packets WHERE id=?').get(packet.id)!.state,'paid');
 }finally{f.dispose();}
});
async function prepare(f:Awaited<ReturnType<typeof deliveredLiveFinancialFixture>>){const p=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now());return prepareLiveManagedPayout(f.db,f.ctx('expiry-native-payout'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:p.amountPaisa,expectedSnapshot:p.snapshotDigest,reason:'Review this actual source before the independently retained evidence validity boundary.'});}
for(const kind of ['bank','identity'] as const){
 void test('live native preparation rejects '+kind+' evidence expiring while its transaction waits',async()=>{
  const f=await deliveredLiveFinancialFixture();try{const boundary=await expiresBeforeCommit(f,kind);boundary.arm();await assert.rejects(()=>prepare(f));boundary.assertRaced();assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_payouts').get()!.n,0);}finally{f.dispose();}
 });
 for(const stage of ['prepare','approve','start'] as const)void test('live transfer '+stage+' rejects '+kind+' evidence expiring at commit',async()=>{
  const f=await deliveredLiveFinancialFixture();try{
   const boundary=await expiresBeforeCommit(f,kind),native=await prepare(f),input={model:'managed' as const,payoutId:native.id,accountVersionId:f.sources.accountVersionId,reason:'Use only the actual original payout and currently valid verified source.'};
   let packet:{id:string}|undefined;
   if(stage!=='prepare')packet=await preparePayoutTransfer(f.db,f.ctx('expiry-packet'),input);
   if(stage==='start')await approvePayoutTransfer(f.db,f.ctx('expiry-approved','0'),{packetId:packet!.id,reason:'Approve the exact original actual source before its validity boundary.'});
   boundary.arm();
   await assert.rejects(()=>stage==='prepare'?preparePayoutTransfer(f.db,f.ctx('expiry-packet'),input):stage==='approve'?approvePayoutTransfer(f.db,f.ctx('expiry-approved','0'),{packetId:packet!.id,reason:'Approve the exact original actual source before its validity boundary.'}):startPayoutTransfer(f.db,f.ctx('expiry-started','1'),{packetId:packet!.id,reason:'Start only while the actual original identity and bank proof remain valid.'}));
   boundary.assertRaced();assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM payout_transfer_packets WHERE state='processing'").get()!.n,0);
  }finally{f.dispose();}
 });
}
