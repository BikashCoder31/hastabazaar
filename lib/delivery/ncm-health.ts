import { can, type PermissionSubject } from '../marketplace/permissions';
import { ncmOrderId } from '../shipping/nepal-can-move';
import { ncmSchemaAvailable } from './ncm-settings';

const hour = 60 * 60 * 1000;
const ownedBookings = `FROM ncm_bookings b
  JOIN shipping_jobs j ON j.id=b.job_id AND j.direction='outbound' AND j.tracking_code=b.ncm_order_id
  JOIN shipping_parcels p ON p.shipping_job_id=j.id AND p.delivery_partner_id=b.partner_id
    AND p.method='courier' AND p.rider_user_id IS NULL`;

export type NcmHealthWarning = { openParcels: number; lastCheckAt: number | null };

export async function readNcmHealthWarning(db: D1Database, actor: PermissionSubject, now: number): Promise<NcmHealthWarning | null> {
  if (!can(actor, 'order.manage') || !await ncmSchemaAvailable(db)) return null;

  const row = await db.prepare(`SELECT COUNT(*) AS openParcels, s.last_check_at AS lastCheckAt
    ${ownedBookings}
    JOIN delivery_partners d ON d.id=b.partner_id AND LOWER(TRIM(d.name))='nepal can move'
    LEFT JOIN ncm_partner_settings s ON s.partner_id=b.partner_id
    WHERE b.state='booked' AND d.status='in_use' AND d.booking_mode='api'
      AND j.status NOT IN ('delivered','cancelled','returned','claim_resolved')
    GROUP BY b.partner_id,s.last_check_at
    HAVING COALESCE(s.last_check_at,MIN(b.started_at))<=?
    ORDER BY COALESCE(s.last_check_at,MIN(b.started_at)),b.partner_id LIMIT 1`)
    .bind(now - hour).first<NcmHealthWarning>();
  return row ? {
    openParcels: Number(row.openParcels),
    lastCheckAt: row.lastCheckAt === null ? null : Number(row.lastCheckAt),
  } : null;
}

export const ncmProgressLabels = {
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivery_failed: 'Delivery attempt failed',
  returning: 'Returning to sender',
  returned: 'Returned',
  delivered: 'Delivered',
} as const;

type NcmProgressStatus = keyof typeof ncmProgressLabels;
type ParcelStatus = {
  jobId: string; sellerId: string; orderNumber: string; status: NcmProgressStatus | null;
  codPaisa: number | null; deliveryChargePaisa: number | null; returnChargePaisa: number | null;
};
export type NcmTimelineEntry = { id: string; text: string; createdAt: number } & (
  { kind: 'status' | 'Info' | 'Action' } | { kind: 'review'; reviewed: boolean; relatedOrderNumber: string | null }
);
export type NcmParcelTimeline = ParcelStatus & { entries: NcmTimelineEntry[] };

function knownStatus(value: unknown): NcmProgressStatus | null {
  return typeof value === 'string' && Object.hasOwn(ncmProgressLabels, value) ? value as NcmProgressStatus : null;
}

function eventDetails(payload: string | null): { status?: unknown; relatedOrderId?: unknown } | null {
  try { return payload ? JSON.parse(payload) : null; }
  catch { return null; }
}

/** The caller authorizes this order through the staff order page. */
export async function readNcmOrderTimeline(db: D1Database, orderId: string, canReview: boolean): Promise<NcmParcelTimeline[]> {
  if (!await ncmSchemaAvailable(db)) return [];

  const { results: bookings } = await db.prepare(`SELECT b.job_id AS jobId,j.seller_id AS sellerId,
    b.ncm_order_id AS orderNumber,b.last_status AS status,b.cod_reported_paisa AS codPaisa,
    b.delivery_charge_paisa AS deliveryChargePaisa,b.return_charge_paisa AS returnChargePaisa
    ${ownedBookings} WHERE b.state='booked' AND j.order_id=? ORDER BY j.seller_id,j.id`).bind(orderId).all<ParcelStatus>();
  if (!bookings.length) return [];

  const { results: rows } = await db.prepare(`WITH order_bookings AS (
      SELECT b.job_id,b.ncm_order_id ${ownedBookings} WHERE b.state='booked' AND j.order_id=?
    )
    SELECT n.job_id AS jobId,n.comment_id AS id,n.kind,n.comment AS text,n.created_at AS createdAt,
      NULL AS payload,0 AS reviewed
    FROM ncm_courier_notes n JOIN order_bookings b ON b.job_id=n.job_id AND b.ncm_order_id=n.ncm_order_id
    UNION ALL
    SELECT e.shipping_job_id,e.id,e.action,e.note,e.created_at,e.payload_json,
      ${canReview ? `CASE WHEN e.action='ncm_attention' AND EXISTS(SELECT 1 FROM audit_logs a
        WHERE a.action='ncm.review_completed' AND a.subject_type='parcel_operation' AND a.subject_id=e.id) THEN 1 ELSE 0 END` : '0'}
    FROM parcel_operation_events e JOIN order_bookings b ON b.job_id=e.shipping_job_id
    WHERE e.order_id=? AND e.action IN ('ncm_status'${canReview ? ",'ncm_attention'" : ''})
    ORDER BY createdAt DESC,id`).bind(orderId,orderId).all<{
    jobId: string; id: string; kind: string; text: string; createdAt: number; payload: string | null; reviewed: number;
  }>();

  const result = bookings.map(b => ({...b, status: knownStatus(b.status), entries: [] as NcmTimelineEntry[]}));
  const byJob = new Map(result.map(parcel => [parcel.jobId, parcel.entries]));
  for (const row of rows) {
    const entries = byJob.get(row.jobId);
    if (!entries) continue;
    const point = {id: row.id, text: row.text, createdAt: Number(row.createdAt)};
    if (row.kind === 'Info' || row.kind === 'Action') {
      entries.push({...point, kind: row.kind});
    } else if (row.kind === 'ncm_attention' && canReview) {
      entries.push({...point, kind: 'review', reviewed: Number(row.reviewed) === 1,
        relatedOrderNumber: ncmOrderId(eventDetails(row.payload)?.relatedOrderId)});
    } else if (row.kind === 'ncm_status') {
      const status = knownStatus(eventDetails(row.payload)?.status);
      if (status) entries.push({...point, kind: 'status', text: ncmProgressLabels[status]});
    }
  }
  return result;
}
