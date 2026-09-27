import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { build } from 'esbuild';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { validateAnswersForDefinition, validateFormDraft } from '../lib/forms/validation';
import { listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '../lib/forms/access';
import { createSellerApplication, updateSellerParticipationPublicProfile } from '../lib/db/repositories/seller-applications';
import { updateSellerProfile } from '../lib/db/repositories/seller-profile';
import { createProductSubmission, setProductInventory } from '../lib/db/repositories/products';
import { parseSellerApplication } from '../lib/sellers/application';

declare global {
  var sellerCatalogDb: D1Database;
  var sellerCatalogActor: { sellerId: string; userId: string } | null;
  var sellerCatalogMedia: { stored: string[]; deleted: string[]; put(key: string): Promise<void>; delete(key: string): Promise<void> };
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.sellerCatalogDb},get MEDIA(){return globalThis.sellerCatalogMedia}}', shortCircuit: true };
  if (specifier === '@/lib/auth/seller') return { url: `data:text/javascript,
    export class SellerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireSellerApi(){if(!globalThis.sellerCatalogActor)throw new SellerAuthorizationError('Authentication is required.',401);return globalThis.sellerCatalogActor}
    export async function requireSellerPage(){if(!globalThis.sellerCatalogActor)throw new SellerAuthorizationError('Authentication is required.',401);return globalThis.sellerCatalogActor}`, shortCircuit: true };
  if (specifier === '@/lib/auth/customer') return { url: `data:text/javascript,
    export class CustomerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireCustomerApi(){if(!globalThis.sellerCatalogActor)throw new CustomerAuthorizationError('Authentication is required.',401);return globalThis.sellerCatalogActor}
    export async function requireCustomerPage(){if(!globalThis.sellerCatalogActor)throw new CustomerAuthorizationError('Authentication is required.',401);return globalThis.sellerCatalogActor}
    export async function getCustomerUser(){return null}`, shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function notFound(){throw new Error("Not found")};export function redirect(){throw new Error("Redirect")};export function useRouter(){return {refresh(){}}}', shortCircuit: true };
  if (specifier === 'next/link') return { url: 'data:text/javascript,export default function Link({children}){return children}', shortCircuit: true };
  if (specifier === '@/components/layout/site-header' || specifier === '@/components/layout/site-footer')
    return { url: 'data:text/javascript,export function SiteHeader(){return null};export function SiteFooter(){return null}', shortCircuit: true };
  return nextResolve(specifier, context);
} });

const sellerForms = [
  ['seller.application', '/api/seller-applications'],
  ['seller.maker-profile', '/api/seller-applications/profile'],
  ['seller.profile', '/api/seller/profile'],
  ['seller.product-submission', '/api/seller/products'],
  ['seller.inventory', '/api/seller/products/:id/inventory'],
] as const;
const field = { id: 'workshop_note', key: 'workshop_note', type: 'short_text', label: 'Workshop note', required: true, order: 0, status: 'active' } as const;
const safeTypes = ['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone'];

void test('all five seller form adapters publish only safe custom types and lock identity, money, media, and request controls', () => {
  for (const [id, route] of sellerForms) {
    const definition = FORM_REGISTRY[id];
    assert.equal(IMPLEMENTED_FORM_ADAPTERS[id]?.route, route);
    assert.equal(definition.adapterId, id);
    assert.deepEqual(definition.capabilities.customFieldTypes, safeTypes);
    assert.equal(definition.capabilities.answerBehavior, 'record');
    assert.deepEqual(validateFormDraft(id, { formId: id, fields: [field] }).fields, [field]);
  }
  for (const [id, keys] of [
    ['seller.application', ['legalName', 'taxMode', 'registrationNumber', 'document', 'profileImage', 'makerVideo', 'requestId']],
    ['seller.maker-profile', ['sellerId', 'expectedVersion', 'requestId']],
    ['seller.profile', ['sellerId', 'idempotencyKey', 'legalName', 'payoutAccountReference']],
    ['seller.product-submission', ['sku', 'price', 'inventoryQuantity', 'image', 'video', 'reviewRequestId', 'requestId']],
    ['seller.inventory', ['quantity', 'reason', 'requestId', 'productId']],
  ] as const) {
    for (const key of keys) {
      assert.equal(FORM_REGISTRY[id].baseFields.find((item) => item.key === key)?.capability, 'protected', `${id}.${key}`);
    }
  }
});

void test('seller publications require custom values and reject unknown or non-text upload answers', () => {
  for (const [id] of sellerForms) {
    const config = { formId: id, version: 1, publishedAt: 1, fields: [field] } as const;
    assert.throws(() => validateAnswersForDefinition(FORM_REGISTRY[id], config, []), { fieldId: field.id });
    assert.throws(() => validateAnswersForDefinition(FORM_REGISTRY[id], config, [{ fieldId: 'unknown', value: 'x' }]));
    assert.throws(() => validateAnswersForDefinition(FORM_REGISTRY[id], config, [{ fieldId: field.id, value: new File(['private'], 'identity.png', { type: 'image/png' }) }]));
  }
});

