import { createHash, randomUUID, type Hash } from 'node:crypto';
import { currentSchemaPortableTableClass } from './current-schema-table-policy';
import {
  decryptPortableFrames,
  encryptPortableFrames,
  PORTABLE_FRAME_MAX_BYTES,
} from './crypto';
import type {
  PortableInput,
  PortableInspection,
  PortableInventory,
  PortableManifest,
  PortableNamespace,
  PortableNamespaceManifest,
  PortableObjectMetadata,
  PortableRestoreTarget,
  PortableRestoreTransaction,
  PortableRestoreManifest,
  PortableSourceSnapshot,
  PortableTable,
  PortableTableClass,
  PortableTableManifest,
  PortableTransferSource,
} from './types';
import {
  canonicalJson,
  exactKeys,
  isPlainRecord,
  validatePortableValue,
  type PortableRow,
} from './values';
export * from './types';
export { exportKeyRecovery, inspectKeyRecovery } from './crypto';

const MAX_TABLES = 2_048;
const MAX_COLUMNS = 512;
const MAX_NAMESPACES = 128;
const MAX_TOTAL_ROWS = 100_000_000;
const MAX_TOTAL_OBJECTS = 1_000_000;
const MAX_TOTAL_MEDIA_BYTES = 10 * 1024 ** 4;
const OBJECT_CHUNK_BYTES = 65_536;
const MAX_ROW_BATCH_BYTES = 480_000;
const MAX_ROWS_PER_FRAME = 128;
const tableClasses: PortableTableClass[] = [
  'durable',
  'security',
  'installation',
  'transient',
  'dispatch',
];
const hashPattern = /^[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new Error(message);
}
function hasControl(value: string, all = true): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (
      all ? code < 32 || code === 127 : code === 0 || code === 10 || code === 13
    )
      return true;
  }
  return false;
}
function text(
  value: unknown,
  name: string,
  max = 191,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    Buffer.byteLength(value) > max ||
    hasControl(value)
  )
    return fail('Invalid portable ' + name + '.');
}
function identifier(value: unknown, name: string): asserts value is string {
  text(value, name);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
    return fail('Invalid portable ' + name + '.');
}
function count(
  value: unknown,
  name: string,
  max = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > max
  )
    return fail('Invalid portable ' + name + '.');
}
function uniqueStrings(
  value: unknown,
  name: string,
  max: number,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((item) => typeof item !== 'string') ||
    new Set(value).size !== value.length
  )
    return fail('Invalid or duplicated portable ' + name + '.');
}
function date(value: unknown, name: string): void {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    return fail('Invalid portable ' + name + '.');
}

/** These classes cannot be weakened by a supplied manifest. */
export function requiredPortableTableClass(
  name: string,
): PortableTableClass | undefined {
  if (name === 'traffic_sessions') return 'durable';
  if (name === 'staff_invitations') return 'security';
  // Grant selections are retained with their invitation. Both restore paths
  // expire pending invitations before the live acceptance code can use them.
  if (name === 'staff_invitation_grants') return 'security';
  if (
    /^(?:user_sessions|email_login_challenges|password_reset_challenges|request_rate_limits|operation_transaction_guards)$/.test(
      name,
    ) ||
    /(?:_sessions|_challenges|_leases|_grants|_tokens)$/.test(name)
  )
    return 'transient';
  if (
    /^(?:sqlite_sequence|d1_migrations|_cf_METADATA|__drizzle_migrations)$/.test(
      name,
    )
  )
    return 'installation';
  if (/^(?:notification_messages|order_email_jobs|shipping_jobs)$/.test(name))
    return 'dispatch';
  return currentSchemaPortableTableClass(name);
}

export function isPortableTransientSetting(key: string): boolean {
  return /^auth-private:(?:session|primary|bootstrap|challenge|download|transfer-grant):/.test(
    key,
  );
}

