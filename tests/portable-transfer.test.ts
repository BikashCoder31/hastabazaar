import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  encodePortableValue,
  decimalPortableValue,
  validatePortableValue,
  canonicalJson,
} from '../lib/portability/values';
import {
  encryptPortableFrames,
  decryptPortableFrames,
  exportKeyRecovery,
  inspectKeyRecovery,
} from '../lib/portability/crypto';
import {
  inspectPortableTransfer,
  preparePortableTransfer,
  restorePortableTransfer,
  portableRowsHash,
  validatePortableInventory,
} from '../lib/portability/transfer';
import type {
  PortableInventory,
  PortableRestoreTarget,
  PortableRestoreTransaction,
  PortableTransferSource,
} from '../lib/portability/types';
import {
  decryptSecurityValue,
  encryptSecurityValue,
  recoveryCodeHash,
  securityKeyId,
  totpAtCounter,
  verifyTotp,
} from '../lib/security/crypto';

const passphrase = 'fictional owner recovery passphrase only';
async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const part of chunks) parts.push(part);
  return Buffer.concat(parts);
}

function fixture() {
  const inventory: PortableInventory = {
    version: 1,
    installationId: 'fictional-source',
    databaseEngine: 'sqlite',
    schemaFingerprint: 'a'.repeat(64),
    application: {
      release: 'fixture-release',
      schemaVersion: 'fixture-v1',
      requiredEnvironmentNames: ['APP_ORIGIN'],
      artifactSha256: null,
    },
    snapshot: {
      cutoff: '2026-10-20T00:00:00.000Z',
      revision: 'fixture-r1',
      writeMode: 'preliminary',
    },
    discoveredTables: [
      'accounts',
      'saved_terms',
      'user_sessions',
      'marketplace_settings',
    ],
    discoveredNamespaces: ['private'],
    tables: [
      {
        name: 'accounts',
        columns: [
          { name: 'id', declaredType: 'TEXT', nullable: false },
          { name: 'name', declaredType: 'TEXT', nullable: false },
        ],
        primaryKey: ['id'],
        classification: 'durable',
        rowCount: 1,
      },
      {
        name: 'saved_terms',
        columns: [
          { name: 'id', declaredType: 'TEXT', nullable: false },
          { name: 'amount', declaredType: 'DECIMAL', nullable: false },
        ],
        primaryKey: ['id'],
        classification: 'durable',
        rowCount: 2,
      },
      {
        name: 'user_sessions',
        columns: [
          { name: 'token_hash', declaredType: 'TEXT', nullable: false },
        ],
        primaryKey: ['token_hash'],
        classification: 'transient',
        rowCount: 1,
      },
      {
        name: 'marketplace_settings',
        columns: [
          { name: 'key', declaredType: 'TEXT', nullable: false },
          { name: 'value', declaredType: 'TEXT', nullable: false },
        ],
        primaryKey: ['key'],
        classification: 'security',
        rowCount: 2,
      },
    ],
    namespaces: [
      { id: 'private', access: 'private', objectCount: 1, totalBytes: 4 },
    ],
    security: { keyIds: ['f'.repeat(32)], payloadVersions: [1] },
  };
  const rows = new Map([
    [
      'accounts',
      [[encodePortableValue('account-1'), encodePortableValue('नेपाल test')]],
    ],
    [
      'saved_terms',
      [
        [encodePortableValue('historical'), decimalPortableValue('9.0000')],
        [encodePortableValue('current'), decimalPortableValue('12.0000')],
      ],
    ],
    ['user_sessions', [[encodePortableValue('old-session-must-not-work')]]],
    [
      'marketplace_settings',
      [
        [
          encodePortableValue('auth-private:account:account-1'),
          encodePortableValue(
            JSON.stringify({
              v: 1,
              kid: 'f'.repeat(32),
              n: Buffer.alloc(12).toString('base64url'),
              c: Buffer.from(
                'encrypted-account-state-used-code-preserved',
              ).toString('base64url'),
              t: Buffer.alloc(16).toString('base64url'),
            }),
          ),
        ],
        [
          encodePortableValue('auth-private:session:oldhash'),
          encodePortableValue('old-mfa-proof'),
        ],
      ],
    ],
  ]);
  const state = { unchanged: true, closed: false, opened: 0 };
  const source: PortableTransferSource = {
    async openSnapshot() {
      state.opened++;
      return {
        inventory,
        async *rows(table) {
          for (const row of rows.get(table.name) ?? []) yield row;
        },
        async *objects(namespace) {
          yield {
            namespace: namespace.id,
            key: 'evidence/account-1.bin',
            size: 4,
            contentType: 'application/octet-stream',
            customMetadata: { owner: 'account-1' },
            httpMetadata: {
              cacheControl: 'private, no-store',
              contentDisposition: 'attachment; filename="evidence.bin"',
            },
            bytes: (async function* () {
              yield new Uint8Array([0, 255]);
              yield new Uint8Array([1, 2]);
            })(),
          };
        },
        async verifyUnchanged() {
          return state.unchanged;
        },
        async close() {
          state.closed = true;
        },
      };
    },
  };
  return { inventory, source, rows, state };
}

