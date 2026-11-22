import { createHash, timingSafeEqual } from 'node:crypto';
import { requireDatabase } from '../db/d1';
import { BodyTooLargeError } from '../http/bounded-body';
import { readBoundedJsonObject } from '../http/form-json-body';
import { ncmOrderId, type NcmApiClient } from '../shipping/nepal-can-move';
import { applyConfirmedNcmProgress, ncmConfirmedStage, recordNcmComment } from './ncm-progress';
import { activeNcmConnection, ncmMariaDb, ncmSchemaAvailable } from './ncm-settings';
import { ncmDailyLimit, ncmUsedToday, reserveNcmUsage } from './ncm-usage';

const quarterHourMs = 15 * 60_000;
const claimLeaseMs = 5 * 60_000;
const workerBudgetMs = 48_000;
const webhookBudgetMs = 32_000;
const requestBudgetMs = 15_000;
const bulkSize = 40;
const webhookWorkLimit = 120;
const queueLimit = 20;

const deliveryEvents = new Set([
  'pickup_completed', 'dropoff_collected', 'order_dispatched', 'order_arrived', 'sent_for_delivery',
  'returned_to_warehouse', 'delivery_completed', 'order_marked_rtv', 'send_to_vendor', 'rtv_delivery',
  'refund_initiated', 'exchange_initiated',
]);
const receiptEvidenceEvents = new Set(['returned_to_warehouse','rtv_delivery','refund_initiated','exchange_initiated']);
const activePartnerSql = "d.status='in_use' AND d.booking_mode='api' AND LOWER(TRIM(d.name))='nepal can move'";

type WebhookKind = 'delivery' | 'comments';
export type NcmWebhookBindings = { DB?: D1Database; NCM_WEBHOOK_KEY?: string; NCM_API_TOKEN?: string; NCM_DEMO_API_TOKEN?: string };
type Payload = Record<string, unknown>;
type WebhookEvent = { id: string; event: string; payload: Payload };
type SavedReceipt = { payload: Payload; remainingOrderIds: string[] };
type Booking = { jobId: string; partnerId: string; actorId: string; ncmOrderId: string };
type WorkerOptions = {
  clock?: () => number;
  applyProgress?: typeof applyConfirmedNcmProgress;
  recordComment?: typeof recordNcmComment;
};
type Worker = Required<WorkerOptions>;

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = (value: string) => createHash('sha256').update(value).digest();
const hexDigest = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Payload => value && typeof value === 'object' && !Array.isArray(value) ? value as Payload : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 128) : '';
const parameters = (values: readonly unknown[]) => values.map(() => '?').join(',');

function authorizedWebhook(request: Request, key: string | undefined) {
  if (typeof key !== 'string' || key.length < 32 || key.length > 512) return false;
  const values = new URL(request.url).searchParams.getAll('key');
  const matches = timingSafeEqual(digest(key), digest(values[0] ?? ''));
  return matches && values.length === 1;
}

function eventTimestamp(payload: Payload) {
  if (typeof payload.timestamp === 'number' && Number.isFinite(payload.timestamp)) return String(payload.timestamp);
  const stamp = text(payload.timestamp);
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d+))?(?:Z|[+-]\d{2}:?\d{2})$/i.exec(stamp);
  if (iso) {
    const milliseconds = Date.parse(stamp);
    if (Number.isFinite(milliseconds)) {
      const fraction = (iso[1] ?? '').slice(3).replace(/0+$/, '');
      return new Date(milliseconds).toISOString().slice(0, -1) + fraction + 'Z';
    }
  }
  return stamp;
}

function eventOrderIds(event: string, payload: Payload) {
  const ids = [payload.order_id, ...array(payload.order_ids), ...array(payload.orders).map(value => object(value).order_id)];
  if (event === 'refund_initiated' || event === 'exchange_initiated') ids.push(object(payload.customer_order).order_id);
  return [...new Set(ids.map(ncmOrderId).filter((id): id is string => id !== null))].sort();
}

function payloadForStorage(payload: Payload, bindings: NcmWebhookBindings): Payload {
  let saved = JSON.stringify(payload);
  for (const secret of [bindings.NCM_WEBHOOK_KEY, bindings.NCM_API_TOKEN, bindings.NCM_DEMO_API_TOKEN]) {
    if (typeof secret !== 'string' || !secret) continue;
    for (const value of new Set([secret, encodeURIComponent(secret)])) {
      const quoted = JSON.stringify(value);
      saved = value.length >= 16 ? saved.replaceAll(quoted.slice(1, -1), '[redacted]') : saved.replaceAll(quoted, '"[redacted]"');
    }
  }
  return object(JSON.parse(saved));
}

