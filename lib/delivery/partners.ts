import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { commandReceipt } from '../workflows/contracts';
import { validatePartnerTrackingPattern } from './partner-tracking';
import { ncmPartnerName, ncmTransactionGuard, testedNcmConnection } from './ncm-settings';

import { deliveryPartnerStatuses, type DeliveryPartnerStatus } from './partner-status';

type DeliveryPartnerRow = {
  id: string;
  name: string;
  status: DeliveryPartnerStatus;
  bookingMode: 'manual' | 'api';
  collectsCod: number;
  trackingPattern: string | null;
  isDefault: number;
  revision: number;
  parcelsThisMonth: number;
};

export type DeliveryPartner = Omit<DeliveryPartnerRow, 'collectsCod' | 'isDefault'> & {
  collectsCod: boolean;
  isDefault: boolean;
};

const columns = ['id','name','status','booking_mode','collects_cod','tracking_pattern','default_slot','revision','created_at','updated_at'];
const selection = `p.id,p.name,p.status,p.booking_mode AS bookingMode,p.collects_cod AS collectsCod,
   p.tracking_pattern AS trackingPattern,CASE WHEN p.default_slot=1 THEN 1 ELSE 0 END AS isDefault,p.revision`;
const mapPartner = (row: DeliveryPartnerRow): DeliveryPartner => ({
  ...row, revision: Number(row.revision), parcelsThisMonth: Number(row.parcelsThisMonth),
  collectsCod: Number(row.collectsCod) === 1, isDefault: Number(row.isDefault) === 1,
});

export class DeliveryPartnerError extends Error {
  constructor(message: string, readonly status = 403) { super(message); }
}

export async function deliveryPartnerSchemaAvailable(db: D1Database) {
  if ((db as D1Database & { dialect?: string }).dialect === 'mariadb') {
    const { results } = await db.prepare(`SELECT TABLE_NAME AS tableName,COLUMN_NAME AS name
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND
      (TABLE_NAME='delivery_partners' OR (TABLE_NAME='shipping_parcels' AND COLUMN_NAME='delivery_partner_id'))`)
      .all<{ tableName: string; name: string }>();
    return columns.every(name => results.some(column => column.tableName === 'delivery_partners' && column.name === name)) &&
      results.some(column => column.tableName === 'shipping_parcels' && column.name === 'delivery_partner_id');
  }
  const [partners, parcels] = await Promise.all([
    db.prepare('PRAGMA table_info(delivery_partners)').all<{ name: string }>(),
    db.prepare('PRAGMA table_info(shipping_parcels)').all<{ name: string }>(),
  ]);
  return columns.every(name => partners.results.some(column => column.name === name)) &&
    parcels.results.some(column => column.name === 'delivery_partner_id');
}

export async function listDeliveryPartners(db: D1Database, options: { activeOnly?: boolean; monthStart?: number } = {}) {
  if (!await deliveryPartnerSchemaAvailable(db)) return null;
  const count = options.monthStart === undefined ? '0' : `(SELECT COUNT(*) FROM shipping_parcels parcel
    WHERE parcel.delivery_partner_id=p.id AND EXISTS(SELECT 1 FROM parcel_operation_events e
      WHERE e.shipping_job_id=parcel.shipping_job_id AND e.action='assign' AND e.created_at>=?))`;
  const { results } = await db.prepare(`SELECT ${selection},${count} AS parcelsThisMonth FROM delivery_partners p
    ${options.activeOnly ? "WHERE p.status='in_use' AND (p.booking_mode='manual' OR LOWER(TRIM(p.name))='nepal can move')" : ''}
    ORDER BY CASE WHEN p.default_slot=1 THEN 0 WHEN p.status='in_use' THEN 1 WHEN p.status='setting_up' THEN 2 ELSE 3 END, p.name,p.id`)
    .bind(...(options.monthStart === undefined ? [] : [options.monthStart])).all<DeliveryPartnerRow>();
  return results.map(mapPartner);
}

export async function readDeliveryPartner(db: D1Database, id: string) {
  if (!await deliveryPartnerSchemaAvailable(db)) return null;
  const row = await db.prepare(`SELECT ${selection},0 AS parcelsThisMonth FROM delivery_partners p WHERE p.id=?`)
    .bind(id).first<DeliveryPartnerRow>();
  return row?.id === id ? mapPartner(row) : null;
}

export type SaveDeliveryPartner = {
  id: string;
  name: string;
  status: DeliveryPartnerStatus;
  bookingMode: string;
  collectsCod: boolean;
  trackingPattern: string;
  makeDefault: boolean;
  expectedRevision: number | null;
  requestId: string;
  now: number;
};

