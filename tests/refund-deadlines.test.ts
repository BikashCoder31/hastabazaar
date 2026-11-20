import assert from 'node:assert/strict';
import test from 'node:test';
import {refundPacketFixture} from './helpers/refund-funding-fixture';
import {getReturnHandling,recordReturnHandling} from '../lib/returns/handling';

void test('a binding deadline cannot be established by a free-text reference while its trigger is unknown', async () => {
 const f = await refundPacketFixture();
 try {
  const savedDeadline = () => f.sqlite.prepare(`SELECT binding_due_at AS dueAt, revision
   FROM refund_obligation_deadlines WHERE obligation_id=?`).get(f.obligationId)!;
  const original = savedDeadline();
  assert.equal(original.dueAt, null);

  const authorizedAt = Number(f.sqlite.prepare('SELECT authorized_at FROM refund_obligations WHERE id=?')
   .get(f.obligationId)!.authorized_at);
  await assert.rejects(f.m.recordEarlierRefundDeadline(f.db,
   f.ctx('unverified-first-deadline', String(original.revision)), {
    obligationId: f.obligationId,
    dueAt: authorizedAt + 3600000,
    evidenceReference: 'FICTIONAL-UNVERIFIED-TEXT-ONLY',
    reason: 'Record a proposed binding date before the original trigger has been verified.',
   }), /verified trigger/i);

  assert.deepEqual(savedDeadline(), original);
  const event = f.sqlite.prepare(`SELECT id FROM refund_obligation_events
   WHERE obligation_id=? AND action='earlier_deadline_retained'`).get(f.obligationId);
  assert.equal(event, undefined);
 } finally {
  f.dispose();
 }
});

void test('refund initiation keeps the original saved target and an earlier binding date cannot be extended by handoff',async()=>{
 const f=await refundPacketFixture();try{
  const obligation=f.sqlite.prepare('SELECT authorized_at FROM refund_obligations WHERE id=?').get(f.obligationId)!;
  const first=f.sqlite.prepare('SELECT * FROM refund_obligation_deadlines WHERE obligation_id=?').get(f.obligationId)!;
  assert.equal(first.initiation_due_at,Number(obligation.authorized_at)+2*86400000);assert.equal(first.binding_due_at,null);
  const handling=(await getReturnHandling(f.db,f.caseId))!;
  await recordReturnHandling(f.db,f.ctx('deadline-no-return',String(handling.revision)),{caseId:f.caseId,action:'waive_return',quantity:1,occurredAt:handling.now,evidenceReference:'FICTIONAL-VERIFIED-NO-RETURN-DECISION',privateNote:'The original eligible Super Admin confirmed no physical return is required.',publicMessage:'No physical return is needed for your approved refund.'});
  assert.equal(f.sqlite.prepare('SELECT binding_due_at FROM refund_obligation_deadlines WHERE obligation_id=?').get(f.obligationId)!.binding_due_at,Number(obligation.authorized_at)+7*86400000);
  const path='../lib/payments/refund-obligations',m=await import(path);const earlier=Number(obligation.authorized_at)+3600000;
  const current=f.sqlite.prepare('SELECT revision FROM refund_obligation_deadlines WHERE obligation_id=?').get(f.obligationId)!;
  await m.recordEarlierRefundDeadline(f.db,f.ctx('original-earlier-deadline',String(current.revision)),{obligationId:f.obligationId,dueAt:earlier,evidenceReference:'FICTIONAL-RETAINED-EARLIER-BINDING-TERM',reason:'Retain the actual earlier original binding term without restarting the refund clock.'});
  const final=f.sqlite.prepare('SELECT * FROM refund_obligation_deadlines WHERE obligation_id=?').get(f.obligationId)!;assert.equal(final.initiation_due_at,first.initiation_due_at);assert.equal(final.binding_due_at,earlier);
  await assert.rejects(m.recordEarlierRefundDeadline(f.db,f.ctx('cannot-extend-deadline',String(final.revision)),{obligationId:f.obligationId,dueAt:earlier+1000,evidenceReference:'FICTIONAL-LATER-INTERNAL-HANDOFF',reason:'A later internal handoff cannot extend the original binding deadline.'}));
  assert.throws(()=>f.sqlite.prepare('UPDATE refund_obligation_deadlines SET binding_due_at=binding_due_at+1000,revision=revision+1 WHERE obligation_id=?').run(f.obligationId),/retained/);
 }finally{f.dispose();}
});