void test('complete encrypted export inventories every table/private object and keeps saved commission values exact', async () => {
  const data = fixture();
  const archive = await collect(
    preparePortableTransfer(data.source, {
      passphrase,
      packageId: 'fixture-data',
    }),
  );
  assert.equal(data.state.closed, true);
  const report = await inspectPortableTransfer(archive, passphrase);
  assert.equal(report.packageId, 'fixture-data');
  assert.equal(report.totalRows, 6);
  assert.equal(report.totalObjects, 1);
  assert.equal(report.totalObjectBytes, 4);
  assert.equal(report.finalCutoverReady, false);
  assert.equal(report.inventory.namespaces[0].access, 'private');
  assert.equal(
    Buffer.from(archive).includes(Buffer.from('encrypted-account-state')),
    false,
  );
  assert.equal(Buffer.from(archive).includes(Buffer.from('9.0000')), false);
});

void test('inventory omissions, token-table reclassification and concurrent source changes fail closed', async () => {
  const data = fixture();
  assert.throws(
    () =>
      validatePortableInventory({
        ...data.inventory,
        discoveredTables: ['accounts'],
      }),
    /inventory|table/i,
  );
  assert.throws(
    () =>
      validatePortableInventory({
        ...data.inventory,
        tables: data.inventory.tables.map((table) =>
          table.name === 'user_sessions'
            ? { ...table, classification: 'durable' }
            : table,
        ),
      }),
    /transient/i,
  );
  data.state.unchanged = false;
  await assert.rejects(
    () => collect(preparePortableTransfer(data.source, { passphrase })),
    /changed|snapshot/i,
  );
  assert.equal(data.state.closed, true);
  const missing = fixture();
  missing.inventory.tables[0].rowCount++;
  await assert.rejects(
    () => collect(preparePortableTransfer(missing.source, { passphrase })),
    /row count/i,
  );
});

function targetFixture() {
  const written = new Map<string, unknown[]>();
  const state = {
    empty: true,
    committed: false,
    rolledBack: false,
    bytes: [] as Uint8Array[],
    objects: [] as import('../lib/portability/types').PortableObjectMetadata[],
    keyIds: ['f'.repeat(32)],
  };
  const transaction: PortableRestoreTransaction = {
    async writeRows(table, rows) {
      written.set(table.name, [...(written.get(table.name) ?? []), ...rows]);
    },
    async beginObject(metadata) {
      state.objects.push(structuredClone(metadata));
    },
    async writeObjectChunk(bytes) {
      state.bytes.push(bytes);
    },
    async endObject() {},
    async verify() {
      return true;
    },
    async commit() {
      state.committed = true;
    },
    async rollback() {
      state.rolledBack = true;
      written.clear();
    },
  };
  const target: PortableRestoreTarget = {
    async preflight() {
      return {
        empty: state.empty,
        schemaFingerprint: 'a'.repeat(64),
        applicationCompatible: true,
        availableKeyIds: state.keyIds,
        dispatchPaused: true,
      };
    },
    async begin() {
      return transaction;
    },
  };
  return { target, state, written };
}

void test('portable restore retires worker tokens while preserving dispatch fences and history', async () => {
  const data = fixture();
  const cases: {
    name: string;
    columns: string[];
    rows: (string | number | null)[][];
    cleared: string[];
  }[] = [
    {
      name: 'operational_reminder_cursors',
      columns: ['family', 'cursor', 'revision', 'lease_token', 'lease_until'],
      rows: [['dispatch', 'manual_payment', 42, 'old-cursor-token', 9000]],
      cleared: ['lease_token', 'lease_until'],
    },
    {
      name: 'commission_terms_email_controls',
      columns: ['seller_id', 'revision', 'last_routine_queued_at', 'last_routine_sent_at', 'last_personal_contact_at', 'last_routine_message_id', 'routine_claim_token', 'routine_claim_message_id', 'routine_claim_until'],
      rows: [['seller', 9, 101, 102, 103, 'prior-message', 'old-fee-token', 'current-message', 9000]],
      cleared: ['routine_claim_token'],
    },
    {
      name: 'email_delivery_attempts',
      columns: ['id', 'queue_kind', 'queue_id', 'claim_token', 'attempt_number', 'phase', 'provider_receipt'],
      rows: [
        ['a', 'business', 'current-message', 'old-fee-token', 1, 'claimed', null],
        ['b', 'business', 'handoff-message', 'handoff-token', 1, 'handoff_started', null],
        ['c', 'business', 'uncertain-message', 'uncertain-token', 1, 'uncertain', null],
        ['d', 'business', 'prior-message', 'sent-token', 1, 'accepted', 'provider-receipt'],
      ],
      cleared: [],
    },
    {
      name: 'notification_messages',
      columns: ['id', 'status', 'delivery_claim_token', 'delivery_lease_until'],
      rows: [['current-message', 'sending', 'old-fee-token', 9000], ['prior-message', 'sent', null, 0]],
      cleared: [],
    },
  ];
  for (const { name, columns, rows, cleared } of cases) {
    data.inventory.discoveredTables.push(name);
    data.inventory.tables.push({
      name,
      columns: columns.map((column, index) => ({
        name: column,
        declaredType: typeof rows[0][index] === 'number' ? 'INTEGER' : 'TEXT',
        nullable: cleared.includes(column) || rows.some((row) => row[index] === null),
      })),
      primaryKey: [columns[0]],
      classification: 'dispatch',
      rowCount: rows.length,
    });
    data.rows.set(name, rows.map((row) => row.map((value) => encodePortableValue(value))));
  }
  const archive = await collect(preparePortableTransfer(data.source, { passphrase, packageId: 'worker-leases' }));
  const destination = targetFixture();
  await restorePortableTransfer(archive, passphrase, destination.target, {
    approved: true,
    expectedPackageId: 'worker-leases',
  });
  assert.equal(destination.state.committed, true);
  for (const { name, columns, rows, cleared } of cases) {
    assert.deepEqual(data.rows.get(name), rows.map((row) => row.map((value) => encodePortableValue(value))));
    assert.deepEqual(destination.written.get(name), rows.map((row) =>
      row.map((value, index) => encodePortableValue(cleared.includes(columns[index]) ? null : value)),
    ));
  }
});