async function renderSellerForm(entry: string, exported: string, props: Record<string, unknown>, configuredFields: unknown[] = [field]) {
  const compiled = await build({
    entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [{ name: 'seller-form-test-boundaries', setup(b) {
      b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'seller-test' }));
      b.onLoad({ filter: /^link$/, namespace: 'seller-test' }, () => ({ contents: "const React=require('react');module.exports=function Link(props){return React.createElement('a',props);};", loader: 'js' }));
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'seller-test' }));
      b.onLoad({ filter: /^navigation$/, namespace: 'seller-test' }, () => ({ contents: 'exports.useRouter=()=>({refresh(){}});', loader: 'js' }));
      b.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'seller-test' }));
      b.onLoad({ filter: /^config$/, namespace: 'seller-test' }, () => ({ contents: `exports.usePublishedFormConfig=(id)=>({config:{formId:id,version:3,publishedAt:1,fields:${JSON.stringify(configuredFields)}},status:'ready',canSubmit:true,message:'',refresh(){},handleSubmissionResponse(){return true}});`, loader: 'js' }));
    } }],
  });
  const renderedModule = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> };
  runInNewContext(compiled.outputFiles[0].text, { require: createRequire(import.meta.url), module: renderedModule, exports: renderedModule.exports, process });
  return renderToStaticMarkup(createElement(renderedModule.exports[exported], props));
}

