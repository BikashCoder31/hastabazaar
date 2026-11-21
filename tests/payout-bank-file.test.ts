import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { readPayoutRun } from '../app/admin/payouts/run/run-data';
import { hostedSessionCookieName } from '../lib/auth/hosted-session';
import { operatePayout } from '../lib/db/repositories/payouts';
import { ACTOR_INTENT_HEADER } from '../lib/http/actor-intent';
import { ADMIN_ABSOLUTE_MS, FRESH_PASSWORD_MS, type SessionProof } from '../lib/security/model';
import { SecurityStore } from '../lib/security/store';
import { payoutTransferFixture } from './helpers/payout-transfer-fixture';

declare global {
  var payoutFileTestEnvironment: { DB: D1Database; HASTABAZAAR_SECURITY_KEY: string; APP_ORIGIN: string };
}

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return {
    url: 'data:text/javascript,export const env = new Proxy({}, { get: (_, key) => globalThis.payoutFileTestEnvironment[key] })',
    shortCircuit: true,
  };
  return next(specifier, context);
} });

const runId = 'd40b3b6a-3fde-4a40-8e7c-6ad45892d7c4';
const otherRunId = '7e3203df-2b79-4c37-b9f0-20d71cc419fc';
const origin = 'http://localhost:3018';
const actorId = 'reviewer';

function request(session: string, selectedRun = runId, actor = actorId, requestOrigin = origin) {
  return new Request(`${origin}/admin/payouts/run/bank-file`, {
    method: 'POST',
    headers: {
      Origin: requestOrigin,
      'Content-Type': 'application/json',
      Cookie: `${hostedSessionCookieName}=${session}`,
      [ACTOR_INTENT_HEADER]: actor,
    },
    body: JSON.stringify({ runId: selectedRun }),
  });
}

type Fixture = Awaited<ReturnType<typeof payoutTransferFixture>>;

async function staffSession(f: Fixture, verifiedAt: number) {
  const key = Buffer.from(randomBytes(32)).toString('base64url');
  globalThis.payoutFileTestEnvironment = { DB: f.db, HASTABAZAAR_SECURITY_KEY: key, APP_ORIGIN: origin };
  f.sqlite.prepare('UPDATE users SET auth_subject=? WHERE id=?').run('original-staff-subject', actorId);
  const store = new SecurityStore(f.db, key);
  await store.initialize([actorId], verifiedAt);
  const account = (await store.readAccount(actorId))!;
  const session = Buffer.from(randomBytes(32)).toString('base64url');
  const hash = createHash('sha256').update(session).digest('hex');
  const expires = verifiedAt + ADMIN_ABSOLUTE_MS;
  f.sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)').run(hash, actorId, expires, verifiedAt, verifiedAt);
  const proof: SessionProof = { schema: 1, kind: 'proof', userId: actorId, sessionHash: hash, generation: 1,
    passwordVerifiedAt: verifiedAt, verifiedAt, absoluteExpiresAt: expires, lastActivityAt: verifiedAt };
  await store.checkedBatch([
    ...store.accountCas(account, { ...account.value, status: 'active',
      factor: { secret: 'JBSWY3DPEHPK3PXP', activatedAt: verifiedAt, lastCounter: 1 },
      recovery: { setId: 'fictional-backup-codes', hashes: [], createdAt: verifiedAt } }, verifiedAt),
    ...store.proofUpsert(null, proof, verifiedAt),
  ]);
  return session;
}

