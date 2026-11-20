import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout} from '../lib/managed-commerce/live-payout-operations';
import * as transfers from '../lib/payments/payout-transfers';

void test('actual original buyer with a Super Admin role cannot prepare the payout of their own selected purchase',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.buyerId);
 f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(f.ownerId,f.orderId);
 const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now());
 await assert.rejects(()=>prepareLiveManagedPayout(f.db,{...f.ctx('buyer-cannot-prepare-live'),actorId:f.buyerId},{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'A staff role must not override personal interest in this exact original purchase.'}),e=>e instanceof Error&&'status' in e&&e.status===403);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_payouts').get()!.n,0);
 }finally{f.dispose();}
});
void test('native original buyer role cannot forge bank approval around application party checks',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
 const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now()),native=await prepareLiveManagedPayout(f.db,f.ctx('native-party-source'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'An eligible independent reviewer prepares this exact actual native source.'});
 const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('native-party-packet'),{model:'managed',payoutId:native.id,accountVersionId:f.sources.accountVersionId,reason:'Prepare the exact original bank instruction with current independently verified sources.'});
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.buyerId);
 f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(f.ownerId,f.orderId);
 assert.throws(()=>f.sqlite.prepare("UPDATE payout_transfer_packets SET state='approved',revision=revision+1,approved_by=?,approved_at=? WHERE id=?").run(f.buyerId,Date.now(),packet.id),/managed_live.*party|managed_live.*independent/);
 }finally{f.dispose();}
});
void test('actual buyer cannot approve their original bank packet even when a different eligible reviewer prepared it',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
 const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now()),native=await prepareLiveManagedPayout(f.db,f.ctx('party-safe-native'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'An eligible independent reviewer prepares the exact original actual source.'});
 const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('party-safe-packet'),{model:'managed',payoutId:native.id,accountVersionId:f.sources.accountVersionId,reason:'Prepare the actual original instruction independently of its customer.'});
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.buyerId);
 f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(f.ownerId,f.orderId);
 await assert.rejects(()=>transfers.approvePayoutTransfer(f.db,{...f.ctx('buyer-cannot-approve','0'),actorId:f.buyerId},{packetId:packet.id,reason:'The original customer is still personally interested despite a staff role.'}),e=>e instanceof Error&&'status' in e&&e.status===403);
 assert.equal(f.sqlite.prepare('SELECT state FROM payout_transfer_packets WHERE id=?').get(packet.id)!.state,'prepared');
 }finally{f.dispose();}
});