function worker(options: WorkerOptions): Worker {
  return { clock: options.clock ?? Date.now, applyProgress: options.applyProgress ?? applyConfirmedNcmProgress,
    recordComment: options.recordComment ?? recordNcmComment };
}

export async function receiveNcmWebhook(request: Request, kind: WebhookKind, runtime: NcmWebhookBindings,
  defer: (task: () => Promise<unknown>) => void, options: WorkerOptions = {}) {
  if (!authorizedWebhook(request, runtime.NCM_WEBHOOK_KEY)) return reply({ error: 'Unauthorized' }, 401);
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json')
    return reply({ error: 'Expected JSON.' }, 415);

  try {
    const payload = payloadForStorage(await readBoundedJsonObject(request), runtime);
    const db = requireDatabase(runtime);
    if (!await ncmSchemaAvailable(db)) return reply({ error: 'NCM webhook storage is unavailable.' }, 503);
    const event = text(payload.event).toLowerCase() || 'unknown';
    const timestamp = eventTimestamp(payload);
    const orderIds = kind === 'comments' && event === 'comment_added' ? [ncmOrderId(payload.order_id)].filter((id): id is string => id !== null)
      : eventOrderIds(event, payload);
    const commentId = kind === 'comments' ? ncmOrderId(payload.comment_id) ?? text(payload.comment_id) : '';
    const portalTest = payload.test === true;
    const saved: SavedReceipt = { payload, remainingOrderIds: orderIds };
    const id = hexDigest(JSON.stringify([kind, portalTest, event, orderIds, timestamp, commentId,
      orderIds.length && timestamp ? null : hexDigest(JSON.stringify(payload))]));
    const supported = !portalTest && Boolean(timestamp) && orderIds.length > 0 &&
      (kind === 'delivery' ? deliveryEvents.has(event) : event === 'comment_added' && Boolean(commentId));
    const context = worker(options), now = context.clock();
    const insert = ncmMariaDb(db) ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
    const inserted = await db.prepare(`${insert} INTO ncm_webhook_events(id,kind,event,payload_json,received_at,processed_at)
      VALUES(?,?,?,?,?,?)`).bind(id, kind, event, JSON.stringify(saved), now, supported ? null : now).run();
    if (supported && inserted.meta.changes === 1) {
      try {
        defer(() => processWebhook(db, runtime, id, context, context.clock() + workerBudgetMs).catch(() => false));
      } catch { /* The saved receipt is still available to the scheduled worker. */ }
    }
    return reply({ received: true });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return reply({ error: 'The request is too large.' }, 413);
    if (error instanceof SyntaxError) return reply({ error: 'Invalid JSON request.' }, 400);
    return reply({ error: 'NCM webhook storage is unavailable.' }, 503);
  }
}

const ownedBookings = (db: D1Database) => `SELECT b.job_id AS jobId,b.partner_id AS partnerId,b.actor_id AS actorId,b.ncm_order_id AS ncmOrderId
  FROM ncm_bookings b JOIN delivery_partners d ON d.id=b.partner_id
  JOIN shipping_jobs j ON j.id=b.job_id AND j.direction='outbound'
    AND j.tracking_code${ncmMariaDb(db) ? ' COLLATE utf8mb4_nopad_bin' : ''}=b.ncm_order_id
  JOIN shipping_parcels p ON p.shipping_job_id=b.job_id AND p.delivery_partner_id=b.partner_id
    AND p.method='courier' AND p.rider_user_id IS NULL
  WHERE b.state='booked' AND ${activePartnerSql}`;
const openParcelSql = "j.status NOT IN ('delivered','cancelled','returned')";

async function partnerInApiMode(db: D1Database, partnerId: string) {
  return Boolean(await db.prepare(`SELECT d.id FROM delivery_partners d WHERE d.id=? AND ${activePartnerSql}`).bind(partnerId).first());
}

async function findWebhookBookings(db: D1Database, orderIds: string[], deadline: number, clock: () => number) {
  const bookings: Booking[] = [];
  for (let offset = 0; offset < orderIds.length; offset += bulkSize) {
    if (clock() >= deadline) throw new Error('NCM webhook lookup budget elapsed.');
    const ids = orderIds.slice(offset, offset + bulkSize);
    const { results } = await db.prepare(`${ownedBookings(db)} AND b.ncm_order_id IN (${parameters(ids)}) ORDER BY b.ncm_order_id`)
      .bind(...ids).all<Booking>();
    bookings.push(...results);
  }
  return bookings;
}

