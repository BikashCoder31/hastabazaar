import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { earnedMaker } from './helpers/company-store-financial-fixture';
import { getManagedPayoutPreview } from '../lib/managed-commerce/payout-operations';
import { applyReadinessUpgrade, readReadinessManifest } from '../scripts/staging/company-store-readiness-upgrade.mjs';
import { listStaffFormHistory } from '../lib/forms/staff-history';

declare global { var companyStoreAdminDb: D1Database; var companyStoreAdminActor: { id: string; role: string } | null }
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,export const env={get DB(){return globalThis.companyStoreAdminDb},HASTABAZAAR_RUNTIME_ENV:'local_staging',APP_ORIGIN:'http://localhost:3018'}`, shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){if(!globalThis.companyStoreAdminActor)throw new StaffAuthorizationError('Sign in to staff access.',401);return globalThis.companyStoreAdminActor}`, shortCircuit: true };
  return next(specifier, context);
} });

async function fixture() {
  const f = await earnedMaker(true, Date.now() - 10 * 86_400_000);
  applyReadinessUpgrade(f.sqlite, await readReadinessManifest(process.cwd()), 'reviewer', f.now);
  globalThis.companyStoreAdminDb = f.db; globalThis.companyStoreAdminActor = { id: 'reviewer', role: 'super_admin' };
  const preview = await getManagedPayoutPreview(f.db, f.sellerId, Date.now());
  return { ...f, preview };
}
function request(body: unknown, origin = 'http://localhost:3018') {
  return new Request('http://localhost:3018/api/admin/managed-program/maker', { method: 'POST',
    headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
const target = { params: Promise.resolve({ id: 'maker' }) };

test('sale-linked actions require current Super Admin authority and exact published form', async () => {
  const f = await fixture();
  try {
    const { POST } = await import('../app/api/admin/managed-program/[id]/route');
    const body = { action: 'prepare_sale_linked_payout', requestId: 'http-prepare-payment', formVersion: 1, customAnswers: [],
      reason: 'Review the completed paid sale for local payment.', destinationReference: f.preview.receivingReference,
      scheduledFor: f.now, expectedAmountPaisa: 91000, expectedSnapshot: f.preview.snapshotDigest };
    const response = await POST(request(body), target);
    assert.equal(response.status, 201, await response.text());
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='staff.managed-payout-preparation'").get()?.n, 1);
    assert.equal((await POST(request(body), target)).status, 201);
    assert.equal((await POST(request({ ...body, destinationReference: 'SIM-DIFFERENT' }), target)).status, 409);
    assert.equal((await POST(request({ ...body, requestId: 'http-cross-site' }, 'https://elsewhere.test'), target)).status, 403);
    globalThis.companyStoreAdminActor = { id: 'reviewer', role: 'admin' };
    assert.equal((await POST(request({ ...body, requestId: 'http-admin-blocked' }), target)).status, 403);
    globalThis.companyStoreAdminActor = null;
    assert.equal((await POST(request({ ...body, requestId: 'http-anonymous-blocked' }), target)).status, 401);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 1);
  } finally { f.dispose(); }
});

test('sale-linked payment action stores private history and rejects a foreign maker route', async () => {
  const f = await fixture();
  try {
    const { POST } = await import('../app/api/admin/managed-program/[id]/route');
    const prepare = { action: 'prepare_sale_linked_payout', requestId: 'private-payment-prepare', formVersion: 1, customAnswers: [],
      reason: 'Review the paid sale and receiving reference.', destinationReference: f.preview.receivingReference,
      scheduledFor: f.now, expectedAmountPaisa: 91000, expectedSnapshot: f.preview.snapshotDigest };
    const created = await POST(request(prepare), target);
    assert.equal(created.status, 201);
    const body = await created.json() as { payoutId: string };
    const payment = { action: 'record_sale_linked_payment', payoutId: body.payoutId, expectedStatus: 'approved',
      requestId: 'private-payment-paid', formVersion: 1, customAnswers: [], reason: 'Record the reviewed simulated payment receipt.', providerReference: 'SIM-HTTP-PAID' };
    assert.equal((await POST(request(payment), { params: Promise.resolve({ id: 'another-maker' }) })).status, 404);
    assert.equal((await POST(request(payment), target)).status, 200);
    assert.equal((await POST(request(payment), target)).status, 200);
    const history = await listStaffFormHistory(f.db, { id: 'reviewer', role: 'super_admin' }, 'managed-payout-action', { subjectId: body.payoutId });
    assert.equal(history.items.length, 1);
    assert.equal((await listStaffFormHistory(f.db, { id: f.actorId, role: 'customer' }, 'managed-payout-action', { subjectId: body.payoutId })).items.length, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payout_allocations WHERE disposition=?').get('paid')?.n, 1);
  } finally { f.dispose(); }
});

test('stale forms, malformed bodies and publication races leave no financial answer or payment', async () => {
  const f = await fixture();
  try {
    const { POST } = await import('../app/api/admin/managed-program/[id]/route');
    const body = { action: 'prepare_sale_linked_payout', requestId: 'stale-payment-prepare', formVersion: 1, customAnswers: [],
      reason: 'Review the current local maker payment.', destinationReference: f.preview.receivingReference,
      scheduledFor: f.now, expectedAmountPaisa: 91000, expectedSnapshot: f.preview.snapshotDigest };
    assert.equal((await POST(request({ ...body, formVersion: 999 }), target)).status, 409);
    assert.equal((await POST(request({ ...body, amountPaisa: 1 }), target)).status, 400);
    assert.equal((await POST(request({ ...body, reason: 'x'.repeat(300000) }), target)).status, 413);
    f.setBeforeBatch(() => { f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,
      created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES('new-payment-form','staff.managed-payout-preparation',2,'published',?,'Isolated form publication','reviewer',1,'reviewer',1,'reviewer',1,'new-payment-form')`)
      .run(JSON.stringify({ formId: 'staff.managed-payout-preparation', fields: [] })); });
    const raced = await POST(request(body), target);
    assert.equal(raced.status, 409);
    assert.equal((await raced.json() as { code: string }).code, 'stale_version');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='staff.managed-payout-preparation'").get()?.n, 0);
  } finally { f.dispose(); }
});