void test('provider table exclusions cannot hide application records and are never sent to a restore writer', async () => {
  const f = fixture(),
    extended = f.inventory as PortableInventory & {
      providerManagedTables?: unknown;
    };
  extended.discoveredTables.push('_cf_METADATA');
  extended.providerManagedTables = [
    { name: '_cf_METADATA', reason: 'provider-internal' },
  ];
  assert.doesNotThrow(() => validatePortableInventory(extended));
  for (const entries of [
    [{ name: 'accounts', reason: 'provider-internal' }],
    [{ name: '_cf_METADATA', reason: 'skip' }],
    [
      { name: '_cf_METADATA', reason: 'provider-internal' },
      { name: '_cf_METADATA', reason: 'provider-internal' },
    ],
  ])
    assert.throws(() =>
      validatePortableInventory({
        ...extended,
        providerManagedTables: entries,
      }),
    );
  assert.throws(() =>
    validatePortableInventory({
      ...extended,
      discoveredTables: extended.discoveredTables.filter(
        (name) => name !== '_cf_METADATA',
      ),
    }),
  );
  assert.throws(() =>
    validatePortableInventory({
      ...extended,
      discoveredTables: extended.discoveredTables.filter(
        (name) => name !== 'accounts',
      ),
    }),
  );
  assert.throws(() =>
    validatePortableInventory({ ...extended, providerManagedTables: [] }),
  );
  const includedProvider = {
    ...extended,
    providerManagedTables: undefined,
    tables: [
      ...extended.tables,
      {
        name: '_cf_METADATA',
        columns: [{ name: 'key', declaredType: 'INTEGER', nullable: false }],
        primaryKey: ['key'],
        classification: 'installation',
        rowCount: 0,
      },
    ],
  };
  delete includedProvider.providerManagedTables;
  assert.throws(
    () => validatePortableInventory(includedProvider),
    'Provider metadata can never be supplied as table rows',
  );
  const target = targetFixture();
  let omitted: string[] = [];
  const begin = target.target.begin.bind(target.target);
  target.target.begin = async (inventory) => {
    const transaction = await begin(inventory);
    return {
      ...transaction,
      async verify(_inspection, expected) {
        omitted = expected.omittedTables;
        return true;
      },
    };
  };
  const archive = await collect(
    preparePortableTransfer(f.source, {
      passphrase,
      packageId: 'provider-exclusion-fixture',
    }),
  );
  await restorePortableTransfer(archive, passphrase, target.target, {
    approved: true,
    expectedPackageId: 'provider-exclusion-fixture',
  });
  assert.ok(omitted.includes('_cf_METADATA'));
  assert.ok(!target.written.has('_cf_METADATA'));
  assert.deepEqual(target.written.get('saved_terms'), [
    [
      { type: 'text', value: 'historical' },
      { type: 'decimal', value: '9.0000' },
    ],
    [
      { type: 'text', value: 'current' },
      { type: 'decimal', value: '12.0000' },
    ],
  ]);
});

