import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { createNcmClient, ncmApiConfiguration, ncmConnectionFingerprint, ncmDeliveryTypes,
  type NcmBranch, type NcmDeliveryType } from '../shipping/nepal-can-move';
import { commandReceipt } from '../workflows/contracts';

const schema = {
  ncm_partner_settings: ['partner_id', 'connection_fingerprint', 'assigned_branches_json', 'branches_json', 'branches_checked_at',
    'refresh_started_at', 'connected_at', 'delivery_type', 'package_name', 'revision', 'updated_at', 'last_check_at', 'check_started_at'],
  ncm_pickup_branches: ['pickup_address_id', 'partner_id', 'address_updated_at', 'branch', 'updated_at'],
  ncm_bookings: ['job_id', 'partner_id', 'actor_id', 'vendor_reference', 'ncm_order_id', 'state', 'request_id', 'started_at',
    'updated_at', 'response_json', 'label_json', 'cod_reported_paisa', 'delivery_charge_paisa', 'return_charge_paisa', 'last_status'],
  ncm_api_daily_usage: ['usage_day', 'bucket', 'used'],
  ncm_webhook_events: ['id', 'kind', 'event', 'payload_json', 'received_at', 'processed_at', 'attempts', 'next_attempt_at', 'claimed_at'],
  ncm_courier_notes: ['ncm_order_id', 'comment_id', 'job_id', 'kind', 'comment', 'created_at'],
};

export const ncmMariaDb = (db: D1Database) => (db as D1Database & {dialect?: string}).dialect === 'mariadb';
export const ncmPartnerName = (name: string) => name.trim().toLowerCase() === 'nepal can move';
export const ncmSettingsDayMs = 24 * 60 * 60 * 1_000;

export async function ncmSchemaAvailable(db: D1Database) {
  const tables = Object.entries(schema);
  if (ncmMariaDb(db)) {
    const { results } = await db.prepare(`SELECT TABLE_NAME AS tableName,COLUMN_NAME AS name
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${tables.map(() => '?').join(',')})`)
      .bind(...tables.map(([table]) => table)).all<{tableName: string; name: string}>();
    const found = new Set(results.map(row => row.tableName + '.' + row.name));
    return tables.every(([table, columns]) => columns.every(name => found.has(table + '.' + name)));
  }
  const found = await Promise.all(tables.map(async ([table, columns]) => {
    const { results } = await db.prepare('PRAGMA table_info(' + table + ')').all<{name: string}>();
    return columns.every(name => results.some(column => column.name === name));
  }));
  return found.every(Boolean);
}

type SavedSettings = {
  partnerId: string; fingerprint: string | null; assignedJson: string; branchesJson: string;
  branchesCheckedAt: number | null; refreshStartedAt: number | null; connectedAt: number | null;
  deliveryType: NcmDeliveryType; packageName: string; revision: number; lastCheckAt: number | null;
};
type Settings = SavedSettings & { assignedBranches: string[]; branches: NcmBranch[] };
const settingsSelect = `SELECT partner_id AS partnerId,connection_fingerprint AS fingerprint,
  assigned_branches_json AS assignedJson,branches_json AS branchesJson,branches_checked_at AS branchesCheckedAt,
  refresh_started_at AS refreshStartedAt,connected_at AS connectedAt,delivery_type AS deliveryType,
  package_name AS packageName,revision,last_check_at AS lastCheckAt FROM ncm_partner_settings`;
const numberOrNull = (value: number | null) => value == null ? null : Number(value);

export async function readNcmSettings(db: D1Database, partnerId: string): Promise<Settings | null> {
  const row = await db.prepare(settingsSelect + ' WHERE partner_id=?').bind(partnerId).first<SavedSettings>();
  if (!row || row.partnerId !== partnerId) return null;
  try {
    const assigned: unknown = JSON.parse(row.assignedJson), branches: unknown = JSON.parse(row.branchesJson);
    if (!Array.isArray(assigned) || !assigned.every(value => typeof value === 'string') || !Array.isArray(branches) ||
      !branches.every(value => value && typeof value.name === 'string' && typeof value.district === 'string' &&
        Array.isArray(value.areas) && value.areas.every((area: unknown) => typeof area === 'string'))) return null;
    return { ...row, assignedBranches: assigned, branches, revision: Number(row.revision),
      connectedAt: numberOrNull(row.connectedAt), branchesCheckedAt: numberOrNull(row.branchesCheckedAt),
      refreshStartedAt: numberOrNull(row.refreshStartedAt), lastCheckAt: numberOrNull(row.lastCheckAt) };
  } catch { return null; }
}

