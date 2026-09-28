import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { fixture, claim, repo, publishForm, beforeBatch, NOW } from './helpers/loyalty-fixture';
import { seedIncentiveInventory, incentiveItem } from './helpers/incentive-db';
import { eraseFormAnswersForPrivacy, placeDataRightsLegalHold, releaseDataRightsLegalHold } from '../lib/forms/privacy';
import { operateDataRightsRequest } from '../lib/db/repositories/operations';

declare global {
  var incentivePrivacyDb: D1Database;
  var incentivePrivacyActor: { id: string; role: 'admin' | 'super_admin'; permissions?: readonly string[] } | null;
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.incentivePrivacyDb},APP_ORIGIN:"http://localhost:3000",HASTABAZAAR_RUNTIME_ENV:"test"}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(){if(!globalThis.incentivePrivacyActor)throw new StaffAuthorizationError("Authentication required.",401);return globalThis.incentivePrivacyActor;}', shortCircuit: true };
  return nextResolve(specifier, context);
} });
async function collector() {
  const mod = await import('../lib/incentives/privacy').catch(() => null);
  assert.ok(mod, 'incentive financial privacy collector must exist');
  return mod.collectIncentivePrivacyData;
}
async function privacyRequest(db: D1Database, id: string, type = 'access', user = 'customer', assigned = 'super') {
  await db.prepare(
    "INSERT INTO data_rights_requests(id,reference_number,customer_id,request_type,detail,status,assigned_to,created_request_id,created_at,updated_at) VALUES (?,?,?,?,'Fictional approved request','approved',?,?,1,1)",
  ).bind(id, id, user, type, assigned, id).run();
}
async function funded() {
  const f = await fixture(true, { dailyPoints: 200 });
  await publishForm(f.db, 'account.points-redemption');
  await publishForm(f.db, 'staff.privacy-action');
  const r = await repo();
  const ownerClaim = await r.claimDailyPoints(f.db, claim('owned-claim'));
  const ownerRedemption = await r.redeemPoints(f.db, { ...claim('owned-redeem'), points: 100, formVersionId: 'account.points-redemption-v1' });
  await r.claimDailyPoints(f.db, claim('foreign-claim', 1, 'other'));
  await r.redeemPoints(f.db, { ...claim('foreign-redeem', 1, 'other'), points: 200, formVersionId: 'account.points-redemption-v1' });
  return { ...f, ownerClaim, ownerRedemption };
}
async function promoProof(db: D1Database) {
  await seedIncentiveInventory(db);
  await db.prepare("INSERT INTO promo_campaigns(id,code,created_at,updated_at) VALUES ('campaign','SAVE10',1,1)").run();
  await db.prepare(
    "INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at) VALUES ('campaign',1,'Save ten','fixed',1000,0,0,253402300799999,10,2,10000,'super','promo-terms','PRIVATE ADMIN REASON','staff.promo-code-v1',1)",
  ).run();
  await db.prepare("UPDATE promo_campaigns SET current_revision=1,status='published' WHERE id='campaign'").run();
  for (const user of ['customer', 'other']) {
    const order = 'promo-order-' + user;
    await db.prepare(
      "INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label) VALUES (?,?,?,?,'9811111111','placed','en-NP','fixture','{}',10000,500,9500,'cod','unpaid',1,1,1000,'campaign',1,'SAVE10','Save ten')",
    ).bind(order, order, user, user + '@example.test').run();
    await incentiveItem(db, 'item-' + user, order, 1000).run();
    await db.prepare(
      "INSERT INTO promo_redemptions(id,campaign_id,revision,customer_id,order_id,actor_id,request_id,payload_digest,response_json,discount_paisa,subtotal_paisa,created_at) VALUES (?,'campaign',1,?,?,?,?,?,'{}',1000,10000,10)",
    ).bind('promo-' + user, user, order, user, 'promo-request-' + user, 'a'.repeat(64)).run();
  }
}
function routeRequest(action: string, requestId: string, extra: object = {}, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/admin/privacy/case', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, requestId, ...extra }) });
}
async function routeCall(id: string, action: string, requestId: string, extra: object = {}) {
  return (await import('../app/api/admin/privacy/[id]/route')).POST(routeRequest(action, requestId, extra), { params: Promise.resolve({ id }) });
}
const complete = (db: D1Database, id: string, key: string) => operateDataRightsRequest(db, { id, actorId: 'super', actorRole: 'super_admin', action: 'complete', note: 'Reviewed approved privacy evidence.', requestId: key, now: NOW });
async function count(db: D1Database, table: string, where = '') {
  return (await db.prepare('SELECT COUNT(*) n FROM ' + table + ' ' + where).first<{ n: number }>())!.n;
}