void test('actual seller controls render the published required custom field and version on every site', async () => {
  const application = await renderSellerForm('components/seller/seller-application-form.tsx', 'SellerApplicationForm', {});
  const maker = await renderSellerForm('components/seller/maker-application-profile-form.tsx', 'MakerApplicationProfileForm', {
    profile: { publicName: 'Fictional Studio', publicCity: 'Kathmandu', craftExperience: [], socialLinks: {}, version: 1 },
  });
  const profile = await renderSellerForm('components/seller/seller-profile-form.tsx', 'SellerProfileForm', {
    profile: { tradingName: 'Fictional Studio', businessDescription: null, productCategories: null, supportPhone: '9800000000', supportEmail: 'studio@example.test', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', ward: null, locality: 'Private workshop' },
  });
  const product = await renderSellerForm('components/seller/product-submission-form.tsx', 'ProductSubmissionForm', { categories: [], occasions: [] });
  const inventory = await renderSellerForm('components/seller/inventory-editor.tsx', 'InventoryEditor', { productId: 'product-1', quantity: 4, productName: 'Fictional item' });
  for (const [id, html] of [['seller.application', application], ['seller.maker-profile', maker], ['seller.profile', profile], ['seller.product-submission', product], ['seller.inventory', inventory]]) {
    assert.ok(/data-configured-field="workshop_note"/.test(html), `${id}: published field absent`);
    const control = (html.match(/<input\b[^>]*>/g) ?? []).find((tag) => tag.includes('name="custom.workshop_note"'));
    assert.ok(control && /\brequired(?:=|\s|>)/.test(control), `${id}: required control absent`);
    assert.ok(/name="formVersion" value="3"/.test(html), `${id}: version absent`);
  }
});

void test('safe built-in display labels follow the published seller configuration without changing validation', async () => {
  const cases = [
    ['components/seller/seller-application-form.tsx', 'SellerApplicationForm', {}, 'tradingName'],
    ['components/seller/maker-application-profile-form.tsx', 'MakerApplicationProfileForm',
      { profile: { publicName: 'Fictional Studio', publicCity: 'Kathmandu', craftExperience: [], socialLinks: {}, version: 1 } }, 'publicName'],
    ['components/seller/seller-profile-form.tsx', 'SellerProfileForm',
      { profile: { tradingName: 'Fictional Studio', businessDescription: null, productCategories: null,
        supportPhone: '9800000000', supportEmail: 'studio@example.test', province: 'Bagmati', district: 'Kathmandu',
        municipality: 'Kathmandu', ward: null, locality: 'Private workshop' } }, 'tradingName'],
    ['components/seller/product-submission-form.tsx', 'ProductSubmissionForm', { categories: [], occasions: [] }, 'nameEn'],
  ] as const;
  for (const [entry, exported, props, key] of cases) {
    const html = await renderSellerForm(entry, exported, props, [{ id: key, key, type: 'short_text',
      label: 'Configured public label', required: true, order: 0, status: 'active' }]);
    assert.match(html, /Configured public label/, `${entry} did not render its safe built-in label`);
  }
});

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { const result = this.statement.run(...this.values); return { success: true, meta: { changes: Number(result.changes) }, results: [] }; }
}
class Database {
  failAt: number | null = null;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        if (index === this.failAt) throw new Error('Simulated domain batch failure');
        results.push(await statement.run());
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of (await readdir(new URL('../drizzle/', import.meta.url))).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    const source = await readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
    for (const part of source.split('--> statement-breakpoint')) if (part.trim()) sqlite.exec(part);
  }
  sqlite.exec("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES ('admin','admin@example.test','Fictional Admin','active',1,1)");
  sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat-test','fictional-clay','Fictional Clay',1,1,1,1)");
  const db = new Database(sqlite);
  globalThis.sellerCatalogDb = db as unknown as D1Database;
  globalThis.sellerCatalogActor = { sellerId: 'seller-one', userId: 'seller-user' };
  globalThis.sellerCatalogMedia = { stored: [], deleted: [], async put(key) { this.stored.push(key); },
    async delete(key) { this.deleted.push(key); } };
  return { sqlite, db, database: db as unknown as D1Database };
}
function seed(sqlite: DatabaseSync, formId: string, fields: unknown[] = [field]) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?, ?, 1, 1, 'published', ?, 'Test publication', 'admin', 1, 'admin', 1, 'admin', 1, ?)`)
    .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields }), `seed-${formId}`);
}
function managedApplication() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    hasBusinessTaxRegistration: 'no', applicantType: 'individual', legalName: 'Fictional Maker', tradingName: 'Fictional Studio',
    email: 'maker@example.test', phone: '9800000000', province: 'Madhesh', district: 'Parsa', municipality: 'Birgunj',
    locality: 'Private workshop', publicCity: 'Birgunj', businessDescription: 'Fictional handcrafted goods.',
    productCategories: 'Clay', experienceCraft: 'Clay', experienceBand: 'less_than_one_year', applicationAcknowledgement: 'yes',
  })) form.set(key, value);
  return form;
}
const answer = { formId: 'seller.application', version: 1, answers: [{ fieldId: field.id, label: field.label, type: field.type, value: 'Fictional answer' }] } as const;
function formLink(formId: string, requestId: string) {
  return { requestId, versionId: `${formId}-v1`, answers: { ...answer, formId } };
}
async function createSeller(database: D1Database, sellerId = 'seller-one', userId = 'seller-user') {
  const parsed = parseSellerApplication(managedApplication());
  assert.ok(parsed.input, parsed.errors.join('; '));
  await createSellerApplication(database, { userId, sellerId, applicationReference: `HB-TEST-${sellerId}`,
    input: { ...parsed.input, email: `${sellerId}@example.test`, phone: sellerId === 'seller-one' ? '9800000000' : '9800000001' },
    documents: [], now: 1_800_000_000_000 });
}
const productInput = {
  categoryId: 'cat-test', occasionIds: [], sku: '', nameEn: 'Fictional clay cup', nameNe: null,
  descriptionEn: 'A fictional staging-only product.', descriptionNe: null, pricePaisa: 100_000,
  compareAtPricePaisa: null, inventoryQuantity: 4, producer: 'Fictional Maker', materials: ['Clay'],
  originStory: null, dimensions: null, size: null, colour: null, variations: null, specifications: null,
  careInstructions: null, safetyInformation: null, returnConditions: null, returnEligible: true,
  warranty: null, madeToOrder: true, preparationDays: 3, manufacturedAt: null, expiresAt: null,
  licenceReference: null,
};

void test('seller application answer is linked atomically to its new seller and not stored on failed domain write', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    seed(sqlite, 'seller.application');
    const parsed = parseSellerApplication(managedApplication());
    assert.ok(parsed.input, parsed.errors.join('; '));
    await createSellerApplication(database, { userId: 'seller-user', sellerId: 'seller-one', applicationReference: 'HB-TEST-1',
      input: parsed.input, documents: [], now: 1_800_000_000_000,
      form: formLink('seller.application', 'application-one') } as Parameters<typeof createSellerApplication>[1]);
    const history = await listFormAnswersForSubject(database, 'seller', 'seller-one');
    assert.equal(history.length, 1);
    assert.equal(history[0].actorId, 'seller-user');
    assert.deepEqual(history[0].answers.answers, answer.answers);
    db.failAt = 0;
    await assert.rejects(createSellerApplication(database, { userId: 'failed-user', sellerId: 'failed-seller', applicationReference: 'HB-TEST-FAIL',
      input: { ...parsed.input, email: 'failed@example.test' }, documents: [], now: 1_800_000_000_001,
      form: formLink('seller.application', 'application-fail') } as Parameters<typeof createSellerApplication>[1]));
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='application-fail'").get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('maker and approved seller profile edits link one versioned answer to the owned seller', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.maker-profile');
    seed(sqlite, 'seller.profile');
    await updateSellerParticipationPublicProfile(database, {
      sellerId: 'seller-one', actorId: 'seller-user', expectedVersion: 1, publicName: 'Fictional Studio',
      publicCity: 'Birgunj', craftExperience: [], socialLinks: {}, requestId: 'maker-profile-one',
      now: 1_800_000_000_100, form: formLink('seller.maker-profile', 'maker-profile-one'),
    } as Parameters<typeof updateSellerParticipationPublicProfile>[1]);
    sqlite.prepare("UPDATE seller_profiles SET status='approved' WHERE id='seller-one'").run();
    await updateSellerProfile(database, { sellerId: 'seller-one', actorId: 'seller-user', requestId: 'seller-profile-one',
      now: 1_800_000_000_200, input: { tradingName: 'Fictional Studio', businessDescription: 'Fictional clay work.',
        productCategories: 'Clay', supportPhone: '9800000000', supportEmail: 'shop@example.test', province: 'Madhesh',
        district: 'Parsa', municipality: 'Birgunj', ward: null, locality: 'Private workshop' },
      form: formLink('seller.profile', 'seller-profile-one') } as Parameters<typeof updateSellerProfile>[1]);
    const history = await listFormAnswersForSubject(database, 'seller', 'seller-one');
    assert.deepEqual(history.map((item) => item.formId), ['seller.maker-profile', 'seller.profile']);
    assert.ok(history.every((item) => item.actorId === 'seller-user'));
  } finally { sqlite.close(); }
});

void test('product draft and submitted listing retain distinct answer snapshots, while inventory links to the exact product', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.product-submission');
    seed(sqlite, 'seller.inventory');
    for (const [productId, intent] of [['draft-product', 'draft'], ['submitted-product', 'submit']] as const) {
      await createProductSubmission(database, { productId, sellerId: 'seller-one', actorId: 'seller-user',
        slug: productId, input: productInput, images: [], intent, now: 1_800_000_000_300,
        form: formLink('seller.product-submission', `${productId}-request`) } as Parameters<typeof createProductSubmission>[1]);
      assert.equal((sqlite.prepare('SELECT status FROM products WHERE id=?').get(productId) as { status: string }).status,
        intent === 'draft' ? 'draft' : 'submitted');
      const history = await listFormAnswersForSubject(database, 'product', productId);
      assert.equal(history.length, 1);
      assert.equal(history[0].actorId, 'seller-user');
    }
    await setProductInventory(database, { productId: 'draft-product', sellerId: 'seller-one', actorId: 'seller-user',
      quantity: 6, reason: 'Fictional stock count', now: 1_800_000_000_400,
      form: formLink('seller.inventory', 'inventory-one') } as Parameters<typeof setProductInventory>[1]);
    const history = await listFormAnswersForSubject(database, 'product', 'draft-product');
    assert.deepEqual(history.map((item) => item.formId), ['seller.product-submission', 'seller.inventory']);
    assert.equal((sqlite.prepare("SELECT inventory_quantity AS quantity FROM products WHERE id='draft-product'").get() as { quantity: number }).quantity, 6);
  } finally { sqlite.close(); }
});

void test('foreign seller cannot change product inventory or attach a custom answer', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.product-submission');
    seed(sqlite, 'seller.inventory');
    await createProductSubmission(database, { productId: 'owned-product', sellerId: 'seller-one', actorId: 'seller-user',
      slug: 'owned-product', input: productInput, images: [], intent: 'draft', now: 1_800_000_000_300 });
    await assert.rejects(setProductInventory(database, { productId: 'owned-product', sellerId: 'other-seller', actorId: 'other-user',
      quantity: 8, reason: 'Foreign attempt', now: 1_800_000_000_400,
      form: formLink('seller.inventory', 'foreign-inventory') } as Parameters<typeof setProductInventory>[1]));
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='foreign-inventory'").get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT inventory_quantity AS quantity FROM products WHERE id='owned-product'").get() as { quantity: number }).quantity, 4);
  } finally { sqlite.close(); }
});

void test('exact inventory request retry is one domain action and changed-body reuse conflicts', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.inventory');
    await createProductSubmission(database, { productId: 'retry-product', sellerId: 'seller-one', actorId: 'seller-user',
      slug: 'retry-product', input: productInput, images: [], intent: 'draft', now: 1_800_000_000_300 });
    const request = { productId: 'retry-product', sellerId: 'seller-one', actorId: 'seller-user', quantity: 6,
      reason: 'Fictional count', now: 1_800_000_000_400, form: formLink('seller.inventory', 'inventory-retry') };
    await setProductInventory(database, request as Parameters<typeof setProductInventory>[1]);
    await setProductInventory(database, request as Parameters<typeof setProductInventory>[1]);
    await assert.rejects(setProductInventory(database, { ...request, quantity: 7 } as Parameters<typeof setProductInventory>[1]));
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_adjustments WHERE product_id='retry-product'").get() as { count: number }).count, 2);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='inventory-retry'").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT inventory_quantity AS quantity FROM products WHERE id='retry-product'").get() as { quantity: number }).quantity, 6);
  } finally { sqlite.close(); }
});

void test('inventory route enforces current required custom answers, stale version, unknown field, and exact retry', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.inventory');
    await createProductSubmission(database, { productId: 'route-product', sellerId: 'seller-one', actorId: 'seller-user',
      slug: 'route-product', input: productInput, images: [], intent: 'draft', now: 1_800_000_000_300 });
    const { PATCH } = await import('../app/api/seller/products/[id]/inventory/route');
    const send = (body: unknown) => PATCH(new Request('http://localhost:3000/api/seller/products/route-product/inventory', {
      method: 'PATCH', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: 'route-product' }) });
    const body = { quantity: 7, reason: 'Fictional stock count', requestId: 'route-inventory', formVersion: 1,
      customAnswers: [{ fieldId: field.id, value: 'Fictional answer' }] };
    assert.equal((await send({ ...body, requestId: 'missing-answer', customAnswers: [] })).status, 400);
    assert.equal((await send({ ...body, requestId: 'stale-version', formVersion: 2 })).status, 409);
    assert.equal((await send({ ...body, requestId: 'unknown-answer', customAnswers: [{ fieldId: 'unknown', value: 'x' }] })).status, 400);
    assert.equal((await send(body)).status, 200);
    assert.equal((await send(body)).status, 200);
    assert.equal((await send({ ...body, quantity: 8 })).status, 409);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('seller.inventory-v2','seller.inventory',2,1,'published',?,'Archive','admin',2,'admin',2,'admin',2,'seed-inventory-v2')`)
      .run(JSON.stringify({ formId: 'seller.inventory', fields: [{ ...field, status: 'archived' }] }));
    const afterPublication = await send(body);
    assert.equal(afterPublication.status, 200, JSON.stringify(await afterPublication.json()));
    assert.equal((await send({ ...body, quantity: 8 })).status, 409);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='route-inventory'").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT inventory_quantity AS quantity FROM products WHERE id='route-product'").get() as { quantity: number }).quantity, 7);
  } finally { sqlite.close(); }
});

