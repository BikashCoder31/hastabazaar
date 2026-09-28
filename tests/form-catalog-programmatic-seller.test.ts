import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';

interface BrowserLocator {
  getByLabel(name: string): BrowserLocator;
  getByRole(role: string, options?: { name: string }): BrowserLocator;
  getByText(text: string): BrowserLocator;
  first(): BrowserLocator; last(): BrowserLocator;
  fill(value: string): Promise<void>; click(): Promise<void>; waitFor(): Promise<void>;
}
interface BrowserRoute {
  request(): { method(): string; url(): string; postData(): string | null };
  fulfill(response: { status: number; contentType: string; body: string }): Promise<void>;
}
interface BrowserPage extends BrowserLocator {
  locator(selector: string): BrowserLocator;
  getByText(text: string): BrowserLocator;
  route(pattern: string, handler: (route: BrowserRoute) => Promise<void>): Promise<void>;
  goto(url: string): Promise<unknown>;
  addScriptTag(options: { content: string }): Promise<unknown>;
  waitForFunction(predicate: () => unknown): Promise<unknown>;
}
interface FixtureBrowser { newPage(): Promise<BrowserPage>; close(): Promise<void> }

import { reviewSellerApplication } from '../lib/db/repositories/seller-applications';
import { applySellerRestriction } from '../lib/db/repositories/seller-governance';
import { FORM_REGISTRY } from '../lib/forms/registry';

declare global { var sellerProgrammaticDb: D1Database }
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url:
    'data:text/javascript,export const env={get DB(){return globalThis.sellerProgrammaticDb}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error {constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){return {id:'super-one',role:'super_admin',permissions:[]}}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { return { meta: { changes: Number(this.statement.run(...this.values).changes) } }; }
}
class Database {
  beforeBatch?: () => void;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    const before = this.beforeBatch; this.beforeBatch = undefined; before?.();
    this.sqlite.exec('BEGIN');
    try {
      const rows = [];
      for (const statement of statements) rows.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return rows;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
const now = 1_800_000_000_000;
const field = { id: 'context_note', key: 'context_note', label: 'Staff context', type: 'short_text',
  required: true, order: 0, status: 'active' };
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter((item) => /^\d{4}_.+\.sql$/.test(item)).sort())
    for (const sql of readFileSync(`drizzle/${name}`, 'utf8').split('--> statement-breakpoint'))
      if (sql.trim()) sqlite.exec(sql);
  for (const [id, role] of [['super-one', 'super_admin'], ['review-admin', 'admin'], ['review-user', 'customer'],
    ['govern-user', 'customer']] as const) {
    sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'active',1,1)")
      .run(id, `${id}@example.test`, id);
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(id, role);
  }
  for (const [id, userId, status] of [['review-seller', 'review-user', 'submitted'],
    ['govern-seller', 'govern-user', 'approved']] as const)
    sqlite.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
      registration_number,tax_mode,tax_registration_number,representative_name,support_phone,
      support_email,province,district,municipality,locality,payout_account_reference,status,
      approved_at,created_at,updated_at)
      VALUES (?,?,'Seller Legal','Seller Shop','Local',?,'PAN',
        ?,'Representative','9800000000',?,'Bagmati',
        'Kathmandu','Kathmandu','Test address','TEST-PAYOUT',?,?,1,1)`)
      .run(id, userId, `REG-${id}`, `PAN-${id}`, `${userId}@example.test`,
        status, status === 'approved' ? now : null);
  for (const formId of ['staff.seller-review-action', 'staff.seller-governance'])
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
      reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?,?,1,1,'published',?,'Fixture','super-one',1,'super-one',1,'super-one',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [field] }), `seed-${formId}`);
  const wrapper = new Database(sqlite);
  globalThis.sellerProgrammaticDb = wrapper as unknown as D1Database;
  return { sqlite, wrapper, database: wrapper as unknown as D1Database };
}
function form(formId: 'staff.seller-review-action' | 'staff.seller-governance', value = 'Fictional staff evidence') {
  return { versionId: `${formId}-v1`, answers: { formId, version: 1, answers: [
    { fieldId: 'context_note', label: 'Staff context', type: 'short_text' as const, value },
  ] } };
}
function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

async function assertArchivedRouteReplay(sqlite: DatabaseSync, formId: string, actorId: string,
  send: (body: unknown) => Promise<Response>, body: Record<string, unknown>) {
  const counts = () => ['form_answer_sets', 'audit_logs'].map(table => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n);
  const before = counts();
  sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    SELECT ?,form_id,2,2,'published',json_set(config_json,'$.fields[0].status','archived'),'Archived field',?,2,?,2,?,2,?
    FROM form_config_versions WHERE id=?`).run(`${formId}-archived-v2`,actorId,actorId,actorId,`${formId}-archive`,`${formId}-v1`);
  assert.equal((await send(body)).status,200,'Exact replay after the configured field is archived');
  assert.deepEqual(counts(),before);
  sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(actorId);
  assert.notEqual((await send(body)).status,200,'Historical replay must reauthorize the current actor');
  assert.deepEqual(counts(),before);
}

