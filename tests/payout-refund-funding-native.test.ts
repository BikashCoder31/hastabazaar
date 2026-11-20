import assert from 'node:assert/strict';
import test from 'node:test';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {preparePayoutTransfer,approvePayoutTransfer} from '../lib/payments/payout-transfers';
void test('native D1 competing payout and refund approval share one actual fund balance and leave an owned shortage',async()=>{
 const source=await payoutTransferFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{target=await nativeFinanceClone(source.sqlite);const {db}=target;
 const payout=await preparePayoutTransfer(db,source.ctx('race-payout-prepare'),{model:'registered',payoutId:source.payoutId,accountVersionId:source.accountVersionId,reason:'Prepare the actual payout against the same original company funds.'});
 const refund=await source.m.prepareRefundPacket(db,source.ctx('race-refund-prepare','0'),{obligationId:source.obligationId,destinationVersionId:source.destinationId,fundingStatementId:source.fundingId,reason:'Prepare original customer entitlement against the shared company funds.'});
 const outcomes=await Promise.allSettled([approvePayoutTransfer(db,source.ctx('race-payout-approve','0'),{packetId:payout.id,reason:'Only current free funds may be reserved for the original payout.'}),source.m.approveRefundPacket(db,source.ctx('race-refund-approve','0'),{packetId:refund.id,reason:'Only current free funds may be reserved for the original refund.'})]);
 const counts=await db.prepare("SELECT (SELECT COUNT(*) FROM payout_transfer_packets WHERE state='approved')+(SELECT COUNT(*) FROM outgoing_payment_packets WHERE state='approved') AS n").first<{n:number}>();assert.equal(counts!.n,1);
 assert.ok((await source.m.getRefundFundingAvailability(db,source.accountVersionId)).availablePaisa>=0);
 assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,2,'Both callers receive a saved approval or owned shortage, never an unexplained race error.');
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE kind IN('payout_funding','refund_funding') AND state='open' AND owner_id='reviewer'").first<{n:number}>())!.n,1);
 await assert.rejects(db.prepare("UPDATE payouts SET status='paid',processed_by='reviewer' WHERE id=?").bind(source.payoutId).run(),/payout_requires_actual_execution_packet/);
 }finally{await target?.dispose();source.dispose();}
});