void test('explicit isolated restore preserves account/MFA/history but never reactivates sessions or proofs', async () => {
  const archive = await collect(
    preparePortableTransfer(fixture().source, {
      passphrase,
      packageId: 'restore-fixture',
    }),
  );
  const target = targetFixture();
  await restorePortableTransfer(archive, passphrase, target.target, {
    approved: true,
    expectedPackageId: 'restore-fixture',
  });
  assert.equal(target.state.committed, true);
  assert.equal(target.written.has('user_sessions'), false);
  assert.equal(target.written.get('marketplace_settings')?.length, 1);
  assert.equal(target.written.get('saved_terms')?.length, 2);
  assert.deepEqual(target.written.get('saved_terms'), [
    [
      { type: 'text', value: 'historical' },
      { type: 'decimal', value: '9.0000' },
    ],
    [
      { type: 'text', value: 'current' },
      { type: 'decimal', value: '12.0000' },
    ],
  ]);
  assert.deepEqual(target.written.get('accounts'), [
    [
      { type: 'text', value: 'account-1' },
      { type: 'text', value: 'नेपाल test' },
    ],
  ]);
  assert.deepEqual(target.state.objects, [
    {
      namespace: 'private',
      key: 'evidence/account-1.bin',
      size: 4,
      contentType: 'application/octet-stream',
      customMetadata: { owner: 'account-1' },
      httpMetadata: {
        cacheControl: 'private, no-store',
        contentDisposition: 'attachment; filename="evidence.bin"',
      },
    },
  ]);
  assert.deepEqual(
    Buffer.concat(target.state.bytes),
    Buffer.from([0, 255, 1, 2]),
  );
  const occupied = targetFixture();
  occupied.state.empty = false;
  await assert.rejects(
    () =>
      restorePortableTransfer(archive, passphrase, occupied.target, {
        approved: true,
        expectedPackageId: 'restore-fixture',
      }),
    /empty/i,
  );
  const noKey = targetFixture();
  noKey.state.keyIds = [];
  await assert.rejects(
    () =>
      restorePortableTransfer(archive, passphrase, noKey.target, {
        approved: true,
        expectedPackageId: 'restore-fixture',
      }),
    /key/i,
  );
  const truncated = targetFixture();
  await assert.rejects(
    () =>
      restorePortableTransfer(
        archive.subarray(0, archive.length - 5),
        passphrase,
        truncated.target,
        { approved: true, expectedPackageId: 'restore-fixture' },
      ),
    /incomplete/i,
  );
  assert.equal(truncated.state.committed, false);
  assert.equal(truncated.state.rolledBack, true);
});

void test('restore expires pending staff invitations, keeps their exact selections and omits other transient grants', async () => {
  const data = fixture();
  const grants = {
    name: 'staff_invitations',
    columns: [
      { name: 'id', declaredType: 'TEXT', nullable: false },
      { name: 'status', declaredType: 'TEXT', nullable: false },
      { name: 'expires_at', declaredType: 'INTEGER', nullable: false },
    ],
    primaryKey: ['id'],
    classification: 'security' as const,
    rowCount: 3,
  };
  const token = {
    name: 'future_access_tokens',
    columns: [{ name: 'token', declaredType: 'TEXT', nullable: false }],
    primaryKey: ['token'],
    classification: 'transient' as const,
    rowCount: 1,
  };
  const grant = { ...token, name: 'future_access_grants' };
  const selections = {
    name: 'staff_invitation_grants',
    columns: [
      { name: 'invitation_id', declaredType: 'TEXT', nullable: false },
      { name: 'permissions_json', declaredType: 'TEXT', nullable: false },
      { name: 'grant_version', declaredType: 'INTEGER', nullable: false },
      { name: 'created_by', declaredType: 'TEXT', nullable: false },
      { name: 'created_at', declaredType: 'INTEGER', nullable: false },
    ],
    primaryKey: ['invitation_id'],
    classification: 'security' as const,
    rowCount: 3,
  };
  data.inventory.tables.push(grants, selections, token, grant);
  data.inventory.discoveredTables.push(grants.name, selections.name, token.name, grant.name);
  const originals = [
    [
      encodePortableValue('pending-invite-id'),
      encodePortableValue('pending'),
      encodePortableValue(9999999999999),
    ],
    [
      encodePortableValue('accepted-invite-id'),
      encodePortableValue('accepted'),
      encodePortableValue(100),
    ],
    [
      encodePortableValue('revoked-invite-id'),
      encodePortableValue('revoked'),
      encodePortableValue(200),
    ],
  ];
  data.rows.set(grants.name, originals);
  const originalSelections = [
    ['pending-invite-id', '["product.review"]', 3, 'original-owner', 10],
    ['accepted-invite-id', '["product.review"]', 7, 'original-owner', 11],
    ['revoked-invite-id', '[]', 2, 'original-owner', 12],
  ].map((row) => row.map(encodePortableValue));
  data.rows.set(selections.name, originalSelections);
  data.rows.set(token.name, [
    [encodePortableValue('must-not-reactivate-token')],
  ]);
  data.rows.set(grant.name, [
    [encodePortableValue('must-not-reactivate-grant')],
  ]);
  const archive = await collect(
    preparePortableTransfer(data.source, {
      passphrase,
      packageId: 'grant-transfer',
    }),
  );
  const originalRows = [];
  let inGrants = false;
  for await (const { value } of decryptPortableFrames(
    archive,
    passphrase,
    'data',
  )) {
    const frame = value as { type: string; name?: string; rows?: unknown[] };
    if (frame.type === 'table-start') inGrants = frame.name === grants.name;
    if (inGrants && frame.type === 'rows') originalRows.push(...frame.rows!);
  }
  assert.deepEqual(
    originalRows,
    originals,
    'encrypted source archive retains every original invitation unchanged',
  );
  const target = targetFixture();
  const begin = target.target.begin.bind(target.target);
  let expected:
    | import('../lib/portability/types').PortableRestoreManifest
    | undefined;
  target.target.begin = async (inventory) => ({
    ...(await begin(inventory)),
    async verify(_inspection, manifest) {
      expected = manifest;
      return true;
    },
  });
  await restorePortableTransfer(archive, passphrase, target.target, {
    approved: true,
    expectedPackageId: 'grant-transfer',
  });
  const restored = target.written.get(
    grants.name,
  ) as import('../lib/portability/values').PortableRow[];
  assert.deepEqual(restored, [
    [
      encodePortableValue('pending-invite-id'),
      encodePortableValue('expired'),
      encodePortableValue(9999999999999),
    ],
    originals[1],
    originals[2],
  ]);
  assert.equal(target.written.has(token.name), false);
  assert.equal(target.written.has(grant.name), false);
  assert.deepEqual(target.written.get(selections.name), originalSelections);
  assert.equal(
    expected?.tableRecords.find((table) => table.name === selections.name)?.sha256,
    portableRowsHash(originalSelections),
  );
  assert.throws(
    () =>
      validatePortableInventory({
        ...data.inventory,
        tables: data.inventory.tables.map((table) =>
          table.name === selections.name
            ? { ...table, classification: 'transient' }
            : table,
        ),
      }),
    /Protected security table classification/i,
  );
  assert.equal(
    expected?.tableRecords.find((table) => table.name === grants.name)?.sha256,
    portableRowsHash(restored),
  );
  assert.ok(expected?.omittedTables.includes(token.name));
  assert.ok(expected?.omittedTables.includes(grant.name));
  assert.throws(
    () =>
      validatePortableInventory({
        ...data.inventory,
        tables: data.inventory.tables.map((table) =>
          table.name === token.name
            ? { ...table, classification: 'durable' }
            : table,
        ),
      }),
    /transient/i,
  );
});

