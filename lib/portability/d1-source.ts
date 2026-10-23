import { createHash, type Hash } from 'node:crypto';
import { customerFeeRequiredTables } from '../operations/fee-schema-readiness.mjs';
import type {
  PortableInventory,
  PortableNamespace,
  PortableNamespaceManifest,
  PortableObject,
  PortableObjectMetadata,
  PortableSourceSnapshot,
  PortableTable,
  PortableTableManifest,
  PortableTransferSource,
  PortableTableClass,
} from './types';
import {
  requiredPortableTableClass,
  validatePortableInventory,
} from './transfer';
import {
  canonicalJson,
  isPlainRecord,
  validatePortableValue,
  type PortableRow,
  type PortableValue,
} from './values';

const PAGE_ROWS = 16;
const PAGE_OBJECTS = 64;
const MAX_RAW_ROW_BYTES = 384_000;
const MAX_ROW_BYTES = 480_000;
const MAX_TABLE_ROWS = 100_000_000;
const MAX_OBJECTS = 1_000_000;
const MAX_MEDIA_BYTES = 10 * 1024 ** 4;
const MAX_SCHEMA_OBJECTS = 16_384;
const NAMESPACES = ['private', 'public'] as const;
type NamespaceId = (typeof NAMESPACES)[number];
type SchemaRow = {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
};
type ColumnRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  pk: number;
  hidden?: number;
};
type SqlDiscovery = {
  tables: PortableTable[];
  schemaFingerprint: string;
  discoveredTables: string[];
  providerManagedTables: NonNullable<
    PortableInventory['providerManagedTables']
  >;
};
type Capture = SqlDiscovery & {
  tableRecords: PortableTableManifest[];
  media: PortableNamespaceManifest[];
  namespaces: PortableNamespace[];
  revision: string;
};
type Reader = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
};
type ListedObject = {
  key: string;
  size: number;
  httpMetadata?: Record<string, unknown>;
  customMetadata?: Record<string, unknown>;
};
type SourceOptions = {
  installationId: string;
  release: string;
  keyIds: string[];
  schemaVersion?: string;
  signal?: AbortSignal;
  /** Trusted release/fixture code only. Never accept this map from a request or archive. */
  tableClassifications?: Readonly<Record<string, PortableTableClass>>;
  /** Trusted server registry only. Never derive paths/readers from an archive or request. */
  applicationMedia?: readonly ApplicationMedia[];
};
export interface ApplicationMedia {
  metadata: PortableObjectMetadata;
  open(): Promise<{
    key: string;
    size: number;
    httpMetadata: Record<string, string>;
    customMetadata: Record<string, string>;
    body: ReadableStream<Uint8Array>;
  }>;
}
type ApplicationMediaMap = ReadonlyMap<string, ApplicationMedia>;

// Reviewed against migrations 0000–0074, db/schema.ts and hosted-auth readiness.
// Discovery remains dynamic: a new/unknown table stops export until its policy
// is deliberately added here. No suffix or broad durable fallback grants trust.
const REVIEWED_TABLE_GROUPS: Readonly<
  Record<PortableTableClass, readonly string[]>
