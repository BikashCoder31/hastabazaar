import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { requestFingerprint } from '../lib/http/rate-limit';

registerHooks({ resolve(specifier, context, next) {
  const modules: Record<string, string> = {
    'cloudflare:workers': 'export const env={get DB(){return globalThis.securityBudgetDb},EMAIL:{configured:true}}',
    '@/lib/auth/customer': 'export class CustomerAuthorizationError extends Error {}; export async function requireCustomerApi(){return {userId:globalThis.securityBudgetUser}}',
    '@/lib/forms/runtime': 'export class FormRuntimeError extends Error{}; export async function resolvePublishedForm(){throw new FormRuntimeError("Budget reached form validation")}',
    '@/lib/forms/submission': 'export function configuredMultipartAnswers(){}; export async function validateSellerFormSubmission(){}',
    '@/lib/db/repositories/operations': 'export class OperationsConflictError extends Error{}; export async function privacyRequestStatus(){return {status:"new"}}; export async function validatePrivacyRequestForm(){return {}}; export async function createDataRightsRequest(){return "fictional-request"}',
    '@/lib/db/repositories/customers': 'export class CustomerDataConflictError extends Error{}; export async function createProductReview(){}; export async function productReviewRequestStatus(){}; export async function validateReviewFormSubmission(){}',
  };
  if (modules[specifier]) return { shortCircuit: true, url: `data:text/javascript,${modules[specifier]}` };
  return next(specifier, context);
} });
declare global { var securityBudgetDb: D1Database; var securityBudgetUser: string }

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE request_rate_limits(key TEXT PRIMARY KEY,request_count INTEGER,window_started_at INTEGER,expires_at INTEGER)');
  globalThis.securityBudgetDb = { prepare(sql: string) {
    let values: SQLInputValue[] = [];
    return { bind(...args: SQLInputValue[]) { values = args; return this; }, async first() { return sqlite.prepare(sql).get(...values) ?? null; } };
  } } as unknown as D1Database;
  return sqlite;
}
function restore(key: string, value: string | undefined) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }

void test('actual reset request consumes the authentication network budget once and email budget independently', async () => {
  const sqlite = fixture(); const previous = process.env.TRUSTED_CLIENT_IP_HEADER;
  try {
    process.env.TRUSTED_CLIENT_IP_HEADER = 'cf-connecting-ip';
    const { POST } = await import('../app/api/auth/password-reset/request/route');
    const request = () => new Request('https://app.test/api/auth/password-reset/request', { method: 'POST',
      headers: { origin: 'https://app.test', 'cf-connecting-ip': '192.0.2.10' }, body: new URLSearchParams({ email: 'fictional@example.test' }) });
    assert.equal((await POST(request())).status, 409);
    const key = await requestFingerprint(request(), 'authentication-network');
    assert.equal(sqlite.prepare('SELECT request_count n FROM request_rate_limits WHERE key=?').get(key)?.n, 1);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM request_rate_limits').get()?.n, 2);
    for (let i = 0; i < 2; i++) assert.equal((await POST(request())).status, 409);
    assert.match((await POST(request())).headers.get('location') ?? '', /error=rate/);
  } finally { sqlite.close(); restore('TRUSTED_CLIENT_IP_HEADER', previous); }
});

void test('privacy account allowances do not exhaust other accounts on one trusted network', async () => {
  const sqlite = fixture(); const previous = process.env.TRUSTED_CLIENT_IP_HEADER;
  try {
    process.env.TRUSTED_CLIENT_IP_HEADER = 'cf-connecting-ip';
    const { POST } = await import('../app/api/account/privacy/route');
    const request = () => new Request('https://app.test/api/account/privacy', { method: 'POST',
      headers: { origin: 'https://app.test', 'cf-connecting-ip': '192.0.2.10', 'content-type': 'application/json' },
      body: JSON.stringify({ requestType: 'access', detail: 'Fictional request', requestId: crypto.randomUUID(), formVersion: 1, customAnswers: [] }) });
    for (let i = 0; i < 6; i++) { globalThis.securityBudgetUser = `fictional-${i}`; assert.equal((await POST(request())).status, 201, `account ${i}`); }
    globalThis.securityBudgetUser = 'fictional-0';
    for (let i = 0; i < 4; i++) assert.equal((await POST(request())).status, 201);
    assert.equal((await POST(request())).status, 429);
  } finally { sqlite.close(); restore('TRUSTED_CLIENT_IP_HEADER', previous); }
});