void test('encrypted frames authenticate purpose, ordering and completion without plaintext secrets', async () => {
  async function* frames() {
    yield { type: 'test', secret: 'fictional-private-value' };
  }
  const data = await collect(
    encryptPortableFrames(frames(), passphrase, 'data', {
      packageId: 'fixture-package',
    }),
  );
  assert.equal(
    Buffer.from(data).includes(Buffer.from('fictional-private-value')),
    false,
  );
  const decrypted = [];
  for await (const frame of decryptPortableFrames(data, passphrase, 'data'))
    decrypted.push(frame.value);
  assert.deepEqual(decrypted, [
    { type: 'test', secret: 'fictional-private-value' },
  ]);
  await assert.rejects(async () => {
    for await (const _ of decryptPortableFrames(
      data,
      'a different recovery passphrase',
      'data',
    )) {
      /* iterate */
    }
  }, /could not unlock|authentication/i);
  await assert.rejects(async () => {
    for await (const _ of decryptPortableFrames(
      data,
      passphrase,
      'key-recovery',
    )) {
      /* iterate */
    }
  }, /purpose/i);
  const lines = Buffer.from(data).toString().trimEnd().split('\n');
  await assert.rejects(async () => {
    for await (const _ of decryptPortableFrames(
      Buffer.from(lines.slice(0, -1).join('\n') + '\n'),
      passphrase,
      'data',
    )) {
      /* iterate */
    }
  }, /incomplete/i);
});

void test('separate key recovery validates stable key IDs and cannot be inspected as application data', async () => {
  const key = Buffer.alloc(32, 17);
  const id = createHash('sha256').update(key).digest('hex').slice(0, 32);
  const keyring = {
    version: 1 as const,
    activeKeyId: id,
    keys: [{ id, keyBase64: key.toString('base64') }],
  };
  const bundle = await exportKeyRecovery(keyring, passphrase);
  assert.deepEqual(await inspectKeyRecovery(bundle, passphrase), keyring);
  assert.equal(
    Buffer.from(bundle).includes(Buffer.from(keyring.keys[0].keyBase64)),
    false,
  );
  await assert.rejects(
    () => exportKeyRecovery({ ...keyring, activeKeyId: 'missing' }, passphrase),
    /active key/i,
  );
  await assert.rejects(
    () => exportKeyRecovery(keyring, 'short'),
    /passphrase/i,
  );
});

