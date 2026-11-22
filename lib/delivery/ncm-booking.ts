import { readDispatchParcels } from '@/app/admin/orders/dispatch/read-dispatch';
import { readCourierBookingDetails } from '@/app/admin/orders/dispatch/read-courier-details';
import type { CourierParcelSelection } from '@/app/admin/orders/dispatch/courier-details';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { operateParcel, prepareSellerParcels, type ParcelOperation } from '../operations/parcels';
import { NcmApiError, ncmOrderId, type NcmOrderInput } from '../shipping/nepal-can-move';
import { activeNcmConnection, ncmTransactionGuard, suggestNcmBranch } from './ncm-settings';
import { ncmDailyLimit, ncmUsageStatements, ncmUsedToday, reserveNcmUsage } from './ncm-usage';

const ncmBookingTimeoutMs = 30_000;
type BookingState = 'booking' | 'needs_review' | 'rejected' | 'booked';
export type NcmBookingRow = {
  jobId: string; partnerId: string; actorId: string; requestId: string; vendorReference: string;
  ncmOrderId: string | null; state: BookingState; startedAt: number; responseJson: string | null;
};
type BookingRequest = {
  selection: CourierParcelSelection;
  partnerId: string;
  destinationBranch: string;
  reviewKey: string;
  requestId: string;
  form: NonNullable<ParcelOperation['form']>;
};
type Context = NonNullable<Awaited<ReturnType<typeof activeNcmConnection>>>;

export class NcmBookingError extends Error {
  constructor(message: string, readonly status = 409, readonly state?: BookingState,
    readonly fields?: NcmApiError['fields']) { super(message); }
}
const checkNcmMessage = 'Check NCM before retrying. Look for the parcel on NCM before you book it again.';
const connectionClosed = 'Nepal Can Move API booking is unavailable. Check Delivery partners or book by hand.';
const bookingSelect = `SELECT b.job_id AS jobId,b.partner_id AS partnerId,b.actor_id AS actorId,b.request_id AS requestId,
  b.vendor_reference AS vendorReference,b.ncm_order_id AS ncmOrderId,b.state,b.started_at AS startedAt,b.response_json AS responseJson
  FROM ncm_bookings b JOIN shipping_jobs j ON j.id=b.job_id`;

export async function ncmBookingForParcel(db: D1Database, orderId: string, sellerId: string) {
  return db.prepare(bookingSelect + " WHERE j.order_id=? AND j.seller_id=? AND j.direction='outbound'")
    .bind(orderId, sellerId).first<NcmBookingRow>();
}

export function ncmVisibleBookingState(booking: Pick<NcmBookingRow, 'state' | 'startedAt'>, now: number): BookingState {
  return booking.state === 'booking' && now - Number(booking.startedAt) >= ncmBookingTimeoutMs ? 'needs_review' : booking.state;
}

async function sha256(data: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function ncmVendorReference(input: {
  orderId: string; sellerId: string; orderNumber: string; singleParcel: boolean; savedReference?: string;
}) {
  if (input.savedReference && /^HB[A-F0-9]{18}$/.test(input.savedReference)) return input.savedReference;
  if (input.singleParcel && /^[a-z0-9_-]{1,20}$/i.test(input.orderNumber)) return input.orderNumber;
  return 'HB' + (await sha256([input.orderId, input.sellerId])).slice(0, 18).toUpperCase();
}

export function ncmBookingPayload(input: {
  receiver:string; phone:string; address:string; pickupBranch:string; destinationBranch:string; codPaisa:number;
  packageName:string; instruction:string; vendorReference:string; weightGrams:number; deliveryType: Context['settings']['deliveryType'];
}): NcmOrderInput {
  const whole = Math.floor(input.codPaisa / 100), remainder = input.codPaisa % 100;
  return {
    name: input.receiver, phone: input.phone, address: input.address,
    fbranch: input.pickupBranch, branch: input.destinationBranch,
    cod_charge: remainder === 0 ? String(whole) : whole + '.' + String(remainder).padStart(2, '0'),
    vref_id: input.vendorReference,
    ...(input.packageName ? {package: input.packageName} : {}),
    ...(input.instruction ? {instruction: input.instruction} : {}),
    delivery_type: input.deliveryType, weight: input.weightGrams / 1000,
  };
}

function jsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}
const valueText = (value: unknown) => typeof value === 'string' ? value.trim() : '';

