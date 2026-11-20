import assert from 'node:assert/strict';
import test from 'node:test';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout} from '../lib/managed-commerce/live-payout-operations';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
import {readSellerWorkspaceTasks,readSellerLivePayoutHistory} from '../lib/seller/workspace-tasks';
void test('owned actual live payout remains approved or processing until real completed-bank evidence, with one exact finance anchor',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  const actorId=String(f.sqlite.prepare('SELECT user_id FROM seller_profiles WHERE id=?').get(f.sellerId)!.user_id),preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now());
  const payout=await prepareLiveManagedPayout(f.db,f.ctx('workspace-live-payout'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'Prepare the original actual eligible maker amount without claiming bank completion.'});
  let history=await readSellerLivePayoutHistory(f.db,actorId,f.sellerId);assert.equal(history.find(row=>row.id===payout.id)!.status,'approved');
  const task=(await readSellerWorkspaceTasks(f.db,actorId)).tasks.find(row=>row.sourceId===payout.id);assert.ok(task);assert.equal(task.href,'/seller/finance#live-payout-'+payout.id);assert.equal(task.sellerActionRequired,false);assert.notEqual(task.status,'paid');
  const packet=await preparePayoutTransfer(f.db,f.ctx('workspace-packet'),{model:'managed',payoutId:payout.id,accountVersionId:f.sources.accountVersionId,reason:'Bind the original payout to independently verified fictional company funds.'});
  await approvePayoutTransfer(f.db,f.ctx('workspace-packet-approve','0'),{packetId:packet.id,reason:'Review the exact original beneficiary and funded instruction.'});await startPayoutTransfer(f.db,f.ctx('workspace-packet-start','1'),{packetId:packet.id,reason:'Record the actual one fictional manual instruction, with no paid claim.'});
  history=await readSellerLivePayoutHistory(f.db,actorId,f.sellerId);assert.equal(history.find(row=>row.id===payout.id)!.status,'processing');
  await recordPayoutTransferOutcome(f.db,f.ctx('workspace-packet-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:preview.amountPaisa,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-WORKSPACE-LIVE-DEBIT',evidenceReference:'FICTIONAL-PRIVATE-WORKSPACE-BANK-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Independently confirm the actual fictional completed original bank debit.'});
  history=await readSellerLivePayoutHistory(f.db,actorId,f.sellerId);assert.equal(history.find(row=>row.id===payout.id)!.status,'paid');assert.doesNotMatch(JSON.stringify(history),/FICTIONAL-PRIVATE|accountVersion|evidenceReference/);
  assert.equal((await readSellerWorkspaceTasks(f.db,actorId)).tasks.some(row=>row.sourceId===payout.id),false);assert.equal((await readSellerWorkspaceTasks(f.db,actorId,{view:'all'})).tasks.find(row=>row.sourceId===payout.id)!.group,'history');
 }finally{f.dispose();}
});
