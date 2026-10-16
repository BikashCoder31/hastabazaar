import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixtureBrowser } from './helpers/browser-fixture-types';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { addActivationContractEvidence } from './helpers/activation-contract-fixture';

declare global { var financialRetryDb: D1Database }
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: `data:text/javascript,export const env={get DB(){return globalThis.financialRetryDb},HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'http://localhost:3000'}`, shortCircuit: true };
  if (specifier === '@/lib/db/repositories/business-settings') return { url: `data:text/javascript,
    export async function getEffectiveBusinessSetting(db,key){return {key,versionId:key+"-v1",value:key==='managed_maker_active_model'?'managed_sale_linked_percentage_v1':'activation_enabled'}}`, shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error {constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){return {id:'admin',role:'super_admin'}}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly sql: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.sql.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.sql.all(...this.values) as T[] }; }
  async run() { return { meta: { changes: Number(this.sql.run(...this.values).changes) } }; }
}
class Database {
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.sqlite.exec('BEGIN');
    try { const rows = []; for (const statement of statements) rows.push(await statement.run());
      this.sqlite.exec('COMMIT'); return rows; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
function activationFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT);
    CREATE TABLE staff_permission_profiles(user_id TEXT,permissions_json TEXT);
    CREATE TABLE staff_permission_guards(id TEXT,valid INTEGER CHECK(valid=1));
    CREATE TABLE operation_transaction_guards(id TEXT,valid INTEGER CHECK(valid=1));
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT);
    CREATE TABLE seller_participation_profiles(seller_id TEXT PRIMARY KEY,participation_route TEXT,application_stage TEXT,commercial_model TEXT,
      legal_seller_reference TEXT,invoice_issuer_reference TEXT,payout_beneficiary_reference TEXT,managed_agreement_version TEXT,
      managed_agreement_language TEXT,managed_agreement_accepted_at INTEGER,version INTEGER,updated_at INTEGER);
    CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT,status TEXT);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
    INSERT INTO users VALUES ('admin','active'),('maker','active');
    INSERT INTO user_roles VALUES ('admin','super_admin');
    INSERT INTO seller_profiles VALUES ('seller-one','maker');
    INSERT INTO seller_participation_profiles(seller_id,participation_route,application_stage,version)
      VALUES ('seller-one','managed_maker','approved_for_activation',0);
    INSERT INTO products VALUES ('product-one','seller-one','approved');`);
  for (const sql of readFileSync('drizzle/0056_form_catalog.sql', 'utf8').split('--> statement-breakpoint'))
    if (sql.trim()) sqlite.exec(sql);
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
    reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES ('managed-v1','staff.managed-maker-activation',1,1,'published',?,'Fixture','admin',1,'admin',1,'admin',1,'seed-managed')`)
    .run(JSON.stringify({ formId: 'staff.managed-maker-activation', fields: [] }));
  addActivationContractEvidence(sqlite);
  const database = new Database(sqlite) as unknown as D1Database;
  globalThis.financialRetryDb = database;
  return { sqlite, database };
}