export function validatePortableInventory(
  value: unknown,
): asserts value is PortableInventory {
  if (!isPlainRecord(value)) return fail('Invalid portable inventory.');
  exactKeys(value, [
    'version',
    'installationId',
    'databaseEngine',
    'schemaFingerprint',
    'application',
    'snapshot',
    'discoveredTables',
    ...(Object.hasOwn(value, 'providerManagedTables')
      ? ['providerManagedTables']
      : []),
    'discoveredNamespaces',
    'tables',
    'namespaces',
    'security',
  ]);
  if (value.version !== 1)
    return fail('Unsupported portable inventory version.');
  text(value.installationId, 'installation ID');
  text(value.databaseEngine, 'database engine', 64);
  if (
    typeof value.schemaFingerprint !== 'string' ||
    !hashPattern.test(value.schemaFingerprint)
  )
    return fail('Invalid schema fingerprint.');
  if (!isPlainRecord(value.application))
    return fail('Invalid application requirements.');
  exactKeys(value.application, [
    'release',
    'schemaVersion',
    'requiredEnvironmentNames',
    'artifactSha256',
  ]);
  text(value.application.release, 'application release');
  text(value.application.schemaVersion, 'schema version');
  uniqueStrings(
    value.application.requiredEnvironmentNames,
    'environment names',
    256,
  );
  for (const name of value.application.requiredEnvironmentNames)
    if (!/^[A-Z][A-Z0-9_]{0,95}$/.test(name))
      return fail('Invalid environment name: values must never be exported.');
  if (
    value.application.artifactSha256 !== null &&
    (typeof value.application.artifactSha256 !== 'string' ||
      !hashPattern.test(value.application.artifactSha256))
  )
    return fail('Invalid application artifact hash.');
  if (!isPlainRecord(value.snapshot)) return fail('Invalid source snapshot.');
  exactKeys(value.snapshot, ['cutoff', 'revision', 'writeMode']);
  date(value.snapshot.cutoff, 'snapshot cutoff');
  text(value.snapshot.revision, 'snapshot revision', 256);
  if (
    value.snapshot.writeMode !== 'paused' &&
    value.snapshot.writeMode !== 'preliminary'
  )
    return fail('A final snapshot requires paused source writes.');
  uniqueStrings(value.discoveredTables, 'discovered tables', MAX_TABLES);
  const providerNames: string[] = [];
  if (Object.hasOwn(value, 'providerManagedTables')) {
    if (
      !Array.isArray(value.providerManagedTables) ||
      value.providerManagedTables.length > 1
    )
      return fail('Invalid provider-managed table exclusions.');
    for (const entry of value.providerManagedTables) {
      if (!isPlainRecord(entry))
        return fail('Invalid provider-managed table exclusion.');
      exactKeys(entry, ['name', 'reason']);
      if (entry.name !== '_cf_METADATA' || entry.reason !== 'provider-internal')
        return fail('Only reviewed provider-owned metadata may be excluded.');
      providerNames.push(entry.name);
    }
  }
  uniqueStrings(
    value.discoveredNamespaces,
    'discovered namespaces',
    MAX_NAMESPACES,
  );
  if (
    !Array.isArray(value.tables) ||
    value.tables.length < 1 ||
    value.tables.length > MAX_TABLES
  )
    return fail('Invalid table inventory.');
  let totalRows = 0;
  for (const table of value.tables) {
    if (!isPlainRecord(table)) return fail('Invalid table inventory.');
    exactKeys(table, [
      'name',
      'columns',
      'primaryKey',
      'classification',
      'rowCount',
    ]);
    identifier(table.name, 'table name');
    if (table.name === '_cf_METADATA')
      return fail(
        'Provider-owned metadata must be an explicit exclusion, never a copied table.',
      );
    if (!tableClasses.includes(table.classification as PortableTableClass))
      return fail('Unclassified table in inventory.');
    const required = requiredPortableTableClass(table.name);
    if (required && required !== table.classification)
      return fail(
        'Protected ' + required + ' table classification cannot be changed.',
      );
    count(table.rowCount, 'row count', MAX_TOTAL_ROWS);
    totalRows += table.rowCount;
    if (totalRows > MAX_TOTAL_ROWS)
      return fail('Portable row inventory exceeds the supported bound.');
    if (
      !Array.isArray(table.columns) ||
      table.columns.length < 1 ||
      table.columns.length > MAX_COLUMNS
    )
      return fail('Invalid table columns.');
    const names: string[] = [];
    for (const column of table.columns) {
      if (!isPlainRecord(column)) return fail('Invalid table column.');
      exactKeys(column, [
        'name',
        'declaredType',
        'nullable',
        ...(Object.hasOwn(column, 'generated') ? ['generated'] : []),
      ]);
      identifier(column.name, 'column name');
      if (
        typeof column.declaredType !== 'string' ||
        column.declaredType.length > 128 ||
        hasControl(column.declaredType) ||
        typeof column.nullable !== 'boolean' ||
        (Object.hasOwn(column, 'generated') &&
          column.generated !== 'virtual' &&
          column.generated !== 'stored')
      )
        return fail('Invalid table column type.');
      names.push(column.name);
    }
    if (new Set(names).size !== names.length)
      return fail('Duplicate table column.');
    uniqueStrings(table.primaryKey, 'primary key', MAX_COLUMNS);
    if (table.primaryKey.some((key) => !names.includes(key)))
      return fail('Unknown primary-key column.');
  }
  const tableNames = value.tables.map((table) => (table as PortableTable).name);
  if (
    new Set(tableNames).size !== tableNames.length ||
    providerNames.some((name) => tableNames.includes(name)) ||
    canonicalJson([...tableNames, ...providerNames].sort()) !==
      canonicalJson([...value.discoveredTables].sort())
  )
    return fail('Discovered table inventory is incomplete or duplicated.');
  if (
    !Array.isArray(value.namespaces) ||
    value.namespaces.length > MAX_NAMESPACES
  )
    return fail('Invalid object namespace inventory.');
  let totalObjects = 0;
  let totalBytes = 0;
  for (const namespace of value.namespaces) {
    if (!isPlainRecord(namespace)) return fail('Invalid object namespace.');
    exactKeys(namespace, ['id', 'access', 'objectCount', 'totalBytes']);
    identifier(namespace.id, 'namespace');
    if (namespace.access !== 'private' && namespace.access !== 'public')
      return fail('Unclassified object namespace.');
    count(namespace.objectCount, 'object count', MAX_TOTAL_OBJECTS);
    count(namespace.totalBytes, 'object bytes', MAX_TOTAL_MEDIA_BYTES);
    totalObjects += namespace.objectCount;
    totalBytes += namespace.totalBytes;
  }
  if (totalObjects > MAX_TOTAL_OBJECTS || totalBytes > MAX_TOTAL_MEDIA_BYTES)
    return fail('Object inventory exceeds its supported bound.');
  const namespaceNames = value.namespaces.map(
    (namespace) => (namespace as PortableNamespace).id,
  );
  if (
    new Set(namespaceNames).size !== namespaceNames.length ||
    canonicalJson([...namespaceNames].sort()) !==
      canonicalJson([...value.discoveredNamespaces].sort())
  )
    return fail(
      'Discovered object namespace inventory is incomplete or duplicated.',
    );
  if (!isPlainRecord(value.security))
    return fail('Invalid portable security inventory.');
  exactKeys(value.security, ['keyIds', 'payloadVersions']);
  uniqueStrings(value.security.keyIds, 'key IDs', 32);
  for (const id of value.security.keyIds)
    if (!/^[A-Za-z0-9_-]{1,96}$/.test(id))
      return fail('Invalid security key ID.');
  if (
    !Array.isArray(value.security.payloadVersions) ||
    value.security.payloadVersions.length > 8 ||
    new Set(value.security.payloadVersions).size !==
      value.security.payloadVersions.length ||
    value.security.payloadVersions.some((version) => version !== 1)
  )
    return fail('Unknown security payload version blocks complete transfer.');
  if (Buffer.byteLength(canonicalJson(value)) > PORTABLE_FRAME_MAX_BYTES - 64)
    return fail('Portable inventory exceeds its bounded frame size.');
}