void test('seller review route enforces the live required staff field before transition', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/seller-applications/[id]/review/route');
    const path = '/api/admin/seller-applications/review-seller/review';
    const payload = { action: 'start_review', reason: 'Starting documented review.',
      requestId: 'review-route-1', formVersion: 1, customAnswers: [] };
    const context = { params: Promise.resolve({ id: 'review-seller' }) };
    assert.equal(FORM_REGISTRY['staff.seller-review-action'].adapterId, 'staff.seller-review-action');
    assert.equal((await POST(post(path, payload), context)).status, 400);
    assert.equal(sqlite.prepare("SELECT status FROM seller_profiles WHERE id='review-seller'").get()?.status, 'submitted');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 0);
    const accepted = { ...payload, customAnswers: [{ fieldId: 'context_note', value: 'Checked seller evidence' }] };
    const response = await POST(post(path, accepted), context);
    assert.equal(response.status, 200);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 1);
    assert.equal((await POST(post(path, accepted), context)).status, 200);
    assert.equal((await POST(post(path, { ...accepted, reason: 'A different decision note' }), context)).status, 409);
    await assertArchivedRouteReplay(sqlite, 'staff.seller-review-action', 'super-one', value => POST(post(path,value),context), accepted);
  } finally { sqlite.close(); }
});

void test('seller governance route requires live custom context for restrictions but leaves no-input preflight intact', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/sellers/[id]/governance/route');
    const path = '/api/admin/sellers/govern-seller/governance';
    const context = { params: Promise.resolve({ id: 'govern-seller' }) };
    const payload = { action: 'set_restriction', mode: 'disabled', obligationMode: 'admin_review',
      reasonCode: 'performance_review', reason: 'Documented performance concern.',
      expectedVersion: 0, requestId: 'govern-route-1', formVersion: 1, customAnswers: [] };
    assert.equal(FORM_REGISTRY['staff.seller-governance'].adapterId, 'staff.seller-governance');
    assert.equal((await POST(post(path, payload), context)).status, 400);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM seller_restrictions').get()?.n, 0);
    const accepted = { ...payload, customAnswers: [{ fieldId: 'context_note', value: 'Reviewed governance evidence' }] };
    assert.equal((await POST(post(path, accepted), context)).status, 200);
    assert.equal((await POST(post(path, accepted), context)).status, 200);
    assert.equal((await POST(post(path, { ...accepted, reason: 'Different governance evidence' }), context)).status, 409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 1);
    const preflight = await POST(post(path, { action: 'deletion_preflight' }), context);
    assert.equal(preflight.status, 200);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 1);
    await assertArchivedRouteReplay(sqlite, 'staff.seller-governance', 'super-one', value => POST(post(path,value),context), accepted);
  } finally { sqlite.close(); }
});

