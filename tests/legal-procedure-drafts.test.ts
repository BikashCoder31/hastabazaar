import assert from 'node:assert/strict';
import test from 'node:test';
import { legalProcedureFixture } from './helpers/legal-procedure-fixture';
import { getLegalDraftWorkspace, getLegalDraftRevision, saveLegalDraft } from '../lib/legal-procedures/repository';
import { validateLegalDraftInput } from '../lib/legal-procedures/model';
import { getLegalPolicyDocument, SELLER_AGREEMENT_VERSION, CUSTOMER_POLICY_VERSION } from '../lib/content/legal-policies';

const now = Date.parse('2026-10-18T16:00:00Z');
function input(current: Awaited<ReturnType<typeof getLegalDraftWorkspace>>['current'], requestId = crypto.randomUUID()) {
  return { expectedRevision: current.revision, expectedSha256: current.sha256,
    sections: current.sections.map(section => ({ id: section.id, body: section.body })),
    reason: 'Refresh the internal draft for review.', requestId };
}

void test('save appends an attributed draft snapshot, retaining all existing data, public policies and history', async () => {
  const f = await legalProcedureFixture(true);
  try {
    for (const table of ['orders', 'order_items', 'managed_commercial_snapshots', 'managed_entitlements', 'managed_settlement_entries'])
      assert.ok(Number(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n) > 0, `Preservation fixture must contain ${table}`);
    const before = f.fingerprint();
    const oldAudit = f.sqlite.prepare("SELECT * FROM audit_logs WHERE id='retained-event'").get();
    const publicBefore = [getLegalPolicyDocument('terms'), getLegalPolicyDocument('seller-agreement', 900),
      SELLER_AGREEMENT_VERSION, CUSTOMER_POLICY_VERSION];
    const first = await getLegalDraftWorkspace(f.db);
    assert.equal(first.current.status, 'draft');
    assert.equal(first.current.company.pan, '624749646');
    assert.equal(first.current.company.legalName, 'Hasta Bazaar Private Limited');
    assert.equal(first.current.company.registrationNumber, '406171/83/84');
    assert.equal(first.current.approvedAt, null);
    assert.equal(first.current.effectiveAt, null);
    const saved = await saveLegalDraft(f.db, f.actor, input(first.current), now);
    assert.equal(saved.revision, 1);
    assert.equal(saved.actorId, f.actor.id);
    assert.equal(saved.savedAt, now);
    assert.equal(saved.status, 'draft');
    const row = f.sqlite.prepare('SELECT * FROM audit_logs WHERE id=?').get(saved.id)!;
    assert.deepEqual(JSON.parse(String(row.previous_json)), first.current);
    assert.deepEqual(JSON.parse(String(row.next_json)), saved);
    const secondInput = input(saved);
    secondInput.sections[0].body += '\nFictional review note.';
    const second = await saveLegalDraft(f.db, f.actor, secondInput, now + 1);
    assert.equal(second.revision, 2);
    assert.notEqual(second.sha256, saved.sha256);
    assert.deepEqual(await getLegalDraftRevision(f.db, 1), saved);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM audit_logs WHERE id=?').get(saved.id), row);
    assert.deepEqual(f.sqlite.prepare("SELECT * FROM audit_logs WHERE id='retained-event'").get(), oldAudit);
    assert.equal(f.fingerprint(), before);
    assert.deepEqual([getLegalPolicyDocument('terms'), getLegalPolicyDocument('seller-agreement', 900),
      SELLER_AGREEMENT_VERSION, CUSTOMER_POLICY_VERSION], publicBefore);
  } finally { f.dispose(); }
});