function validateRow(
  row: unknown,
  table: PortableTable,
): asserts row is PortableRow {
  if (!Array.isArray(row) || row.length !== table.columns.length)
    return fail('Portable row does not match its table columns.');
  for (let i = 0; i < row.length; i++) {
    validatePortableValue(row[i]);
    if (row[i].type === 'null' && !table.columns[i].nullable)
      return fail('NULL in a required portable column.');
  }
  if (Buffer.byteLength(canonicalJson(row)) > MAX_ROW_BATCH_BYTES - 100)
    return fail(
      'Portable row exceeds its bounded size; use a chunked compatible adapter.',
    );
}

function validatePrivateSecurityRow(
  table: PortableTable,
  row: PortableRow,
  inventory: PortableInventory,
): void {
  if (table.name !== 'marketplace_settings') return;
  const key = row[table.columns.findIndex((column) => column.name === 'key')];
  if (!key || key.type !== 'text') return fail('Invalid security setting key.');
  if (
    !key.value.startsWith('auth-private:') ||
    isPortableTransientSetting(key.value)
  )
    return;
  if (
    key.value !== 'auth-private:manifest:v1' &&
    !key.value.startsWith('auth-private:account:')
  )
    return fail('Unknown private security state blocks complete transfer.');
  const stored =
    row[table.columns.findIndex((column) => column.name === 'value')];
  if (!stored || stored.type !== 'text')
    return fail('Invalid encrypted security setting.');
  let envelope: unknown;
  try {
    envelope = JSON.parse(stored.value);
  } catch {
    return fail('Corrupt encrypted security setting.');
  }
  if (!isPlainRecord(envelope))
    return fail('Corrupt encrypted security envelope.');
  exactKeys(envelope, ['v', 'kid', 'n', 'c', 't']);
  if (envelope.v !== 1 || !inventory.security.payloadVersions.includes(1))
    return fail('Unknown encrypted security payload version.');
  if (
    typeof envelope.kid !== 'string' ||
    !/^[a-f0-9]{32}$/.test(envelope.kid) ||
    !inventory.security.keyIds.includes(envelope.kid)
  )
    return fail('Encrypted security key is missing from inventory.');
  for (const [field, size] of [
    ['n', 12],
    ['t', 16],
    ['c', null],
  ] as const) {
    const encoded = envelope[field];
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9_-]+$/.test(encoded))
      return fail('Corrupt encrypted security bytes.');
    const bytes = Buffer.from(encoded, 'base64url');
    if (
      bytes.toString('base64url') !== encoded ||
      (size !== null && bytes.length !== size) ||
      !bytes.length
    )
      return fail('Corrupt encrypted security byte size.');
  }
}

