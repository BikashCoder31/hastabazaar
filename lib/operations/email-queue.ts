import {
  normalizeQueueFilters,
  emailQueueStatuses,
  type AdminQueueFilters,
} from '../admin/queue-filters';
import { orderEmailMaxAgeMs } from '../email/order-update-policy';
import {
  eligibleDeliverySql,
  accountedDeliveryAttemptsSql,
  type DeliveryMailService,
} from '../email/delivery-attempts';

export interface OrderEmailHistoryRow {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  currentStatus: string;
  status: string;
  displayStatus: string;
  attempts: number;
  createdAt: number;
  sentAt: number | null;
  failureCode: string | null;
  skipReason: string | null;
  nextAttemptAt: number;
  leaseUntil: number;
  deliveryPhase: string | null;
  failureCategory: string | null;
}

/** Read-only classification also explains blocked work before the next sender records its outcome. */
export function orderEmailHistorySource(now: number) {
  return {
    sql: `SELECT source.*,CASE
      WHEN source.deliveryPhase='accepted' THEN 'sent'
      WHEN source.deliveryPhase='captured' THEN 'captured'
      WHEN source.deliveryPhase IN ('handoff_started','uncertain') THEN 'uncertain'
      WHEN source.status='sent' THEN 'sent_record'
      WHEN source.status IN ('queued','retry','sending') AND source.accountedHistory=0 AND source.leaseUntil<=? THEN 'uncertain'
      WHEN source.status='cancelled' OR source.skipReason IS NOT NULL THEN 'skipped'
      WHEN source.deliveryPhase='not_accepted' AND COALESCE(source.failureCategory,'unknown')<>'temporary' THEN 'intervention'
      ELSE source.status END AS displayStatus FROM (
    SELECT j.id,j.order_id AS orderId,o.order_number AS orderNumber,j.order_status AS orderStatus,
      o.status AS currentStatus,j.status,j.attempts,j.created_at AS createdAt,j.sent_at AS sentAt,
      j.failure_code AS failureCode,j.next_attempt_at AS nextAttemptAt,j.lease_until AS leaseUntil,
      (SELECT da.phase FROM email_delivery_attempts da WHERE da.queue_kind='order' AND da.queue_id=j.id ORDER BY da.attempt_number DESC LIMIT 1) AS deliveryPhase,
      (SELECT da.failure_category FROM email_delivery_attempts da WHERE da.queue_kind='order' AND da.queue_id=j.id ORDER BY da.attempt_number DESC LIMIT 1) AS failureCategory,
      CASE WHEN ${accountedDeliveryAttemptsSql('order','j.id','j.attempts')} THEN 1 ELSE 0 END AS accountedHistory,
      CASE WHEN ${eligibleDeliverySql('order', 'j.id')} AND ${accountedDeliveryAttemptsSql('order','j.id','j.attempts')} THEN 1 ELSE 0 END AS safeToAttempt,
      CASE WHEN j.status='cancelled' THEN j.failure_code
        WHEN j.status IN ('queued','retry','sending') AND j.lease_until<=? AND o.status<>j.order_status THEN 'obsolete_order_state'
        WHEN j.status IN ('queued','retry','sending') AND j.lease_until<=? AND j.created_at<=? THEN 'expired_order_update'
        ELSE NULL END AS skipReason
    FROM order_email_jobs j INNER JOIN orders o ON o.id=j.order_id) AS source`,
    values: [now, now, now, now - orderEmailMaxAgeMs],
  };
}