void test('network fallback ignores untrusted forwarded IP and explicitly trusted proxy separates networks', async () => {
  const previous = process.env.TRUSTED_CLIENT_IP_HEADER;
  const a = new Request('https://app.test', { headers: { 'x-forwarded-for': '192.0.2.1', 'cf-connecting-ip': '192.0.2.1' } });
  const b = new Request('https://app.test', { headers: { 'x-forwarded-for': '192.0.2.2', 'cf-connecting-ip': '192.0.2.2' } });
  try {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    assert.equal(await requestFingerprint(a, 'authentication-network'), await requestFingerprint(b, 'authentication-network'));
    process.env.TRUSTED_CLIENT_IP_HEADER = 'x-forwarded-for';
    assert.equal(await requestFingerprint(a, 'authentication-network'), await requestFingerprint(b, 'authentication-network'));
    process.env.TRUSTED_CLIENT_IP_HEADER = 'cf-connecting-ip';
    assert.notEqual(await requestFingerprint(a, 'authentication-network'), await requestFingerprint(b, 'authentication-network'));
    assert.equal(await requestFingerprint(a, 'privacy-request:user'), await requestFingerprint(b, 'privacy-request:user'));
    assert.equal(await requestFingerprint(new Request('https://app.test'), 'authentication-network'), await requestFingerprint(new Request('https://app.test'), 'authentication-network'));
  } finally { restore('TRUSTED_CLIENT_IP_HEADER', previous); }
});

for (const trusted of [true, false]) void test(`review allowances remain per account with trusted proxy ${trusted}`, async () => {
  const sqlite = fixture(); const previous = process.env.TRUSTED_CLIENT_IP_HEADER;
  try {
    if (trusted) process.env.TRUSTED_CLIENT_IP_HEADER = 'cf-connecting-ip'; else delete process.env.TRUSTED_CLIENT_IP_HEADER;
    const { POST } = await import('../app/api/products/[id]/reviews/route');
    const request = () => new Request('https://app.test/api/products/product/reviews', { method: 'POST',
      headers: { origin: 'https://app.test', 'cf-connecting-ip': '192.0.2.10', 'content-type': 'application/json' }, body: '{}' });
    for (let i = 0; i < 11; i++) { globalThis.securityBudgetUser = `reviewer-${i}`; assert.equal((await POST(request(), { params: Promise.resolve({ id: 'product' }) })).status, 400); }
    globalThis.securityBudgetUser = 'reviewer-0';
    for (let i = 0; i < 9; i++) assert.equal((await POST(request(), { params: Promise.resolve({ id: 'product' }) })).status, 400);
    assert.equal((await POST(request(), { params: Promise.resolve({ id: 'product' }) })).status, 429);
  } finally { sqlite.close(); restore('TRUSTED_CLIENT_IP_HEADER', previous); }
});

void test('reset account budget does not double-consume the unverified fallback network', async () => {
  const sqlite = fixture(); const previous = process.env.TRUSTED_CLIENT_IP_HEADER;
  try {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    const { POST } = await import('../app/api/auth/password-reset/request/route');
    const request = new Request('https://app.test/api/auth/password-reset/request', { method: 'POST', body: new URLSearchParams({ email: 'fictional@example.test' }) });
    await POST(request);
    const key = await requestFingerprint(request, 'authentication-network');
    assert.equal(sqlite.prepare('SELECT request_count n FROM request_rate_limits WHERE key=?').get(key)?.n, 1);
  } finally { sqlite.close(); restore('TRUSTED_CLIENT_IP_HEADER', previous); }
});