async function getContext(db: D1Database, runtime: unknown, partnerId: string) {
  const context = await activeNcmConnection(db, partnerId, runtime);
  if (!context) throw new NcmBookingError(connectionClosed, 409);
  return context;
}

async function settingsStillActive(db: D1Database, context: Context) {
  const partner = await db.prepare(`SELECT p.id FROM delivery_partners p JOIN ncm_partner_settings s ON s.partner_id=p.id
    WHERE p.id=? AND p.status='in_use' AND p.booking_mode='api' AND LOWER(TRIM(p.name))='nepal can move'
      AND s.connection_fingerprint=? AND s.connected_at IS NOT NULL`).bind(context.partner.id, context.settings.fingerprint).first<{id:string}>();
  return partner?.id === context.partner.id;
}

async function reviewParcel(db: D1Database, context: Context, selection: CourierParcelSelection, branch?: string, priorReference?: string) {
  const [[details], options] = await Promise.all([
    readCourierBookingDetails(db, [selection]),
    db.prepare(`SELECT o.shipping_address_json AS addressJson,o.delivery_rate_snapshot_json AS deliveryJson,
       a.id AS pickupId,a.updated_at AS pickupUpdatedAt,m.branch AS pickupBranch,
       (SELECT COUNT(DISTINCT i.seller_id) FROM order_items i WHERE i.order_id=o.id AND i.fulfillment_status<>'cancelled') AS parcelCount
      FROM orders o JOIN seller_operational_addresses a ON a.seller_id=? AND a.purpose='pickup'
      LEFT JOIN ncm_pickup_branches m ON m.pickup_address_id=a.id AND m.partner_id=? AND m.address_updated_at=a.updated_at
      WHERE o.id=?`).bind(selection.sellerId, context.partner.id, selection.orderId)
      .first<{addressJson:string; deliveryJson:string | null; pickupId:string; pickupUpdatedAt:number; pickupBranch:string|null; parcelCount:number}>(),
  ]);
  const { settings } = context;
  if (!options?.pickupBranch || !settings.assignedBranches.includes(options.pickupBranch))
    throw new NcmBookingError('Confirm the seller’s pickup branch in Delivery partners before booking with NCM.');
  if (!details.receiver || !details.phone || !details.address)
    throw new NcmBookingError('The parcel needs a receiver, delivery phone and full address before booking with NCM.');
  const weight = Number(details.packedWeightGrams);
  if (!Number.isSafeInteger(weight) || weight < 50 || weight > 30_000)
    throw new NcmBookingError('Ask the seller to record the packed parcel weight before booking with NCM.');
  if (details.codDuePaisa === null || !Number.isSafeInteger(details.codDuePaisa) || details.codDuePaisa < 0)
    throw new NcmBookingError('The amount to collect is unavailable. Review the order before booking.');
  if (!context.partner.collectsCod && details.codDuePaisa > 0)
    throw new NcmBookingError('Nepal Can Move must be set to collect cash on delivery for this parcel.');
  const branches = settings.branches.map(item => item.name);
  if (!branches.length) throw new NcmBookingError('Refresh the NCM branch list in Delivery partners.');
  if (branch && !branches.includes(branch)) throw new NcmBookingError('Choose a destination from the NCM branch list.', 400);
  const address = jsonRecord(options.addressJson);
  const destinationBranch = branch || suggestNcmBranch(settings.branches, {
    district: details.district, municipality: valueText(address.municipality), locality: valueText(address.locality),
  });
  const demo = options.deliveryJson ? jsonRecord(options.deliveryJson).ncmDemo : null;
  const shipments = demo && typeof demo === 'object' && 'shipments' in demo && Array.isArray(demo.shipments) ? demo.shipments : [];
  const existingDemo = shipments.find(item => item && item.sellerId === selection.sellerId);
  const vendorReference = priorReference || await ncmVendorReference({
    orderId: selection.orderId, sellerId: selection.sellerId, orderNumber: details.orderNumber,
    singleParcel: Number(options.parcelCount) === 1, savedReference: valueText(existingDemo?.vref_id),
  });
  const draft = {
    receiver: details.receiver, phone: details.phone, address: details.address,
    pickupBranch: options.pickupBranch, destinationBranch, deliveryType: settings.deliveryType,
    weightGrams: weight, codPaisa: details.codDuePaisa, packageName: settings.packageName, items: details.items,
    instruction: [valueText(address.landmark), valueText(address.deliveryNotes)].filter(Boolean).join(' · '),
    vendorReference, branches, orderNumber: details.orderNumber,
  };
  const payload = destinationBranch ? ncmBookingPayload({...draft, destinationBranch}) : null;
  const reviewKey = payload ? await sha256([payload, details.items, options.pickupId, Number(options.pickupUpdatedAt)]) : null;
  return {draft, payload, reviewKey, pickupId: options.pickupId, pickupUpdatedAt: Number(options.pickupUpdatedAt), addressJson: options.addressJson};
}

