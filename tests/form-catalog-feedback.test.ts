import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '../lib/forms/access';
import { validateFormDraft } from '../lib/forms/validation';

declare global {
  var feedbackCatalogDb: D1Database;
  var feedbackCatalogMail: { sent: unknown[]; attempts: number; configured: boolean; reject: boolean;
    hold: Promise<void> | null; send(message: unknown): Promise<void> };
  var feedbackCatalogBlocked: boolean;
  var feedbackCatalogStaff: { id: string; role: 'admin'; permissions: string[] };
  var feedbackCatalogConfig: { config: { formId: string; version: number; publishedAt: number; fields: unknown[] };
    status: 'ready'; canSubmit: true; message: string; refresh(): void; handleSubmissionResponse(response: Response): boolean };
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {get DB(){return globalThis.feedbackCatalogDb},get EMAIL(){return globalThis.feedbackCatalogMail},EMAIL_DELIVERY_CONFIGURED:"false"}', shortCircuit: true };
    if (specifier === '@/lib/http/rate-limit') return { url: 'data:text/javascript,export async function consumePublicRequestRateLimit(){return {allowed:!globalThis.feedbackCatalogBlocked}};export async function consumeRequestRateLimit(){return {allowed:!globalThis.feedbackCatalogBlocked}};export function rateLimitJson(){return Response.json({error:"Rate limited"},{status:429})}', shortCircuit: true };
    if (specifier === '@/lib/auth/staff') return { url: 'data:text/javascript,export async function requireStaffPage(){return globalThis.feedbackCatalogStaff}', shortCircuit: true };
    if (specifier === '@/components/forms/form-config-client') return { url: 'data:text/javascript,export function usePublishedFormConfig(){return globalThis.feedbackCatalogConfig}', shortCircuit: true };
    if (specifier === 'next/link') return { url: 'data:text/javascript,export default function Link({children}){return children}', shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync,
    private readonly beforeAll?: () => Promise<void>) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { await this.beforeAll?.(); return { results: this.statement.all(...this.values) as T[] }; }
  async run() { const result = this.statement.run(...this.values); return { success: true, meta: { changes: Number(result.changes) }, results: [] }; }
}
class Database {
  beforeBatch: (() => void | Promise<void>) | null = null;
  failNextSql: RegExp | null = null;
  beforeNextAll: { sql: RegExp; run: () => Promise<void> } | null = null;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    if (this.failNextSql?.test(sql)) { this.failNextSql = null; throw new Error('simulated database failure'); }
    const hook = this.beforeNextAll?.sql.test(sql) ? this.beforeNextAll.run : undefined;
    if (hook) this.beforeNextAll = null;
    return new Statement(this.sqlite.prepare(sql), hook);
  }
  async batch(statements: readonly Statement[]) {
    const before = this.beforeBatch; this.beforeBatch = null;
    await before?.();
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

const field = { id: 'delivery_note', key: 'delivery_note', type: 'short_text', label: 'Original routing note', required: true, order: 1, status: 'active' } as const;
const count = (sqlite: DatabaseSync, table: string) => Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT NOT NULL);
    INSERT INTO users VALUES ('admin','active'),('other','active');
    CREATE TABLE user_roles(user_id TEXT NOT NULL,role TEXT NOT NULL);
    INSERT INTO user_roles VALUES ('admin','admin'),('other','customer');
    CREATE TABLE staff_permission_profiles(user_id TEXT PRIMARY KEY,permissions_json TEXT NOT NULL);
    INSERT INTO staff_permission_profiles VALUES ('admin','["support.manage"]');`);
  for (const migration of ['0056_form_catalog.sql', '0059_feedback_delivery_jobs.sql']) {
    const source = await readFile(new URL(`../drizzle/${migration}`, import.meta.url), 'utf8');
    for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  }
  const db = new Database(sqlite);
  globalThis.feedbackCatalogDb = db as unknown as D1Database;
  globalThis.feedbackCatalogMail = { sent: [], attempts: 0, configured: true, reject: false, hold: null,
    async send(message) { this.attempts++; if (this.reject) throw new Error('ambiguous capture rejection');
      await this.hold; this.sent.push(message); } };
  globalThis.feedbackCatalogBlocked = false;
  globalThis.feedbackCatalogStaff = { id: 'admin', role: 'admin', permissions: ['support.manage'] };
  return { sqlite, db };
}
function seed(sqlite: DatabaseSync, formId: string, version: number, fields: unknown[] = [field]) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,?,1,'published',?,'Test publication','admin',1,'admin',1,'admin',1,?)`)
    .run(`${formId}-v${version}`, formId, version, JSON.stringify({ formId, fields }), `seed-${formId}-${version}`);
}
function request(id: string, options: { kind?: 'contact' | 'feedback' | 'footer'; note?: string | null; version?: number; name?: string; honeypot?: boolean; unknown?: boolean } = {}) {
  const form = new FormData();
  const kind = options.kind ?? 'contact';
  form.set('kind', kind === 'footer' ? 'footer' : kind);
  form.set('pagePath', kind === 'feedback' ? '/feedback' : kind === 'contact' ? '/contact-us' : '/products/example');
  form.set('name', options.name ?? 'Asha Rai');
  form.set('email', 'asha@example.test');
  form.set('topic', 'General question');
  if (kind !== 'footer') form.set('subject', 'An order question');
  form.set('message', 'Could you help me with this handmade item?');
  form.set('privacyAcknowledgement', 'accepted');
  form.set('requestId', id);
  form.set('formVersion', String(options.version ?? 1));
  if (options.note !== null) form.set('custom.delivery_note', options.note ?? 'Please reply by email');
  if (options.honeypot) form.set('website', 'bot.example');
  if (options.unknown) form.set('custom.unknown_field', 'unsafe');
  return new Request('http://localhost:3000/api/feedback', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form });
}

