import assert from 'node:assert/strict';
import test from 'node:test';
import * as legal from '../lib/legal-procedures/repository';
import { legalProcedureFixture } from './helpers/legal-procedure-fixture';

const now = Date.parse('2026-10-19T10:00:00+05:45');
async function savedFixture() {
  assert.equal(typeof legal.changeLegalProcedureControl, 'function', 'An actual approval and activation workflow is required.');
  const f = await legalProcedureFixture();
  const { current } = await legal.getLegalDraftWorkspace(f.db);
  const saved = await legal.saveLegalDraft(f.db, f.actor, { expectedRevision: current.revision,
    expectedSha256: current.sha256, sections: current.sections, reason: 'Save operating instructions for approval.', requestId: crypto.randomUUID() }, now);
  return { ...f, saved };
}
function command(state: { sequence: number; sha256: string }, document: { revision: number; sha256: string }, operation = 'approve', extra = {}) {
  return { operation, expectedSequence: state.sequence, expectedSha256: state.sha256,
    revision: document.revision, documentSha256: document.sha256, approvalSequence: null,
    effectiveFrom: null, confirmed: true, reason: 'Reviewed the complete operating procedure.', requestId: crypto.randomUUID(), ...extra };
}

void test('approval is separate from activation, and approval alone never exposes a procedure to staff', async () => {
  const f = await savedFixture();
  try {
    const before = f.fingerprint(), state = await legal.getLegalProcedureControl(f.db, now);
    assert.equal(state.active, null);
    const approved = await legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved), now);
    const next = await legal.getLegalProcedureControl(f.db, now);
    assert.equal(next.active, null); assert.equal(next.approval?.sequence, approved.sequence);
    assert.equal(approved.actorName, 'legal-super'); assert.equal(approved.document.sha256, f.saved.sha256);
    assert.equal(f.fingerprint(), before);
  } finally { f.dispose(); }
});

void test('activation exposes only the exact approved snapshot and later edits leave it unchanged', async () => {
  const f = await savedFixture();
  try {
    let state = await legal.getLegalProcedureControl(f.db, now);
    const approved = await legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved), now);
    state = await legal.getLegalProcedureControl(f.db, now);
    const active = await legal.changeLegalProcedureControl(f.db, f.actor,
      command(state, f.saved, 'activate', { approvalSequence: approved.sequence }), now + 1);
    const saved = await legal.saveLegalDraft(f.db, f.actor, { expectedRevision: f.saved.revision, expectedSha256: f.saved.sha256,
      sections: f.saved.sections.map((s, i) => i ? s : { ...s, body: 'A later unapproved operating version.' }),
      reason: 'Prepare a separate new operating version.', requestId: crypto.randomUUID() }, now + 2);
    state = await legal.getLegalProcedureControl(f.db, now + 3);
    assert.equal(saved.revision, 2); assert.equal(state.active?.sequence, active.sequence);
    assert.equal(state.active?.document.sections[0].body, f.saved.sections[0].body);
    await assert.rejects(() => legal.changeLegalProcedureControl(f.db, f.actor,
      command(state, saved, 'activate', { approvalSequence: approved.sequence }), now + 3), /approv|version|changed/i);
  } finally { f.dispose(); }
});

void test('Nepal-time schedules become effective exactly on time, and withdrawal cancels future releases', async () => {
  const f = await savedFixture();
  try {
    let state = await legal.getLegalProcedureControl(f.db, now);
    const approved = await legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved), now);
    state = await legal.getLegalProcedureControl(f.db, now);
    await legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved, 'activate', {
      approvalSequence: approved.sequence, effectiveFrom: '2026-10-20T00:00' }), now);
    const due = Date.parse('2026-10-19T18:15:00Z');
    state = await legal.getLegalProcedureControl(f.db, due - 1);
    assert.equal(state.active, null); assert.equal(state.scheduled?.effectiveAt, due);
    assert.equal((await legal.getLegalProcedureControl(f.db, due)).active?.effectiveAt, due);
    await legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved, 'withdraw'), now + 1);
    state = await legal.getLegalProcedureControl(f.db, due + 1);
    assert.equal(state.active, null); assert.equal(state.scheduled, null); assert.equal(state.approval, null);
    assert.equal(state.history.length, 3);
  } finally { f.dispose(); }
});