void test('maker and approved seller profile routes require versioned custom answers and reject changed retry', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.maker-profile');
    seed(sqlite, 'seller.profile');
    const { PATCH: makerPatch } = await import('../app/api/seller-applications/profile/route');
    const makerBody = { publicName: 'Fictional Studio', publicCity: 'Birgunj', expectedVersion: 1,
      requestId: 'maker-route-one', formVersion: 1, customAnswers: [{ fieldId: field.id, value: 'Fictional answer' }] };
    const sendMaker = (body: unknown) => makerPatch(new Request('http://localhost:3000/api/seller-applications/profile', {
      method: 'PATCH', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.equal((await sendMaker({ ...makerBody, requestId: 'maker-missing', customAnswers: [] })).status, 400);
    assert.equal((await sendMaker(makerBody)).status, 200);
    assert.equal((await sendMaker(makerBody)).status, 200);
    assert.equal((await sendMaker({ ...makerBody, publicCity: 'Kathmandu' })).status, 409);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('seller.maker-profile-v2','seller.maker-profile',2,1,'published',?,'Archive','admin',2,'admin',2,'admin',2,'seed-maker-v2')`)
      .run(JSON.stringify({ formId: 'seller.maker-profile', fields: [{ ...field, status: 'archived' }] }));
    assert.equal((await sendMaker(makerBody)).status, 200);
    assert.equal((await sendMaker({ ...makerBody, publicCity: 'Kathmandu' })).status, 409);
    assert.equal((await sendMaker({ ...makerBody, requestId: 'maker-new-stale' })).status, 409);
    sqlite.prepare("UPDATE seller_profiles SET status='approved' WHERE id='seller-one'").run();
    const { PATCH: profilePatch } = await import('../app/api/seller/profile/route');
    const profile = { tradingName: 'Fictional Studio', businessDescription: null, productCategories: null,
      supportPhone: '9800000000', supportEmail: 'shop@example.test', province: 'Madhesh', district: 'Parsa',
      municipality: 'Birgunj', ward: null, locality: 'Private workshop' };
    const profileBody = { profile, idempotencyKey: 'profile-route-one', formVersion: 1,
      customAnswers: [{ fieldId: field.id, value: 'Fictional answer' }] };
    const sendProfile = (body: unknown) => profilePatch(new Request('http://localhost:3000/api/seller/profile', {
      method: 'PATCH', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.equal((await profilePatch(new Request('http://localhost:3000/api/seller/profile', {
      method: 'PATCH', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: '{invalid',
    }))).status, 400);
    assert.equal((await sendProfile({ ...profileBody, idempotencyKey: 'profile-missing', customAnswers: [] })).status, 400);
    assert.equal((await sendProfile(profileBody)).status, 200);
    assert.equal((await sendProfile(profileBody)).status, 200);
    assert.equal((await sendProfile({ ...profileBody, profile: { ...profile, tradingName: 'Changed name' } })).status, 409);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('seller.profile-v2','seller.profile',2,1,'published',?,'Archive','admin',2,'admin',2,'admin',2,'seed-profile-replay-v2')`)
      .run(JSON.stringify({ formId: 'seller.profile', fields: [{ ...field, status: 'archived' }] }));
    assert.equal((await sendProfile(profileBody)).status, 200);
    assert.equal((await sendProfile({ ...profileBody, profile: { ...profile, tradingName: 'Changed name' } })).status, 409);
    assert.equal((await sendProfile({ ...profileBody, idempotencyKey: 'profile-new-stale' })).status, 409);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets WHERE subject_type=? AND subject_id=?').get('seller', 'seller-one') as { count: number }).count, 2);
  } finally { sqlite.close(); }
});

