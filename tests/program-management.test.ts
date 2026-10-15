import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveRuntimeEnvironment } from '../lib/staging/environment';

declare global { var programHubDb: D1Database; var programHubRole: string; var programHubRuntime: string }
(globalThis as unknown as { React: typeof React }).React = React;
registerHooks({ resolve(specifier, context, nextResolve) {
  const boundary = specifier === 'cloudflare:workers'
    ? 'export const env={get DB(){return globalThis.programHubDb},get HASTABAZAAR_RUNTIME_ENV(){return globalThis.programHubRuntime},APP_ORIGIN:"http://localhost:3000"}'
    : specifier === '@/lib/auth/staff' ? 'export async function requireStaffPage(){return {id:"reviewer",role:globalThis.programHubRole}}'
    : specifier === 'next/navigation' ? 'export function redirect(){throw Error("ACCESS_DENIED")};export function useRouter(){return {refresh(){}}}'
    : specifier === 'next/link' ? 'export default function Link({children,...props}){return globalThis.React.createElement("a",props,children)}'
    : null;
  return boundary ? { url: `data:text/javascript,${boundary}`, shortCircuit: true } : nextResolve(specifier, context);
} });

async function fixture(empty = false) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY);
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT,trading_name TEXT,status TEXT);
    CREATE TABLE seller_participation_profiles(seller_id TEXT,participation_route TEXT,application_stage TEXT,
      commercial_model TEXT,legal_seller_reference TEXT,invoice_issuer_reference TEXT,payout_beneficiary_reference TEXT,
      managed_agreement_version TEXT,managed_agreement_accepted_at INTEGER,updated_at INTEGER);
    CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT,name_en TEXT,status TEXT,updated_at INTEGER);
    CREATE TABLE product_deletions(product_id TEXT PRIMARY KEY);
    CREATE TABLE managed_supply_records(id TEXT PRIMARY KEY,seller_id TEXT,status TEXT);
    CREATE TABLE managed_supplier_payments(id TEXT PRIMARY KEY,obligation_id TEXT,status TEXT,amount_paisa INTEGER DEFAULT 0);
    CREATE TABLE managed_supplier_obligations(id TEXT PRIMARY KEY,seller_id TEXT,original_amount_paisa INTEGER);
    CREATE TABLE managed_supplier_adjustments(id TEXT PRIMARY KEY,obligation_id TEXT,amount_paisa INTEGER);
    CREATE TABLE seller_route_transition_applications(id TEXT PRIMARY KEY,seller_id TEXT,status TEXT);
    CREATE TABLE managed_entitlements(id TEXT PRIMARY KEY,seller_id TEXT,status TEXT);
    CREATE TABLE managed_payouts(id TEXT PRIMARY KEY,seller_id TEXT,status TEXT);`);
  sqlite.exec(await readFile(new URL('../drizzle/0044_business_configuration.sql', import.meta.url), 'utf8'));
  let reads = 0;
  globalThis.programHubDb = { prepare(sql: string) {
    reads++;
    const statement = sqlite.prepare(sql);
    let values: SQLInputValue[] = [];
    return { bind(...input: SQLInputValue[]) { values = input; return this; },
      async first() { return statement.get(...values) ?? null; },
      async all() { return { results: statement.all(...values) }; } };
  } } as unknown as D1Database;
  globalThis.programHubRole = 'super_admin';
  globalThis.programHubRuntime = 'local_staging';
  sqlite.exec("INSERT INTO users VALUES ('reviewer')");
  if (!empty) sqlite.exec(`
    INSERT INTO seller_profiles VALUES ('sale','sale-owner','Sale maker','approved'),
      ('fixed','fixed-owner','Fixed maker','approved'),('pending','pending-owner','Pending maker','submitted'),
      ('registered','other-owner','Registered seller','approved');
    INSERT INTO seller_participation_profiles VALUES
      ('sale','managed_maker','active','managed_sale_linked_percentage_v1','legal','issuer','beneficiary','agreement',1,4),
      ('fixed','managed_maker','approved_for_activation','managed_fixed_supplier_price_v1',NULL,NULL,NULL,NULL,NULL,3),
      ('pending','managed_maker','submitted',NULL,NULL,NULL,NULL,NULL,NULL,2),
      ('registered','registered_seller','active',NULL,NULL,NULL,NULL,NULL,NULL,1);
    INSERT INTO products VALUES ('sale-approved','sale','Approved sale product','approved',6),
      ('sale-published','sale','Published sale product','published',5),('sale-draft','sale','Sale draft','draft',4),
      ('fixed-approved','fixed','Fixed product','approved',3),('pending-draft','pending','Pending draft','draft',2),
      ('registered-product','registered','Registered product','approved',1),('fixed-archived','fixed','Archived product','archived',0);
    INSERT INTO managed_supply_records VALUES ('proposal','fixed','proposed'),('accepted','fixed','accepted'),
      ('other','registered','cancelled');
    INSERT INTO managed_supplier_payments(id,obligation_id,status) VALUES ('supplier-payment','accepted','approved');
    INSERT INTO managed_supplier_obligations VALUES ('accepted','fixed',1000);
    INSERT INTO seller_route_transition_applications VALUES ('transition','pending','submitted');
    INSERT INTO managed_entitlements VALUES ('earned','sale','earned'),('calculated','sale','calculated');
    INSERT INTO managed_payouts VALUES ('sale-payout','sale','prepared');
    INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,
      effective_from,reason,created_by,created_at,last_request_id)
      VALUES ('retention','managed_sale_linked_platform_retention_bps',1,'1200','published',1,'controlled',1,'Fixture','reviewer',1,'retention-fixture');`);
  return { sqlite, reads: () => reads };
}

void test('program hub uses recorded readiness and effective commercial terms with actionable queues for both models', async () => {
  const { sqlite } = await fixture();
  try {
    const Page = (await import('../app/admin/programs/page')).default;
    const html = renderToStaticMarkup(await Page());
    assert.match(html, /Maker applications/);
    assert.match(html, /Sale maker/);
    assert.match(html, /Fixed maker/);
    assert.match(html, /12% platform retention/);
    assert.match(html, /88% maker entitlement/);
    assert.doesNotMatch(html, /9% platform retention|91% maker entitlement|>Registered seller<|>Archived product</);
    assert.match(html, /href="\/admin\/sellers\/fixed#managed-maker-activation"/);
    assert.match(html, /href="\/admin\/sellers\/fixed#managed-program-records"/);
    assert.match(html, /href="\/admin\/products\/fixed-approved"/);
    assert.match(html, /Program settings/);
    assert.match(html, /Current value/);
    assert.match(html, /Live activation unavailable/);
  } finally { sqlite.close(); }
});

const workspaceContext = { actorId: 'reviewer', programMode: 'applications_only' as const, activeModel: null,
  environment: resolveRuntimeEnvironment({ runtimeEnvironment: 'local_staging', appOrigin: 'http://localhost:3000' }) };

void test('program aggregate keeps model totals accurate across products and financial records without join fanout', async () => {
  const { sqlite, reads } = await fixture();
  try {
    const { getProgramManagementWorkspace } = await import('../lib/managed-commerce/program-management');
    const workspace = await getProgramManagementWorkspace(globalThis.programHubDb, workspaceContext);
    assert.deepEqual(workspace.totals, { makers: 3, awaitingReview: 1, approvedProducts: 2, draftProducts: 2,
      publishedProducts: 1, proposedSupplies: 1, paymentActions: 1, pendingTransitions: 1,
      earnedEntitlements: 1, eligibleEntitlements: 0, pendingPayouts: 1 });
    assert.equal(workspace.modelTotals.find((row) => row.model === 'managed_sale_linked_percentage_v1')?.makers, 1);
    assert.equal(workspace.modelTotals.find((row) => row.model === 'managed_fixed_supplier_price_v1')?.makers, 1);
    assert.ok(reads() <= 4, 'Portfolio load must not query each individual maker workspace');
    assert.ok(workspace.makers.find((row) => row.id === 'fixed')?.outstanding.includes('Legal seller reference'));
  } finally { sqlite.close(); }
});

void test('product review includes under review and needs changes while deletion records remove actionable listings', async () => {
  const { sqlite } = await fixture();
  try {
    sqlite.exec(`INSERT INTO products VALUES ('needs-change','fixed','Needs change','needs_changes',7),
      ('under-review','fixed','Under review','under_review',8),('deleted-product','fixed','Deleted product','approved',9);
      INSERT INTO product_deletions VALUES ('deleted-product');`);
    const { getProgramManagementWorkspace } = await import('../lib/managed-commerce/program-management');
    const workspace = await getProgramManagementWorkspace(globalThis.programHubDb, workspaceContext);
    assert.equal(workspace.totals.draftProducts, 4);
    assert.equal(workspace.totals.approvedProducts, 2);
    assert.ok(workspace.products.some((row) => row.id === 'needs-change'));
    assert.ok(workspace.products.some((row) => row.id === 'under-review'));
    assert.equal(workspace.products.some((row) => row.id === 'deleted-product'), false);
  } finally { sqlite.close(); }
});

void test('transitioned makers keep outstanding supplier payment preparation visible outside the current applicant portfolio', async () => {
  const { sqlite } = await fixture();
  try {
    sqlite.exec(`UPDATE seller_participation_profiles SET participation_route='registered_seller',commercial_model=NULL WHERE seller_id='fixed';
      DELETE FROM managed_supplier_payments;
      INSERT INTO seller_route_transition_applications VALUES ('fixed-transition','fixed','applied');`);
    const { getProgramManagementWorkspace } = await import('../lib/managed-commerce/program-management');
    const workspace = await getProgramManagementWorkspace(globalThis.programHubDb, workspaceContext);
    assert.equal(workspace.totals.makers, 2);
    assert.equal(workspace.totals.paymentActions, 1);
    assert.equal(workspace.makers.some((row) => row.id === 'fixed'), false);
    assert.equal(workspace.legacyMakers[0].id, 'fixed');
  } finally { sqlite.close(); }
});

void test('missing environment bindings remain unverified and cannot present simulation readiness', async () => {
  const { sqlite } = await fixture(true);
  try {
    globalThis.programHubRuntime = '';
    const Page = (await import('../app/admin/programs/page')).default;
    const html = renderToStaticMarkup(await Page());
    assert.match(html, /Environment unverified/);
    assert.doesNotMatch(html, /SIMULATED — NOT VALID FOR PRODUCTION/);
  } finally { sqlite.close(); }
});

void test('retained supplier records render for registered sellers even without transition applications', async () => {
  const { ManagedProgramReview } = await import('../components/admin/managed-program-review');
  const html = renderToStaticMarkup(React.createElement(ManagedProgramReview, { sellerId: 'legacy', workspace: {
    participationRoute: 'registered_seller', applicationStage: 'active', commercialModel: null,
    products: [], transitions: [], supplies: [{ id: 'legacy-supply', productName: 'Legacy supply',
      quantityProposed: 1, quantityAccepted: 1, agreedUnitPaisa: 1000, acceptedTotalPaisa: 1000,
      status: 'accepted', possessionStatus: 'received', qualityStatus: 'accepted', evidenceReference: 'evidence',
      paymentId: null, paymentStatus: null, originalOwedPaisa: 1000, adjustedPaisa: 0, paidPaisa: 0, createdAt: 1 }],
  } }));
  assert.match(html, /Managed program records/);
  assert.match(html, /Legacy supply/);
  assert.match(html, /Create approved simulated payment/);
});

void test('activation model options refer to the configured rate rather than a fixed percentage', async () => {
  const { ManagedMakerActivationForm } = await import('../components/admin/managed-maker-activation-form');
  const html = renderToStaticMarkup(React.createElement(ManagedMakerActivationForm, { sellerId: 'fixed' }));
  assert.match(html, /accepted rate applies/);
  assert.doesNotMatch(html, /9%|91%/);
});

void test('portfolio display is capped while aggregate totals include records beyond the queue', async () => {
  const { sqlite } = await fixture();
  try {
    for (let index = 0; index < 51; index++) {
      sqlite.prepare('INSERT INTO seller_profiles VALUES (?,?,?,?)').run(`extra-${index}`, `owner-${index}`, `Extra maker ${index}`, 'submitted');
      sqlite.prepare(`INSERT INTO seller_participation_profiles VALUES (?, 'managed_maker','submitted',NULL,NULL,NULL,NULL,NULL,NULL,?)`).run(`extra-${index}`, 100 + index);
    }
    const { getProgramManagementWorkspace } = await import('../lib/managed-commerce/program-management');
    const workspace = await getProgramManagementWorkspace(globalThis.programHubDb, workspaceContext);
    assert.equal(workspace.makers.length, 50);
    assert.equal(workspace.totals.makers, 54);
    assert.equal(workspace.totals.approvedProducts, 2);
  } finally { sqlite.close(); }
});

void test('configured activation still requires an independent reviewer and an approved current product', async () => {
  const { sqlite } = await fixture();
  try {
    const { getProgramManagementWorkspace } = await import('../lib/managed-commerce/program-management');
    const configured = { ...workspaceContext, programMode: 'activation_enabled' as const,
      activeModel: 'managed_fixed_supplier_price_v1' as const };
    const ready = await getProgramManagementWorkspace(globalThis.programHubDb, configured);
    assert.equal(ready.makers.find((row) => row.id === 'fixed')?.canCompleteActivation, true);
    assert.ok(ready.makers.find((row) => row.id === 'fixed')?.outstanding.includes('Legal seller reference'),
      'Being able to open activation inputs must not imply those references have been recorded');
    const own = await getProgramManagementWorkspace(globalThis.programHubDb, { ...configured, actorId: 'fixed-owner' });
    assert.equal(own.makers.find((row) => row.id === 'fixed')?.canCompleteActivation, false);
    sqlite.exec("UPDATE products SET status='published' WHERE id='fixed-approved'");
    const publishedOnly = await getProgramManagementWorkspace(globalThis.programHubDb, configured);
    assert.equal(publishedOnly.makers.find((row) => row.id === 'fixed')?.canCompleteActivation, false);
    assert.ok(publishedOnly.makers.find((row) => row.id === 'fixed')?.outstanding.includes('At least one approved product'));
    sqlite.exec("UPDATE products SET status='approved' WHERE id='fixed-approved'; INSERT INTO product_deletions VALUES ('fixed-approved')");
    const deleted = await getProgramManagementWorkspace(globalThis.programHubDb, configured);
    assert.equal(deleted.makers.find((row) => row.id === 'fixed')?.canCompleteActivation, false);
  } finally { sqlite.close(); }
});

void test('supplier obligations fully offset by adjustments do not appear as an unpaid preparation action', async () => {
  const { sqlite } = await fixture();
  try {
    sqlite.exec("DELETE FROM managed_supplier_payments; INSERT INTO managed_supplier_adjustments VALUES ('full-offset','accepted',1000)");
    const { getProgramManagementWorkspace } = await import('../lib/managed-commerce/program-management');
    const workspace = await getProgramManagementWorkspace(globalThis.programHubDb, workspaceContext);
    assert.equal(workspace.totals.paymentActions, 0);
  } finally { sqlite.close(); }
});

void test('program hub blocks non Super Admin access before reading private records', async () => {
  const { sqlite, reads } = await fixture(true);
  try {
    const Page = (await import('../app/admin/programs/page')).default;
    for (const role of ['admin', 'customer', 'seller']) {
      globalThis.programHubRole = role;
      await assert.rejects(Page(), /ACCESS_DENIED/);
    }
    assert.equal(reads(), 0);
  } finally { sqlite.close(); }
});

void test('empty production workspace shows real empty states and keeps simulation activation unavailable', async () => {
  const { sqlite } = await fixture(true);
  try {
    globalThis.programHubRuntime = 'production';
    const Page = (await import('../app/admin/programs/page')).default;
    const html = renderToStaticMarkup(await Page());
    assert.match(html, /No Managed Maker applications/);
    assert.match(html, /No Managed Maker products/);
    assert.match(html, /Production activation blocked/);
    assert.doesNotMatch(html, /SIMULATED — NOT VALID FOR PRODUCTION|Simulated route ready/);
  } finally { sqlite.close(); }
});