export async function getNcmBookingDraft(db: D1Database, runtime: unknown, selection: CourierParcelSelection, partnerId: string, branch?: string) {
  const context = await getContext(db, runtime, partnerId);
  const prior = await ncmBookingForParcel(db, selection.orderId, selection.sellerId);
  if (prior && prior.state !== 'rejected') throw existingBookingError(prior, Date.now());
  const draft = await reviewParcel(db, context, selection, branch, prior?.vendorReference);
  let chargePaisa: number | null = null;
  if (draft.draft.destinationBranch) {
    if (!await reserveNcmUsage(db, 'view', 1, Date.now()) || !await settingsStillActive(db, context))
      throw new NcmBookingError('NCM rate checks are unavailable. You can still book by hand.');
    chargePaisa = await context.client.shippingRate(draft.draft.pickupBranch, draft.draft.destinationBranch, draft.draft.deliveryType);
  }
  return {...draft.draft, chargePaisa, reviewKey: draft.reviewKey};
}

function existingBookingError(booking: NcmBookingRow, now: number) {
  const state = ncmVisibleBookingState(booking, now);
  if (state === 'needs_review') return new NcmBookingError(checkNcmMessage, 409, state);
  if (state === 'booking') return new NcmBookingError('The booking is in progress. Refresh Dispatch shortly.', 409, state);
  if (state === 'booked') return new NcmBookingError('This parcel already has an NCM booking.', 409, state);
  return new NcmBookingError('NCM rejected this booking. Review the highlighted details and submit a new request.', 400, state,
    booking.responseJson ? jsonRecord(booking.responseJson) as NcmApiError['fields'] : undefined);
}

async function resolvePrepared(db: D1Database, selection: CourierParcelSelection, actorId: string, requestId: string, now: number) {
  const [current] = await readDispatchParcels(db, selection);
  if (!current || current.lane !== 'ready' || current.jobId !== selection.jobId || current.version !== selection.version)
    throw new NcmBookingError('The parcel changed. Refresh Dispatch and check it again.');
  if (current.jobId && current.version !== null) return {jobId:current.jobId, version:Number(current.version)};
  // The parcel may have a job without an initialized cash record on a legacy order.
  await prepareSellerParcels(db, {orderId: selection.orderId, actorId, requestId:requestId + ':prepare', now});
  const [prepared] = await readDispatchParcels(db, selection);
  if (!prepared?.jobId || prepared.version !== 0 || prepared.lane !== 'ready')
    throw new NcmBookingError('The parcel changed. Refresh Dispatch and check it again.');
  return {jobId:prepared.jobId, version:0};
}

