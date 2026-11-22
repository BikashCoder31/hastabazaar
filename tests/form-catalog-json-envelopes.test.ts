import './helpers/rider-enabled-fixture';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import ts from 'typescript';
import { FORM_REGISTRY } from '../lib/forms/registry';
import {
  validateAnswersForDefinition,
  validateFormDraft,
} from '../lib/forms/validation';
import type { FormAnswerSnapshot, FormId } from '../lib/forms/types';

const note = 'Fictional reviewed operational evidence';
const key = { requestId: 'envelope-fixture-request' };
const idempotency = { idempotencyKey: 'envelope-fixture-request' };
const cases: { path: string; id: FormId; body: Record<string, unknown> }[] = [
  {
    path: 'app/api/seller/managed-program/route.ts',
    id: 'seller.managed-supply-proposal',
    body: {
      ...key,
      action: 'propose_fixed_supply',
      productId: 'product-one',
      quantity: 1,
      agreedUnitPaisa: 1000,
      agreementVersion: 'v1',
      agreementLanguage: 'en',
      payoutBeneficiaryReference: 'SIMULATED reference',
    },
  },
  {
    path: 'app/api/rider/remittances/route.ts',
    id: 'rider.remittance',
    body: {
      ...key,
      jobId: 'job-one',
      amountPaisa: 1000,
      reference: 'SIMULATED record',
    },
  },
  {
    path: 'app/api/admin/orders/[id]/delivery/route.ts',
    id: 'staff.delivery-assignment',
    body: {
      ...key,
      method: 'courier',
      courierName: 'Fictional Courier',
      trackingReference: 'SIMULATED reference',
    },
  },
  {
    path: 'app/api/admin/invoices/[id]/adjustments/route.ts',
    id: 'staff.invoice-adjustment',
    body: {
      ...key,
      kind: 'credit',
      amountPaisa: 100,
      reasonCode: 'defect',
      note,
    },
  },
  {
    path: 'app/api/admin/managed-makers/[id]/activate/route.ts',
    id: 'staff.managed-maker-activation',
    body: {
      ...key,
      model: 'managed_fixed_supplier_price_v1',
      agreementVersion: 'v1',
      agreementLanguage: 'en',
      note,
    },
  },
  {
    path: 'app/api/admin/orders/[id]/parcels/route.ts',
    id: 'staff.parcel-control',
    body: {
      ...key,
      action: 'dispatch',
      jobId: 'job-one',
      version: 1,
      note,
      method: 'courier',
      courierName: 'Fictional Courier',
      trackingCode: 'SIMULATED reference',
    },
  },
  {
    path: 'app/api/admin/privacy/[id]/route.ts',
    id: 'staff.privacy-action',
    body: { ...key, action: 'request_information', note },
  },
  {
    path: 'app/api/admin/riders/route.ts',
    id: 'staff.rider-control-1',
    body: {
      ...key,
      action: 'review',
      userId: 'rider-one',
      version: 1,
      status: 'approved',
      note,
    },
  },
  {
    path: 'app/api/admin/governance/route.ts',
    id: 'staff.governance-rule-create',
    body: {
      ...key,
      action: 'rule.create',
      data: {
        code: 'FIXTURE',
        titleEn: 'Fictional restriction',
        descriptionEn: note,
      },
    },
  },
  {
    path: 'app/api/admin/managed-program/[id]/route.ts',
    id: 'staff.managed-supply-decision',
    body: {
      ...key,
      action: 'decide_supply',
      recordId: 'record-one',
      decision: 'accept',
      quantityAccepted: 1,
      possessionStatus: 'received',
      qualityStatus: 'accepted',
      ownershipRecordStatus: 'simulated_terms_recorded',
      riskRecordStatus: 'simulated_terms_recorded',
      evidenceReference: 'SIMULATED evidence',
      reason: note,
    },
  },
  {
    path: 'app/orders/[orderNumber]/cancel/route.ts',
    id: 'commerce.order-cancellation',
    body: {
      ...key,
      action: 'confirm',
      sellerIds: ['seller-one'],
      fingerprint: 'fixture-fingerprint',
      reason: note,
    },
  },
  {
    path: 'app/api/admin/cancellations/route.ts',
    id: 'staff.cancellation-review',
    body: { reviewId: 'review-one', action: 'reject', note },
  },
  {
    path: 'app/api/admin/returns/[id]/review/route.ts',
    id: 'staff.return-case-action',
    body: {
      ...idempotency,
      action: 'request_changes',
      note,
      publicMessageEn: note,
      sourceFormId: 'staff.return-case-action',
    },
  },
  {
    path: 'app/api/admin/returns/[id]/high-value/route.ts',
    id: 'staff.return-case-action',
    body: {
      ...idempotency,
      decision: 'reject',
      note,
      publicMessageEn: note,
      sourceFormId: 'staff.return-case-action',
    },
  },
  {
    path: 'app/api/admin/returns/[id]/operations/route.ts',
    id: 'staff.return-case-action',
    body: {
      ...idempotency,
      action: 'mark_received',
      note,
      publicMessageEn: note,
      sourceFormId: 'staff.return-case-action',
    },
  },
  {
    path: 'app/api/admin/complaints/[id]/route.ts',
    id: 'staff.complaint-case-action',
    body: {
      ...idempotency,
      action: 'investigate',
      note,
      publicMessageEn: note,
      sourceFormId: 'staff.complaint-case-action',
    },
  },
  {
    path: 'app/api/admin/seller-applications/[id]/review/route.ts',
    id: 'staff.seller-review-action',
    body: { ...key, action: 'start_review', reason: note },
  },
  {
    path: 'app/api/admin/sellers/[id]/governance/route.ts',
    id: 'staff.seller-governance',
    body: {
      ...key,
      action: 'set_restriction',
      mode: 'suspended',
      suspendedUntil: Date.now() + 86400000,
      obligationMode: 'admin_review',
      reasonCode: 'policy_violation',
      reason: note,
      expectedVersion: 1,
    },
  },
  {
    path: 'app/api/admin/products/[id]/review/route.ts',
    id: 'staff.product-review',
    body: { ...key, action: 'start_review', reason: note },
  },
  {
    path: 'app/api/admin/products/[id]/homepage/route.ts',
    id: 'staff.homepage-visibility',
    body: { ...key, hidden: true, expectedVersion: 1, reason: note },
  },
  {
    path: 'app/api/admin/orders/[id]/fulfillment/route.ts',
    id: 'staff.order-fulfillment',
    body: {
      ...key,
      action: 'dispatch',
      note,
      trackingCode: 'SIMULATED reference',
    },
  },
  {
    path: 'app/api/admin/reviews/[id]/route.ts',
    id: 'staff.review-moderation',
    body: { ...idempotency, action: 'publish', note },
  },
  {
    path: 'app/api/admin/reviews/[id]/reply/route.ts',
    id: 'staff.review-moderation',
    body: { ...idempotency, action: 'publish', note, version: 1 },
  },
  {
    path: 'app/api/seller/shipping/route.ts',
    id: 'seller.shipping-request',
    body: { ...key, orderId: 'order-one', direction: 'outbound', note },
  },
  {
    path: 'app/api/seller/shipping/[id]/route.ts',
    id: 'seller.shipping-action',
    body: { ...key, action: 'picked_up', note },
  },
  {
    path: 'app/api/seller/payout-requests/route.ts',
    id: 'seller.payout-request',
    body: { ...key, note },
  },
  {
    path: 'app/api/seller/reviews/[id]/reply/route.ts',
    id: 'seller.review-reply',
    body: {
      ...idempotency,
      version: 0,
      body: 'Fictional reply text '.repeat(100),
    },
  },
  {
    path: 'app/api/admin/shipping/[id]/route.ts',
    id: 'shipping.console-action-staff',
    body: {
      ...key,
      action: 'record_label',
      note,
      labelReference: 'SIMULATED reference',
    },
  },
  {
    path: 'app/api/rider/verify-code/route.ts',
    id: 'rider.code-verify',
    body: { ...key, jobId: 'job-one', version: 1, code: '123456' },
  },
  {
    path: 'app/api/seller/returns/[id]/response/route.ts',
    id: 'seller.case-return-response',
    body: { ...idempotency, recommendation: 'contest', response: note },
  },
  {
    path: 'app/api/seller/complaints/[id]/response/route.ts',
    id: 'seller.case-complaint-response',
    body: { ...idempotency, response: note },
  },
  {
    path: 'app/api/admin/catalog/route.ts',
    id: 'staff.catalog',
    body: {
      ...idempotency,
      kind: 'category',
      slug: 'fictional-category',
      nameEn: 'Fictional category',
      isActive: true,
      sortOrder: 1,
    },
  },
  {
    path: 'app/api/admin/products/[id]/classification/route.ts',
    id: 'staff.product-classification',
    body: { ...idempotency, categoryId: 'category-one', occasionIds: [] },
  },
  {
    path: 'app/api/admin/exception-work/route.ts',
    id: 'staff.exception-work',
    body: {
      ...key,
      action: 'create',
      jobId: 'job-one',
      kind: 'failed_delivery',
      note,
      nextAction: note,
    },
  },
  {
    path: 'app/api/admin/payout-requests/[id]/route.ts',
    id: 'staff.payout-request-action',
    body: { ...key, action: 'reject', note },
  },
];

