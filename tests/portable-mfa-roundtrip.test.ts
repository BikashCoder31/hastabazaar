import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import {readFileSync} from 'node:fs';
import type { SQLInputValue } from 'node:sqlite';
import { securityDatabase } from './helpers/security-database';
import {
  createSqlTransferSource,
  type ApplicationMedia,
} from '../lib/portability/d1-source';
import { decryptPortableFrames } from '../lib/portability/crypto';
import {
  exportKeyRecovery,
  inspectKeyRecovery,
  inspectPortableTransfer,
  portableRowsHash,
  preparePortableTransfer,
  restorePortableTransfer,
} from '../lib/portability/transfer';
import type {
  PortableObjectMetadata,
  PortableRestoreManifest,
  PortableRestoreTarget,
  PortableTable,
} from '../lib/portability/types';
import {
  canonicalJson,
  encodePortableValue,
  type PortableRow,
  type PortableValue,
} from '../lib/portability/values';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import {
  recoveryCodeHash,
  securityKeyId,
  totpAtCounter,
} from '../lib/security/crypto';
import {
  createHostedSessionForUser,
  findCredentialByEmail,
  getHostedIdentity,
  hostedSessionHash,
  passwordRecord,
  verifyPassword,
} from '../lib/auth/hosted-session';

const NOW = 1_800_000_000_000;
const PASSPHRASE = 'fictional isolated transfer recovery passphrase';
const staff = [
  {
    id: 'roundtrip-owner',
    subject: 'fixture-subject:owner',
    role: 'super_admin',
    email: 'owner@fixture.test',
    password: 'Fictional owner fixture password only',
  },
  {
    id: 'roundtrip-admin',
    subject: 'fixture-subject:admin',
    role: 'admin',
    email: 'admin@fixture.test',
    password: 'Fictional admin fixture password only',
  },
] as const;

/** Explicit disposable fixture schema, not a migration or an application import tool. */
function newFixtureDatabase() {
  const fixture = securityDatabase(); // This helper opens ':memory:' only.
  fixture.sqlite.exec(`CREATE TABLE saved_commission_terms(
    id TEXT PRIMARY KEY,company_bps INTEGER NOT NULL,maker_bps INTEGER NOT NULL,
    gross TEXT NOT NULL,company_amount TEXT NOT NULL,maker_amount TEXT NOT NULL,
    total_share_bps INTEGER GENERATED ALWAYS AS (company_bps+maker_bps) STORED);
    CREATE TABLE accepted_agreements(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),snapshot TEXT NOT NULL,accepted_at INTEGER NOT NULL);
    CREATE TABLE orders(id TEXT PRIMARY KEY,referral_discount_paisa INTEGER NOT NULL,promo_discount_paisa INTEGER NOT NULL,
      current_discount_paisa INTEGER,current_promo_discount_paisa INTEGER NOT NULL,
      buyer_platform_fee_paisa INTEGER NOT NULL DEFAULT 1000,
      discount_source VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN promo_discount_paisa>0 THEN 'promo' WHEN referral_discount_paisa>0 THEN 'referral' ELSE 'none' END) VIRTUAL,
      current_referral_discount_paisa INTEGER GENERATED ALWAYS AS
       (CASE WHEN current_discount_paisa IS NULL THEN referral_discount_paisa ELSE current_discount_paisa-current_promo_discount_paisa END) VIRTUAL);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),
      referral_discount_paisa INTEGER NOT NULL,promo_discount_paisa INTEGER NOT NULL,
      discount_source VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN promo_discount_paisa>0 THEN 'promo' WHEN referral_discount_paisa>0 THEN 'referral' ELSE 'none' END) VIRTUAL);`);
  for (const name of ['0044_business_configuration.sql','0073_marketplace_fee_waivers.sql','0074_customer_service_fee_waivers.sql'])
    fixture.sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  // The independently prepared empty destination has schema only. Source rows are explicit below.
  fixture.sqlite.exec('DELETE FROM marketplace_fee_waiver_control; DELETE FROM customer_fee_waiver_control');
  return fixture;
}
type FixtureDatabase = ReturnType<typeof newFixtureDatabase>;
type MediaRecord = {
  bytes: Uint8Array;
  httpMetadata: Record<string, string>;
  customMetadata: Record<string, string>;
};

function mediaBucket(records: Map<string, MediaRecord>): R2Bucket {
  return {
    async list() {
      return {
        truncated: false,
        objects: [...records]
          .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
          .map(([key, record]) => ({
            key,
            size: record.bytes.length,
            httpMetadata: record.httpMetadata,
            customMetadata: record.customMetadata,
          })),
      };
    },
    async get(key: string) {
      const record = records.get(key);
      if (!record) return null;
      return {
        key,
        size: record.bytes.length,
        httpMetadata: record.httpMetadata,
        customMetadata: record.customMetadata,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(record.bytes.slice());
            controller.close();
          },
        }),
      };
    },
  } as unknown as R2Bucket;
}