void test('encrypted framing rejects modified ciphertext, replayed order, appended data and unsafe KDF parameters', async () => {
  async function* frames() {
    yield { type: 'fixture-a' };
    yield { type: 'fixture-b' };
  }
  const data = await collect(
    encryptPortableFrames(frames(), passphrase, 'data'),
  );
  const lines = Buffer.from(data).toString().trimEnd().split('\n');
  async function read(input: Uint8Array) {
    for await (const _ of decryptPortableFrames(input, passphrase, 'data')) {
      /* verify every frame */
    }
  }
  const header = JSON.parse(lines[0]);
  for (const kdf of [
    { ...header.kdf, N: 1024 },
    { ...header.kdf, N: 2 ** 30 },
    { ...header.kdf, p: 1 },
  ]) {
    await assert.rejects(
      () =>
        read(
          Buffer.from(
            [canonicalJson({ ...header, kdf }), ...lines.slice(1)].join('\n') +
              '\n',
          ),
        ),
      /derivation/i,
    );
  }
  await assert.rejects(
    () =>
      read(
        Buffer.from([lines[0], lines[2], lines[1], lines[3]].join('\n') + '\n'),
      ),
    /order/i,
  );
  await assert.rejects(
    () => read(Buffer.concat([data, Buffer.from(lines[1] + '\n')])),
    /after.*completion/i,
  );
  const altered = JSON.parse(lines[1]);
  const bytes = Buffer.from(altered.ciphertext, 'base64');
  bytes[0] ^= 1;
  altered.ciphertext = bytes.toString('base64');
  await assert.rejects(
    () =>
      read(
        Buffer.from(
          [lines[0], canonicalJson(altered), ...lines.slice(2)].join('\n') +
            '\n',
        ),
      ),
    /authentication/i,
  );
});

void test('typed inventory and encrypted security payloads reject incomplete namespaces, unknown versions and raw keys', async () => {
  const data = fixture();
  assert.throws(
    () =>
      validatePortableInventory({
        ...data.inventory,
        discoveredNamespaces: [],
      }),
    /namespace.*incomplete/i,
  );
  assert.throws(
    () =>
      validatePortableInventory({
        ...data.inventory,
        security: { ...data.inventory.security, payloadVersions: [2] },
      }),
    /version/i,
  );
  assert.throws(
    () =>
      validatePortableInventory({
        ...data.inventory,
        security: { ...data.inventory.security, rawKey: 'do-not-copy' },
      }),
    /Unsupported fields/i,
  );
  data.rows.get('marketplace_settings')![0][1] = encodePortableValue(
    JSON.stringify({
      v: 2,
      kid: 'f'.repeat(32),
      n: 'AAAAAAAAAAAAAAAA',
      c: 'YQ',
      t: 'AAAAAAAAAAAAAAAAAAAAAA',
    }),
  );
  await assert.rejects(
    () => collect(preparePortableTransfer(data.source, { passphrase })),
    /payload version/i,
  );
});

void test('source object bytes, paths and duplicate keys are checked before issuing a complete manifest', async () => {
  for (const issue of ['path', 'size', 'duplicate'] as const) {
    const data = fixture();
    const open = data.source.openSnapshot.bind(data.source);
    data.source.openSnapshot = async () => {
      const snapshot = await open();
      const original = snapshot.objects.bind(snapshot);
      snapshot.objects = async function* (namespace) {
        for await (const object of original(namespace)) {
          if (issue === 'path') object.key = '../private-evidence';
          if (issue === 'size') object.size++;
          yield object;
          if (issue === 'duplicate') yield object;
        }
      };
      return snapshot;
    };
    if (issue === 'duplicate') {
      data.inventory.namespaces[0].objectCount = 2;
      data.inventory.namespaces[0].totalBytes = 8;
    }
    await assert.rejects(
      () => collect(preparePortableTransfer(data.source, { passphrase })),
      /unsafe object key|object size|unique/i,
    );
  }
});

void test('portable inspection streams arbitrarily split chunks and rejects authenticated manifest or file-hash changes', async () => {
  const archive = await collect(
    preparePortableTransfer(fixture().source, { passphrase }),
  );
  async function* fragments() {
    for (let offset = 0; offset < archive.length; offset += 7)
      yield archive.subarray(offset, offset + 7);
  }
  assert.equal(
    (await inspectPortableTransfer(fragments(), passphrase)).totalRows,
    6,
  );
  const frames: unknown[] = [];
  for await (const frame of decryptPortableFrames(archive, passphrase, 'data'))
    frames.push(frame.value);
  for (const targetType of ['manifest', 'object-end']) {
    const changed = structuredClone(frames) as Record<string, unknown>[];
    const target = changed.find((frame) => frame.type === targetType)!;
    if (targetType === 'manifest')
      (target.manifest as Record<string, unknown>).contentSha256 = '0'.repeat(
        64,
      );
    else target.sha256 = '0'.repeat(64);
    async function* replaced() {
      yield* changed;
    }
    const data = await collect(
      encryptPortableFrames(replaced(), passphrase, 'data', {
        packageId: (frames.at(-1) as { manifest: { packageId: string } })
          .manifest.packageId,
      }),
    );
    await assert.rejects(
      () => inspectPortableTransfer(data, passphrase),
      /hash|manifest/i,
    );
  }
});