void test('contact send atomically stores one answer and one sent job; exact retry does not resend', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('contact-one'))).status, 200);
    assert.equal(count(sqlite, 'feedback_delivery_jobs'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
    assert.equal((await POST(request('contact-one'))).status, 200);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('rejected send is not success; same request retries without another answer', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    globalThis.feedbackCatalogMail.configured = false;
    const retryable = await POST(request('retry-one'));
    assert.equal(retryable.status, 503);
    assert.equal(((await retryable.json()) as { code?: string }).code, 'delivery_retryable');
    assert.equal(count(sqlite, 'feedback_delivery_jobs'), 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
    globalThis.feedbackCatalogMail.configured = true;
    assert.equal((await POST(request('retry-one'))).status, 200);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
  } finally { sqlite.close(); }
});

void test('sent exact replay bypasses exhausted quota without another mail, while new work remains limited', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('quota-sent-one'))).status, 200);
    globalThis.feedbackCatalogBlocked = true;
    assert.equal((await POST(request('quota-sent-one'))).status, 200);
    assert.equal((await POST(request('quota-sent-one', { name: 'Different Name' }))).status, 409);
    assert.equal((await POST(request('quota-new-one'))).status, 429);
    assert.equal(globalThis.feedbackCatalogMail.attempts, 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('definitely failed exact delivery retries despite exhausted quota', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    globalThis.feedbackCatalogMail.configured = false;
    assert.equal((await POST(request('quota-retry-one'))).status, 503);
    assert.equal(sqlite.prepare("SELECT status FROM feedback_delivery_jobs WHERE request_id='quota-retry-one'").get()?.status, 'failed');
    globalThis.feedbackCatalogMail.configured = true;
    globalThis.feedbackCatalogBlocked = true;
    assert.equal((await POST(request('quota-retry-one'))).status, 200);
    assert.equal((await POST(request('quota-new-two'))).status, 429);
    assert.equal(globalThis.feedbackCatalogMail.attempts, 1);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('transient pre-lease answer read failure reports uncertainty without mailing', async () => {
  const { sqlite, db } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    db.failNextSql = /WHERE a\.subject_type=\?/;
    const failed = await POST(request('answer-read-one'));
    assert.equal(failed.status, 503);
    assert.equal(((await failed.json()) as { code?: string }).code, 'delivery_uncertain');
    assert.equal(globalThis.feedbackCatalogMail.attempts, 0);
    assert.notEqual(sqlite.prepare("SELECT status FROM feedback_delivery_jobs WHERE request_id='answer-read-one'").get()?.status, 'sending');
    assert.equal((await POST(request('answer-read-one'))).status, 200);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('pre-lease answer read failure reports uncertainty if an exact concurrent request sent', async () => {
  const { sqlite, db } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    globalThis.feedbackCatalogMail.configured = false;
    assert.equal((await POST(request('read-race-one'))).status, 503);
    globalThis.feedbackCatalogMail.configured = true;
    db.beforeNextAll = { sql: /WHERE a\.subject_type=\?/, async run() {
      assert.equal((await POST(request('read-race-one'))).status, 200);
      throw new Error('simulated delayed answer read failure');
    } };
    const overlapping = await POST(request('read-race-one'));
    assert.equal(overlapping.status, 503);
    assert.equal(((await overlapping.json()) as { code?: string }).code, 'delivery_uncertain');
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
  } finally { sqlite.close(); }
});

void test('pre-lease feedback decode failure reports uncertainty without mailing', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    globalThis.feedbackCatalogMail.configured = false;
    const failed = await POST(request('decode-retry-one'));
    assert.equal(failed.status, 503);
    assert.equal(((await failed.json()) as { code?: string }).code, 'delivery_retryable');
    const row = sqlite.prepare("SELECT feedback_json AS feedbackJson FROM feedback_delivery_jobs WHERE request_id='decode-retry-one'").get() as { feedbackJson: string };
    sqlite.prepare("UPDATE feedback_delivery_jobs SET feedback_json='{}' WHERE request_id='decode-retry-one'").run();
    globalThis.feedbackCatalogMail.configured = true;
    const decodeFailure = await POST(request('decode-retry-one'));
    assert.equal(decodeFailure.status, 503);
    assert.equal(((await decodeFailure.json()) as { code?: string }).code, 'delivery_uncertain');
    assert.equal(globalThis.feedbackCatalogMail.attempts, 0);
    assert.notEqual(sqlite.prepare("SELECT status FROM feedback_delivery_jobs WHERE request_id='decode-retry-one'").get()?.status, 'sending');
    sqlite.prepare("UPDATE feedback_delivery_jobs SET feedback_json=? WHERE request_id='decode-retry-one'").run(row.feedbackJson);
    assert.equal((await POST(request('decode-retry-one'))).status, 200);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
  } finally { sqlite.close(); }
});

void test('five definite pre-send failures end in a truthful exhausted response without a sixth mail attempt', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    globalThis.feedbackCatalogMail.configured = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await POST(request('exhausted-before-send'));
      assert.equal(response.status, 503);
      assert.equal(((await response.json()) as { code: string }).code,
        attempt === 5 ? 'delivery_exhausted' : 'delivery_retryable');
    }
    globalThis.feedbackCatalogMail.configured = true;
    const repeat = await POST(request('exhausted-before-send'));
    assert.equal(((await repeat.json()) as { code: string }).code, 'delivery_exhausted');
    assert.equal(globalThis.feedbackCatalogMail.attempts, 0);
    const job = sqlite.prepare("SELECT status,attempt_count AS attemptCount FROM feedback_delivery_jobs WHERE request_id='exhausted-before-send'").get() as
      { status: string; attemptCount: number };
    assert.equal(job.status, 'failed');
    assert.equal(job.attemptCount, 5);
  } finally { sqlite.close(); }
});