function trustedIdentifier(name: string): string {
  assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/);
  return '"' + name + '"';
}
type TrustedTable = {
  name: string;
  columns: string[];
  writableColumns: string[];
  generatedColumns: Map<string, 'virtual' | 'stored'>;
  primaryKey: string[];
};
function localTableInventory(
  database: FixtureDatabase,
): Map<string, TrustedTable> {
  const tables = database.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  return new Map(
    tables.map(({ name }) => {
      const columns = database.sqlite
        .prepare('PRAGMA table_xinfo(' + trustedIdentifier(name) + ')')
        .all() as { name: string; cid: number; pk: number; hidden: number }[];
      assert.ok(columns.every((column) => [0, 2, 3].includes(column.hidden)));
      return [
        name,
        {
          name,
          columns: columns
            .sort((a, b) => a.cid - b.cid)
            .map((column) => column.name),
          writableColumns: columns
            .filter((column) => column.hidden === 0)
            .map((column) => column.name),
          generatedColumns: new Map(
            columns
              .filter((column) => column.hidden === 2 || column.hidden === 3)
              .map((column) => [
                column.name,
                column.hidden === 2
                  ? ('virtual' as const)
                  : ('stored' as const),
              ]),
          ),
          primaryKey: columns
            .filter((column) => column.pk > 0)
            .sort((a, b) => a.pk - b.pk)
            .map((column) => column.name),
        },
      ];
    }),
  );
}

/** Independent target reads select actual database values, never the import buffers. */
function actualRows(
  database: FixtureDatabase,
  table: TrustedTable,
): PortableRow[] {
  const order = [
    ...table.primaryKey,
    ...table.columns.filter((column) => !table.primaryKey.includes(column)),
  ]
    .flatMap((column) => [
      'typeof(' + trustedIdentifier(column) + ') COLLATE BINARY',
      'CAST(' + trustedIdentifier(column) + ' AS BLOB)',
    ])
    .join(',');
  const statement = database.sqlite.prepare(
    'SELECT ' +
      table.columns.map(trustedIdentifier).join(',') +
      ' FROM ' +
      trustedIdentifier(table.name) +
      ' ORDER BY ' +
      order,
  );
  statement.setReadBigInts(true);
  return statement
    .all()
    .map((row) =>
      table.columns.map((column) => encodePortableValue(row[column])),
    );
}

function sqlValue(value: PortableValue): SQLInputValue {
  switch (value.type) {
    case 'null':
      return null;
    case 'integer':
      return BigInt(value.value);
    case 'real':
      return Number(value.value);
    case 'bytes':
      return Buffer.from(value.value, 'base64');
    default:
      return value.value;
  }
}
function headers(token: string): Headers {
  return new Headers({ cookie: 'hastabazaar_session=' + token });
}
async function collect(input: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const fixtureChunks: Uint8Array[] = [];
  for await (const chunk of input) fixtureChunks.push(chunk);
  return Buffer.concat(fixtureChunks); // Deliberately small fictional fixture only.
}