void test('stale approval, malformed dates, backdating and unconfirmed activation cannot append events', async () => {
  const f = await savedFixture();
  try {
    let state = await legal.getLegalProcedureControl(f.db, now);
    await assert.rejects(() => legal.changeLegalProcedureControl(f.db, f.actor,
      command(state, f.saved, 'activate'), now), /approv/i);
    const approved = await legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved), now);
    await assert.rejects(() => legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved), now + 1), /changed|newer|stale/i);
    state = await legal.getLegalProcedureControl(f.db, now);
    for (const effectiveFrom of ['2026-02-30T10:00', '2026-10-18T10:00', '2026-10-20T24:00', '2026-10-20T10:00Z'])
      await assert.rejects(() => legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved, 'activate', {
        approvalSequence: approved.sequence, effectiveFrom }), now), /date|time|past|backdat/i);
    await assert.rejects(() => legal.changeLegalProcedureControl(f.db, f.actor,
      command(state, f.saved, 'activate', { approvalSequence: approved.sequence, confirmed: false }), now), /confirm/i);
    assert.equal((await legal.getLegalProcedureControl(f.db, now)).sequence, 1);
  } finally { f.dispose(); }
});

void test('exact retries are idempotent, changed retries fail and concurrent writers cannot both append', async () => {
  const f = await savedFixture();
  try {
    const state = await legal.getLegalProcedureControl(f.db, now), data = command(state, f.saved);
    const result = await legal.changeLegalProcedureControl(f.db, f.actor, data, now);
    assert.deepEqual(await legal.changeLegalProcedureControl(f.db, f.actor, data, now + 1), result);
    await assert.rejects(() => legal.changeLegalProcedureControl(f.db, f.actor, { ...data, reason: 'Changed retry should never succeed.' }, now), /retry|request/i);
    const next = await legal.getLegalProcedureControl(f.db, now);
    const results = await Promise.allSettled([1, 2].map(() => legal.changeLegalProcedureControl(f.db, f.actor,
      command(next, f.saved, 'activate', { approvalSequence: result.sequence }), now + 1)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await legal.getLegalProcedureControl(f.db, now + 1)).history.length, 2);
  } finally { f.dispose(); }
});

void test('revoked authority is rechecked at the append and no financial or agreement records change', async () => {
  const f = await savedFixture();
  try {
    const state = await legal.getLegalProcedureControl(f.db, now);
    let afterRevocation = '';
    const wrapped = { prepare(sql: string) {
      const statement = f.db.prepare(sql), run = statement.run.bind(statement);
      if (sql.startsWith('INSERT INTO audit_logs')) statement.run = async <T>() => {
        f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='legal-super'").run();
        afterRevocation = f.fingerprint();
        return run<T>();
      };
      return statement;
    } } as D1Database;
    await assert.rejects(() => legal.changeLegalProcedureControl(wrapped, f.actor, command(state, f.saved), now), /Super Admin/i);
    assert.ok(afterRevocation);
    assert.equal(f.fingerprint(), afterRevocation);
    assert.equal((await legal.getLegalProcedureControl(f.db, now)).sequence, 0);
  } finally { f.dispose(); }
});

void test('tampered lifecycle attribution or document snapshots fail closed', async () => {
  const f = await savedFixture();
  try {
    const state = await legal.getLegalProcedureControl(f.db, now);
    const approved = await legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved), now);
    f.sqlite.prepare('UPDATE audit_logs SET next_json=? WHERE id=?').run(JSON.stringify({ ...approved, actorName: 'False author' }), approved.id);
    await assert.rejects(() => legal.getLegalProcedureControl(f.db, now), /stored|fingerprint|unavailable/i);
  } finally { f.dispose(); }
});

