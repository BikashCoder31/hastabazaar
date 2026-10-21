import { getRegisteredSellerTerms } from '../lib/db/repositories/marketplace-settings';
import { createHash } from 'node:crypto';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION, managedMakerAgreementSnapshot } from '../lib/sellers/managed-identity';
import { getBusinessSettingDefinition } from '../lib/configuration/definitions';
import { parseCurrentSellerApplication } from '../lib/sellers/onboarding';
import { startSellerRegistration } from '../lib/db/repositories/seller-commercial-access';
import { addManagedIdentityUpload, managedIdentityDocument } from './helpers/managed-identity-fixture';
import { historicalCommissionFixture } from './helpers/historical-commission-fixture';
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
import { createSellerApplication, createCurrentSellerApplication, updateSellerParticipationPublicProfile } from '../lib/db/repositories/seller-applications';
import { updateSellerProfile } from '../lib/db/repositories/seller-profile';
import { createProductSubmission, setProductInventory } from '../lib/db/repositories/products';
import { digestMultipartRequest, validateSellerMultipartStructure } from '../lib/forms/submission';
import { requestFingerprint } from '../lib/http/rate-limit';
import { parseSellerApplication, sellerDocumentsForApplication } from '../lib/sellers/application';

declare global {
  var sellerCatalogDb: D1Database;
  var sellerCatalogActor: { sellerId: string; userId: string } | null;
  var sellerCatalogCustomer: { userId: string; email: string; authSubject?:string } | null;
  var sellerCatalogMedia: { stored: string[]; deleted: string[]; put(key: string): Promise<void>; delete(key: string): Promise<void> };
  var sellerCatalogReact:typeof createElement;
}
globalThis.sellerCatalogReact=createElement;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.sellerCatalogDb},get MEDIA(){return globalThis.sellerCatalogMedia}}', shortCircuit: true };
  if (specifier === '@/lib/auth/seller') return { url: `data:text/javascript,
    export class SellerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireSellerApi(){if(!globalThis.sellerCatalogActor)throw new SellerAuthorizationError('Authentication is required.',401);return globalThis.sellerCatalogActor}
    export async function requireSellerPage(){if(!globalThis.sellerCatalogActor)throw new SellerAuthorizationError('Authentication is required.',401);return globalThis.sellerCatalogActor}`, shortCircuit: true };
  if (specifier === '@/lib/auth/seller-commercial-access') return {url: `data:text/javascript,
    export class SellerTermsAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireSellerTermsApi(){const user=globalThis.sellerCatalogCustomer;if(!user)throw new SellerTermsAuthorizationError('Sign in before starting seller registration.',401);return {userId:user.userId,audience:'applicant'}}`,shortCircuit:true};
  if (specifier === '@/lib/auth/customer') return { url: `data:text/javascript,
    export class CustomerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireCustomerApi(){if(!globalThis.sellerCatalogActor)throw new CustomerAuthorizationError('Authentication is required.',401);return globalThis.sellerCatalogActor}
    export async function requireCustomerPage(){if(!globalThis.sellerCatalogActor)throw new CustomerAuthorizationError('Authentication is required.',401);return globalThis.sellerCatalogActor}
    export async function getCustomerUser(){return globalThis.sellerCatalogCustomer ?? null}`, shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function notFound(){throw new Error("Not found")};export function redirect(){throw new Error("Redirect")};export function useRouter(){return {refresh(){}}}', shortCircuit: true };
  if (specifier === 'next/link') return { url: 'data:text/javascript,export default function Link(props){return globalThis.sellerCatalogReact("a",props,props.children)}', shortCircuit: true };
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
const builtIn = (key: string, type: 'short_text' | 'long_text' = 'short_text') =>
  ({ id: key, key, type, label: `Configured ${key}`, required: key !== 'businessDescription', order: 1, status: 'active' as const });
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

void test('seller catalog rejects custom keys colliding with every sensitive application and product control', () => {
  const protectedKeys = {
    'seller.application': ['hasBusinessTaxRegistration', 'taxStatus', 'acceptedTerms', 'province', 'district',
      'municipality', 'ward', 'locality', 'publicCity', 'productCategories', 'experienceCraft', 'experienceBand',
      'facebookUrl', 'instagramUrl', 'linkedinUrl', 'tiktokUrl', 'xUrl', 'youtubeUrl', 'representativeIdentity',
      'bankVerification', 'businessRegistration', 'panCertificate', 'vatCertificate'],
    'seller.product-submission': ['nameNe', 'descriptionNe', 'compareAtPrice', 'discountPercentage',
      'returnEligible', 'madeToOrder', 'preparationDays', 'originStory', 'countryOfOrigin', 'originEvidenceReference', 'originEvidenceStatus', 'dimensions', 'size', 'colour',
      'variations', 'specifications', 'careInstructions', 'safetyInformation', 'returnConditions',
      'warrantyOffered', 'warranty', 'warrantyYears', 'warrantyMonths', 'manufacturedAt', 'expiresAt',
      'licenceReference', 'image1', 'image2', 'image3', 'image4', 'image5', 'images', 'replacementVideo', 'removeMediaId'],
  } as const;
  for (const [formId, keys] of Object.entries(protectedKeys)) {
    for (const key of keys) {
      assert.equal(FORM_REGISTRY[formId as keyof typeof FORM_REGISTRY].baseFields.find((entry) => entry.key === key)?.capability,
        'protected', `${formId}.${key}`);
      assert.throws(() => validateFormDraft(formId as keyof typeof FORM_REGISTRY, { formId,
        fields: [{ ...field, id: key, key }] }), `${formId}.${key} must not be publishable as custom`);
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

void test('an exact registered camelCase safe built-in publishes and requires its domain value without snapshotting it', () => {
  const config = { formId: 'seller.application', version: 1, publishedAt: 1,
    fields: [field, builtIn('tradingName')] } as const;
  assert.deepEqual(validateFormDraft('seller.application', { formId: config.formId, fields: config.fields }).fields, config.fields);
  assert.throws(() => validateAnswersForDefinition(FORM_REGISTRY['seller.application'], config,
    [{ fieldId: field.id, value: 'Fictional note' }]), { fieldId: 'tradingName' });
  const snapshot = validateAnswersForDefinition(FORM_REGISTRY['seller.application'], config,
    [{ fieldId: field.id, value: 'Fictional note' }, { fieldId: 'tradingName', value: 'Fictional Studio' }]);
  assert.deepEqual(snapshot.answers, [{ fieldId: field.id, label: field.label, type: field.type, value: 'Fictional note' }]);
});

void test('seller application description cannot be published optional while its domain parser requires it', () => {
  assert.throws(() => validateFormDraft('seller.application', { formId: 'seller.application',
    fields: [{ ...builtIn('businessDescription', 'long_text'), required: false }] }));
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
    sellerId: 'seller-one',
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
      { sellerId: 'seller-one', profile: { tradingName: 'Fictional Studio', businessDescription: null, productCategories: null,
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

void test('seller safe built-in placeholder and help text appear beside the live input', async () => {
  const cases = [
    ['components/seller/seller-application-form.tsx', 'SellerApplicationForm', {}, 'tradingName'],
    ['components/seller/maker-application-profile-form.tsx', 'MakerApplicationProfileForm',
      { profile: { publicName: 'Fictional Studio', publicCity: 'Kathmandu', craftExperience: [], socialLinks: {}, version: 1 } }, 'publicName'],
    ['components/seller/seller-profile-form.tsx', 'SellerProfileForm',
      { sellerId: 'seller-one', profile: { tradingName: 'Fictional Studio', businessDescription: null, productCategories: null,
        supportPhone: '9800000000', supportEmail: 'studio@example.test', province: 'Bagmati', district: 'Kathmandu',
        municipality: 'Kathmandu', ward: null, locality: 'Private workshop' } }, 'tradingName'],
    ['components/seller/product-submission-form.tsx', 'ProductSubmissionForm', { categories: [], occasions: [] }, 'nameEn'],
  ] as const;
  for (const [entry, exported, props, key] of cases) {
    const html = await renderSellerForm(entry, exported, props, [{ id: key, key, type: 'short_text',
      label: 'Configured public label', helpText: 'Published help for maker', placeholder: 'Published prompt for maker',
      required: true, order: 0, status: 'active' }]);
    const input = (html.match(/<input\b[^>]*>/g) ?? []).find((tag) => tag.includes(`name="${key}"`));
    assert.match(input ?? '', /placeholder="Published prompt for maker"/, `${entry}: placeholder`);
    assert.match(html, /Published help for maker/, `${entry}: help`);
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
  beforeBatch: (() => Promise<unknown> | void) | null = null;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    if (this.beforeBatch) {
      const beforeBatch = this.beforeBatch;
      this.beforeBatch = null;
      await beforeBatch();
    }
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
  historicalCommissionFixture(sqlite, 'admin');
  sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat-test','fictional-clay','Fictional Clay',1,1,1,1)");
  const db = new Database(sqlite);
  globalThis.sellerCatalogDb = db as unknown as D1Database;
  globalThis.sellerCatalogActor = { sellerId: 'seller-one', userId: 'seller-user' };
  globalThis.sellerCatalogCustomer = null;
  globalThis.sellerCatalogMedia = { stored: [], deleted: [], async put(key) { this.stored.push(key); },
    async delete(key) { this.deleted.push(key); } };
  return { sqlite, db, database: db as unknown as D1Database };
}
function seed(sqlite: DatabaseSync, formId: string, fields: unknown[] = [field]) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?, ?, 1, 1, 'published', ?, 'Test publication', 'admin', 1, 'admin', 1, 'admin', 1, ?)`)
    .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields }), `seed-${formId}`);
}
async function signInApplicant(sqlite: DatabaseSync,userId='applicant-user',email='maker@example.test') {
  sqlite.prepare(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'Fictional Applicant','active',1,1)`).run(userId,'test:'+userId,email);
  sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'customer',1)").run(userId);
  sqlite.prepare('UPDATE users SET phone=? WHERE id=?').run('9800000000',userId);
  sqlite.prepare('INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES (?,?,1)').run(userId,email);
  sqlite.prepare('INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES (?,\'+9779800000000\',1)').run(userId);
  globalThis.sellerCatalogCustomer={userId,email,authSubject:'test:'+userId};
  await startSellerRegistration(globalThis.sellerCatalogDb,{userId,requestId:'start-'+userId,now:1});
}
function managedApplication(current=false) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    hasBusinessTaxRegistration: 'no', applicantType: 'individual', legalName: 'Fictional Maker', tradingName: 'Fictional Studio',
    email: 'maker@example.test', phone: '9800000000', province: 'Madhesh', district: 'Parsa', municipality: 'Birgunj',
    locality: 'Private workshop', publicCity: 'Birgunj', businessDescription: 'Fictional handcrafted goods.',
    productCategories: 'Clay', experienceCraft: 'Clay', experienceBand: 'less_than_one_year', applicationAcknowledgement: 'yes',
  })) form.set(key, value);
  addManagedIdentityUpload(form);
  if(current) {
  form.set('managedAgreementVersion',MANAGED_SUPPLIER_AGREEMENT_VERSION);
  form.set('managedAgreementContext',createHash('sha256').update(JSON.stringify(managedMakerAgreementSnapshot(getBusinessSettingDefinition('managed_maker_company_account').defaultValue,900,MANAGED_SUPPLIER_AGREEMENT_VERSION))).digest('hex'));
  form.set('personalPan','123456789');
  addCurrentPayoutFields(form);
  for(const key of ['personalPanCertificate','bankVerification'])form.set(key,new File(['%PDF-1.4\nFictional evidence'],key+'.pdf',{type:'application/pdf'}));
  }
  return form;
}
function addCurrentPayoutFields(form:FormData) {
  for(const [key,value] of Object.entries({payoutBeneficiary:'Fictional Applicant',bankName:'Fictional Bank',bankBranch:'Birgunj',bankAccountNumber:'1234567890',
    pickupAddress:'Fictional pickup, Birgunj 11, Parsa',returnAddress:'Fictional return, Birgunj 11, Parsa'}))form.set(key,value);
}
function currentApplicationDocuments(input:NonNullable<ReturnType<typeof parseCurrentSellerApplication>['input']>,sellerId:string) {
  return sellerDocumentsForApplication(input).filter(doc=>doc.required).map(doc=>({id:crypto.randomUUID(),kind:doc.kind,
    objectKey:`private/seller-documents/${sellerId}/${crypto.randomUUID()}`,originalName:'Fictional.pdf',mimeType:'application/pdf',sizeBytes:30}));
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
    documents: [managedIdentityDocument(sellerId)], now: 1_800_000_000_000 });
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
      input: parsed.input, documents: [managedIdentityDocument('seller-one')], now: 1_800_000_000_000,
      form: formLink('seller.application', 'application-one') } as Parameters<typeof createSellerApplication>[1]);
    const history = await listFormAnswersForSubject(database, 'seller', 'seller-one');
    assert.equal(history.length, 1);
    assert.equal(history[0].actorId, 'seller-user');
    assert.deepEqual(history[0].answers.answers, answer.answers);
    db.failAt = 0;
    await assert.rejects(createSellerApplication(database, { userId: 'failed-user', sellerId: 'failed-seller', applicationReference: 'HB-TEST-FAIL',
      input: { ...parsed.input, email: 'failed@example.test' }, documents: [managedIdentityDocument('failed-seller')], now: 1_800_000_000_001,
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
    seed(sqlite, 'seller.maker-profile', [field, builtIn('publicName')]);
    seed(sqlite, 'seller.profile', [field, builtIn('tradingName')]);
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

    await signInApplicant(sqlite);    seed(sqlite, 'seller.application', [field, builtIn('tradingName')]);
    const { POST } = await import('../app/api/seller-applications/route');
    const send = (requestId: string, options: { answer?: string | null; unknown?: boolean; tradingName?: string } = {}) => {
      const form = managedApplication(true);
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
    for (const [requestId, mutate] of [
      ['application-top-level', (form: FormData) => form.set('unrelatedAdminOverride', 'yes')],
      ['application-duplicate', (form: FormData) => form.append('tradingName', 'Injected alternate')],
    ] as const) {
      const form = managedApplication(true); form.set('formVersion', '1'); form.set('requestId', requestId);
      form.set('custom.workshop_note', 'Fictional answer'); mutate(form);
      assert.equal((await POST(new Request('http://localhost:3000/api/seller-applications', { method: 'POST',
        headers: { origin: 'http://localhost:3000' }, body: form }))).status, 400, requestId);
    }
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

void test('exhausted seller application quota rejects before consuming the multipart body', async () => {
  const { sqlite } = await fixture();
  try {

    await signInApplicant(sqlite);    const { POST } = await import('../app/api/seller-applications/route');
    const form = managedApplication(true);
    form.set('email', 'admin@example.test');
    form.set('requestId', 'application-over-quota');
    const request = new Request('http://localhost:3000/api/seller-applications', {
      method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form,
    });
    const key = await requestFingerprint(request, 'seller-application');
    const now = Date.now();
    sqlite.prepare('INSERT INTO request_rate_limits(key,request_count,window_started_at,expires_at) VALUES (?,?,?,?)')
      .run(key, 300, now, now + 60 * 60_000);
    assert.equal(request.bodyUsed, false);
    const response = await POST(request);
    assert.equal(response.status, 429);
    assert.equal(request.bodyUsed, false, 'quota rejection must not parse or hash uploaded files');
  } finally { sqlite.close(); }
});

void test('invalid and existing-email seller application attempts consume the public quota', async () => {
  const { sqlite } = await fixture();
  try {

    await signInApplicant(sqlite);    const { POST } = await import('../app/api/seller-applications/route');
    const send = (form: FormData) => {
      const request = new Request('http://localhost:3000/api/seller-applications', {
        method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form,
      });
      return { request, response: POST(request) };
    };
    const invalid = managedApplication(true);
    invalid.delete('legalName');
    const first = send(invalid);
    assert.equal((await first.response).status, 400);
    const existing = managedApplication(true);
    existing.set('email', 'admin@example.test');
    existing.set('requestId', 'application-existing-email');
    const second = send(existing);
    assert.equal((await second.response).status, 409);
    const key = await requestFingerprint(first.request, 'seller-application');
    assert.equal((sqlite.prepare('SELECT request_count AS count FROM request_rate_limits WHERE key=?')
      .get(key) as { count: number } | undefined)?.count, 2);
  } finally { sqlite.close(); }
});

// Real 12 by 8 JPEG fixture; upload acceptance must exercise the production decoder.
const validPhotoBytes = new Uint8Array(Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAwDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJWAaI//2Q==', 'base64'));

function productForm(requestId: string, options: { custom?: string | null; name?: string; version?: number } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ categoryId: 'cat-test', nameEn: options.name ?? 'Fictional Clay Cup',
    descriptionEn: 'A fictional staging-only product.', price: '1000', inventoryQuantity: '4',
    preparationDays: '3', occasionIds: 'occasion-test', madeToOrder: 'yes', returnEligible: 'no', materials: 'Clay', countryOfOrigin: '', originEvidenceReference: '' }))
    form.set(key, value);
  form.set('requestId', requestId);
  form.set('formVersion', String(options.version ?? 1));
  if (options.custom === 'file') form.set('custom.workshop_note', new File(['private'], 'id.png', { type: 'image/png' }));
  else if (options.custom !== null) form.set('custom.workshop_note', options.custom ?? 'Fictional answer');
  for (let index = 1; index <= 4; index++)
    form.set(`image${index}`, new File([validPhotoBytes], `angle-${index}.jpg`, { type: 'image/jpeg' }));
  return form;
}

void test('product multipart structure preserves legitimate repeated images, materials, occasions and media mutations', () => {
  const form = productForm('product-repeatable-controls');
  form.append('images', new File([validPhotoBytes], 'extra.jpg', { type: 'image/jpeg' }));
  form.append('materials', 'Wool');
  form.append('occasionIds', 'second-occasion');
  form.append('removeMediaId', 'existing-photo-one');
  form.append('removeMediaId', 'existing-photo-two');
  form.set('replaceImage:existing-photo-one', new File([validPhotoBytes], 'replacement.jpg', { type: 'image/jpeg' }));
  assert.doesNotThrow(() => validateSellerMultipartStructure(form, 'seller.product-submission'));
});

void test('product POST enforces custom answers and media rules before an owned draft/submit write and exact replay', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.product-submission', [field, builtIn('nameEn')]);
    sqlite.exec("INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('occasion-test','fictional-gift','Fictional Gift',1,1,1,1)");
    const { POST } = await import('../app/api/seller/products/route');
    const send = (requestId: string, options: Parameters<typeof productForm>[1] = {}) =>
      POST(new Request('http://localhost:3000/api/seller/products', { method: 'POST',
        headers: { origin: 'http://localhost:3000' }, body: productForm(requestId, options) }));
    assert.equal((await send('product-missing', { custom: null })).status, 400);
    assert.equal((await send('product-file', { custom: 'file' })).status, 400);
    assert.equal((await send('product-stale', { version: 2 })).status, 409);
    for (const [requestId, mutate] of [
      ['product-top-level', (form: FormData) => form.set('unrelatedAdminOverride', 'yes')],
      ['product-duplicate', (form: FormData) => form.append('price', '0')],
    ] as const) {
      const form = productForm(requestId); mutate(form);
      assert.equal((await POST(new Request('http://localhost:3000/api/seller/products', { method: 'POST',
        headers: { origin: 'http://localhost:3000' }, body: form }))).status, 400, requestId);
    }
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
    seed(sqlite, 'seller.product-submission', [field, builtIn('nameEn')]);
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
    for (const [requestId, mutate] of [
      ['revision-top-level', (form: FormData) => form.set('unrelatedAdminOverride', 'yes')],
      ['revision-duplicate', (form: FormData) => form.append('price', '0')],
    ] as const) {
      const form = productForm(requestId); for (let index = 1; index <= 4; index++) form.delete(`image${index}`);
      form.set('reviewRequestId', ''); mutate(form);
      assert.equal((await PATCH(new Request(`http://localhost:3000/api/seller/products/${id}`, { method: 'PATCH',
        headers: { origin: 'http://localhost:3000' }, body: form }), { params: Promise.resolve({ id }) })).status, 400, requestId);
    }
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

void test('concurrent exact product POST after R2 upload returns the winning product and removes losing private objects', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.product-submission');
    sqlite.exec("INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('occasion-test','fictional-gift','Fictional Gift',1,1,1,1)");
    const requestId = 'product-concurrent-post';
    const multipart = productForm(requestId);
    const digest = await digestMultipartRequest(multipart);
    let raced = false;
    const media = globalThis.sellerCatalogMedia;
    media.put = async function (key) {
      this.stored.push(key);
      if (raced) return;
      raced = true;
      await createProductSubmission(database, { productId: 'winning-product', sellerId: 'seller-one', actorId: 'seller-user',
        slug: 'winning-product', input: { ...productInput, occasionIds: ['occasion-test'] }, images: [], intent: 'submit',
        now: 1_800_000_000_301, form: { ...formLink('seller.product-submission', requestId), digest } });
    };
    const { POST } = await import('../app/api/seller/products/route');
    const response = await POST(new Request('http://localhost:3000/api/seller/products', { method: 'POST',
      headers: { origin: 'http://localhost:3000' }, body: multipart }));
    assert.equal(response.status, 201);
    assert.equal((await response.json() as { id: string }).id, 'winning-product');
    assert.equal(media.stored.length, 4);
    assert.deepEqual([...media.deleted].sort(), [...media.stored].sort());
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM products WHERE seller_id='seller-one'").get() as { count: number }).count, 1);
  } finally { sqlite.close(); }
});

void test('concurrent exact product PATCH after R2 upload removes losing private objects without a second revision', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.product-submission');
    sqlite.exec("INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('occasion-test','fictional-gift','Fictional Gift',1,1,1,1)");
    const images = Array.from({ length: 4 }, (_, index) => ({ id: `original-${index}`, objectKey: `private/original-${index}`,
      originalName: `original-${index}.jpg`, mimeType: 'image/jpeg', sizeBytes: 100, altEn: 'Fictional cup', altNe: null,
      sortOrder: index }));
    await createProductSubmission(database, { productId: 'revision-race', sellerId: 'seller-one', actorId: 'seller-user',
      slug: 'revision-race', input: { ...productInput, occasionIds: ['occasion-test'] }, images, intent: 'draft', now: 1_800_000_000_300 });
    sqlite.prepare("UPDATE products SET status='needs_changes' WHERE id='revision-race'").run();
    const requestId = 'product-concurrent-patch';
    const multipart = productForm(requestId); for (let index = 2; index <= 4; index++) multipart.delete(`image${index}`);
    multipart.set('reviewRequestId', '');
    const digest = await digestMultipartRequest(multipart);
    let raced = false;
    const media = globalThis.sellerCatalogMedia;
    media.put = async function (key) {
      this.stored.push(key);
      if (raced) return;
      raced = true;
      await (await import('../lib/db/repositories/products')).reviseAndResubmitProduct(database, {
        productId: 'revision-race', sellerId: 'seller-one', actorId: 'seller-user',
        input: { ...productInput, occasionIds: ['occasion-test'] }, images: [], previousInventory: 4,
        expectedStatus: 'needs_changes', expectedReviewRequestId: null, now: 1_800_000_000_301,
        form: { ...formLink('seller.product-submission', requestId), digest },
      });
    };
    const { PATCH } = await import('../app/api/seller/products/[id]/route');
    const response = await PATCH(new Request('http://localhost:3000/api/seller/products/revision-race', { method: 'PATCH',
      headers: { origin: 'http://localhost:3000' }, body: multipart }), { params: Promise.resolve({ id: 'revision-race' }) });
    assert.equal(response.status, 200);
    assert.deepEqual([...media.deleted].sort(), [...media.stored].sort());
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE subject_id='revision-race' AND action='product.resubmitted'").get() as { count: number }).count, 1);
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
      input: parsed.input, documents: [managedIdentityDocument('seller-one')], now: 1_800_000_000_000,
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

void test('preapproval maker draft history is linked locally and shows archived answers only to its customer owner', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES ('other-user','other@example.test','Other Maker','active',1,1)").run();
    sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES ('seller-user','customer',1),('other-user','customer',1)").run();
    seed(sqlite, 'seller.product-submission');
    await createProductSubmission(database, { productId: 'maker-draft-history', sellerId: 'seller-one', actorId: 'seller-user',
      slug: 'maker-draft-history', input: productInput, images: [], intent: 'draft', now: 1_800_000_000_300,
      form: formLink('seller.product-submission', 'maker-draft-answer') } as Parameters<typeof createProductSubmission>[1]);
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('seller.product-submission-v2','seller.product-submission',2,1,'published',?,'Archive','admin',2,'admin',2,'admin',2,'seed-maker-draft-v2')`)
      .run(JSON.stringify({ formId: 'seller.product-submission', fields: [{ ...field, status: 'archived' }] }));
    const application = await import('../app/sell/application/page');
    const applicationHtml = renderToStaticMarkup(await application.default({ searchParams: Promise.resolve({}) }));
    assert.match(applicationHtml, /Answer history/);
    const history = await import('../app/sell/application/products/[id]/answers/page');
    const html = renderToStaticMarkup(await history.default({ params: Promise.resolve({ id: 'maker-draft-history' }),
      searchParams: Promise.resolve({}) }));
    assert.match(html, /Fictional answer/);
    assert.match(html, /Historical/);
    globalThis.sellerCatalogActor = { sellerId: 'other-seller', userId: 'other-user' };
    await assert.rejects(history.default({ params: Promise.resolve({ id: 'maker-draft-history' }),
      searchParams: Promise.resolve({}) }), /Not found/);
  } finally { sqlite.close(); }
});

void test('applicant can reach older owned draft histories after 50 tied drafts without seeing another maker’s drafts', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    await createSeller(database, 'other-seller', 'other-user');
    const insert = sqlite.prepare(`INSERT INTO products
      (id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,materials,created_at,updated_at)
      VALUES (?,?, 'cat-test', ?, ?, ?, 'Private test draft', 100, 0, 'Fictional Maker', '[]', 100, ?)`);
    for (let i = 0; i < 52; i++) {
      const id = `owned-draft-${String(i).padStart(2, '0')}`;
      insert.run(id, 'seller-one', id, id, id, 200);
    }
    insert.run('foreign-draft', 'other-seller', 'foreign-draft', 'foreign-draft', 'foreign-draft', 300);
    const page = await import('../app/sell/application/page');
    const first = await page.default({ searchParams: Promise.resolve({ appAt: '100', appId: 'application-cursor',
      makerAt: '101', makerId: 'maker-cursor' }) });
    const firstHtml = renderToStaticMarkup(first);
    assert.equal((firstHtml.match(/Answer history/g) ?? []).length, 50);
    assert.match(firstHtml, /owned-draft-51/);
    assert.doesNotMatch(firstHtml, /owned-draft-01|foreign-draft/);
    const href = firstHtml.match(/href="([^"]+)"[^>]*>Older products<\/a>/)?.[1].replaceAll('&amp;','&');
    assert.ok(href, 'older private drafts must remain navigable');
    const older = new URL(href, 'http://localhost:3000');
    assert.equal(older.searchParams.get('appId'), 'application-cursor');
    assert.equal(older.searchParams.get('makerId'), 'maker-cursor');
    const second = await page.default({ searchParams: Promise.resolve(Object.fromEntries(older.searchParams)) });
    const secondHtml = renderToStaticMarkup(second);
    assert.match(secondHtml, /owned-draft-01/);
    assert.match(secondHtml, /owned-draft-00/);
    assert.doesNotMatch(secondHtml, /owned-draft-51|foreign-draft/);
    assert.doesNotMatch(secondHtml, />Older products<\/a>/);
    globalThis.sellerCatalogActor = { sellerId: 'other-seller', userId: 'other-user' };
    const foreignHtml = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
    assert.match(foreignHtml, /foreign-draft/);
    assert.doesNotMatch(foreignHtml, /owned-draft-/);
  } finally { sqlite.close(); }
});

void test('exhausted product create and revision quotas reject before multipart body consumption or hashing', async () => {
  const { sqlite, database } = await fixture();
  try {
    await createSeller(database);
    await createProductSubmission(database, { productId: 'quota-product', sellerId: 'seller-one', actorId: 'seller-user',
      slug: 'quota-product', input: productInput, images: [], intent: 'draft', now: 1_800_000_000_300 });
    const { POST } = await import('../app/api/seller/products/route');
    const { PATCH } = await import('../app/api/seller/products/[id]/route');
    for (const [scope, url, send] of [
      ['seller-product-submission:seller-one', 'http://localhost:3000/api/seller/products',
        (request: Request) => POST(request)],
      ['seller-product-revision:seller-one', 'http://localhost:3000/api/seller/products/quota-product',
        (request: Request) => PATCH(request, { params: Promise.resolve({ id: 'quota-product' }) })],
    ] as const) {
      const request = new Request(url, { method: scope.includes('revision') ? 'PATCH' : 'POST',
        headers: { origin: 'http://localhost:3000' }, body: productForm(`quota-${scope}`) });
      const key = await requestFingerprint(request, scope);
      const now = Date.now();
      sqlite.prepare('INSERT INTO request_rate_limits(key,request_count,window_started_at,expires_at) VALUES (?,?,?,?)')
        .run(key, 20, now, now + 60 * 60_000);
      const response = await send(request);
      assert.equal(response.status, 429, scope);
      assert.equal(request.bodyUsed, false, `${scope} consumed an over-quota multipart upload`);
    }
  } finally { sqlite.close(); }
});

void test('inventory audit-key race replays only the exact winning write', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.inventory');
    await createProductSubmission(database, { productId: 'inventory-race', sellerId: 'seller-one', actorId: 'seller-user',
      slug: 'inventory-race', input: productInput, images: [], intent: 'draft', now: 1_800_000_000_300 });
    const request = { productId: 'inventory-race', sellerId: 'seller-one', actorId: 'seller-user', quantity: 6,
      reason: 'Fictional count', now: 1_800_000_000_400, form: formLink('seller.inventory', 'inventory-race-key') };
    db.beforeBatch = () => setProductInventory(database, request as Parameters<typeof setProductInventory>[1]);
    await setProductInventory(database, request as Parameters<typeof setProductInventory>[1]);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='inventory-race-key'").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='inventory-race-key'").get() as { count: number }).count, 1);
    await assert.rejects(setProductInventory(database, { ...request, quantity: 7 } as Parameters<typeof setProductInventory>[1]), /Request reference/);
  } finally { sqlite.close(); }
});

void test('maker-profile audit-key race replays only the exact winning write', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.maker-profile');
    const request = { sellerId: 'seller-one', actorId: 'seller-user', expectedVersion: 1,
      publicName: 'Fictional Studio', publicCity: 'Birgunj', craftExperience: [], socialLinks: {},
      requestId: 'maker-race-key', now: 1_800_000_000_400, form: formLink('seller.maker-profile', 'maker-race-key') };
    db.beforeBatch = () => updateSellerParticipationPublicProfile(database, request as Parameters<typeof updateSellerParticipationPublicProfile>[1]);
    await updateSellerParticipationPublicProfile(database, request as Parameters<typeof updateSellerParticipationPublicProfile>[1]);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='maker-race-key'").get() as { count: number }).count, 1);
    await assert.rejects(updateSellerParticipationPublicProfile(database, { ...request, publicCity: 'Kathmandu' } as Parameters<typeof updateSellerParticipationPublicProfile>[1]), /Request reference/);
  } finally { sqlite.close(); }
});

void test('approved seller-profile audit-key race replays only the exact winning write', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.profile');
    sqlite.prepare("UPDATE seller_profiles SET status='approved' WHERE id='seller-one'").run();
    const request = { sellerId: 'seller-one', actorId: 'seller-user', requestId: 'profile-race-key',
      now: 1_800_000_000_400, input: { tradingName: 'Fictional Studio', businessDescription: 'Fictional clay work.',
        productCategories: 'Clay', supportPhone: '9800000000', supportEmail: 'shop@example.test', province: 'Madhesh',
        district: 'Parsa', municipality: 'Birgunj', ward: null, locality: 'Private workshop' },
      form: formLink('seller.profile', 'profile-race-key') };
    db.beforeBatch = () => updateSellerProfile(database, request as Parameters<typeof updateSellerProfile>[1]);
    await updateSellerProfile(database, request as Parameters<typeof updateSellerProfile>[1]);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='profile-race-key'").get() as { count: number }).count, 1);
    await assert.rejects(updateSellerProfile(database, { ...request, input: { ...request.input, tradingName: 'Changed name' } } as Parameters<typeof updateSellerProfile>[1]), /Request reference/);
  } finally { sqlite.close(); }
});

void test('application audit-key race replays the winner but rejects changed actor or content', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    seed(sqlite, 'seller.application');
    const parsed = parseSellerApplication(managedApplication());
    assert.ok(parsed.input, parsed.errors.join('; '));
    const winner = { userId: 'winner-user', sellerId: 'winner-seller', applicationReference: 'HB-WINNER',
      input: parsed.input, documents: [managedIdentityDocument('winner-seller')], now: 1_800_000_000_400,
      form: formLink('seller.application', 'application-race-key') } as Parameters<typeof createSellerApplication>[1];
    const loser = { ...winner, userId: 'loser-user', sellerId: 'loser-seller', applicationReference: 'HB-LOSER', documents: [managedIdentityDocument('loser-seller')], form: { ...winner.form!, digest: 'identical-upload-content-digest' } };
    winner.form!.digest = 'identical-upload-content-digest';
    db.beforeBatch = () => createSellerApplication(database, winner);
    assert.equal(await createSellerApplication(database, loser), 'winner-seller');
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM seller_profiles WHERE application_reference='HB-WINNER'").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM seller_profiles WHERE application_reference='HB-LOSER'").get() as { count: number }).count, 0);
    await assert.rejects(createSellerApplication(database, { ...loser, userId: 'different-actor', existingAccount: true }), /Request reference/);
    await assert.rejects(createSellerApplication(database, { ...loser, input: { ...parsed.input, tradingName: 'Changed Studio' }, form: { ...loser.form, digest: 'changed-content-digest' } }), /Request reference/);
  } finally { sqlite.close(); }
});

void test('signed-in application batch race responds with the winning reference, while changed email conflicts', async () => {
  const { sqlite, db, database } = await fixture();
  try {

    await signInApplicant(sqlite);    seed(sqlite, 'seller.application');
    const requestForm = managedApplication(true);
    requestForm.set('requestId', 'application-route-race');
    requestForm.set('formVersion', '1');
    requestForm.set('custom.workshop_note', 'Fictional answer');
    requestForm.set('profileImage', new File([validPhotoBytes],
      'maker.jpg', { type: 'image/jpeg' }));
    const digest = await digestMultipartRequest(requestForm);
    const parsed = parseCurrentSellerApplication(requestForm);
    assert.ok(parsed.input, parsed.errors.join('; '));
    const input = parsed.input;
    db.beforeBatch = () => createCurrentSellerApplication(database, { userId: 'applicant-user', existingAccount: true, sellerId: 'winning-seller',
      applicationReference: 'HB-WINNING', input, documents: currentApplicationDocuments(input,'winning-seller'), now: 1_800_000_000_400,
      form: { ...formLink('seller.application', 'application-route-race'), digest } });
    const { POST } = await import('../app/api/seller-applications/route');
    const send = (form: FormData) => POST(new Request('http://localhost:3000/api/seller-applications', {
      method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form,
    }));
    const response = await send(requestForm);
    assert.equal(response.status, 201);
    assert.equal((await response.json() as { applicationReference: string }).applicationReference, 'HB-WINNING');
    assert.equal(globalThis.sellerCatalogMedia.stored.length, 4);
    assert.deepEqual(globalThis.sellerCatalogMedia.deleted, globalThis.sellerCatalogMedia.stored,
      'the losing application must remove private media uploaded before its DB race');
    const changed = managedApplication(true);
    changed.set('email', 'changed@example.test');
    changed.set('requestId', 'application-route-race');
    changed.set('formVersion', '1');
    changed.set('custom.workshop_note', 'Fictional answer');
    assert.equal((await send(changed)).status, 409);
  } finally { sqlite.close(); }
});

for (const signedIn of [false, true]) {
  void test(signedIn ? 'signed-in application pre-batch replay returns the persisted winner after losing R2 upload' : 'anonymous application is rejected before private upload or account creation', async () => {
    const { sqlite, database } = await fixture();
    try {
      seed(sqlite, 'seller.application');
      const form = managedApplication(true);
      const requestId = `application-prebatch-${signedIn ? 'auth' : 'anon'}`;
      form.set('requestId', requestId);
      form.set('formVersion', '1');
      form.set('custom.workshop_note', 'Fictional answer');
      form.set('profileImage', new File([validPhotoBytes],
        'maker.jpg', { type: 'image/jpeg' }));
      const parsed = parseCurrentSellerApplication(form);
      assert.ok(parsed.input, parsed.errors.join('; '));
      const digest = await digestMultipartRequest(form);
      const winnerUserId = signedIn ? 'signed-in-user' : 'winning-user';
      if (signedIn) {
        await signInApplicant(sqlite,winnerUserId,parsed.input.email);
      }
      globalThis.sellerCatalogMedia.put = async function (key) {
        this.stored.push(key);
        if (this.stored.length !== 1) return;
        await createCurrentSellerApplication(database, { userId: winnerUserId, existingAccount: signedIn,
          sellerId: 'winning-seller', applicationReference: 'HB-WINNING-PREBATCH',
          input: parsed.input!, documents: currentApplicationDocuments(parsed.input!,'winning-seller'), now: 1_800_000_000_400,
          form: { ...formLink('seller.application', requestId), digest } });
      };
      const { POST } = await import('../app/api/seller-applications/route');
      const send = (body: FormData) => POST(new Request('http://localhost:3000/api/seller-applications', {
        method: 'POST', headers: { origin: 'http://localhost:3000' }, body,
      }));
      const response = await send(form);
      if (!signedIn) {
        assert.equal(response.status,401);
        assert.equal(globalThis.sellerCatalogMedia.stored.length,0);
        assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM seller_profiles').get() as {count:number}).count,0);
        return;
      }
      assert.equal(response.status, 201);
      assert.equal((await response.json() as { applicationReference: string }).applicationReference, 'HB-WINNING-PREBATCH');
      assert.equal(globalThis.sellerCatalogMedia.stored.length, 4);
      assert.deepEqual(globalThis.sellerCatalogMedia.deleted, globalThis.sellerCatalogMedia.stored,
        'the private losing upload must be removed when the pre-batch replay finds a winner');
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM seller_profiles').get() as { count: number }).count, 1);
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs WHERE request_id=?').get(requestId) as { count: number }).count, 1);
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id=?').get(requestId) as { count: number }).count, 1);

      const changed = managedApplication(true);
      changed.set('requestId', requestId);
      changed.set('formVersion', '1');
      changed.set('custom.workshop_note', 'Changed answer');
      changed.set('profileImage', form.get('profileImage') as File);
      const changedResponse = await send(changed);
      assert.equal(changedResponse.status, 409);
      assert.doesNotMatch(await changedResponse.text(), /HB-WINNING-PREBATCH/);
      changed.set('custom.workshop_note', 'Fictional answer');
      changed.set('email', 'different@example.test');
      const changedEmailResponse = await send(changed);
      assert.equal(changedEmailResponse.status, 409);
      assert.doesNotMatch(await changedEmailResponse.text(), /HB-WINNING-PREBATCH/);
      await assert.rejects(createSellerApplication(database, { userId: 'different-actor', existingAccount: true,
        sellerId: 'different-seller', applicationReference: 'HB-DIFFERENT', input: parsed.input!, documents: [managedIdentityDocument('different-seller')],
        now: 1_800_000_000_401, form: { ...formLink('seller.application', requestId), digest } }),
      /Request reference/);
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM seller_profiles').get() as { count: number }).count, 1);
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id=?').get(requestId) as { count: number }).count, 1);
    } finally {
      globalThis.sellerCatalogCustomer = null;
      sqlite.close();
    }
  });
}

void test('seller approval revoked at the batch boundary cannot commit an audit or answer', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.profile');
    sqlite.prepare("UPDATE seller_profiles SET status='approved' WHERE id='seller-one'").run();
    const request = { sellerId: 'seller-one', actorId: 'seller-user', requestId: 'profile-revoked-key',
      now: 1_800_000_000_400, input: { tradingName: 'Changed Studio', businessDescription: 'Fictional clay work.',
        productCategories: 'Clay', supportPhone: '9800000000', supportEmail: 'shop@example.test', province: 'Madhesh',
        district: 'Parsa', municipality: 'Birgunj', ward: null, locality: 'Private workshop' },
      form: formLink('seller.profile', 'profile-revoked-key') };
    db.beforeBatch = () => { sqlite.prepare("UPDATE seller_profiles SET status='suspended' WHERE id='seller-one'").run(); };
    await assert.rejects(updateSellerProfile(database, request as Parameters<typeof updateSellerProfile>[1]));
    assert.equal((sqlite.prepare("SELECT trading_name AS name FROM seller_profiles WHERE id='seller-one'").get() as { name: string }).name, 'Fictional Studio');
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='profile-revoked-key'").get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='profile-revoked-key'").get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('seller owner changed at the batch boundary cannot commit a stale actor audit or answer', async () => {
  const { sqlite, db, database } = await fixture();
  try {
    await createSeller(database);
    seed(sqlite, 'seller.profile');
    sqlite.prepare("UPDATE seller_profiles SET status='approved' WHERE id='seller-one'").run();
    sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES ('new-owner','new-owner@example.test','New owner','active',1,1)").run();
    const request = { sellerId: 'seller-one', actorId: 'seller-user', requestId: 'profile-owner-race',
      now: 1_800_000_000_400, input: { tradingName: 'Changed Studio', businessDescription: 'Fictional clay work.',
        productCategories: 'Clay', supportPhone: '9800000000', supportEmail: 'shop@example.test', province: 'Madhesh',
        district: 'Parsa', municipality: 'Birgunj', ward: null, locality: 'Private workshop' },
      form: formLink('seller.profile', 'profile-owner-race') };
    db.beforeBatch = () => { sqlite.prepare("UPDATE seller_profiles SET user_id='new-owner' WHERE id='seller-one'").run(); };
    await assert.rejects(updateSellerProfile(database, request as Parameters<typeof updateSellerProfile>[1]));
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE request_id='profile-owner-race'").get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='profile-owner-race'").get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

void test('inventory oversized bodies return413 while malformed input stays400 with no writes', async () => {
  const { sqlite } = await fixture();
  try {
    const { PATCH } = await import('../app/api/seller/products/[id]/inventory/route');
    const send = (body: string, declared?: string) => PATCH(new Request('http://localhost:3000/api/seller/products/no-mutation/inventory', {
      method: 'PATCH', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...(declared ? {'content-length':declared} : {}) }, body,
    }), {params:Promise.resolve({id:'no-mutation'})});
    assert.equal((await send(' ', '262145')).status,413,'declared body limit');
    assert.equal((await send(' '.repeat(262145))).status,413,'streamed body limit');
    assert.equal((await send('{')).status,400,'malformed JSON');
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get() as {n:number}).n,0);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_adjustments').get() as {n:number}).n,0);
  }finally{sqlite.close();}
});

void test('origin controls cross real product create, draft and revision boundaries while remaining unverified', async () => {
  const {sqlite,database}=await fixture();
  try {
    await createSeller(database);
    seed(sqlite,'seller.product-submission',[field,builtIn('nameEn')]);
    sqlite.exec("INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('occasion-test','origin-gift','Origin Gift',1,1,1,1)");
    const {POST}=await import('../app/api/seller/products/route');
    const send=(form:FormData,draft=false)=>POST(new Request('http://localhost:3000/api/seller/products'+(draft?'?intent=draft':''),{method:'POST',headers:{origin:'http://localhost:3000'},body:form}));
    const blank=await send(productForm('origin-blank'));
    assert.equal(blank.status,201,await blank.clone().text());
    const blankId=(await blank.json() as {id:string}).id;
    assert.equal(sqlite.prepare('SELECT country_of_origin FROM products WHERE id=?').get(blankId)?.country_of_origin,'');
    const populated=productForm('origin-populated');populated.set('countryOfOrigin','India');populated.set('originEvidenceReference','Private supplier declaration');
    const created=await send(populated);assert.equal(created.status,201,await created.clone().text());
    const id=(await created.json() as {id:string}).id;
    const row=sqlite.prepare('SELECT country_of_origin,origin_evidence_status,origin_evidence_reference FROM products WHERE id=?').get(id);
    assert.equal(row?.country_of_origin,'India');assert.equal(row?.origin_evidence_status,'seller_declared');assert.equal(row?.origin_evidence_reference,'Private supplier declaration');
    const draft=await send(productForm('origin-draft'),true);assert.equal(draft.status,201,await draft.clone().text());
    assert.equal((await draft.json() as {status:string}).status,'draft');
    for(const key of ['countryOfOrigin','originEvidenceReference']){
      const duplicate=productForm('origin-duplicate-'+key);duplicate.append(key,'Forged second value');
      const rejected=await send(duplicate);assert.equal(rejected.status,400);assert.match((await rejected.json() as {error:string}).error,/Duplicate form control/);
    }
    const forged=productForm('origin-forged-status');forged.set('countryOfOrigin','Nepal');forged.set('originEvidenceStatus','verified');
    assert.equal((await send(forged)).status,400);
    sqlite.prepare("UPDATE products SET status='needs_changes' WHERE id=?").run(id);
    const {PATCH}=await import('../app/api/seller/products/[id]/route');
    const revision=productForm('origin-revised');revision.set('countryOfOrigin','China');revision.set('originEvidenceReference','Replacement supplier declaration');revision.set('reviewRequestId','');
    for(let i=1;i<=4;i++)revision.delete('image'+i);
    const revised=await PATCH(new Request('http://localhost:3000/api/seller/products/'+id,{method:'PATCH',headers:{origin:'http://localhost:3000'},body:revision}),{params:Promise.resolve({id})});
    assert.equal(revised.status,200,await revised.clone().text());
    const after=sqlite.prepare('SELECT country_of_origin,origin_evidence_status FROM products WHERE id=?').get(id);
    assert.equal(after?.country_of_origin,'China');assert.equal(after?.origin_evidence_status,'seller_declared');
  } finally {sqlite.close();}
});

void test('managed correction multipart route requires private ID, current agreement and owned changes-requested state and replays exact lost responses',async()=>{
  const {sqlite,database}=await fixture();
  try {
    await createSeller(database); seed(sqlite,'seller.maker-profile');
    sqlite.exec("UPDATE seller_profiles SET status='needs_changes' WHERE id='seller-one'; UPDATE seller_participation_profiles SET application_stage='changes_requested' WHERE seller_id='seller-one'");
    globalThis.sellerCatalogActor={sellerId:'seller-one',userId:'seller-user'};
    const {POST}=await import('../app/api/seller-applications/profile/route');
    const correction=(requestId:string)=>{
      const form=new FormData(); addManagedIdentityUpload(form);
      for(const [key,value] of Object.entries({publicName:'Fictional Studio',publicCity:'Birgunj',expectedVersion:'1',formVersion:'1',requestId,'custom.workshop_note':'Corrected evidence supplied'}))form.set(key,value);
      return form;
    };
    const send=(body:FormData)=>POST(new Request('http://localhost:3000/api/seller-applications/profile',{method:'POST',headers:{origin:'http://localhost:3000'},body}));
    for(const missing of ['representativeIdentity','managedAgreementAccepted','managedAgreementContext']){
      const form=correction(`missing-${missing}`);form.delete(missing);
      assert.equal((await send(form)).status,400);
    }
    const spoofed=correction('spoofed-id');spoofed.set('representativeIdentity',new File(['not PDF'],'forged.pdf',{type:'application/pdf'}));
    assert.equal((await send(spoofed)).status,400);
    const duplicate=correction('duplicate-id');duplicate.append('governmentIdType','passport');
    assert.equal((await send(duplicate)).status,400);
    assert.equal(globalThis.sellerCatalogMedia.stored.length,0,'invalid evidence fails before upload');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM managed_maker_application_details').get()?.n,1);
    const valid=correction('valid-managed-correction');
    assert.equal((await send(valid)).status,200);
    assert.equal(sqlite.prepare('SELECT status FROM seller_profiles WHERE id=?').get('seller-one')?.status,'submitted');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM managed_maker_application_details').get()?.n,2);
    assert.equal(globalThis.sellerCatalogMedia.stored.length,1);
    assert.equal((await send(valid)).status,200,'lost response replay returns the original outcome');
    assert.equal(globalThis.sellerCatalogMedia.stored.length,1,'exact replay uploads nothing');
    const changed=correction('valid-managed-correction');changed.set('personalPan','123456789');
    assert.equal((await send(changed)).status,409);
    globalThis.sellerCatalogActor={sellerId:'seller-one',userId:'different-owner'};
    assert.equal((await send(correction('foreign-correction'))).status,404);
  }finally{sqlite.close();}
});

void test('post-commit correction verification failure preserves durable government evidence and successful outcome',async()=>{
  const {sqlite,database}=await fixture();
  try {
    await createSeller(database);seed(sqlite,'seller.maker-profile');
    sqlite.exec("UPDATE seller_profiles SET status='needs_changes' WHERE id='seller-one'; UPDATE seller_participation_profiles SET application_stage='changes_requested' WHERE seller_id='seller-one'");
    globalThis.sellerCatalogActor={sellerId:'seller-one',userId:'seller-user'};
    const originalPrepare=database.prepare.bind(database);
    database.prepare=(sql:string)=>{
      if(sql.startsWith('SELECT id FROM seller_documents WHERE id=? AND seller_id=?')) throw new Error('Synthetic post-commit read failure');
      return originalPrepare(sql);
    };
    const form=new FormData();addManagedIdentityUpload(form);
    for(const [key,value]of Object.entries({publicName:'Fictional Studio',publicCity:'Birgunj',expectedVersion:'1',formVersion:'1',requestId:'post-commit-correction','custom.workshop_note':'Corrected evidence supplied'}))form.set(key,value);
    const {POST}=await import('../app/api/seller-applications/profile/route');
    const response=await POST(new Request('http://localhost:3000/api/seller-applications/profile',{method:'POST',headers:{origin:'http://localhost:3000'},body:form}));
    assert.equal(sqlite.prepare('SELECT status FROM seller_profiles WHERE id=?').get('seller-one')?.status,'submitted');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM managed_maker_application_details').get()?.n,2);
    assert.deepEqual(globalThis.sellerCatalogMedia.deleted,[],'a later read failure must never delete the committed private upload');
    assert.equal(response.status,200);assert.equal((await response.json() as {ok?:boolean}).ok,true);
  }finally{sqlite.close();}
});

void test('actual registered application controller accepts displayed context and records its commission snapshot',async()=>{
  const {sqlite,database}=await fixture();try{
    await signInApplicant(sqlite);seed(sqlite,'seller.application',[]);
    const terms=await getRegisteredSellerTerms(database);
    const form=new FormData();for(const [key,value] of Object.entries({
      hasBusinessTaxRegistration:'yes',applicantType:'individual',taxStatus:'business_pan_only',
      taxRegistrationNumber:'123456789',legalName:'Fictional Applicant',tradingName:'Fictional Registered Studio',representativeName:'Fictional Applicant',
      registrationAuthority:'Fictional firm office',registrationNumber:'FICTIONAL-FIRM-1',
      email:'maker@example.test',phone:'9800000000',province:'Madhesh',district:'Parsa',municipality:'Birgunj',
      locality:'Private workshop',businessDescription:'Fictional registered craft goods',productCategories:'Clay',
      acceptedTerms:'yes',sellerAgreementContext:terms.context,formVersion:'1',requestId:'registered-controller',
    }))form.set(key,value);
    addCurrentPayoutFields(form);
    const parsed=parseCurrentSellerApplication(form);assert.ok(parsed.input,parsed.errors.join('; '));
    const {sellerDocumentsForApplication}=await import('../lib/sellers/application');
    for(const doc of sellerDocumentsForApplication(parsed.input).filter(doc=>doc.required)){
      form.set(doc.field,new File(['%PDF-1.4\nFictional document'],doc.kind+'.pdf',{type:'application/pdf'}));
    }
    const {POST}=await import('../app/api/seller-applications/route');
    const response=await POST(new Request('http://localhost:3000/api/seller-applications',{method:'POST',headers:{origin:'http://localhost:3000'},body:form}));
    assert.equal(response.status,201,await response.text());
    const row=sqlite.prepare("SELECT commission_bps,accepted_by FROM seller_agreement_acceptance_history WHERE acceptance_request_id='registered-controller'").get();
    assert.equal(row?.commission_bps,terms.basisPoints);assert.equal(row?.accepted_by,'applicant-user');
  }finally{sqlite.close();}
});

void test('lost committed application response preserves private evidence and exact replay recovers without uploading again',async()=>{
  const {sqlite,db,database}=await fixture();
  try {
    await signInApplicant(sqlite);seed(sqlite,'seller.application',[]);
    const form=managedApplication(true);form.set('requestId','uncertain-private-evidence');form.set('formVersion','1');
    const originalBatch=db.batch.bind(db);const originalPrepare=db.prepare.bind(db);let outage=false;
    db.batch=async statements=>{await originalBatch(statements);outage=true;throw new Error('Lost committed response');};
    db.prepare=(sql:string)=>{if(outage)throw new Error('Replay read unavailable');return originalPrepare(sql);};
    const {POST}=await import('../app/api/seller-applications/route');
    const send=()=>POST(new Request('http://localhost:3000/api/seller-applications',{method:'POST',headers:{origin:'http://localhost:3000'},body:form}));
    assert.equal((await send()).status,500);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM seller_documents').get() as {n:number}).n,3);
    assert.equal(globalThis.sellerCatalogMedia.stored.length,3);assert.equal(globalThis.sellerCatalogMedia.deleted.length,0);
    outage=false;db.batch=originalBatch;
    assert.equal((await send()).status,201);
    assert.equal(globalThis.sellerCatalogMedia.stored.length,3,'exact replay recovers before uploads');
    assert.equal(globalThis.sellerCatalogMedia.deleted.length,0);
    assert.ok(database);
  }finally{sqlite.close();}
});
