import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import {
  classifySqlTransferTable,
  createSqlTransferSource,
  recognizedSqlTransferTableNames,
} from '../lib/portability/d1-source';
import {
  inspectPortableTransfer,
  preparePortableTransfer,
  requiredPortableTableClass,
} from '../lib/portability/transfer';
import type { PortableSourceSnapshot } from '../lib/portability/types';
import { decryptPortableFrames } from '../lib/portability/crypto';
import { canonicalJson, isPlainRecord } from '../lib/portability/values';

const fixtureClassifications = {
  fixture_records: 'durable',
  future_business_feature: 'durable',
} as const;

/** In-memory only. This fixture never opens a retained application database. */
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE fixture_records(id TEXT PRIMARY KEY,amount TEXT,rate INTEGER,big INTEGER,bytes BLOB,empty TEXT,nullable_value TEXT,unicode TEXT,fraction REAL);
    INSERT INTO fixture_records VALUES ('original','12.3400',1200,9007199254740993123,X'00FF01','',NULL,'नेपाल',1.25);
    CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY);
    INSERT INTO user_sessions VALUES ('fictional-retired-token');
    CREATE TABLE traffic_sessions(id TEXT PRIMARY KEY);
    INSERT INTO traffic_sessions VALUES ('historic-traffic');
    CREATE TABLE future_business_feature(id TEXT PRIMARY KEY,value TEXT);
    INSERT INTO future_business_feature VALUES ('stable-id','keep-new-feature');`);
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      assert.match(
        sql,
        /^\s*(?:SELECT|WITH|PRAGMA)\b/i,
        'source adapter only reads data',
      );
      const statement = sqlite.prepare(sql);
      let bindings: SQLInputValue[] = [];
      const prepared = {
        bind(...values: SQLInputValue[]) {
          bindings = values;
          return prepared;
        },
        async all<T>() {
          return {
            success: true,
            results: statement
              .all(...bindings)
              .map((row) => ({ ...row })) as T[],
          };
        },
        async first<T>() {
          const row = statement.get(...bindings);
          return row ? ({ ...row } as T) : null;
        },
        async run() {
          throw new Error('Source adapter attempted a mutation.');
        },
      };
      return prepared;
    },
  } as unknown as D1Database;
  const stored = new Map<
    string,
    {
      bytes: Uint8Array;
      httpMetadata: Record<string, string>;
      customMetadata: Record<string, string>;
    }
  >([
    [
      'private/evidence/account-1.bin',
      {
        bytes: new Uint8Array([0, 255, 1, 2]),
        httpMetadata: { contentType: 'application/octet-stream' },
        customMetadata: { owner: 'account-1' },
      },
    ],
    [
      'public/catalogue/एक.webp',
      {
        bytes: new Uint8Array([3, 4]),
        httpMetadata: {
          contentType: 'image/webp',
          cacheControl: 'max-age=600',
        },
        customMetadata: {},
      },
    ],
    [
      'unreferenced/orphan.bin',
      {
        bytes: new Uint8Array([5]),
        httpMetadata: {},
        customMetadata: { preserved: 'yes' },
      },
    ],
  ]);
  const state = { listCalls: 0, readerClosed: 0, missing: false };
  const bucket = {
    async list(options: { cursor?: string; limit?: number } = {}) {
      state.listCalls++;
      const keys = [...stored.keys()].sort((a, b) =>
        Buffer.compare(Buffer.from(a), Buffer.from(b)),
      );
      const start = Number(options.cursor ?? '0');
      const page = keys.slice(start, start + 2);
      const truncated = start + page.length < keys.length;
      return {
        objects: page.map((key) => ({
          key,
          size: stored.get(key)!.bytes.length,
          httpMetadata: stored.get(key)!.httpMetadata,
          customMetadata: stored.get(key)!.customMetadata,
        })),
        truncated,
        ...(truncated ? { cursor: String(start + page.length) } : {}),
      };
    },
    async get(key: string) {
      const record = stored.get(key);
      if (!record || state.missing) return null;
      let emitted = false;
      return {
        key,
        size: record.bytes.length,
        httpMetadata: record.httpMetadata,
        customMetadata: record.customMetadata,
        body: new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              if (!emitted) {
                controller.enqueue(record.bytes.slice());
                emitted = true;
              } else {
                controller.close();
                state.readerClosed++;
              }
            },
            cancel() {
              state.readerClosed++;
            },
          },
          { highWaterMark: 0 },
        ),
      };
    },
  } as unknown as R2Bucket;
  const source = createSqlTransferSource(db, bucket, {
    installationId: 'fictional-installation',
    release: 'fixture-release',
    keyIds: [],
    schemaVersion: 'fixture-v1',
    tableClassifications: fixtureClassifications,
  });
  return {
    sqlite,
    db,
    bucket,
    source,
    stored,
    state,
    queries,
    dispose: () => sqlite.close(),
  };
}

async function consume(snapshot: PortableSourceSnapshot) {
  for (const table of snapshot.inventory.tables)
    for await (const _ of snapshot.rows(table)) {
      /* consume */
    }
  for (const namespace of snapshot.inventory.namespaces)
    for await (const object of snapshot.objects(namespace))
      for await (const _ of object.bytes) {
        /* consume */
      }
}

void test('source inventories every actual table and preserves exact typed values with read-only bounded queries', async () => {
  const f = fixture();
  try {
    const snapshot = await f.source.openSnapshot();
    const inventory = snapshot.inventory;
    assert.deepEqual(inventory.discoveredTables, [
      'fixture_records',
      'future_business_feature',
      'traffic_sessions',
      'user_sessions',
    ]);
    assert.equal(
      inventory.tables.find((table) => table.name === 'traffic_sessions')
        ?.classification,
      'durable',
    );
    assert.equal(
      inventory.tables.find((table) => table.name === 'user_sessions')
        ?.classification,
      'transient',
    );
    assert.equal(inventory.snapshot.writeMode, 'preliminary');
    assert.equal(inventory.application.artifactSha256, null);
    const table = inventory.tables.find(
      (entry) => entry.name === 'fixture_records',
    )!;
    const rows = [];
    for await (const row of snapshot.rows(table)) rows.push(row);
    assert.deepEqual(rows[0], [
      { type: 'text', value: 'original' },
      { type: 'text', value: '12.3400' },
      { type: 'integer', value: '1200' },
      { type: 'integer', value: '9007199254740993123' },
      { type: 'bytes', value: 'AP8B' },
      { type: 'text', value: '' },
      { type: 'null' },
      { type: 'text', value: 'नेपाल' },
      { type: 'real', value: '1.25' },
    ]);
    assert.ok(f.queries.some((query) => /CAST\(.+AS TEXT\)/i.test(query)));
    assert.ok(f.queries.some((query) => /LIMIT \? OFFSET \?/i.test(query)));
    await snapshot.close();
  } finally {
    f.dispose();
  }
});

void test('reviewed table policy rejects unknown tables and cannot downgrade dispatch or authentication state', () => {
  assert.equal(classifySqlTransferTable('feedback_delivery_jobs'), 'dispatch');
  assert.equal(classifySqlTransferTable('local_contact_captures'), 'transient');
  assert.equal(classifySqlTransferTable('user_credentials'), 'security');
  assert.equal(
    classifySqlTransferTable('managed_commercial_snapshots'),
    'durable',
  );
  assert.equal(
    classifySqlTransferTable('_hastabazaar_local_migrations'),
    'installation',
  );
  assert.throws(
    () => classifySqlTransferTable('future_unreviewed_table'),
    /unreviewed/i,
  );
  assert.throws(
    () => classifySqlTransferTable('future_access_tokens'),
    /unreviewed/i,
  );
  assert.throws(
    () =>
      classifySqlTransferTable('feedback_delivery_jobs', {
        feedback_delivery_jobs: 'durable',
      }),
    /overridden|weakened/i,
  );
  assert.throws(
    () =>
      classifySqlTransferTable('local_contact_captures', {
        local_contact_captures: 'durable',
      }),
    /overridden|weakened/i,
  );
  assert.throws(
    () =>
      classifySqlTransferTable('future_access_tokens', {
        future_access_tokens: 'durable',
      }),
    /weakened/i,
  );
  assert.equal(
    classifySqlTransferTable('reviewed_fixture_business', {
      reviewed_fixture_business: 'durable',
    }),
    'durable',
  );
});

void test('reviewed recovery evidence, delivery state and assertion tables keep their exact classes', () => {
  for (const [name, classification] of [
    ['seller_document_replacement_permissions', 'security'],
    ['seller_protected_change_permissions', 'security'],
    ['staff_invitation_grants', 'security'],
    ['service_health_guards', 'transient'],
    ['service_health_observations', 'durable'],
    ['service_health_incidents', 'durable'],
    ['operational_notice_states', 'durable'],
    ['operational_reminder_milestones', 'durable'],
    ['commission_terms_scan_state', 'durable'],
    ['complete_version_legacy_transitions', 'durable'],
    ['outgoing_payment_packets', 'durable'],
    ['payout_transfer_packets', 'durable'],
    ['email_delivery_attempts', 'dispatch'],
    ['email_transport_backoff', 'dispatch'],
    ['commission_terms_email_controls', 'dispatch'],
    ['operational_reminder_cursors', 'dispatch'],
  ] as const) {
    assert.equal(classifySqlTransferTable(name), classification, name);
    assert.equal(requiredPortableTableClass(name), classification, name);
    assert.throws(
      () => classifySqlTransferTable(name, {
        [name]: classification === 'transient' ? 'durable' : 'transient',
      }),
      /overridden|weakened/i,
    );
  }
  assert.equal(requiredPortableTableClass('staff_other_grants'), 'transient');
});

void test('reviewed table registry explicitly covers the final current migration schema', async () => {
  const directory = new URL('../drizzle/', import.meta.url);
  const names = new Set<string>();
  const statements =
    /\b(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?|ALTER\s+TABLE\s+)[`"']?([A-Za-z_]\w*)[`"']?(?:\s+RENAME\s+TO\s+[`"']?([A-Za-z_]\w*)[`"']?)?/gi;
  for (const filename of (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const source = (await readFile(new URL(filename, directory), 'utf8'))
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of source.matchAll(statements)) {
      if (/^CREATE/i.test(match[1])) names.add(match[2]);
      if (/^DROP/i.test(match[1])) names.delete(match[2]);
      if (/^ALTER/i.test(match[1]) && match[3]) {
        names.delete(match[2]);
        names.add(match[3]);
      }
    }
  }
  const reviewed = new Set(recognizedSqlTransferTableNames());
  assert.ok(names.size > 140);
  for (const name of names) {
    assert.ok(
      reviewed.has(name),
      'new table requires explicit export/restore policy: ' + name,
    );
    assert.doesNotThrow(() => classifySqlTransferTable(name), name);
  }
  for (const name of [
    'user_credentials',
    'user_sessions',
    'email_login_challenges',
    '_cf_METADATA',
    '_hastabazaar_local_migrations',
  ])
    assert.ok(reviewed.has(name));
});

void test('a newly discovered unreviewed table blocks a complete source backup even when empty', async () => {
  const f = fixture();
  try {
    f.sqlite.exec('CREATE TABLE future_unreviewed_table(id TEXT PRIMARY KEY)');
    await assert.rejects(() => f.source.openSnapshot(), /unreviewed table/i);
  } finally {
    f.dispose();
  }
});

void test('database media references missing from storage listing block complete backup', async () => {
  for (const table of ['product_media', 'seller_documents']) {
    const f = fixture();
    try {
      f.sqlite.exec(
        'CREATE TABLE ' +
          table +
          '(id TEXT PRIMARY KEY,object_key TEXT NOT NULL)',
      );
      f.sqlite
        .prepare('INSERT INTO ' + table + ' VALUES (?,?)')
        .run('missing-reference', 'private/missing-original.bin');
      await assert.rejects(
        () => f.source.openSnapshot(),
        /media reference.*missing|backup.*blocked/i,
      );
    } finally {
      f.dispose();
    }
  }
});

void test('present database media references are reconciled while unreferenced uploads remain included', async () => {
  const f = fixture();
  try {
    f.sqlite.exec(
      'CREATE TABLE product_media(id TEXT PRIMARY KEY,object_key TEXT NOT NULL); CREATE TABLE seller_documents(id TEXT PRIMARY KEY,object_key TEXT NOT NULL)',
    );
    for (const table of ['product_media', 'seller_documents'])
      f.sqlite
        .prepare('INSERT INTO ' + table + ' VALUES (?,?)')
        .run('present-reference', 'private/evidence/account-1.bin');
    const snapshot = await f.source.openSnapshot();
    assert.equal(
      snapshot.inventory.namespaces.reduce(
        (sum, namespace) => sum + namespace.objectCount,
        0,
      ),
      3,
    );
    await consume(snapshot);
    assert.equal(await snapshot.verifyUnchanged(), true);
    await snapshot.close();
  } finally {
    f.dispose();
  }
});

void test('object_key does not silently exempt external URLs or unreviewed storage columns', async () => {
  const f = fixture();
  try {
    f.sqlite.exec(
      'CREATE TABLE product_media(id TEXT PRIMARY KEY,object_key TEXT NOT NULL)',
    );
    f.sqlite
      .prepare('INSERT INTO product_media VALUES (?,?)')
      .run(
        'unrecognized-external',
        'https://unrecognized.invalid/private-proof.bin',
      );
    await assert.rejects(
      () => f.source.openSnapshot(),
      /unsafe media key|reference/i,
    );
  } finally {
    f.dispose();
  }
  const added = fixture();
  try {
    added.sqlite.exec(
      'ALTER TABLE fixture_records ADD COLUMN new_object_key TEXT',
    );
    await assert.rejects(
      () => added.source.openSnapshot(),
      /unreviewed storage reference/i,
    );
  } finally {
    added.dispose();
  }
});

void test('all private, public and unreferenced media bytes/metadata survive encrypted source inspection', async () => {
  const f = fixture();
  try {
    const chunks = [];
    for await (const chunk of preparePortableTransfer(f.source, {
      passphrase: 'fictional source backup passphrase',
    }))
      chunks.push(chunk);
    const report = await inspectPortableTransfer(
      Buffer.concat(chunks),
      'fictional source backup passphrase',
    );
    assert.equal(report.totalObjects, 3);
    assert.equal(report.totalObjectBytes, 7);
    assert.equal(report.totalRows, 4);
    assert.equal(report.finalCutoverReady, false);
    assert.equal(
      report.inventory.namespaces.find(
        (namespace) => namespace.id === 'private',
      )?.objectCount,
      2,
    );
    assert.equal(
      report.inventory.namespaces.find((namespace) => namespace.id === 'public')
        ?.objectCount,
      1,
    );
    assert.ok(f.state.listCalls > 3);
  } finally {
    f.dispose();
  }
});

void test('retained seller dispatch evidence requires its exact private media and preserves the archived bytes', async () => {
  const f = fixture();
  const key = 'private/seller-dispatch-evidence/fictional-photo';
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC',
    'base64',
  );
  const httpMetadata = { contentType: 'image/png', cacheControl: 'private, no-store' };
  const customMetadata = { fixture: 'dispatch-photo' };
  const passphrase = 'fictional dispatch evidence backup passphrase';
  try {
    f.sqlite.exec(`CREATE TABLE seller_dispatch_evidence(id TEXT PRIMARY KEY,
      object_key TEXT NOT NULL UNIQUE CHECK(object_key='private/seller-dispatch-evidence/'||id))`);
    f.sqlite.prepare('INSERT INTO seller_dispatch_evidence VALUES (?, ?)').run('fictional-photo', key);
    f.stored.set(key.toUpperCase(), { bytes, httpMetadata, customMetadata });
    await assert.rejects(() => f.source.openSnapshot(), /reference.*missing/i);

    f.stored.delete(key.toUpperCase());
    f.stored.set(key, { bytes, httpMetadata, customMetadata });
    const encrypted: Uint8Array[] = [];
    for await (const chunk of preparePortableTransfer(f.source, { passphrase })) encrypted.push(chunk);
    const archive = Buffer.concat(encrypted);
    const report = await inspectPortableTransfer(archive, passphrase);
    const table = report.inventory.tables.find((entry) => entry.name === 'seller_dispatch_evidence');
    assert.ok(table);
    assert.equal(table.classification, 'durable');
    assert.equal(table.rowCount, 1);
    assert.equal(requiredPortableTableClass(table.name), 'durable');
    assert.throws(() => classifySqlTransferTable(table.name, { [table.name]: 'transient' }), /overridden/i);
    const actual: Buffer[] = [];
    let dispatchPhoto = false;
    for await (const { value } of decryptPortableFrames(archive, passphrase, 'data')) {
      if (!isPlainRecord(value)) continue;
      if (value.type === 'object-start') {
        const object = value.object;
        dispatchPhoto = false;
        if (isPlainRecord(object) && object.key === key) {
          dispatchPhoto = true;
          assert.equal(object.namespace, 'private');
          assert.deepEqual(object.httpMetadata, httpMetadata);
          assert.deepEqual(object.customMetadata, customMetadata);
        }
      } else if (value.type === 'object-bytes' && dispatchPhoto && typeof value.data === 'string') {
        actual.push(Buffer.from(value.data, 'base64'));
      }
    }
    assert.deepEqual(Buffer.concat(actual), bytes);
    assert.deepEqual({ ...f.sqlite.prepare('SELECT * FROM seller_dispatch_evidence').get() },
      { id: 'fictional-photo', object_key: key });
  } finally {
    f.dispose();
  }
});

void test('source detects ABA row changes even when final database values match the baseline', async () => {
  const f = fixture();
  try {
    const snapshot = await f.source.openSnapshot();
    f.sqlite.exec("UPDATE fixture_records SET amount='999.0000'");
    for (const table of snapshot.inventory.tables)
      for await (const _ of snapshot.rows(table)) {
        /* consume changed rows */
      }
    f.sqlite.exec("UPDATE fixture_records SET amount='12.3400'");
    for (const namespace of snapshot.inventory.namespaces)
      for await (const object of snapshot.objects(namespace))
        for await (const _ of object.bytes) {
          /* consume */
        }
    assert.equal(await snapshot.verifyUnchanged(), false);
    await snapshot.close();
  } finally {
    f.dispose();
  }
});

void test('source detects changed media bytes/metadata, new tables and schema changes after export', async () => {
  for (const issue of ['bytes', 'metadata', 'table', 'index'] as const) {
    const f = fixture();
    try {
      const snapshot = await f.source.openSnapshot();
      await consume(snapshot);
      if (issue === 'bytes')
        f.stored.get('private/evidence/account-1.bin')!.bytes[0] = 123;
      if (issue === 'metadata')
        f.stored.get('private/evidence/account-1.bin')!.customMetadata.owner =
          'different';
      if (issue === 'table')
        f.sqlite.exec('CREATE TABLE another_feature(id TEXT)');
      if (issue === 'index')
        f.sqlite.exec('CREATE INDEX new_index ON fixture_records(amount)');
      assert.equal(await snapshot.verifyUnchanged(), false, issue);
      await snapshot.close();
    } finally {
      f.dispose();
    }
  }
});

void test('source compares exported file bytes against baseline to catch reverted media changes', async () => {
  const f = fixture();
  try {
    const snapshot = await f.source.openSnapshot();
    const original = f.stored
      .get('private/evidence/account-1.bin')!
      .bytes.slice();
    f.stored.get('private/evidence/account-1.bin')!.bytes[0] = 33;
    await consume(snapshot);
    f.stored.get('private/evidence/account-1.bin')!.bytes = original;
    assert.equal(await snapshot.verifyUnchanged(), false);
    await snapshot.close();
  } finally {
    f.dispose();
  }
});

void test('partial consumption and missing media never produce a complete snapshot', async () => {
  const f = fixture();
  try {
    const snapshot = await f.source.openSnapshot();
    assert.equal(await snapshot.verifyUnchanged(), false);
    await snapshot.close();
    await assert.rejects(async () => {
      for await (const _ of snapshot.rows(snapshot.inventory.tables[0])) {
        /* closed */
      }
    }, /closed/i);
    f.state.missing = true;
    await assert.rejects(() => f.source.openSnapshot(), /missing|unavailable/i);
  } finally {
    f.dispose();
  }
});

void test('unsupported engines and unrepresentable oversized rows fail safely without writes', async () => {
  const f = fixture();
  try {
    const unsupported = Object.assign(Object.create(f.db), {
      dialect: 'mariadb',
    }) as D1Database;
    await assert.rejects(
      () =>
        createSqlTransferSource(unsupported, f.bucket, {
          installationId: 'fixture',
          release: 'fixture',
          keyIds: [],
        }).openSnapshot(),
      /MariaDB|not.*supported|not.*verified/i,
    );
    f.sqlite
      .prepare('UPDATE fixture_records SET amount=?')
      .run('x'.repeat(500_000));
    await assert.rejects(
      () => f.source.openSnapshot(),
      /bounded|oversized|too large/i,
    );
  } finally {
    f.dispose();
  }
});

void test('source close releases a partially consumed media reader and does not change rows', async () => {
  const f = fixture();
  try {
    const before = canonicalJson(
      f.sqlite
        .prepare('SELECT id,amount FROM fixture_records')
        .all()
        .map((row) => ({ ...row })),
    );
    const snapshot = await f.source.openSnapshot();
    const objects = snapshot
      .objects(
        snapshot.inventory.namespaces.find(
          (namespace) => namespace.id === 'private',
        )!,
      )
      [Symbol.asyncIterator]();
    const object = (await objects.next()).value;
    assert.ok(object);
    const bytes = object.bytes[Symbol.asyncIterator]();
    await bytes.next();
    const closedBefore = f.state.readerClosed;
    await snapshot.close();
    assert.ok(f.state.readerClosed > closedBefore);
    await assert.rejects(() => bytes.next(), /closed|cancelled/i);
    assert.equal(
      canonicalJson(
        f.sqlite
          .prepare('SELECT id,amount FROM fixture_records')
          .all()
          .map((row) => ({ ...row })),
      ),
      before,
    );
  } finally {
    f.dispose();
  }
});

void test('an aborted source request stops before reading database or media state', async () => {
  const f = fixture();
  try {
    const controller = new AbortController();
    controller.abort();
    const source = createSqlTransferSource(f.db, f.bucket, {
      installationId: 'fixture',
      release: 'fixture',
      keyIds: [],
      signal: controller.signal,
    });
    await assert.rejects(() => source.openSnapshot(), /closed|cancelled/i);
    assert.equal(f.queries.length, 0);
    assert.equal(f.state.listCalls, 0);
  } finally {
    f.dispose();
  }
});

void test('invalid UTF-8 stored as SQLite text fails instead of silently replacing bytes', async () => {
  const f = fixture();
  try {
    f.sqlite.exec("UPDATE fixture_records SET unicode=CAST(X'80' AS TEXT)");
    await assert.rejects(
      () => f.source.openSnapshot(),
      /UTF-8|byte-preserving/i,
    );
  } finally {
    f.dispose();
  }
});

void test('generated order discount columns are archived with their observed values and explicit generation metadata', async () => {
  const f = fixture();
  try {
    f.sqlite
      .exec(`CREATE TABLE generated_fixture(id TEXT PRIMARY KEY,commission_bps INTEGER,maker_bps INTEGER,promo_discount_paisa INTEGER,referral_discount_paisa INTEGER,current_discount_paisa INTEGER,current_promo_discount_paisa INTEGER,
      discount_source TEXT GENERATED ALWAYS AS (CASE WHEN promo_discount_paisa>0 THEN 'promo' WHEN referral_discount_paisa>0 THEN 'referral' ELSE 'none' END) VIRTUAL,
      current_referral_discount_paisa INTEGER GENERATED ALWAYS AS (CASE WHEN current_discount_paisa IS NULL THEN referral_discount_paisa ELSE current_discount_paisa-current_promo_discount_paisa END) VIRTUAL,
      saved_split INTEGER GENERATED ALWAYS AS (commission_bps+maker_bps) STORED);
      INSERT INTO generated_fixture(id,commission_bps,maker_bps,promo_discount_paisa,referral_discount_paisa,current_discount_paisa,current_promo_discount_paisa) VALUES ('old',900,9100,0,90,NULL,0),('new',1200,8800,120,0,100,100);`);
    const before = f.sqlite
      .prepare('SELECT * FROM generated_fixture ORDER BY id')
      .all();
    const source = createSqlTransferSource(f.db, f.bucket, {
      installationId: 'generated-fixture',
      release: 'fictional',
      keyIds: [],
      tableClassifications: {
        ...fixtureClassifications,
        generated_fixture: 'durable',
      },
    });
    const snapshot = await source.openSnapshot();
    const table = snapshot.inventory.tables.find(
      (table) => table.name === 'generated_fixture',
    )!;
    assert.equal(
      (
        table.columns.find((column) => column.name === 'discount_source') as {
          generated?: string;
        }
      ).generated,
      'virtual',
    );
    assert.equal(
      (
        table.columns.find(
          (column) => column.name === 'current_referral_discount_paisa',
        ) as { generated?: string }
      ).generated,
      'virtual',
    );
    assert.equal(
      (
        table.columns.find((column) => column.name === 'saved_split') as {
          generated?: string;
        }
      ).generated,
      'stored',
    );
    const rows = [];
    for await (const row of snapshot.rows(table)) rows.push(row);
    const at = (name: string) =>
      table.columns.findIndex((column) => column.name === name);
    assert.deepEqual(
      rows.map((row) => row[at('commission_bps')]),
      [
        { type: 'integer', value: '1200' },
        { type: 'integer', value: '900' },
      ],
    );
    assert.deepEqual(
      rows.map((row) => row[at('discount_source')]),
      [
        { type: 'text', value: 'promo' },
        { type: 'text', value: 'referral' },
      ],
    );
    assert.deepEqual(
      rows.map((row) => row[at('current_referral_discount_paisa')]),
      [
        { type: 'integer', value: '0' },
        { type: 'integer', value: '90' },
      ],
    );
    assert.ok(
      rows.every(
        (row) =>
          row[at('saved_split')].type === 'integer' &&
          (row[at('saved_split')] as { value: string }).value === '10000',
      ),
    );
    await snapshot.close();
    const chunks = [];
    for await (const bytes of preparePortableTransfer(source, {
      passphrase: 'fictional-generated-passphrase',
    }))
      chunks.push(bytes);
    const inspected = await inspectPortableTransfer(
      Buffer.concat(chunks),
      'fictional-generated-passphrase',
    );
    assert.deepEqual(
      inspected.inventory.tables.find(
        (table) => table.name === 'generated_fixture',
      )?.columns,
      table.columns,
    );
    assert.deepEqual(
      f.sqlite.prepare('SELECT * FROM generated_fixture ORDER BY id').all(),
      before,
      'Export never changes saved terms or generated values',
    );
  } finally {
    f.dispose();
  }
});

void test('trusted application media is hashed and archived alongside uploads without exempting missing files', async () => {
  const f = fixture();
  try {
    f.sqlite.exec(
      "CREATE TABLE homepage_hero_media(id TEXT PRIMARY KEY,object_key TEXT);INSERT INTO homepage_hero_media VALUES ('system-fictional','public/homepage/built-in.webp')",
    );
    let bytes = new Uint8Array([8, 9, 10]);
    const metadata = {
      namespace: 'public',
      key: 'public/homepage/built-in.webp',
      size: 3,
      contentType: 'image/webp',
      httpMetadata: { contentType: 'image/webp' },
      customMetadata: { portabilitySource: 'application-static' },
    };
    const applicationMedia = [
      {
        metadata,
        async open() {
          return {
            ...metadata,
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes.slice());
                controller.close();
              },
            }),
          };
        },
      },
    ];
    const source = createSqlTransferSource(f.db, f.bucket, {
      installationId: 'application-media-fixture',
      release: 'fictional',
      keyIds: [],
      tableClassifications: fixtureClassifications,
      applicationMedia,
    } as Parameters<typeof createSqlTransferSource>[2]);
    const chunks = [];
    for await (const chunk of preparePortableTransfer(source, {
      passphrase: 'fictional-application-media-passphrase',
    }))
      chunks.push(chunk);
    const inspected = await inspectPortableTransfer(
      Buffer.concat(chunks),
      'fictional-application-media-passphrase',
    );
    assert.equal(inspected.totalObjects, f.stored.size + 1);
    assert.equal(
      inspected.totalObjectBytes,
      [...f.stored.values()].reduce((sum, item) => sum + item.bytes.length, 0) +
        3,
    );
    const snapshot = await source.openSnapshot();
    await consume(snapshot);
    bytes = new Uint8Array([9, 9, 10]);
    assert.equal(
      await snapshot.verifyUnchanged(),
      false,
      'A changed built-in file invalidates the snapshot',
    );
    await snapshot.close();
    bytes = new Uint8Array([8, 9, 10]);
    const collision = createSqlTransferSource(f.db, f.bucket, {
      installationId: 'collision',
      release: 'fictional',
      keyIds: [],
      tableClassifications: fixtureClassifications,
      applicationMedia: [
        {
          ...applicationMedia[0],
          metadata: { ...metadata, key: 'public/catalogue/एक.webp' },
        },
      ],
    } as Parameters<typeof createSqlTransferSource>[2]);
    await assert.rejects(
      () => collision.openSnapshot(),
      /collision|duplicate|public/i,
    );
    const absent = createSqlTransferSource(f.db, f.bucket, {
      installationId: 'absent',
      release: 'fictional',
      keyIds: [],
      tableClassifications: fixtureClassifications,
      applicationMedia: [
        {
          ...applicationMedia[0],
          async open() {
            throw Error('Built-in asset is missing');
          },
        },
      ],
    } as Parameters<typeof createSqlTransferSource>[2]);
    await assert.rejects(() => absent.openSnapshot(), /missing/i);
  } finally {
    f.dispose();
  }
});

void test('restored built-in collision readers close when the static file fails or a request is aborted', async () => {
  for (const abort of [false, true]) {
    const f = fixture(),
      controller = new AbortController(),
      key = 'public/homepage/cleanup.webp';
    let cancelled = 0;
    const metadata = {
      namespace: 'public',
      key,
      size: 1,
      contentType: 'image/webp',
      httpMetadata: { contentType: 'image/webp' },
      customMetadata: { portabilitySource: 'application-static' },
    };
    f.stored.set(key, {
      bytes: new Uint8Array([1]),
      httpMetadata: metadata.httpMetadata,
      customMetadata: metadata.customMetadata,
    });
    let notifyStarted!: () => void,
      streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const get = f.bucket.get.bind(f.bucket);
    const bucket = {
      ...f.bucket,
      async get(name: string) {
        if (name !== key) return get(name);
        return {
          ...metadata,
          body: new ReadableStream<Uint8Array>({
            start(value) {
              streamController = value;
            },
            pull() {
              notifyStarted();
            },
            cancel() {
              cancelled++;
            },
          }),
        };
      },
    } as unknown as R2Bucket;
    const applicationMedia = [
      {
        metadata,
        async open() {
          if (!abort) throw Error('Static file unavailable');
          return {
            ...metadata,
            body: new ReadableStream<Uint8Array>({
              start(value) {
                value.enqueue(new Uint8Array([1]));
                value.close();
              },
            }),
          };
        },
      },
    ];
    const source = createSqlTransferSource(f.db, bucket, {
      installationId: 'cleanup',
      release: 'fictional',
      keyIds: [],
      tableClassifications: fixtureClassifications,
      applicationMedia,
      signal: controller.signal,
    });
    try {
      const opening = source.openSnapshot();
      if (abort) {
        await started;
        controller.abort();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await assert.rejects(
            () =>
              Promise.race([
                opening,
                new Promise<never>((_, reject) => {
                  timeout = setTimeout(
                    () => reject(Error('reader did not cancel')),
                    1000,
                  );
                }),
              ]),
            /closed|cancelled/,
          );
        } finally {
          clearTimeout(timeout);
        }
      } else await assert.rejects(() => opening, /Static file unavailable/);
      assert.equal(
        cancelled,
        1,
        'The already opened stored body is cancelled exactly once',
      );
    } finally {
      try {
        streamController?.close();
      } catch {
        /* may already be cancelled */
      }
      f.dispose();
    }
  }
});

void test('provider-owned metadata is explicitly inventoried without reading or copying it', async () => {
  const f = fixture();
  try {
    const before = await f.source.openSnapshot();
    const fingerprint = before.inventory.schemaFingerprint;
    await before.close();
    f.sqlite.exec(
      "CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY,value BLOB);INSERT INTO _cf_METADATA VALUES(2,X'010203')",
    );
    const db = {
      prepare(sql: string) {
        assert.ok(
          !/\b(?:FROM\s+|table_xinfo\()\s*"?_cf_METADATA\b/i.test(sql),
          'D1 provider metadata cannot be queried',
        );
        return f.db.prepare(sql);
      },
    } as D1Database;
    const source = createSqlTransferSource(db, f.bucket, {
      installationId: 'provider-fixture',
      release: 'fictional',
      keyIds: [],
      tableClassifications: fixtureClassifications,
    });
    const snapshot = await source.openSnapshot();
    const inventory = snapshot.inventory as typeof snapshot.inventory & {
      providerManagedTables?: unknown;
    };
    assert.ok(inventory.discoveredTables.includes('_cf_METADATA'));
    assert.deepEqual(inventory.providerManagedTables, [
      { name: '_cf_METADATA', reason: 'provider-internal' },
    ]);
    assert.ok(!inventory.tables.some((table) => table.name === '_cf_METADATA'));
    assert.equal(
      inventory.schemaFingerprint,
      fingerprint,
      'Provider internals cannot bind the application to the old host',
    );
    await consume(snapshot);
    f.sqlite
      .prepare('UPDATE _cf_METADATA SET value=?')
      .run(new Uint8Array([4, 5, 6]));
    assert.equal(await snapshot.verifyUnchanged(), true);
    await snapshot.close();
    const chunks = [];
    for await (const bytes of preparePortableTransfer(source, {
      passphrase: 'fictional-provider-passphrase',
    }))
      chunks.push(bytes);
    const inspected = await inspectPortableTransfer(
      Buffer.concat(chunks),
      'fictional-provider-passphrase',
    );
    assert.deepEqual(
      (inspected.inventory as typeof inventory).providerManagedTables,
      inventory.providerManagedTables,
    );
    assert.ok(
      inspected.warnings.some(
        (warning) =>
          warning.includes('_cf_METADATA') && warning.includes('not copied'),
      ),
    );
  } finally {
    f.dispose();
  }
});

void test('R2 optional HTTP fields may be absent while unsupported metadata still blocks backup', async () => {
  const f = fixture();
  try {
    const wrap = (extra: Record<string, unknown>, custom = false) => {
      const shape = (object: unknown) => {
        const value = object as {
          httpMetadata: Record<string, unknown>;
          customMetadata: Record<string, unknown>;
        };
        return {
          ...value,
          ...(custom
            ? { customMetadata: { ...value.customMetadata, ...extra } }
            : { httpMetadata: { ...value.httpMetadata, ...extra } }),
        };
      };
      return {
        ...f.bucket,
        async list(options: Parameters<typeof f.bucket.list>[0]) {
          const result = await f.bucket.list(options);
          return { ...result, objects: result.objects.map(shape) };
        },
        async get(key: string) {
          const value = await f.bucket.get(key);
          return value ? shape(value) : null;
        },
      } as unknown as R2Bucket;
    };
    const options = {
      installationId: 'r2-metadata',
      release: 'fictional',
      keyIds: [],
      tableClassifications: fixtureClassifications,
    };
    const source = createSqlTransferSource(
      f.db,
      wrap({
        contentLanguage: undefined,
        contentDisposition: undefined,
        contentEncoding: undefined,
        cacheExpiry: undefined,
      }),
      options,
    );
    const snapshot = await source.openSnapshot();
    await consume(snapshot);
    assert.equal(await snapshot.verifyUnchanged(), true);
    await snapshot.close();
    for (const bucket of [
      wrap({ unreviewed: undefined }),
      wrap({ cacheExpiry: null }),
      wrap({ custom: undefined }, true),
    ])
      await assert.rejects(
        () => createSqlTransferSource(f.db, bucket, options).openSnapshot(),
        /metadata/i,
      );
  } finally {
    f.dispose();
  }
});

void test('all nine upload-reference tables remain checked within D1 compound-query limits', async () => {
  const f = fixture();
  try {
    const names = [
      'category_media',
      'homepage_hero_media',
      'product_media',
      'return_evidence',
      'review_photos',
      'rider_applications',
      'rider_reports',
      'seller_documents',
      'seller_profile_media',
    ];
    for (const name of names) {
      f.sqlite.exec(
        'CREATE TABLE ' + name + '(id TEXT PRIMARY KEY,object_key TEXT)',
      );
      f.sqlite
        .prepare('INSERT INTO ' + name + ' VALUES (?,?)')
        .run('fictional', 'private/evidence/account-1.bin');
    }
    for (let index = 0; index < 42; index++) {
      const key =
        'private/evidence/merge-' + String(index).padStart(3, '0') + '.bin';
      f.stored.set(key, {
        bytes: new Uint8Array([index]),
        httpMetadata: {},
        customMetadata: {},
      });
      f.sqlite
        .prepare('INSERT INTO ' + names[index % 2] + ' VALUES (?,?)')
        .run('extra-' + index, key);
    }
    const lateKey = 'private/evidence/नेपाल-final.bin';
    f.stored.set(lateKey, {
      bytes: new Uint8Array([255]),
      httpMetadata: {},
      customMetadata: {},
    });
    f.sqlite
      .prepare('INSERT INTO ' + names[0] + ' VALUES (?,?)')
      .run('late-only', lateKey);
    const db = {
      prepare(sql: string) {
        assert.ok(
          (sql.match(/UNION ALL/g)?.length ?? 0) < 5,
          'D1 limits compound SELECT statements',
        );
        return f.db.prepare(sql);
      },
    } as D1Database;
    const source = createSqlTransferSource(db, f.bucket, {
      installationId: 'd1-reference-limit',
      release: 'fictional',
      keyIds: [],
      tableClassifications: fixtureClassifications,
    });
    const snapshot = await source.openSnapshot();
    await consume(snapshot);
    assert.equal(await snapshot.verifyUnchanged(), true);
    await snapshot.close();
    f.sqlite
      .prepare('UPDATE ' + names[0] + ' SET object_key=? WHERE id=?')
      .run('private/zzzz-missing-late.bin', 'late-only');
    await assert.rejects(
      () => source.openSnapshot(),
      /missing.*upload|reference.*missing/i,
    );
    f.sqlite
      .prepare('UPDATE ' + names[0] + ' SET object_key=? WHERE id=?')
      .run(lateKey, 'late-only');
    for (const name of names) {
      f.sqlite
        .prepare('UPDATE ' + name + ' SET object_key=?')
        .run('private/missing-fixture.bin');
      await assert.rejects(
        () => source.openSnapshot(),
        /missing.*upload|reference.*missing/i,
      );
      f.sqlite
        .prepare('UPDATE ' + name + ' SET object_key=?')
        .run('private/evidence/account-1.bin');
    }
  } finally {
    f.dispose();
  }
});

void test('an application trigger named like provider metadata remains part of the schema fingerprint', async () => {
  const f = fixture();
  try {
    const before = await f.source.openSnapshot(),
      fingerprint = before.inventory.schemaFingerprint;
    await before.close();
    f.sqlite.exec(
      'CREATE TRIGGER _cf_METADATA AFTER INSERT ON fixture_records BEGIN SELECT 1; END',
    );
    const after = await f.source.openSnapshot();
    assert.notEqual(after.inventory.schemaFingerprint, fingerprint);
    await after.close();
  } finally {
    f.dispose();
  }
});

void test('media reservations permit absent bytes only while their exact references remain incomplete', async () => {
  const f = fixture();
  const baseKey = 'private/evidence/account-1.bin';
  const absentKey = 'private/evidence/absent.bin';
  const interruptedKey = 'private/product-intakes/draft-1/नेपाल.bin';
  const bytes = new Uint8Array([0, 4, 255, 15]);
  const httpMetadata = { contentType: 'image/png', cacheControl: 'private' };
  const customMetadata = { draftId: 'draft-1', uploadId: 'interrupted' };
  try {
    f.sqlite.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE product_media(id TEXT PRIMARY KEY, object_key TEXT NOT NULL);
      CREATE TABLE product_intake_media(id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL CHECK(state IN ('uploading', 'ready')), completed_at INTEGER,
        CHECK((state='ready')=(completed_at IS NOT NULL)));
      CREATE TABLE product_legacy_media_copies(id TEXT PRIMARY KEY,
        source_media_id TEXT NOT NULL REFERENCES product_media(id),
        source_object_key TEXT NOT NULL,
        intake_media_id TEXT NOT NULL REFERENCES product_intake_media(id));
      CREATE TABLE manual_payment_claim_files(id TEXT PRIMARY KEY, object_key TEXT NOT NULL);
      CREATE TABLE finance_evidence_intents(id TEXT PRIMARY KEY, object_key TEXT NOT NULL);
      CREATE TABLE finance_evidence_files(id TEXT PRIMARY KEY REFERENCES finance_evidence_intents(id));
      CREATE TABLE managed_clearance_evidence_intents(id TEXT PRIMARY KEY, object_key TEXT NOT NULL);
      CREATE TABLE managed_clearance_evidence_files(id TEXT PRIMARY KEY REFERENCES managed_clearance_evidence_intents(id));
      CREATE TABLE seller_application_draft_uploads(id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('uploading', 'ready', 'deleting')));
    `);
    f.sqlite.prepare("INSERT INTO product_media VALUES ('original', ?)").run(baseKey);
    f.sqlite.prepare('INSERT INTO product_intake_media VALUES (?,?,?,?)').run('ready', baseKey, 'ready', 10);
    f.sqlite.prepare('INSERT INTO product_intake_media VALUES (?,?,?,NULL)').run('missing', absentKey, 'uploading');
    f.sqlite.prepare('INSERT INTO product_intake_media VALUES (?,?,?,NULL)').run('interrupted', interruptedKey, 'uploading');
    f.sqlite.prepare("INSERT INTO product_legacy_media_copies VALUES ('copy', 'original', ?, 'ready')").run(baseKey);
    f.sqlite.prepare("INSERT INTO manual_payment_claim_files VALUES ('claim', ?)").run(baseKey);
    f.sqlite.prepare("INSERT INTO finance_evidence_intents VALUES ('finance', ?)").run(absentKey);
    f.sqlite.prepare("INSERT INTO managed_clearance_evidence_intents VALUES ('managed', ?)").run(absentKey);
    f.sqlite.prepare("INSERT INTO seller_application_draft_uploads VALUES ('start', ?, 'uploading')").run(absentKey);
    f.sqlite.prepare("INSERT INTO seller_application_draft_uploads VALUES ('cleanup', ?, 'deleting')").run('private/seller-drafts/user/cleanup');
    f.stored.set(interruptedKey, { bytes, httpMetadata, customMetadata });

    const source = createSqlTransferSource(f.db, f.bucket, {
      installationId: 'media-reference-closure',
      release: 'fictional',
      keyIds: [],
      tableClassifications: {
        ...fixtureClassifications,
        product_intake_media: 'durable',
        product_legacy_media_copies: 'durable',
        manual_payment_claim_files: 'durable',
        finance_evidence_intents: 'durable',
        finance_evidence_files: 'durable',
        managed_clearance_evidence_intents: 'durable',
        managed_clearance_evidence_files: 'durable',
      },
    });
    const snapshot = await source.openSnapshot();
    let sawInterrupted = false;
    try {
      const intake = snapshot.inventory.tables.find((table) => table.name === 'product_intake_media')!;
      const keyColumn = intake.columns.findIndex((column) => column.name === 'object_key');
      const stateColumn = intake.columns.findIndex((column) => column.name === 'state');
      const reservationKeys: string[] = [];
      for await (const row of snapshot.rows(intake)) {
        const state = row[stateColumn];
        const key = row[keyColumn];
        if (state.type === 'text' && state.value === 'uploading' && key.type === 'text')
          reservationKeys.push(key.value);
      }
      assert.deepEqual(reservationKeys.sort(), [absentKey, interruptedKey].sort());
      for (const namespace of snapshot.inventory.namespaces) {
        for await (const object of snapshot.objects(namespace)) {
          const chunks = [];
          for await (const chunk of object.bytes) chunks.push(chunk);
          assert.notEqual(object.key, absentKey);
          if (object.key !== interruptedKey) continue;
          sawInterrupted = true;
          assert.equal(namespace.id, 'private');
          assert.deepEqual({ ...object.httpMetadata }, httpMetadata);
          assert.deepEqual({ ...object.customMetadata }, customMetadata);
          assert.deepEqual(Buffer.concat(chunks), Buffer.from(bytes));
        }
      }
      assert.equal(sawInterrupted, true);
    } finally {
      await snapshot.close();
    }

    const missing = /missing.*upload|reference.*missing/i;
    // The exact-case storage key is required even when optional references share it.
    f.stored.set(absentKey.toUpperCase(), { bytes, httpMetadata, customMetadata });
    for (const [apply, reset] of [
      ["INSERT INTO finance_evidence_intents VALUES (NULL, '" + absentKey + "')",
        'DELETE FROM finance_evidence_intents WHERE id IS NULL'],
      ["INSERT INTO managed_clearance_evidence_intents VALUES (NULL, '" + absentKey + "')",
        'DELETE FROM managed_clearance_evidence_intents WHERE id IS NULL'],
      ["UPDATE product_intake_media SET state='ready',completed_at=10 WHERE id='missing'",
        "UPDATE product_intake_media SET state='uploading',completed_at=NULL WHERE id='missing'"],
      ["UPDATE product_legacy_media_copies SET source_object_key='" + absentKey + "'",
        "UPDATE product_legacy_media_copies SET source_object_key='" + baseKey + "'"],
      ["UPDATE manual_payment_claim_files SET object_key='" + absentKey + "'",
        "UPDATE manual_payment_claim_files SET object_key='" + baseKey + "'"],
      ["INSERT INTO finance_evidence_files VALUES ('finance')", 'DELETE FROM finance_evidence_files'],
      ["INSERT INTO managed_clearance_evidence_files VALUES ('managed')", 'DELETE FROM managed_clearance_evidence_files'],
      ["UPDATE seller_application_draft_uploads SET status='ready' WHERE id='start'",
        "UPDATE seller_application_draft_uploads SET status='uploading' WHERE id='start'"],
    ]) {
      f.sqlite.exec(apply);
      await assert.rejects(() => source.openSnapshot(), missing);
      f.sqlite.exec(reset);
    }
    f.sqlite.exec("UPDATE product_intake_media SET object_key='private/../unsafe' WHERE id='missing'");
    await assert.rejects(() => source.openSnapshot(), /unsafe media key/i);
    f.sqlite.prepare("UPDATE product_intake_media SET object_key=? WHERE id='missing'").run(absentKey);

    f.sqlite.exec('ALTER TABLE product_intake_media ADD COLUMN UNREVIEWED_OBJECT_KEY TEXT');
    await assert.rejects(() => source.openSnapshot(), /unreviewed storage reference/i);
  } finally {
    f.dispose();
  }
});