void test('replacing a pending release does not secretly activate the older schedule', async () => {
  const f = await savedFixture();
  try {
    let document = f.saved, tick = now;
    async function release(effectiveFrom: string | null) {
      let state = await legal.getLegalProcedureControl(f.db, tick);
      const approved = await legal.changeLegalProcedureControl(f.db, f.actor, command(state, document), tick++);
      state = await legal.getLegalProcedureControl(f.db, tick);
      await legal.changeLegalProcedureControl(f.db, f.actor, command(state, document, 'activate', {
        approvalSequence: approved.sequence, effectiveFrom }), tick++);
    }
    async function edit() {
      document = await legal.saveLegalDraft(f.db, f.actor, { expectedRevision: document.revision, expectedSha256: document.sha256,
        sections: document.sections.map((s, i) => i ? s : { ...s, body: 'Changed operating version ' + (document.revision + 1) }),
        reason: 'Prepare the next operating instructions.', requestId: crypto.randomUUID() }, tick++);
    }
    await release(null); await edit(); await release('2026-10-20T10:00');
    await edit(); await release('2026-10-26T10:00');
    const interim = await legal.getLegalProcedureControl(f.db, Date.parse('2026-10-21T10:00:00+05:45'));
    assert.equal(interim.active?.document.revision, 1, 'The old pending version was replaced; it must never become effective.');
    assert.equal(interim.scheduled?.document.revision, 3);
    const final = await legal.getLegalProcedureControl(f.db, Date.parse('2026-10-26T10:00:00+05:45'));
    assert.equal(final.active?.document.revision, 3);
  } finally { f.dispose(); }
});

void test('approval and activation work when the database returns JSON string scalars with MariaDB quoting', async () => {
  const f = await savedFixture();
  try {
    f.sqlite.function('json_extract', (source, path) => {
      const value = JSON.parse(String(source))[String(path).slice(2)];
      return typeof value === 'string' ? JSON.stringify(value) : value ?? null;
    });
    f.sqlite.function('json_unquote', value => {
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch { return value; }
    });
    const db = Object.assign({}, f.db, { dialect: 'mariadb' });
    let state = await legal.getLegalProcedureControl(db, now);
    const approved = await legal.changeLegalProcedureControl(db, f.actor, command(state, f.saved), now);
    state = await legal.getLegalProcedureControl(db, now);
    assert.equal(state.approval?.sequence, approved.sequence);
    await legal.changeLegalProcedureControl(db, f.actor, command(state, f.saved, 'activate', { approvalSequence: approved.sequence }), now);
    assert.equal((await legal.getLegalProcedureControl(db, now)).active?.document.sha256, f.saved.sha256);
  } finally { f.dispose(); }
});

void test('clock rollback cannot append an approval older than the selected saved document', async () => {
  const f = await savedFixture();
  try {
    const document = await legal.saveLegalDraft(f.db, f.actor, { expectedRevision: f.saved.revision,
      expectedSha256: f.saved.sha256, sections: f.saved.sections, reason: 'Save after the approval request clock.', requestId: crypto.randomUUID() }, now + 1000);
    const state = await legal.getLegalProcedureControl(f.db, now);
    await assert.rejects(() => legal.changeLegalProcedureControl(f.db, f.actor, command(state, document), now), /clock|time|stored/i);
    assert.equal((await legal.getLegalProcedureControl(f.db, now + 1001)).sequence, 0);
  } finally { f.dispose(); }
});

