import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createEmailOtpChallenge } from '../lib/auth/email-otp';
import { passwordRecord } from '../lib/auth/hosted-session';
import { FORM_REGISTRY } from '../lib/forms/registry';
import {
  validateAnswersForDefinition,
  validateFormDraft,
} from '../lib/forms/validation';
import type { FormId } from '../lib/forms/types';

const origin = 'http://localhost:3000';
const password = 'fictional-strong-pass-456';
const code = '000123';
const token = 'a'.repeat(43);
const cases = [
  { id: 'identity.register', path: 'app/api/auth/register/route.ts' },
  { id: 'identity.login-password', path: 'app/api/auth/login/route.ts' },
  {
    id: 'identity.email-code-request',
    path: 'app/api/auth/email-code/request/route.ts',
  },
  {
    id: 'identity.email-code-verify',
    path: 'app/api/auth/email-code/verify/route.ts',
  },
  {
    id: 'identity.password-reset-request',
    path: 'app/api/auth/password-reset/request/route.ts',
  },
  {
    id: 'identity.password-reset-complete',
    path: 'app/api/auth/password-reset/complete/route.ts',
  },
] as const;
declare global {
  var identityEnvelopeDb: D1Database;
  var identityEnvelopeReads: number;
  var identityEnvelopeMailCount: number;
}
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={get DB(){globalThis.identityEnvelopeReads++;return globalThis.identityEnvelopeDb},EMAIL_DELIVERY_CONFIGURED:"true",EMAIL:{configured:true,async send(){globalThis.identityEnvelopeMailCount++}}}',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
async function fixture(
  id: FormId,
  kind: 'normal' | 'ascii' | 'nepali' | 'upper' = 'normal',
) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle')
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  sqlite.exec(
    'CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY,password_hash TEXT,password_salt TEXT,password_version INTEGER,created_at INTEGER,updated_at INTEGER); CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,created_at INTEGER,last_seen_at INTEGER); CREATE TABLE email_login_challenges(token_hash TEXT PRIMARY KEY,code_hash TEXT,user_id TEXT,attempts INTEGER,expires_at INTEGER,created_at INTEGER,consumed_at INTEGER)',
  );
  sqlite
    .prepare(
      "INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES('sa-one','fictional-sa','sa@hastabazaar.local','Fictional SA','en-NP','active',1,1),('buyer-one','fictional-buyer','buyer@hastabazaar.local','Fictional Buyer','en-NP','active',1,1)",
    )
    .run();
  const credential = await passwordRecord(password);
  sqlite
    .prepare('INSERT INTO user_credentials VALUES(?,?,?,1,1,1)')
    .run('buyer-one', credential.hash, credential.salt);
  const challenge = createEmailOtpChallenge({
    userId: 'buyer-one',
    token,
    code,
  });
  for (const table of ['email_login_challenges', 'password_reset_challenges'])
    sqlite
      .prepare(
        `INSERT INTO ${table}(token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at) VALUES(?,?,?,0,?,?,NULL)`,
      )
      .run(
        challenge.record.tokenHash,
        challenge.record.codeHash,
        'buyer-one',
        challenge.record.expiresAt,
        challenge.record.createdAt,
      );
  const fields = Array.from(
    {
      length:
        kind === 'normal'
          ? 1
          : kind === 'upper'
            ? 26
            : kind === 'nepali'
              ? 8
              : 5,
    },
    (_, order) => ({
      id: `context_${order}`,
      key: `context_${order}`,
      label: 'Fictional context',
      type: 'long_text' as const,
      required: true,
      order,
      status: 'active' as const,
    }),
  );
  const draft = validateFormDraft(id, { formId: id, fields });
  const raw = fields.map((field) => ({
    fieldId: field.id,
    value:
      kind === 'normal'
        ? 'Fictional ordinary context'
        : (kind === 'nepali' ? 'क' : 'x').repeat(
            kind === 'upper' ? 5000 : 4000,
          ),
  }));
  if (kind === 'upper') {
    const prototype = {
      formId: id,
      version: 1,
      answers: fields.map((field, i) => ({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        value: raw[i].value,
      })),
    };
    raw[25].value = 'x'.repeat(
      5000 - (Buffer.byteLength(JSON.stringify(prototype)) - 131000),
    );
  }
  const snapshot = validateAnswersForDefinition(
    FORM_REGISTRY[id],
    { ...draft, version: 1, publishedAt: 1 },
    raw,
  );
  if (kind === 'upper')
    assert.equal(Buffer.byteLength(JSON.stringify(snapshot)), 131000);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= 131072);
  sqlite
    .prepare(
      `INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES(?,?,1,1,'published',?,'Fictional publication','sa-one',1,'sa-one',1,'sa-one',1,?)`,
    )
    .run(id + '-v1', id, JSON.stringify(draft), id + '-publication');
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      return {
        bind(...next: SQLInputValue[]) {
          values = next;
          return this;
        },
        async first<T>() {
          return (statement.get(...values) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: statement.all(...values) as T[] };
        },
        async run() {
          return {
            meta: { changes: Number(statement.run(...values).changes) },
          };
        },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  globalThis.identityEnvelopeDb = db;
  globalThis.identityEnvelopeReads = 0;
  globalThis.identityEnvelopeMailCount = 0;
  const form = new FormData();
  for (const [key, value] of Object.entries({
    display_name: 'Fictional New Buyer',
    email:
      id === 'identity.register'
        ? 'new@hastabazaar.local'
        : 'buyer@hastabazaar.local',
    password,
    confirm_password: password,
    code,
    formVersion: '1',
    requestId: 'fictional-envelope-request',
    return_to: '/account',
  }))
    form.set(key, value);
  for (const answer of raw) form.set('custom.' + answer.fieldId, answer.value);
  return { sqlite, form, snapshot };
}
function encode(form: FormData) {
  const data = new URLSearchParams();
  for (const [key, value] of form) {
    assert.equal(typeof value, 'string');
    data.append(key, value as string);
  }
  return data;
}
function request(
  item: (typeof cases)[number],
  body: BodyInit,
  headers: Record<string, string> = {},
) {
  return new Request(origin + '/' + item.path.slice(4, -9), {
    method: 'POST',
    headers: {
      origin,
      cookie:
        'hastabazaar_email_otp=' +
        token +
        '; hastabazaar_password_reset=' +
        token,
      ...headers,
    },
    body,
  });
}
async function post(item: (typeof cases)[number], req: Request) {
  const route = (await import('../' + item.path)) as {
    POST(request: Request): Promise<Response>;
  };
  return route.POST(req);
}
function state(sqlite: DatabaseSync) {
  return Object.fromEntries(
    [
      'users',
      'user_credentials',
      'user_sessions',
      'form_answer_sets',
      'email_login_challenges',
      'password_reset_challenges',
    ].map((table) => [
      table,
      sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
    ]),
  );
}

