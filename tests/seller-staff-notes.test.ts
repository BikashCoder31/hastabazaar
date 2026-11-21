import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';

const state = { db: null as D1Database | null, subject: 'staff' };
Object.assign(globalThis, { sellerNotesFixture: state });
registerHooks({
  resolve(specifier, context, next) {
    const modules: Record<string, string> = {
      'cloudflare:workers': 'export const env = { get DB() { return globalThis.sellerNotesFixture.db } };',
      '@/app/auth': `export async function getAuthenticatedUser() {
        const userId = globalThis.sellerNotesFixture.subject;
        return { userId, email: userId + '@local.hastabazaar.test' };
      } export const requireAuthenticatedUser = getAuthenticatedUser;`,
      'next/navigation': 'export function redirect(url) { throw new Error(url); }',
    };
    return modules[specifier]
      ? { url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true }
      : next(specifier, context);
  },
});

function notesFixture(installed: boolean) {
  const fixture = securityDatabase();
  fixture.sqlite.exec(`
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE seller_participation_profiles(seller_id TEXT PRIMARY KEY REFERENCES seller_profiles(id), participation_route TEXT);
    CREATE TABLE staff_permission_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id), permissions_json TEXT);
    CREATE TABLE staff_permission_guards(id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT, subject_id TEXT,
      reason TEXT, request_id TEXT, created_at INTEGER, command_key TEXT UNIQUE, command_digest TEXT, command_result_json TEXT);
    CREATE TRIGGER staff_notes_audit_append_only BEFORE UPDATE ON audit_logs
      BEGIN SELECT RAISE(ABORT, 'audit receipts are append-only'); END;
    INSERT INTO users VALUES
      ('staff','staff','staff@local.hastabazaar.test','Fictional staff','active',1),
      ('seller','seller','seller@local.hastabazaar.test','Fictional seller','active',1);
    INSERT INTO user_roles VALUES ('staff','super_admin'), ('seller','seller');
    INSERT INTO seller_profiles VALUES ('seller-profile','seller');
  `);
  // Define only the disposable shape. The migration file is never executed.
  if (installed) fixture.sqlite.exec(`
    CREATE TABLE seller_staff_notes(
      id TEXT PRIMARY KEY, seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
      author_user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
      created_at INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1))
    );
  `);
  state.db = fixture.db;
  state.subject = 'staff';
  return fixture;
}

const sellerId = 'seller-profile';
const path = '/api/admin/sellers/seller-profile/notes';
const context = { params: Promise.resolve({ id: sellerId }) };
const add = { action: 'add', body: 'Fictional private note', requestId: 'private-note-test-1' };
function request(body: unknown, intendedActor = 'staff') {
  return new Request('http://localhost:3018' + path, {
    method: 'POST',
    headers: { origin: 'http://localhost:3018', 'content-type': 'application/json', 'X-Hastabazaar-Actor': intendedActor },
    body: JSON.stringify(body),
  });
}

void test('staff add, retry, pin and unpin immutable notes with one audit record per change', async () => {
  const fixture = notesFixture(true);
  try {
    const { POST } = await import('../app/api/admin/sellers/[id]/notes/route');
    const { listSellerStaffNotes } = await import('../lib/admin/seller-notes');
    assert.equal((await POST(request(add), context)).status, 200);
    assert.equal((await POST(request(add), context)).status, 200);
    assert.equal((await POST(request({ ...add, body: 'Different text, old attempt' }), context)).status, 409);
    const [note] = (await listSellerStaffNotes(fixture.db, sellerId))!;
    assert.equal(note.body, add.body);
    assert.equal(note.author, 'Fictional staff');
    assert.equal(note.pinned, false);
    assert.ok(note.createdAt > 0);

    const pin = { action: 'pin', noteId: note.id, pinned: true, requestId: 'private-note-pin-1' };
    assert.equal((await POST(request(pin), context)).status, 200);
    assert.equal((await listSellerStaffNotes(fixture.db, sellerId))![0].pinned, true);
    assert.equal((await POST(request({ ...pin, pinned: false, requestId: 'private-note-unpin-1' }), context)).status, 200);
    assert.equal((await POST(request(pin), context)).status, 200, 'Retrying a previously recorded pin never undoes a later unpin');
    assert.equal((await listSellerStaffNotes(fixture.db, sellerId))![0].pinned, false);
    const audit = fixture.sqlite.prepare('SELECT action,actor_id,subject_id,reason,created_at,command_result_json FROM audit_logs ORDER BY rowid').all();
    assert.deepEqual(audit.map(row => row.action), ['seller.note.added', 'seller.note.pinned', 'seller.note.unpinned']);
    assert.ok(audit.every(row => row.actor_id === 'staff' && row.subject_id === sellerId && row.reason && Number(row.created_at) > 0));
    assert.doesNotMatch(JSON.stringify(audit), /Fictional private note/);
    assert.deepEqual(await listSellerStaffNotes(fixture.db, 'another-seller'), []);
  } finally { fixture.dispose(); }
});

void test('seller sessions are denied the record page and the protected notes endpoint', async () => {
  const fixture = notesFixture(true);
  try {
    const api = await import('../app/api/admin/sellers/[id]/notes/route');
    const { requireStaffPage } = await import('../lib/auth/staff');
    assert.equal((await api.POST(request(add), context)).status, 200);
    state.subject = 'seller';
    await assert.rejects(requireStaffPage('/admin/sellers/' + sellerId, 'seller.application.review'), /staff-access-denied/);
    const response = await api.POST(request(add, 'seller'), context);
    assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), /Fictional private note/);
    assert.equal(Reflect.get(api, 'GET'), undefined, 'No separate read API can expose the note');
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM seller_staff_notes').get()?.n, 1);
  } finally { fixture.dispose(); }
});

void test('before the notes table exists, hiding the feature requires no note query or mutation', async () => {
  const fixture = notesFixture(false);
  try {
    const { POST } = await import('../app/api/admin/sellers/[id]/notes/route');
    const { listSellerStaffNotes } = await import('../lib/admin/seller-notes');
    assert.equal(await listSellerStaffNotes(fixture.db, sellerId), null);
    assert.equal((await POST(request(add), context)).status, 404);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM audit_logs').get()?.n, 0);
    assert.ok(fixture.queries.every(sql => !/\b(?:FROM|INTO|UPDATE) seller_staff_notes\b/.test(sql)));
  } finally { fixture.dispose(); }
});

void test('notes reject empty, long and cross-record writes before leaving an audit record', async () => {
  const fixture = notesFixture(true);
  try {
    const { POST } = await import('../app/api/admin/sellers/[id]/notes/route');
    for (const body of ['  ', 'a'.repeat(2001), 'before\0after'])
      assert.equal((await POST(request({ ...add, body }), context)).status, 400);
    assert.equal((await POST(request(add, 'another-actor'), context)).status, 403);
    assert.equal((await POST(request({ ...add, action: 'edit' }), context)).status, 400);
    assert.equal((await POST(request({ action: 'pin', noteId: 'another-note', pinned: true, requestId: 'wrong-note-id' }), context)).status, 404);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM audit_logs').get()?.n, 0);
  } finally { fixture.dispose(); }
});
