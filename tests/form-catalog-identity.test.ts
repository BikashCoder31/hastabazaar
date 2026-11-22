import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmailOtpChallenge } from '../lib/auth/email-otp';
import { acceptIdentityCodeRequest } from '../lib/auth/identity-code-request';


registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/link') return { url: 'data:text/javascript,export default function Link(props){return props.children}', shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function redirect(){throw Error("Unexpected redirect")};export function notFound(){throw Error("Not found")}', shortCircuit: true };
  if (specifier === '@/components/auth/google-sign-in') return { url: 'data:text/javascript,export function GoogleSignIn(){return null}', shortCircuit: true };
  if (specifier === '@/components/auth/signup-password-fields') return { url: 'data:text/javascript,export function SignupPasswordFields(){return null}', shortCircuit: true };
  if (specifier === '@/app/auth') return { url: 'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.identityCurrentAuth??null};export async function requireAuthenticatedUser(){if(!globalThis.identityCurrentAuth)throw Error("Unauthenticated");return globalThis.identityCurrentAuth}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: 'data:text/javascript,export async function requireStaffPage(){if(!globalThis.identityCurrentStaff)throw Error("Staff denied");return globalThis.identityCurrentStaff}', shortCircuit: true };
  if (specifier === 'cloudflare:workers') return {
    url: 'data:text/javascript,export const env={get DB(){return globalThis.identityCatalogDb},EMAIL_DELIVERY_CONFIGURED:"true",EMAIL:{configured:true,async send(message){if(globalThis.identityEmailFails)throw Error("mail failed");globalThis.identityEmailMessages.push(message)}}}', shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });

declare global { var identityCatalogDb: D1Database; var identityEmailMessages: Array<{to:string;text:string}>; var identityEmailFails: boolean;
  var identityCurrentAuth: {userId:string} | null; var identityCurrentStaff: {id:string;role:'admin'|'super_admin'} | null;
  var identityBeforeAnswerBatch: (() => void) | null }

function fixture(skippedForms: readonly string[] = []) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      return {
        sql,
        bind(...next: SQLInputValue[]) { values = next; return this; },
        async first<T>() { return (statement.get(...values) as T | undefined) ?? null; },
        async all<T>() { return { results: statement.all(...values) as T[] }; },
        async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
      };
    },
    async batch(statements: { sql?: string; run: () => Promise<unknown> }[]) {
      if (globalThis.identityBeforeAnswerBatch && statements.some((statement) =>
        statement.sql?.includes('INSERT INTO form_answer_sets'))) {
        const before = globalThis.identityBeforeAnswerBatch;
        globalThis.identityBeforeAnswerBatch = null;
        before();
      }
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  globalThis.identityCatalogDb = db;
  globalThis.identityEmailMessages = [];
  globalThis.identityEmailFails = false;
  globalThis.identityCurrentAuth = null;
  globalThis.identityCurrentStaff = null;
  globalThis.identityBeforeAnswerBatch = null;
  sqlite.exec('CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY,password_hash TEXT,password_salt TEXT,password_version INTEGER,created_at INTEGER,updated_at INTEGER); CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,created_at INTEGER,last_seen_at INTEGER); CREATE TABLE email_login_challenges(token_hash TEXT PRIMARY KEY,code_hash TEXT,user_id TEXT,attempts INTEGER,expires_at INTEGER,created_at INTEGER,consumed_at INTEGER)');
  sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES ('admin','admin','admin@example.test','Admin','en-NP','active',1,1)").run();
  for (const formId of ['identity.register', 'identity.login-password', 'identity.email-code-request',
    'identity.email-code-verify', 'identity.password-reset-request', 'identity.password-reset-complete']) {
  if (skippedForms.includes(formId)) continue;
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
    created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?, ?,1,1,'published',?,'test','admin',1,'admin',1,'admin',1,?)`)
    .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [] }), `seed-${formId}`);
  }
  return { sqlite, db };
}

function registration(requestId: string, password = 'strong-pass-123', email = 'new@example.test') {
  const data = new FormData();
  data.set('display_name', 'New Account');
  data.set('email', email);
  data.set('password', password);
  data.set('confirm_password', password);
  data.set('formVersion', '1');
  data.set('requestId', requestId);
  return new Request('http://localhost:3000/api/auth/register', {
    method: 'POST', headers: { origin: 'http://localhost:3000' }, body: data,
  });
}

function publishIdentityNote(sqlite: DatabaseSync, formId: string) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
    created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,2,2,'published',?,'test','admin',2,'admin',2,'admin',2,?)`)
    .run(`${formId}-v2`, formId, JSON.stringify({ formId, fields: [{
      id: 'context_note', key: 'context_note', label: 'Sign-in context', type: 'short_text',
      required: true, order: 0, status: 'active',
    }] }), `publish-${formId}`);
}

function identityPost(path: string, fields: Record<string, string>, note?: string, cookie?: string) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  if (note !== undefined) body.set('custom.context_note', note);
  return new Request(`http://localhost:3000${path}`, { method: 'POST',
    headers: { origin: 'http://localhost:3000', ...(cookie ? { cookie } : {}) }, body });
}

void test('six identity adapters publish safe custom context while locking credentials and request identity', async () => {
  const { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } = await import('../lib/forms/registry');
  const { validateFormDraft } = await import('../lib/forms/validation');
  const protectedByForm = new Map([
    ['identity.register', ['display_name', 'email', 'password', 'confirm_password', 'return_to', 'requestId', 'formVersion']],
    ['identity.login-password', ['email', 'password', 'return_to', 'requestId', 'formVersion']],
    ['identity.email-code-request', ['email', 'return_to', 'requestId', 'formVersion']],
    ['identity.email-code-verify', ['code', 'return_to', 'requestId', 'formVersion']],
    ['identity.password-reset-request', ['email', 'return_to', 'requestId', 'formVersion']],
    ['identity.password-reset-complete', ['code', 'password', 'confirm_password', 'return_to', 'requestId', 'formVersion']],
  ] as const);
  for (const [formId, expectedKeys] of protectedByForm) {
    const definition = FORM_REGISTRY[formId];
    assert.equal(IMPLEMENTED_FORM_ADAPTERS[formId]?.route, definition.route);
    assert.equal(definition.adapterId, formId);
    assert.equal(definition.mode, 'identity');
    for (const key of expectedKeys)
      assert.equal(definition.baseFields.find((field) => field.key === key)?.capability,
        'protected', `${formId}:${key}`);
    const custom = { id: 'context_note', key: 'context_note', label: 'Context note',
      type: 'short_text', required: true, order: 0, status: 'active' };
    assert.doesNotThrow(() => validateFormDraft(formId, { formId, fields: [custom] }));
    assert.throws(() => validateFormDraft(formId, { formId, fields: [
      { ...custom, id: expectedKeys[0], key: expectedKeys[0] },
    ] }), /field|draft|protected/i);
  }
});

