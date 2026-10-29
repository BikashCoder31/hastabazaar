import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readSellerDraft, saveSellerDraft, deleteSellerDraft, cleanupSellerDrafts } from '../lib/sellers/draft-store';
import { parseDraftAnswers } from '../lib/sellers/draft-contract';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES (\'alice\'),(\'bob\'); CREATE TABLE operation_transaction_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1));');
  sqlite.exec(readFileSync('drizzle/0076_seller_application_drafts.sql', 'utf8'));
  const db = {
    prepare(sql: string) {
      let args: SQLInputValue[] = [];
      return { bind(...values: SQLInputValue[]) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; } };
    },
    async batch(statements: { run(): Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  const objects = new Map<string, Uint8Array>();
  const bucket = { async put(key: string, body: Blob) { objects.set(key, new Uint8Array(await new Response(body).arrayBuffer())); },
    async delete(key: string) { objects.delete(key); } } as unknown as R2Bucket;
  return { db, bucket, sqlite, objects };
}
const payload = (revision: string | null = null) => ({ revision, changeId: crypto.randomUUID(), attemptId: crypto.randomUUID(),
  formVersion: 1, answers: { legalName: ['Fictional Maker'], phone: ['123456789'] }, files: {} });

void test('partial answers survive a reload, stay account-owned and stale saves cannot overwrite', async () => {
  const { db, bucket } = fixture();
  const first = await saveSellerDraft(db, bucket, 'alice', payload(), {}, 1000);
  assert.equal((await readSellerDraft(db, 'alice', 1001))?.answers.legalName[0], 'Fictional Maker');
  assert.equal(await readSellerDraft(db, 'bob', 1001), null);
  const next = { ...payload(first.revision), answers: { legalName: ['Updated'] } };
  await saveSellerDraft(db, bucket, 'alice', next, {}, 1002);
  await assert.rejects(saveSellerDraft(db, bucket, 'alice', payload(first.revision), {}, 1003), /another tab|changed/i);
  await assert.rejects(deleteSellerDraft(db, 'alice', first.revision), /another tab|changed/i);
  assert.equal((await readSellerDraft(db, 'alice', 1003))?.answers.legalName[0], 'Updated');
});

void test('drafts expire and cleanup deletes private upload bytes', async () => {
  const { db, bucket, objects } = fixture();
  const first = await saveSellerDraft(db, bucket, 'alice', payload(), { representativeIdentity: new File(['synthetic bytes'], 'evidence.png', { type: 'image/png' }) }, 1000);
  assert.equal(first.files.representativeIdentity.name, 'evidence.png');
  assert.equal(objects.size, 1);
  assert.equal(await readSellerDraft(db, 'alice', first.expiresAt), null);
  await cleanupSellerDrafts(db, bucket, first.expiresAt);
  assert.equal(objects.size, 0);
});

void test('another account cannot attach a saved private file and confirmed deletion is revision-bound', async () => {
  const { db, bucket } = fixture();
  const first = await saveSellerDraft(db, bucket, 'alice', payload(), { representativeIdentity: new File(['test'], 'evidence.png', { type: 'image/png' }) }, 1000);
  await assert.rejects(saveSellerDraft(db, bucket, 'bob', { ...payload(), files: { representativeIdentity: first.files.representativeIdentity.id } }, {}, 1001), /file/i);
  await deleteSellerDraft(db, 'alice', first.revision);
  assert.equal(await readSellerDraft(db, 'alice', 1002), null);
});

void test('draft contract excludes secrets, account email and consent while allowing incomplete answers', () => {
  assert.deepEqual(parseDraftAnswers({ legalName: [''], phone: ['12'] }, []), { legalName: [''], phone: ['12'] });
  for (const key of ['password', 'otp', 'acceptedTerms', 'managedAgreementAccepted', 'email', '__proto__']) {
    assert.throws(() => parseDraftAnswers(JSON.parse(`{"${key}":["x"]}`), []), /field/i);
  }
});