void test('owner financial export includes owned promo claim points redemption and linked credit proof without private administration or other owners', async () => {
  const collect = await collector(), f = await funded();
  try {
    await promoProof(f.db);
    // An actual configured admin answer remains private even if its actor is the owner.
    await f.db.prepare("INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at) VALUES ('private-admin','staff.loyalty-settings','private-admin','staff.loyalty-settings-v1','loyalty_revision','1','customer',?,1)")
      .bind(JSON.stringify({ formId: 'staff.loyalty-settings', version: 1, answers: [{ fieldId: 'context', value: 'PRIVATE STAFF ANSWER' }] })).run();
    const data = await collect(f.db, 'customer');
    assert.equal(data.promoRedemptions.length, 1);
    assert.equal(data.promoRedemptions[0].id, 'promo-customer');
    assert.equal(data.promoRedemptions[0].orderId, 'promo-order-customer');
    assert.equal(data.promoRedemptions[0].discountPaisa, 1000);
    assert.equal(data.dailyClaims.length, 1);
    assert.equal(data.dailyClaims[0].id, f.ownerClaim.claimId);
    assert.equal(data.dailyClaims[0].localDate, '2026-09-28');
    assert.equal(data.dailyClaims[0].awardedPoints, 200);
    assert.deepEqual(data.pointsEntries.map((row) => row.points), [200, -100]);
    assert.equal(data.redemptions.length, 1);
    assert.equal(data.redemptions[0].id, f.ownerRedemption.redemptionId);
    assert.equal(data.redemptions[0].pointsPerBlock, 100);
    assert.equal(data.redemptions[0].creditPaisaPerBlock, 1000);
    assert.equal(data.walletCredits.length, 1);
    assert.equal(data.walletCredits[0].redemptionId, f.ownerRedemption.redemptionId);
    assert.equal(data.walletCredits[0].amountPaisa, 1000);
    assert.doesNotMatch(JSON.stringify(data), /PRIVATE|foreign-|promo-other|REF-|referral|phone|actorId|authSubject|payloadDigest|budget/i);
    const other = await collect(f.db, 'other');
    assert.equal(other.promoRedemptions[0].id, 'promo-other');
    assert.deepEqual(other.pointsEntries.map((row) => row.points), [200, -200]);
    assert.doesNotMatch(JSON.stringify(other), /owned-|promo-customer/);
    const empty = await collect(f.db, 'admin');
    assert.deepEqual(empty, { promoRedemptions: [], dailyClaims: [], pointsEntries: [], redemptions: [], walletCredits: [] });
    await assert.rejects(collect(f.db, ''), /invalid/i);
    assert.equal(await count(f.db, 'form_answer_sets', "WHERE form_id IN ('account.daily-reward','account.points-redemption')"), 0);
  } finally { await f.dispose(); }
});

void test('actual assigned approved access export returns financial proof and audited scope then permits access completion', async () => {
  const f = await funded();
  globalThis.incentivePrivacyDb = f.db;
  globalThis.incentivePrivacyActor = { id: 'super', role: 'super_admin' };
  try {
    await privacyRequest(f.db, 'access');
    const response = await routeCall('access', 'export_answers', 'export');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    const body = await response.json() as { incentives: Awaited<ReturnType<typeof import('../lib/incentives/privacy').collectIncentivePrivacyData>>; answers: unknown[] };
    assert.ok(body.incentives, 'approved export must include retained financial proof');
    assert.equal(body.incentives.dailyClaims[0].id, f.ownerClaim.claimId);
    assert.equal(body.incentives.walletCredits[0].amountPaisa, 1000);
    assert.deepEqual(body.answers, []);
    assert.doesNotMatch(JSON.stringify(body), /foreign-|REF-|PRIVATE|authSubject/);
    const audit = await f.db.prepare("SELECT next_json AS details FROM audit_logs WHERE request_id='form-answer-export:export'").first<{ details: string }>();
    assert.equal(JSON.parse(audit!.details).incentivesIncluded, true);
    assert.equal(JSON.parse(audit!.details).incentiveRecordCount, 5);
    assert.equal((await routeCall('access', 'export_answers', 'export')).status, 409);
    await complete(f.db, 'access', 'complete-access');
    assert.equal((await f.db.prepare("SELECT status FROM data_rights_requests WHERE id='access'").first<{ status: string }>())!.status, 'completed');
  } finally { await f.dispose(); }
});