void test('restore checks explicit package approval, schema compatibility, dispatch pause and final verification', async () => {
  const archive = await collect(
    preparePortableTransfer(fixture().source, {
      passphrase,
      packageId: 'guarded-restore',
    }),
  );
  const unapproved = targetFixture();
  await assert.rejects(
    () =>
      restorePortableTransfer(archive, passphrase, unapproved.target, {
        approved: false,
        expectedPackageId: 'guarded-restore',
      } as unknown as { approved: true; expectedPackageId: string }),
    /approval/i,
  );
  assert.equal(unapproved.state.committed, false);
  await assert.rejects(
    () =>
      restorePortableTransfer(archive, passphrase, targetFixture().target, {
        approved: true,
        expectedPackageId: 'another-package',
      }),
    /package ID/i,
  );
  for (const issue of ['schema', 'dispatch', 'verify'] as const) {
    const target = targetFixture();
    const original = target.target.preflight.bind(target.target);
    target.target.preflight = async (inventory) => ({
      ...(await original(inventory)),
      ...(issue === 'schema' ? { schemaFingerprint: 'b'.repeat(64) } : {}),
      ...(issue === 'dispatch' ? { dispatchPaused: false } : {}),
    });
    if (issue === 'verify') {
      const begin = target.target.begin.bind(target.target);
      target.target.begin = async (inventory) => ({
        ...(await begin(inventory)),
        async verify() {
          return false;
        },
      });
    }
    await assert.rejects(
      () =>
        restorePortableTransfer(archive, passphrase, target.target, {
          approved: true,
          expectedPackageId: 'guarded-restore',
        }),
      /incompatible|paused|verification failed/i,
    );
    assert.equal(target.state.committed, false);
    assert.equal(target.state.rolledBack, issue === 'verify');
  }
});

void test('target verification receives independent expected hashes after transient rows are excluded', async () => {
  const archive = await collect(
    preparePortableTransfer(fixture().source, {
      passphrase,
      packageId: 'restore-hashes',
    }),
  );
  const target = targetFixture();
  const begin = target.target.begin.bind(target.target);
  let received: unknown;
  target.target.begin = async (inventory) => ({
    ...(await begin(inventory)),
    async verify(...args: unknown[]) {
      received = args[1];
      return true;
    },
  });
  await restorePortableTransfer(archive, passphrase, target.target, {
    approved: true,
    expectedPackageId: 'restore-hashes',
  });
  assert.ok(received && typeof received === 'object');
  const expected = received as {
    tableRecords: { name: string; rows: number; sha256: string }[];
    omittedTables: string[];
  };
  assert.deepEqual(expected.omittedTables, ['user_sessions']);
  assert.equal(
    expected.tableRecords.find((table) => table.name === 'marketplace_settings')
      ?.rows,
    1,
  );
  assert.equal(
    expected.tableRecords.find((table) => table.name === 'saved_terms')?.rows,
    2,
  );
  assert.ok(
    expected.tableRecords.every((table) => /^[a-f0-9]{64}$/.test(table.sha256)),
  );
});

void test('separate protected key recovery preserves the same authenticator and consumed-code state after a fixture transfer', async () => {
  const keyBytes = Buffer.alloc(32, 49);
  const key = keyBytes.toString('base64url');
  const keyId = securityKeyId(key);
  const userId = 'account-1';
  const rowKey = 'auth-private:account:account-1';
  const secret = 'JBSWY3DPEHPK3PXP';
  const usedCode = '01234567-89ABCDEF-01234567-89ABCDEF';
  const unusedCode = '11112222-33334444-55556666-77778888';
  const account = {
    factor: { secret, lastCounter: 500 },
    recovery: {
      setId: 'fictional-set',
      hashes: [recoveryCodeHash(userId, 'fictional-set', unusedCode)],
    },
  };
  const data = fixture();
  data.inventory.security.keyIds = [keyId];
  const raw = encryptSecurityValue(key, rowKey, userId, account);
  data.rows.get('marketplace_settings')![0][1] = encodePortableValue(raw);
  const archive = await collect(
    preparePortableTransfer(data.source, {
      passphrase,
      packageId: 'mfa-transfer',
    }),
  );
  const keyBundle = await exportKeyRecovery(
    {
      version: 1,
      activeKeyId: keyId,
      keys: [{ id: keyId, keyBase64: keyBytes.toString('base64') }],
    },
    passphrase,
  );
  const recovered = await inspectKeyRecovery(keyBundle, passphrase);
  const recoveredKey = Buffer.from(
    recovered.keys[0].keyBase64,
    'base64',
  ).toString('base64url');
  const target = targetFixture();
  target.state.keyIds = [keyId];
  await restorePortableTransfer(archive, passphrase, target.target, {
    approved: true,
    expectedPackageId: 'mfa-transfer',
  });
  const restoredRows = target.written.get('marketplace_settings') as {
    type: string;
    value?: string;
  }[][];
  const restoredRaw = restoredRows[0][1].value!;
  assert.equal(restoredRaw, raw);
  const restored = decryptSecurityValue(
    recoveredKey,
    rowKey,
    userId,
    restoredRaw,
  ) as typeof account;
  assert.equal(
    totpAtCounter(restored.factor.secret, 501),
    totpAtCounter(secret, 501),
  );
  assert.equal(
    verifyTotp(
      restored.factor.secret,
      totpAtCounter(secret, 500),
      501 * 30_000,
      restored.factor.lastCounter,
    ),
    null,
  );
  assert.equal(
    restored.recovery.hashes.includes(
      recoveryCodeHash(userId, restored.recovery.setId, usedCode),
    ),
    false,
  );
  assert.equal(
    restored.recovery.hashes.includes(
      recoveryCodeHash(userId, restored.recovery.setId, unusedCode),
    ),
    true,
  );
  assert.equal(target.written.has('user_sessions'), false);
});