> = {
  durable: [
    ...Object.keys(customerFeeRequiredTables),
    'address_answer_owner_tombstones',
    'address_locations',
    'addresses',
    'audit_logs',
    'backup_verifications',
    'business_setting_versions',
    'cart_items',
    'carts',
    'categories',
    'category_image_assignments',
    'category_media',
    'commission_control',
    'commission_rate_acceptances',
    'commission_rate_cancellations',
    'commission_rate_changes',
    'complaint_events',
    'complaints',
    'data_rights_events',
    'data_rights_legal_holds',
    'data_rights_requests',
    'delivery_assignments',
    'delivery_rate_current',
    'delivery_rate_versions',
    'exception_work_events',
    'exception_work_items',
    'first_cod_reviews',
    'form_answer_sets',
    'form_config_versions',
    'gift_cards',
    'homepage_hero_media',
    'homepage_product_controls',
    'inventory_adjustments',
    'loyalty_accounts',
    'loyalty_config',
    'loyalty_daily_claims',
    'loyalty_day_issuance',
    'loyalty_points_entries',
    'loyalty_redemptions',
    'loyalty_revisions',
    'marketplace_fee_waiver_control',
    'marketplace_fee_waiver_campaigns',
    'marketplace_fee_waiver_revisions',
    'marketplace_fee_waiver_requests',
    'order_item_marketplace_fees',
    'managed_commercial_snapshots',
    'managed_entitlements',
    'managed_invoice_adjustments',
    'managed_invoice_groups',
    'managed_maker_application_details',
    'managed_payout_allocations',
    'managed_payout_entries',
    'managed_payouts',
    'managed_settlement_entries',
    'managed_supplier_adjustments',
    'managed_supplier_obligations',
    'managed_supplier_payments',
    'managed_supply_records',
    'moderation_events',
    'occasions',
    'operational_incidents',
    'order_cancellation_events',
    'order_cancellation_reviews',
    'order_documents',
    'order_item_status_events',
    'order_items',
    'order_policy_acceptances',
    'order_status_events',
    'orders',
    'parcel_cash_records',
    'parcel_courier_costs',
    'parcel_operation_events',
    'payments',
    'payout_entries',
    'payout_events',
    'payout_requests',
    'payouts',
    'policy_versions',
    'product_deletions',
    'product_media',
    'product_occasions',
    'product_reviews',
    'product_sku_claims',
    'products',
    'prohibited_product_rules',
    'promo_campaigns',
    'promo_customer_usage',
    'promo_redemptions',
    'promo_revisions',
    'promotion_products',
    'promotions',
    'recently_viewed_products',
    'referral_campaign',
    'referral_redemptions',
    'refund_liability_entries',
    'refunds',
    'return_evidence',
    'return_outcomes',
    'return_request_events',
    'return_requests',
    'review_photos',
    'review_replies',
    'rider_applications',
    'rider_assignment_snapshots',
    'rider_cash_obligations',
    'rider_compensation_entries',
    'rider_events',
    'rider_policy',
    'rider_policy_versions',
    'rider_profiles',
    'rider_remittance_allocations',
    'rider_reports',
    'seller_agreement_acceptance_history',
    'seller_deletion_preflights',
    'seller_documents',
    'seller_ledger_entries',
    'seller_operational_addresses',
    'seller_participation_profiles',
    'seller_profile_media',
    'seller_profiles',
    'seller_restriction_events',
    'seller_restrictions',
    'seller_route_transition_applications',
    'shipment_events',
    'shipments',
    'shipping_job_events',
    'shipping_parcels',
    'traffic_events',
    'traffic_sessions',
    'wallet_accounts',
    'wallet_entries',
    'wishlist_items',
  ],
  security: [
    'account_email_verifications',
    'account_phone_verifications',
    'marketplace_settings',
    'staff_invitations',
    'staff_permission_presets',
    'staff_permission_profiles',
    'staff_permission_requests',
    'user_credentials',
    'user_roles',
    'users',
  ],
  transient: [
    'account_contact_challenges',
    'business_setting_guards',
    'email_login_challenges',
    'local_contact_captures',
    'operation_transaction_guards',
    'password_reset_challenges',
    'request_rate_limits',
    'rider_otp_challenges',
    'seller_participation_guards',
    'staff_permission_guards',
    'user_sessions',
  ],
  dispatch: [
    'feedback_delivery_jobs',
    'notification_messages',
    'order_email_jobs',
    'shipping_jobs',
  ],
  installation: [
    '_cf_METADATA',
    '_hastabazaar_local_migrations',
    '__drizzle_migrations',
    'd1_migrations',
    'hastabazaar_schema_versions',
    'sqlite_sequence',
    'sqlite_stat1',
    'sqlite_stat4',
  ],
};
const REVIEWED_TABLES = new Map<string, PortableTableClass>(
  Object.entries(REVIEWED_TABLE_GROUPS).flatMap(([classification, names]) =>
    names.map((name) => [name, classification as PortableTableClass] as const),
  ),
);

export function recognizedSqlTransferTableNames(): string[] {
  return [...REVIEWED_TABLES.keys()].sort();
}
export function classifySqlTransferTable(
  name: string,
  additions: Readonly<Record<string, PortableTableClass>> = {},
): PortableTableClass {
  const known = REVIEWED_TABLES.get(name);
  const additional = Object.hasOwn(additions, name)
    ? additions[name]
    : undefined;
  if (known && additional && known !== additional)
    return fail('A reviewed table policy cannot be overridden.');
  const classification = known ?? additional;
  if (
    !classification ||
    !['durable', 'security', 'transient', 'dispatch', 'installation'].includes(
      classification,
    )
  )
    return fail(
      'An unreviewed table blocks complete export. Review the table policy before retrying.',
    );
  const required = requiredPortableTableClass(name);
  if (required && classification !== required)
    return fail('A protected table policy cannot be weakened.');
  return classification;
}

const MEDIA_REFERENCE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  product_media: ['object_key'],
  seller_documents: ['object_key'],
  seller_profile_media: ['object_key'],
  category_media: ['object_key'],
  return_evidence: ['object_key'],
  review_photos: ['object_key'],
  homepage_hero_media: ['object_key'],
  rider_applications: ['object_key'],
  rider_reports: ['object_key'],
};

function fail(message: string): never {
  throw new Error(message);
}
function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
function hashRecord(hash: Hash, value: unknown): void {
  const serialized = Buffer.from(canonicalJson(value));
  hash.update(String(serialized.length) + ':');
  hash.update(serialized);
}
function quote(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    return fail(
      'The schema contains an unsupported identifier. No export was issued.',
    );
  return '"' + name + '"';
}
function numericCount(value: unknown, maximum: number, kind: string): number {
  const number =
    typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)
      ? Number(value)
      : value;
  if (
    typeof number !== 'number' ||
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number > maximum
  )
    return fail('Unsupported or oversized ' + kind + ' inventory.');
  return number;
}