void test('required registration and login context is saved only after verified credentials', async () => {
  const { sqlite } = fixture();
  try {
    publishIdentityNote(sqlite, 'identity.register');
    publishIdentityNote(sqlite, 'identity.login-password');
    const register = await import('../app/api/auth/register/route');
    const login = await import('../app/api/auth/login/route');
    const registerFields = { display_name: 'New Account', email: 'new@example.test',
      password: 'strong-pass-123', confirm_password: 'strong-pass-123', formVersion: '2' };
    const registerCall = (requestId: string, note?: string, version = '2') => register.POST(
      identityPost('/api/auth/register', { ...registerFields, formVersion: version, requestId }, note));
    assert.equal((await registerCall('register-stale', 'ordinary note', '1')).status, 409);
    assert.equal((await registerCall('register-missing')).status, 422);
    const copied = await registerCall('register-secret', 'strong-pass-123');
    assert.equal(copied.status, 422);
    assert.doesNotMatch(await copied.text(), /strong-pass-123/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE email='new@example.test'").get()?.n, 0);
    assert.equal((await registerCall('register-custom', 'Handmade products')).status, 303);
    const userId = sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get()?.id;
    const loginFields = { email: 'new@example.test', password: 'strong-pass-123', formVersion: '2' };
    const loginCall = (requestId: string, password: string, note?: string) => login.POST(
      identityPost('/api/auth/login', { ...loginFields, password, requestId }, note));
    assert.equal((await loginCall('login-bad', 'wrong-password', 'Private attempt')).status, 303);
    const reauthenticationRetry = await login.POST(identityPost('/api/auth/login?reauth=password', {
      ...loginFields, password: 'wrong-password', requestId: 'reauth-bad', return_to: '/admin',
    }, 'Private attempt'));
    assert.equal(reauthenticationRetry.status, 303);
    assert.equal(reauthenticationRetry.headers.get('location'), '/login?return_to=%2Fadmin&error=invalid&reauth=password');
    assert.equal(reauthenticationRetry.headers.get('set-cookie'), null);
    assert.equal((await loginCall('login-missing', 'strong-pass-123')).status, 422);
    const rejected = await loginCall('login-secret', 'strong-pass-123', 'strong-pass-123');
    assert.equal(rejected.status, 422);
    assert.doesNotMatch(await rejected.text(), /strong-pass-123/);
    const success = await loginCall('login-custom', 'strong-pass-123', 'Market research');
    assert.equal(success.status, 303);
    assert.match(success.headers.get('set-cookie') ?? '', /hastabazaar_session=/);
    const answers = sqlite.prepare(`SELECT form_id,subject_type,subject_id,actor_id,answers_json
      FROM form_answer_sets WHERE form_id IN ('identity.register','identity.login-password')
      ORDER BY form_id`).all() as Record<string, unknown>[];
    assert.equal(answers.length, 2);
    assert.ok(answers.every((answer) => answer.subject_type === 'user' &&
      answer.subject_id === userId && answer.actor_id === userId));
    assert.deepEqual(answers.map((answer) => JSON.parse(answer.answers_json as string).answers[0].value),
      ['Market research', 'Handmade products']);
  } finally { sqlite.close(); }
});

void test('both accepted code-request forms save required restricted context once without credential copies', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    assert.equal((await register.POST(registration('register-code-custom-fixture'))).status, 303);
    const cases = [
      ['identity.email-code-request', '/api/auth/email-code/request',
        (await import('../app/api/auth/email-code/request/route')).POST],
      ['identity.password-reset-request', '/api/auth/password-reset/request',
        (await import('../app/api/auth/password-reset/request/route')).POST],
    ] as const;
    for (const [formId, path, post] of cases) {
      publishIdentityNote(sqlite, formId);
      const prefix = formId.replaceAll('.', '-');
      const fields = { email: 'new@example.test', formVersion: '2' };
      const call = (requestId: string, note?: string, version = '2', cookie?: string,
        email = fields.email) =>
        post(identityPost(path, { ...fields, email, formVersion: version, requestId }, note, cookie));
      assert.equal((await call(`${prefix}-stale`, 'ordinary note', '1', undefined,
        'stale@example.test')).status, 409);
      assert.equal((await call(`${prefix}-missing`, undefined, '2', undefined,
        'missing@example.test')).status, 422);
      const rejected = await call(`${prefix}-secret`, 'opaque-session-secret', '2',
        'hastabazaar_session=opaque-session-secret', 'secret@example.test');
      assert.equal(rejected.status, 422);
      assert.doesNotMatch(await rejected.text(), /opaque-session-secret/);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id=?')
        .get(formId)?.n, 0);
      assert.equal((await call(`${prefix}-accepted`, 'Festival interest')).status, 303);
      const row = sqlite.prepare(`SELECT subject_type,subject_id,actor_id,answers_json
        FROM form_answer_sets WHERE form_id=?`).get(formId) as Record<string, unknown>;
      assert.equal(row.subject_type, 'identity_request');
      assert.equal(row.subject_id, `${prefix}-accepted`);
      assert.equal(row.actor_id, null);
      assert.equal(JSON.parse(row.answers_json as string).answers[0].value, 'Festival interest');
      assert.equal((await call(`${prefix}-accepted`, 'Festival interest')).status, 409);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id=?')
        .get(formId)?.n, 1);
    }
    assert.equal(identityEmailMessages.length, 2);
  } finally { sqlite.close(); }
});

void test('code verification and password completion save context only when challenge is consumed', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    assert.equal((await register.POST(registration('register-complete-custom-fixture'))).status, 303);
    const user = sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get() as { id: string };
    const cases = [
      ['identity.email-code-verify', '/api/auth/email-code/verify', 'email_login_challenges',
        'hastabazaar_email_otp', 'a'.repeat(43), '000123',
        (await import('../app/api/auth/email-code/verify/route')).POST],
      ['identity.password-reset-complete', '/api/auth/password-reset/complete', 'password_reset_challenges',
        'hastabazaar_password_reset', 'b'.repeat(43), '000456',
        (await import('../app/api/auth/password-reset/complete/route')).POST],
    ] as const;
    for (const [formId, path, table, cookieName, token, code, post] of cases) {
      publishIdentityNote(sqlite, formId);
      const prefix = formId.replaceAll('.', '-');
      const challenge = createEmailOtpChallenge({ userId: user.id, token, code });
      sqlite.prepare(`INSERT INTO ${table}(token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at)
        VALUES (?,?,?,?,?,?,NULL)`).run(challenge.record.tokenHash, challenge.record.codeHash,
        user.id, 0, challenge.record.expiresAt, challenge.record.createdAt);
      const fields = { code, formVersion: '2', ...(formId === 'identity.password-reset-complete'
        ? { password: 'new-strong-pass-123', confirm_password: 'new-strong-pass-123' } : {}) };
      const call = (requestId: string, note?: string, override: Record<string, string> = {}) =>
        post(identityPost(path, { ...fields, ...override, requestId }, note,
          `${cookieName}=${token}`));
      assert.equal((await call(`${prefix}-bad`, 'Attempt note', { code: '999999' })).status, 303);
      assert.equal((await call(`${prefix}-missing`)).status, 422);
      const copied = await call(`${prefix}-secret`, code);
      assert.equal(copied.status, 422);
      assert.doesNotMatch(await copied.text(), new RegExp(code));
      assert.equal(sqlite.prepare(`SELECT consumed_at FROM ${table} WHERE token_hash=?`)
        .get(challenge.record.tokenHash)?.consumed_at, null);
      assert.equal((await call(`${prefix}-success`, 'Verified context')).status, 303);
      const row = sqlite.prepare(`SELECT subject_type,subject_id,actor_id,answers_json
        FROM form_answer_sets WHERE form_id=?`).get(formId) as Record<string, unknown>;
      assert.equal(row.subject_type, 'user');
      assert.equal(row.subject_id, user.id);
      assert.equal(row.actor_id, user.id);
      assert.equal(JSON.parse(row.answers_json as string).answers[0].value, 'Verified context');
      assert.equal((row.answers_json as string).includes(code), false);
      assert.equal((await call(`${prefix}-again`, 'Verified context')).status, 303);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id=?')
        .get(formId)?.n, 1);
    }
  } finally { sqlite.close(); }
});