void test('bounded frame and value sizes reject oversized input without accepting partial data', async () => {
  assert.throws(
    () => encodePortableValue('x'.repeat(262_145)),
    /bounded value size/i,
  );
  async function* oversized() {
    yield new Uint8Array(710_001).fill(65);
  }
  await assert.rejects(async () => {
    for await (const _ of decryptPortableFrames(
      oversized(),
      passphrase,
      'data',
    )) {
      /* parse */
    }
  }, /bounded size/i);
  async function* unsupported() {
    yield { type: 'record', value: 'x'.repeat(524_289) };
  }
  await assert.rejects(
    () => collect(encryptPortableFrames(unsupported(), passphrase, 'data')),
    /bounded size/i,
  );
});

void test('memory-heavy key derivation fails fast when another transfer operation already occupies the budget', async () => {
  async function* frame() {
    yield { type: 'budget-fixture' };
  }
  const first = collect(encryptPortableFrames(frame(), passphrase, 'data'));
  try {
    await assert.rejects(
      () => collect(encryptPortableFrames(frame(), passphrase, 'data')),
      /another secure transfer operation/i,
    );
  } finally {
    await first;
  }
  assert.ok(
    (await collect(encryptPortableFrames(frame(), passphrase, 'data'))).length >
      0,
  );
});

void test('cancelled exports close the source snapshot and the active media reader', async () => {
  const data = fixture();
  const state = { readerStarted: false, readerClosed: false };
  const open = data.source.openSnapshot.bind(data.source);
  data.source.openSnapshot = async () => {
    const snapshot = await open();
    const objects = snapshot.objects.bind(snapshot);
    snapshot.objects = async function* (namespace) {
      for await (const object of objects(namespace)) {
        yield {
          ...object,
          bytes: (async function* () {
            state.readerStarted = true;
            try {
              yield new Uint8Array([0, 255]);
              yield new Uint8Array([1, 2]);
            } finally {
              state.readerClosed = true;
            }
          })(),
        };
      }
    };
    return snapshot;
  };
  const iterator = preparePortableTransfer(data.source, { passphrase });
  for (let i = 0; !state.readerStarted && i < 100; i++) await iterator.next();
  assert.equal(state.readerStarted, true);
  await iterator.return(undefined);
  assert.equal(state.readerClosed, true);
  assert.equal(data.state.closed, true);
});

void test('portable values preserve NULL, empty text, exact decimals, big integers and binary separately', () => {
  assert.deepEqual(encodePortableValue(null), { type: 'null' });
  assert.deepEqual(encodePortableValue(''), { type: 'text', value: '' });
  assert.deepEqual(encodePortableValue(BigInt('900719925474099312345')), {
    type: 'integer',
    value: '900719925474099312345',
  });
  assert.deepEqual(decimalPortableValue('12.3400'), {
    type: 'decimal',
    value: '12.3400',
  });
  assert.deepEqual(encodePortableValue(new Uint8Array([0, 255, 1])), {
    type: 'bytes',
    value: 'AP8B',
  });
  assert.deepEqual(encodePortableValue(-0), { type: 'real', value: '-0' });
  assert.throws(
    () => encodePortableValue(Number.MAX_SAFE_INTEGER + 1),
    /unsafe integer/i,
  );
  assert.throws(
    () => validatePortableValue({ type: 'integer', value: '01' }),
    /integer/i,
  );
  assert.throws(
    () => validatePortableValue({ type: 'real', value: 'Infinity' }),
    /real/i,
  );
  assert.throws(
    () => validatePortableValue({ type: 'bytes', value: 'AP8B=' }),
    /binary/i,
  );
});