function metadataMap(value: unknown): void {
  if (!isPlainRecord(value) || Object.keys(value).length > 64)
    return fail('Invalid object metadata.');
  for (const [key, entry] of Object.entries(value)) {
    text(key, 'metadata name', 128);
    if (
      typeof entry !== 'string' ||
      Buffer.byteLength(entry) > 8192 ||
      hasControl(entry, false)
    )
      return fail('Invalid object metadata value.');
  }
  if (Buffer.byteLength(canonicalJson(value)) > 32_768)
    return fail('Object metadata exceeds its bounded size.');
}

function validateObjectMetadata(
  value: unknown,
  namespace: PortableNamespace,
): asserts value is PortableObjectMetadata {
  if (!isPlainRecord(value)) return fail('Invalid portable object metadata.');
  exactKeys(value, [
    'namespace',
    'key',
    'size',
    'contentType',
    'customMetadata',
    'httpMetadata',
  ]);
  if (value.namespace !== namespace.id)
    return fail('Object belongs to an unlisted namespace.');
  text(value.key, 'object key', 1024);
  if (
    value.key.startsWith('/') ||
    value.key.includes('\\') ||
    value.key
      .split('/')
      .some((segment) => segment === '.' || segment === '..' || !segment) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value.key)
  )
    return fail('Unsafe object key; extraction paths and URLs are prohibited.');
  count(value.size, 'object size', MAX_TOTAL_MEDIA_BYTES);
  text(value.contentType, 'content type', 256);
  metadataMap(value.customMetadata);
  metadataMap(value.httpMetadata);
  if (namespace.access === 'public' && value.key.startsWith('private/'))
    return fail('Private object cannot be reclassified as public.');
}

function hashFrame(hash: Hash, value: unknown): void {
  const bytes = Buffer.from(canonicalJson(value));
  hash.update(String(bytes.length) + ':');
  hash.update(bytes);
}

/** Hash logical rows in export order, after selecting columns in schema order. */
export function portableRowsHash(rows: Iterable<PortableRow>): string {
  const hash = createHash('sha256');
  for (const row of rows) hashFrame(hash, row);
  return hash.digest('hex');
}