void test('identity history grants current owner and Super Admin only for their exact answer families', async () => {
  const { sqlite, db } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    assert.equal((await register.POST(registration('history-owner'))).status, 303);
    assert.equal((await register.POST(registration('history-other', 'strong-pass-123',
      'other@example.test'))).status, 303);
    const ownerId = String(sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get()?.id);
    const otherId = String(sqlite.prepare("SELECT id FROM users WHERE email='other@example.test'").get()?.id);
    sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES ('admin','super_admin',NULL,1)").run();
    const { getFormAnswerById } = await import('../lib/db/repositories/form-answers');
    const { authorizeFormAnswerRead } = await import('../lib/forms/access');
    const ownedRow = sqlite.prepare(`SELECT id FROM form_answer_sets
      WHERE form_id='identity.register' AND request_id='history-owner'`).get() as { id: string };
    const owned = await getFormAnswerById(db, ownedRow.id);
    assert.ok(owned);
    assert.equal(await authorizeFormAnswerRead(db, { id: ownerId, role: 'customer' }, owned), true);
    assert.equal(await authorizeFormAnswerRead(db, { id: otherId, role: 'customer' }, owned), false);
    sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES ('forged-owner','identity.login-password','forged-request',
        'identity.login-password-v1','user',?,?,?,1)`)
      .run(ownerId, otherId, JSON.stringify({ formId: 'identity.login-password', version: 1, answers: [] }));
    const forged = await getFormAnswerById(db, 'forged-owner');
    assert.ok(forged);
    assert.equal(await authorizeFormAnswerRead(db, { id: ownerId, role: 'customer' }, forged), false,
      'the parent owner cannot read an identity answer with another actor');
    sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES ('restricted-one','identity.email-code-request','anonymous-request',
        'identity.email-code-request-v1','identity_request','anonymous-request',NULL,?,2)`)
      .run(JSON.stringify({ formId: 'identity.email-code-request', version: 1, answers: [] }));
    const restricted = await getFormAnswerById(db, 'restricted-one');
    assert.ok(restricted);
    assert.equal(await authorizeFormAnswerRead(db, { id: ownerId, role: 'customer' }, restricted), false);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'super_admin' }, restricted), true);
    sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES ('forged-request-answer','identity.password-reset-request','another-request',
        'identity.password-reset-request-v1','identity_request','different-subject',NULL,?,3)`)
      .run(JSON.stringify({ formId: 'identity.password-reset-request', version: 1, answers: [] }));
    const forgedRequest = await getFormAnswerById(db, 'forged-request-answer');
    assert.ok(forgedRequest);
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'super_admin' }, forgedRequest), false);
    sqlite.prepare("UPDATE users SET status='suspended' WHERE id='admin'").run();
    assert.equal(await authorizeFormAnswerRead(db, { id: 'admin', role: 'super_admin' }, restricted), false);
  } finally { sqlite.close(); }
});

void test('identity history indexes page only exact owned successes or anonymous accepted requests', async () => {
  const { sqlite, db } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    assert.equal((await register.POST(registration('history-page-owner'))).status, 303);
    assert.equal((await register.POST(registration('history-page-other', 'strong-pass-123',
      'other@example.test'))).status, 303);
    const ownerId = String(sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get()?.id);
    const otherId = String(sqlite.prepare("SELECT id FROM users WHERE email='other@example.test'").get()?.id);
    const insert = sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,
      config_version_id,subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    for (let i = 0; i < 52; i++) {
      const id = `owned-${String(i).padStart(2, '0')}`;
      insert.run(id, 'identity.login-password', id, 'identity.login-password-v1',
        'user', ownerId, ownerId,
        JSON.stringify({ formId: 'identity.login-password', version: 1, answers: [] }), i + 10);
      const requestId = `request-${String(i).padStart(2, '0')}`;
      insert.run(`restricted-${i}`, 'identity.email-code-request', requestId,
        'identity.email-code-request-v1', 'identity_request', requestId, null,
        JSON.stringify({ formId: 'identity.email-code-request', version: 1, answers: [] }), i + 10);
    }
    insert.run('foreign-login', 'identity.login-password', 'foreign-login',
      'identity.login-password-v1', 'user', otherId, otherId,
      JSON.stringify({ formId: 'identity.login-password', version: 1, answers: [] }), 1);
    insert.run('forged-login', 'identity.login-password', 'forged-login',
      'identity.login-password-v1', 'user', ownerId, otherId,
      JSON.stringify({ formId: 'identity.login-password', version: 1, answers: [] }), 2);
    insert.run('forged-restricted', 'identity.email-code-request', 'different-id',
      'identity.email-code-request-v1', 'identity_request', 'forged-id', null,
      JSON.stringify({ formId: 'identity.email-code-request', version: 1, answers: [] }), 3);
    const { listOwnedIdentityAnswersPage, listRestrictedIdentityRequestAnswersPage } =
      await import('../lib/forms/identity-history');
    const ownedFirst = await listOwnedIdentityAnswersPage(db, ownerId);
    assert.equal(ownedFirst.answers.length, 50);
    assert.ok(ownedFirst.answers.every((answer) => answer.subjectId === ownerId &&
      answer.actorId === ownerId && answer.formId === 'identity.login-password'));
    const ownedSecond = await listOwnedIdentityAnswersPage(db, ownerId, ownedFirst.nextCursor!);
    assert.deepEqual(ownedSecond.answers.slice(0, 2).map((answer) => answer.id), ['owned-50', 'owned-51']);
    assert.equal(ownedSecond.answers.length, 3);
    assert.equal(ownedSecond.answers[2]?.formId, 'identity.register');
    assert.equal(ownedSecond.nextCursor, null);
    const restrictedFirst = await listRestrictedIdentityRequestAnswersPage(db);
    assert.equal(restrictedFirst.answers.length, 50);
    assert.ok(restrictedFirst.answers.every((answer) => answer.subjectId === answer.requestId &&
      answer.actorId === null && answer.formId === 'identity.email-code-request'));
    const restrictedSecond = await listRestrictedIdentityRequestAnswersPage(db,
      restrictedFirst.nextCursor!);
    assert.equal(restrictedSecond.answers.length, 2);
    assert.equal(restrictedSecond.nextCursor, null);
  } finally { sqlite.close(); }
});

void test('identity privacy export includes linked successes but excludes forged actor and anonymous requests', async () => {
  const { sqlite, db } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    assert.equal((await register.POST(registration('privacy-owner'))).status, 303);
    assert.equal((await register.POST(registration('privacy-other', 'strong-pass-123',
      'other@example.test'))).status, 303);
    const ownerId = String(sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get()?.id);
    const otherId = String(sqlite.prepare("SELECT id FROM users WHERE email='other@example.test'").get()?.id);
    sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at) VALUES
      ('privacy-forged','identity.login-password','privacy-forged','identity.login-password-v1',
        'user',?,?,?,4),
      ('privacy-request','identity.email-code-request','privacy-request','identity.email-code-request-v1',
        'identity_request','privacy-request',NULL,?,5)`)
      .run(ownerId, otherId, JSON.stringify({ formId: 'identity.login-password', version: 1, answers: [] }),
        JSON.stringify({ formId: 'identity.email-code-request', version: 1, answers: [] }));
    const { collectFormAnswersForPrivacy } = await import('../lib/forms/privacy');
    const exported = await collectFormAnswersForPrivacy(db, ownerId);
    assert.ok(exported.some((answer) => answer.formId === 'identity.register'));
    assert.equal(exported.some((answer) => answer.id === 'privacy-forged'), false);
    assert.equal(exported.some((answer) => answer.id === 'privacy-request'), false);
  } finally { sqlite.close(); }
});

