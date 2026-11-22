import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { ncmOrderId } from '../shipping/nepal-can-move';
import { commandReceipt } from '../workflows/contracts';
import { NcmBookingError } from './ncm-booking';
import { activeNcmConnection, ncmSchemaAvailable, ncmTransactionGuard } from './ncm-settings';
import { reserveNcmUsage } from './ncm-usage';

const booked = `SELECT b.partner_id AS partnerId,b.ncm_order_id AS tracking,
  b.vendor_reference AS vendorReference,b.label_json AS labelJson,o.order_number AS orderNumber
  FROM ncm_bookings b JOIN shipping_jobs j ON j.id=b.job_id
  JOIN shipping_parcels p ON p.shipping_job_id=j.id
  JOIN orders o ON o.id=j.order_id
  WHERE b.job_id=? AND b.state='booked' AND p.delivery_partner_id=b.partner_id AND j.tracking_code=b.ncm_order_id`;
type ConfirmedBooking = {partnerId:string; tracking:string; vendorReference:string; labelJson:string|null; orderNumber:string};
const clean = (value: unknown, limit = 500) => typeof value === 'string' ? value.replace(/\p{Cc}/gu,' ').trim().slice(0,limit) : '';
const object = (value: unknown): Record<string,unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};

function party(value: unknown) {
  const row = object(value);
  return [clean(row.name) || clean(value), clean(row.phone), clean(row.address)].filter(Boolean);
}
function branch(value: unknown) { return clean(value) || clean(object(value).name); }
function normalizeLabel(provider: Record<string,unknown>, booking: ConfirmedBooking) {
  const description = object(provider.description);
  if (ncmOrderId(provider.orderid) !== booking.tracking || description.vendor_orderid !== booking.vendorReference)
    throw new NcmBookingError('The NCM label does not match this parcel.');
  return {
    tracking: booking.tracking, orderNumber: booking.orderNumber, vendorReference: booking.vendorReference,
    from: branch(provider.from_branch), to: branch(provider.to_branch),
    sender: party(provider.sender), receiver: party(provider.receiver),
    description: clean(description.package ?? provider.description),
    handling: clean(provider.handling), deliveryType: clean(provider.delivery_type),
  };
}
export type NcmLabelView = ReturnType<typeof normalizeLabel>;

export async function getNcmLabel(db: D1Database, runtime: unknown, jobId: string, now = Date.now()): Promise<NcmLabelView> {
  if (!await ncmSchemaAvailable(db)) throw new NcmBookingError('NCM labels are unavailable.', 404);
  const booking = await db.prepare(booked).bind(jobId).first<ConfirmedBooking>();
  if (!booking) throw new NcmBookingError('NCM label not found.', 404);
  if (booking.labelJson) {
    try { return JSON.parse(booking.labelJson) as NcmLabelView; } catch { /* Try the provider if the saved label cannot be read. */ }
  }
  const context = await activeNcmConnection(db, booking.partnerId, runtime);
  if (!context || !await reserveNcmUsage(db, 'view', 1, now))
    throw new NcmBookingError('The NCM label is unavailable. Keep using manual booking details.');
  // Store only the printable fields, never the complete provider response.
  const label = normalizeLabel(await context.client.label(booking.tracking), booking);
  await db.prepare("UPDATE ncm_bookings SET label_json=? WHERE job_id=? AND ncm_order_id=? AND state='booked'")
    .bind(JSON.stringify(label), jobId, booking.tracking).run();
  return label;
}

export async function sendNcmInstruction(db: D1Database, runtime: unknown, actorId: string, input: {
  jobId:string; partnerId:string; orderId:string; sellerId:string; requestId:string; action:'note'|'return'; note:string;
}, now = Date.now()) {
  if (!await ncmSchemaAvailable(db)) throw new NcmBookingError('NCM actions are unavailable.', 404);
  const authority = await staffMutationGuard(db, actorId, 'order.manage', NcmBookingError);
  const booking = await db.prepare(booked + ' AND j.order_id=? AND j.seller_id=?').bind(input.jobId,input.orderId,input.sellerId)
    .first<ConfirmedBooking>();
  if (!booking || booking.partnerId !== input.partnerId) throw new NcmBookingError('This parcel has no active NCM booking.', 404);
  const note = clean(input.note, 501);
  if (note.length < 3 || note.length > 500) throw new NcmBookingError('Enter a note or reason of 3–500 characters.', 400);
  const context = await activeNcmConnection(db, booking.partnerId, runtime);
  if (!context) throw new NcmBookingError('Switch Nepal Can Move to API mode to send this request.');
  const receipt = await commandReceipt(db, {actorId,requestId:input.requestId,expectedRevision:null,now}, {
    action: 'ncm.' + input.action + '_requested', subjectType: 'shipping_job', subjectId: input.jobId,
    auditReason: input.action === 'return' ? 'Staff requested a courier return. ' + note : 'Staff requested to add an NCM note.',
  }, {tracking:booking.tracking,note});
  if (receipt.replayed) throw new NcmBookingError('This request was already sent. Check it in NCM before sending it again.');
  await db.batch([
    ...authority.statements,
    db.prepare('UPDATE delivery_partners SET revision=revision WHERE id=?').bind(booking.partnerId),
    ...ncmTransactionGuard(db, `EXISTS(SELECT 1 FROM delivery_partners p JOIN ncm_partner_settings s ON s.partner_id=p.id
      WHERE p.id=? AND p.status='in_use' AND p.booking_mode='api' AND s.connection_fingerprint=?)
      AND EXISTS(SELECT 1 FROM ncm_bookings WHERE job_id=? AND state='booked' AND ncm_order_id=?)`,
      booking.partnerId,context.settings.fingerprint,input.jobId,booking.tracking),
    receipt.insert({started:true}),
  ]);
  if (!await activeNcmConnection(db, booking.partnerId, runtime))
    throw new NcmBookingError('The courier was switched to booking by hand. This request stayed in Hastabazaar.');
  if (input.action === 'return') await context.client.returnOrder(booking.tracking, note);
  else await context.client.addComment(booking.tracking, note);
}