void test('application route rejects missing, unknown and file custom answers and replays only the same application', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'seller.application');
    const { POST } = await import('../app/api/seller-applications/route');
    const send = (requestId: string, options: { answer?: string | null; unknown?: boolean; tradingName?: string } = {}) => {
      const form = managedApplication();
      form.set('tradingName', options.tradingName ?? 'Fictional Studio');
      form.set('formVersion', '1');
      form.set('requestId', requestId);
      if (options.answer === 'file') form.set('custom.workshop_note', new File(['private'], 'identity.png', { type: 'image/png' }));
      else if (options.answer !== null) form.set('custom.workshop_note', options.answer ?? 'Fictional answer');
      if (options.unknown) form.set('custom.not_published', 'not allowed');
      return POST(new Request('http://localhost:3000/api/seller-applications', { method: 'POST',
        headers: { origin: 'http://localhost:3000' }, body: form }));
    };
    assert.equal((await send('application-missing', { answer: null })).status, 400);
    assert.equal((await send('application-unknown', { unknown: true })).status, 400);
    assert.equal((await send('application-file', { answer: 'file' })).status, 400);
    const first = await send('application-route-one');
    assert.equal(first.status, 201);
    const reference = (await first.json() as { applicationReference: string }).applicationReference;
    const retry = await send('application-route-one');
    assert.equal(retry.status, 201);
    assert.equal((await retry.json() as { applicationReference: string }).applicationReference, reference);
    assert.equal((await send('application-route-one', { tradingName: 'Changed Studio' })).status, 409);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('seller.application-v2','seller.application',2,1,'published',?,'Archive','admin',2,'admin',2,'admin',2,'seed-application-replay-v2')`)
      .run(JSON.stringify({ formId: 'seller.application', fields: [{ ...field, status: 'archived' }] }));
    assert.equal((await send('application-route-one')).status, 201);
    assert.equal((await send('application-route-one', { tradingName: 'Changed Studio' })).status, 409);
    assert.equal((await send('application-new-stale')).status, 409);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM seller_profiles WHERE support_email='maker@example.test'").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='application-route-one'").get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

function productForm(requestId: string, options: { custom?: string | null; name?: string; version?: number } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ categoryId: 'cat-test', nameEn: options.name ?? 'Fictional Clay Cup',
    descriptionEn: 'A fictional staging-only product.', price: '1000', inventoryQuantity: '4',
    preparationDays: '3', occasionIds: 'occasion-test', madeToOrder: 'yes', returnEligible: 'no', materials: 'Clay' }))
    form.set(key, value);
  form.set('requestId', requestId);
  form.set('formVersion', String(options.version ?? 1));
  if (options.custom === 'file') form.set('custom.workshop_note', new File(['private'], 'id.png', { type: 'image/png' }));
  else if (options.custom !== null) form.set('custom.workshop_note', options.custom ?? 'Fictional answer');
  for (let index = 1; index <= 4; index++)
    form.set(`image${index}`, new File([new Uint8Array([0xff, 0xd8, 0xff, index])], `angle-${index}.jpg`, { type: 'image/jpeg' }));
  return form;
}

void test('product POST enforces custom answers and media rules before an owned draft/submit write and exact replay', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.product-submission');
    sqlite.exec("INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('occasion-test','fictional-gift','Fictional Gift',1,1,1,1)");
    const { POST } = await import('../app/api/seller/products/route');
    const send = (requestId: string, options: Parameters<typeof productForm>[1] = {}) =>
      POST(new Request('http://localhost:3000/api/seller/products', { method: 'POST',
        headers: { origin: 'http://localhost:3000' }, body: productForm(requestId, options) }));
    assert.equal((await send('product-missing', { custom: null })).status, 400);
    assert.equal((await send('product-file', { custom: 'file' })).status, 400);
    assert.equal((await send('product-stale', { version: 2 })).status, 409);
    const created = await send('product-route-one');
    assert.equal(created.status, 201);
    const id = (await created.json() as { id: string }).id;
    const replay = await send('product-route-one');
    assert.equal(replay.status, 201);
    assert.equal((await replay.json() as { id: string }).id, id);
    assert.equal((await send('product-route-one', { name: 'Changed Clay Cup' })).status, 409);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('seller.product-submission-v2','seller.product-submission',2,1,'published',?,'Archive','admin',2,'admin',2,'admin',2,'seed-product-post-replay-v2')`)
      .run(JSON.stringify({ formId: 'seller.product-submission', fields: [{ ...field, status: 'archived' }] }));
    assert.equal((await send('product-route-one')).status, 201);
    assert.equal((await send('product-route-one', { name: 'Changed Clay Cup' })).status, 409);
    assert.equal((await send('product-new-stale')).status, 409);
    const history = await listFormAnswersForSubject(database, 'product', id);
    assert.equal(history.length, 1);
    assert.equal(globalThis.sellerCatalogMedia.stored.length, 4);
  } finally { sqlite.close(); }
});