void test('identity history pages enforce current account and restricted Super Admin roles', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    assert.equal((await register.POST(registration('history-viewer'))).status, 303);
    const owner = sqlite.prepare("SELECT id,auth_subject AS authSubject FROM users WHERE email='new@example.test'")
      .get() as { id: string; authSubject: string };
    globalThis.identityCurrentAuth = { userId: owner.authSubject };
    const { default: ownerPage } = await import('../app/form-submissions/page');
    const ownHtml = renderToStaticMarkup(await ownerPage());
    assert.match(ownHtml, /Your sign-in form history/);
    assert.match(ownHtml, /Submitted answers/);
    await assert.rejects(() => ownerPage({ searchParams: Promise.resolve({ afterAt: 'bad', afterId: 'x' }) }),
      /Not found/);
    sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(owner.id);
    await assert.rejects(() => ownerPage(), /Not found/);

    sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES ('admin','super_admin','admin',1)").run();
    sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at) VALUES
      ('restricted-page','identity.email-code-request','restricted-page',
        'identity.email-code-request-v1','identity_request','restricted-page',NULL,?,5)`)
      .run(JSON.stringify({ formId: 'identity.email-code-request', version: 1, answers: [] }));
    const { default: restrictedPage } = await import('../app/admin/form-submissions/page');
    globalThis.identityCurrentStaff = { id: 'admin', role: 'admin' };
    await assert.rejects(() => restrictedPage(), /Not found/);
    globalThis.identityCurrentStaff = { id: 'admin', role: 'super_admin' };
    const restrictedHtml = renderToStaticMarkup(await restrictedPage());
    assert.match(restrictedHtml, /Restricted identity request history/);
    assert.match(restrictedHtml, /Submitted answers/);
    sqlite.prepare("UPDATE users SET status='suspended' WHERE id='admin'").run();
    await assert.rejects(() => restrictedPage(), /Not found/);
  } finally { sqlite.close(); globalThis.identityCurrentAuth = null; globalThis.identityCurrentStaff = null; }
});

void test('identity history displays an answer after its published field is archived', async () => {
  const { sqlite, db } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    assert.equal((await register.POST(registration('history-archive-owner'))).status, 303);
    const owner = sqlite.prepare("SELECT id,auth_subject AS authSubject FROM users WHERE email='new@example.test'")
      .get() as { id: string; authSubject: string };
    publishIdentityNote(sqlite, 'identity.login-password');
    sqlite.prepare(`INSERT INTO form_answer_sets(id,form_id,request_id,config_version_id,
      subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES ('archived-answer','identity.login-password','archived-answer',
        'identity.login-password-v2','user',?,?,?,4)`)
      .run(owner.id, owner.id, JSON.stringify({ formId: 'identity.login-password', version: 2,
        answers: [{ fieldId: 'context_note', label: 'Sign-in context', type: 'short_text', value: 'Saved context' }] }));
    sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
      created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('identity.login-password-v3','identity.login-password',3,3,'published',?,'test',
        'admin',3,'admin',3,'admin',3,'archive-context')`)
      .run(JSON.stringify({ formId: 'identity.login-password', fields: [{
        id: 'context_note', key: 'context_note', label: 'Sign-in context', type: 'short_text',
        required: false, order: 0, status: 'archived',
      }] }));
    const { listOwnedIdentityAnswersPage } = await import('../lib/forms/identity-history');
    const page = await listOwnedIdentityAnswersPage(db, owner.id);
    const archived = page.answers.find((answer) => answer.id === 'archived-answer');
    assert.deepEqual(archived?.historicalFieldIds, ['context_note']);
    globalThis.identityCurrentAuth = { userId: owner.authSubject };
    const { default: ownerPage } = await import('../app/form-submissions/page');
    const html = renderToStaticMarkup(await ownerPage());
    assert.match(html, /Saved context/);
    assert.match(html, /Historical/);
  } finally { sqlite.close(); globalThis.identityCurrentAuth = null; }
});

void test('login keeps each available sign-in form when the other configuration is unavailable', async () => {
  const { default: loginPage } = await import('../app/login/page');
  const render = async (skipped: readonly string[], reauth?: string) => {
    const { sqlite } = fixture(skipped);
    try { return renderToStaticMarkup(await loginPage({ searchParams: Promise.resolve({ reauth }) })); }
    finally { sqlite.close(); }
  };
  const passwordOnly = await render(['identity.email-code-request']);
  assert.match(passwordOnly, /action="\/api\/auth\/login"/);
  assert.doesNotMatch(passwordOnly, /action="\/api\/auth\/email-code\/request"/);
  assert.doesNotMatch(passwordOnly, />or<\/span>/);
  const emailOnly = await render(['identity.login-password']);
  assert.doesNotMatch(emailOnly, /action="\/api\/auth\/login"/);
  assert.match(emailOnly, /action="\/api\/auth\/email-code\/request"/);
  assert.doesNotMatch(emailOnly, />or<\/span>/);
  const neither = await render(['identity.login-password', 'identity.email-code-request']);
  assert.match(neither, /Sign-in forms are temporarily unavailable/);
  assert.doesNotMatch(neither, />or<\/span>/);
  const both = await render([]);
  assert.match(both, />or<\/span>/);
  const confirmPassword = await render([], 'password');
  assert.match(confirmPassword, /action="\/api\/auth\/login\?reauth=password"/);
  assert.doesNotMatch(confirmPassword, /\/api\/auth\/(?:email-code|google)/);
  assert.doesNotMatch(confirmPassword, /autocomplete="one-time-code"/i);
});

void test('identity transaction rejects a publication racing registration before account creation', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    globalThis.identityBeforeAnswerBatch = () => publishIdentityNote(sqlite, 'identity.register');
    const response = await register.POST(registration('racing-register'));
    assert.equal(response.status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE email='new@example.test'").get()?.n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.register'").get()?.n, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_credentials').get()?.n, 0);
  } finally { sqlite.close(); globalThis.identityBeforeAnswerBatch = null; }
});

void test('successful registration commits a versioned answer to its new account', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/auth/register/route');
    const response = await POST(registration('register-001'));
    assert.equal(response.status, 303);
    const user = sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get() as { id: string };
    const answer = sqlite.prepare("SELECT form_id,request_id,subject_type,subject_id,actor_id,answers_json FROM form_answer_sets WHERE form_id='identity.register'").get() as Record<string, unknown> | undefined;
    assert.ok(answer);
    assert.equal(answer.request_id, 'register-001');
    assert.equal(answer.subject_type, 'user');
    assert.equal(answer.subject_id, user.id);
    assert.equal(answer.actor_id, user.id);
    assert.equal((answer.answers_json as string).includes('strong-pass-123'), false);
    assert.equal(response.headers.get('location')?.includes('strong-pass-123'), false);
  } finally { sqlite.close(); }
});