void test('ambiguous post-send persistence failure never automatically resends', async () => {
  const { sqlite, db } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    db.failNextSql = /UPDATE feedback_delivery_jobs SET status='sent'/;
    const uncertain = await POST(request('uncertain-one'));
    assert.equal(uncertain.status, 503);
    const uncertainBody = (await uncertain.json()) as { code?: string; error: string };
    assert.equal(uncertainBody.code, 'delivery_uncertain');
    assert.match(uncertainBody.error, /may have been sent|uncertain/i);
    assert.doesNotMatch(uncertainBody.error, /retry/i);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
    const repeat = await POST(request('uncertain-one'));
    assert.equal(repeat.status, 503);
    assert.equal(((await repeat.json()) as { code?: string }).code, 'delivery_uncertain');
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
  } finally { sqlite.close(); }
});

void test('ambiguous provider rejection is not success and never automatically resends', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    globalThis.feedbackCatalogMail.reject = true;
    const provider = await POST(request('provider-uncertain-one'));
    assert.equal(provider.status, 503);
    assert.equal(((await provider.json()) as { code?: string }).code, 'delivery_uncertain');
    assert.equal(sqlite.prepare("SELECT status FROM feedback_delivery_jobs WHERE request_id='provider-uncertain-one'").get()?.status, 'sending');
    globalThis.feedbackCatalogMail.reject = false;
    assert.equal((await POST(request('provider-uncertain-one'))).status, 503);
    assert.equal(globalThis.feedbackCatalogMail.attempts, 1);
    assert.equal(count(sqlite, 'form_answer_sets'), 1);
  } finally { sqlite.close(); }
});