async function finalizeNcmBooking(db: D1Database, context: Context, input: {
  jobId:string; version:number; actorId:string; requestId:string; operationId:string; trackingNumber:string;
  vendorReference:string; form:NonNullable<ParcelOperation['form']>; now:number;
}) {
  const tracking = ncmOrderId(input.trackingNumber);
  if (!tracking) throw new NcmBookingError(checkNcmMessage, 409, 'needs_review');
  try {
    await db.batch([
      ...ncmTransactionGuard(db, `EXISTS(SELECT 1 FROM ncm_bookings WHERE job_id=? AND request_id=?
        AND state IN ('booking','needs_review') AND (ncm_order_id IS NULL OR ncm_order_id=?))`,
      input.jobId, input.requestId, tracking),
      db.prepare("UPDATE ncm_bookings SET ncm_order_id=?,updated_at=? WHERE job_id=? AND request_id=? AND state IN ('booking','needs_review')")
        .bind(tracking, input.now, input.jobId, input.requestId),
    ]);
    await operateParcel(db, {
      jobId: input.jobId, version: input.version, actorId: input.actorId, requestId: input.operationId,
      action: 'assign', method: 'courier', courierName: context.partner.name, deliveryPartnerId: context.partner.id,
      trackingCode: tracking, now: input.now, note: 'Nepal Can Move booking confirmed for ' + input.vendorReference + '.',
      form: {...input.form, requestId: input.operationId},
    }, {requestId:input.requestId, orderId:tracking});
    return tracking;
  } catch {
    const saved = await db.prepare('SELECT state,ncm_order_id AS tracking FROM ncm_bookings WHERE job_id=? AND request_id=?')
      .bind(input.jobId, input.requestId).first<{state:BookingState; tracking:string|null}>();
    if (saved?.state === 'booked' && saved.tracking === tracking) return tracking;
    await db.prepare("UPDATE ncm_bookings SET state='needs_review',updated_at=? WHERE job_id=? AND request_id=? AND state='booking'")
      .bind(input.now, input.jobId, input.requestId).run();
    throw new NcmBookingError(checkNcmMessage, 409, 'needs_review');
  }
}

