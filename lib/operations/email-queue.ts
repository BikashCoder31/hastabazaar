import {
  normalizeQueueFilters,
  emailQueueStatuses,
  type AdminQueueFilters,
} from '../admin/queue-filters';
import { orderEmailMaxAgeMs } from '../email/order-update-policy';
import { maximumEmailAttempts } from '../email/retry-policy';

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
}

/** Read-only classification also explains blocked work before the next sender records its outcome. */
function historySource(now: number) {
  return {
    sql: `SELECT source.*,CASE WHEN source.status='cancelled' OR source.skipReason IS NOT NULL
    THEN 'skipped' ELSE source.status END AS displayStatus FROM (
    SELECT j.id,j.order_id AS orderId,o.order_number AS orderNumber,j.order_status AS orderStatus,
      o.status AS currentStatus,j.status,j.attempts,j.created_at AS createdAt,j.sent_at AS sentAt,
      j.failure_code AS failureCode,j.next_attempt_at AS nextAttemptAt,j.lease_until AS leaseUntil,
      CASE WHEN j.status='cancelled' THEN j.failure_code
        WHEN j.status IN ('queued','retry','sending') AND j.lease_until<=? AND o.status<>j.order_status THEN 'obsolete_order_state'
        WHEN j.status IN ('queued','retry','sending') AND j.lease_until<=? AND j.created_at<=? THEN 'expired_order_update'
        ELSE NULL END AS skipReason
    FROM order_email_jobs j INNER JOIN orders o ON o.id=j.order_id) AS source`,
    values: [now, now, now - orderEmailMaxAgeMs],
  };
}

export async function listOrderEmailHistory(
  db: D1Database,
  params: AdminQueueFilters & { page?: string } = {},
  now = Date.now(),
  pageSize = 50,
) {
  const filters = normalizeQueueFilters(params, emailQueueStatuses),
    source = historySource(now);
  const conditions: string[] = [],
    values: (string | number)[] = [];
  if (filters.q) {
    conditions.push('INSTR(LOWER(queue.orderNumber),?)>0');
    values.push(filters.q.toLowerCase());
  }
  if (filters.status === 'ready') {
    conditions.push(
      "queue.displayStatus IN ('queued','retry','sending') AND queue.attempts<? AND queue.nextAttemptAt<=? AND queue.leaseUntil<=?",
    );
    values.push(maximumEmailAttempts, now, now);
  } else if (filters.status === 'needs_review') {
    conditions.push(
      "queue.displayStatus IN ('queued','retry','sending') AND queue.attempts>=? AND queue.leaseUntil<=?",
    );
    values.push(maximumEmailAttempts, now);
  } else if (filters.status === 'retry') {
    conditions.push("queue.displayStatus='retry' AND queue.attempts<?");
    values.push(maximumEmailAttempts);
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

export async function emailQueueSummary(db: D1Database, now = Date.now()) {
  const source = historySource(now);
  const pending = "displayStatus IN ('queued','retry','sending')";
  const row = await db
    .prepare(`SELECT
    COALESCE(SUM(CASE WHEN ${pending} THEN 1 ELSE 0 END),0) AS pending,
    COALESCE(SUM(CASE WHEN displayStatus='retry' THEN 1 ELSE 0 END),0) AS failures,
    COALESCE(SUM(CASE WHEN displayStatus='retry' AND attempts<? THEN 1 ELSE 0 END),0) AS retryWaiting,
    COALESCE(SUM(CASE WHEN ${pending} AND attempts>=? AND leaseUntil<=? THEN 1 ELSE 0 END),0) AS exhausted,
    COALESCE(SUM(CASE WHEN displayStatus='sending' AND leaseUntil<=? THEN 1 ELSE 0 END),0) AS expiredLeases,
    COALESCE(SUM(CASE WHEN ${pending} AND attempts<? AND nextAttemptAt<=? AND leaseUntil<=? THEN 1 ELSE 0 END),0) AS due,
    COALESCE(SUM(CASE WHEN displayStatus='skipped' THEN 1 ELSE 0 END),0) AS skipped,
    COALESCE(SUM(CASE WHEN displayStatus='skipped' AND skipReason='expired_order_update' THEN 1 ELSE 0 END),0) AS expired,
    MIN(CASE WHEN ${pending} THEN createdAt ELSE NULL END) AS oldestAt
    FROM (${source.sql}) AS queue`)
    .bind(
      maximumEmailAttempts,
      maximumEmailAttempts,
      now,
      now,
      maximumEmailAttempts,
      now,
      now,
      ...source.values,
    )
    .first<{
      pending: number;
      failures: number;
      retryWaiting: number;
      exhausted: number;
      expiredLeases: number;
      due: number;
      skipped: number;
      expired: number;
      oldestAt: number | null;
    }>();
  return {
    ...row,
    oldestAgeMinutes:
      row?.oldestAt == null
        ? 0
        : Math.max(0, Math.floor((now - row.oldestAt) / 60000)),
  };
}