async function confirmBatch(db: D1Database, bookings: Booking[], partnerId: string, client: NcmApiClient,
  context: Worker, deadline: number, receipt?: {event: WebhookEvent; onConfirmed: (id: string) => void}) {
  const now = context.clock();
  if (now > deadline - requestBudgetMs || !await partnerInApiMode(db, partnerId)) return false;
  const ids = bookings.map(booking => booking.ncmOrderId);
  if (!await reserveNcmUsage(db, 'view', ids.length, now)) return false;
  if (!receipt) {
    // Rotate the next bounded pass even if NCM omits some of the requested orders.
    await db.prepare(`UPDATE ncm_bookings SET updated_at=CASE WHEN updated_at<? THEN ? ELSE updated_at END
      WHERE partner_id=? AND ncm_order_id IN (${parameters(ids)})`).bind(now, now, partnerId, ...ids).run();
  }
  if (context.clock() > deadline - requestBudgetMs || !await partnerInApiMode(db, partnerId)) return false;
  const confirmed = await client.bulkStatuses(ids);
  let complete = true;
  for (const booking of bookings) {
    if (context.clock() > deadline - requestBudgetMs) return false;
    const status = confirmed.get(booking.ncmOrderId);
    if (!status?.trim()) { complete = false; continue; }
    try {
      const evidencePending = receipt && receiptEvidenceEvents.has(receipt.event.event) &&
        ncmConfirmedStage(status) !== ncmConfirmedStage(receipt.event.event);
      await context.applyProgress(db, { booking, status, webhookEvent: evidencePending ? undefined : receipt?.event, client, now: context.clock() });
      if (evidencePending) { complete = false; continue; }
      receipt?.onConfirmed(booking.ncmOrderId);
    } catch { complete = false; }
  }
  return complete;
}

async function applyWebhook(db: D1Database, runtime: unknown, kind: WebhookKind, event: WebhookEvent,
  remaining: Set<string>, context: Worker, deadline: number) {
  const lookupIds = [...remaining].slice(0, webhookWorkLimit);
  const bookings = await findWebhookBookings(db, lookupIds, deadline, context.clock);
  for (const id of lookupIds) remaining.delete(id);
  const byPartner = new Map<string, Booking[]>();
  for (const booking of bookings) {
    remaining.add(booking.ncmOrderId);
    const group = byPartner.get(booking.partnerId) ?? [];
    group.push(booking);
    byPartner.set(booking.partnerId, group);
  }
  for (const [partnerId, group] of byPartner) {
    if (context.clock() >= deadline) return;
    const connection = await activeNcmConnection(db, partnerId, runtime);
    if (!connection) continue;
    if (kind === 'comments') {
      const booking = group[0];
      await context.recordComment(db, { booking, eventId: event.id, payload: event.payload, now: context.clock() });
      remaining.delete(booking.ncmOrderId);
      continue;
    }
    for (let offset = 0; offset < group.length; offset += bulkSize) {
      if (context.clock() > deadline - requestBudgetMs) return;
      await confirmBatch(db, group.slice(offset, offset + bulkSize), partnerId, connection.client, context, deadline,
        {event, onConfirmed: id => { remaining.delete(id); }});
    }
  }
}

async function processWebhook(db: D1Database, runtime: unknown, id: string, context: Worker, deadline: number) {
  const now = context.clock();
  if (now >= deadline) return false;
  const claim = await db.prepare(`UPDATE ncm_webhook_events SET claimed_at=?,attempts=attempts+1
    WHERE id=? AND processed_at IS NULL AND next_attempt_at<=? AND (claimed_at IS NULL OR claimed_at<=?)`)
    .bind(now, id, now, now - claimLeaseMs).run();
  if (claim.meta.changes !== 1) return false;
  const row = await db.prepare(`SELECT kind,event,payload_json AS payloadJson,attempts FROM ncm_webhook_events
    WHERE id=? AND claimed_at=? AND processed_at IS NULL`).bind(id, now)
    .first<{ kind: WebhookKind; event: string; payloadJson: string; attempts: number }>();
  if (!row) return false;
  const saved: SavedReceipt = JSON.parse(row.payloadJson);
  const remaining = new Set(saved.remainingOrderIds);
  await applyWebhook(db, runtime, row.kind, { id, event: row.event, payload: saved.payload }, remaining, context, deadline)
    .catch(() => { /* Keep the IDs that are still waiting for confirmation. */ });
  const complete = remaining.size === 0;
  const finishedAt = context.clock();
  const retryAt = finishedAt + Math.min(quarterHourMs, 30_000 * 2 ** Math.min(Number(row.attempts) - 1, 5));
  await db.prepare(`UPDATE ncm_webhook_events SET processed_at=?,claimed_at=NULL,next_attempt_at=?,payload_json=?
    WHERE id=? AND claimed_at=? AND processed_at IS NULL`)
    .bind(complete ? finishedAt : null, complete ? 0 : retryAt, JSON.stringify({payload: saved.payload, remainingOrderIds: [...remaining]}), id, now).run();
  return complete;
}