void test('bank file contains only current approved verified payouts in the selected run and records a private audit', async () => {
  const f = await payoutTransferFixture();
  try {
    const now = Date.now();
    const session = await staffSession(f, now);
    const { POST } = await import('../app/admin/payouts/run/bank-file/route');
    const { readPayoutBankFileOverview } = await import('../lib/payments/payout-bank-file');
    const requestId = 'payout-run-' + runId + '-' + 'a'.repeat(32);
    f.sqlite.prepare('UPDATE seller_profiles SET legal_name=? WHERE id=?').run('=Fictional, "Seller"', f.sellerId);
    const leadingZeroDestination = 'BENEFICIARY:leading-zero-test-bank';
    f.sqlite.prepare(`INSERT INTO seller_beneficiary_versions
      SELECT 'leading-zero-test-bank',b.seller_id,b.case_id,b.document_id,json_set(b.details_json,'$.bankAccountNumber','00012345'),
        r.identity_revision,b.ownership_basis,b.verification_reference,b.review_reason,b.verified_by,b.verified_at
      FROM seller_beneficiary_versions b JOIN seller_protected_revisions r ON r.seller_id=b.seller_id WHERE b.seller_id=?`).run(f.sellerId);
    f.sqlite.prepare('UPDATE seller_profiles SET payout_account_reference=? WHERE id=?').run(leadingZeroDestination, f.sellerId);
    f.sqlite.prepare("UPDATE payouts SET status='prepared',approved_by=NULL,approved_at=NULL,destination_reference=? WHERE id=?").run(leadingZeroDestination, f.payoutId);
    await operatePayout(f.db, { payoutId: f.payoutId, action: 'approve', actorId, actorRole: 'super_admin',
      requestId, note: 'Approve the exact fictional payout in this run.', now });
    assert.equal((await readPayoutRun(f.db, actorId, now)).lastRun?.id, runId);
    const payout = f.sqlite.prepare('SELECT payout_number AS reference, destination_reference AS destination FROM payouts WHERE id=?').get(f.payoutId)!;
    const payoutReference = String(payout.reference);
    // Add known prior decisions without reopening real payments. All records are in memory.
    const add = (id: string, reference: string, destination: string, amount: number, status: 'approved' | 'paid', run: string) => {
      const idempotency = 'payout-run-' + run + '-' + id.padEnd(32, '0');
      f.sqlite.prepare(`INSERT INTO payouts(id,seller_id,payout_number,status,amount_paisa,destination_reference,prepared_by,approved_by,scheduled_for,paid_at,created_at,updated_at,operation_request_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, f.sellerId, reference, status, amount, destination, actorId, actorId, now, status === 'paid' ? now : null, now, now, idempotency);
      f.sqlite.prepare(`INSERT INTO payout_events(id,payout_id,from_status,to_status,action,actor_id,actor_type,note,request_id,created_at)
        VALUES(?,?,'prepared','approved','approve',?,'super_admin','Approved in an isolated fixture',?,?)`).run(id, id, actorId, idempotency, now);
    };
    add('b', 'PO-SECOND', String(payout.destination), 12345, 'approved', runId);
    add('c', 'PO-PRIVATE-BLOCKED', 'LEGACY-UNVERIFIED', 6100, 'approved', runId);
    add('d', 'PO-ALREADY-PAID', String(payout.destination), 23567, 'paid', runId);
    add('e', 'PO-DIFFERENT-RUN', String(payout.destination), 98923, 'approved', otherRunId);
    const overview = await readPayoutBankFileOverview(f.db, actorId, runId);
    assert.equal(overview.count, 2, JSON.stringify(overview));
    assert.deepEqual(overview.blocked.map(row => row.reference), ['PO-PRIVATE-BLOCKED']);
    assert.doesNotMatch(JSON.stringify(overview), /00012345/);
    const before = f.sqlite.prepare('SELECT * FROM payouts ORDER BY id').all();
    const response = await POST(request(session));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Disposition') ?? '', /^attachment; filename=".*\.csv"$/);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const csv = await response.text();
    assert.match(csv, /^"Payout number","Seller legal name","Bank name","Branch","Account holder name","Account number","Amount \(NPR\)","Payment reference"\r\n/);
    assert.ok(csv.includes(`"${payoutReference}","'=Fictional, ""Seller""","Fictional Bank","Fictional branch","Fictional Registered Owner","00012345","200.00","${payoutReference}"`));
    assert.ok(csv.includes('"123.45","PO-SECOND"'));
    assert.doesNotMatch(csv, /PO-(?:PRIVATE-BLOCKED|ALREADY-PAID|DIFFERENT-RUN)/);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM payouts ORDER BY id').all(), before);
    const receipt = f.sqlite.prepare("SELECT actor_id,subject_id,reason,next_json,created_at FROM audit_logs WHERE action='payout.bank_file.downloaded'").get()!;
    assert.equal(receipt.actor_id, actorId);
    assert.equal(receipt.subject_id, runId);
    assert.ok(String(receipt.reason).length > 0 && Number(receipt.created_at) >= now);
    const audit = JSON.parse(String(receipt.next_json));
    assert.deepEqual(audit.payoutIds.sort(), [f.payoutId, 'b'].sort());
    assert.equal(audit.totalPaisa, 32345);
    assert.doesNotMatch(String(receipt.next_json), /00012345/);

    const nativePrepare = f.db.prepare.bind(f.db);
    f.db.prepare = (sql: string) => {
      if (sql.includes("'payout.bank_file.downloaded'")) {
        f.sqlite.prepare("UPDATE seller_documents SET valid_until=? WHERE id='payout-bank-proof'").run(Date.now() - 1);
      }
      return nativePrepare(sql);
    };
    const raced = await POST(request(session));
    assert.equal(raced.status, 409);
    assert.equal((await raced.json() as { code: string }).code, 'BANK_FILE_CHANGED');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='payout.bank_file.downloaded'").get()!.n, 1);
  } finally { f.dispose(); }
});

void test('a stale proof, different staff actor, downgraded actor or cross-origin request cannot download', async () => {
  const f = await payoutTransferFixture();
  try {
    const session = await staffSession(f, Date.now() - FRESH_PASSWORD_MS - 1_000);
    const { POST } = await import('../app/admin/payouts/run/bank-file/route');
    const stale = await POST(request(session));
    assert.equal(stale.status, 403);
    assert.equal((await stale.json() as { code: string }).code, 'MFA_REQUIRED');
    assert.equal((await POST(request(session, runId, 'another-actor'))).status, 403);
    assert.equal((await POST(request(session, runId, actorId, 'https://external.invalid'))).status, 403);
    f.sqlite.prepare('UPDATE user_roles SET role=? WHERE user_id=? AND role=?').run('admin', actorId, 'super_admin');
    assert.equal((await POST(request(session))).status, 403);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='payout.bank_file.downloaded'").get()!.n, 0);
  } finally { f.dispose(); }
});