void test('product revision validates custom answers, preserves owner/media gates, and exact retry does not revise twice', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.product-submission');
    sqlite.exec("INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('occasion-test','fictional-gift','Fictional Gift',1,1,1,1)");
    const { POST } = await import('../app/api/seller/products/route');
    const created = await POST(new Request('http://localhost:3000/api/seller/products', { method: 'POST',
      headers: { origin: 'http://localhost:3000' }, body: productForm('product-create-before-revision') }));
    assert.equal(created.status, 201);
    const id = (await created.json() as { id: string }).id;
    sqlite.prepare("UPDATE products SET status='needs_changes' WHERE id=?").run(id);
    const { PATCH } = await import('../app/api/seller/products/[id]/route');
    const send = (requestId: string, options: { custom?: string | null; name?: string } = {}) => {
      const form = productForm(requestId, { custom: options.custom, name: options.name });
      for (let index = 1; index <= 4; index++) form.delete(`image${index}`);
      form.set('reviewRequestId', '');
      return PATCH(new Request(`http://localhost:3000/api/seller/products/${id}`, { method: 'PATCH',
        headers: { origin: 'http://localhost:3000' }, body: form }), { params: Promise.resolve({ id }) });
    };
    assert.equal((await send('revision-missing', { custom: null })).status, 400);
    globalThis.sellerCatalogActor = { sellerId: 'other-seller', userId: 'other-user' };
    assert.equal((await send('revision-foreign')).status, 404);
    globalThis.sellerCatalogActor = { sellerId: 'seller-one', userId: 'seller-user' };
    assert.equal((await send('revision-one')).status, 200);
    assert.equal((await send('revision-one')).status, 200);
    assert.equal((await send('revision-one', { name: 'Changed revision' })).status, 409);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('seller.product-submission-v2','seller.product-submission',2,1,'published',?,'Archive','admin',2,'admin',2,'admin',2,'seed-product-patch-replay-v2')`)
      .run(JSON.stringify({ formId: 'seller.product-submission', fields: [{ ...field, status: 'archived' }] }));
    assert.equal((await send('revision-one')).status, 200);
    assert.equal((await send('revision-one', { name: 'Changed revision' })).status, 409);
    assert.equal((await send('revision-new-stale')).status, 409);
    const answers = await listFormAnswersForSubject(database, 'product', id);
    assert.equal(answers.length, 2);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE subject_id=? AND action='product.resubmitted'").get(id) as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('product answer read follows the owning seller profile, never another seller or broad staff role', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    await createSeller(database, 'seller-two', 'seller-two-user');
    sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('seller-user','seller',1),('seller-two-user','seller',1)").run();
    seed(sqlite, 'seller.product-submission');
    await createProductSubmission(database, { productId: 'private-product', sellerId: 'seller-one', actorId: 'seller-user',
      slug: 'private-product', input: productInput, images: [], intent: 'draft', now: 1_800_000_000_300,
      form: formLink('seller.product-submission', 'private-product-answer') } as Parameters<typeof createProductSubmission>[1]);
    const [answerSet] = await listFormAnswersForSubject(database, 'product', 'private-product');
    assert.ok(answerSet);
    assert.equal(await authorizeFormAnswerRead(database, { id: 'seller-user', role: 'seller' }, answerSet), true);
    assert.equal(await authorizeFormAnswerRead(database, { id: 'seller-two-user', role: 'seller' }, answerSet), false);
    assert.equal(await authorizeFormAnswerRead(database, { id: 'admin', role: 'admin' }, answerSet), false);
  } finally { sqlite.close(); }
});

void test('record-local product history renders archived field snapshots only for the owning seller', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('seller-user','seller',1)").run();
    seed(sqlite, 'seller.product-submission');
    await createProductSubmission(database, { productId: 'history-product', sellerId: 'seller-one', actorId: 'seller-user',
      slug: 'history-product', input: productInput, images: [], intent: 'draft', now: 1_800_000_000_300,
      form: formLink('seller.product-submission', 'history-answer') } as Parameters<typeof createProductSubmission>[1]);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('seller.product-submission-v2','seller.product-submission',2,1,'published',?,'Archive','admin',2,'admin',2,'admin',2,'seed-product-v2')`)
      .run(JSON.stringify({ formId: 'seller.product-submission', fields: [{ ...field, status: 'archived' }] }));
    const page = await import('../app/seller/products/[id]/answers/page');
    const rendered = await page.default({ params: Promise.resolve({ id: 'history-product' }), searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(rendered);
    assert.match(html, /Workshop note/);
    assert.match(html, /Fictional answer/);
    assert.match(html, /Historical/);
    globalThis.sellerCatalogActor = { sellerId: 'other-seller', userId: 'other-user' };
    await assert.rejects(page.default({ params: Promise.resolve({ id: 'history-product' }), searchParams: Promise.resolve({}) }), /Not found/);
  } finally { sqlite.close(); }
});