void test('seller review action stores one staff answer with the exact transition', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { sellerId: 'review-seller', actorId: 'super-one',
      action: 'start_review', reason: 'Starting documented review.', requestId: 'review-action-1',
      now, form: form('staff.seller-review-action') } as const;
    await reviewSellerApplication(database, options);
    const answers = sqlite.prepare("SELECT form_id,subject_type,subject_id,actor_id FROM form_answer_sets WHERE request_id='review-action-1'")
      .all().map((row) => ({ ...row }));
    assert.deepEqual(answers, [{ form_id: 'staff.seller-review-action', subject_type: 'seller',
      subject_id: 'review-seller', actor_id: 'super-one' }]);
    await reviewSellerApplication(database, options);
    await assert.rejects(() => reviewSellerApplication(database, { ...options,
      reason: 'Changed review conclusion.' }), /different review details/i);
    await assert.rejects(() => reviewSellerApplication(database, { ...options,
      form: form('staff.seller-review-action', 'Changed private custom answer') }),
    /different review details/i);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='staff.seller-review-action'")
      .get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('seller application review preserves delegated Admin authority', async () => {
  const { sqlite, database } = fixture();
  try {
    await reviewSellerApplication(database, { sellerId: 'review-seller', actorId: 'review-admin',
      action: 'start_review', reason: 'Starting documented review.', requestId: 'admin-review-1',
      now, form: form('staff.seller-review-action') });
    assert.equal(sqlite.prepare("SELECT status FROM seller_profiles WHERE id='review-seller'").get()?.status, 'under_review');
    assert.equal(sqlite.prepare("SELECT actor_id FROM form_answer_sets WHERE request_id='admin-review-1'").get()?.actor_id,
      'review-admin');
  } finally { sqlite.close(); }
});

void test('seller governance restriction stores one staff answer in its transaction', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { sellerId: 'govern-seller', actorId: 'super-one',
      mode: 'disabled', obligationMode: 'admin_review', reasonCode: 'performance_review',
      reason: 'Documented performance concern.', expectedVersion: 0, requestId: 'seller-restrict-1',
      now, form: form('staff.seller-governance') } as const;
    await applySellerRestriction(database, options);
    const answers = sqlite.prepare("SELECT form_id,subject_type,subject_id,actor_id FROM form_answer_sets WHERE request_id='seller-restrict-1'")
      .all().map((row) => ({ ...row }));
    assert.deepEqual(answers, [{ form_id: 'staff.seller-governance', subject_type: 'seller',
      subject_id: 'govern-seller', actor_id: 'super-one' }]);
    assert.equal((await applySellerRestriction(database, options)).version, 1);
    await assert.rejects(() => applySellerRestriction(database, { ...options,
      reason: 'Changed governance reason.' }), /another governance action/i);
    await assert.rejects(() => applySellerRestriction(database, { ...options,
      form: form('staff.seller-governance', 'Changed private custom answer') }),
    /another governance action/i);
    await applySellerRestriction(database, { ...options, mode: 'active', reason: 'Restriction review completed.',
      expectedVersion: 1, requestId: 'seller-restrict-2' });
    await assert.rejects(() => applySellerRestriction(database, options), /changed|another governance action/i);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='staff.seller-governance'")
      .get()?.n, 2);
  } finally { sqlite.close(); }
});