async function* snapshotFrames(
  snapshot: PortableSourceSnapshot,
  packageId: string,
): AsyncGenerator<unknown> {
  const inventory = snapshot.inventory;
  validatePortableInventory(inventory);
  const content = createHash('sha256');
  let frames = 0;
  const tableRecords: PortableTableManifest[] = [];
  const media: PortableNamespaceManifest[] = [];
  function record(frame: unknown): unknown {
    hashFrame(content, frame);
    frames++;
    return frame;
  }
  yield record({ type: 'inventory', inventory });
  for (const table of inventory.tables) {
    yield record({ type: 'table-start', name: table.name });
    const hash = createHash('sha256');
    let rows = 0;
    let batch: PortableRow[] = [];
    let bytes = 0;
    for await (const row of snapshot.rows(table)) {
      validateRow(row, table);
      validatePrivateSecurityRow(table, row, inventory);
      rows++;
      if (rows > table.rowCount)
        return fail('Source table row count changed during export.');
      const size = Buffer.byteLength(canonicalJson(row)) + 1;
      if (
        batch.length &&
        (bytes + size > MAX_ROW_BATCH_BYTES ||
          batch.length >= MAX_ROWS_PER_FRAME)
      ) {
        yield record({ type: 'rows', rows: batch });
        batch = [];
        bytes = 0;
      }
      hashFrame(hash, row);
      batch.push(row);
      bytes += size;
    }
    if (batch.length) yield record({ type: 'rows', rows: batch });
    if (rows !== table.rowCount)
      return fail('Source table row count changed during export.');
    const entry = { name: table.name, rows, sha256: hash.digest('hex') };
    tableRecords.push(entry);
    yield record({ type: 'table-end', ...entry });
  }
  for (const namespace of inventory.namespaces) {
    yield record({ type: 'namespace-start', id: namespace.id });
    const namespaceHash = createHash('sha256');
    let objects = 0;
    let totalBytes = 0;
    let previousKey: string | undefined;
    for await (const object of snapshot.objects(namespace)) {
      const metadata = {
        namespace: object.namespace,
        key: object.key,
        size: object.size,
        contentType: object.contentType,
        customMetadata: object.customMetadata,
        httpMetadata: object.httpMetadata,
      };
      validateObjectMetadata(metadata, namespace);
      if (
        previousKey !== undefined &&
        Buffer.compare(Buffer.from(previousKey), Buffer.from(metadata.key)) >= 0
      )
        return fail('Object keys must be unique and in ascending UTF-8 order.');
      previousKey = metadata.key;
      objects++;
      if (objects > namespace.objectCount)
        return fail('Source object count changed during export.');
      yield record({ type: 'object-start', object: metadata });
      const hash = createHash('sha256');
      let size = 0;
      for await (const bytes of object.bytes) {
        if (!(bytes instanceof Uint8Array))
          return fail('Object adapter must return byte chunks.');
        for (
          let offset = 0;
          offset < bytes.length;
          offset += OBJECT_CHUNK_BYTES
        ) {
          const chunk = bytes.subarray(offset, offset + OBJECT_CHUNK_BYTES);
          size += chunk.length;
          if (size > metadata.size)
            return fail('Source object size changed during export.');
          hash.update(chunk);
          yield record({
            type: 'object-bytes',
            data: Buffer.from(chunk).toString('base64'),
          });
        }
      }
      if (size !== metadata.size)
        return fail('Source object size changed during export.');
      const sha256 = hash.digest('hex');
      totalBytes += size;
      hashFrame(namespaceHash, { object: metadata, sha256 });
      yield record({ type: 'object-end', size, sha256 });
    }
    if (
      objects !== namespace.objectCount ||
      totalBytes !== namespace.totalBytes
    )
      return fail('Source object inventory changed during export.');
    const entry = {
      id: namespace.id,
      objects,
      bytes: totalBytes,
      sha256: namespaceHash.digest('hex'),
    };
    media.push(entry);
    yield record({ type: 'namespace-end', ...entry });
  }
  if (!(await snapshot.verifyUnchanged()))
    return fail(
      'Source changed: no complete consistent snapshot can be issued. Pause writes and retry.',
    );
  yield {
    type: 'manifest',
    manifest: {
      packageId,
      tableRecords,
      media,
      contentSha256: content.digest('hex'),
      frameCount: frames,
    } satisfies PortableManifest,
  };
}

/** Bounded encrypted chunks. Store/yield each chunk as it arrives; do not concatenate large jobs. */
export async function* preparePortableTransfer(
  source: PortableTransferSource,
  options: { passphrase: string; packageId?: string; now?: number },
): AsyncGenerator<Uint8Array> {
  const snapshot = await source.openSnapshot();
  try {
    const packageId = options.packageId ?? randomUUID();
    yield* encryptPortableFrames(
      snapshotFrames(snapshot, packageId),
      options.passphrase,
      'data',
      { ...options, packageId },
    );
  } finally {
    await snapshot.close();
  }
}

