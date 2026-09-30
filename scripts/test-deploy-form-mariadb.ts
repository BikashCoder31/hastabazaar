import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import {
  saveFormDraft,
  publishFormDraft,
  restoreFormVersion,
} from '../lib/db/repositories/form-catalog';
import {
  buildFormAnswerInsert,
  listFormAnswersForSubject,
  getFormAnswerById,
} from '../lib/db/repositories/form-answers';
import { env } from '../lib/runtime/node-bindings';
import type { ConfiguredField, FormAnswerSnapshot } from '../lib/forms/types';
type SnapshotWithChoiceLabels = Omit<FormAnswerSnapshot, 'answers'> & {
  answers: readonly (FormAnswerSnapshot['answers'][number] & {
    choiceLabels?: readonly string[];
  })[];
};
const evidence =
  'C:/Users/abinash/Desktop/Hatskala/deployment-20260929/forms-publication-guards';
assert.equal(
  resolve(process.cwd()),
  resolve(
    'C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala',
  ),
);
assert.equal(process.argv.length, 2, 'No remote or fixture reuse options');
const context = JSON.parse(
  execFileSync('docker', ['context', 'inspect'], { encoding: 'utf8' }),
)[0];
assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
const secret = JSON.parse(
  await readFile('.staging/form-catalog-mariadb-private.json', 'utf8'),
);
assert.equal(secret.host, '127.0.0.1');
assert.equal(secret.port, 13316);
assert.equal(secret.name, 'hastabazaar-form-catalog-qa-0928');
const container = JSON.parse(
  execFileSync('docker', ['inspect', secret.name], { encoding: 'utf8' }),
)[0];
assert.equal(container.Id, secret.id);
assert.equal(container.State.Running, true);
assert.equal(container.Config.Image, 'mariadb:10.11');
assert.equal(
  container.Config.Labels['hastabazaar.scope'],
  'form-catalog-task22-disposable',
);
assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'], [
  { HostIp: '127.0.0.1', HostPort: '13316' },
]);
assert.ok(container.HostConfig.Tmpfs['/var/lib/mysql']);
const control = await mysql.createConnection({
  host: secret.host,
  port: secret.port,
  user: secret.user,
  password: secret.password,
});
const database = 'deploy_forms_' + Date.now();
assert.match(database, /^deploy_forms_\d+$/);
const observations: {
  name: string;
  status: string;
  code?: string;
  message?: string;
}[] = [];
async function stage(name: string, action: () => Promise<void>) {
  try {
    await action();
    observations.push({ name, status: 'PASS' });
  } catch (error) {
    const e = error as Error & { code?: string; cause?: { code?: string } };
    observations.push({
      name,
      status: 'FAIL',
      code: e.cause?.code ?? e.code ?? e.name,
      message: e.message.slice(0, 400),
    });
  }
  console.log(JSON.stringify(observations.at(-1)));
}
async function load(sql: string) {
  let delimiter = ';',
    buffer = '';
  for (const line of sql.split(/\r?\n/)) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (directive) {
      assert.ok(
        !buffer.trim() ||
          buffer
            .trim()
            .split('\n')
            .every((l) => !l.trim() || l.trim().startsWith('--')),
      );
      buffer = '';
      delimiter = directive[1];
      continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length);
      buffer = '';
      if (statement.trim()) await control.query(statement);
    }
  }
  assert.ok(!buffer.trim());
}
const formId = 'account.profile';
function field(
  id: string,
  type: ConfiguredField['type'],
  extras: Partial<ConfiguredField> = {},
): ConfiguredField {
  return {
    id,
    key: id,
    label: 'Question ' + id,
    type,
    required: true,
    order: 0,
    status: 'active',
    ...extras,
  };
}
const question = field('context_note', 'short_text');
const input = (
  requestId: string,
  expectedPublishedVersion = 0,
  fields: ConfiguredField[] = [question],
) => ({
  formId,
  actorId: 'super',
  actorRole: 'super_admin' as const,
  expectedPublishedVersion,
  config: { formId, fields },
  reason: 'Fixture publication',
  requestId,
  now: 10,
});
let draft: Awaited<ReturnType<typeof saveFormDraft>> | undefined;
try {
  const [engine] = await control.query<RowDataPacket[]>(
    'SELECT VERSION() version',
  );
  assert.match(String(engine[0].version), /^10\.11\./);
  await control.query(
    'CREATE DATABASE `' +
      database +
      '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  );
  await control.query('USE `' + database + '`');
  const canonical = await readFile(
    'deployment/babal/mariadb-schema.sql',
    'utf8',
  );
  for (const table of ['users', 'user_roles', 'audit_logs']) {
    const match = new RegExp(
      'CREATE TABLE IF NOT EXISTS `' +
        table +
        '` \\([\\s\\S]+?ENGINE=InnoDB[^;]*;',
    ).exec(canonical);
    assert.ok(match, table);
    await control.query(match[0]);
  }
  await load(
    await readFile('deployment/babal/mariadb-form-catalog.sql', 'utf8'),
  );
  await control.query(
    "INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES ('super','super@local.hastabazaar.test','Fixture admin','active',1,1),('customer','customer@local.hastabazaar.test','Old Name','active',1,1)",
  );
  await control.query(
    "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
  );
  const password = randomUUID();
  await control.query('CREATE USER ?@? IDENTIFIED BY ?', [
    database,
    '%',
    password,
  ]);
  await control.query('GRANT ALL ON `' + database + '`.* TO ?@?', [
    database,
    '%',
  ]);
  Object.assign(process.env, {
    DB_HOST: '127.0.0.1',
    DB_PORT: '13316',
    DB_NAME: database,
    DB_USER: database,
    DB_PASSWORD: password,
    DB_POOL_SIZE: '4',
  });
  const db = new Proxy(env.DB, {
    get(target, key) {
      if (key === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          try {
            return await target.batch(statements);
          } catch (error) {
            const e = error as Error & { code?: string };
            console.log(
              JSON.stringify({
                name: 'actual adapter rejection',
                code: e.code ?? e.name,
                message: e.message.slice(0, 450),
              }),
            );
            throw error;
          }
        };
      return Reflect.get(target, key);
    },
  });
  await stage(
    'real adapter creates and publishes configured draft',
    async () => {
      draft = await saveFormDraft(db, input('draft-one'));
      assert.equal(draft.version, 1);
      const published = await publishFormDraft(db, {
        ...input('publish-one'),
        draftId: draft.id,
        expectedDraftRevision: 1,
      });
      assert.equal(published.status, 'published');
    },
  );
  // Seed a genuine current publication if catalog syntax is still red, so answer RED is independent.
  if (!draft) {
    await control.query(
      "INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES ('fixture-v1',?,1,1,'published',?,'fixture','super',1,'super',1,'super',1,'fixture-one')",
      [formId, JSON.stringify({ formId, fields: [question] })],
    );
  }
  const [versionRows] = await control.query<RowDataPacket[]>(
    "SELECT id FROM form_config_versions WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1",
    [formId],
  );
  const versionId = String(versionRows[0].id);
  const snapshot: FormAnswerSnapshot = {
    formId,
    version: 1,
    answers: [
      {
        fieldId: question.id,
        label: question.label,
        type: question.type,
        value: 'Fictional answer',
      },
    ],
  };
  const batch = (
    requestId: string,
    answers: FormAnswerSnapshot,
    configVersion = versionId,
    name = 'Forbidden',
  ) => [
    db
      .prepare("UPDATE users SET display_name=? WHERE id='customer'")
      .bind(name),
    buildFormAnswerInsert(db, {
      formId,
      requestId,
      versionId: configVersion,
      subjectType: 'user',
      subjectId: 'customer',
      actorId: 'customer',
      answers,
      now: 10,
    }),
  ];
  const state = async () => {
    const [rows] = await control.query<RowDataPacket[]>(
      "SELECT display_name name,(SELECT COUNT(*) FROM form_answer_sets) count FROM users WHERE id='customer'",
    );
    return { name: String(rows[0].name), count: Number(rows[0].count) };
  };
  await stage(
    'answer commits with parent and duplicate rolls both back',
    async () => {
      await db.batch(batch('answer-one', snapshot, versionId, 'Updated'));
      assert.deepEqual(await state(), { name: 'Updated', count: 1 });
      await assert.rejects(db.batch(batch('answer-one', snapshot)));
      assert.deepEqual(await state(), { name: 'Updated', count: 1 });
      const history = await listFormAnswersForSubject(db, 'user', 'customer');
      assert.deepEqual(history[0].answers, snapshot);
    },
  );
  await stage(
    'configured provenance and required fields fail closed with parent rollback',
    async () => {
      const before = await state();
      for (const [name, answers] of [
        [
          'label',
          {
            ...snapshot,
            answers: [{ ...snapshot.answers[0], label: 'Altered' }],
          },
        ],
        ['missing', { ...snapshot, answers: [] }],
        [
          'unknown',
          {
            ...snapshot,
            answers: [{ ...snapshot.answers[0], fieldId: 'unknown_field' }],
          },
        ],
      ] as const) {
        await assert.rejects(db.batch(batch('invalid-' + name, answers)));
        assert.deepEqual(await state(), before);
      }
    },
  );
  await stage(
    'catalog retains identity, update revision, publication and restore provenance',
    async () => {
      const current = input('second-draft', 1);
      const second = await saveFormDraft(db, current);
      await assert.rejects(
        saveFormDraft(db, {
          ...current,
          requestId: 'reuse-key',
          draftId: second.id,
          expectedDraftRevision: 1,
          config: { formId, fields: [{ ...question, id: 'changed_identity' }] },
        }),
      );
      const update = await saveFormDraft(db, {
        ...current,
        requestId: 'update-second',
        draftId: second.id,
        expectedDraftRevision: 1,
        config: { formId, fields: [{ ...question, label: 'New label' }] },
      });
      assert.equal(update.revision, 2);
      const pub = await publishFormDraft(db, {
        ...current,
        requestId: 'publish-second',
        draftId: second.id,
        expectedDraftRevision: 2,
      });
      assert.equal(pub.version, 2);
      const restored = await restoreFormVersion(db, {
        ...input('restore-first', 2),
        sourceVersion: 1,
      });
      assert.equal(restored.version, 3);
      assert.deepEqual(restored.config.fields, [question]);
      await assert.rejects(db.batch(batch('stale-answer', snapshot)));
    },
  );

  await stage(
    'concurrent draft version allocation has one winner and one audit',
    async () => {
      const [rows] = await control.query<RowDataPacket[]>(
        "SELECT MAX(version) v FROM form_config_versions WHERE status='published'",
      );
      const v = Number(rows[0].v);
      let reached = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const racing = new Proxy(db, {
        get(target, key) {
          if (key === 'batch')
            return async (statements: D1PreparedStatement[]) => {
              reached++;
              if (reached === 2) release();
              await barrier;
              return target.batch(statements);
            };
          return Reflect.get(target, key);
        },
      });
      const attempts = await Promise.allSettled([
        saveFormDraft(racing, input('parallel-a', v)),
        saveFormDraft(racing, input('parallel-b', v)),
      ]);
      assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
      const [audits] = await control.query<RowDataPacket[]>(
        "SELECT COUNT(*) n FROM audit_logs WHERE request_id IN ('parallel-a','parallel-b')",
      );
      assert.equal(Number(audits[0].n), 1);
    },
  );

  const waitForLock = async (table: string) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const [rows] = await control.query<RowDataPacket[]>(
        'SELECT l.lock_table lockTable,t.trx_query waitingQuery FROM information_schema.INNODB_LOCK_WAITS w JOIN information_schema.INNODB_LOCKS l ON l.lock_id=w.requested_lock_id JOIN information_schema.INNODB_TRX t ON t.trx_id=w.requesting_trx_id',
      );
      if (
        rows.some(
          (r) =>
            String(r.lockTable).includes(database) &&
            String(r.lockTable).includes(table),
        )
      ) {
        console.log(JSON.stringify({ name: 'observed lock barrier', table }));
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Required ' + table + ' lock barrier was not observed');
  };
  await stage(
    'current role revocation after precheck rejects catalog and audit atomically',
    async () => {
      await control.beginTransaction();
      await control.query(
        "DELETE FROM user_roles WHERE user_id='super' AND role='super_admin'",
      );
      const pending = saveFormDraft(db, input('revoked-role', 3));
      const settled = pending.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      try {
        await waitForLock('user_roles');
        await control.commit();
        const outcome = await settled;
        assert.ok('error' in outcome, 'Revoked current role must reject');
        const [rows] = await control.query<RowDataPacket[]>(
          "SELECT (SELECT COUNT(*) FROM form_config_versions WHERE last_request_id='revoked-role') configs,(SELECT COUNT(*) FROM audit_logs WHERE request_id='revoked-role') audits",
        );
        assert.equal(Number(rows[0].configs), 0);
        assert.equal(Number(rows[0].audits), 0);
      } finally {
        await control.rollback();
        await settled;
        await control.query(
          "INSERT IGNORE INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
        );
      }
    },
  );
  await stage(
    'old answer read followed by observed parent lock refreshes current publication',
    async () => {
      const [rows] = await control.query<RowDataPacket[]>(
        "SELECT id,version FROM form_config_versions WHERE status='published' ORDER BY version DESC LIMIT 1",
      );
      const currentId = String(rows[0].id),
        v = Number(rows[0].version);
      const answer = { ...snapshot, version: v };
      const before = await state();
      await control.beginTransaction();
      await control.query(
        "SELECT id FROM users WHERE id='customer' FOR UPDATE",
      );
      const pending = db.batch([
        db
          .prepare('SELECT version FROM form_config_versions WHERE id=?')
          .bind(currentId),
        ...batch('after-publication-wait', answer, currentId),
      ]);
      const settled = pending.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      try {
        await waitForLock('users');
        await control.query(
          "INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES ('race-publication',?,6,1,'published',?,'fixture','super',1,'super',1,'super',1,'race-publication')",
          [formId, JSON.stringify({ formId, fields: [question] })],
        );
        await control.commit();
        const outcome = await settled;
        assert.ok(
          'error' in outcome,
          'Publication after read must reject stale answer',
        );
        assert.deepEqual(await state(), before);
      } finally {
        await control.rollback();
        await settled;
      }
    },
  );
  await stage(
    'all safe answer types validate provenance and rollback each invalid snapshot',
    async () => {
      const fields = [
        field('short_answer', 'short_text'),
        field('long_answer', 'long_text'),
        field('quantity', 'number', { min: 1, max: 10, integerOnly: true }),
        field('event_date', 'date'),
        field('single_answer', 'single_choice', {
          choices: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        }),
        field('multi_answer', 'multiple_choice', {
          choices: [
            { value: 'red', label: 'Red' },
            { value: 'blue', label: 'Blue' },
          ],
        }),
        field('acknowledged', 'checkbox'),
        field('contact_email', 'email'),
        field('contact_phone', 'phone'),
      ];
      const publishRaw = async (version: number, configured: unknown[]) => {
        const id = 'matrix-v' + version;
        await control.query(
          "INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?, ?, ?,1,'published',?,'fixture','super',1,'super',1,'super',1,?)",
          [
            id,
            formId,
            version,
            JSON.stringify({ formId, fields: configured }),
            id,
          ],
        );
        return id;
      };
      const values = [
        'Short answer',
        'Long fictional answer',
        4,
        '2026-09-28',
        'yes',
        ['red', 'blue'],
        true,
        'fictional@example.test',
        '+9779800000000',
      ];
      const answers: FormAnswerSnapshot = {
        formId,
        version: 10,
        answers: fields.map((q, index) => ({
          fieldId: q.id,
          label: q.label,
          type: q.type,
          value: values[index],
          ...(q.type === 'single_choice'
            ? { choiceLabels: ['Yes'] }
            : q.type === 'multiple_choice'
              ? { choiceLabels: ['Red', 'Blue'] }
              : {}),
        })),
      } as FormAnswerSnapshot;
      const id = await publishRaw(10, fields);
      await db.batch(batch('matrix-good', answers, id, 'All types accepted'));
      const before = await state();
      const change = (fieldId: string, patch: object) =>
        ({
          ...answers,
          answers: answers.answers.map((a) =>
            a.fieldId === fieldId ? { ...a, ...patch } : a,
          ),
        }) as FormAnswerSnapshot;
      const invalid: [string, FormAnswerSnapshot][] = [
        ['label', change('short_answer', { label: 'Altered' })],
        ['case', change('short_answer', { label: 'question short_answer' })],
        [
          'trailing-space',
          change('short_answer', { label: 'Question short_answer ' }),
        ],
        ['type', change('short_answer', { type: 'long_text' })],
        ['unknown', change('short_answer', { fieldId: 'unknown_field' })],
        ['choice', change('single_answer', { value: 'unlisted' })],
        ['choice-case', change('single_answer', { value: 'YES' })],
        [
          'choice-label',
          change('single_answer', { choiceLabels: ['Altered'] }),
        ],
        ['choice-count', change('multi_answer', { choiceLabels: ['Red'] })],
        [
          'choice-order',
          change('multi_answer', { choiceLabels: ['Blue', 'Red'] }),
        ],
        ['min', change('quantity', { value: 0 })],
        ['max', change('quantity', { value: 11 })],
        ['integer', change('quantity', { value: 4.5 })],
        ['checkbox', change('acknowledged', { value: false })],
        [
          'missing',
          {
            ...answers,
            answers: answers.answers.filter(
              (a) => a.fieldId !== 'short_answer',
            ),
          },
        ],
      ];
      for (const [name, answer] of invalid) {
        await assert.rejects(
          db.batch(batch('matrix-invalid-' + name, answer, id)),
          name,
        );
        assert.deepEqual(await state(), before, name);
      }
      const historical = await listFormAnswersForSubject(
        db,
        'user',
        'customer',
      );
      assert.deepEqual(
        historical.find((a) => a.requestId === 'matrix-good')?.answers,
        answers,
      );
      const builtIn = await publishRaw(11, [
        field('display_name', 'short_text', { key: 'displayName' }),
        question,
        field('optional_check', 'checkbox', { required: false }),
      ]);
      await db.batch(
        batch(
          'built-in-exemption',
          {
            ...snapshot,
            version: 11,
            answers: [
              ...snapshot.answers,
              {
                fieldId: 'optional_check',
                label: 'Question optional_check',
                type: 'checkbox',
                value: false,
              },
            ],
          },
          builtIn,
          'Built-in accepted',
        ),
      );
      const unchanged = await state();
      for (const [index, altered] of [
        { ...question, label: null },
        { ...question, type: null },
        { ...question, status: null },
        { ...question, status: 'archived' },
      ].entries()) {
        const v = 12 + index,
          vid = await publishRaw(v, [altered]);
        await assert.rejects(
          db.batch(batch('unavailable-' + v, { ...snapshot, version: v }, vid)),
        );
        assert.deepEqual(await state(), unchanged);
      }
      const unsafe = await publishRaw(16, [
        field('choice_answer', 'single_choice', {
          choices: [{ value: 'yes', label: 'Payment token' }],
        }),
      ]);
      await assert.rejects(
        db.batch(
          batch(
            'unsafe-choice',
            {
              formId,
              version: 16,
              answers: [
                {
                  fieldId: 'choice_answer',
                  label: 'Question choice_answer',
                  type: 'single_choice',
                  value: 'yes',
                },
              ],
            },
            unsafe,
          ),
        ),
      );
      assert.deepEqual(await state(), unchanged);
      const absentRequired = await publishRaw(17, [
        { ...field('acknowledged', 'checkbox'), required: null },
      ]);
      await assert.rejects(
        db.batch(
          batch(
            'null-required',
            {
              formId,
              version: 17,
              answers: [
                {
                  fieldId: 'acknowledged',
                  label: 'Question acknowledged',
                  type: 'checkbox',
                  value: false,
                },
              ],
            },
            absentRequired,
          ),
        ),
      );
      assert.deepEqual(await state(), unchanged, 'null required checkbox');
    },
  );
  await stage(
    'typed JSON provenance rejects numeric labels and choices with parent and audit rollback',
    async () => {
      const auditCount = async () => {
        const [rows] = await control.query<RowDataPacket[]>(
          'SELECT COUNT(*) n FROM audit_logs',
        );
        return Number(rows[0].n);
      };
      const cases = [
        {
          name: 'numeric-field-label',
          configured: { ...field('typed_field', 'short_text'), label: 123 },
          answer: {
            fieldId: 'typed_field',
            label: '123',
            type: 'short_text',
            value: 'Fictional',
          },
        },
        {
          name: 'numeric-choice-value',
          configured: field('typed_field', 'single_choice', {
            choices: [
              { value: 1, label: 'One' },
            ] as unknown as ConfiguredField['choices'],
          }),
          answer: {
            fieldId: 'typed_field',
            label: 'Question typed_field',
            type: 'single_choice',
            value: '1',
            choiceLabels: ['One'],
          },
        },
        {
          name: 'numeric-choice-label',
          configured: field('typed_field', 'single_choice', {
            choices: [
              { value: 'one', label: 123 },
            ] as unknown as ConfiguredField['choices'],
          }),
          answer: {
            fieldId: 'typed_field',
            label: 'Question typed_field',
            type: 'single_choice',
            value: 'one',
            choiceLabels: ['123'],
          },
        },
      ];
      const sqlite = new DatabaseSync(':memory:');
      sqlite.exec(
        "PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,display_name TEXT); INSERT INTO users VALUES ('super','Admin'),('customer','Old Name'); CREATE TABLE audit_logs(id TEXT PRIMARY KEY);",
      );
      for (const statement of (
        await readFile('drizzle/0056_form_catalog.sql', 'utf8')
      ).split('--> statement-breakpoint'))
        if (statement.trim()) sqlite.exec(statement);
      const native = {
        prepare(sql: string) {
          return {
            sql,
            bindings: [] as SQLInputValue[],
            bind(...bindings: SQLInputValue[]) {
              return { sql, bindings };
            },
          };
        },
      } as unknown as D1Database;
      const failed: string[] = [];
      for (const [index, entry] of cases.entries()) {
        const v = 30 + index,
          id = 'typed-provenance-v' + v;
        await control.query(
          "INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?,?,?,1,'published',?,'fixture','super',1,'super',1,'super',1,?)",
          [
            id,
            formId,
            v,
            JSON.stringify({ formId, fields: [entry.configured] }),
            id,
          ],
        );
        sqlite
          .prepare(
            "INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?,?,?,1,'published',?,'fixture','super',1,'super',1,'super',1,?)",
          )
          .run(
            id,
            formId,
            v,
            JSON.stringify({ formId, fields: [entry.configured] }),
            id,
          );
        const nativeAnswer = buildFormAnswerInsert(native, {
          formId,
          requestId: entry.name,
          versionId: id,
          subjectType: 'user',
          subjectId: 'customer',
          actorId: 'customer',
          answers: {
            formId,
            version: v,
            answers: [entry.answer],
          } as FormAnswerSnapshot,
          now: 10,
        }) as unknown as { sql: string; bindings: SQLInputValue[] };
        sqlite.exec(
          "BEGIN; UPDATE users SET display_name='Forbidden' WHERE id='customer'; INSERT INTO audit_logs VALUES ('audit-" +
            entry.name +
            "');",
        );
        assert.throws(
          () => sqlite.prepare(nativeAnswer.sql).run(...nativeAnswer.bindings),
          entry.name + ' native rejection',
        );
        sqlite.exec('ROLLBACK');
        assert.deepEqual(
          sqlite
            .prepare(
              "SELECT display_name name,(SELECT COUNT(*) FROM form_answer_sets) answers,(SELECT COUNT(*) FROM audit_logs) audits FROM users WHERE id='customer'",
            )
            .get(),
          Object.assign(Object.create(null), {
            name: 'Old Name',
            answers: 0,
            audits: 0,
          }),
          entry.name + ' native parent/answer/audit rollback',
        );
        console.log(
          JSON.stringify({
            name: entry.name + ' native SQLite parity',
            status: 'PASS',
          }),
        );
        const before = await state(),
          audits = await auditCount();
        try {
          await assert.rejects(
            db.batch([
              db
                .prepare(
                  "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at) VALUES (?,'customer','fixture.parent','user','customer',?,10)",
                )
                .bind('audit-' + entry.name, 'audit-' + entry.name),
              ...batch(
                entry.name,
                {
                  formId,
                  version: v,
                  answers: [entry.answer],
                } as FormAnswerSnapshot,
                id,
              ),
            ]),
            entry.name,
          );
          assert.deepEqual(
            await state(),
            before,
            entry.name + ' parent and answer rollback',
          );
          assert.equal(
            await auditCount(),
            audits,
            entry.name + ' audit rollback',
          );
          console.log(JSON.stringify({ name: entry.name, status: 'PASS' }));
        } catch (error) {
          failed.push(entry.name + ': ' + (error as Error).message);
          console.log(
            JSON.stringify({
              name: entry.name,
              status: 'FAIL',
              message: (error as Error).message,
            }),
          );
        }
      }
      sqlite.close();
      assert.deepEqual(
        failed,
        [],
        'Every typed provenance case must reject atomically',
      );
    },
  );

  await stage(
    'text digits retain legitimate field and choice provenance',
    async () => {
      const configured = {
        ...field('typed_field', 'single_choice', {
          choices: [{ value: '1', label: '123' }],
        }),
        label: '123',
      };
      await control.query(
        "INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES ('typed-text-v40',?,40,1,'published',?,'fixture','super',1,'super',1,'super',1,'typed-text-v40')",
        [formId, JSON.stringify({ formId, fields: [configured] })],
      );
      const before = await state();
      await db.batch(
        batch(
          'typed-text-valid',
          {
            formId,
            version: 40,
            answers: [
              {
                fieldId: 'typed_field',
                label: '123',
                type: 'single_choice',
                value: '1',
                choiceLabels: ['123'],
              },
            ],
          } as SnapshotWithChoiceLabels,
          'typed-text-v40',
          'Typed text accepted',
        ),
      );
      assert.deepEqual(await state(), {
        name: 'Typed text accepted',
        count: before.count + 1,
      });
    },
  );
  const publicationCases: { name: string; config: unknown; answers: FormAnswerSnapshot['answers']; accepts?: boolean }[] = [];
  const guardText = field('guard_field', 'short_text', { required: false });
  const guardNumber = field('guard_field', 'number', { required: false });
  const guardCheck = field('guard_field', 'checkbox', { required: false });
  const configuredCase = (name: string, configured: unknown, value: unknown = 'Fictional',
    type: FormAnswerSnapshot['answers'][number]['type'] = 'short_text', extras: object = {}) =>
    publicationCases.push({ name, config: { formId, fields: [configured] },
      answers: [{ fieldId: 'guard_field', label: 'Question guard_field', type, value, ...extras }] });
  configuredCase('required-number-one-checkbox', { ...guardCheck, required: 1 }, false, 'checkbox');
  publicationCases.push({ name: 'required-number-one-omitted', config: { formId, fields: [{ ...guardText, required: 1 }] }, answers: [] });
  for (const [name, value] of [['number-zero', 0], ['string', 'true'], ['null', null], ['object', {}], ['array', []]] as const) {
    configuredCase('required-' + name, { ...guardText, required: value });
    configuredCase('integer-' + name, { ...guardNumber, integerOnly: value }, 4.5, 'number');
  }
  for (const [name, value] of [['text', '1'], ['null', null], ['object', {}], ['array', []], ['boolean', true]] as const) {
    for (const bound of ['min', 'max']) configuredCase(bound + '-' + name, { ...guardNumber, [bound]: value }, 4, 'number');
  }
  const { required: _required, ...missingRequired } = guardText;
  configuredCase('required-missing', missingRequired);
  configuredCase('integer-number-one', { ...guardNumber, integerOnly: 1 }, 4.5, 'number');
  configuredCase('min-text-digits', { ...guardNumber, min: '1' }, 4, 'number');
  configuredCase('max-text-digits', { ...guardNumber, max: '10' }, 4, 'number');
  configuredCase('choice-numeric-label-omitted', field('guard_field', 'single_choice', {
    required: false, choices: [{ value: 'one', label: 123 }, { value: 'two', label: 'Two' }] as unknown as ConfiguredField['choices'],
  }), 'one', 'single_choice');
  for (const [name, value] of [['null', null], ['object', {}], ['array', []], ['number', 123]] as const)
    configuredCase('key-' + name, { ...guardText, key: value });
  const { key: _key, ...missingKey } = guardText;
  configuredCase('key-missing', missingKey);
  configuredCase('key-custom-mismatch', { ...guardText, key: 'other_field' });
  for (const [name, config] of [
    ['fields-missing', { formId }], ['fields-null', { formId, fields: null }],
    ['fields-object', { formId, fields: {} }], ['fields-string', { formId, fields: 'bad' }],
    ['form-id-missing', { fields: [] }], ['form-id-wrong', { formId: 'wrong.form', fields: [] }],
  ] as const) publicationCases.push({ name, config, answers: [] });
  publicationCases.push({ name: 'omitted-invalid-key', config: { formId, fields: [{ ...guardText, key: null }] }, answers: [] });
  publicationCases.push({ name: 'omitted-invalid-required', config: { formId, fields: [{ ...guardText, required: null }] }, answers: [] });
  const positive = (name: string, config: unknown, answers: FormAnswerSnapshot['answers']) =>
    publicationCases.push({ name, config, answers, accepts: true });
  positive('valid-empty-fields', { formId, fields: [] }, []);
  positive('valid-built-in-alias', { formId, fields: [field('display_name', 'short_text', { key: 'displayName' })] }, []);
  for (const required of [false, true]) positive('valid-required-' + required,
    { formId, fields: [{ ...guardCheck, required }] },
    [{ fieldId: 'guard_field', label: 'Question guard_field', type: 'checkbox', value: required }]);
  positive('valid-negative-fraction-bounds', { formId, fields: [{ ...guardNumber, min: -2.5, max: 2.75, integerOnly: false }] },
    [{ fieldId: 'guard_field', label: 'Question guard_field', type: 'number', value: -1.25 }]);
  positive('valid-absent-number-options', { formId, fields: [guardNumber] },
    [{ fieldId: 'guard_field', label: 'Question guard_field', type: 'number', value: 4.5 }]);
  positive('valid-integer-true', { formId, fields: [{ ...guardNumber, integerOnly: true }] },
    [{ fieldId: 'guard_field', label: 'Question guard_field', type: 'number', value: 4 }]);
  for (const supplied of [false, true]) positive('valid-choice-label-' + (supplied ? 'provided' : 'omitted'),
    { formId, fields: [field('guard_field', 'single_choice', { required: false,
      choices: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] })] },
    [{ fieldId: 'guard_field', label: 'Question guard_field', type: 'single_choice', value: 'one',
      ...(supplied ? { choiceLabels: ['One'] } : {}) }]);
  // Each case uses the production statement, not an isolated JSON comparison.
  // Record both outcomes before assertions to distinguish engine regressions
  // from preexisting shared gaps, and continue the complete RED matrix.
  await stage('publication type and structure guards preserve atomic rollback on both engines', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,display_name TEXT); INSERT INTO users VALUES ('super','Admin'),('customer','Native initial'); CREATE TABLE audit_logs(id TEXT PRIMARY KEY);");
    for (const statement of (await readFile('drizzle/0056_form_catalog.sql', 'utf8')).split('--> statement-breakpoint'))
      if (statement.trim()) sqlite.exec(statement);
    const native = { prepare(sql: string) {
      return { sql, bindings: [] as SQLInputValue[], bind(...bindings: SQLInputValue[]) { return { sql, bindings }; } };
    } } as unknown as D1Database;
    const nativeState = () => ({ ...sqlite.prepare("SELECT display_name name,(SELECT COUNT(*) FROM form_answer_sets) answers,(SELECT COUNT(*) FROM audit_logs) audits FROM users WHERE id='customer'").get() });
    const mariaState = async () => {
      const [rows] = await control.query<RowDataPacket[]>("SELECT display_name name,(SELECT COUNT(*) FROM form_answer_sets) answers,(SELECT COUNT(*) FROM audit_logs) audits FROM users WHERE id='customer'");
      return { name: String(rows[0].name), answers: Number(rows[0].answers), audits: Number(rows[0].audits) };
    };
    const failures: string[] = [];
    try {
      for (const [index, entry] of publicationCases.entries()) {
        const version = 100 + index, id = 'publication-guard-v' + version;
        const insert = "INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?,?,?,1,'published',?,'fixture','super',1,'super',1,'super',1,?)";
        const bindings = [id, formId, version, JSON.stringify(entry.config), id];
        sqlite.prepare(insert).run(...bindings);
        await control.query(insert, bindings);
        const answers = { formId, version, answers: entry.answers } as FormAnswerSnapshot;
        const nativeInsert = buildFormAnswerInsert(native, { formId, requestId: entry.name, versionId: id,
          subjectType: 'user', subjectId: 'customer', actorId: 'customer', answers, now: 10,
        }) as unknown as { sql: string; bindings: SQLInputValue[] };
        const beforeNative = nativeState(), beforeMaria = await mariaState();
        let nativeAccepted = false, mariaAccepted = false, nativeMessage = '', mariaCode = '';
        sqlite.exec('BEGIN');
        try {
          sqlite.prepare("UPDATE users SET display_name=? WHERE id='customer'").run('Native ' + entry.name);
          sqlite.prepare('INSERT INTO audit_logs VALUES (?)').run('native-audit-' + entry.name);
          sqlite.prepare(nativeInsert.sql).run(...nativeInsert.bindings);
          sqlite.exec('COMMIT');
          nativeAccepted = true;
        } catch (error) { nativeMessage = (error as Error).message; sqlite.exec('ROLLBACK'); }
        try {
          await db.batch([
            db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at) VALUES (?,'customer','fixture.publication','user','customer',?,10)")
              .bind('guard-audit-' + entry.name, 'guard-audit-' + entry.name),
            ...batch('guard-' + entry.name, answers, id, 'Maria ' + entry.name),
          ]);
          mariaAccepted = true;
        } catch (error) { mariaCode = (error as Error & { code?: string }).code ?? ''; }
        const classification = nativeAccepted === mariaAccepted ? (nativeAccepted ? 'shared acceptance' : 'both reject')
          : nativeAccepted ? 'native acceptance only' : 'Maria permissive regression';
        console.log(JSON.stringify({ name: entry.name, nativeAccepted, mariaAccepted, classification,
          nativeMessage, mariaCode, expectedAcceptance: entry.accepts === true }));
        try {
          if (!nativeAccepted) {
            assert.match(nativeMessage, /malformed JSON/, entry.name + ' native canonical rejection');
            assert.deepEqual(nativeState(), beforeNative, entry.name + ' native parent/answer/audit rollback');
          }
          if (!mariaAccepted) {
            assert.equal(mariaCode, 'ER_BAD_NULL_ERROR', entry.name + ' Maria canonical rejection');
            assert.deepEqual(await mariaState(), beforeMaria, entry.name + ' Maria parent/answer/audit rollback');
          }
          assert.equal(nativeAccepted, entry.accepts === true, entry.name + ' native acceptance');
          assert.equal(mariaAccepted, entry.accepts === true, entry.name + ' Maria acceptance');
          if (entry.accepts) {
            assert.deepEqual(nativeState(), { name: 'Native ' + entry.name, answers: Number(beforeNative.answers) + 1, audits: Number(beforeNative.audits) + 1 });
            assert.deepEqual(await mariaState(), { name: 'Maria ' + entry.name, answers: beforeMaria.answers + 1, audits: beforeMaria.audits + 1 });
            const savedId = await db.prepare('SELECT id FROM form_answer_sets WHERE request_id=?').bind('guard-' + entry.name).first<{ id: string }>();
            assert.ok(savedId);
            const saved = await getFormAnswerById(db, savedId.id);
            assert.ok(saved, entry.name + ' readable answer');
            const withoutLabels = (answer: FormAnswerSnapshot['answers'][number] & { choiceLabels?: readonly string[] }) => {
              const { choiceLabels: _labels, ...value } = answer; return value;
            };
            assert.deepEqual(saved.answers.answers.map(withoutLabels), entry.answers.map(withoutLabels));
          }
        } catch (error) { failures.push((error as Error).message); }
      }
    } finally { sqlite.close(); }
    assert.deepEqual(failures, [], 'Publication guards must reject malformed configuration and preserve valid publications');
  });

} finally {
  await control.end();
  await mkdir(evidence, { recursive: true });
  await writeFile(
    evidence + '/' + database + '.json',
    JSON.stringify({ database, observations }, null, 2),
  );
}
process.exit(observations.every((o) => o.status === 'PASS') ? 0 : 1);