export function suggestNcmBranch(branches: NcmBranch[], address: {district: string; municipality: string; locality?: string}) {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const district = normalize(address.district);
  if (!district) return null;
  const sameDistrict = branches.filter(branch => normalize(branch.district) === district);
  const areaNames = [address.municipality, address.locality ?? ''].map(normalize).filter(Boolean);
  const area = sameDistrict.filter(branch => branch.areas.some(name => areaNames.includes(normalize(name))));
  if (area.length === 1) return area[0].name;
  return sameDistrict.length === 1 ? sameDistrict[0].name : null;
}

export type NcmSettingsView = {
  partnerId: string; configured: boolean; connectedAt: number | null; assignedBranches: string[];
  branchesCheckedAt: number | null; canRefresh: boolean; deliveryType: NcmDeliveryType; packageName: string;
  revision: number; pickups: {
    id: string; sellerName: string; address: string; updatedAt: number; branch: string | null; suggestedBranch: string | null;
  }[]; lastWebhookAt: number | null; lastCheckAt: number | null;
};

export async function ncmSettingsView(db: D1Database, partnerId: string, runtime: unknown, now: number): Promise<NcmSettingsView | null> {
  if (!await ncmSchemaAvailable(db)) return null;
  const config = ncmApiConfiguration(runtime);
  const [settings, fingerprint, pickups, webhook] = await Promise.all([
    readNcmSettings(db, partnerId),
    config && ncmConnectionFingerprint(config),
    db.prepare(`SELECT a.id,COALESCE(NULLIF(s.trading_name,''),s.id) AS sellerName,
      a.locality,a.ward,a.municipality,a.district,a.province,a.updated_at AS updatedAt,m.branch
      FROM seller_operational_addresses a JOIN seller_profiles s ON s.id=a.seller_id
      LEFT JOIN ncm_pickup_branches m ON m.partner_id=? AND m.pickup_address_id=a.id AND m.address_updated_at=a.updated_at
      WHERE a.purpose='pickup' ORDER BY sellerName,a.id`).bind(partnerId)
      .all<{id: string; sellerName: string; locality: string; ward: string | null; municipality: string;
        district: string; province: string; updatedAt: number; branch: string | null}>(),
    db.prepare('SELECT MAX(received_at) AS lastAt FROM ncm_webhook_events').first<{lastAt: number | null}>(),
  ]);
  const connected = settings?.connectedAt != null && Boolean(fingerprint && settings.fingerprint === fingerprint);
  const assignedBranches = connected ? settings.assignedBranches : [];
  const branches = connected ? settings.branches.filter(branch => assignedBranches.includes(branch.name)) : [];
  return {
    partnerId, configured: Boolean(config), connectedAt: connected ? settings.connectedAt : null, assignedBranches,
    branchesCheckedAt: connected ? settings.branchesCheckedAt : null,
    canRefresh: connected && (settings.refreshStartedAt === null || now - settings.refreshStartedAt >= ncmSettingsDayMs),
    deliveryType: settings?.deliveryType ?? 'Door2Door', packageName: settings?.packageName ?? '', revision: settings?.revision ?? 0,
    pickups: pickups.results.map(pickup => ({
      id: pickup.id, sellerName: pickup.sellerName,
      address: [pickup.locality, pickup.ward ? 'Ward ' + pickup.ward : '', pickup.municipality, pickup.district, pickup.province]
        .filter(Boolean).join(', '),
      updatedAt: Number(pickup.updatedAt), branch: pickup.branch && assignedBranches.includes(pickup.branch) ? pickup.branch : null,
      suggestedBranch: suggestNcmBranch(branches, pickup),
    })),
    lastWebhookAt: numberOrNull(webhook?.lastAt ?? null), lastCheckAt: settings?.lastCheckAt ?? null,
  };
}

export async function testedNcmConnection(db: D1Database, partnerId: string, runtime: unknown) {
  const config = ncmApiConfiguration(runtime);
  if (!config || !await ncmSchemaAvailable(db)) return null;
  const [settings, fingerprint] = await Promise.all([readNcmSettings(db, partnerId), ncmConnectionFingerprint(config)]);
  if (!settings || settings.connectedAt === null || settings.fingerprint !== fingerprint) return null;
  return { settings, client: createNcmClient(config) };
}