void test('registration page supplies publication version and opaque request identity', async () => {
  const { sqlite } = fixture();
  try {
    const { default: RegisterPage } = await import('../app/register/page');
    const page = await RegisterPage({ searchParams: Promise.resolve({}) });
    const inputs: Array<Record<string, unknown>> = [];
    function visit(node: unknown): void {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== 'object' || !('props' in node)) return;
      const element = node as { type: unknown; props: Record<string, unknown> };
      if (element.type === 'input') inputs.push(element.props);
      if (typeof element.type === 'function' && element.type.name === 'ConfiguredFields') {
        const rendered = renderToStaticMarkup(createElement(element.type as never, element.props));
        const version = rendered.match(/name="formVersion" value="([0-9]+)"/);
        if (version) inputs.push({ name: 'formVersion', value: Number(version[1]) });
      } else visit(element.props.children);
    }
    visit(page);
    assert.ok(inputs.some((input) => input.name === 'formVersion' && input.value === 1));
    assert.ok(inputs.some((input) => input.name === 'requestId' &&
      typeof input.value === 'string' && /^[0-9a-f-]{36}$/.test(input.value)));
  } finally { sqlite.close(); }
});

void test('every identity and recovery page binds each form to its published version and request ID', async () => {
  const { sqlite } = fixture();
  try {
    const [login, code, forgot, reset] = await Promise.all([
      import('../app/login/page'), import('../app/login/code/page'),
      import('../app/forgot-password/page'), import('../app/forgot-password/reset/page'),
    ]);
    const pages = await Promise.all([
      login.default({ searchParams: Promise.resolve({}) }),
      code.default({ searchParams: Promise.resolve({}) }),
      forgot.default({ searchParams: Promise.resolve({}) }),
      reset.default({ searchParams: Promise.resolve({}) }),
    ]);
    const expected = [
      ['/api/auth/login', '/api/auth/email-code/request'],
      ['/api/auth/email-code/verify'],
      ['/api/auth/password-reset/request'],
      ['/api/auth/password-reset/complete'],
    ];
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const forms: Array<{ action: string; inputs: Array<Record<string, unknown>> }> = [];
      function visit(node: unknown, current?: { action: string; inputs: Array<Record<string, unknown>> }): void {
        if (Array.isArray(node)) { node.forEach((child) => visit(child, current)); return; }
        if (!node || typeof node !== 'object' || !('props' in node)) return;
        const element = node as { type: unknown; props: Record<string, unknown> };
        if (element.type === 'form') {
          current = { action: String(element.props.action), inputs: [] };
          forms.push(current);
        }
        if (element.type === 'input' && current) current.inputs.push(element.props);
        if (typeof element.type === 'function' && element.type.name === 'ConfiguredFields') {
          const rendered = renderToStaticMarkup(createElement(element.type as never, element.props));
          const version = rendered.match(/name="formVersion" value="([0-9]+)"/);
          if (version && current) current.inputs.push({ name: 'formVersion', value: Number(version[1]) });
        } else visit(element.props.children, current);
      }
      visit(pages[pageIndex]);
      assert.deepEqual(forms.map((form) => form.action), expected[pageIndex]);
      for (const form of forms) {
        assert.ok(form.inputs.some((input) => input.name === 'formVersion' && input.value === 1), form.action);
        assert.ok(form.inputs.some((input) => input.name === 'requestId' &&
          typeof input.value === 'string' && /^[0-9a-f-]{36}$/.test(input.value)), form.action);
      }
    }
  } finally { sqlite.close(); }
});

function loginRequest(requestId: string, password: string) {
  const data = new FormData();
  data.set('email', 'new@example.test');
  data.set('password', password);
  data.set('formVersion', '1');
  data.set('requestId', requestId);
  return new Request('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { origin: 'http://localhost:3000' }, body: data,
  });
}

for (const role of ['admin', 'super_admin'] as const) void test(`password sign-in from a public page sends ${role} through the authenticated continuation`, async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration(`register-public-${role}`));
    const userId = sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get()?.id;
    sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(userId!, role);
    const { POST } = await import('../app/api/auth/login/route');
    const response = await POST(identityPost('/api/auth/login', {
      email: 'new@example.test', password: 'strong-pass-123', formVersion: '1',
      requestId: `login-public-${role}`, return_to: '/sell?route=business',
    }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/auth/continue?return_to=%2Fsell%3Froute%3Dbusiness');
    assert.match(response.headers.get('set-cookie') ?? '', /hastabazaar_session=/);
  } finally { sqlite.close(); }
});

void test('login records an answer only for a verified credential and a committed session', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration('register-login-fixture'));
    const { POST } = await import('../app/api/auth/login/route');
    const failed = await POST(loginRequest('login-failed', 'wrong-password'));
    assert.equal(failed.status, 303);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.login-password'").get()?.n, 0);
    const success = await POST(loginRequest('login-success', 'strong-pass-123'));
    assert.equal(success.status, 303);
    assert.match(success.headers.get('set-cookie') ?? '', /hastabazaar_session=/);
    const answer = sqlite.prepare("SELECT subject_type,subject_id,actor_id,request_id,answers_json FROM form_answer_sets WHERE form_id='identity.login-password'").get() as Record<string, unknown> | undefined;
    assert.ok(answer);
    assert.equal(answer.subject_type, 'user');
    assert.equal(answer.request_id, 'login-success');
    assert.equal(answer.subject_id, sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get()?.id);
    assert.equal(answer.actor_id, answer.subject_id);
    assert.equal((answer.answers_json as string).includes('strong-pass-123'), false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n, 2);
  } finally { sqlite.close(); }
});

