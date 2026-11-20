import assert from 'node:assert/strict';
import test from 'node:test';
import {refundPacketFixture} from './helpers/refund-funding-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';

void test('native D1 competing refund approvals cannot spend one funding balance twice or change the original obligation',async()=>{
 const source=await refundPacketFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  target=await nativeFinanceClone(source.sqlite);const {db}=target,{m}=source;
  const original=await m.prepareRefundPacket(db,source.ctx('native-original-prepare','0'),{obligationId:source.obligationId,destinationVersionId:source.destinationId,fundingStatementId:source.fundingId,reason:'Prepare the original native refund against the exact funding statement.'});
  const excess=await m.openRefundObligation(db,source.ctx('native-excess-open'),{kind:'receipt_return',sourceId:source.receiptId,reason:'Preserve the separately identified original payer excess in native D1.'});
  const destination=await m.submitRefundDestination(db,{...source.ctx('native-excess-destination'),actorId:'customer',sessionHash:'FICTIONAL-PACKET-SESSION'},{obligationId:excess.id,details:{holder:'Fictional Buyer',bank:'Fictional Bank',branch:'Fictional Branch',accountNumber:'TEST-EXCESS-001',currency:'NPR'},relationship:'own_account',authorization:'I explicitly authorize return of this actual excess to my own account.',evidenceReference:'FICTIONAL-EXCESS-OWNERSHIP-EVIDENCE',reason:'Use a separately verified destination for this original excess obligation.'});
  await m.verifyRefundDestination(db,source.ctx('native-excess-verify','0'),{versionId:destination.id,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-NATIVE-EXCESS-VERIFICATION',reason:'Verify ownership and exact relationship before the excess return.'});
  const second=await m.prepareRefundPacket(db,source.ctx('native-excess-prepare','0'),{obligationId:excess.id,destinationVersionId:destination.id,fundingStatementId:source.fundingId,reason:'Prepare the actual excess without consuming another customer reservation.'});
  const outcomes=await Promise.allSettled([original,second].map((packet,i)=>m.approveRefundPacket(db,source.ctx('native-funding-race-'+i,'0'),{packetId:packet.id,reason:'Approve only available original company funds under native concurrency.'})));
  const packets=(await db.prepare("SELECT id,state,amount_paisa amount FROM outgoing_payment_packets WHERE state='approved'").all<{id:string;state:string;amount:number}>()).results;
  assert.equal(packets.length,1);assert.ok(packets[0].amount<=60000);assert.ok(outcomes.some(result=>result.status==='fulfilled'));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM refund_obligations').first<{n:number}>())!.n,2);
  assert.equal((await db.prepare('SELECT status FROM refunds WHERE id=?').bind(source.refundId).first<{status:string}>())!.status,'approved');
  await assert.rejects(db.prepare("UPDATE refunds SET status='paid',processed_by='reviewer' WHERE id=?").bind(source.refundId).run(),/refund_requires_actual_execution_packet/);
 }finally{await target?.dispose();source.dispose();}
});