export async function activeNcmConnection(db: D1Database, partnerId: string, runtime: unknown) {
  const connection = await testedNcmConnection(db, partnerId, runtime);
  if (!connection) return null;
  const partner = await db.prepare(`SELECT id,name,collects_cod AS collectsCod FROM delivery_partners
    WHERE id=? AND status='in_use' AND booking_mode='api'`).bind(partnerId)
    .first<{id: string; name: string; collectsCod: number}>();
  if (partner?.id !== partnerId || !ncmPartnerName(partner.name)) return null;
  return { ...connection, partner: { ...partner, collectsCod: Number(partner.collectsCod) === 1 } };
}

export class NcmSettingsError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export function ncmTransactionGuard(db: D1Database, predicate: string, ...bindings: unknown[]) {
  const id = crypto.randomUUID();
  return [
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id, ...bindings),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),
  ];
}

const allowedActions = ['test', 'refresh', 'settings', 'map'] as const;
type SettingsCommand = {partnerId: string; requestId: string; action: typeof allowedActions[number]; deliveryType?: unknown;
  packageName?: unknown; revision?: unknown; pickupAddressId?: unknown; addressUpdatedAt?: unknown; branch?: unknown};
const idFormat = /^[a-zA-Z0-9_-]{1,100}$/;
const actionReasons = {
  test: 'Tested the NCM connection and read assigned pickup branches.',
  refresh: 'Requested a refresh of the NCM branch list.',
  settings: 'Updated the defaults for NCM parcel bookings.',
  map: 'Confirmed the NCM branch for a seller pickup address.',
};
const currentPartner = 'EXISTS(SELECT 1 FROM delivery_partners WHERE id=? AND LOWER(TRIM(name))=?)';