declare global {
  var envelopeDb: D1Database;
  var envelopeMutations: FormAnswerSnapshot[];
}
// Only the domain/transport side effects are intercepted. Publication parsing,
// current shared validators and every receiving route remain their real modules.
const stubModules = new Map<string, Set<string>>();
const domainPattern =
  /^@\/lib\/(?:db\/repositories\/|managed-commerce\/|operations\/|riders\/repository$|delivery\/repository$|cancellation\/repository$|email\/)/;
for (const item of cases) {
  const source = ts.createSourceFile(
    item.path,
    readFileSync(item.path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !domainPattern.test(statement.moduleSpecifier.text) ||
      statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword
    )
      continue;
    const names =
      stubModules.get(statement.moduleSpecifier.text) ?? new Set<string>();
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const element of bindings.elements)
        if (!element.isTypeOnly)
          names.add(element.propertyName?.text ?? element.name.text);
    stubModules.set(statement.moduleSpecifier.text, names);
  }
}
const sourceUrl = (source: string) =>
  'data:text/javascript,' + encodeURIComponent(source);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return {
        url: sourceUrl(
          'export const env={get DB(){return globalThis.envelopeDb},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3000"};',
        ),
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/staff')
      return {
        url: sourceUrl(
          'export class StaffAuthorizationError extends Error{};export async function requireStaffApi(){return {id:"sa-one",role:"super_admin",authSubject:"fictional-envelope-super-admin"}}',
        ),
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/seller')
      return {
        url: sourceUrl(
          'export class SellerAuthorizationError extends Error{};export async function requireSellerApi(){return {userId:"seller-user",sellerId:"seller-one"}}',
        ),
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/customer')
      return {
        url: sourceUrl(
          'export class CustomerAuthorizationError extends Error{};export async function requireCustomerApi(){return {userId:"rider-one"}};export async function getCustomerUser(){return {userId:"customer-one"}}',
        ),
        shortCircuit: true,
      };
    if (specifier === '@/lib/http/rate-limit')
      return {
        url: sourceUrl(
          'export async function consumeRequestRateLimit(){return {allowed:true}};export const consumePublicRequestRateLimit=consumeRequestRateLimit;export function rateLimitJson(){throw new Error("Unexpected fixture rate denial")};',
        ),
        shortCircuit: true,
      };
    // Pure action lookup is part of the receiving adapter, not a domain side effect.
    if(specifier==='@/lib/managed-commerce/finance-contract')return nextResolve(specifier,context);
    const names = stubModules.get(specifier);
    if (names) {
      const source = [...names]
        .map((name) =>
          name.endsWith('Error')
            ? `export class ${name} extends Error{}`
            : name === 'reportSelect'
              ? `export const reportSelect="SELECT fixture";`
              : `export async function ${name}(...args){const option=args.find(value=>value&&typeof value==="object"&&value.form);if(option)globalThis.envelopeMutations.push(option.form.answers);return ${name === 'getEffectiveBusinessSetting' ? '{value:["defect"]}' : name === 'approvedRider' ? 'true' : /^(?:create|request|saveTaxonomy|submitRegistered)/.test(name) ? '"fixture-result"' : '{id:"fixture-result",ok:true,status:"cancelled",simulation:true,created:true,version:1}'};}`,
        )
        .join('\n');
      return { url: sourceUrl(source), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

class FixtureDatabase {
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    let values: SQLInputValue[] = [];
    const statement =
      sql.includes('form_config_versions') || sql.includes('form_answer_sets') || sql.includes('audit_logs') || sql.startsWith('SELECT u.id,r.role,p.permissions_json AS profile FROM users u') || sql.startsWith('SELECT auth_subject subject FROM users WHERE')
        ? this.sqlite.prepare(sql)
        : null;
    const result = {
      bind(...bindings: SQLInputValue[]) {
        values = bindings;
        return result;
      },
      async first<T>() {
        if (sql.startsWith('SELECT COALESCE(control.version,0) version'))
          return { version: 1, hidden: 0, requestId: null } as T;
        return (
          ((statement
            ? statement.get(...values)
            : {
                id: 'fixture-parent',
                sellers: '["seller-one"]',
                number: 'FIXTURE-ORDER',
                status: 'pending',
              }) as T) ?? null
        );
      },
      async all<T>() {
        return { results: statement ? (statement.all(...values) as T[]) : [] };
      },
      async run() {
        throw new Error('Envelope fixture must not write domain state');
      },
    };
    return result;
  }
  async batch() {
    throw new Error('Envelope fixture must not write domain state');
  }
}
function fixture(item: (typeof cases)[number]) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,auth_subject TEXT); CREATE TABLE user_roles(user_id TEXT REFERENCES users(id),role TEXT); CREATE TABLE staff_permission_profiles(user_id TEXT REFERENCES users(id),permissions_json TEXT);');
  const auditSchema = readFileSync('drizzle/0000_clear_lizard.sql', 'utf8')
    .split('--> statement-breakpoint').find((sql) => sql.includes('CREATE TABLE `audit_logs`'));
  assert.ok(auditSchema, 'canonical audit receipt schema must exist');
  sqlite.exec(auditSchema);
  for (const sql of readFileSync('drizzle/0056_form_catalog.sql', 'utf8').split(
    '--> statement-breakpoint',
  ))
    if (sql.trim()) sqlite.exec(sql);
  sqlite.exec("INSERT INTO users VALUES('sa-one','active','fictional-envelope-super-admin'); INSERT INTO user_roles VALUES('sa-one','super_admin')");
  const fields = Array.from({ length: 26 }, (_, order) => ({
    id: `context_${order}`,
    key: `context_${order}`,
    label: 'Context',
    type: 'long_text' as const,
    required: true,
    order,
    status: 'active' as const,
  }));
  const pending = FORM_REGISTRY[item.id].adapterId.startsWith('pending:');
  const draft = pending
    ? { formId: item.id, fields }
    : validateFormDraft(item.id, { formId: item.id, fields });
  const raw = fields.map((field) => ({
    fieldId: field.id,
    value: 'x'.repeat(5000),
  }));
  const prototype = {
    formId: item.id,
    version: 1,
    answers: fields.map((field, index) => ({
      fieldId: field.id,
      label: field.label,
      type: field.type,
      value: raw[index].value,
    })),
  };
  raw[25].value = 'x'.repeat(
    5000 - Math.max(0, Buffer.byteLength(JSON.stringify(prototype)) - 131000),
  );
  const snapshot = pending
    ? null
    : validateAnswersForDefinition(
        FORM_REGISTRY[item.id],
        { ...draft, version: 1, publishedAt: 1 },
        raw,
      );
  if (snapshot)
    assert.equal(Buffer.byteLength(JSON.stringify(snapshot)), 131000);
  sqlite
    .prepare(
      `INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES(?,?,1,1,'published',?,'Fictional publication','sa-one',1,'sa-one',1,'sa-one',1,?)`,
    )
    .run(
      item.id + '-v1',
      item.id,
      JSON.stringify(draft),
      item.id + '-publication',
    );
  globalThis.envelopeDb = new FixtureDatabase(sqlite) as unknown as D1Database;
  globalThis.envelopeMutations = [];
  return { sqlite, pending, raw, snapshot };
}
async function receive(
  item: (typeof cases)[number],
  body: BodyInit,
  declared?: string,
) {
  const route = (await import('../' + item.path)) as Partial<
    Record<
      'POST' | 'PATCH' | 'PUT',
      (
        request: Request,
        context: { params: Promise<{ id: string; orderNumber: string }> },
      ) => Promise<Response>
    >
  >;
  const method = route.POST ? 'POST' : route.PATCH ? 'PATCH' : 'PUT';
  const handler = route[method];
  assert.ok(handler);
  const path =
    '/' +
    item.path
      .slice(4, -9)
      .replaceAll('[id]', 'fixture-parent')
      .replaceAll('[orderNumber]', 'FIXTURE-ORDER');
  return handler(
    new Request('http://localhost:3000' + path, {
      method,
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
        ...(declared ? { 'content-length': declared } : {}),
      },
      body,
    }),
    {
      params: Promise.resolve({
        id: 'fixture-parent',
        orderNumber: 'FIXTURE-ORDER',
      }),
    },
  );
}
for (const item of cases) {
  void test(
    item.path + ': published answer budget and finite JSON boundary',
    async () => {
      const h = fixture(item);
      try {
        const malformed = ['{', 'null', '[]', new Uint8Array([0xff])];
        for (const body of malformed)
          assert.equal(
            (await receive(item, body)).status,
            400,
            item.path + ': malformed object/UTF8',
          );
        const invalidUtf8 = Buffer.from(
          JSON.stringify({
            ...item.body,
            formVersion: 1,
            customAnswers: h.raw.map((entry) => ({ ...entry, value: 'x' })),
          }),
        );
        invalidUtf8[invalidUtf8.indexOf('"value":"x"') + 9] = 0xff;
        assert.equal(
          (await receive(item, invalidUtf8)).status,
          400,
          item.path + ': invalid UTF8 inside otherwise valid JSON',
        );
        assert.equal(
          (await receive(item, ' ', '262145')).status,
          413,
          item.path + ': advertised overflow',
        );
        assert.equal(
          (await receive(item, ' '.repeat(262145))).status,
          413,
          item.path + ': streamed overflow',
        );
        assert.equal(
          globalThis.envelopeMutations.length,
          0,
          'failed parsing must never reach domain effects',
        );
        assert.equal(
          Number(
            h.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()
              ?.n,
          ),
          0,
        );
        const payload = { ...item.body, formVersion: 1, customAnswers: h.raw };
        assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 262144);
        const response = await receive(item, JSON.stringify(payload));
        if (h.pending) {
          assert.equal(
            response.status,
            503,
            item.id + ': pending publication remains unavailable',
          );
          assert.equal(globalThis.envelopeMutations.length, 0);
        } else {
          assert.ok(
            response.ok,
            item.id +
              ': upper-budget validated context accepted (' +
              response.status +
              '): ' + (await response.clone().text()),
          );
          assert.equal(globalThis.envelopeMutations.length, 1);
          assert.deepEqual(globalThis.envelopeMutations[0], h.snapshot);
          const small = h.raw.map((entry) => ({
            ...entry,
            value: 'Fictional context',
          }));
          const normal = await receive(
            item,
            JSON.stringify({
              ...item.body,
              formVersion: 1,
              customAnswers: small,
            }),
          );
          assert.ok(normal.ok, item.id + ': normal body remains accepted');
          assert.equal(globalThis.envelopeMutations.length, 2);
        }
      } finally {
        h.sqlite.close();
      }
    },
  );
}

void test('fixed JSON envelope accepts its exact boundary and rejects advertised overflow without reading the stream', async () => {
  const { readBoundedJsonObject } = await import('../lib/http/form-json-body');
  const size = 256 * 1024;
  const padding = 'x'.repeat(
    size - Buffer.byteLength(JSON.stringify({ padding: '' })),
  );
  const boundary = JSON.stringify({ padding });
  assert.equal(Buffer.byteLength(boundary), size);
  assert.equal(
    (
      await readBoundedJsonObject(
        new Request('http://localhost:3000/fixture', {
          method: 'POST',
          body: boundary,
        }),
      )
    ).padding,
    padding,
  );
  let read = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        read = true;
        throw new Error('Advertised overflow must not read input');
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request('http://localhost:3000/fixture', {
    method: 'POST',
    headers: { 'content-length': String(size + 1) },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  await assert.rejects(readBoundedJsonObject(request), {
    name: 'Error',
    message: 'The request is too large.',
  });
  assert.equal(read, false);
});