void test('failed pre-send rollback reports uncertainty until a durable failed state is known', async () => {
  const { sqlite, db } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    globalThis.feedbackCatalogMail.configured = false;
    db.failNextSql = /UPDATE feedback_delivery_jobs SET status='failed'/;
    const response = await POST(request('rollback-uncertain-one'));
    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { code?: string }).code, 'delivery_uncertain');
    assert.equal(sqlite.prepare("SELECT status FROM feedback_delivery_jobs WHERE request_id='rollback-uncertain-one'").get()?.status, 'sending');
    assert.equal(globalThis.feedbackCatalogMail.attempts, 0);
  } finally { sqlite.close(); }
});

void test('overlapping exact requests hold one send lease and do not send twice', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    let release: (() => void) | undefined;
    globalThis.feedbackCatalogMail.hold = new Promise<void>((resolve) => { release = resolve; });
    const first = POST(request('overlap-one'));
    for (let spin = 0; spin < 100 && globalThis.feedbackCatalogMail.attempts === 0; spin++)
      await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(globalThis.feedbackCatalogMail.attempts, 1);
    const overlapping = await POST(request('overlap-one'));
    assert.equal(overlapping.status, 503);
    assert.equal(((await overlapping.json()) as { code?: string }).code, 'delivery_uncertain');
    assert.equal(globalThis.feedbackCatalogMail.attempts, 1);
    release?.();
    assert.equal((await first).status, 200);
    assert.equal((await POST(request('overlap-one'))).status, 200);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
    assert.equal(count(sqlite, 'feedback_delivery_jobs'), 1);
  } finally { sqlite.close(); }
});

void test('honeypot and rate-limit rejects save no submission, answer or mail', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('bot-one', { honeypot: true }))).status, 200);
    globalThis.feedbackCatalogBlocked = true;
    assert.equal((await POST(request('rate-one'))).status, 429);
    assert.equal(count(sqlite, 'feedback_delivery_jobs'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 0);
  } finally { sqlite.close(); }
});

void test('current required custom answer, unknown field and stale version fail closed', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('missing-one', { note: null }))).status, 400);
    assert.equal((await POST(request('unknown-one', { unknown: true }))).status, 400);
    assert.equal((await POST(request('stale-one', { version: 2 }))).status, 409);
    assert.equal(count(sqlite, 'feedback_delivery_jobs'), 0);
  } finally { sqlite.close(); }
});

void test('file payload in a text-only configured answer is a client error with no stored job', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    const payload = await request('file-answer-one').formData();
    payload.set('custom.delivery_note', new File(['not an allowed upload'], 'note.txt', { type: 'text/plain' }));
    const response = await POST(new Request('http://localhost:3000/api/feedback', {
      method: 'POST', headers: { origin: 'http://localhost:3000' }, body: payload,
    }));
    assert.equal(response.status, 400);
    assert.equal(count(sqlite, 'feedback_delivery_jobs'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
  } finally { sqlite.close(); }
});