export async function bookWithNcm(db: D1Database, runtime: unknown, actorId: string, input: BookingRequest, now = Date.now()) {
  const context = await getContext(db, runtime, input.partnerId);
  const authority = await staffMutationGuard(db, actorId, 'order.manage', NcmBookingError);
  const { selection, requestId } = input;
  const prior = await ncmBookingForParcel(db, selection.orderId, selection.sellerId);
  if (prior?.state === 'booked' && prior.requestId === requestId && prior.actorId === actorId && prior.ncmOrderId)
    return prior.ncmOrderId;
  if (prior && (prior.requestId === requestId || prior.state !== 'rejected'))
    throw existingBookingError(prior, now);
  const reviewed = await reviewParcel(db, context, selection, input.destinationBranch, prior?.vendorReference);
  if (!reviewed.payload || reviewed.reviewKey !== input.reviewKey)
    throw new NcmBookingError('The parcel or booking details changed. Check the details again.');
  const { jobId, version } = await resolvePrepared(db, selection, actorId, requestId, now);
  const partnerId = context.partner.id;
  const vendorReference = reviewed.draft.vendorReference;
  try {
    await db.batch([
      ...authority.statements,
      db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(selection.orderId),
      db.prepare('UPDATE shipping_parcels SET version=version WHERE shipping_job_id=?').bind(jobId),
      db.prepare('UPDATE delivery_partners SET revision=revision WHERE id=?').bind(partnerId),
      ...ncmTransactionGuard(db, `EXISTS(SELECT 1 FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id
        JOIN orders o ON o.id=j.order_id WHERE j.id=? AND j.order_id=? AND j.seller_id=? AND p.version=?
        AND j.status IN ('pickup_requested','label_pending','label_ready','pickup_scheduled')
        AND j.direction='outbound' AND p.method IS NULL AND j.tracking_code IS NULL
        AND o.status IN ('confirmed','packing','ready_for_pickup','dispatched') AND o.shipping_address_json=?
        AND (CASE WHEN o.payment_mode='cod' THEN p.cod_due_paisa ELSE 0 END)=?)
        AND NOT EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=? AND status<>'confirmed')
        AND EXISTS(SELECT 1 FROM order_items WHERE order_id=? AND seller_id=? AND fulfillment_status='ready_for_pickup')
        AND NOT EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=? AND i.seller_id=?
          AND i.fulfillment_status NOT IN ('ready_for_pickup','cancelled'))
        AND NOT EXISTS(SELECT 1 FROM order_items i JOIN order_fulfillment_holds h ON h.order_item_id=i.id
          WHERE i.order_id=? AND i.seller_id=? AND h.ended_at IS NULL AND h.prevents_handoff=1)
        AND EXISTS(SELECT 1 FROM ncm_pickup_branches m JOIN seller_operational_addresses a ON a.id=m.pickup_address_id
          WHERE m.pickup_address_id=? AND a.updated_at=? AND m.address_updated_at=a.updated_at AND m.partner_id=? AND m.branch=?)
        AND EXISTS(SELECT 1 FROM delivery_partners p JOIN ncm_partner_settings s ON s.partner_id=p.id
          WHERE p.id=? AND p.status='in_use' AND p.booking_mode='api' AND s.connection_fingerprint=? AND s.revision=?)`,
        jobId, selection.orderId, selection.sellerId, version, reviewed.addressJson, reviewed.draft.codPaisa, selection.orderId,
        selection.orderId, selection.sellerId, selection.orderId, selection.sellerId, selection.orderId, selection.sellerId,
        reviewed.pickupId, reviewed.pickupUpdatedAt, partnerId, reviewed.draft.pickupBranch,
        partnerId, context.settings.fingerprint, context.settings.revision),
      ...ncmUsageStatements(db, 'create', 1, now),
      ...(prior ? [
        ...ncmTransactionGuard(db,"EXISTS(SELECT 1 FROM ncm_bookings WHERE job_id=? AND state='rejected' AND request_id=? AND ncm_order_id IS NULL)", jobId, prior.requestId),
        db.prepare(`UPDATE ncm_bookings SET state='booking',request_id=?,actor_id=?,partner_id=?,started_at=?,updated_at=?,response_json=NULL
          WHERE job_id=? AND state='rejected' AND request_id=?`).bind(requestId, actorId, partnerId, now, now, jobId, prior.requestId),
      ] : [db.prepare(`INSERT INTO ncm_bookings(job_id,partner_id,actor_id,vendor_reference,state,request_id,started_at,updated_at)
        VALUES(?,?,?,?,'booking',?,?,?)`).bind(jobId, partnerId, actorId, vendorReference, requestId, now, now)]),
      db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at)
        VALUES(?,?,'ncm.booking_requested','shipping_job',?,'Started the reviewed Nepal Can Move booking.',?,?)`)
        .bind(crypto.randomUUID(), actorId, jobId, requestId + ':requested', now),
    ]);
  } catch {
    const current = await ncmBookingForParcel(db, selection.orderId, selection.sellerId);
    if (current && current.state !== 'rejected') throw existingBookingError(current, now);
    if (await ncmUsedToday(db, 'create', now) >= ncmDailyLimit.create)
      throw new NcmBookingError('Today’s NCM API booking limit has been reached. You can book by hand.', 429);
    throw new NcmBookingError('The parcel changed or a booking already uses this reference. Check Dispatch before trying again.');
  }
  if (!await settingsStillActive(db, context)) {
    await db.prepare("UPDATE ncm_bookings SET state='rejected',updated_at=? WHERE job_id=? AND request_id=? AND state='booking'")
      .bind(Date.now(), jobId, requestId).run();
    throw new NcmBookingError(connectionClosed);
  }
  let trackingNumber: string;
  try {
    trackingNumber = (await context.client.createOrder(reviewed.payload)).trackingCode;
  } catch (error) {
    const rejected = error instanceof NcmApiError && error.kind === 'rejected';
    const fields = rejected ? error.fields : undefined;
    const state = rejected ? 'rejected' : 'needs_review';
    await db.prepare("UPDATE ncm_bookings SET state=?,response_json=?,updated_at=? WHERE job_id=? AND request_id=? AND state='booking'")
      .bind(state, fields ? JSON.stringify(fields) : null, Date.now(), jobId, requestId).run();
    throw new NcmBookingError(rejected ? error.message : checkNcmMessage, rejected ? 400 : 409, state, fields);
  }
  return finalizeNcmBooking(db, context, { jobId, version, actorId, requestId, operationId:requestId,
    trackingNumber, vendorReference, form:input.form, now:Date.now() });
}

export async function ncmDispatchState(db: D1Database, now: number, jobIds: (string | null)[]) {
  const byJob = new Map<string,{state:BookingState; trackingNumber:string|null}>();
  const ids = [...new Set(jobIds.filter((id): id is string => id !== null))];
  for (let i = 0; i < ids.length; i += 80) {
    const group = ids.slice(i,i+80);
    const {results} = await db.prepare(bookingSelect + ` WHERE b.job_id IN (${group.map(() => '?').join(',')})`)
      .bind(...group).all<NcmBookingRow>();
    for (const row of results) byJob.set(row.jobId, {state:ncmVisibleBookingState(row,now),trackingNumber:row.ncmOrderId});
  }
  return {byJob, usedToday:await ncmUsedToday(db, 'create', now), limit:ncmDailyLimit.create};
}

export async function recoverNcmBooking(db: D1Database, runtime: unknown, actorId: string, input: {
  selection:CourierParcelSelection; partnerId:string; requestId:string; trackingNumber?:string;
  form?:NonNullable<ParcelOperation['form']>;
}, now = Date.now()) {
  const context = await getContext(db, runtime, input.partnerId);
  const authority = await staffMutationGuard(db, actorId, 'order.manage', NcmBookingError);
  const prior = await ncmBookingForParcel(db, input.selection.orderId, input.selection.sellerId);
  if (!prior || prior.jobId !== input.selection.jobId || prior.partnerId !== input.partnerId ||
    ncmVisibleBookingState(prior, now) !== 'needs_review')
    throw new NcmBookingError('There is no NCM booking awaiting review for this parcel.');
  if (input.trackingNumber !== undefined) {
    const tracking = ncmOrderId(input.trackingNumber);
    if (!tracking || (prior.ncmOrderId && prior.ncmOrderId !== tracking) || !input.form || input.selection.version === null)
      throw new NcmBookingError('Enter the NCM order number for this parcel.', 400);
    if (!await reserveNcmUsage(db, 'view', 1, now) || !await settingsStillActive(db, context))
      throw new NcmBookingError('Could not verify the NCM order right now.');
    const label = await context.client.label(tracking);
    const desc = label.description;
    if (ncmOrderId(label.orderid) !== tracking || !desc || typeof desc !== 'object' ||
      !('vendor_orderid' in desc) || desc.vendor_orderid !== prior.vendorReference)
      throw new NcmBookingError('The NCM order does not match this parcel’s vendor reference.', 409, 'needs_review');
    return finalizeNcmBooking(db, context, {jobId:prior.jobId, version:input.selection.version, actorId,
      requestId:prior.requestId, operationId:input.requestId, trackingNumber:tracking, vendorReference:prior.vendorReference,
      form:input.form, now:Date.now()});
  }
  if (prior.ncmOrderId) throw new NcmBookingError('This parcel has a saved NCM order number. Verify it before booking again.', 409, 'needs_review');
  await db.batch([
    ...authority.statements,
    db.prepare('UPDATE shipping_parcels SET version=version WHERE shipping_job_id=?').bind(prior.jobId),
    ...ncmTransactionGuard(db, `EXISTS(SELECT 1 FROM ncm_bookings WHERE job_id=? AND request_id=? AND ncm_order_id IS NULL
      AND (state='needs_review' OR (state='booking' AND started_at<=?)))`, prior.jobId, prior.requestId, now - ncmBookingTimeoutMs),
    db.prepare("UPDATE ncm_bookings SET state='rejected',updated_at=? WHERE job_id=? AND request_id=?")
      .bind(now, prior.jobId, prior.requestId),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at)
      VALUES(?,?,'ncm.booking_retry_allowed','shipping_job',?,'Staff checked NCM and confirmed the parcel was not booked.',?,?)`)
      .bind(crypto.randomUUID(), actorId, prior.jobId, input.requestId, now),
  ]);
  return null;
}