export async function changeNcmSettings(db: D1Database, runtime: unknown, actorId: string, input: SettingsCommand, now = Date.now()) {
  const { action, partnerId, requestId } = input;
  if (!allowedActions.includes(action) || !idFormat.test(partnerId) || !idFormat.test(requestId))
    throw new NcmSettingsError('Check the NCM settings and try again.', 400);
  const authority = await staffMutationGuard(db, actorId, 'order.manage', NcmSettingsError, 'super_admin');
  if (!await ncmSchemaAvailable(db))
    throw new NcmSettingsError('NCM settings are available after the database update.');
  const partner = await db.prepare('SELECT id,name FROM delivery_partners WHERE id=?').bind(partnerId)
    .first<{id:string; name:string}>();
  if (partner?.id !== partnerId || !ncmPartnerName(partner.name))
    throw new NcmSettingsError('Choose the Nepal Can Move partner.', 404);
  const config = ncmApiConfiguration(runtime);
  if (!config) throw new NcmSettingsError('Add the NCM address and token to the protected app settings first.');
  const [fingerprint, current] = await Promise.all([ncmConnectionFingerprint(config), readNcmSettings(db, partnerId)]);
  const client = createNcmClient(config);
  const receipt = await commandReceipt(db, { actorId, requestId, now, expectedRevision: null }, {
    action: 'ncm.' + action, subjectType: 'delivery_partner', subjectId: partnerId, auditReason: actionReasons[action],
  }, Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)));
  if (receipt.replayed) return {ok: true};
  const protectPartner = [
    ...authority.statements,
    db.prepare('UPDATE delivery_partners SET revision=revision WHERE id=?').bind(partnerId),
    ...ncmTransactionGuard(db, currentPartner, partnerId, 'nepal can move'),
  ];
  const verifyConnected = () => ncmTransactionGuard(db,
    'EXISTS(SELECT 1 FROM ncm_partner_settings WHERE partner_id=? AND connection_fingerprint=? AND connected_at IS NOT NULL)',
    partnerId, fingerprint);
  const result = { ok: true };

  if (action === 'test') {
    const assigned = await client.assignedBranches();
    if (current) {
      const same = current.fingerprint === fingerprint;
      await db.batch([...protectPartner,
        ...ncmTransactionGuard(db, 'EXISTS(SELECT 1 FROM ncm_partner_settings WHERE partner_id=? AND revision=?)', partnerId, current.revision),
        db.prepare(`UPDATE ncm_partner_settings SET connection_fingerprint=?,assigned_branches_json=?,connected_at=?,
          branches_json=?,branches_checked_at=?,updated_at=?,revision=revision+1 WHERE partner_id=?`)
          .bind(fingerprint, JSON.stringify(assigned), now, same ? current.branchesJson : '[]',
            same ? current.branchesCheckedAt : null, now, partnerId),
        receipt.insert(result),
      ]);
    } else {
      await db.batch([...protectPartner, db.prepare(`INSERT INTO ncm_partner_settings
        (partner_id,connection_fingerprint,assigned_branches_json,branches_json,connected_at,updated_at)
        VALUES(?,?,?,?,?,?)`).bind(partnerId, fingerprint, JSON.stringify(assigned), '[]', now, now), receipt.insert(result)]);
    }
    return result;
  }
  if (!current || current.fingerprint !== fingerprint || current.connectedAt === null)
    throw new NcmSettingsError('Test the NCM connection first.');
  if (action === 'refresh') {
    const threshold = now - ncmSettingsDayMs;
    if (current.refreshStartedAt !== null && current.refreshStartedAt > threshold)
      throw new NcmSettingsError('The branch list can be refreshed once a day.', 429);
    await db.batch([...protectPartner, ...verifyConnected(),
      ...ncmTransactionGuard(db, `EXISTS(SELECT 1 FROM ncm_partner_settings WHERE partner_id=?
        AND (refresh_started_at IS NULL OR refresh_started_at<=?))`, partnerId, threshold),
      db.prepare('UPDATE ncm_partner_settings SET refresh_started_at=? WHERE partner_id=?').bind(now, partnerId),
      db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at)
        VALUES(?,?,'ncm.refresh_started','delivery_partner',?,?,?,?)`)
        .bind(crypto.randomUUID(), actorId, partnerId, 'Started refreshing the NCM branch list.', requestId + ':started', now),
    ]);
    const branches = await client.branches();
    await db.batch([...protectPartner, ...verifyConnected(),
      db.prepare(`UPDATE ncm_partner_settings SET branches_json=?,branches_checked_at=?,revision=revision+1,updated_at=?
        WHERE partner_id=? AND refresh_started_at=?`).bind(JSON.stringify(branches), now, now, partnerId, now),
      receipt.insert(result),
    ]);
    return result;
  }
  if (action === 'settings') {
    const deliveryType = ncmDeliveryTypes.find(type => type === input.deliveryType);
    const packageName = typeof input.packageName === 'string' ? input.packageName.trim() : null;
    if (!deliveryType || packageName === null || packageName.length > 120 || /\p{Cc}/u.test(packageName) || input.revision !== current.revision)
      throw new NcmSettingsError('Review the current delivery defaults and try again.');
    await db.batch([...protectPartner, ...verifyConnected(),
      ...ncmTransactionGuard(db, 'EXISTS(SELECT 1 FROM ncm_partner_settings WHERE partner_id=? AND revision=?)', partnerId, current.revision),
      db.prepare(`UPDATE ncm_partner_settings SET delivery_type=?,package_name=?,revision=revision+1,updated_at=?
        WHERE partner_id=?`).bind(deliveryType, packageName, now, partnerId),
      receipt.insert(result),
    ]);
    return result;
  }
  const { pickupAddressId, addressUpdatedAt, branch } = input;
  if (typeof pickupAddressId !== 'string' || pickupAddressId.length > 191 || !pickupAddressId ||
    typeof addressUpdatedAt !== 'number' || !Number.isSafeInteger(addressUpdatedAt) ||
    typeof branch !== 'string' || !current.assignedBranches.includes(branch))
    throw new NcmSettingsError('Choose one of your assigned branches for the current pickup address.', 400);
  const upsert = ncmMariaDb(db)
    ? 'ON DUPLICATE KEY UPDATE partner_id=VALUES(partner_id),address_updated_at=VALUES(address_updated_at),branch=VALUES(branch),updated_at=VALUES(updated_at)'
    : 'ON CONFLICT(pickup_address_id) DO UPDATE SET partner_id=excluded.partner_id,address_updated_at=excluded.address_updated_at,branch=excluded.branch,updated_at=excluded.updated_at';
  await db.batch([...protectPartner, ...verifyConnected(),
    ...ncmTransactionGuard(db, `EXISTS(SELECT 1 FROM seller_operational_addresses WHERE id=? AND purpose='pickup' AND updated_at=?)
      AND EXISTS(SELECT 1 FROM ncm_partner_settings WHERE partner_id=? AND revision=?)`, pickupAddressId, addressUpdatedAt, partnerId, current.revision),
    db.prepare(`INSERT INTO ncm_pickup_branches(pickup_address_id,partner_id,address_updated_at,branch,updated_at)
      VALUES(?,?,?,?,?) ${upsert}`).bind(pickupAddressId, partnerId, addressUpdatedAt, branch, now),
    receipt.insert(result),
  ]);
  return result;
}