export async function listOrderEmailHistory(
  db: D1Database,
  params: AdminQueueFilters & { page?: string; reference?:string;fromAt?:number;beforeAt?:number } = {},
  now = Date.now(),
  pageSize = 50,
) {
  const filters = normalizeQueueFilters(params, emailQueueStatuses),
    source = orderEmailHistorySource(now);
  const conditions: string[] = [],
    values: (string | number)[] = [];
  if(params.reference){conditions.push('queue.id=?');values.push(params.reference);}
  if(params.fromAt!==undefined){conditions.push('queue.createdAt>=?');values.push(params.fromAt);}
  if(params.beforeAt!==undefined){conditions.push('queue.createdAt<?');values.push(params.beforeAt);}
  if (filters.q) {
    conditions.push('INSTR(LOWER(queue.orderNumber),?)>0');
    values.push(filters.q.toLowerCase());
  }
  if (filters.status === 'ready') {
    conditions.push(
      "queue.displayStatus IN ('queued','retry','sending') AND queue.safeToAttempt=1 AND queue.nextAttemptAt<=? AND queue.leaseUntil<=?",
    );
    values.push(now, now);
  } else if (filters.status === 'needs_review') {
    conditions.push(
      "queue.displayStatus='intervention' AND queue.leaseUntil<=?",
    );
    values.push(now);
  } else if (filters.status === 'retry') {
    conditions.push("queue.displayStatus='retry'");
  } else if (filters.status === 'expired') {
    conditions.push(
      "queue.displayStatus='skipped' AND queue.skipReason='expired_order_update'",
    );
  } else if (filters.status) {
    conditions.push('queue.displayStatus=?');
    values.push(filters.status);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const total =
    (
      await db
        .prepare(
          `SELECT COUNT(*) AS total FROM (${source.sql}) AS queue ${where}`,
        )
        .bind(...source.values, ...values)
        .first<{ total: number }>()
    )?.total ?? 0;
  const size = Math.max(
    1,
    Math.min(Number.isSafeInteger(pageSize) ? pageSize : 50, 100),
  );
  const pageCount = Math.max(1, Math.ceil(total / size)),
    requestedPage = Number(params.page ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, pageCount)
      : 1;
  const jobs = await db
    .prepare(`SELECT queue.* FROM (${source.sql}) AS queue ${where}
    ORDER BY queue.createdAt DESC,queue.id DESC LIMIT ? OFFSET ?`)
    .bind(...source.values, ...values, size, (page - 1) * size)
    .all<OrderEmailHistoryRow>();
  return { jobs: jobs.results, total, page, pageCount, filters };
}

export async function emailQueueSummary(
  db: D1Database,
  now = Date.now(),
  transport?: Pick<
    DeliveryMailService,
    'transportKey' | 'configurationFingerprint'
  >,
) {
  const backoff = transport?.transportKey
    ? await db
        .prepare(
          'SELECT blocked_until AS blockedUntil FROM email_transport_backoff WHERE transport_key=? AND (config_fingerprint=? OR (config_fingerprint IS NULL AND ? IS NULL))',
        )
        .bind(
          transport.transportKey,
          transport.configurationFingerprint ?? null,
          transport.configurationFingerprint ?? null,
        )
        .first<{ blockedUntil: number }>()
    : null;
  const providerBlockedUntil =
    backoff && backoff.blockedUntil > now ? backoff.blockedUntil : null;
  const source = orderEmailHistorySource(now);
  const pending = "displayStatus IN ('queued','retry','sending')";
  const row = await db
    .prepare(`SELECT
    COALESCE(SUM(CASE WHEN ${pending} THEN 1 ELSE 0 END),0) AS pending,
    COALESCE(SUM(CASE WHEN displayStatus='retry' THEN 1 ELSE 0 END),0) AS failures,
    COALESCE(SUM(CASE WHEN displayStatus='retry' AND nextAttemptAt>? THEN 1 ELSE 0 END),0) AS retryWaiting,
    COALESCE(SUM(CASE WHEN displayStatus='intervention' THEN 1 ELSE 0 END),0) AS exhausted,
    COALESCE(SUM(CASE WHEN displayStatus='uncertain' THEN 1 ELSE 0 END),0) AS uncertain,
    COALESCE(SUM(CASE WHEN displayStatus='sending' AND leaseUntil<=? AND safeToAttempt=1 THEN 1 ELSE 0 END),0) AS expiredLeases,
    COALESCE(SUM(CASE WHEN ${pending} AND safeToAttempt=1 AND nextAttemptAt<=? AND leaseUntil<=? THEN 1 ELSE 0 END),0) AS due,
    COALESCE(SUM(CASE WHEN displayStatus='skipped' THEN 1 ELSE 0 END),0) AS skipped,
    COALESCE(SUM(CASE WHEN displayStatus='skipped' AND skipReason='expired_order_update' THEN 1 ELSE 0 END),0) AS expired,
    MIN(CASE WHEN ${pending} THEN createdAt ELSE NULL END) AS oldestAt,
    MIN(CASE WHEN ${pending} AND safeToAttempt=1 AND attempts=0 AND nextAttemptAt<=? AND leaseUntil<=? THEN CASE WHEN nextAttemptAt>createdAt THEN nextAttemptAt ELSE createdAt END ELSE NULL END) AS oldestEligibleAt
    FROM (${source.sql}) AS queue`)
    .bind(now, now, now, now, now, now, ...source.values)
    .first<{
      pending: number;
      failures: number;
      retryWaiting: number;
      exhausted: number;
      uncertain: number;
      expiredLeases: number;
      due: number;
      skipped: number;
      expired: number;
      oldestAt: number | null;
      oldestEligibleAt: number | null;
    }>();
  return {
    ...row,
    due: providerBlockedUntil ? 0 : (row?.due ?? 0),
    oldestEligibleAt: providerBlockedUntil
      ? null
      : (row?.oldestEligibleAt ?? null),
    providerBlockedUntil,
    oldestAgeMinutes:
      row?.oldestAt == null
        ? 0
        : Math.max(0, Math.floor((now - row.oldestAt) / 60000)),
    overdueFirstAttempts:
      !providerBlockedUntil &&
      row?.oldestEligibleAt != null &&
      now - row.oldestEligibleAt > 300000,
  };
}