void test('password reset completion links answers only when the one-time challenge changes credentials', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration('register-reset-fixture'));
    const user = sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get() as { id: string };
    const challenge = createEmailOtpChallenge({ userId: user.id, token: 'a'.repeat(43), code: '123456' });
    sqlite.prepare(`INSERT INTO password_reset_challenges
      (token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at)
      VALUES (?,?,?,?,?,?,NULL)`).run(challenge.record.tokenHash, challenge.record.codeHash,
        user.id, 0, challenge.record.expiresAt, challenge.record.createdAt);
    const { POST } = await import('../app/api/auth/password-reset/complete/route');
    const call = (code: string, requestId: string, token = challenge.token) => {
      const body = new FormData();
      body.set('code', code);
      body.set('password', 'new-strong-pass-123');
      body.set('confirm_password', 'new-strong-pass-123');
      body.set('formVersion', '1');
      body.set('requestId', requestId);
      return POST(new Request('http://localhost:3000/api/auth/password-reset/complete', {
        method: 'POST', headers: { origin: 'http://localhost:3000', cookie: `hastabazaar_password_reset=${token}` }, body,
      }));
    };
    assert.equal((await call('000000', 'reset-failed')).status, 303);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.password-reset-complete'").get()?.n, 0);
    assert.equal((await call('123456', 'reset-success')).status, 303);
    const answer = sqlite.prepare("SELECT subject_type,subject_id,request_id,answers_json FROM form_answer_sets WHERE form_id='identity.password-reset-complete'").get() as Record<string, unknown> | undefined;
    assert.ok(answer);
    assert.equal(answer.subject_type, 'user');
    assert.equal(answer.subject_id, user.id);
    assert.equal(answer.request_id, 'reset-success');
    assert.equal((answer.answers_json as string).includes('123456'), false);
    assert.equal((answer.answers_json as string).includes('new-strong-pass-123'), false);
    assert.equal((await call('123456', 'reset-replayed')).status, 303);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.password-reset-complete'").get()?.n, 1);
    const second = createEmailOtpChallenge({ userId: user.id, token: 'd'.repeat(43), code: '111111' });
    sqlite.prepare(`INSERT INTO password_reset_challenges
      (token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at)
      VALUES (?,?,?,?,?,?,NULL)`).run(second.record.tokenHash, second.record.codeHash,
        user.id, 0, second.record.expiresAt, second.record.createdAt);
    assert.equal((await call('111111', 'reset-success', second.token)).status, 409);
    assert.equal(sqlite.prepare('SELECT consumed_at FROM password_reset_challenges WHERE token_hash=?').get(second.record.tokenHash)?.consumed_at, null);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.password-reset-complete'").get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('email code verification commits one answer with the consumed challenge and session', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration('register-email-fixture'));
    const user = sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get() as { id: string };
    const challenge = createEmailOtpChallenge({ userId: user.id, token: 'b'.repeat(43), code: '654321' });
    sqlite.prepare(`INSERT INTO email_login_challenges
      (token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at)
      VALUES (?,?,?,?,?,?,NULL)`).run(challenge.record.tokenHash, challenge.record.codeHash,
        user.id, 0, challenge.record.expiresAt, challenge.record.createdAt);
    const { POST } = await import('../app/api/auth/email-code/verify/route');
    const call = (code: string, requestId: string, token = challenge.token) => {
      const body = new FormData();
      body.set('code', code);
      body.set('formVersion', '1');
      body.set('requestId', requestId);
      return POST(new Request('http://localhost:3000/api/auth/email-code/verify', {
        method: 'POST', headers: { origin: 'http://localhost:3000', cookie: `hastabazaar_email_otp=${token}` }, body,
      }));
    };
    assert.equal((await call('000000', 'email-failed')).status, 303);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.email-code-verify'").get()?.n, 0);
    const success = await call('654321', 'email-success');
    assert.equal(success.status, 303);
    assert.match(success.headers.get('set-cookie') ?? '', /hastabazaar_session=/);
    const answer = sqlite.prepare("SELECT subject_type,subject_id,request_id,answers_json FROM form_answer_sets WHERE form_id='identity.email-code-verify'").get() as Record<string, unknown> | undefined;
    assert.ok(answer);
    assert.equal(answer.subject_type, 'user');
    assert.equal(answer.subject_id, user.id);
    assert.equal(answer.request_id, 'email-success');
    assert.equal((answer.answers_json as string).includes('654321'), false);
    assert.equal((await call('654321', 'email-replayed')).status, 303);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.email-code-verify'").get()?.n, 1);
    const second = createEmailOtpChallenge({ userId: user.id, token: 'e'.repeat(43), code: '222222' });
    sqlite.prepare(`INSERT INTO email_login_challenges
      (token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at)
      VALUES (?,?,?,?,?,?,NULL)`).run(second.record.tokenHash, second.record.codeHash,
        user.id, 0, second.record.expiresAt, second.record.createdAt);
    const sessions = sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n;
    assert.equal((await call('222222', 'email-success', second.token)).status, 409);
    assert.equal(sqlite.prepare('SELECT consumed_at FROM email_login_challenges WHERE token_hash=?').get(second.record.tokenHash)?.consumed_at, null);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n, sessions);
  } finally { sqlite.close(); }
});

function codeRequest(path: string, email: string, requestId: string) {
  const body = new FormData();
  body.set('email', email);
  body.set('formVersion', '1');
  body.set('requestId', requestId);
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST', headers: { origin: 'http://localhost:3000' }, body,
  });
}

void test('email-code request reserves restricted answers before delivery and rejects duplicate request IDs', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration('register-email-request-fixture'));
    const { POST } = await import('../app/api/auth/email-code/request/route');
    const path = '/api/auth/email-code/request';
    const first = await POST(codeRequest(path, 'new@example.test', 'email-request-1'));
    assert.equal(first.status, 303);
    assert.match(first.headers.get('location') ?? '', /^\/login\/code/);
    assert.equal(identityEmailMessages.length, 1);
    const answer = sqlite.prepare("SELECT subject_type,subject_id,actor_id,answers_json FROM form_answer_sets WHERE form_id='identity.email-code-request'").get() as Record<string, unknown> | undefined;
    assert.ok(answer);
    assert.equal(answer.subject_type, 'identity_request');
    assert.equal(answer.subject_id, 'email-request-1');
    assert.equal(answer.actor_id, null);
    assert.equal((answer.answers_json as string).includes('new@example.test'), false);
    const duplicate = await POST(codeRequest(path, 'new@example.test', 'email-request-1'));
    assert.equal(duplicate.status, 409);
    assert.equal(identityEmailMessages.length, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM email_login_challenges").get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('password-reset request reserves a restricted answer and never resends for a duplicate ID', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration('register-reset-request-fixture'));
    const { POST } = await import('../app/api/auth/password-reset/request/route');
    const path = '/api/auth/password-reset/request';
    const first = await POST(codeRequest(path, 'new@example.test', 'reset-request-1'));
    assert.equal(first.status, 303);
    assert.match(first.headers.get('location') ?? '', /^\/forgot-password\/reset/);
    assert.match(first.headers.get('set-cookie') ?? '', /hastabazaar_password_reset=/);
    const answer = sqlite.prepare("SELECT subject_type,subject_id,actor_id,answers_json FROM form_answer_sets WHERE form_id='identity.password-reset-request'").get() as Record<string, unknown> | undefined;
    assert.ok(answer);
    assert.equal(answer.subject_type, 'identity_request');
    assert.equal(answer.subject_id, 'reset-request-1');
    assert.equal(answer.actor_id, null);
    assert.equal((answer.answers_json as string).includes('new@example.test'), false);
    const count = identityEmailMessages.length;
    assert.equal(count, 1);
    const duplicate = await POST(codeRequest(path, 'new@example.test', 'reset-request-1'));
    assert.equal(duplicate.status, 409);
    assert.equal(identityEmailMessages.length, count);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM password_reset_challenges').get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('code and reset pages do not claim that an accepted request delivered email', async () => {
  const { sqlite } = fixture();
  try {
    const [code, forgot, reset] = await Promise.all([
      import('../app/login/code/page'), import('../app/forgot-password/page'),
      import('../app/forgot-password/reset/page'),
    ]);
    for (const page of [await code.default({ searchParams: Promise.resolve({}) }),
      await forgot.default({ searchParams: Promise.resolve({}) }),
      await reset.default({ searchParams: Promise.resolve({}) })]) {
      const words: string[] = [];
      function visit(node: unknown): void {
        if (typeof node === 'string') { words.push(node); return; }
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (node && typeof node === 'object' && 'props' in node)
          visit((node as { props: { children?: unknown } }).props.children);
      }
      visit(page);
      const text = words.join(' ').toLowerCase();
      assert.doesNotMatch(text, /we sent|has been sent|we’ll send/);
      assert.match(text, /may/);
    }
  } finally { sqlite.close(); }
});