async function pollPartner(db: D1Database, runtime: unknown, partnerId: string, context: Worker, deadline: number) {
  const now = context.clock();
  const window = Math.floor(now / quarterHourMs) * quarterHourMs;
  const claim = await db.prepare(`UPDATE ncm_partner_settings SET check_started_at=? WHERE partner_id=?
    AND (check_started_at IS NULL OR check_started_at<=?) AND (last_check_at IS NULL OR last_check_at<?)`)
    .bind(now, partnerId, now - claimLeaseMs, window).run();
  if (claim.meta.changes !== 1) return { ok: true, checked: false, deferred: false };

  let ok = false, checked = false, deferred = false;
  try {
    const budget = Math.max(0, ncmDailyLimit.view - await ncmUsedToday(db,'view',now));
    const { results } = await db.prepare(`${ownedBookings(db)} AND b.partner_id=? AND ${openParcelSql}
      ORDER BY b.updated_at,b.job_id LIMIT ?`).bind(partnerId, budget + 1).all<Booking>();
    if (!results.length) return { ok: true, checked: false, deferred: false };
    deferred = results.length > budget;
    const connection = await activeNcmConnection(db, partnerId, runtime);
    if (!connection) return { ok: !await partnerInApiMode(db, partnerId), checked, deferred };

    let complete = true;
    const count = Math.min(results.length,budget);
    for (let offset = 0; offset < count; offset += bulkSize) {
      if (context.clock() > deadline - requestBudgetMs) return { ok: false, checked: false, deferred: true };
      const rows = results.slice(offset, Math.min(count,offset + bulkSize));
      const batch = rows.filter(booking => ncmOrderId(booking.ncmOrderId));
      if (batch.length !== rows.length) complete = false;
      if (batch.length && !await confirmBatch(db, batch, partnerId, connection.client, context, deadline)) complete = false;
    }
    ok = complete && !deferred && await partnerInApiMode(db, partnerId);
    checked = ok;
    return { ok, checked, deferred };
  } catch {
    return { ok: false, checked: false, deferred };
  } finally {
    await db.prepare(`UPDATE ncm_partner_settings SET check_started_at=NULL${ok ? ',last_check_at=?' : ''}
      WHERE partner_id=? AND check_started_at=?`)
      .bind(...(ok ? [context.clock(), partnerId, now] : [partnerId, now])).run();
  }
}

export async function runNcmUpdateCheck(db: D1Database, runtime: unknown, options: WorkerOptions = {}) {
  if (!await ncmSchemaAvailable(db)) return { ok: true, enabled: false, checked: 0, processed: 0, deferred: false };
  const context = worker(options), start = context.clock();
  const { results: pending } = await db.prepare(`SELECT id FROM ncm_webhook_events WHERE processed_at IS NULL
    AND next_attempt_at<=? AND (claimed_at IS NULL OR claimed_at<=?) ORDER BY next_attempt_at,received_at,id LIMIT ?`)
    .bind(start, start - claimLeaseMs, queueLimit).all<{ id: string }>();
  let processed = 0;
  for (const { id } of pending) {
    if (context.clock() > start + webhookBudgetMs - requestBudgetMs) break;
    if (await processWebhook(db, runtime, id, context, start + webhookBudgetMs)) processed++;
  }

  const { results: partners } = await db.prepare(`SELECT d.id FROM delivery_partners d
    JOIN ncm_partner_settings ns ON ns.partner_id=d.id WHERE ${activePartnerSql} ORDER BY d.id`).all<{ id: string }>();
  let ok = true, checked = 0, deferred = false;
  for (const { id } of partners) {
    const result = await pollPartner(db, runtime, id, context, start + workerBudgetMs);
    ok = ok && result.ok;
    checked += result.checked ? 1 : 0;
    deferred ||= result.deferred;
  }
  return { ok, enabled: partners.length > 0, checked, processed, deferred };
}