void test('managed activation exact retry uses original server consent time, while changed terms and revoked staff fail', async () => {
  const { sqlite, database } = activationFixture();
  try {
    const { activateManagedMakerForSimulation } = await import('../lib/managed-commerce/activation');
    const { resolveRuntimeEnvironment } = await import('../lib/staging/environment');
    const options = { sellerId: 'seller-one', actorId: 'admin', model: 'managed_sale_linked_percentage_v1' as const,
      legalSellerReference: 'hastabazaar-company-406171-83-84', invoiceIssuerReference: 'hastabazaar-company-406171-83-84',
      payoutBeneficiaryReference: 'SIM-PAYOUT', acceptedManagedDetailId: 'activation-accepted-detail', agreementVersion: 'managed-maker-sale-linked-2026-10-13-v1', agreementLanguage: 'en' as const,
      agreementAcceptedAt: 100, requestId: 'managed-retry-one', now: 200,
      environment: resolveRuntimeEnvironment({ runtimeEnvironment: 'test' }),
      form: { requestId: 'managed-retry-one', versionId: 'managed-v1',
        answers: { formId: 'staff.managed-maker-activation' as const, version: 1, answers: [] } } };
    await activateManagedMakerForSimulation(database, options);
    await activateManagedMakerForSimulation(database, { ...options, agreementAcceptedAt: 300, now: 300 });
    await assert.rejects(() => activateManagedMakerForSimulation(database,
      { ...options, agreementAcceptedAt: 300, agreementVersion: 'SIM-CHANGED' }));
    await assert.rejects(() => activateManagedMakerForSimulation(database,
      { ...options, agreementAcceptedAt: 300, legalSellerReference: 'SIM-OTHER' }));
    sqlite.exec("DELETE FROM user_roles WHERE user_id='admin'");
    await assert.rejects(() => activateManagedMakerForSimulation(database,
      { ...options, agreementAcceptedAt: 300 }));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('managed activation route ignores client timestamps and replays after a new server clock tick', async () => {
  const { sqlite } = activationFixture();
  try {
    const { POST } = await import('../app/api/admin/managed-makers/[id]/activate/route');
    const path = 'http://localhost:3000/api/admin/managed-makers/seller-one/activate';
    const target = { params: Promise.resolve({ id: 'seller-one' }) };
    const body = { model: 'managed_sale_linked_percentage_v1', legalSellerReference: 'hastabazaar-company-406171-83-84',
      invoiceIssuerReference: 'hastabazaar-company-406171-83-84', payoutBeneficiaryReference: 'SIM-PAYOUT',
      acceptedManagedDetailId: 'activation-accepted-detail', agreementVersion: 'managed-maker-sale-linked-2026-10-13-v1', agreementLanguage: 'en', agreementAcceptedAt: -1,
      requestId: 'managed-route-retry', formVersion: 1, customAnswers: [] };
    const request = (value: unknown) => new Request(path, { method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify(value) });
    assert.equal((await POST(request(body), target)).status, 200);
    const acceptedAt = Number(sqlite.prepare("SELECT managed_agreement_accepted_at AS acceptedAt FROM seller_participation_profiles WHERE seller_id='seller-one'").get()?.acceptedAt);
    assert.ok(acceptedAt > 0);
    assert.equal((await POST(request({ ...body, agreementAcceptedAt: 999 }), target)).status, 200);
    assert.equal((await POST(request({ ...body, agreementVersion: 'SIM-CHANGED' }), target)).status, 409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('mounted financial staff forms retain opaque attempt IDs after uncertain responses and edits', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {InvoiceAdjustmentForm} from './components/admin/invoice-adjustment-form';
    import {ManagedMakerActivationForm} from './components/admin/managed-maker-activation-form';
    import {ParcelControls} from './components/admin/parcel-controls';
    createRoot(document.getElementById('root')).render(<>
      <InvoiceAdjustmentForm invoices={[{id:'invoice-one',invoiceNumber:'SIM-INV',issuerReference:'SIM-ISSUER',adjustmentCount:0}]} reasonCodes={['correction']} />
      <ManagedMakerActivationForm sellerId="seller-one" acceptedTerms={{detailId:'activation-accepted-detail',retentionBps:900,agreementVersion:'managed-maker-sale-linked-2026-10-13-v1'}} />
      <ParcelControls orderId="order-one" actorId="admin" canPrepare={false} records={[]} compensation={[]}
        parcels={[{id:'job-one',orderId:'order-one',sellerId:'seller-one',sellerName:'Maker',status:'pickup_requested',
          codDuePaisa:1000,collectedPaisa:0,remittedPaisa:0,version:0,method:'courier',riderUserId:null,
          courierName:null,trackingCode:null,trackingUrl:null,deliveredAt:null,paymentMode:'cod',openBoxRequired:0,
          openBoxSnapshotJson:null,riderFinanceSnapshotJson:null,latitude:null,longitude:null,accuracy:null,
          positionAt:null,courierCostPaisa:0}]} />
    </>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
    platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'retry-client-stubs', setup(bundler) { stubFixtureLink(bundler);
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'form-config', namespace: 'retry-stub' }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'retry-stub' }));
      bundler.onLoad({ filter: /^form-config$/, namespace: 'retry-stub' }, () => ({ contents: `
        const config=(formId)=>({formId,version:1,publishedAt:1,fields:[{id:'context_note',key:'context_note',label:'Staff context',type:'short_text',required:true,order:0,status:'active'}]});
        export function usePublishedFormConfig(formId){return {config:config(formId),canSubmit:true,status:'ready',message:'',refresh(){},handleSubmissionResponse(){return true}}}
      `, loader: 'js' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'retry-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const bodies: Record<string, unknown>[][] = [[], [], []];
  const confirmedBodies: (string | null)[] = [null, null, null];
  const paths = ['/api/admin/invoices/invoice-one/adjustments',
    '/api/admin/managed-makers/seller-one/activate', '/api/admin/orders/order-one/parcels'];
  try {
    await page.route('https://staff-retry.test/**', (route) => {
      const index = paths.indexOf(new URL(route.request().url()).pathname);
      if (route.request().method() === 'POST' && index >= 0) {
        bodies[index].push(JSON.parse(route.request().postData() ?? '{}'));
        if (confirmedBodies[index] !== null) return route.fulfill({ status: 200,
          contentType: 'application/json', body: confirmedBodies[index] });
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Uncertain fixture response"}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://staff-retry.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const invoice = page.locator('form[data-form-id="staff.invoice-adjustment"]');
    await invoice.getByLabel('Amount (NPR)').fill('5.00');
    await invoice.getByLabel('Review note').fill('Fictional invoice evidence');
    await invoice.getByLabel('Staff context').fill('Fictional adjustment context');
    await invoice.getByRole('button', { name: 'Issue simulated document' }).click();
    await invoice.getByText('Uncertain fixture response').waitFor();
    await invoice.getByLabel('Review note').fill('Fictional changed evidence');
    await invoice.getByRole('button', { name: 'Issue simulated document' }).click();
    assert.equal(bodies[0].length, 1, 'changed invoice payload must wait for explicit new-attempt confirmation');
    await page.reload(); await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const invoiceRetry = page.locator('form[data-form-id="staff.invoice-adjustment"]');
    await invoiceRetry.getByLabel('Amount (NPR)').fill('5.00');
    await invoiceRetry.getByLabel('Review note').fill('Fictional invoice evidence');
    await invoiceRetry.getByLabel('Staff context').fill('Fictional adjustment context');
    await invoiceRetry.getByRole('button', { name: 'Issue simulated document' }).click();
    await page.waitForFunction(() => document.querySelector('form[data-form-id="staff.invoice-adjustment"]')?.textContent?.includes('Uncertain fixture response'));
    assert.equal(bodies[0].length, 2);
    assert.equal(bodies[0][0].requestId, bodies[0][1].requestId);
    await invoiceRetry.getByLabel('Review note').fill('Fictional changed evidence');
    await invoiceRetry.getByRole('button', { name: 'Issue simulated document' }).click();
    assert.equal(bodies[0].length, 2);
    page.once('dialog', (dialog) => void dialog.accept());
    await invoiceRetry.getByRole('button', { name: 'Start a new attempt' }).click();
    await invoiceRetry.getByRole('button', { name: 'Issue simulated document' }).click();
    await page.waitForFunction(() => document.querySelector('form[data-form-id="staff.invoice-adjustment"]')?.textContent?.includes('Uncertain fixture response'));
    assert.equal(bodies[0].length, 3);
    assert.notEqual(bodies[0][2].requestId, bodies[0][0].requestId);
    const maker = page.locator('form[data-form-id="staff.managed-maker-activation"]');
    await maker.getByLabel('Reviewed receiving reference for this local simulation').fill('SIM-REVIEWED-RECEIVING');
    await maker.getByLabel('Staff context').fill('Fictional agreement context');
    await maker.getByRole('button', { name: 'Activate simulated route' }).click();
    await maker.getByText('Uncertain fixture response').waitFor();
    await page.reload(); await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const makerRetry = page.locator('form[data-form-id="staff.managed-maker-activation"]');
    await makerRetry.getByLabel('Reviewed receiving reference for this local simulation').fill('SIM-REVIEWED-RECEIVING');
    await makerRetry.getByLabel('Staff context').fill('Fictional agreement context');
    await makerRetry.getByRole('button', { name: 'Activate simulated route' }).click();
    await makerRetry.getByText('Uncertain fixture response').waitFor();
    assert.equal(bodies[1].length, 2);
    assert.equal(bodies[1][0].requestId, bodies[1][1].requestId);
    assert.equal(Object.hasOwn(bodies[1][0], 'agreementAcceptedAt'), false,
      'acceptance timestamp must be server-owned for a reload-safe replay');
    const parcel = page.locator('form[data-form-id="staff.parcel-control"]');
    await parcel.getByLabel('Operational note').fill('Fictional parcel evidence');
    await parcel.getByLabel('Staff context').fill('Fictional parcel context');
    await parcel.getByRole('button', { name: 'Save parcel action' }).click();
    await page.getByText('Uncertain fixture response').last().waitFor();
    await parcel.getByLabel('Operational note').fill('Fictional changed parcel evidence');
    await parcel.getByRole('button', { name: 'Save parcel action' }).click();
    assert.equal(bodies[2].length, 1, 'changed parcel payload must wait for explicit new-attempt confirmation');
    await page.reload(); await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const parcelRetry = page.locator('form[data-form-id="staff.parcel-control"]');
    await parcelRetry.getByLabel('Operational note').fill('Fictional parcel evidence');
    await parcelRetry.getByLabel('Staff context').fill('Fictional parcel context');
    await parcelRetry.getByRole('button', { name: 'Save parcel action' }).click();
    await page.getByText('Uncertain fixture response').last().waitFor();
    assert.equal(bodies[2].length, 2);
    assert.equal(bodies[2][0].requestId, bodies[2][1].requestId);
    for (const entries of bodies) {
      assert.equal(typeof entries[0].requestId, 'string');
      assert.equal(entries[0].formVersion, 1);
      assert.equal((entries[0].customAnswers as { fieldId: string }[])[0].fieldId, 'context_note');
    }
    const ambiguous = async (index: number, form: typeof parcelRetry, button: string) => {
      confirmedBodies[index] = '{}';
      const before = bodies[index].length;
      await form.getByRole('button', { name: button }).click();
      await (index === 2 ? page.getByText(/response could not be verified/i).last()
        : form.getByText(/response could not be verified/i)).waitFor({ timeout: 5000 });
      assert.equal(bodies[index].length, before + 1);
      assert.equal(bodies[index][before].requestId, bodies[index][before - 1].requestId,
        'ambiguous success must retain the same request reference');
      assert.ok((await page.evaluate(() => Object.values(sessionStorage)))
        .includes(String(bodies[index][before].requestId)));
    };
    await ambiguous(2, parcelRetry, 'Save parcel action');
    confirmedBodies[2] = '{"ok":true}';
    await parcelRetry.getByRole('button', { name: 'Save parcel action' }).click();
    await page.waitForFunction((id:string) => !Object.values(sessionStorage).includes(id),
      String(bodies[2][2].requestId));
    const makerAgain = page.locator('form[data-form-id="staff.managed-maker-activation"]');
    await makerAgain.getByLabel('Reviewed receiving reference for this local simulation').fill('SIM-REVIEWED-RECEIVING');
    await makerAgain.getByLabel('Staff context').fill('Fictional agreement context');
    await ambiguous(1, makerAgain, 'Activate simulated route');
    confirmedBodies[1] = '{"ok":true,"simulation":true}';
    await page.locator('form[data-form-id="staff.managed-maker-activation"]')
      .getByRole('button', { name: 'Activate simulated route' }).click();
    await page.waitForFunction((id:string) => !Object.values(sessionStorage).includes(id),
      String(bodies[1][2].requestId));
    const invoiceAgain = page.locator('form[data-form-id="staff.invoice-adjustment"]');
    await invoiceAgain.getByLabel('Amount (NPR)').fill('5.00');
    await invoiceAgain.getByLabel('Review note').fill('Fictional changed evidence');
    await invoiceAgain.getByLabel('Staff context').fill('Fictional adjustment context');
    await ambiguous(0, invoiceAgain, 'Issue simulated document');
    confirmedBodies[0] = '{"id":"adjustment-one","adjustmentNumber":"SIM-CREDIT-1","created":false,"simulation":true}';
    await invoiceAgain.getByRole('button', { name: 'Issue simulated document' }).click();
    await page.waitForFunction((id:string) => !Object.values(sessionStorage).includes(id),
      String(bodies[0][3].requestId));
  } finally { await browser.close(); }
});