void test('a stored media key without the leading BOM cannot satisfy the exact reference', async () => {
  const f = fixture();
  const existingKey = 'private/evidence/account-1.bin';
  const exactKey = '\uFEFF' + existingKey;
  try {
    f.sqlite.exec(
      'CREATE TABLE product_media(id TEXT PRIMARY KEY, object_key TEXT NOT NULL)',
    );
    f.sqlite
      .prepare('INSERT INTO product_media VALUES (?, ?)')
      .run('original', exactKey);
    const source = createSqlTransferSource(f.db, f.bucket, {
      installationId: 'media-reference-bom',
      release: 'fictional',
      keyIds: [],
      tableClassifications: fixtureClassifications,
    });
    await assert.rejects(
      () => source.openSnapshot(),
      /reference.*missing/i,
    );

    f.stored.set(exactKey, f.stored.get(existingKey)!);
    const snapshot = await source.openSnapshot();
    try {
      const table = snapshot.inventory.tables.find(
        (entry) => entry.name === 'product_media',
      )!;
      const keyColumn = table.columns.findIndex(
        (column) => column.name === 'object_key',
      );
      const keys = [];
      for await (const row of snapshot.rows(table)) keys.push(row[keyColumn]);
      assert.deepEqual(keys, [{ type: 'text', value: exactKey }]);
    } finally {
      await snapshot.close();
    }
  } finally {
    f.dispose();
  }
});
