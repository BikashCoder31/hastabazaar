import assert from 'node:assert/strict';
import test from 'node:test';
import {sellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';
import {openSellerRecovery} from '../lib/payments/seller-recovery';
import {readOriginalRecoveryPayoutProofs} from '../lib/payments/recovery-original-payouts';

for(const model of ['registered','managed','fixed'] as const)void test(`${model} original returned-money proof requires the exact retained actual paid source`,async()=>{
 const f=await(model==='registered'?sellerRecoveryFixture():model==='managed'?managedRecoveryFixture():fixedRecoveryFixture());try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const source='adjustmentId'in f?{kind:'supplier_adjustment' as const,id:f.adjustmentId}:{kind:'refund' as const,id:f.refundId};
  const opened=await openSellerRecovery(f.db,f.ctx('original-payout-proof-open'),{...source,reason:'Inspect the retained original paid source before handling any returned bank money.'});
  const rows=await readOriginalRecoveryPayoutProofs(f.db,opened.id);
  assert.equal(rows.length,1);assert.equal(rows[0].model,model);assert.ok(rows[0].scopePaisa>0);assert.ok(rows[0].originalPayoutPaisa>0);
  const packet=f.sqlite.prepare('SELECT * FROM payout_transfer_packets WHERE id=?').get(rows[0].packetId)!;
  assert.equal(rows[0].originalPayoutPaisa,packet.amount_paisa);assert.equal(packet.state,'paid');
  const receipt=f.sqlite.prepare('SELECT * FROM company_outgoing_bank_identities WHERE packet_id=?').get(rows[0].packetId)!;
  assert.equal(receipt.amount_paisa,rows[0].originalPayoutPaisa);assert.equal(receipt.account_version_id,packet.account_version_id);
  assert.deepEqual(await readOriginalRecoveryPayoutProofs(f.db,'missing-recovery-case'),[]);
 }finally{f.dispose();}
});
void test('an uncertain original instruction is not proof of returned paid principal',async()=>{
 const f=await fixedRecoveryFixture('uncertain');try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const opened=await openSellerRecovery(f.db,f.ctx('unknown-original-return-proof'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Inspect the unknown original instruction without inventing an actual completed payment.'});
  assert.deepEqual(await readOriginalRecoveryPayoutProofs(f.db,opened.id),[]);
 }finally{f.dispose();}
});