void test('competing saves share a unique revision slot and stale or mismatched bases cannot overwrite it', async () => {
  const f = await legalProcedureFixture();
  try {
    const { current } = await getLegalDraftWorkspace(f.db);
    const a = input(current), b = input(current);
    a.sections[0].body += '\nFirst editor.'; b.sections[0].body += '\nSecond editor.';
    const results = await Promise.allSettled([saveLegalDraft(f.db, f.actor, a, now), saveLegalDraft(f.db, f.actor, b, now)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    const latest = (await getLegalDraftWorkspace(f.db)).current;
    assert.equal(latest.revision, 1);
    await assert.rejects(() => saveLegalDraft(f.db, f.actor, input(current), now + 1), /changed|newer/i);
    await assert.rejects(() => saveLegalDraft(f.db, f.actor, { ...input(latest), expectedSha256: 'a'.repeat(64) }, now + 1), /changed|newer/i);
  } finally { f.dispose(); }
});

void test('retry identity is bound to the actor, reason, base and exact normalized draft', async () => {
  const f = await legalProcedureFixture();
  try {
    const { current } = await getLegalDraftWorkspace(f.db), data = input(current);
    const saved = await saveLegalDraft(f.db, f.actor, data, now);
    assert.deepEqual(await saveLegalDraft(f.db, f.actor, data, now + 10), saved);
    f.sqlite.prepare(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at)
      VALUES ('second-super','second-super-subject','second@example.test','Second Super','active',1,1)`).run();
    f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('second-super','super_admin',1)").run();
    await assert.rejects(() => saveLegalDraft(f.db, { id: 'second-super', authSubject: 'second-super-subject', displayName: 'Second Super' }, data, now + 1), /request|retry/i);
    for (const changed of [{ ...data, reason: 'A different reason for this save.' },
      { ...data, expectedRevision: 1 }, { ...data, sections: data.sections.map((s, i) => i ? s : { ...s, body: 'Different content.' }) }])
      await assert.rejects(() => saveLegalDraft(f.db, f.actor, changed, now + 1), /request|retry/i);
    assert.equal((f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='legal_procedure.draft_saved'").get() as { n: number }).n, 1);
  } finally { f.dispose(); }
});

void test('simultaneous exact retries resolve to the same immutable saved revision', async () => {
  const f = await legalProcedureFixture();
  try {
    const { current } = await getLegalDraftWorkspace(f.db), data = input(current);
    const [first, second] = await Promise.all([saveLegalDraft(f.db, f.actor, data, now), saveLegalDraft(f.db, f.actor, data, now + 1)]);
    assert.deepEqual(first, second);
    assert.equal((await getLegalDraftWorkspace(f.db)).history.length, 1);
  } finally { f.dispose(); }
});

void test('a retry that observes the first commit between replay lookup and latest retrieval still succeeds', async () => {
  const f = await legalProcedureFixture();
  try {
    const { current } = await getLegalDraftWorkspace(f.db), data = input(current);
    let committed: Awaited<ReturnType<typeof saveLegalDraft>> | undefined;
    const wrapped = { prepare(sql: string) {
      const statement = f.db.prepare(sql), first = statement.first.bind(statement);
      if (sql.includes('ORDER BY length(id) DESC,id DESC LIMIT 1')) statement.first = async <T>() => {
        committed = await saveLegalDraft(f.db, f.actor, data, now);
        return first<T>();
      };
      return statement;
    } } as D1Database;
    assert.deepEqual(await saveLegalDraft(wrapped, f.actor, data, now + 1), committed);
  } finally { f.dispose(); }
});

void test('authority revoked immediately before the actual append prevents a save', async () => {
  const f = await legalProcedureFixture();
  try {
    const { current } = await getLegalDraftWorkspace(f.db);
    const wrapped = { prepare(sql: string) {
      const statement = f.db.prepare(sql), run = statement.run.bind(statement);
      if (sql.startsWith('INSERT INTO audit_logs')) statement.run = async <T>() => {
        f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='legal-super'").run();
        return run<T>();
      };
      return statement;
    } } as D1Database;
    await assert.rejects(() => saveLegalDraft(wrapped, f.actor, input(current), now), /Super Admin/i);
    assert.equal((await getLegalDraftWorkspace(f.db)).history.length, 0);
  } finally { f.dispose(); }
});

void test('history rejects altered author metadata even when section text was left unchanged', async () => {
  const f = await legalProcedureFixture();
  try {
    const { current } = await getLegalDraftWorkspace(f.db);
    const saved = await saveLegalDraft(f.db, f.actor, input(current), now);
    f.sqlite.prepare('UPDATE audit_logs SET next_json=? WHERE id=?').run(JSON.stringify({ ...saved, actorName: 'False Author' }), saved.id);
    await assert.rejects(() => getLegalDraftWorkspace(f.db), /stored|fingerprint|unavailable/i);
  } finally { f.dispose(); }
});

void test('repository rejects revoked, disabled or mismatched current Super Admin identities', async () => {
  const f = await legalProcedureFixture();
  try {
    const { current } = await getLegalDraftWorkspace(f.db);
    for (const actor of [{ ...f.actor, authSubject: 'wrong-subject' },
      { id: 'legal-admin', authSubject: 'legal-admin-subject', displayName: 'Admin' },
      { id: 'legal-disabled', authSubject: 'legal-disabled-subject', displayName: 'Disabled' }])
      await assert.rejects(() => saveLegalDraft(f.db, actor, input(current), now), /Super Admin/i);
    f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='legal-super'").run();
    await assert.rejects(() => saveLegalDraft(f.db, f.actor, input(current), now), /Super Admin/i);
    assert.equal((await getLegalDraftWorkspace(f.db)).history.length, 0);
  } finally { f.dispose(); }
});

void test('stored corruption fails closed and missing historical revisions are not replaced with current content', async () => {
  const f = await legalProcedureFixture();
  try {
    const { current } = await getLegalDraftWorkspace(f.db);
    assert.equal(await getLegalDraftRevision(f.db, 8), null);
    const saved = await saveLegalDraft(f.db, f.actor, input(current), now);
    const tampered = { ...saved, sha256: '0'.repeat(64) };
    f.sqlite.prepare('UPDATE audit_logs SET next_json=? WHERE id=?').run(JSON.stringify(tampered), saved.id);
    await assert.rejects(() => getLegalDraftWorkspace(f.db), /stored|unavailable|fingerprint/i);
    await assert.rejects(() => getLegalDraftRevision(f.db, 1), /stored|unavailable|fingerprint/i);
  } finally { f.dispose(); }
});

void test('validation keeps section IDs fixed and refuses approval, publication, identity or malformed controls', async () => {
  const f = await legalProcedureFixture();
  try {
    const { current } = await getLegalDraftWorkspace(f.db), data = input(current);
    for (const bad of [{ ...data, status: 'published' }, { ...data, company: {} }, { ...data, approvedAt: now },
      { ...data, expectedRevision: -1 }, { ...data, expectedSha256: 'bad' }, { ...data, reason: ' ' },
      { ...data, requestId: '../unsafe' }, { ...data, sections: [] },
      { ...data, sections: data.sections.map((s, i) => i ? s : { ...s, id: 'other' }) },
      { ...data, sections: data.sections.map((s, i) => i ? s : { ...s, body: ' '.repeat(20) }) },
      { ...data, sections: data.sections.map((s, i) => i ? s : { ...s, body: 'x'.repeat(12001) }) }])
      assert.throws(() => validateLegalDraftInput(bad));
    assert.equal(validateLegalDraftInput(data).expectedRevision, 0);
  } finally { f.dispose(); }
});

void test('history is paginated by saved revision and old source drafts stay available', async () => {
  const f = await legalProcedureFixture();
  try {
    let { current } = await getLegalDraftWorkspace(f.db);
    for (let i = 1; i <= 22; i++) {
      const data = input(current); data.sections[0].body = 'Fictional revision ' + i;
      current = await saveLegalDraft(f.db, f.actor, data, now + i);
    }
    const first = await getLegalDraftWorkspace(f.db);
    assert.equal(first.history.length, 20); assert.equal(first.history[0].revision, 22);
    assert.equal(first.nextBeforeRevision, 3);
    const second = await getLegalDraftWorkspace(f.db, first.nextBeforeRevision!);
    assert.deepEqual(second.history.map(v => v.revision), [2, 1]);
    assert.equal(second.nextBeforeRevision, null);
    assert.equal((await getLegalDraftRevision(f.db, 0))?.revision, 0);
    assert.match(first.legacy.markdown, /Version:\*\* Draft 3\.0/);
  } finally { f.dispose(); }
});