void test('publication racing the atomic feedback write leaves no old-version job or answer', async () => {
  const { sqlite, db } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    db.beforeBatch = () => seed(sqlite, 'public.contact', 2, [field]);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('race-version-one'))).status, 409);
    assert.equal(count(sqlite, 'feedback_delivery_jobs'), 0);
    assert.equal(count(sqlite, 'form_answer_sets'), 0);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 0);
  } finally { sqlite.close(); }
});

void test('same request key cannot switch source, kind or body', async () => {
  const { sqlite } = await fixture();
  try {
    for (const id of ['public.contact', 'public.feedback', 'public.footer-feedback']) seed(sqlite, id, 1);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('same-key'))).status, 200);
    assert.equal((await POST(request('same-key', { kind: 'feedback' }))).status, 409);
    assert.equal((await POST(request('same-key', { kind: 'footer' }))).status, 409);
    const changed = await POST(request('same-key', { name: 'Changed Name' }));
    assert.equal(changed.status, 409);
    assert.equal(((await changed.json()) as { code: string }).code, 'request_id_conflict');
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
  } finally { sqlite.close(); }
});

void test('feedback-page and footer variants save under distinct form IDs', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.feedback', 1);
    seed(sqlite, 'public.footer-feedback', 1);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('feedback-page-one', { kind: 'feedback' }))).status, 200);
    assert.equal((await POST(request('footer-site-one', { kind: 'footer' }))).status, 200);
    assert.deepEqual(sqlite.prepare('SELECT form_id FROM form_answer_sets ORDER BY form_id').all().map((row) => row.form_id),
      ['public.feedback', 'public.footer-feedback']);
  } finally { sqlite.close(); }
});

void test('feedback answers require a current support grant and exact saved parent at any delivery status', async () => {
  const { sqlite, db } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('staff-view-one'))).status, 200);
    const job = sqlite.prepare('SELECT id FROM feedback_delivery_jobs WHERE request_id=?').get('staff-view-one') as { id: string };
    const answer = (await listFormAnswersForSubject(globalThis.feedbackCatalogDb, 'feedback_submission', job.id))[0];
    assert.equal(await authorizeFormAnswerRead(globalThis.feedbackCatalogDb, { id: 'admin', role: 'admin' }, answer), true);
    assert.equal(await authorizeFormAnswerRead(globalThis.feedbackCatalogDb, { id: 'other', role: 'customer' }, answer), false);
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='admin'");
    assert.equal(await authorizeFormAnswerRead(globalThis.feedbackCatalogDb, { id: 'admin', role: 'admin', permissions: ['support.manage'] }, answer), false);
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[\"support.manage\"]' WHERE user_id='admin'");
    sqlite.prepare("UPDATE feedback_delivery_jobs SET status='failed',sent_at=NULL WHERE id=?").run(job.id);
    assert.equal(await authorizeFormAnswerRead(db as unknown as D1Database, { id: 'admin', role: 'admin' }, answer), true);
    assert.equal(await authorizeFormAnswerRead(db as unknown as D1Database, { id: 'admin', role: 'admin' },
      { ...answer, requestId: 'another-request-id' }), false);
  } finally { sqlite.close(); }
});

void test('staff feedback page shows sent historical answer only while current grant remains active', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('page-view-one'))).status, 200);
    seed(sqlite, 'public.contact', 2, [{ ...field, status: 'archived', required: false }]);
    const { default: FeedbackPage } = await import('../app/admin/feedback/page');
    const html = renderToStaticMarkup(await FeedbackPage({ searchParams: Promise.resolve({}) }));
    assert.match(html, /Original routing note/);
    assert.match(html, /Please reply by email/);
    assert.match(html, /historical/i);
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='admin'");
    const revoked = renderToStaticMarkup(await FeedbackPage({ searchParams: Promise.resolve({}) }));
    assert.doesNotMatch(revoked, /Original routing note|Please reply by email|asha@example\.test/);
  } finally { sqlite.close(); }
});