function rowForRestore(
  table: PortableTable,
  row: PortableRow,
): PortableRow | null {
  if (
    table.classification === 'transient' ||
    table.classification === 'installation'
  )
    return null;
  if (table.name === 'marketplace_settings') {
    const key = row[table.columns.findIndex((column) => column.name === 'key')];
    if (!key || key.type !== 'text')
      return fail('Invalid security setting key during restore.');
    if (isPortableTransientSetting(key.value)) return null;
    if (
      key.value.startsWith('auth-private:') &&
      key.value !== 'auth-private:manifest:v1' &&
      !key.value.startsWith('auth-private:account:')
    )
      return fail('Unknown private security state blocks activation.');
  }
  if (table.name === 'staff_invitations') {
    const index = table.columns.findIndex((column) => column.name === 'status');
    const status = row[index];
    if (
      !status ||
      status.type !== 'text' ||
      !['pending', 'accepted', 'revoked', 'expired'].includes(status.value)
    )
      return fail('Unknown staff invitation state blocks safe restoration.');
    if (status.value === 'pending') {
      const expired = [...row];
      expired[index] = { type: 'text', value: 'expired' };
      return expired;
    }
  }
  // Retire restored worker credentials without changing the next eligible message.
  const leaseColumns =
    table.name === 'operational_reminder_cursors'
      ? ['lease_token', 'lease_until']
      : table.name === 'commission_terms_email_controls'
        ? ['routine_claim_token']
        : [];
  if (leaseColumns.length) {
    const restored = [...row];
    for (const name of leaseColumns) {
      const index = table.columns.findIndex((column) => column.name === name);
      if (index < 0 || !table.columns[index].nullable)
        return fail('Unknown worker lease schema blocks safe restoration.');
      restored[index] = { type: 'null' };
    }
    return restored;
  }
  return row;
}