void test('accepted known and unknown requests keep neutral result and fixed minimum timing', async () => {
  const { sqlite, db } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration('register-neutral-fixture'));
    for (const [formId, challengeTable] of [
      ['identity.email-code-request', 'email_login_challenges'],
      ['identity.password-reset-request', 'password_reset_challenges'],
    ] as const) {
      const elapsed: number[] = [];
      const results = [];
      let sends = 0;
      for (const [email, suffix] of [['new@example.test', 'known'], ['missing@example.test', 'unknown']] as const) {
        const started = Date.now();
        results.push(await acceptIdentityCodeRequest(db, { formId, challengeTable, email,
          requestId: `${formId}-${suffix}`, versionId: `${formId}-v1`,
          answers: { formId, version: 1, answers: [] }, now: Date.now(), minimumDelayMs: 80,
          deliver: async () => { sends++; },
        }));
        elapsed.push(Date.now() - started);
      }
      assert.deepEqual(results.map((result) => result.status), ['accepted', 'accepted']);
      assert.ok(elapsed.every((ms) => ms >= 70), `${formId}: ${elapsed.join(', ')}`);
      assert.equal(sends, 1);
      const rows = sqlite.prepare('SELECT subject_type,subject_id,actor_id,answers_json FROM form_answer_sets WHERE form_id=? ORDER BY request_id').all(formId) as Array<Record<string, unknown>>;
      assert.equal(rows.length, 2);
      assert.ok(rows.every((row) => row.subject_type === 'identity_request' && row.actor_id === null));
      assert.ok(rows.every((row) => !(row.answers_json as string).includes('@example.test')));
    }
  } finally { sqlite.close(); }
});

void test('concurrent duplicate code requests commit one challenge and deliver once', async () => {
  const { sqlite, db } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration('register-race-fixture'));
    let tail = Promise.resolve();
    const serialDb = {
      prepare: db.prepare.bind(db),
      batch(statements: D1PreparedStatement[]) {
        const next = tail.then(() => db.batch(statements));
        tail = next.then(() => {}, () => {});
        return next;
      },
    } as unknown as D1Database;
    let sends = 0;
    const submit = () => acceptIdentityCodeRequest(serialDb, { formId: 'identity.email-code-request',
      challengeTable: 'email_login_challenges', email: 'new@example.test',
      requestId: 'race-1', versionId: 'identity.email-code-request-v1',
      answers: { formId: 'identity.email-code-request', version: 1, answers: [] },
      now: Date.now(), minimumDelayMs: 0, deliver: async () => { sends++; },
    });
    const results = await Promise.all([submit(), submit()]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(results.map((result) => result.status).sort(), ['accepted', 'duplicate']);
    assert.equal(sends, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.email-code-request'").get()?.n, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM email_login_challenges').get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('delivery failure or lost response never reuses an accepted request to send again', async () => {
  const { sqlite, db } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration('register-delivery-fixture'));
    let attempts = 0;
    const input = { formId: 'identity.email-code-request' as const,
      challengeTable: 'email_login_challenges' as const, email: 'new@example.test',
      requestId: 'delivery-1', versionId: 'identity.email-code-request-v1',
      answers: { formId: 'identity.email-code-request', version: 1, answers: [] },
      now: Date.now(), minimumDelayMs: 30,
      deliver: async () => { attempts++; throw new Error('delivery failed'); },
    };
    assert.equal((await acceptIdentityCodeRequest(db, input)).status, 'accepted');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM email_login_challenges').get()?.n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.email-code-request'").get()?.n, 1);
    assert.equal((await acceptIdentityCodeRequest(db, input)).status, 'duplicate');
    assert.equal(attempts, 1);

    let starts = 0;
    const pending = { ...input, requestId: 'delivery-2',
      deliver: async () => { starts++; await new Promise<void>(() => {}); } };
    assert.equal((await acceptIdentityCodeRequest(db, pending)).status, 'accepted');
    assert.equal((await acceptIdentityCodeRequest(db, pending)).status, 'duplicate');
    assert.equal(starts, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.email-code-request'").get()?.n, 2);
  } finally { sqlite.close(); }
});

void test('identity answer guard rejects copied password, code and bearer token without echoing them', async () => {
  const guard = await import('../lib/auth/identity-form-answers').catch(() => null);
  assert.ok(guard, 'Identity answer secret guard is required');
  const secrets = ['strong-pass-123', '654321', 'b'.repeat(43)];
  for (const [value, forbidden] of [
    ['My password: strong-pass-123', secrets[0]],
    [['654321', 'ordinary choice'], secrets[1]],
    [`Challenge ${'b'.repeat(43)}`, secrets[2]],
  ] as const) {
    let thrown: unknown;
    try {
      guard.assertNoIdentitySecrets({ formId: 'identity.register', version: 1,
        answers: [{ fieldId: 'context_note', label: 'Context note', type: 'long_text', value }] }, secrets);
    } catch (error) { thrown = error; }
    assert.ok(thrown instanceof Error);
    assert.equal((thrown as Error & { fieldId?: string }).fieldId, 'context_note');
    assert.equal((thrown as Error).message.includes(forbidden), false);
  }
  const bearer = 'c'.repeat(43);
  assert.throws(() => guard.assertNoIdentitySecrets({ formId: 'identity.email-code-request', version: 1,
    answers: [{ fieldId: 'context_note', label: 'Context note', type: 'short_text', value: bearer }] },
    [], new Headers({ cookie: `hastabazaar_session=${bearer}` })),
    (error: unknown) => error instanceof Error && !error.message.includes(bearer));
  assert.doesNotThrow(() => guard.assertNoIdentitySecrets({ formId: 'identity.register', version: 1,
    answers: [
      { fieldId: 'count', label: 'Count', type: 'number', value: 654321 },
      { fieldId: 'choice', label: 'Choice', type: 'checkbox', value: true },
      { fieldId: 'comment', label: 'Comment', type: 'short_text', value: 'ordinary context' },
    ] }, secrets));
});

void test('both code-request forms reject a publication race for known and unknown accounts without sending', async () => {
  for (const [formId, path, challengeTable] of [
    ['identity.email-code-request', '/api/auth/email-code/request', 'email_login_challenges'],
    ['identity.password-reset-request', '/api/auth/password-reset/request', 'password_reset_challenges'],
  ] as const) {
    for (const [email, audience] of [
      ['new@example.test', 'known'], ['missing@example.test', 'unknown'],
    ] as const) {
      const { sqlite } = fixture();
      try {
        const register = await import('../app/api/auth/register/route');
        assert.equal((await register.POST(registration(`setup-${formId.replaceAll('.', '-')}-${audience}`))).status, 303);
        const route = formId === 'identity.email-code-request'
          ? await import('../app/api/auth/email-code/request/route')
          : await import('../app/api/auth/password-reset/request/route');
        globalThis.identityBeforeAnswerBatch = () => publishIdentityNote(sqlite, formId);
        const response = await route.POST(codeRequest(path, email, `race-${formId.replaceAll('.', '-')}-${audience}`));
        assert.equal(response.status, 409, `${formId} ${audience}`);
        assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${challengeTable}`).get()?.n, 0);
        assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id=?').get(formId)?.n, 0);
        assert.equal(identityEmailMessages.length, 0);
      } finally { sqlite.close(); globalThis.identityBeforeAnswerBatch = null; }
    }
  }
});

void test('password login, email verification and reset completion reject publication races atomically', async () => {
  for (const formId of ['identity.login-password', 'identity.email-code-verify',
    'identity.password-reset-complete'] as const) {
    const { sqlite } = fixture();
    try {
      const register = await import('../app/api/auth/register/route');
      assert.equal((await register.POST(registration(`setup-${formId.replaceAll('.', '-')}`))).status, 303);
      const userId = String(sqlite.prepare("SELECT id FROM users WHERE email='new@example.test'").get()?.id);
      const originalSessions = sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n;
      const originalHash = sqlite.prepare('SELECT password_hash AS hash FROM user_credentials WHERE user_id=?')
        .get(userId)?.hash;
      let challengeTokenHash: string | null = null;
      let response: Response;
      if (formId !== 'identity.login-password') {
        const challenge = createEmailOtpChallenge({ userId, token: 'p'.repeat(43), code: '123456' });
        challengeTokenHash = challenge.record.tokenHash;
        const table = formId === 'identity.email-code-verify' ? 'email_login_challenges' : 'password_reset_challenges';
        sqlite.prepare(`INSERT INTO ${table}(token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at)
          VALUES (?,?,?,?,?,?,NULL)`).run(challenge.record.tokenHash, challenge.record.codeHash,
          userId, 0, challenge.record.expiresAt, challenge.record.createdAt);
        const data = new FormData();
        data.set('code', '123456'); data.set('formVersion', '1'); data.set('requestId', `race-${formId.replaceAll('.', '-')}`);
        if (formId === 'identity.password-reset-complete') {
          data.set('password', 'different-strong-pass-123');
          data.set('confirm_password', 'different-strong-pass-123');
        }
        globalThis.identityBeforeAnswerBatch = () => publishIdentityNote(sqlite, formId);
        const path = formId === 'identity.email-code-verify'
          ? '/api/auth/email-code/verify' : '/api/auth/password-reset/complete';
        const request = new Request(`http://localhost:3000${path}`, { method: 'POST',
          headers: { origin: 'http://localhost:3000', cookie: formId === 'identity.email-code-verify'
            ? `hastabazaar_email_otp=${challenge.token}` : `hastabazaar_password_reset=${challenge.token}` }, body: data });
        response = formId === 'identity.email-code-verify'
          ? await (await import('../app/api/auth/email-code/verify/route')).POST(request)
          : await (await import('../app/api/auth/password-reset/complete/route')).POST(request);
        assert.equal(sqlite.prepare(`SELECT consumed_at FROM ${table} WHERE token_hash=?`)
          .get(challengeTokenHash)?.consumed_at, null);
      } else {
        globalThis.identityBeforeAnswerBatch = () => publishIdentityNote(sqlite, formId);
        response = await (await import('../app/api/auth/login/route'))
          .POST(loginRequest('race-password-login', 'strong-pass-123'));
      }
      assert.equal(response.status, 409, formId);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n, originalSessions);
      assert.equal(sqlite.prepare('SELECT password_hash AS hash FROM user_credentials WHERE user_id=?')
        .get(userId)?.hash, originalHash);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id=?').get(formId)?.n, 0);
    } finally { sqlite.close(); globalThis.identityBeforeAnswerBatch = null; }
  }
});

