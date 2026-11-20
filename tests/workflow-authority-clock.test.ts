import assert from 'node:assert/strict';
import test from 'node:test';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { requestDocumentChange,reviewDocumentChange } from '../lib/sellers/document-review';

async function changeRequest(f: Awaited<ReturnType<typeof completeVersionFixture>>) {
  const docId = String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker'").get()?.id);
  f.sqlite.prepare("UPDATE seller_documents SET status='verified' WHERE id=?").run(docId);
  const requestId = await requestDocumentChange(f.db, { sellerId: 'maker', documentId: docId, actorId: 'maker-user', reason: 'Fictional renewed identity evidence', now: f.now });
  return { docId, requestId };
}

async function workflow() {
  const path = '../lib/workflows/review-tasks';
  const clockPath = '../lib/workflows/service-clock';
  const tasks = await import(path).catch(() => null);
  const clock = await import(clockPath).catch(() => null);
  assert.equal(typeof clock?.calculateServiceDueAt, 'function', 'saved service calendar required');
  assert.equal(typeof tasks?.assignReviewTask, 'function', 'guarded assignment required');
  return { ...tasks, ...clock };
}

void test('continuous service days and staffed hours retain elapsed deadlines across nights and weekends', async () => {
  const w = await workflow();
  const startedAt = Date.parse('2026-11-06T20:15:00Z');
  for (const [amount, delta] of [[1, 86400000], [2, 172800000], [3, 259200000]]) {
    assert.equal(w.calculateServiceDueAt({ startedAt, amount, unit: 'service_day', calendarVersion: 'continuous-v1' }), startedAt + delta);
  }
  assert.equal(w.calculateServiceDueAt({ startedAt, amount: 4, unit: 'staffed_hour', calendarVersion: 'continuous-v1' }), startedAt + 14400000);
  for (const amount of [-1, NaN, Infinity]) assert.throws(() => w.calculateServiceDueAt({ startedAt, amount, unit: 'service_day', calendarVersion: 'continuous-v1' }));
  assert.throws(() => w.calculateServiceDueAt({ startedAt, amount: 1, unit: 'service_day', calendarVersion: 'unapproved-future' }));
  assert.equal(w.nextFinanceCheckpoint(Date.parse('2026-11-01T08:14:00Z'), 'payout_review'), Date.parse('2026-11-01T08:15:00Z'));
  assert.equal(w.nextFinanceCheckpoint(Date.parse('2026-11-01T12:16:00Z'), 'reconciliation'), Date.parse('2026-11-02T12:15:00Z'));
});