async function inspectOrRestore(
  input: PortableInput,
  passphrase: string,
  restore?: { target: PortableRestoreTarget; expectedPackageId: string },
): Promise<PortableInspection> {
  let inventory: PortableInventory | undefined;
  let packageId = '';
  let tableIndex = 0;
  let namespaceIndex = 0;
  let table: PortableTable | undefined;
  let namespace: PortableNamespace | undefined;
  let tableRows = 0;
  let tableHash: Hash | undefined;
  let restoredTableHash: Hash | undefined;
  let restoredTableRows = 0;
  let objects = 0;
  let objectBytes = 0;
  let namespaceHash: Hash | undefined;
  let object: PortableObjectMetadata | undefined;
  let objectHash: Hash | undefined;
  let objectSize = 0;
  let previousKey: string | undefined;
  let frameCount = 0;
  const content = createHash('sha256');
  const tableRecords: PortableTableManifest[] = [];
  const media: PortableNamespaceManifest[] = [];
  const expectedRestored: PortableRestoreManifest = {
    tableRecords: [],
    media,
    omittedTables: [],
  };
  let manifest: PortableManifest | undefined;
  let transaction: PortableRestoreTransaction | undefined;
  try {
    for await (const { header, value } of decryptPortableFrames(
      input,
      passphrase,
      'data',
    )) {
      if (!isPlainRecord(value) || typeof value.type !== 'string' || manifest)
        return fail('Unexpected portable frame after manifest.');
      packageId ||= header.packageId;
      if (restore && packageId !== restore.expectedPackageId)
        return fail(
          'Package ID does not match the explicitly approved package.',
        );
      if (value.type !== 'manifest') {
        hashFrame(content, value);
        frameCount++;
      }
      switch (value.type) {
        case 'inventory': {
          exactKeys(value, ['type', 'inventory']);
          if (inventory) return fail('Duplicate portable inventory.');
          validatePortableInventory(value.inventory);
          inventory = value.inventory;
          expectedRestored.omittedTables.push(
            ...(inventory.providerManagedTables ?? []).map(
              (entry) => entry.name,
            ),
          );
          if (restore) {
            const readiness = await restore.target.preflight(inventory);
            if (!readiness.empty)
              return fail(
                'Restore requires an explicitly approved empty isolated target.',
              );
            if (
              !readiness.applicationCompatible ||
              readiness.schemaFingerprint !== inventory.schemaFingerprint
            )
              return fail(
                'Destination application/schema is incompatible. No schema changes were made.',
              );
            if (!readiness.dispatchPaused)
              return fail(
                'Destination dispatch and background jobs must remain paused.',
              );
            if (
              inventory.security.keyIds.some(
                (id) => !readiness.availableKeyIds.includes(id),
              )
            )
              return fail(
                'Destination is missing the protected MFA key recovery material.',
              );
            transaction = await restore.target.begin(inventory);
          }
          break;
        }
        case 'table-start': {
          exactKeys(value, ['type', 'name']);
          if (
            !inventory ||
            table ||
            namespace ||
            namespaceIndex ||
            value.name !== inventory.tables[tableIndex]?.name
          )
            return fail('Invalid portable table order.');
          table = inventory.tables[tableIndex];
          tableRows = 0;
          tableHash = createHash('sha256');
          restoredTableRows = 0;
          restoredTableHash = createHash('sha256');
          break;
        }
        case 'rows': {
          exactKeys(value, ['type', 'rows']);
          if (
            !table ||
            !tableHash ||
            !Array.isArray(value.rows) ||
            !value.rows.length ||
            value.rows.length > MAX_ROWS_PER_FRAME
          )
            return fail('Invalid bounded portable row batch.');
          const rows: PortableRow[] = [];
          for (const row of value.rows) {
            validateRow(row, table);
            tableRows++;
            validatePrivateSecurityRow(table, row, inventory!);
            if (tableRows > table.rowCount)
              return fail('Portable table row count mismatch.');
            hashFrame(tableHash, row);
            const restored = rowForRestore(table, row);
            if (restored) {
              restoredTableRows++;
              hashFrame(restoredTableHash!, restored);
            }
            if (transaction && restored) rows.push(restored);
          }
          if (rows.length) await transaction!.writeRows(table, rows);
          break;
        }
        case 'table-end': {
          exactKeys(value, ['type', 'name', 'rows', 'sha256']);
          if (!table || !tableHash || tableRows !== table.rowCount)
            return fail('Portable table row count mismatch.');
          const entry = {
            name: table.name,
            rows: tableRows,
            sha256: tableHash.digest('hex'),
          };
          if (
            canonicalJson(value) !==
            canonicalJson({ type: 'table-end', ...entry })
          )
            return fail('Portable table hash/count mismatch.');
          tableRecords.push(entry);
          if (
            table.classification === 'transient' ||
            table.classification === 'installation'
          )
            expectedRestored.omittedTables.push(table.name);
          else
            expectedRestored.tableRecords.push({
              name: table.name,
              rows: restoredTableRows,
              sha256: restoredTableHash!.digest('hex'),
            });
          tableIndex++;
          table = undefined;
          tableHash = undefined;
          break;
        }
        case 'namespace-start': {
          exactKeys(value, ['type', 'id']);
          if (
            !inventory ||
            table ||
            namespace ||
            tableIndex !== inventory.tables.length ||
            value.id !== inventory.namespaces[namespaceIndex]?.id
          )
            return fail('Invalid portable namespace order.');
          namespace = inventory.namespaces[namespaceIndex];
          namespaceHash = createHash('sha256');
          previousKey = undefined;
          objects = 0;
          objectBytes = 0;
          break;
        }
        case 'object-start': {
          exactKeys(value, ['type', 'object']);
          if (!namespace || object) return fail('Unexpected portable object.');
          validateObjectMetadata(value.object, namespace);
          object = value.object;
          if (
            previousKey !== undefined &&
            Buffer.compare(Buffer.from(previousKey), Buffer.from(object.key)) >=
              0
          )
            return fail(
              'Portable object keys must be unique and in ascending UTF-8 order.',
            );
          previousKey = object.key;
          objects++;
          if (objects > namespace.objectCount)
            return fail('Portable object count mismatch.');
          objectSize = 0;
          objectHash = createHash('sha256');
          await transaction?.beginObject(object);
          break;
        }
        case 'object-bytes': {
          exactKeys(value, ['type', 'data']);
          if (
            !object ||
            !objectHash ||
            typeof value.data !== 'string' ||
            value.data.length > Math.ceil(OBJECT_CHUNK_BYTES / 3) * 4 ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              value.data,
            )
          )
            return fail('Invalid bounded object chunk.');
          const bytes = Buffer.from(value.data, 'base64');
          if (
            !bytes.length ||
            bytes.toString('base64') !== value.data ||
            bytes.length > OBJECT_CHUNK_BYTES
          )
            return fail('Invalid object binary encoding.');
          objectSize += bytes.length;
          if (objectSize > object.size)
            return fail('Portable object size mismatch.');
          objectHash.update(bytes);
          await transaction?.writeObjectChunk(bytes);
          break;
        }
        case 'object-end': {
          exactKeys(value, ['type', 'size', 'sha256']);
          if (
            !object ||
            !objectHash ||
            !namespaceHash ||
            objectSize !== object.size
          )
            return fail('Portable object size mismatch.');
          const sha256 = objectHash.digest('hex');
          if (value.sha256 !== sha256 || value.size !== objectSize)
            return fail('Portable object hash mismatch.');
          hashFrame(namespaceHash, { object, sha256 });
          objectBytes += objectSize;
          await transaction?.endObject(sha256);
          object = undefined;
          objectHash = undefined;
          break;
        }
        case 'namespace-end': {
          exactKeys(value, ['type', 'id', 'objects', 'bytes', 'sha256']);
          if (
            !namespace ||
            !namespaceHash ||
            object ||
            objects !== namespace.objectCount ||
            objectBytes !== namespace.totalBytes
          )
            return fail('Portable object namespace inventory mismatch.');
          const entry = {
            id: namespace.id,
            objects,
            bytes: objectBytes,
            sha256: namespaceHash.digest('hex'),
          };
          if (
            canonicalJson(value) !==
            canonicalJson({ type: 'namespace-end', ...entry })
          )
            return fail('Portable object namespace hash mismatch.');
          media.push(entry);
          namespaceIndex++;
          namespace = undefined;
          namespaceHash = undefined;
          break;
        }
        case 'manifest': {
          exactKeys(value, ['type', 'manifest']);
          if (
            !inventory ||
            table ||
            namespace ||
            object ||
            tableIndex !== inventory.tables.length ||
            namespaceIndex !== inventory.namespaces.length
          )
            return fail('Incomplete portable table/object inventory.');
          const expected = {
            packageId,
            tableRecords,
            media,
            contentSha256: content.digest('hex'),
            frameCount,
          };
          if (canonicalJson(value.manifest) !== canonicalJson(expected))
            return fail('Portable manifest hash/count mismatch.');
          manifest = expected;
          break;
        }
        default:
          return fail('Unsupported portable frame type.');
      }
    }
    if (!inventory || !manifest)
      return fail('Incomplete portable package manifest.');
    const warnings = [
      'Existing sessions, one-time challenges and installation metadata are archived but must never be reactivated.',
      'Notification, payment and background dispatch must stay paused until separately reconciled.',
      'The destination must supply a compatible application artifact and separately protected security keyring.',
    ];
    if (inventory.providerManagedTables?.length)
      warnings.push(
        'Provider-owned _cf_METADATA was discovered but not copied. The destination keeps its own internal metadata; all application tables remain checked.',
      );
    if (inventory.tables.some((entry) => entry.name === 'staff_invitations'))
      warnings.push(
        'Pending staff invitations are restored as expired. Accepted and revoked invitation history stays unchanged.',
      );
    if (inventory.snapshot.writeMode === 'preliminary')
      warnings.push(
        'Preliminary backup only: pause source writes and take a final verified snapshot before cutover.',
      );
    if (!inventory.application.artifactSha256)
      warnings.push(
        'Matching application artifact hash is not recorded; deployment/source packaging remains unverified.',
      );
    const inspection: PortableInspection = {
      format: 'hastabazaar-portable',
      version: 1,
      packageId,
      inventory,
      manifest,
      totalRows: tableRecords.reduce((sum, entry) => sum + entry.rows, 0),
      totalObjects: media.reduce((sum, entry) => sum + entry.objects, 0),
      totalObjectBytes: media.reduce((sum, entry) => sum + entry.bytes, 0),
      finalCutoverReady:
        inventory.snapshot.writeMode === 'paused' &&
        Boolean(inventory.application.artifactSha256),
      warnings,
    };
    if (transaction) {
      if (!(await transaction.verify(inspection, expectedRestored)))
        return fail(
          'Restored values, relationships, media or security-state verification failed.',
        );
      await transaction.commit();
    }
    return inspection;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

/** Authenticate and inspect every value and byte without executing uploaded code or SQL. */
export function inspectPortableTransfer(
  input: PortableInput,
  passphrase: string,
): Promise<PortableInspection> {
  return inspectOrRestore(input, passphrase);
}

/** No live destination adapter is implied; callers must supply an approved empty target. */
export function restorePortableTransfer(
  input: PortableInput,
  passphrase: string,
  target: PortableRestoreTarget,
  options: { approved: true; expectedPackageId: string },
): Promise<PortableInspection> {
  if (options.approved !== true || !options.expectedPackageId)
    return Promise.reject(
      new Error('Explicit destination/package approval is required.'),
    );
  return inspectOrRestore(input, passphrase, {
    target,
    expectedPackageId: options.expectedPackageId,
  });
}