void test('export keeps existing authorization origin bounds assignment and final active staff recheck', async () => {
  const f = await funded();
  globalThis.incentivePrivacyDb = f.db;
  try {
    await privacyRequest(f.db, 'access');
    globalThis.incentivePrivacyActor = null;
    assert.equal((await routeCall('access', 'export_answers', 'guest')).status, 401);
    globalThis.incentivePrivacyActor = { id: 'admin', role: 'admin', permissions: ['support.manage'] };
    assert.equal((await routeCall('access', 'export_answers', 'unassigned')).status, 403);
    globalThis.incentivePrivacyActor = { id: 'super', role: 'super_admin' };
    const route = await import('../app/api/admin/privacy/[id]/route');
    assert.equal((await route.POST(routeRequest('export_answers', 'cross-site', {}, 'https://attacker.test'), { params: Promise.resolve({ id: 'access' }) })).status, 403);
    assert.equal((await routeCall('access', 'export_answers', 'oversized', { padding: 'x'.repeat(270000) })).status, 413);
    await f.db.prepare("UPDATE users SET status='disabled' WHERE id='super'").run();
    const denied = await routeCall('access', 'export_answers', 'inactive');
    assert.equal(denied.status, 409);
    assert.equal(await count(f.db, 'audit_logs', "WHERE action='form.answers.exported'"), 0);
  } finally { await f.dispose(); }
});

void test('form-only historical export cannot complete access while incentive proof remains unexported', async () => {
  const f = await funded();
  try {
    await privacyRequest(f.db, 'access');
    await f.db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES ('old-export','super','form.answers.exported','data_rights_request','access','Historical form-only export','{\"answerCount\":0}','old-export',1)").run();
    await assert.rejects(complete(f.db, 'access', 'incomplete-access'), /export/i);
    assert.equal(await count(f.db, 'data_rights_events', "WHERE action='complete'"), 0);
  } finally { await f.dispose(); }
});

void test('held immutable incentive proof survives approved erasure and retained proof prevents full deletion completion after hold release', async () => {
  const f = await funded();
  try {
    await promoProof(f.db);
    await privacyRequest(f.db, 'delete', 'deletion');
    const hold = await placeDataRightsLegalHold(f.db, { userId: 'customer', actorId: 'super', reason: 'Existing accounting dispute.', requestId: 'hold', now: NOW });
    await assert.rejects(eraseFormAnswersForPrivacy(f.db, { userId: 'customer', actorId: 'super', requestId: 'held-delete', dataRightsRequestId: 'delete' }), /hold/i);
    for (const table of ['promo_redemptions','loyalty_daily_claims','loyalty_points_entries','loyalty_redemptions','wallet_entries']) {
      await assert.rejects(f.db.prepare('DELETE FROM ' + table).run(), /immutable/i);
      assert.ok(await count(f.db, table));
    }
    await releaseDataRightsLegalHold(f.db, { holdId: hold.id, actorId: 'super', reason: 'Accounting dispute reviewed.', requestId: 'release', now: NOW + 1 });
    assert.deepEqual(await eraseFormAnswersForPrivacy(f.db, { userId: 'customer', actorId: 'super', requestId: 'profile-delete', dataRightsRequestId: 'delete' }), { deletedCount: 0 });
    await assert.rejects(complete(f.db, 'delete', 'complete-delete'), /retained.*financial|financial.*retained/i);
    assert.equal((await f.db.prepare("SELECT status FROM data_rights_requests WHERE id='delete'").first<{ status: string }>())!.status, 'approved');
    assert.equal(await count(f.db, 'data_rights_events', "WHERE action='complete'"), 0);
    assert.equal(await count(f.db, 'audit_logs', "WHERE action='privacy.complete'"), 0);
    assert.equal(await count(f.db, 'loyalty_daily_claims'), 2);
    assert.equal(await count(f.db, 'loyalty_redemptions'), 2);
    assert.equal(await count(f.db, 'wallet_entries'), 2);
  } finally { await f.dispose(); }
});

void test('deletion completion atomically rechecks late incentive proof and ignores another owners proof', async () => {
  const f = await fixture(true, { dailyPoints: 100 });
  try {
    await privacyRequest(f.db, 'delete', 'deletion');
    await eraseFormAnswersForPrivacy(f.db, { userId: 'customer', actorId: 'super', requestId: 'profile', dataRightsRequestId: 'delete' });
    const r = await repo();
    await r.claimDailyPoints(f.db, claim('other-proof', 1, 'other'));
    const raced = beforeBatch(f.db, () => r.claimDailyPoints(f.db, claim('late-proof')));
    await assert.rejects(complete(raced, 'delete', 'raced-complete'), /retained.*financial|financial.*retained/i);
    assert.equal(await count(f.db, 'loyalty_daily_claims'), 2);
    assert.equal(await count(f.db, 'data_rights_events', "WHERE action='complete'"), 0);
    await privacyRequest(f.db, 'empty-delete', 'deletion', 'admin');
    await eraseFormAnswersForPrivacy(f.db, { userId: 'admin', actorId: 'super', requestId: 'empty-profile', dataRightsRequestId: 'empty-delete' });
    await complete(f.db, 'empty-delete', 'empty-complete');
    assert.equal((await f.db.prepare("SELECT status FROM data_rights_requests WHERE id='empty-delete'").first<{ status: string }>())!.status, 'completed');
  } finally { await f.dispose(); }
});