async function emptyFixtureTarget(
  database: FixtureDatabase,
  records: Map<string, MediaRecord>,
  restoredMetadata: Map<string, PortableObjectMetadata>,
  recoveredKeyIds: string[],
  applicationMedia: readonly ApplicationMedia[],
) {
  // Compatibility is independently derived from the destination's own schema.
  const empty = await createSqlTransferSource(
    database.db,
    mediaBucket(records),
    {
      installationId: 'disposable-destination',
      release: 'fixture-security-portability-v1',
      keyIds: recoveredKeyIds,
      tableClassifications: {
        saved_commission_terms: 'durable',
        accepted_agreements: 'durable',
      },
      applicationMedia,
    },
  ).openSnapshot();
  const fingerprint = empty.inventory.schemaFingerprint;
  await empty.close();
  const trusted = localTableInventory(database);
  let inTransaction = false;
  let verified = false;
  let currentObject: PortableObjectMetadata | null = null;
  let objectChunks: Uint8Array[] = [];
  const insertedColumns = new Map<string, string[]>();
  const pendingCustomerEvidence: (() => void)[] = [];
  function matchingTable(table: PortableTable): TrustedTable {
    const actual = trusted.get(table.name);
    assert.ok(
      actual,
      'uploaded tables must exist in the independently prepared destination',
    );
    assert.deepEqual(
      table.columns.map((column) => column.name),
      actual.columns,
    );
    for (const column of table.columns)
      assert.equal(column.generated, actual.generatedColumns.get(column.name));
    return actual;
  }
  function verifyMedia(expected: PortableRestoreManifest): void {
    for (const namespace of expected.media) {
      const hash = createHash('sha256');
      let objects = 0;
      let bytes = 0;
      const ordered = [...restoredMetadata.values()]
        .filter((metadata) => metadata.namespace === namespace.id)
        .sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
      for (const metadata of ordered) {
        const stored = records.get(metadata.key);
        assert.ok(stored);
        assert.equal(stored.bytes.length, metadata.size);
        assert.deepEqual(stored.customMetadata, metadata.customMetadata);
        assert.deepEqual(stored.httpMetadata, metadata.httpMetadata);
        const entry = {
          object: metadata,
          sha256: createHash('sha256').update(stored.bytes).digest('hex'),
        };
        const serialized = Buffer.from(canonicalJson(entry));
        hash.update(String(serialized.length) + ':');
        hash.update(serialized);
        objects++;
        bytes += stored.bytes.length;
      }
      assert.equal(objects, namespace.objects);
      assert.equal(bytes, namespace.bytes);
      assert.equal(hash.digest('hex'), namespace.sha256);
    }
  }
  const target: PortableRestoreTarget = {
    async preflight() {
      return {
        empty:
          [...trusted.values()].every(
            (table) =>
              Number(
                database.sqlite
                  .prepare(
                    'SELECT COUNT(*) AS n FROM ' +
                      trustedIdentifier(table.name),
                  )
                  .get()!.n,
              ) === 0,
          ) && records.size === 0,
        schemaFingerprint: fingerprint,
        applicationCompatible: true,
        availableKeyIds: recoveredKeyIds,
        dispatchPaused: true,
      };
    },
    async begin() {
      database.sqlite.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;');
      inTransaction = true;
      return {
        async writeRows(table, rows) {
          const actual = matchingTable(table);
          // Writable columns come from destination xinfo, never uploaded flags.
          // Generated values are independently recomputed and checked below.
          insertedColumns.set(actual.name, [...actual.writableColumns]);
          const writableIndices = actual.writableColumns.map((column) =>
            actual.columns.indexOf(column),
          );
          const statement = database.sqlite.prepare(
            'INSERT INTO ' +
              trustedIdentifier(actual.name) +
              '(' +
              actual.writableColumns.map(trustedIdentifier).join(',') +
              ') VALUES (' +
              actual.writableColumns.map(() => '?').join(',') +
              ')',
          );
          for (const row of rows) {
            const write = () => statement.run(
              ...writableIndices.map((index) => sqlValue(row[index])),
            );
            // The transport orders table frames by name. This independent target
            // defers customer evidence until original orders are present so the
            // real match-order trigger can validate each restored financial fact.
            if (actual.name === 'order_customer_service_fees') pendingCustomerEvidence.push(write);
            else write();
          }
        },
        async beginObject(metadata) {
          assert.equal(currentObject, null);
          currentObject = structuredClone(metadata);
          objectChunks = [];
        },
        async writeObjectChunk(bytes) {
          assert.ok(currentObject);
          objectChunks.push(bytes.slice());
        },
        async endObject(expectedHash) {
          assert.ok(currentObject);
          const bytes = Buffer.concat(objectChunks);
          assert.equal(
            createHash('sha256').update(bytes).digest('hex'),
            expectedHash,
          );
          records.set(currentObject.key, {
            bytes,
            httpMetadata: structuredClone(currentObject.httpMetadata),
            customMetadata: structuredClone(currentObject.customMetadata),
          });
          restoredMetadata.set(currentObject.key, currentObject);
          currentObject = null;
          objectChunks = [];
        },
        async verify(_inspection, expected) {
          for (const write of pendingCustomerEvidence.splice(0)) write();
          assert.deepEqual(
            [
              ...expected.tableRecords.map((table) => table.name),
              ...expected.omittedTables,
            ].sort(),
            [...trusted.keys()].sort(),
          );
          for (const manifest of expected.tableRecords) {
            const table = trusted.get(manifest.name);
            assert.ok(table);
            const rows = actualRows(database, table);
            assert.equal(rows.length, manifest.rows, manifest.name);
            assert.equal(
              portableRowsHash(rows),
              manifest.sha256,
              manifest.name,
            );
          }
          for (const name of expected.omittedTables)
            assert.equal(
              Number(
                database.sqlite
                  .prepare(
                    'SELECT COUNT(*) AS n FROM ' + trustedIdentifier(name),
                  )
                  .get()!.n,
              ),
              0,
              name,
            );
          assert.deepEqual(
            database.sqlite.prepare('PRAGMA foreign_key_check').all(),
            [],
          );
          verifyMedia(expected);
          verified = true;
          return true;
        },
        async commit() {
          assert.equal(verified, true);
          database.sqlite.exec('COMMIT');
          inTransaction = false;
        },
        async rollback() {
          if (inTransaction) database.sqlite.exec('ROLLBACK');
          inTransaction = false;
          records.clear();
          restoredMetadata.clear();
        },
      };
    },
  };
  return { target, wasVerified: () => verified, insertedColumns };
}