void test('assignment preserves original deadline and cannot complete evidence review or grant private access', async () => {
  const w = await workflow();
  const f = await completeVersionFixture();
  try {
    const { docId, requestId } = await changeRequest(f);
    const taskId = await w.ensureReviewTask(f.db, { sourceType: 'document_change', sourceId: requestId, now: f.now });
    const context = { actorId: 'reviewer', requestId: 'assign-first', expectedRevision: '0', now: f.now + 10 };
    await w.assignReviewTask(f.db, context, { taskId, ownerId: 'reviewer', reason: 'Cover the verified-document queue' });
    let rows = (await w.listReviewTasks(f.db, 'reviewer')).filter((row:{sourceType:string})=>row.sourceType==='document_change');
    assert.equal(rows[0].dueAt, f.now + 86400000);
    assert.equal(rows[0].status, 'awaiting_review');
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(docId)?.status, 'verified');
    assert.deepEqual(await w.listReviewTasks(f.db, 'delegate'), []);
    const owned = (await w.listSellerReviewTasks(f.db, 'maker-user')).filter((row:{sourceType:string})=>row.sourceType==='document_change');
    assert.equal(owned.length, 1);
    assert.equal(owned[0].id, taskId);
    assert.equal(owned[0].dueAt, rows[0].dueAt);
    assert.equal(owned[0].status, rows[0].status);
    assert.equal(owned[0].nextActor, 'Hastabazaar');
    assert.ok(!('ownerId' in owned[0]), 'Private staff identity is not part of the seller task view.');
    assert.deepEqual(await w.listSellerReviewTasks(f.db, 'foreign'), []);
    await assert.rejects(w.listReviewTasks(f.db, 'foreign'));
    await assert.rejects(w.assignReviewTask(f.db, { ...context, requestId: 'wrong-owner', expectedRevision: '1' }, { taskId, ownerId: 'delegate', reason: 'Attempt private evidence assignment' }));
    await assert.rejects(w.assignReviewTask(f.db, { ...context, actorId: 'maker-user', requestId: 'self' }, { taskId, ownerId: 'maker-user', reason: 'Attempt self review' }));
    await assert.rejects(w.assignReviewTask(f.db, { ...context, requestId: 'stale' }, { taskId, ownerId: null, reason: 'A stale reassignment must fail' }));
    await w.assignReviewTask(f.db, { ...context, requestId: 'unassign', expectedRevision: '1' }, { taskId, ownerId: null, reason: 'Reserved stage has no available backup' });
    rows = (await w.listReviewTasks(f.db, 'reviewer')).filter((row:{sourceType:string})=>row.sourceType==='document_change');
    assert.equal(rows[0].dueAt, f.now + 86400000);
    assert.equal(rows[0].ownerId, null);
    assert.equal(rows[0].status, 'awaiting_review');
  } finally { f.dispose(); }
});

void test('permission revocation during assignment rolls back ownership and its audit receipt', async () => {
  const w = await workflow();
  const f = await completeVersionFixture();
  try {
    const { requestId } = await changeRequest(f);
    const taskId = await w.ensureReviewTask(f.db, { sourceType: 'document_change', sourceId: requestId, now: f.now });
    f.setBeforeBatch(() => { f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run(); });
    await assert.rejects(w.assignReviewTask(f.db, { actorId: 'reviewer', requestId: 'revoked', expectedRevision: '0', now: f.now + 1 },
      { taskId, ownerId: 'reviewer', reason: 'Permission revoked while request is in flight' }));
    assert.equal(f.sqlite.prepare('SELECT owner_id FROM review_tasks WHERE id=?').get(taskId)?.owner_id, null);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='revoked'").get()?.n, 0);
  } finally { f.dispose(); }
});

void test('routing uses an available eligible backup and exposes a gap when the sole eligible admin is absent', async () => {
  const w = await workflow();
  const f = await completeVersionFixture();
  try {
    const { requestId } = await changeRequest(f);
    const input = { sourceType: 'document_change', sourceId: requestId };
    assert.equal(await w.selectReviewOwner(f.db, input, [
      { userId: 'delegate', available: true }, { userId: 'reviewer', available: true },
    ]), 'reviewer');
    assert.equal(await w.selectReviewOwner(f.db, input, [
      { userId: 'reviewer', available: false }, { userId: 'reviewer', available: true }, { userId: 'delegate', available: true },
    ]), null, 'A duplicate self backup cannot cover the primary absence');
    f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('maker-user','super_admin',1)").run();
    assert.equal(await w.selectReviewOwner(f.db, input, [{ userId: 'maker-user', available: true }]), null);
    await w.ensureReviewTask(f.db, { ...input, now: f.now });
    await reviewDocumentChange(f.db,{requestId,decision:'reject',actorId:'reviewer',reason:'Reject the proposed replacement; current holds require their own disposition',now:f.now+1});
    const rows = (await w.listReviewTasks(f.db, 'reviewer')).filter((row:{sourceType:string})=>row.sourceType==='document_change');
    assert.equal(rows[0].status, 'awaiting_review','Rejection does not resolve independent capability holds');
    assert.equal(rows[0].sourceStatus, 'rejected');
    assert.equal(rows[0].dueAt, f.now + 86400000);
    assert.equal(rows[0].triagedAt,f.now+1);
  } finally { f.dispose(); }
});