async function discoverSql(
  db: D1Database,
  assertOpen: () => void,
  additions: Readonly<Record<string, PortableTableClass>>,
): Promise<SqlDiscovery> {
  const schemaHash = createHash('sha256');
  const tableDefinitions = new Map<string, boolean>();
  let offset = 0;
  while (true) {
    assertOpen();
    const response = await db
      .prepare(
        "SELECT type,name,tbl_name,CASE WHEN length(CAST(sql AS BLOB))<=65536 THEN sql ELSE NULL END AS sql,COALESCE(length(CAST(sql AS BLOB)),0) AS __schema_bytes FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type COLLATE BINARY,name COLLATE BINARY LIMIT ? OFFSET ?",
      )
      .bind(PAGE_ROWS, offset)
      .all<SchemaRow & { __schema_bytes: unknown }>();
    if (
      !response.success ||
      !Array.isArray(response.results) ||
      response.results.length > PAGE_ROWS
    )
      return fail(
        'The complete bounded SQLite schema inventory is unavailable.',
      );
    for (const item of response.results) {
      numericCount(item.__schema_bytes, 65_536, 'schema definition');
      // The destination owns its own provider metadata. Its SQL/indexes must
      // not bind an otherwise compatible application to Cloudflare's host.
      if (item.tbl_name !== '_cf_METADATA')
        hashRecord(schemaHash, {
          type: item.type,
          name: item.name,
          tbl_name: item.tbl_name,
          sql: item.sql,
        });
      if (item.type === 'table') {
        if (tableDefinitions.has(item.name))
          return fail('Duplicate table inventory.');
        tableDefinitions.set(
          item.name,
          /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(item.sql ?? ''),
        );
      }
    }
    offset += response.results.length;
    if (offset > MAX_SCHEMA_OBJECTS)
      return fail('The SQLite schema inventory is oversized.');
    if (response.results.length < PAGE_ROWS) break;
  }
  const names = [...tableDefinitions.keys()].sort();
  if (
    !names.length ||
    names.length > 2048 ||
    new Set(names).size !== names.length
  )
    return fail('The complete table inventory is unavailable.');
  const tables: PortableTable[] = [];
  let inventoryBytes = 0;
  for (const name of names) {
    assertOpen();
    // Workerd reserves this exact internal table and rejects even read-only
    // PRAGMA/count queries. Never generalize this exception to _cf_* or errors.
    if (name === '_cf_METADATA') continue;
    quote(name);
    const classification = classifySqlTransferTable(name, additions);
    if (tableDefinitions.get(name))
      return fail(
        'Virtual tables require a separately verified portable adapter.',
      );
    const columns = await db
      .prepare('PRAGMA table_xinfo(' + quote(name) + ')')
      .all<ColumnRow>();
    if (
      !columns.success ||
      !columns.results?.length ||
      columns.results.length > 512 ||
      columns.results.some((column) => ![0, 2, 3].includes(column.hidden ?? 0))
    )
      return fail(
        'Unsupported hidden columns require a separately verified portable adapter.',
      );
    const ordered = [...columns.results].sort((a, b) => a.cid - b.cid);
    for (const column of ordered) quote(column.name);
    const count = await db
      .prepare('SELECT COUNT(*) AS rowCount FROM ' + quote(name))
      .first<{ rowCount: unknown }>();
    if (!count) return fail('A table disappeared during inventory.');
    const references = MEDIA_REFERENCE_COLUMNS[name] ?? [];
    if (
      references.some(
        (column) => !ordered.some((actual) => actual.name === column),
      )
    )
      return fail(
        'A reviewed media reference column is missing. Schema compatibility needs review.',
      );
    if (
      ordered.some(
        (column) =>
          /(?:^|_)object_key$/.test(column.name) &&
          !references.includes(column.name),
      )
    )
      return fail(
        'An unreviewed storage reference column blocks complete export.',
      );
    tables.push({
      name,
      columns: ordered.map((column) => ({
        name: column.name,
        declaredType: column.type ?? '',
        nullable: !column.notnull,
        ...(column.hidden === 2
          ? { generated: 'virtual' as const }
          : column.hidden === 3
            ? { generated: 'stored' as const }
            : {}),
      })),
      primaryKey: ordered
        .filter((column) => column.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((column) => column.name),
      classification,
      rowCount: numericCount(count.rowCount, MAX_TABLE_ROWS, 'table row'),
    });
    inventoryBytes += Buffer.byteLength(
      canonicalJson(tables[tables.length - 1]),
    );
    if (inventoryBytes > 480_000)
      return fail('The schema exceeds the bounded portable inventory size.');
  }
  // SQL is hashed here to detect constraints, indexes, triggers and views changing.
  // It is never included as executable input in the portable package.
  const schemaFingerprint = digest({
    schemaObjectsSha256: schemaHash.digest('hex'),
    tables: tables.map(({ rowCount: _count, ...table }) => table),
  });
  return {
    tables,
    schemaFingerprint,
    discoveredTables: names,
    providerManagedTables: names.includes('_cf_METADATA')
      ? [{ name: '_cf_METADATA', reason: 'provider-internal' }]
      : [],
  };
}

function rowSql(table: PortableTable): string {
  const names = table.columns.map((column) => column.name);
  let sizeAlias = '__hb_transfer_row_size';
  while (names.includes(sizeAlias)) sizeAlias += '_';
  const size = names
    .map((name) => 'COALESCE(length(CAST(' + quote(name) + ' AS BLOB)),0)')
    .join('+');
  const columns = names.flatMap((name, index) => {
    const column = quote(name);
    const value = `CASE typeof(${column}) WHEN 'integer' THEN CAST(${column} AS TEXT) WHEN 'real' THEN printf('%!.17g',${column}) WHEN 'blob' THEN hex(${column}) WHEN 'text' THEN hex(CAST(${column} AS BLOB)) ELSE ${column} END`;
    return [
      `typeof(${column}) AS "__type_${index}"`,
      `CASE WHEN ${quote(sizeAlias)}<=${MAX_RAW_ROW_BYTES} THEN ${value} ELSE NULL END AS "__value_${index}"`,
    ];
  });
  // Binary textual ordering is deterministic, including mixed SQLite types and
  // duplicate/no-primary-key rows. Every column participates after the key.
  const order = [
    ...table.primaryKey,
    ...names.filter((name) => !table.primaryKey.includes(name)),
  ]
    .flatMap((name) => [
      `typeof(${quote(name)}) COLLATE BINARY`,
      `CAST(${quote(name)} AS BLOB)`,
    ])
    .join(',');
  const sql = `WITH "__hb_bounded" AS (SELECT *,(${size}) AS ${quote(sizeAlias)} FROM main.${quote(table.name)}) SELECT ${columns.join(',')},${quote(sizeAlias)} AS "__bytes" FROM "__hb_bounded" ORDER BY ${order} LIMIT ? OFFSET ?`;
  if (Buffer.byteLength(sql) > 95_000)
    return fail(
      'The table requires a separately verified wide-schema adapter.',
    );
  return sql;
}

function sqlValue(type: unknown, raw: unknown): PortableValue {
  let result: PortableValue;
  switch (type) {
    case 'null':
      if (raw !== null) return fail('SQLite NULL changed while being read.');
      result = { type: 'null' };
      break;
    case 'integer':
      if (typeof raw !== 'string')
        return fail(
          'The database adapter did not provide an exact integer string.',
        );
      result = { type: 'integer', value: raw };
      break;
    case 'real': {
      if (typeof raw !== 'string' || !Number.isFinite(Number(raw)))
        return fail('Unsupported non-finite database real.');
      result = {
        type: 'real',
        value: Object.is(Number(raw), -0) ? '-0' : String(Number(raw)),
      };
      break;
    }
    case 'blob':
      if (typeof raw !== 'string' || !/^(?:[A-F0-9]{2})*$/.test(raw))
        return fail('Invalid exact database binary encoding.');
      result = {
        type: 'bytes',
        value: Buffer.from(raw, 'hex').toString('base64'),
      };
      break;
    case 'text':
      if (typeof raw !== 'string' || !/^(?:[A-F0-9]{2})*$/.test(raw))
        return fail('The database adapter changed an exact text value.');
      try {
        result = {
          type: 'text',
          value: new TextDecoder('utf-8', { fatal: true }).decode(
            Buffer.from(raw, 'hex'),
          ),
        };
      } catch {
        return fail(
          'Invalid UTF-8 database text requires a separately verified byte-preserving adapter.',
        );
      }
      break;
    default:
      return fail('Unknown SQLite storage type blocks portable export.');
  }
  validatePortableValue(result);
  return result;
}

async function* readRows(
  db: D1Database,
  table: PortableTable,
  assertOpen: () => void,
): AsyncGenerator<PortableRow> {
  const sql = rowSql(table);
  let offset = 0;
  while (true) {
    assertOpen();
    const response = await db
      .prepare(sql)
      .bind(PAGE_ROWS, offset)
      .all<Record<string, unknown>>();
    assertOpen();
    if (
      !response.success ||
      !Array.isArray(response.results) ||
      response.results.length > PAGE_ROWS
    )
      return fail('A bounded source row page is unavailable.');
    for (const record of response.results) {
      assertOpen();
      numericCount(record.__bytes, MAX_RAW_ROW_BYTES, 'row bytes');
      const row = table.columns.map((_, index) =>
        sqlValue(record['__type_' + index], record['__value_' + index]),
      );
      if (Buffer.byteLength(canonicalJson(row)) > MAX_ROW_BYTES)
        return fail('A source row exceeds the bounded portable record size.');
      yield row;
    }
    offset += response.results.length;
    if (offset > table.rowCount)
      return fail('The source table row count changed during scanning.');
    if (response.results.length < PAGE_ROWS) break;
  }
  if (offset !== table.rowCount)
    return fail('The source table row count changed during scanning.');
}

function metadata(value: unknown, http = false): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (!isPlainRecord(value) || Object.keys(value).length > 64)
    return fail('Unsupported media metadata blocks a complete backup.');
  const result: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const [name, entry] of Object.entries(value)) {
    // R2 exposes its known optional HTTP properties as own undefined fields.
    // Absence is not stored metadata; unknown/custom malformed values still fail.
    if (
      http &&
      entry === undefined &&
      [
        'contentType',
        'contentLanguage',
        'contentDisposition',
        'contentEncoding',
        'cacheControl',
        'cacheExpiry',
      ].includes(name)
    )
      continue;
    if (typeof entry === 'string') result[name] = entry;
    else if (http && entry instanceof Date && Number.isFinite(entry.getTime()))
      result[name] = entry.toISOString();
    else return fail('Unsupported media metadata value.');
  }
  if (Buffer.byteLength(canonicalJson(result)) > 32_768)
    return fail('Media metadata exceeds its bounded size.');
  return result;
}