void test('a newer working version saved immediately before the append blocks stale approval and activation', async () => {
  for (const operation of ['approve', 'activate']) {
    const f = await savedFixture();
    try {
      let state = await legal.getLegalProcedureControl(f.db, now), approvalSequence: number | null = null;
      if (operation === 'activate') {
        approvalSequence = (await legal.changeLegalProcedureControl(f.db, f.actor, command(state, f.saved), now)).sequence;
        state = await legal.getLegalProcedureControl(f.db, now);
      }
      let raced = false;
      const wrapped = { prepare(sql: string) {
        const statement = f.db.prepare(sql), run = statement.run.bind(statement);
        if (sql.startsWith('INSERT INTO audit_logs')) statement.run = async <T>() => {
          if (!raced) {
            raced = true;
            await legal.saveLegalDraft(f.db, f.actor, { expectedRevision: f.saved.revision, expectedSha256: f.saved.sha256,
              sections: f.saved.sections, reason: 'Save a newer working version during approval.', requestId: crypto.randomUUID() }, now + 1);
          }
          return run<T>();
        };
        return statement;
      } } as D1Database;
      await assert.rejects(() => legal.changeLegalProcedureControl(wrapped, f.actor,
        command(state, f.saved, operation, { approvalSequence }), now), /changed|version/i);
      assert.equal((await legal.getLegalProcedureControl(f.db, now + 1)).sequence, state.sequence);
      assert.equal((await legal.getLegalDraftWorkspace(f.db)).current.revision, 2);
    } finally { f.dispose(); }
  }
});

void test('an INSERT that commits then loses its response and simultaneous identical retries return one event', async () => {
  const f = await savedFixture();
  try {
    const state = await legal.getLegalProcedureControl(f.db, now), data = command(state, f.saved);
    let failed = false;
    const wrapped = { prepare(sql: string) {
      const statement = f.db.prepare(sql), run = statement.run.bind(statement);
      if (sql.startsWith('INSERT INTO audit_logs')) statement.run = async <T>() => {
        const result = await run<T>();
        if (!failed) { failed = true; throw new Error('The commit response was lost.'); }
        return result;
      };
      return statement;
    } } as D1Database;
    const first = await legal.changeLegalProcedureControl(wrapped, f.actor, data, now);
    const [a, b] = await Promise.all([legal.changeLegalProcedureControl(f.db, f.actor, data, now + 1),
      legal.changeLegalProcedureControl(f.db, f.actor, data, now + 2)]);
    assert.deepEqual(a, first); assert.deepEqual(b, first);
    assert.equal((await legal.getLegalProcedureControl(f.db, now + 2)).history.length, 1);
  } finally { f.dispose(); }
});

void test('approve activate withdraw preserves populated financial data and every retained audit and document snapshot', async () => {
  const f = await legalProcedureFixture(true);
  try {
    const source = (await legal.getLegalDraftWorkspace(f.db)).current;
    const document = await legal.saveLegalDraft(f.db, f.actor, { expectedRevision: source.revision, expectedSha256: source.sha256,
      sections: source.sections, reason: 'Save procedure alongside existing financial fixtures.', requestId: crypto.randomUUID() }, now);
    const before = f.fingerprint(), retained = f.sqlite.prepare('SELECT * FROM audit_logs ORDER BY id').all();
    let state = await legal.getLegalProcedureControl(f.db, now);
    const approved = await legal.changeLegalProcedureControl(f.db, f.actor, command(state, document), now);
    state = await legal.getLegalProcedureControl(f.db, now);
    const activated = await legal.changeLegalProcedureControl(f.db, f.actor, command(state, document, 'activate', { approvalSequence: approved.sequence }), now);
    state = await legal.getLegalProcedureControl(f.db, now);
    await legal.changeLegalProcedureControl(f.db, f.actor, command(state, document, 'withdraw'), now);
    assert.equal(f.fingerprint(), before);
    for (const row of retained) assert.deepEqual(f.sqlite.prepare('SELECT * FROM audit_logs WHERE id=?').get(String(row.id)), row);
    assert.deepEqual((await legal.getLegalProcedureEvent(f.db, approved.sequence))?.document, document);
    assert.deepEqual((await legal.getLegalProcedureEvent(f.db, activated.sequence))?.document, document);
    assert.deepEqual(await legal.getLegalDraftRevision(f.db, 1), document);
    assert.deepEqual(await legal.getLegalDraftRevision(f.db, 0), source);
  } finally { f.dispose(); }
});