void test('support can reconcile uncertain and exhausted records with request IDs but revoked grants reveal no answers', async () => {
  const { sqlite, db } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1);
    const { POST } = await import('../app/api/feedback/route');
    globalThis.feedbackCatalogMail.reject = true;
    assert.equal((await POST(request('uncertain-support-one'))).status, 503);
    globalThis.feedbackCatalogMail.reject = false;
    globalThis.feedbackCatalogMail.configured = false;
    for (let attempt = 0; attempt < 5; attempt++) await POST(request('exhausted-support-one'));
    const uncertainJob = sqlite.prepare("SELECT id FROM feedback_delivery_jobs WHERE request_id='uncertain-support-one'").get() as { id: string };
    const uncertainAnswer = (await listFormAnswersForSubject(db as unknown as D1Database, 'feedback_submission', uncertainJob.id))[0];
    assert.equal(await authorizeFormAnswerRead(db as unknown as D1Database, { id: 'admin', role: 'admin' }, uncertainAnswer), true);
    const { default: FeedbackPage } = await import('../app/admin/feedback/page');
    const html = renderToStaticMarkup(await FeedbackPage({ searchParams: Promise.resolve({}) }));
    assert.match(html, /uncertain-support-one/);
    assert.match(html, /exhausted-support-one/);
    assert.match(html, /may have been sent/i);
    assert.match(html, /not sent/i);
    assert.match(html, /Please reply by email/);
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='admin'");
    assert.equal(await authorizeFormAnswerRead(db as unknown as D1Database, { id: 'admin', role: 'admin' }, uncertainAnswer), false);
    const revoked = renderToStaticMarkup(await FeedbackPage({ searchParams: Promise.resolve({}) }));
    assert.doesNotMatch(revoked, /uncertain-support-one|exhausted-support-one|Please reply by email|asha@example\.test/);
  } finally { sqlite.close(); }
});

void test('support sees source, time, path and pending, leased, retryable and exhausted states with current grant', async () => {
  const { sqlite, db } = await fixture();
  try {
    seed(sqlite, 'public.footer-feedback', 1);
    const { POST } = await import('../app/api/feedback/route');
    globalThis.feedbackCatalogMail.configured = false;
    for (const id of ['pending-visible-one', 'leased-visible-one', 'failed-visible-one', 'exhausted-visible-one'])
      assert.equal((await POST(request(id, { kind: 'footer' }))).status, 503);
    sqlite.exec(`UPDATE feedback_delivery_jobs SET status='pending',attempt_count=0,created_at=1700000000000
      WHERE request_id='pending-visible-one';
      UPDATE feedback_delivery_jobs SET status='leased',lease_token='lease-test',lease_expires_at=9999999999999
      WHERE request_id='leased-visible-one';
      UPDATE feedback_delivery_jobs SET attempt_count=5 WHERE request_id='exhausted-visible-one';`);
    const { default: FeedbackPage } = await import('../app/admin/feedback/page');
    const html = renderToStaticMarkup(await FeedbackPage({ searchParams: Promise.resolve({}) }));
    for (const id of ['pending-visible-one', 'leased-visible-one', 'failed-visible-one', 'exhausted-visible-one'])
      assert.match(html, new RegExp(id));
    assert.match(html, /2023-11-14/);
    assert.match(html, /public\.footer-feedback/);
    assert.match(html, /Footer/);
    assert.match(html, /\/products\/example/);
    assert.match(html, /Pending|queued/i);
    assert.match(html, /Delivery attempt in progress|leased/i);
    assert.match(html, /Retryable|not sent/i);
    const pendingJob = sqlite.prepare("SELECT id FROM feedback_delivery_jobs WHERE request_id='pending-visible-one'").get() as { id: string };
    const pendingAnswer = (await listFormAnswersForSubject(db as unknown as D1Database, 'feedback_submission', pendingJob.id))[0];
    assert.equal(await authorizeFormAnswerRead(db as unknown as D1Database, { id: 'admin', role: 'admin' }, pendingAnswer), true);
    sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='admin'");
    assert.equal(await authorizeFormAnswerRead(db as unknown as D1Database, { id: 'admin', role: 'admin' }, pendingAnswer), false);
    const revoked = renderToStaticMarkup(await FeedbackPage({ searchParams: Promise.resolve({}) }));
    assert.doesNotMatch(revoked, /pending-visible-one|leased-visible-one|failed-visible-one|exhausted-visible-one|asha@example\.test/);
  } finally { sqlite.close(); }
});