function objectMetadata(listed: ListedObject): PortableObjectMetadata {
  if (
    typeof listed.key !== 'string' ||
    !listed.key.length ||
    Buffer.byteLength(listed.key) > 1024 ||
    listed.key.startsWith('/') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(listed.key) ||
    Array.from(listed.key).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    listed.key.includes('\\') ||
    listed.key.split('/').some((part) => !part || part === '.' || part === '..')
  )
    return fail('An unsafe media key requires operator review.');
  const httpMetadata = metadata(listed.httpMetadata, true);
  return {
    namespace: listed.key.startsWith('public/') ? 'public' : 'private',
    key: listed.key,
    size: numericCount(listed.size, MAX_MEDIA_BYTES, 'object byte'),
    contentType: httpMetadata.contentType || 'application/octet-stream',
    customMetadata: metadata(listed.customMetadata),
    httpMetadata,
  };
}

async function* listStoredObjects(
  bucket: R2Bucket,
  assertOpen: () => void,
): AsyncGenerator<PortableObjectMetadata> {
  let cursor: string | undefined;
  let previousKey: string | undefined;
  let count = 0;
  do {
    assertOpen();
    const page = await bucket.list({
      limit: PAGE_OBJECTS,
      ...(cursor ? { cursor } : {}),
      include: ['httpMetadata', 'customMetadata'],
    });
    assertOpen();
    if (
      !page ||
      !Array.isArray(page.objects) ||
      page.objects.length > PAGE_OBJECTS
    )
      return fail('The complete bounded media listing is unavailable.');
    for (const listed of page.objects) {
      assertOpen();
      const object = objectMetadata(listed as unknown as ListedObject);
      if (
        previousKey !== undefined &&
        Buffer.compare(Buffer.from(previousKey), Buffer.from(object.key)) >= 0
      )
        return fail(
          'Media listing must be complete, unique and in ascending UTF-8 key order.',
        );
      previousKey = object.key;
      count++;
      if (count > MAX_OBJECTS)
        return fail('Media object inventory exceeds its supported bound.');
      yield object;
    }
    if (!page.truncated) return;
    if (
      !page.cursor ||
      page.cursor === cursor ||
      page.cursor.length > 8192 ||
      !page.objects.length
    )
      return fail('Media listing cursor is incomplete or did not advance.');
    cursor = page.cursor;
  } while (true);
}