void test('seller profile history is owner-only and keeps archived answers', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('seller-user','seller',1)").run();
    sqlite.prepare("UPDATE seller_profiles SET status='approved' WHERE id='seller-one'").run();
    seed(sqlite, 'seller.profile');
    await updateSellerProfile(database, { sellerId: 'seller-one', actorId: 'seller-user', requestId: 'profile-history',
      input: { tradingName: 'Fictional Studio', businessDescription: 'Fictional clay work.',
        productCategories: 'Clay', supportPhone: '9800000000', supportEmail: 'shop@example.test', province: 'Madhesh',
        district: 'Parsa', municipality: 'Birgunj', ward: null, locality: 'Private workshop' }, now: 1_800_000_000_300,
      form: formLink('seller.profile', 'profile-history') } as Parameters<typeof updateSellerProfile>[1]);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('seller.profile-v2','seller.profile',2,1,'published',?,'Archive','admin',2,'admin',2,'admin',2,'seed-profile-v2')`)
      .run(JSON.stringify({ formId: 'seller.profile', fields: [{ ...field, status: 'archived' }] }));
    const page = await import('../app/seller/profile/page');
    const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
    assert.match(html, /Fictional answer/);
    assert.match(html, /Historical/);
    globalThis.sellerCatalogActor = { sellerId: 'other-seller', userId: 'other-user' };
    await assert.rejects(page.default({ searchParams: Promise.resolve({}) }), /Not found/);
  } finally { sqlite.close(); }
});

void test('product list exposes record-local history without fetching every product answer', async () => {
  const source = await readFile(new URL('../app/seller/products/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /seller\/products\/\$\{product\.id\}\/answers/);
  assert.doesNotMatch(source, /listFormAnswersForSubjectPage/);
});

void test('application progress shows only the current maker’s application and profile history', async () => {
  const { sqlite, database } = await fixture();
  try {
    seed(sqlite, 'seller.application');
    seed(sqlite, 'seller.maker-profile');
    const parsed = parseSellerApplication(managedApplication());
    assert.ok(parsed.input, parsed.errors.join('; '));
    await createSellerApplication(database, { userId: 'seller-user', sellerId: 'seller-one', applicationReference: 'HB-HISTORY',
      input: parsed.input, documents: [], now: 1_800_000_000_000,
      form: formLink('seller.application', 'application-history') } as Parameters<typeof createSellerApplication>[1]);
    await updateSellerParticipationPublicProfile(database, { sellerId: 'seller-one', actorId: 'seller-user',
      expectedVersion: 1, publicName: 'Fictional Studio', publicCity: 'Birgunj', craftExperience: [],
      socialLinks: {}, requestId: 'maker-history', now: 1_800_000_000_100,
      form: formLink('seller.maker-profile', 'maker-history') } as Parameters<typeof updateSellerParticipationPublicProfile>[1]);
    const page = await import('../app/sell/application/page');
    const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
    assert.match(html, /Application answer history/);
    assert.match(html, /Maker profile answer history/);
    assert.match(html, /Fictional answer/);
    globalThis.sellerCatalogActor = { sellerId: 'other-seller', userId: 'other-user' };
    await assert.rejects(page.default({ searchParams: Promise.resolve({}) }), /Redirect/);
  } finally { sqlite.close(); }
});