void test('all six identity form sites render the newly published required field', async () => {
  const { sqlite } = fixture();
  try {
    for (const formId of ['identity.register', 'identity.login-password',
      'identity.email-code-request', 'identity.email-code-verify',
      'identity.password-reset-request', 'identity.password-reset-complete'])
      publishIdentityNote(sqlite, formId);
    const [register, login, code, forgot, reset] = await Promise.all([
      import('../app/register/page'), import('../app/login/page'),
      import('../app/login/code/page'), import('../app/forgot-password/page'),
      import('../app/forgot-password/reset/page'),
    ]);
    const pages = await Promise.all([
      register.default({ searchParams: Promise.resolve({}) }),
      login.default({ searchParams: Promise.resolve({}) }),
      code.default({ searchParams: Promise.resolve({}) }),
      forgot.default({ searchParams: Promise.resolve({}) }),
      reset.default({ searchParams: Promise.resolve({}) }),
    ]);
    const fields: string[] = [];
    function visit(node: unknown): void {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== 'object' || !('props' in node)) return;
      const element = node as { type: unknown; props: Record<string, unknown> };
      if (typeof element.type === 'function' && element.type.name === 'ConfiguredFields') {
        fields.push(renderToStaticMarkup(createElement(element.type as never, element.props)));
        return;
      }
      visit(element.props.children);
    }
    pages.forEach(visit);
    assert.equal(fields.length, 6);
    for (const html of fields) {
      assert.match(html, /name="formVersion" value="2"/);
      assert.match(html, /Sign-in context/);
      assert.match(html, /<input[^>]*required=""[^>]*name="custom\.context_note"/);
    }
  } finally { sqlite.close(); }
});

void test('identity answer guard rejects numeric answers matching submitted numeric credentials', async () => {
  const { assertNoIdentitySecrets } = await import('../lib/auth/identity-form-answers');
  for (const [formId, secret, value] of [
    ['identity.register', '12345678', 12345678],
    ['identity.login-password', '123.50', 123.5],
    ['identity.email-code-verify', '000123', 123],
    ['identity.password-reset-complete', '000000', 0],
  ] as const) {
    let thrown: unknown;
    try {
      assertNoIdentitySecrets({ formId, version: 1, answers: [
        { fieldId: 'context_count', label: 'Context count', type: 'number', value },
      ] }, [secret], undefined, { rejectNumericSecrets: true });
    } catch (error) { thrown = error; }
    assert.ok(thrown instanceof Error, `${formId} must reject the copied number`);
    assert.equal((thrown as Error & { fieldId?: string }).fieldId, 'context_count');
    assert.equal((thrown as Error).message.includes(secret), false);
  }
  assert.doesNotThrow(() => assertNoIdentitySecrets({ formId: 'identity.login-password', version: 1,
    answers: [{ fieldId: 'count', label: 'Count', type: 'number', value: 3 },
      { fieldId: 'checked', label: 'Checked', type: 'checkbox', value: true }] },
    ['12345678'], undefined, { rejectNumericSecrets: true }));
  assert.doesNotThrow(() => assertNoIdentitySecrets({ formId: 'identity.register', version: 1,
    answers: [{ fieldId: 'count', label: 'Count', type: 'number', value: 12345678 }] },
    ['12345678']));
});

void test('a reused registration request ID cannot create a second account or answer', async () => {
  const { sqlite } = fixture();
  try {
    const { POST } = await import('../app/api/auth/register/route');
    assert.equal((await POST(registration('register-reused'))).status, 303);
    const duplicate = await POST(registration('register-reused', 'strong-pass-123', 'other@example.test'));
    assert.equal(duplicate.status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE email IN ('new@example.test','other@example.test')").get()?.n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.register' AND request_id='register-reused'").get()?.n, 1);
  } finally { sqlite.close(); }
});

void test('a reused login request ID cannot create another session and does not bypass password proof', async () => {
  const { sqlite } = fixture();
  try {
    const register = await import('../app/api/auth/register/route');
    await register.POST(registration('register-reused-login-fixture'));
    const { POST } = await import('../app/api/auth/login/route');
    assert.equal((await POST(loginRequest('login-reused', 'strong-pass-123'))).status, 303);
    const invalid = await POST(loginRequest('login-reused', 'bad-password'));
    assert.match(invalid.headers.get('location') ?? '', /error=invalid/);
    const duplicate = await POST(loginRequest('login-reused', 'strong-pass-123'));
    assert.equal(duplicate.status, 409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='identity.login-password'").get()?.n, 1);
  } finally { sqlite.close(); }
});