async function* listObjects(
  bucket: R2Bucket,
  assertOpen: () => void,
  applicationMedia: ApplicationMediaMap,
): AsyncGenerator<PortableObjectMetadata> {
  const extras = [...applicationMedia.values()]
    .map((item) => item.metadata)
    .sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
  let index = 0;
  for await (const stored of listStoredObjects(bucket, assertOpen)) {
    while (
      index < extras.length &&
      Buffer.compare(Buffer.from(extras[index].key), Buffer.from(stored.key)) <
        0
    ) {
      assertOpen();
      yield extras[index++];
    }
    if (index < extras.length && extras[index].key === stored.key) {
      if (canonicalJson(extras[index]) !== canonicalJson(stored))
        return fail(
          'Application media and upload storage have a metadata collision. Complete backup is blocked.',
        );
      index++;
    }
    yield stored;
  }
  while (index < extras.length) {
    assertOpen();
    yield extras[index++];
  }
}

async function mediaObject(
  bucket: R2Bucket,
  expected: PortableObjectMetadata,
  readers: Set<Reader>,
  assertOpen: () => void,
  applicationMedia: ApplicationMediaMap,
): Promise<{
  object: PortableObject;
  completed(): { size: number; sha256: string } | null;
  dispose(): Promise<void>;
}> {
  assertOpen();
  const application = applicationMedia.get(expected.key);
  const stored = await bucket.get(expected.key);
  let fetched = stored ?? (application ? await application.open() : null);
  if (stored && application) {
    // A restored built-in may also be present in MEDIA. Never silently discard
    // a collision: validate both metadata and actual bounded bytes first.
    let builtIn: Awaited<ReturnType<ApplicationMedia['open']>> | undefined;
    async function boundedBody(
      object:
        | Awaited<ReturnType<ApplicationMedia['open']>>
        | NonNullable<typeof stored>,
    ) {
      if (
        !object.body ||
        canonicalJson(objectMetadata(object as unknown as ListedObject)) !==
          canonicalJson(expected)
      ) {
        await object.body?.cancel();
        return fail('Application media metadata changed after listing.');
      }
      const reader = object.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      let disposed = false;
      const dispose = async () => {
        if (disposed) return;
        disposed = true;
        readers.delete(managed);
        try {
          await reader.cancel();
        } finally {
          reader.releaseLock();
        }
      };
      const managed: Reader = {
        read: () => reader.read() as ReturnType<Reader['read']>,
        cancel: dispose,
        releaseLock() {
          /* dispose owns the lock */
        },
      };
      readers.add(managed);
      try {
        for (;;) {
          assertOpen();
          const chunk = await reader.read();
          assertOpen();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 2 * 1024 * 1024 || size > expected.size)
            return fail('Application media exceeds its bounded size.');
          chunks.push(chunk.value);
        }
      } finally {
        await dispose();
      }
      if (size !== expected.size)
        return fail('Application media size changed after listing.');
      return Buffer.concat(chunks);
    }
    try {
      builtIn = await application.open();
      const left = await boundedBody(stored),
        right = await boundedBody(builtIn);
      if (!left.equals(right))
        return fail(
          'Application media and upload storage have a byte collision. Complete backup is blocked.',
        );
      fetched = {
        ...builtIn,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(left);
            controller.close();
          },
        }),
      };
    } finally {
      await Promise.allSettled([
        builtIn?.body && !builtIn.body.locked
          ? builtIn.body.cancel()
          : Promise.resolve(),
        !stored.body.locked ? stored.body.cancel() : Promise.resolve(),
      ]);
    }
  }
  try {
    assertOpen();
  } catch (error) {
    if (fetched && 'body' in fetched && fetched.body)
      await fetched.body.cancel();
    throw error;
  }
  if (!fetched || !('body' in fetched) || !fetched.body)
    return fail('A listed media object is missing or unavailable.');
  const actual = objectMetadata(fetched as unknown as ListedObject);
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    await fetched.body.cancel();
    return fail('Media bytes or metadata changed after listing.');
  }
  const reader = fetched.body.getReader() as unknown as Reader;
  let finished: { size: number; sha256: string } | null = null;
  let disposed = false;
  let started = false;
  const managed: Reader = {
    read: () => reader.read(),
    async cancel() {
      await dispose();
    },
    releaseLock() {
      /* dispose owns the underlying lock exactly once. */
    },
  };
  readers.add(managed);
  async function dispose() {
    if (disposed) return;
    disposed = true;
    readers.delete(managed);
    try {
      if (!finished) await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
  async function* bytes(): AsyncGenerator<Uint8Array> {
    if (started) return fail('A media stream can only be consumed once.');
    started = true;
    let size = 0;
    const hash = createHash('sha256');
    try {
      while (true) {
        assertOpen();
        const part = await reader.read();
        assertOpen();
        if (part.done) break;
        if (!(part.value instanceof Uint8Array))
          return fail('Media reader returned unsupported byte data.');
        size += part.value.length;
        if (size > expected.size)
          return fail('Media size changed while reading.');
        hash.update(part.value);
        yield part.value;
      }
      if (size !== expected.size)
        return fail('Media size changed while reading.');
      finished = { size, sha256: hash.digest('hex') };
    } finally {
      await dispose();
    }
  }
  return {
    object: { ...expected, bytes: bytes() },
    completed: () => finished,
    dispose,
  };
}

async function cancelReaders(readers: Set<Reader>): Promise<void> {
  await Promise.allSettled(
    [...readers].map(async (reader) => {
      try {
        await reader.cancel();
      } finally {
        readers.delete(reader);
        try {
          reader.releaseLock();
        } catch {
          /* Concurrent cancellation may already release it. */
        }
      }
    }),
  );
}

/** object_key is an application storage binding, never an external URL here. */
async function* mediaReferences(
  db: D1Database,
  tables: PortableTable[],
  assertOpen: () => void,
): AsyncGenerator<string> {
  const selects = tables.flatMap((table) =>
    (MEDIA_REFERENCE_COLUMNS[table.name] ?? []).map(
      (column) =>
        'SELECT ' +
        quote(column) +
        ' AS media_key FROM ' +
        quote(table.name) +
        ' WHERE ' +
        quote(column) +
        ' IS NOT NULL',
    ),
  );
  if (!selects.length) return;
  // D1 permits fewer compound SELECT terms than native SQLite. Page each
  // reviewed column independently, then merge the bounded sorted cursors.
  async function* columnReferences(select: string): AsyncGenerator<string> {
    const sql =
      'WITH refs AS (' +
      select +
      '), unique_refs AS (SELECT CAST(media_key AS BLOB) AS key_bytes,typeof(media_key) AS kind FROM refs GROUP BY CAST(media_key AS BLOB),typeof(media_key)) SELECT kind,CASE WHEN length(key_bytes)<=1024 THEN hex(key_bytes) ELSE NULL END AS key_hex,length(key_bytes) AS key_size FROM unique_refs ORDER BY key_bytes LIMIT ? OFFSET ?';
    let offset = 0;
    while (true) {
      assertOpen();
      const response = await db
        .prepare(sql)
        .bind(PAGE_ROWS, offset)
        .all<{ kind: unknown; key_hex: unknown; key_size: unknown }>();
      if (
        !response.success ||
        !Array.isArray(response.results) ||
        response.results.length > PAGE_ROWS
      )
        return fail('The complete storage reference inventory is unavailable.');
      for (const reference of response.results) {
        assertOpen();
        numericCount(reference.key_size, 1024, 'storage reference');
        if (reference.kind !== 'text')
          return fail('An invalid storage reference blocks complete backup.');
        const decoded = sqlValue('text', reference.key_hex);
        if (decoded.type !== 'text')
          return fail('An invalid storage reference blocks complete backup.');
        objectMetadata({ key: decoded.value, size: 0 });
        yield decoded.value;
      }
      offset += response.results.length;
      if (offset > MAX_OBJECTS)
        return fail(
          'The storage reference inventory exceeds its supported bound.',
        );
      if (response.results.length < PAGE_ROWS) return;
    }
  }
  const cursors = selects.map((select) =>
    columnReferences(select)[Symbol.asyncIterator](),
  );
  const current: IteratorResult<string>[] = [];
  let previous: string | undefined,
    count = 0;
  try {
    for (const cursor of cursors) current.push(await cursor.next());
    for (;;) {
      assertOpen();
      let smallest = -1;
      for (let index = 0; index < current.length; index++) {
        const entry = current[index];
        if (entry.done) continue;
        if (
          smallest < 0 ||
          Buffer.compare(
            Buffer.from(entry.value),
            Buffer.from(current[smallest].value!),
          ) < 0
        )
          smallest = index;
      }
      if (smallest < 0) return;
      const key = current[smallest].value!;
      if (key !== previous) {
        if (++count > MAX_OBJECTS)
          return fail(
            'The storage reference inventory exceeds its supported bound.',
          );
        previous = key;
        yield key;
      }
      current[smallest] = await cursors[smallest].next();
    }
  } finally {
    for (const cursor of cursors) await cursor.return?.(undefined);
  }
}

async function reconcileMediaReferences(
  db: D1Database,
  bucket: R2Bucket,
  tables: PortableTable[],
  assertOpen: () => void,
  applicationMedia: ApplicationMediaMap,
): Promise<void> {
  const listed = listObjects(bucket, assertOpen, applicationMedia)[
    Symbol.asyncIterator
  ]();
  let current: IteratorResult<PortableObjectMetadata> | undefined;
  try {
    for await (const key of mediaReferences(db, tables, assertOpen)) {
      current ??= await listed.next();
      while (
        !current.done &&
        Buffer.compare(Buffer.from(current.value.key), Buffer.from(key)) < 0
      )
        current = await listed.next();
      if (current.done || current.value.key !== key)
        return fail(
          'A database media reference is missing from the upload inventory. Complete backup is blocked.',
        );
    }
  } finally {
    await listed.return?.(undefined);
  }
}

async function capture(
  db: D1Database,
  bucket: R2Bucket,
  readers: Set<Reader>,
  assertOpen: () => void,
  additions: Readonly<Record<string, PortableTableClass>>,
  applicationMedia: ApplicationMediaMap,
): Promise<Capture> {
  assertOpen();
  const discovery = await discoverSql(db, assertOpen, additions);
  const tableRecords: PortableTableManifest[] = [];
  for (const table of discovery.tables) {
    const hash = createHash('sha256');
    let rows = 0;
    for await (const row of readRows(db, table, assertOpen)) {
      hashRecord(hash, row);
      rows++;
    }
    tableRecords.push({ name: table.name, rows, sha256: hash.digest('hex') });
  }
  const hashes = new Map<NamespaceId, Hash>(
    NAMESPACES.map((id) => [id, createHash('sha256')]),
  );
  const counts = new Map<NamespaceId, { objects: number; bytes: number }>(
    NAMESPACES.map((id) => [id, { objects: 0, bytes: 0 }]),
  );
  for await (const listed of listObjects(
    bucket,
    assertOpen,
    applicationMedia,
  )) {
    const opened = await mediaObject(
      bucket,
      listed,
      readers,
      assertOpen,
      applicationMedia,
    );
    try {
      for await (const _ of opened.object.bytes) {
        /* bounded hashing occurs in the reader */
      }
      const completed = opened.completed();
      if (!completed) return fail('Media scan did not complete.');
      const id = listed.namespace as NamespaceId;
      hashRecord(hashes.get(id)!, { object: listed, sha256: completed.sha256 });
      const count = counts.get(id)!;
      count.objects++;
      count.bytes += completed.size;
      if (!Number.isSafeInteger(count.bytes) || count.bytes > MAX_MEDIA_BYTES)
        return fail('Media byte inventory exceeds its supported bound.');
    } finally {
      await opened.dispose();
    }
  }
  const media = NAMESPACES.map((id) => ({
    id,
    ...counts.get(id)!,
    sha256: hashes.get(id)!.digest('hex'),
  }));
  const namespaces = media.map((entry) => ({
    id: entry.id,
    access: entry.id as 'private' | 'public',
    objectCount: entry.objects,
    totalBytes: entry.bytes,
  }));
  await reconcileMediaReferences(
    db,
    bucket,
    discovery.tables,
    assertOpen,
    applicationMedia,
  );
  const after = await discoverSql(db, assertOpen, additions);
  if (canonicalJson(after) !== canonicalJson(discovery))
    return fail(
      'Source schema or table counts changed while taking the baseline. Retry without concurrent writes.',
    );
  return {
    ...discovery,
    tableRecords,
    media,
    namespaces,
    revision: digest({ ...discovery, tableRecords, media }),
  };
}

/** Read-only checked snapshots. No destination credentials, DDL or restore operations. */
export function createSqlTransferSource(
  db: D1Database,
  bucket: R2Bucket,
  options: SourceOptions,
): PortableTransferSource {
  const additions = Object.freeze({ ...options.tableClassifications });
  if ((options.applicationMedia?.length ?? 0) > 16)
    return fail('Application media inventory exceeds its bounded size.');
  const applicationMedia = new Map<string, ApplicationMedia>();
  for (const entry of options.applicationMedia ?? []) {
    const metadata = objectMetadata(entry.metadata);
    if (
      metadata.namespace !== 'public' ||
      entry.metadata.namespace !== 'public' ||
      metadata.size > 2 * 1024 * 1024 ||
      typeof entry.open !== 'function' ||
      applicationMedia.has(metadata.key)
    )
      return fail('Invalid or duplicate public application media.');
    applicationMedia.set(metadata.key, { metadata, open: () => entry.open() });
  }
  return {
    async openSnapshot(): Promise<PortableSourceSnapshot> {
      const dialect = (db as D1Database & { dialect?: string }).dialect;
      if (dialect && dialect !== 'sqlite')
        return fail(
          'MariaDB and other source adapters are not yet natively verified. No export was issued.',
        );
      if (typeof bucket.list !== 'function')
        return fail(
          'This media adapter cannot inventory all uploads. Backup is blocked.',
        );
      let closed = false;
      const readers = new Set<Reader>();
      const assertOpen = () => {
        if (closed || options.signal?.aborted)
          return fail('The source snapshot is closed or cancelled.');
      };
      const aborted = () => {
        closed = true;
        void cancelReaders(readers);
      };
      options.signal?.addEventListener('abort', aborted, { once: true });
      let baseline: Capture;
      try {
        baseline = await capture(
          db,
          bucket,
          readers,
          assertOpen,
          additions,
          applicationMedia,
        );
      } catch (error) {
        await cancelReaders(readers);
        options.signal?.removeEventListener('abort', aborted);
        throw error;
      }
      const inventory: PortableInventory = {
        version: 1,
        installationId: options.installationId,
        databaseEngine: 'sqlite',
        schemaFingerprint: baseline.schemaFingerprint,
        application: {
          release: options.release,
          schemaVersion: options.schemaVersion ?? baseline.schemaFingerprint,
          requiredEnvironmentNames: [
            'APP_ORIGIN',
            'DB',
            'HASTABAZAAR_RUNTIME_ENV',
            'HASTABAZAAR_SECURITY_KEY',
            'MEDIA',
            'NODE_ENV',
          ],
          artifactSha256: null,
        },
        snapshot: {
          cutoff: new Date().toISOString(),
          revision: baseline.revision,
          writeMode: 'preliminary',
        },
        discoveredTables: baseline.discoveredTables,
        ...(baseline.providerManagedTables.length
          ? { providerManagedTables: baseline.providerManagedTables }
          : {}),
        discoveredNamespaces: [...NAMESPACES],
        tables: baseline.tables,
        namespaces: baseline.namespaces,
        security: { keyIds: [...options.keyIds], payloadVersions: [1] },
      };
      try {
        validatePortableInventory(inventory);
      } catch (error) {
        closed = true;
        await cancelReaders(readers);
        options.signal?.removeEventListener('abort', aborted);
        throw error;
      }
      const tableLookup = new Map(
        baseline.tables.map((table) => [table.name, table]),
      );
      const exportedTables = new Map<string, PortableTableManifest>();
      const exportedMedia = new Map<string, PortableNamespaceManifest>();
      const startedTables = new Set<string>();
      const startedMedia = new Set<string>();
      return {
        inventory,
        async *rows(requested) {
          assertOpen();
          const table = tableLookup.get(requested.name);
          if (
            !table ||
            canonicalJson(table) !== canonicalJson(requested) ||
            startedTables.has(table.name)
          )
            return fail('Unknown, changed or already consumed source table.');
          startedTables.add(table.name);
          const hash = createHash('sha256');
          let rows = 0;
          for await (const row of readRows(db, table, assertOpen)) {
            hashRecord(hash, row);
            rows++;
            yield row;
          }
          exportedTables.set(table.name, {
            name: table.name,
            rows,
            sha256: hash.digest('hex'),
          });
        },
        async *objects(requested) {
          assertOpen();
          const namespace = inventory.namespaces.find(
            (entry) => entry.id === requested.id,
          );
          if (
            !namespace ||
            canonicalJson(namespace) !== canonicalJson(requested) ||
            startedMedia.has(namespace.id)
          )
            return fail(
              'Unknown, changed or already consumed source namespace.',
            );
          startedMedia.add(namespace.id);
          const hash = createHash('sha256');
          let objects = 0;
          let bytes = 0;
          for await (const listed of listObjects(
            bucket,
            assertOpen,
            applicationMedia,
          )) {
            if (listed.namespace !== namespace.id) continue;
            const opened = await mediaObject(
              bucket,
              listed,
              readers,
              assertOpen,
              applicationMedia,
            );
            try {
              yield opened.object;
              const completed = opened.completed();
              if (!completed)
                return fail(
                  'Media bytes were not fully consumed. No complete snapshot can be issued.',
                );
              objects++;
              bytes += completed.size;
              hashRecord(hash, { object: listed, sha256: completed.sha256 });
            } finally {
              await opened.dispose();
            }
          }
          if (
            objects !== namespace.objectCount ||
            bytes !== namespace.totalBytes
          )
            return fail('Source object inventory changed during export.');
          exportedMedia.set(namespace.id, {
            id: namespace.id,
            objects,
            bytes,
            sha256: hash.digest('hex'),
          });
        },
        async verifyUnchanged() {
          if (
            closed ||
            exportedTables.size !== baseline.tableRecords.length ||
            exportedMedia.size !== baseline.media.length
          )
            return false;
          const rowsMatch = baseline.tableRecords.every(
            (entry) =>
              canonicalJson(exportedTables.get(entry.name)) ===
              canonicalJson(entry),
          );
          const mediaMatch = baseline.media.every(
            (entry) =>
              canonicalJson(exportedMedia.get(entry.id)) ===
              canonicalJson(entry),
          );
          if (!rowsMatch || !mediaMatch) return false;
          try {
            const after = await capture(
              db,
              bucket,
              readers,
              assertOpen,
              additions,
              applicationMedia,
            );
            return after.revision === baseline.revision;
          } catch {
            return false;
          }
        },
        async close() {
          closed = true;
          await cancelReaders(readers);
          options.signal?.removeEventListener('abort', aborted);
        },
      };
    },
  };
}