void test('public contact safe built-ins accept display-only label/help edits but not semantic edits', () => {
  const override = { id: 'name', key: 'name', type: 'short_text', label: 'Preferred name',
    helpText: 'Tell us what to call you.', required: true, order: 0, status: 'active' };
  assert.doesNotThrow(() => validateFormDraft('public.contact', { formId: 'public.contact', fields: [override] }));
  assert.throws(() => validateFormDraft('public.contact', { formId: 'public.contact', fields: [{ ...override, required: false }] }));
  assert.throws(() => validateFormDraft('public.contact', { formId: 'public.contact', fields: [{ ...override, type: 'long_text' }] }));
});

void test('contact and feedback variant built-in display overrides appear without changing protected consent', async () => {
  const { CustomerContactForm } = await import('../components/layout/customer-contact-form');
  globalThis.feedbackCatalogConfig = { config: { formId: 'public.contact', version: 1, publishedAt: 1,
    fields: [{ id: 'name', key: 'name', type: 'short_text', label: 'Preferred name',
      helpText: 'Tell us what to call you.', required: true, order: 0, status: 'active' }] },
    status: 'ready', canSubmit: true, message: '', refresh() {}, handleSubmissionResponse() { return true; } };
  const contact = renderToStaticMarkup(createElement(CustomerContactForm, { kind: 'contact' }));
  assert.match(contact, /Preferred name/);
  assert.match(contact, /Tell us what to call you/);
  assert.match(contact, /<input[^>]*required[^>]*name="privacyAcknowledgement"/);
  globalThis.feedbackCatalogConfig.config = { formId: 'public.feedback', version: 1, publishedAt: 1,
    fields: [{ id: 'message', key: 'message', type: 'long_text', label: 'Your suggestions',
      helpText: 'Share one idea.', required: true, order: 0, status: 'active' }] };
  const feedback = renderToStaticMarkup(createElement(CustomerContactForm, { kind: 'feedback' }));
  assert.match(feedback, /Your suggestions/);
  assert.match(feedback, /Share one idea/);
  assert.match(feedback, /data-form-id="public\.feedback"/);
});

void test('display-edited feedback built-ins retain server parser and never enter custom answer JSON', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1, [{ id: 'name', key: 'name', type: 'short_text',
      label: 'Preferred name', required: true, order: 0, status: 'active' }]);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('builtin-only-one', { note: null }))).status, 200);
    const snapshot = JSON.parse((sqlite.prepare('SELECT answers_json AS answersJson FROM form_answer_sets').get() as { answersJson: string }).answersJson) as { answers: unknown[] };
    assert.deepEqual(snapshot.answers, []);
    assert.equal(globalThis.feedbackCatalogMail.sent.length, 1);
  } finally { sqlite.close(); }
});

void test('canonical alias of a safe built-in is validated from the protected parser', async () => {
  const { sqlite } = await fixture();
  try {
    seed(sqlite, 'public.contact', 1, [{ id: 'n_a_m_e', key: 'n_a_m_e', type: 'short_text',
      label: 'Preferred name', required: true, order: 0, status: 'active' }]);
    const { POST } = await import('../app/api/feedback/route');
    assert.equal((await POST(request('builtin-alias-one', { note: null }))).status, 200);
    const snapshot = JSON.parse((sqlite.prepare('SELECT answers_json AS answersJson FROM form_answer_sets').get() as { answersJson: string }).answersJson) as { answers: unknown[] };
    assert.deepEqual(snapshot.answers, []);
  } finally { sqlite.close(); }
});