const validId = /^[a-zA-Z0-9_-]{1,100}$/;
export async function saveDeliveryPartner(db: D1Database, actorId: string, input: SaveDeliveryPartner, runtime?: unknown) {
  const authority = await staffMutationGuard(db, actorId, 'order.manage', DeliveryPartnerError, 'super_admin');
  if (!await deliveryPartnerSchemaAvailable(db))
    throw new DeliveryPartnerError('Delivery partners are available after the database update.', 409);
  const { id, status, bookingMode, collectsCod, makeDefault, expectedRevision, requestId, now } = input;
  const name = input.name.trim();
  if (!validId.test(id) || !validId.test(requestId) || name.length < 2 || name.length > 120 ||
      /\p{Cc}/u.test(name) || !deliveryPartnerStatuses.some(option => option.value === status) ||
      (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)))
    throw new DeliveryPartnerError('Check the delivery partner details and try again.', 400);
  if (bookingMode !== 'manual' && (bookingMode !== 'api' || !ncmPartnerName(name) ||
    status !== 'in_use' || expectedRevision === null))
    throw new DeliveryPartnerError('Bookings are by hand until an API integration is switched on separately.', 400);
  if (makeDefault && (status !== 'in_use' || bookingMode !== 'manual'))
    throw new DeliveryPartnerError('The default partner must be In use and booked by hand.', 400);
  let trackingPattern: string | null;
  try {
    trackingPattern = validatePartnerTrackingPattern(input.trackingPattern);
  } catch (error) {
    throw new DeliveryPartnerError(error instanceof Error ? error.message : 'Check the tracking link.', 400);
  }
  const payload = { name, status, bookingMode, collectsCod, trackingPattern, makeDefault };
  const receipt = () => commandReceipt(db, { actorId, requestId, now, expectedRevision: expectedRevision?.toString() ?? null }, {
    action: 'delivery_partner.saved', subjectType: 'delivery_partner', subjectId: id,
    auditReason: expectedRevision === null ? 'Added a delivery partner booked by hand.' : bookingMode === 'api'
      ? 'Saved Nepal Can Move for API booking.' : 'Saved the delivery partner for booking by hand.',
  }, payload);
  const command = await receipt();
  if (command.replayed) return command.result;
  const connection = bookingMode === 'api' ? await testedNcmConnection(db, id, runtime) : null;
  if (bookingMode === 'api' && !connection)
    throw new DeliveryPartnerError('Test the Nepal Can Move connection before choosing API.', 409);
  const guardId = crypto.randomUUID();
  const exact = expectedRevision === null ? 'NOT EXISTS(SELECT 1 FROM delivery_partners WHERE id=?)'
    : 'EXISTS(SELECT 1 FROM delivery_partners WHERE id=? AND revision=?)';
  const values = [name, status, bookingMode, Number(collectsCod), trackingPattern, makeDefault ? 1 : null];
  const write = expectedRevision === null
    ? db.prepare(`INSERT INTO delivery_partners(id,name,status,booking_mode,collects_cod,tracking_pattern,default_slot,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(id, ...values, now, now)
    : db.prepare(`UPDATE delivery_partners SET name=?,status=?,booking_mode=?,collects_cod=?,tracking_pattern=?,
        default_slot=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?`).bind(...values, now, id, expectedRevision);
  const result = { ok: true, id };
  try {
    await db.batch([
      ...authority.statements,
      ...(expectedRevision === null ? [] : [db.prepare('UPDATE delivery_partners SET revision=revision WHERE id=?').bind(id)]),
      db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${exact} THEN 1 ELSE 0 END`)
        .bind(guardId, id, ...(expectedRevision === null ? [] : [expectedRevision])),
      ...(connection ? ncmTransactionGuard(db, `EXISTS(
        SELECT 1 FROM ncm_partner_settings s JOIN delivery_partners p ON p.id=s.partner_id
        WHERE s.partner_id=? AND s.connection_fingerprint=? AND s.connected_at IS NOT NULL
          AND LOWER(TRIM(p.name))='nepal can move')`, id, connection.settings.fingerprint) : []),
      ...(makeDefault ? [db.prepare(`UPDATE delivery_partners SET default_slot=NULL,revision=revision+1,updated_at=?
        WHERE default_slot=1 AND id<>?`).bind(now, id)] : []),
      write, command.insert(result),
      db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),
    ]);
  } catch {
    const repeated = await receipt();
    if (repeated.replayed) return repeated.result;
    throw new DeliveryPartnerError('The delivery partner changed or that name is already in use. Refresh and try again.', 409);
  }
  return result;
}