void test('real enrolled Super Admin/Admin MFA and saved financial history survive an encrypted empty-target fixture transfer', async () => {
  const source = newFixtureDatabase();
  const destination = newFixtureDatabase();
  try {
    const keyBytes = Buffer.from(randomBytes(32));
    const key = keyBytes.toString('base64url');
    const keyId = securityKeyId(key);
    const sourceStore = new SecurityStore(source.db, key);
    const sourceMfa = new MfaService(sourceStore);
    const credentials = new Map<string, { hash: string; salt: string }>();
    const oldTokens = new Map<string, string>();
    const enrollments = new Map<
      string,
      { secret: string; codes: string[]; oldHash: string }
    >();
    for (const account of staff) {
      source.sqlite
        .prepare('INSERT INTO users VALUES (?,?,?,?,?,?)')
        .run(
          account.id,
          account.subject,
          account.email,
          'Fictional ' + account.role,
          'active',
          NOW,
        );
      source.sqlite
        .prepare('INSERT INTO user_roles VALUES (?,?)')
        .run(account.id, account.role);
      source.sqlite
        .prepare('INSERT INTO account_email_verifications VALUES (?,?,?)')
        .run(account.id, account.email, NOW);
      const credential = await passwordRecord(account.password);
      credentials.set(account.id, credential);
      source.sqlite
        .prepare('INSERT INTO user_credentials VALUES (?,?,?,?,?,?)')
        .run(account.id, credential.hash, credential.salt, 1, NOW, NOW);
      const token = await createHostedSessionForUser(
        source.db,
        account.id,
        NOW,
        { passwordHash: credential.hash },
      );
      oldTokens.set(account.id, token);
    }
    await sourceStore.initialize(
      staff.map((account) => account.id),
      NOW,
    );
    for (const account of staff) {
      const oldHash = hostedSessionHash(headers(oldTokens.get(account.id)!))!;
      const setup = await sourceMfa.beginSetup({
        userId: account.id,
        sessionHash: oldHash,
        now: NOW,
      });
      const confirmed = await sourceMfa.confirmSetup({
        userId: account.id,
        sessionHash: oldHash,
        setupId: setup.setupId,
        code: totpAtCounter(setup.secret, Math.floor(NOW / 30_000)),
        now: NOW,
      });
      await sourceMfa.activateSetup({
        userId: account.id,
        sessionHash: oldHash,
        setupId: setup.setupId,
        recoverySaved: true,
        passwordVerifiedAt: NOW,
        now: NOW,
      });
      enrollments.set(account.id, {
        secret: setup.secret,
        codes: confirmed.codes,
        oldHash,
      });
    }
    const owner = staff[0];
    const ownerEnrollment = enrollments.get(owner.id)!;
    await sourceMfa.verifyRecovery({
      userId: owner.id,
      sessionHash: ownerEnrollment.oldHash,
      code: ownerEnrollment.codes[0],
      passwordVerifiedAt: NOW + 1_000,
      now: NOW + 1_000,
    });
    // An abandoned password login is temporary ceremony state, never backup data.
    await createHostedSessionForUser(source.db, owner.id, NOW + 120_000, {
      passwordHash: credentials.get(owner.id)!.hash,
      securityKey: key,
      initialized: true,
    });
    assert.equal(source.sqlite.prepare("SELECT COUNT(*) AS n FROM marketplace_settings WHERE `key` LIKE 'auth-private:challenge:password:%'").get()!.n, 1);
    const accountBefore = (await sourceStore.readAccount(owner.id))!;
    assert.equal(accountBefore.value.status, 'active');
    assert.equal(accountBefore.value.recovery!.hashes.length, 9);
    source.sqlite.exec(
      "INSERT INTO saved_commission_terms(id,company_bps,maker_bps,gross,company_amount,maker_amount) VALUES ('historical-9',900,9100,'1000.00','90.00','910.00'),('current-12',1200,8800,'1000.00','120.00','880.00')",
    );
    source.sqlite
      .exec(`INSERT INTO orders(id,referral_discount_paisa,promo_discount_paisa,current_discount_paisa,current_promo_discount_paisa) VALUES
      ('order-referral-original',900,0,NULL,0),('order-referral-current',900,0,400,0),('order-promo-current',0,1200,800,800),('order-none',0,0,0,0);
      INSERT INTO order_items(id,order_id,referral_discount_paisa,promo_discount_paisa) VALUES
      ('item-referral-original','order-referral-original',450,0),('item-referral-current','order-referral-current',200,0),('item-promo-current','order-promo-current',0,600),('item-none','order-none',0,0);`);
    for (const [id,key,value] of [
      ['policy-original-nine','independent_seller_commission_bps',900],
      ['policy-current-twelve','independent_seller_commission_bps',1200],
      ['policy-managed-twelve','managed_sale_linked_platform_retention_bps',1200],
      ['policy-customer-fee','platform_service_fee_policy',{enabled:true,amountPaisa:1000}],
    ] as const) source.sqlite.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES(?,?,?,?, 'published','controlled',?,'Fictional retained published policy',?,?,?)`).run(id,key,id==='policy-current-twelve'?2:1,JSON.stringify(value),NOW-1000,owner.id,NOW-1000,id);
    for (const prefix of ['marketplace','customer']) {
      source.sqlite.prepare(`INSERT INTO ${prefix}_fee_waiver_control VALUES('default',2)`).run();
      source.sqlite.prepare(`INSERT INTO ${prefix}_fee_waiver_campaigns VALUES(?,2,?,?)`).run(prefix+'-retained',NOW-1000,NOW);
      for (const [revision,state] of [[1,'draft'],[2,'published']] as const) {
        const requestId=prefix+'-request-'+revision;
        source.sqlite.prepare(`INSERT INTO ${prefix}_fee_waiver_revisions VALUES(?,?,?,?,?,?,?,?,?,?)`).run(prefix+'-retained',revision,state,prefix+' fictional campaign','Retained original business history',NOW-1000,NOW+1000,owner.id,requestId,NOW);
        source.sqlite.prepare(`INSERT INTO ${prefix}_fee_waiver_requests VALUES(?,?,?,?,?,?)`).run(requestId,owner.id,owner.subject,JSON.stringify({type:revision===1?'create':'publish',campaignId:prefix+'-retained'}),JSON.stringify({id:prefix+'-retained',revision,state}),NOW);
      }
    }
    source.sqlite.exec(`INSERT INTO order_item_marketplace_fees VALUES('item-referral-original',900,10000,900,900,0,'marketplace-retained',2,${NOW});
      UPDATE orders SET buyer_platform_fee_paisa=0 WHERE id='order-promo-current';
      INSERT INTO order_customer_service_fees VALUES('order-promo-current',1,1000,'policy-customer-fee',1000,1000,0,'customer-retained',2,${NOW}),('order-none',1,1000,'policy-customer-fee',1000,0,1000,NULL,NULL,${NOW});`);
    source.sqlite
      .prepare('INSERT INTO accepted_agreements VALUES (?,?,?,?)')
      .run(
        'agreement-original-9',
        owner.id,
        JSON.stringify({
          companyBps: 900,
          makerBps: 9100,
          acceptedVersion: 'historical-9',
        }),
        NOW - 1000,
      );
    source.sqlite
      .prepare('INSERT INTO accepted_agreements VALUES (?,?,?,?)')
      .run(
        'agreement-current-12',
        owner.id,
        JSON.stringify({
          companyBps: 1200,
          makerBps: 8800,
          acceptedVersion: 'current-12',
        }),
        NOW,
      );
    const sourceTrusted = localTableInventory(source);
    const retainedFeeNames = ['marketplace_fee_waiver_control','marketplace_fee_waiver_campaigns','marketplace_fee_waiver_revisions','marketplace_fee_waiver_requests','order_item_marketplace_fees','customer_fee_waiver_control','customer_fee_waiver_campaigns','customer_fee_waiver_revisions','customer_fee_waiver_requests','order_customer_service_fees','business_setting_versions'];
    const retainedBusiness = (database:FixtureDatabase) => Object.fromEntries(retainedFeeNames.map(name=>[name,database.sqlite.prepare('SELECT * FROM '+trustedIdentifier(name)+' ORDER BY 1,2').all()]));
    const feeBefore = retainedBusiness(source);
    const protectedRecords = (database:FixtureDatabase) => database.sqlite.prepare("SELECT * FROM marketplace_settings WHERE `key`='auth-private:manifest:v1' OR `key` LIKE 'auth-private:account:%' ORDER BY `key`").all();
    const protectedBefore = protectedRecords(source);
    assert.equal(protectedBefore.length,3,'Real manifest and enrolled Super Admin/Admin protected records must be populated');
    const before = new Map(
      [...sourceTrusted].map(([name, table]) => [
        name,
        portableRowsHash(actualRows(source, table)),
      ]),
    );
    const originalMedia = new Map<string, MediaRecord>([
      [
        'private/evidence/identity-proof.bin',
        {
          bytes: new Uint8Array([0, 255, 1, 2]),
          httpMetadata: {
            contentType: 'application/octet-stream',
            cacheControl: 'private, no-store',
          },
          customMetadata: {
            ownerId: owner.id,
            classification: 'private-identity',
          },
        },
      ],
      [
        'public/catalogue/product.webp',
        {
          bytes: new Uint8Array([3, 4, 5]),
          httpMetadata: {
            contentType: 'image/webp',
            cacheControl: 'max-age=600',
          },
          customMetadata: { productId: 'stable-product-id' },
        },
      ],
    ]);
    const builtinKey = 'public/homepage/fixture-hero.webp';
    const builtinRecord: MediaRecord = {
      bytes: new Uint8Array([6, 7, 8, 9]),
      httpMetadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=3600',
      },
      customMetadata: {
        source: 'trusted-application-file',
        assetId: 'fixture-homepage-hero',
      },
    };
    const builtinMetadata: PortableObjectMetadata = {
      namespace: 'public',
      key: builtinKey,
      size: builtinRecord.bytes.length,
      contentType: 'image/webp',
      httpMetadata: builtinRecord.httpMetadata,
      customMetadata: builtinRecord.customMetadata,
    };
    const applicationMedia: readonly ApplicationMedia[] = [
      {
        metadata: builtinMetadata,
        async open() {
          return {
            key: builtinKey,
            size: builtinRecord.bytes.length,
            httpMetadata: builtinRecord.httpMetadata,
            customMetadata: builtinRecord.customMetadata,
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(builtinRecord.bytes.slice());
                controller.close();
              },
            }),
          };
        },
      },
    ];
    assert.equal(
      originalMedia.has(builtinKey),
      false,
      'the original built-in asset exists only in the trusted application registry',
    );
    const portableSource = createSqlTransferSource(
      source.db,
      mediaBucket(originalMedia),
      {
        installationId: 'disposable-original',
        release: 'fixture-security-portability-v1',
        keyIds: [keyId],
        tableClassifications: {
          saved_commission_terms: 'durable',
          accepted_agreements: 'durable',
        },
        applicationMedia,
      },
    );
    const archive = await collect(
      preparePortableTransfer(portableSource, {
        passphrase: PASSPHRASE,
        packageId: 'actual-mfa-fixture-transfer',
      }),
    );
    const recoveryBundle = await exportKeyRecovery(
      {
        version: 1,
        activeKeyId: keyId,
        keys: [{ id: keyId, keyBase64: keyBytes.toString('base64') }],
      },
      PASSPHRASE,
    );
    const report = await inspectPortableTransfer(archive, PASSPHRASE);
    for (const name of retainedFeeNames) {
      const table = report.inventory.tables.find(table => table.name === name);
      assert.ok(table && table.classification === 'durable' && table.rowCount > 0, 'Encrypted recovery must contain actual retained business data: ' + name);
    }
    assert.equal(report.finalCutoverReady, false);
    assert.equal(report.totalObjects, 3);
    for (const [tableName, columnName, expected] of [
      ['orders', 'discount_source', 'virtual'],
      ['orders', 'current_referral_discount_paisa', 'virtual'],
      ['order_items', 'discount_source', 'virtual'],
      ['saved_commission_terms', 'total_share_bps', 'stored'],
    ] as const)
      assert.equal(
        report.inventory.tables
          .find((table) => table.name === tableName)!
          .columns.find((column) => column.name === columnName)!.generated,
        expected,
      );
    assert.equal(Buffer.from(archive).includes(keyBytes), false);
    const recovered = await inspectKeyRecovery(recoveryBundle, PASSPHRASE);
    const recoveredKey = Buffer.from(
      recovered.keys.find((entry) => entry.id === recovered.activeKeyId)!
        .keyBase64,
      'base64',
    ).toString('base64url');
    const restoredMedia = new Map<string, MediaRecord>();
    const restoredMetadata = new Map<string, PortableObjectMetadata>();
    const target = await emptyFixtureTarget(
      destination,
      restoredMedia,
      restoredMetadata,
      recovered.keys.map((entry) => entry.id),
      applicationMedia,
    );
    await restorePortableTransfer(archive, PASSPHRASE, target.target, {
      approved: true,
      expectedPackageId: report.packageId,
    });
    assert.equal(target.wasVerified(), true);
    assert.deepEqual(retainedBusiness(destination),feeBefore,'Every original seller/customer fee and published policy field survives encrypted restore');
    assert.deepEqual(protectedRecords(destination),protectedBefore,'Both encrypted staff MFA records and manifest survive byte-for-byte with their original consumed state');
    assert.equal(
      target.insertedColumns.get('orders')!.includes('discount_source'),
      false,
    );
    assert.equal(
      target.insertedColumns
        .get('orders')!
        .includes('current_referral_discount_paisa'),
      false,
    );
    assert.equal(
      target.insertedColumns.get('order_items')!.includes('discount_source'),
      false,
    );
    assert.equal(
      target.insertedColumns
        .get('saved_commission_terms')!
        .includes('total_share_bps'),
      false,
    );
    assert.deepEqual(
      destination.sqlite
        .prepare(
          'SELECT id,discount_source,current_referral_discount_paisa FROM orders ORDER BY id',
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          id: 'order-none',
          discount_source: 'none',
          current_referral_discount_paisa: 0,
        },
        {
          id: 'order-promo-current',
          discount_source: 'promo',
          current_referral_discount_paisa: 0,
        },
        {
          id: 'order-referral-current',
          discount_source: 'referral',
          current_referral_discount_paisa: 400,
        },
        {
          id: 'order-referral-original',
          discount_source: 'referral',
          current_referral_discount_paisa: 900,
        },
      ],
    );
    assert.deepEqual(
      destination.sqlite
        .prepare('SELECT id,discount_source FROM order_items ORDER BY id')
        .all()
        .map((row) => ({ ...row })),
      [
        { id: 'item-none', discount_source: 'none' },
        { id: 'item-promo-current', discount_source: 'promo' },
        { id: 'item-referral-current', discount_source: 'referral' },
        { id: 'item-referral-original', discount_source: 'referral' },
      ],
    );
    assert.equal(
      destination.sqlite
        .prepare('SELECT COUNT(*) AS n FROM user_sessions')
        .get()!.n,
      0,
    );
    assert.equal(
      destination.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM marketplace_settings WHERE `key` LIKE 'auth-private:session:%' OR `key` LIKE 'auth-private:challenge:%'",
        )
        .get()!.n,
      0,
    );
    assert.deepEqual(
      destination.sqlite
        .prepare('SELECT id,auth_subject,email,status FROM users ORDER BY id')
        .all(),
      source.sqlite
        .prepare('SELECT id,auth_subject,email,status FROM users ORDER BY id')
        .all(),
    );
    assert.deepEqual(
      destination.sqlite
        .prepare('SELECT * FROM user_roles ORDER BY user_id,role')
        .all(),
      source.sqlite
        .prepare('SELECT * FROM user_roles ORDER BY user_id,role')
        .all(),
    );
    assert.deepEqual(
      destination.sqlite
        .prepare('SELECT * FROM user_credentials ORDER BY user_id')
        .all(),
      source.sqlite
        .prepare('SELECT * FROM user_credentials ORDER BY user_id')
        .all(),
    );
    assert.deepEqual(
      destination.sqlite
        .prepare('SELECT * FROM accepted_agreements ORDER BY id')
        .all(),
      source.sqlite
        .prepare('SELECT * FROM accepted_agreements ORDER BY id')
        .all(),
    );
    assert.deepEqual(
      destination.sqlite
        .prepare('SELECT * FROM saved_commission_terms ORDER BY id')
        .all()
        .map((row) => ({ ...row })),
      [
        {
          id: 'current-12',
          company_bps: 1200,
          maker_bps: 8800,
          gross: '1000.00',
          company_amount: '120.00',
          maker_amount: '880.00',
          total_share_bps: 10000,
        },
        {
          id: 'historical-9',
          company_bps: 900,
          maker_bps: 9100,
          gross: '1000.00',
          company_amount: '90.00',
          maker_amount: '910.00',
          total_share_bps: 10000,
        },
      ],
    );
    for (const [key, original] of originalMedia) {
      assert.deepEqual(restoredMedia.get(key), {
        ...original,
        bytes: Buffer.from(original.bytes),
      });
      assert.equal(
        restoredMetadata.get(key)!.namespace,
        key.startsWith('public/') ? 'public' : 'private',
      );
      assert.equal(
        restoredMetadata.get(key)!.contentType,
        original.httpMetadata.contentType,
      );
    }
    assert.deepEqual(restoredMedia.get(builtinKey), {
      ...builtinRecord,
      bytes: Buffer.from(builtinRecord.bytes),
    });
    assert.deepEqual(restoredMetadata.get(builtinKey), builtinMetadata);
    const restoredSource = () =>
      createSqlTransferSource(destination.db, mediaBucket(restoredMedia), {
        installationId: 'disposable-restored',
        release: 'fixture-security-portability-v1',
        keyIds: recovered.keys.map((entry) => entry.id),
        tableClassifications: {
          saved_commission_terms: 'durable',
          accepted_agreements: 'durable',
        },
        applicationMedia,
      });
    const reexport = await collect(
      preparePortableTransfer(restoredSource(), {
        passphrase: PASSPHRASE,
        packageId: 'reexport-with-application-asset',
      }),
    );
    const reexportReport = await inspectPortableTransfer(reexport, PASSPHRASE);
    assert.equal(
      reexportReport.totalObjects,
      3,
      'matching R2/application duplicates are exported once',
    );
    assert.equal(reexportReport.totalObjectBytes, report.totalObjectBytes);
    assert.equal(
      reexportReport.inventory.namespaces.find(
        (entry) => entry.id === 'public',
      )!.objectCount,
      2,
    );
    let builtinCopies = 0;
    let insideBuiltin = false;
    const builtinChunks: Uint8Array[] = [];
    for await (const { value } of decryptPortableFrames(
      reexport,
      PASSPHRASE,
      'data',
    )) {
      const frame = value as {
        type: string;
        object?: PortableObjectMetadata;
        data?: string;
      };
      if (frame.type === 'object-start') {
        insideBuiltin = frame.object?.key === builtinKey;
        if (insideBuiltin) {
          builtinCopies++;
          assert.deepEqual(frame.object, builtinMetadata);
        }
      }
      if (insideBuiltin && frame.type === 'object-bytes')
        builtinChunks.push(Buffer.from(frame.data!, 'base64'));
      if (frame.type === 'object-end') insideBuiltin = false;
    }
    assert.equal(builtinCopies, 1);
    assert.deepEqual(
      Buffer.concat(builtinChunks),
      Buffer.from(builtinRecord.bytes),
    );
    const restoredBuiltin = restoredMedia.get(builtinKey)!;
    for (const issue of ['bytes', 'size', 'metadata'] as const) {
      const altered: MediaRecord = {
        bytes: new Uint8Array(restoredBuiltin.bytes),
        httpMetadata: { ...restoredBuiltin.httpMetadata },
        customMetadata: { ...restoredBuiltin.customMetadata },
      };
      if (issue === 'bytes') altered.bytes[0] ^= 1;
      if (issue === 'size')
        altered.bytes = new Uint8Array([...altered.bytes, 10]);
      if (issue === 'metadata')
        altered.customMetadata.assetId = 'tampered-duplicate';
      restoredMedia.set(builtinKey, altered);
      try {
        await assert.rejects(
          () => restoredSource().openSnapshot(),
          /duplicate|application|media|mismatch|changed/i,
          issue,
        );
      } finally {
        restoredMedia.set(builtinKey, restoredBuiltin);
      }
    }
    assert.deepEqual(restoredMedia.get(builtinKey), {
      ...builtinRecord,
      bytes: Buffer.from(builtinRecord.bytes),
    });
    const restoredStore = new SecurityStore(destination.db, recoveredKey, true);
    const restoredMfa = new MfaService(restoredStore);
    const restoredOwner = (await restoredStore.readAccount(owner.id))!;
    assert.deepEqual(
      restoredOwner.value,
      accountBefore.value,
      'real AccountSecurity is validated and preserved exactly',
    );
    assert.equal(
      restoredOwner.raw,
      accountBefore.raw,
      'encrypted payload is not rewritten or weakened by transfer',
    );
    for (const account of staff) {
      assert.equal(
        (await restoredStore.readAccount(account.id))!.value.status,
        'active',
      );
      assert.equal(
        await restoredStore.readProof(
          enrollments.get(account.id)!.oldHash,
          account.id,
        ),
        null,
      );
      assert.equal(
        await getHostedIdentity(
          destination.db,
          headers(oldTokens.get(account.id)!),
          NOW + 2_000,
          { securityKey: recoveredKey, initialized: true, activity: false },
        ),
        null,
      );
    }
    await assert.rejects(() =>
      new SecurityStore(
        destination.db,
        Buffer.alloc(32, 91).toString('base64url'),
        true,
      ).readAccount(owner.id),
    );
    const ownerCredential = await findCredentialByEmail(
      destination.db,
      owner.email,
    );
    assert.ok(ownerCredential);
    assert.equal(ownerCredential.passwordHash, credentials.get(owner.id)!.hash);
    assert.equal(ownerCredential.passwordSalt, credentials.get(owner.id)!.salt);
    assert.equal(
      await verifyPassword(
        owner.password,
        ownerCredential.passwordHash,
        ownerCredential.passwordSalt,
      ),
      true,
    );
    const pendingToken = await createHostedSessionForUser(
      destination.db,
      owner.id,
      NOW + 2_000,
      { passwordHash: ownerCredential.passwordHash },
    );
    const pendingHash = hostedSessionHash(headers(pendingToken))!;
    assert.equal(
      await getHostedIdentity(
        destination.db,
        headers(pendingToken),
        NOW + 2_000,
        { securityKey: recoveredKey, initialized: true, activity: false },
      ),
      null,
    );
    await assert.rejects(
      () =>
        restoredMfa.verifyTotp({
          userId: owner.id,
          sessionHash: pendingHash,
          code: totpAtCounter(
            ownerEnrollment.secret,
            accountBefore.value.factor!.lastCounter,
          ),
          passwordVerifiedAt: NOW + 2_000,
          now: NOW + 2_000,
        }),
      /already used|invalid|expired/i,
    );
    await assert.rejects(
      () =>
        restoredMfa.verifyRecovery({
          userId: owner.id,
          sessionHash: pendingHash,
          code: ownerEnrollment.codes[0],
          passwordVerifiedAt: NOW + 2_000,
          now: NOW + 2_000,
        }),
      /already used|invalid/i,
    );
    const finalToken = Buffer.from(randomBytes(32)).toString('base64url');
    const finalHash = hostedSessionHash(headers(finalToken))!;
    await restoredMfa.verifyRecovery({
      userId: owner.id,
      sessionHash: pendingHash,
      targetSessionHash: finalHash,
      code: ownerEnrollment.codes[1],
      passwordVerifiedAt: NOW + 2_000,
      now: NOW + 2_000,
      linkedStatements: [
        destination.db
          .prepare(
            'INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?)',
          )
          .bind(
            finalHash,
            owner.id,
            NOW + 2_000 + 8 * 3_600_000,
            NOW + 2_000,
            NOW + 2_000,
          ),
        destination.db
          .prepare('DELETE FROM user_sessions WHERE token_hash=? AND user_id=?')
          .bind(pendingHash, owner.id),
      ],
    });
    assert.equal(
      (await getHostedIdentity(
        destination.db,
        headers(finalToken),
        NOW + 2_000,
        { securityKey: recoveredKey, initialized: true, activity: false },
      ))!.userId,
      owner.subject,
    );
    assert.equal(
      await getHostedIdentity(
        destination.db,
        headers(pendingToken),
        NOW + 2_000,
        { securityKey: recoveredKey, initialized: true, activity: false },
      ),
      null,
    );
    assert.equal(
      (await restoredStore.readAccount(owner.id))!.value.recovery!.hashes
        .length,
      8,
    );
    assert.equal(
      (await restoredStore.readAccount(
        owner.id,
      ))!.value.recovery!.hashes.includes(
        recoveryCodeHash(
          owner.id,
          accountBefore.value.recovery!.setId,
          ownerEnrollment.codes[0],
        ),
      ),
      false,
    );
    await restoredMfa.verifyTotp({
      userId: owner.id,
      sessionHash: finalHash,
      code: totpAtCounter(
        ownerEnrollment.secret,
        Math.floor((NOW + 30_000) / 30_000),
      ),
      passwordVerifiedAt: NOW + 2_000,
      now: NOW + 30_000,
    });
    const admin = staff[1];
    const adminEnrollment = enrollments.get(admin.id)!;
    const adminCredential = await findCredentialByEmail(
      destination.db,
      admin.email,
    );
    assert.ok(adminCredential);
    assert.equal(
      await verifyPassword(
        admin.password,
        adminCredential.passwordHash,
        adminCredential.passwordSalt,
      ),
      true,
    );
    const adminToken = await createHostedSessionForUser(
      destination.db,
      admin.id,
      NOW + 30_000,
      { passwordHash: adminCredential.passwordHash },
    );
    await restoredMfa.verifyTotp({
      userId: admin.id,
      sessionHash: hostedSessionHash(headers(adminToken))!,
      code: totpAtCounter(
        adminEnrollment.secret,
        Math.floor((NOW + 30_000) / 30_000),
      ),
      passwordVerifiedAt: NOW + 30_000,
      now: NOW + 30_000,
    });
    assert.equal(
      (await getHostedIdentity(
        destination.db,
        headers(adminToken),
        NOW + 30_000,
        { securityKey: recoveredKey, initialized: true, activity: false },
      ))!.userId,
      admin.subject,
    );
    for (const [name, table] of sourceTrusted)
      assert.equal(
        portableRowsHash(actualRows(source, table)),
        before.get(name),
        'source unchanged: ' + name,
      );
  } finally {
    source.dispose();
    destination.dispose();
  }
});