void test('ignored seller review and restriction writes cannot leave phantom answers', async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.exec(`CREATE TRIGGER ignore_review BEFORE UPDATE ON seller_profiles
      WHEN NEW.review_request_id='ignored-review' BEGIN SELECT RAISE(IGNORE); END`);
    sqlite.exec(`CREATE TRIGGER ignore_restriction BEFORE INSERT ON seller_restrictions
      BEGIN SELECT RAISE(IGNORE); END`);
    await assert.rejects(() => reviewSellerApplication(database, { sellerId: 'review-seller',
      actorId: 'super-one', action: 'start_review', reason: 'Starting documented review.',
      requestId: 'ignored-review', now, form: form('staff.seller-review-action') }));
    await assert.rejects(() => applySellerRestriction(database, { sellerId: 'govern-seller',
      actorId: 'super-one', mode: 'disabled', obligationMode: 'admin_review',
      reasonCode: 'performance_review', reason: 'Documented performance concern.',
      expectedVersion: 0, requestId: 'ignored-restriction', now,
      form: form('staff.seller-governance') }));
    assert.equal(sqlite.prepare("SELECT status FROM seller_profiles WHERE id='review-seller'").get()?.status, 'submitted');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM seller_restrictions').get()?.n, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id IN ('ignored-review','ignored-restriction:audit')").get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('seller receivers classify a publication racing their real domain batch and leave zero effects', async () => {
  for (const id of ['staff.seller-review-action','staff.seller-governance'] as const) {
    const {sqlite,database,wrapper}=fixture();
    globalThis.sellerProgrammaticDb=database as unknown as D1Database;
    try {
      wrapper.beforeBatch=()=>sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT ?||'-v2',form_id,2,2,'published',config_json,'Race','super-one',2,'super-one',2,'super-one',2,?||'-race-v2' FROM form_config_versions WHERE id=?||'-v1'`).run(id,id,id);
      const tables=['seller_profiles','seller_restrictions','seller_restriction_events','audit_logs','form_answer_sets'];
      const before=tables.map(table=>sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
      const customAnswers=[{fieldId:'context_note',value:'Fictional staff evidence'}];
      const body=id==='staff.seller-review-action'?{action:'start_review',reason:'Fictional review started',requestId:'review-race-one',formVersion:1,customAnswers}
        :{action:'set_restriction',mode:'disabled',obligationMode:'admin_review',reasonCode:'performance_review',reason:'Fictional restriction reviewed',expectedVersion:0,requestId:'governance-race-one',formVersion:1,customAnswers};
      const request=new Request('https://seller-route.test/api/admin/sellers',{method:'POST',headers:{origin:'https://seller-route.test','content-type':'application/json'},body:JSON.stringify(body)});
      const response=id==='staff.seller-review-action'
        ?await (await import('../app/api/admin/seller-applications/[id]/review/route')).POST(request,{params:Promise.resolve({id:'review-seller'})})
        :await (await import('../app/api/admin/sellers/[id]/governance/route')).POST(request,{params:Promise.resolve({id:'govern-seller'})});
      assert.equal(response.status,409,id);
      assert.equal((await response.json() as {code?:string}).code,'stale_version',id);
      assert.deepEqual(tables.map(table=>sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()),before,id);
    } finally { sqlite.close(); }
  }
});

void test('mounted seller controls send configured context with stable retry IDs', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {SellerReviewActions} from './components/admin/seller-review-actions';
    import {SellerGovernanceActions} from './components/admin/seller-governance-actions';
    createRoot(document.getElementById('root')).render(<>
      <SellerReviewActions sellerId="review-seller" status="submitted" />
      <SellerGovernanceActions sellerId="govern-seller" current={null} />
    </>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
    platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'seller-client-stubs', setup(bundler) {
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'form-config', namespace: 'seller-stub' }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'seller-stub' }));
      bundler.onResolve({ filter: /^@\/components\/ui\/alert-dialog$/ }, () => ({ path: 'dialog', namespace: 'seller-stub' }));
      bundler.onLoad({ filter: /^form-config$/, namespace: 'seller-stub' }, () => ({ contents: `
        const config=(formId)=>({formId,version:1,publishedAt:1,fields:[{id:'context_note',key:'context_note',label:'Staff context',type:'short_text',required:true,order:0,status:'active'}]});
        export function usePublishedFormConfig(formId){return {config:config(formId),canSubmit:true,status:'ready',message:'',refresh(){},handleSubmissionResponse(){return true}}}
      `, loader: 'js' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'seller-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
      bundler.onLoad({ filter: /^dialog$/, namespace: 'seller-stub' }, () => ({ resolveDir: process.cwd(), contents: `
        import React from 'react';
        export function AlertDialog({open,children}){return open?<div role="dialog">{children}</div>:null}
        export function AlertDialogContent({children}){return <div>{children}</div>}
        export function AlertDialogHeader({children}){return <div>{children}</div>}
        export function AlertDialogTitle({children}){return <h2>{children}</h2>}
        export function AlertDialogDescription({children}){return <p>{children}</p>}
        export function AlertDialogFooter({children}){return <div>{children}</div>}
        export function AlertDialogAction({children,onClick,disabled}){return <button type="button" disabled={disabled} onClick={onClick}>{children}</button>}
        export function AlertDialogCancel({children,disabled}){return <button type="button" disabled={disabled}>{children}</button>}
      `, loader: 'tsx' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const bodies: { path: string; body: Record<string, unknown> }[] = [];
  try {
    await page.route('https://seller-controls.test/**', (route) => {
      if (route.request().method() === 'POST') {
        const path = new URL(route.request().url()).pathname;
        bodies.push({ path, body: JSON.parse(route.request().postData() ?? '{}') });
        return route.fulfill({ status: bodies.filter((item) => item.path === path).length === 1 ? 503 : 200,
          contentType: 'application/json', body: '{"error":"Temporary failure"}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://seller-controls.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const review = page.locator('form[data-form-id="staff.seller-review-action"]');
    await review.getByLabel('Staff context').fill('Seller evidence reviewed');
    await review.getByRole('button', { name: 'Start review' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Start review' }).click();
    await page.getByText('Temporary failure').first().waitFor();
    await review.getByRole('button', { name: 'Start review' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Start review' }).click();
    const governance = page.locator('form[data-form-id="staff.seller-governance"]');
    await governance.getByLabel('Private decision note').fill('Fictional seller review documented');
    await governance.getByLabel('Staff context').fill('Governance evidence reviewed');
    await governance.getByRole('button', { name: 'Record seller decision' }).click();
    await page.getByText('Temporary failure').last().waitFor();
    await governance.getByRole('button', { name: 'Record seller decision' }).click();
    assert.equal(bodies.length, 4);
    for (const [first, retry] of [[bodies[0], bodies[1]], [bodies[2], bodies[3]]]) {
      assert.equal(first.body.requestId, retry.body.requestId);
      assert.equal(first.body.formVersion, 1);
      assert.equal((first.body.customAnswers as { fieldId: string }[])[0].fieldId, 'context_note');
    }
  } finally { await browser.close(); }
});