for (const item of cases) {
  void test(
    item.id +
      ': normal, ASCII, Nepali and upper-budget published answers commit through the actual identity action',
    async () => {
      for (const kind of ['normal', 'ascii', 'nepali', 'upper'] as const) {
        const h = await fixture(item.id, kind);
        try {
          const body = encode(h.form),
            bytes = Buffer.byteLength(body.toString());
          if (kind === 'ascii') assert.ok(bytes > 16 * 1024);
          if (kind === 'nepali')
            assert.ok(bytes > 256 * 1024 && bytes < 512 * 1024);
          const result = await post(item, request(item, body));
          assert.equal(
            result.status,
            303,
            `${item.id}/${kind}: accepted real published context`,
          );
          assert.doesNotMatch(result.headers.get('location') ?? '', /error=/);
          const row = h.sqlite
            .prepare(
              'SELECT answers_json FROM form_answer_sets WHERE form_id=?',
            )
            .get(item.id) as { answers_json: string } | undefined;
          assert.ok(row, `${item.id}/${kind}: committed linked answer`);
          assert.deepEqual(JSON.parse(row.answers_json), h.snapshot);
          assert.ok(
            !row.answers_json.includes(password) &&
              !row.answers_json.includes(code) &&
              !row.answers_json.includes(token),
          );
          if (
            item.id === 'identity.email-code-request' ||
            item.id === 'identity.password-reset-request'
          )
            assert.equal(
              identityEnvelopeMailCount,
              1,
              'Only the fictional capture transport runs',
            );
          else assert.equal(identityEnvelopeMailCount, 0);
        } finally {
          h.sqlite.close();
        }
      }
    },
  );
  void test(
    item.id +
      ': finite wire, protected aggregate, file and malformed boundaries fail before database access',
    async () => {
      const h = await fixture(item.id);
      try {
        const before = state(h.sqlite);
        for (const key of ['unknown', 'requestId']) {
          const oversized = encode(h.form);
          oversized.set(key, 'x'.repeat(16385));
          assert.equal(
            (await post(item, request(item, oversized))).status,
            413,
          );
        }
        const duplicates = encode(h.form);
        for (let i = 0; i < 5; i++)
          duplicates.append('unknown', 'x'.repeat(4000));
        assert.equal((await post(item, request(item, duplicates))).status, 413);
        const longName = encode(h.form);
        longName.set('x'.repeat(16385), 'v');
        assert.equal((await post(item, request(item, longName))).status, 413);
        for (const key of ['email', 'custom.context_0']) {
          const uploaded = new FormData();
          for (const [key, value] of h.form) uploaded.append(key, value);
          uploaded.set(key, new File(['fictional'], 'fixture.txt'));
          assert.equal(
            (await post(item, request(item, uploaded))).status,
            413,
            'Identity forms accept no upload values',
          );
        }
        const declared = request(item, 'x', {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': '524289',
        });
        assert.equal((await post(item, declared)).status, 413);
        assert.equal(
          declared.bodyUsed,
          false,
          'Declared overflow leaves stream unread',
        );
        const bytes = new Uint8Array(524289).fill(120);
        let cancelled = false;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
          },
          cancel() {
            cancelled = true;
          },
        });
        const init: RequestInit & { duplex: 'half' } = {
          method: 'POST',
          headers: {
            origin,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: stream,
          duplex: 'half',
        };
        assert.equal(
          (
            await post(
              item,
              new Request(origin + '/' + item.path.slice(4, -9), init),
            )
          ).status,
          413,
        );
        assert.equal(cancelled, true, 'Streamed overflow is canceled');
        assert.equal(
          (
            await post(
              item,
              request(item, 'invalid media', { 'content-type': 'text/plain' }),
            )
          ).status,
          413,
        );
        assert.equal(
          identityEnvelopeReads,
          0,
          'No rejected envelope reaches database/auth/rate state',
        );
        assert.equal(identityEnvelopeMailCount, 0);
        assert.deepEqual(state(h.sqlite), before);
      } finally {
        h.sqlite.close();
      }
    },
  );
  void test(
    item.id +
      ': required, stale, copied-secret and authentication guards remain unchanged',
    async () => {
      for (const kind of [
        'required',
        'stale',
        'secret',
        'auth',
        'origin',
      ] as const) {
        const h = await fixture(item.id);
        try {
          const before = state(h.sqlite);
          if (kind === 'required') h.form.delete('custom.context_0');
          if (kind === 'stale') h.form.set('formVersion', '2');
          if (kind === 'secret')
            h.form.set('custom.context_0', 'fictional-copied-secret');
          if (kind === 'auth') {
            if (
              item.id === 'identity.register' ||
              item.id === 'identity.login-password'
            )
              h.form.set(
                'password',
                item.id === 'identity.register' ? 'short' : 'wrong-password',
              );
            else if (item.id === 'identity.password-reset-complete')
              h.form.set('confirm_password', 'different-password');
            else if (item.id === 'identity.email-code-verify')
              h.form.set('code', '999999');
            else h.form.set('email', 'invalid-email');
          }
          const result = await post(
            item,
            request(
              item,
              encode(h.form),
              kind === 'secret'
                ? {
                    cookie:
                      'hastabazaar_session=fictional-copied-secret; hastabazaar_email_otp=' +
                      token +
                      '; hastabazaar_password_reset=' +
                      token,
                  }
                : kind === 'origin'
                  ? { origin: 'https://forbidden.invalid' }
                  : {},
            ),
          );
          assert.equal(
            result.status,
            kind === 'required' || kind === 'secret'
              ? 422
              : kind === 'stale'
                ? 409
                : kind === 'origin'
                  ? 403
                  : 303,
          );
          assert.equal(
            h.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()
              ?.n,
            0,
          );
          assert.equal(identityEnvelopeMailCount, 0);
          assert.doesNotMatch(await result.text(), /fictional-copied-secret/);
          if (kind !== 'auth') assert.deepEqual(state(h.sqlite), before);
        } finally {
          h.sqlite.close();
        }
      }
    },
  );
}
