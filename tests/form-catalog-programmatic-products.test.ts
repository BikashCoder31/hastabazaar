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

import { reviewProduct, setHomepageProductVisibility } from '../lib/db/repositories/products';
import { FORM_REGISTRY } from '../lib/forms/registry';

declare global { var productCatalogDb: D1Database }
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url:
    'data:text/javascript,export const env={get DB(){return globalThis.productCatalogDb}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error {constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(permission){return {id:'super-one',authSubject:'fixture-super-one',role:'super_admin',permissions:[permission]}}`, shortCircuit: true };
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
  beforeBatch?: () => void;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    const before = this.beforeBatch; this.beforeBatch = undefined; before?.();
    this.sqlite.exec('BEGIN');
    try { const rows = []; for (const statement of statements) rows.push(await statement.run());
      this.sqlite.exec('COMMIT'); return rows; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
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
  for (const [id, role] of [['super-one', 'super_admin'], ['admin-one', 'admin'], ['seller-user', 'customer']] as const) {
    sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES (?,?,?,?,'active',1,1)")
      .run(id, `fixture-${id}`, `${id}@example.test`, id);
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(id, role);
  }
  sqlite.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
    registration_number,tax_mode,tax_registration_number,representative_name,support_phone,
    support_email,province,district,municipality,locality,payout_account_reference,status,
    approved_at,created_at,updated_at)
    VALUES ('seller-one','seller-user','Seller Legal','Seller Shop','Local','REG-ONE','PAN',
      'PAN-ONE','Representative','9800000000','seller@example.test','Bagmati',
      'Kathmandu','Kathmandu','Test address','TEST-PAYOUT','approved',?,1,1)`).run(now);
  sqlite.exec(`INSERT INTO categories(id,slug,name_en,name_ne,is_active,sort_order,created_at,updated_at)
    VALUES ('category-one','craft','Craft','Craft',1,0,1,1)`);
  for (const [id, status] of [['review-product', 'submitted'], ['homepage-product', 'published']] as const)
    sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,
      price_paisa,inventory_quantity,producer,materials,status,published_at,created_at,updated_at)
      VALUES (?,'seller-one','category-one',?,?,?,'Fictional description',1000,5,
        'Fictional maker','Cotton',?,?,1,1)`).run(id, id, id, id, status,
        status === 'published' ? now : null);
  for (const formId of ['staff.product-review', 'staff.homepage-visibility'])
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,
      reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES (?,?,1,1,'published',?,'Fixture','super-one',1,'super-one',1,'super-one',1,?)`)
      .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [field] }), `seed-${formId}`);
  const wrapper = new Database(sqlite);
  globalThis.productCatalogDb = wrapper as unknown as D1Database;
  return { sqlite, wrapper, database: wrapper as unknown as D1Database };
}
function form(formId: 'staff.product-review' | 'staff.homepage-visibility', value = 'Fictional staff evidence') {
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

void test('product review route requires published staff context before its transition', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/products/[id]/review/route');
    const path = '/api/admin/products/review-product/review';
    const target = { params: Promise.resolve({ id: 'review-product' }) };
    const body = { action: 'start_review', reason: 'Starting documented review.',
      requestId: 'review-route-one', formVersion: 1, customAnswers: [] };
    assert.equal(FORM_REGISTRY['staff.product-review'].adapterId, 'staff.product-review');
    assert.equal((await POST(post(path, body), target)).status, 400);
    assert.equal(sqlite.prepare("SELECT status FROM products WHERE id='review-product'").get()?.status, 'submitted');
    const accepted = { ...body, customAnswers: [{ fieldId: 'context_note', value: 'Fictional review evidence' }] };
    assert.equal((await POST(post(path, accepted), target)).status, 200);
    assert.equal((await POST(post(path, accepted), target)).status, 200);
    assert.equal((await POST(post(path, { ...accepted, reason: 'Different review reason' }), target)).status, 409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 1);
    await assertArchivedRouteReplay(sqlite, 'staff.product-review', 'super-one', value => POST(post(path,value),target), accepted);
  } finally { sqlite.close(); }
});

void test('homepage route requires published context and never accepts protected decision answers', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/admin/products/[id]/homepage/route');
    const path = '/api/admin/products/homepage-product/homepage';
    const target = { params: Promise.resolve({ id: 'homepage-product' }) };
    const body = { hidden: true, expectedVersion: 0, reason: 'Fictional homepage placement decision.',
      requestId: 'homepage-route-one', formVersion: 1, customAnswers: [] };
    assert.equal(FORM_REGISTRY['staff.homepage-visibility'].adapterId, 'staff.homepage-visibility');
    assert.equal((await POST(post(path, body), target)).status, 400);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM homepage_product_controls').get()?.n, 0);
    assert.equal((await POST(post(path, { ...body,
      customAnswers: [{ fieldId: 'hidden', value: false }] }), target)).status, 400);
    const accepted = { ...body, customAnswers: [{ fieldId: 'context_note', value: 'Fictional placement evidence' }] };
    assert.equal((await POST(post(path, accepted), target)).status, 200);
    assert.equal((await POST(post(path, accepted), target)).status, 200);
    assert.equal((await POST(post(path, { ...accepted, reason: 'Changed placement reason' }), target)).status, 409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 1);
    await assertArchivedRouteReplay(sqlite, 'staff.homepage-visibility', 'super-one', value => POST(post(path,value),target), accepted);
  } finally { sqlite.close(); }
});

void test('product review atomically links exact staff context to one moderation transition', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { productId: 'review-product', actorId: 'admin-one', action: 'start_review' as const,
      reason: 'Starting documented review.', requestId: 'product-review-one', now,
      form: form('staff.product-review') };
    assert.equal(await reviewProduct(database, options), 'under_review');
    assert.deepEqual(sqlite.prepare("SELECT form_id,subject_type,subject_id,actor_id FROM form_answer_sets WHERE request_id='product-review-one'").all().map((row) => ({ ...row })),
      [{ form_id: 'staff.product-review', subject_type: 'product', subject_id: 'review-product', actor_id: 'admin-one' }]);
    assert.equal(await reviewProduct(database, options), 'under_review');
    await assert.rejects(() => reviewProduct(database, { ...options, reason: 'Changed review details.' }), /different|reused/i);
    await assert.rejects(() => reviewProduct(database, { ...options,
      form: form('staff.product-review', 'Changed staff answer') }), /different|reused/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('homepage visibility atomically links exact staff context and rejects changed or stale replay', async () => {
  const { sqlite, database } = fixture();
  try {
    const options = { productId: 'homepage-product', actorId: 'super-one', hidden: true,
      expectedVersion: 0, reason: 'Remove from fictional homepage placement.',
      requestId: 'homepage-visibility-one', now, form: form('staff.homepage-visibility') };
    assert.deepEqual(await setHomepageProductVisibility(database, options), { hidden: true, version: 1 });
    assert.equal(sqlite.prepare("SELECT subject_id FROM form_answer_sets WHERE request_id='homepage-visibility-one'").get()?.subject_id,
      'homepage-product');
    assert.deepEqual(await setHomepageProductVisibility(database, options), { hidden: true, version: 1 });
    await assert.rejects(() => setHomepageProductVisibility(database, { ...options,
      reason: 'Changed placement conclusion.' }), /different|reused/i);
    await assert.rejects(() => setHomepageProductVisibility(database, { ...options,
      form: form('staff.homepage-visibility', 'Changed answer') }), /different|reused/i);
    await assert.rejects(() => setHomepageProductVisibility(database, { ...options,
      actorId: 'admin-one', requestId: 'homepage-admin-denied' }), /Super Admin/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('ignored product writes cannot leave phantom moderation or homepage answers', async () => {
  const { sqlite, database } = fixture();
  try {
    const initialAudits = Number(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n);
    sqlite.exec(`CREATE TRIGGER ignore_review BEFORE UPDATE ON products
      WHEN NEW.review_request_id='ignored-review' BEGIN SELECT RAISE(IGNORE); END`);
    sqlite.exec(`CREATE TRIGGER ignore_homepage BEFORE INSERT ON homepage_product_controls
      BEGIN SELECT RAISE(IGNORE); END`);
    await assert.rejects(() => reviewProduct(database, { productId: 'review-product', actorId: 'admin-one',
      action: 'start_review', reason: 'Starting documented review.', requestId: 'ignored-review', now,
      form: form('staff.product-review') }));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 0,
      'ignored review must not leave an answer');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n, initialAudits,
      'ignored review must not leave an audit');
    await assert.rejects(() => setHomepageProductVisibility(database, { productId: 'homepage-product',
      actorId: 'super-one', hidden: true, expectedVersion: 0,
      reason: 'Fictional homepage decision.', requestId: 'ignored-homepage', now,
      form: form('staff.homepage-visibility') }));
    assert.deepEqual(sqlite.prepare('SELECT form_id FROM form_answer_sets').all().map((row) => row.form_id), []);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n, initialAudits);
    assert.equal(sqlite.prepare("SELECT status FROM products WHERE id='review-product'").get()?.status, 'submitted');
  } finally { sqlite.close(); }
});

void test('product receivers classify a publication racing their real domain batch and leave zero effects', async () => {
  for (const id of ['staff.product-review','staff.homepage-visibility'] as const) {
    const {sqlite,database,wrapper}=fixture();
    globalThis.productCatalogDb=database as unknown as D1Database;
    try {
      wrapper.beforeBatch=()=>sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        SELECT ?||'-v2',form_id,2,2,'published',config_json,'Race','super-one',2,'super-one',2,'super-one',2,?||'-race-v2' FROM form_config_versions WHERE id=?||'-v1'`).run(id,id,id);
      const tables=['products','homepage_product_controls','audit_logs','form_answer_sets'];
      const before=tables.map(table=>sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
      const customAnswers=[{fieldId:'context_note',value:'Fictional staff evidence'}];
      const body=id==='staff.product-review'?{action:'start_review',reason:'Fictional review started',requestId:'product-race-one',formVersion:1,customAnswers}
        :{hidden:true,expectedVersion:0,reason:'Fictional placement review',requestId:'homepage-race-one',formVersion:1,customAnswers};
      const request=new Request('https://product-route.test/api/admin/products',{method:'POST',headers:{origin:'https://product-route.test','content-type':'application/json'},body:JSON.stringify(body)});
      const response=id==='staff.product-review'
        ?await (await import('../app/api/admin/products/[id]/review/route')).POST(request,{params:Promise.resolve({id:'review-product'})})
        :await (await import('../app/api/admin/products/[id]/homepage/route')).POST(request,{params:Promise.resolve({id:'homepage-product'})});
      assert.equal(response.status,409,id);
      assert.equal((await response.json() as {code?:string}).code,'stale_version',id);
      assert.deepEqual(tables.map(table=>sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()),before,id);
    } finally { sqlite.close(); }
  }
});

