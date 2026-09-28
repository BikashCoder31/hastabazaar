import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
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

const note = 'Fictional reviewed evidence';
const requestId = 'envelope-fixture-request';
const idempotencyKey = '10000000-0000-4000-8000-000000000001';
const address = {
  label: 'Fictional home',
  recipientName: 'Fictional Buyer',
  phone: '9800000000',
  province: 'Bagmati',
  district: 'Kathmandu',
  municipality: 'Kathmandu',
  ward: '1',
  locality: 'Fictional locality',
};
const cases: { path: string; id: FormId; body: Record<string, unknown> }[] = [
  {
    path: 'app/api/checkout/route.ts',
    id: 'commerce.checkout',
    body: {
      idempotencyKey,
      customerEmail: 'buyer@hastabazaar.local',
      customerPhone: '9800000000',
      address,
      termsAccepted: true,
      deliveryRateVersion: 'fictional-rate-v1',
    },
  },
  {
    path: 'app/api/account/gift-cards/route.ts',
    id: 'commerce.gift-card-redeem',
    body: { requestId, code: 'SIMULATED-FICTIONAL-CODE' },
  },
  {
    path: 'app/api/admin/gift-cards/route.ts',
    id: 'commerce.gift-card-issue',
    body: { requestId, amount: '100.00' },
  },
  {
    path: 'app/orders/[orderNumber]/complaints/route.ts',
    id: 'commerce.complaint',
    body: {
      idempotencyKey,
      category: 'product',
      subject: 'Fictional product concern',
      detail: note.repeat(90),
    },
  },
  {
    path: 'app/api/seller/products/[id]/inventory/route.ts',
    id: 'seller.inventory',
    body: { requestId, quantity: 1, reason: note },
  },
  {
    path: 'app/api/seller/profile/route.ts',
    id: 'seller.profile',
    body: {
      idempotencyKey,
      profile: {
        tradingName: 'Fictional shop',
        businessDescription: note,
        productCategories: 'Crafts',
        supportPhone: '9800000000',
        supportEmail: 'seller@hastabazaar.local',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu',
        ward: '1',
        locality: 'Fictional locality',
      },
    },
  },
  {
    path: 'app/api/seller-applications/profile/route.ts',
    id: 'seller.maker-profile',
    body: {
      requestId,
      publicName: 'Fictional Maker',
      publicCity: 'Kathmandu',
      expectedVersion: 1,
      experienceCraft: '',
      experienceBand: '',
    },
  },
  {
    path: 'app/api/account/privacy/route.ts',
    id: 'account.privacy-request',
    body: { requestId, requestType: 'export', detail: note },
  },
  {
    path: 'app/api/account/addresses/route.ts',
    id: 'account.address',
    body: { idempotencyKey, address },
  },
  {
    path: 'app/api/account/addresses/[id]/route.ts',
    id: 'account.address',
    body: { idempotencyKey, address },
  },
  {
    path: 'app/api/account/profile/route.ts',
    id: 'account.profile',
    body: {
      idempotencyKey,
      displayName: 'Fictional Buyer',
      phone: '9800000000',
      locale: 'en-NP',
    },
  },
  {
    path: 'app/api/products/[id]/reviews/route.ts',
    id: 'account.review',
    body: {
      idempotencyKey,
      orderItemId: 'fictional-order-item',
      rating: 5,
      title: 'Fictional purchase',
      body: note,
    },
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
  /^@\/lib\/(?:db\/repositories\/|managed-commerce\/|operations\/|riders\/repository$|delivery\/repository$|cancellation\/repository$|email\/|analytics\/)/;
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
          'export class StaffAuthorizationError extends Error{};export async function requireStaffApi(){return {id:"sa-one",role:"super_admin"}}',
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
          'export class CustomerAuthorizationError extends Error{};export async function requireCustomerApi(){return {userId:"customer-one",authSubject:"customer-auth",email:"buyer@hastabazaar.local"}};export const requireExistingCustomerApi=requireCustomerApi;export async function getCustomerUser(){return {userId:"customer-one",authSubject:"customer-auth",email:"buyer@hastabazaar.local"}}',
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
    const names = stubModules.get(specifier);
    if (names) {
      const actualExports = new Set([
        'validateAddressFormSubmission',
        'validateReviewFormSubmission',
        'validatePrivacyRequestForm',
        'parseGiftAmount',
        'complaintCategories',
      ]);
      const actual = pathToFileURL(
        process.cwd() + '/' + specifier.slice(2) + '.ts',
      ).href;
      const source = [...names]
        .map((name) => {
          if (actualExports.has(name))
            return 'export {' + name + '} from ' + JSON.stringify(actual) + ';';
          if (name.endsWith('Error'))
            return 'export class ' + name + ' extends Error{}';
          const value =
            name === 'customerProfileRequestStatus'
              ? '"new"'
              : /RequestStatus$|^privacyRequestStatus$/.test(name)
                ? '{status:"new"}'
                : name === 'getSellerParticipationForUser'
                  ? '{sellerId:"seller-one"}'
                  : name === 'createCodOrder'
                    ? '{orderNumber:"FIXTURE-ORDER"}'
                    : /^(create|request)/.test(name)
                      ? '"fixture-result"'
                      : '{ok:true}';
          return (
            'export async function ' +
            name +
            '(...args){const option=args.find(value=>value&&typeof value==="object"&&(value.form||value.answers));if(option)globalThis.envelopeMutations.push(option.form?option.form.answers:option.answers);return ' +
            value +
            ';}'
          );
        })
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
      sql.includes('form_config_versions') || sql.includes('form_answer_sets')
        ? this.sqlite.prepare(sql)
        : null;
    const result = {
      bind(...bindings: SQLInputValue[]) {
        values = bindings;
        return result;
      },
      async first<T>() {
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
  sqlite.exec('CREATE TABLE users(id TEXT PRIMARY KEY);');
  for (const sql of readFileSync('drizzle/0056_form_catalog.sql', 'utf8').split(
    '--> statement-breakpoint',
  ))
    if (sql.trim()) sqlite.exec(sql);
  sqlite.exec("INSERT INTO users VALUES('sa-one')");
  const fields = Array.from({ length: 26 }, (_, order) => ({
    id: `context_${order}`,
    key: `context_${order}`,
    label: 'Context',
    type: 'long_text' as const,
    required: true,
    order,
    status: 'active' as const,
  }));
  assert.ok(
    !FORM_REGISTRY[item.id].adapterId.startsWith('pending:'),
    'Follow-up adapters must be live',
  );
  assert.equal(FORM_REGISTRY[item.id].capabilities.answerBehavior, 'record');
  const draft = validateFormDraft(item.id, { formId: item.id, fields });
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
  const snapshot = validateAnswersForDefinition(
    FORM_REGISTRY[item.id],
    { ...draft, version: 1, publishedAt: 1 },
    raw,
  );
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
  return { sqlite, raw, snapshot };
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
        cookie: 'hastabazaar_cart=fictional-loopback-cart',
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
        // One 5000-character field uses legal JSON Unicode escapes. The parsed
        // value and validated snapshot remain identical, while the finite request
        // representation exceeds the old 128 KiB cap without padding/extra keys.
        const upperBody = JSON.stringify(payload).replace(
          JSON.stringify(h.raw[0].value),
          '"' + '\\u0078'.repeat(h.raw[0].value.length) + '"',
        );
        assert.deepEqual(JSON.parse(upperBody), payload);
        assert.ok(Buffer.byteLength(upperBody) > 131072);
        assert.ok(Buffer.byteLength(upperBody) < 262144);
        const response = await receive(item, upperBody);

        assert.ok(
          response.ok,
          item.id +
            ': upper-budget validated context accepted (' +
            response.status +
            ')',
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
      } finally {
        h.sqlite.close();
      }
    },
  );
}