void test('mounted product decisions render configured context and retain opaque IDs through retry', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {ProductReviewActions} from './components/admin/product-review-actions';
    import {HomepageVisibilityControl} from './components/admin/homepage-visibility-control';
    createRoot(document.getElementById('root')).render(<>
      <ProductReviewActions productId="review-product" status="submitted" />
      <HomepageVisibilityControl actorId="super-one" productId="homepage-product" productName="Fictional product" hidden={false} version={0} lastReason={null} />
    </>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
    platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'product-client-stubs', setup(bundler) {
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'form-config', namespace: 'product-stub' }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'product-stub' }));
      bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'product-stub' }));
      bundler.onResolve({ filter: /^@\/components\/ui\/alert-dialog$/ }, () => ({ path: 'dialog', namespace: 'product-stub' }));
      bundler.onLoad({ filter: /^form-config$/, namespace: 'product-stub' }, () => ({ contents: `
        const config=(formId)=>({formId,version:1,publishedAt:1,fields:[{id:'context_note',key:'context_note',label:'Staff context',type:'short_text',required:true,order:0,status:'active'}]});
        export function usePublishedFormConfig(formId){return {config:config(formId),canSubmit:true,status:'ready',message:'',refresh(){},handleSubmissionResponse(){return true}}}
      `, loader: 'js' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'product-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
      bundler.onLoad({ filter: /^link$/, namespace: 'product-stub' }, () => ({ resolveDir: process.cwd(), contents: "import React from 'react';export default function Link(props){return <a {...props}/>}", loader: 'tsx' }));
      bundler.onLoad({ filter: /^dialog$/, namespace: 'product-stub' }, () => ({ resolveDir: process.cwd(), contents: `
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
  const reviewBodies: Record<string, unknown>[] = [];
  const homepageBodies: Record<string, unknown>[] = [];
  try {
    await page.route('https://product-controls.test/**', (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() ?? '{}');
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/review')) reviewBodies.push(body);
        if (path.endsWith('/homepage')) homepageBodies.push(body);
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Uncertain decision response"}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('https://product-controls.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const review = page.locator('form[data-form-id="staff.product-review"]');
    await review.getByLabel('Staff context').fill('Fictional review evidence');
    await review.getByRole('button', { name: 'Start review' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Start review' }).click();
    await page.getByText('Uncertain decision response').first().waitFor();
    await review.getByRole('button', { name: 'Start review' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Start review' }).click();
    await page.waitForFunction(() => document.querySelector('form[data-form-id="staff.product-review"]')?.textContent?.includes('Uncertain decision response'));
    assert.equal(reviewBodies.length, 2);
    assert.equal(reviewBodies[0].requestId, reviewBodies[1].requestId);
    assert.equal(reviewBodies[0].formVersion, 1);
    const homepageButton = page.getByRole('button', { name: 'Hide from homepage' }).first();
    await homepageButton.click();
    const homepage = page.locator('form[data-form-id="staff.homepage-visibility"]');
    await homepage.getByLabel('Decision reason').fill('Fictional homepage decision');
    await homepage.getByLabel('Staff context').fill('Fictional placement evidence');
    await homepage.getByRole('button', { name: 'Hide from homepage' }).click();
    await homepage.getByText('Uncertain decision response').waitFor();
    await homepage.getByRole('button', { name: 'Retry original action' }).click();
    await page.waitForFunction(() => document.querySelector('form[data-form-id="staff.homepage-visibility"]')?.textContent?.includes('Uncertain decision response'));
    assert.equal(homepageBodies.length, 2);
    assert.equal(homepageBodies[0].requestId, homepageBodies[1].requestId);
    assert.deepEqual(homepageBodies[0], homepageBodies[1], 'The original homepage action is retried unchanged');
    assert.equal(homepageBodies[0].formVersion, 1);
    assert.equal((homepageBodies[0].customAnswers as { fieldId: string }[])[0].fieldId, 'context_note');
  } finally { await browser.close(); }
});
