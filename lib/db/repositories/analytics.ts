import {
  normalizeTrafficEntityKey,
  normalizeTrafficPath,
  pathIsExcluded,
  trafficEventTypes,
  type TrafficEventType,
} from '@/lib/analytics/first-party';
import type { FirstPartyAnalyticsPolicy } from '@/lib/configuration/types';
import { getEffectiveBusinessSetting } from './business-settings';

export class TrafficAnalyticsError extends Error {}

function safeTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TrafficAnalyticsError('Analytics timestamp is invalid.');
  }
  return value;
}

async function eventKey(parts: readonly unknown[]): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(parts)),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function recordTrafficEvent(
  database: D1Database,
  options: {
    tokenHash: string;
    eventType: TrafficEventType;
    path: string;
    entityKey?: string | null;
    policy: FirstPartyAnalyticsPolicy;
    now: number;
  },
): Promise<{ recorded: boolean; expiresAt: number }> {
  const now = safeTimestamp(options.now);
  if (!/^[a-f0-9]{64}$/.test(options.tokenHash)) {
    throw new TrafficAnalyticsError('Analytics session proof is invalid.');
  }
  if (!trafficEventTypes.includes(options.eventType)) {
    throw new TrafficAnalyticsError('Analytics event is not allowlisted.');
  }
  const path = normalizeTrafficPath(options.path);
  const entityKey = normalizeTrafficEntityKey(options.entityKey);
  const expiresAt = now + options.policy.retentionDays * 86_400_000;
  if (!Number.isSafeInteger(expiresAt)) {
    throw new TrafficAnalyticsError('Analytics retention is invalid.');
  }
  if (!options.policy.enabled || pathIsExcluded(path, options.policy)) {
    return { recorded: false, expiresAt };
  }
  const sessionId = crypto.randomUUID();
  const minuteBucket = Math.floor(now / 60_000);
  const uniqueEventKey = await eventKey([
    options.tokenHash,
    options.eventType,
    path,
    entityKey,
    minuteBucket,
  ]);
  const cutoff = now - options.policy.retentionDays * 86_400_000;
  await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO traffic_sessions(id,token_hash,first_seen_at,last_seen_at,expires_at)
         VALUES (?,?,?,?,?)`,
      )
      .bind(sessionId, options.tokenHash, now, now, expiresAt),
    database
      .prepare(
        `UPDATE traffic_sessions SET last_seen_at=?,expires_at=?
         WHERE token_hash=?`,
      )
      .bind(now, expiresAt, options.tokenHash),
    database
      .prepare(
        `INSERT OR IGNORE INTO traffic_events(id,session_id,event_type,path,entity_key,event_key,created_at)
         SELECT ?,id,?,?,?,?,? FROM traffic_sessions WHERE token_hash=?`,
      )
      .bind(
        crypto.randomUUID(),
        options.eventType,
        path,
        entityKey,
        uniqueEventKey,
        now,
        options.tokenHash,
      ),
    database
      .prepare('DELETE FROM traffic_events WHERE created_at<?')
      .bind(cutoff),
    database
      .prepare(
        `DELETE FROM traffic_sessions WHERE expires_at<=?
         AND NOT EXISTS(SELECT 1 FROM traffic_events e WHERE e.session_id=traffic_sessions.id)`,
      )
      .bind(now),
  ]);
  return { recorded: true, expiresAt };
}

export async function getCustomerAndTrafficAnalytics(
  database: D1Database,
  now: number,
) {
  safeTimestamp(now);
  const effective = await getEffectiveBusinessSetting(
    database,
    'first_party_analytics_policy',
    now,
  );
  const policy = effective.value;
  const domainClause = policy.excludedEmailDomains
    .map(() => 'AND lower(u.email) NOT LIKE ?')
    .join(' ');
  const domainBindings = policy.excludedEmailDomains.map(
    (domain) => `%@${domain}`,
  );
  const accountPredicate = `EXISTS(
    SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='customer'
  ) ${domainClause}`;
  const cutoff = now - policy.retentionDays * 86_400_000;
  const recentCutoff = now - 30 * 86_400_000;
  const [customers, directory, traffic, topPaths] = await Promise.all([
    database
      .prepare(
        `SELECT COUNT(*) AS registeredAccounts,
          SUM(CASE WHEN u.status='active' THEN 1 ELSE 0 END) AS activeAccounts,
          SUM(CASE WHEN u.status<>'active' THEN 1 ELSE 0 END) AS restrictedAccounts,
          SUM(CASE WHEN u.created_at>=? THEN 1 ELSE 0 END) AS registeredLast30Days
         FROM users u WHERE ${accountPredicate}`,
      )
      .bind(recentCutoff, ...domainBindings)
      .first<{
        registeredAccounts: number;
        activeAccounts: number;
        restrictedAccounts: number;
        registeredLast30Days: number;
      }>(),
    database
      .prepare(
        `SELECT u.id,u.display_name AS displayName,u.email,u.status,u.created_at AS createdAt,
          (SELECT group_concat(DISTINCT r.role) FROM user_roles r WHERE r.user_id=u.id) AS roles
         FROM users u WHERE ${accountPredicate}
         ORDER BY u.created_at DESC,u.id DESC LIMIT 50`,
      )
      .bind(...domainBindings)
      .all<{
        id: string;
        displayName: string;
        email: string;
        status: string;
        createdAt: number;
        roles: string;
      }>(),
    database
      .prepare(
        `SELECT
          COUNT(*) AS events,
          COUNT(DISTINCT session_id) AS estimatedBrowserSessions,
          SUM(CASE WHEN event_type='page_view' THEN 1 ELSE 0 END) AS pageViews,
          SUM(CASE WHEN event_type='product_view' THEN 1 ELSE 0 END) AS productViews,
          SUM(CASE WHEN event_type='add_to_cart' THEN 1 ELSE 0 END) AS addToCarts,
          SUM(CASE WHEN event_type='checkout_started' THEN 1 ELSE 0 END) AS checkoutStarts,
          SUM(CASE WHEN event_type='order_completed' THEN 1 ELSE 0 END) AS completedOrders,
          MAX(created_at) AS lastUpdatedAt
         FROM traffic_events WHERE created_at>=?`,
      )
      .bind(cutoff)
      .first<{
        events: number;
        estimatedBrowserSessions: number;
        pageViews: number;
        productViews: number;
        addToCarts: number;
        checkoutStarts: number;
        completedOrders: number;
        lastUpdatedAt: number | null;
      }>(),
    database
      .prepare(
        `SELECT path,COUNT(*) AS views,COUNT(DISTINCT session_id) AS estimatedSessions
         FROM traffic_events WHERE created_at>=? AND event_type IN ('page_view','product_view')
         GROUP BY path ORDER BY views DESC,path ASC LIMIT 10`,
      )
      .bind(cutoff)
      .all<{ path: string; views: number; estimatedSessions: number }>(),
  ]);
  return {
    policy: {
      enabled: policy.enabled,
      retentionDays: policy.retentionDays,
      versionId: effective.versionId,
    },
    customers: {
      registeredAccounts: customers?.registeredAccounts ?? 0,
      activeAccounts: customers?.activeAccounts ?? 0,
      restrictedAccounts: customers?.restrictedAccounts ?? 0,
      registeredLast30Days: customers?.registeredLast30Days ?? 0,
    },
    directory: directory.results,
    traffic: {
      events: traffic?.events ?? 0,
      estimatedBrowserSessions: traffic?.estimatedBrowserSessions ?? 0,
      pageViews: traffic?.pageViews ?? 0,
      productViews: traffic?.productViews ?? 0,
      addToCarts: traffic?.addToCarts ?? 0,
      checkoutStarts: traffic?.checkoutStarts ?? 0,
      completedOrders: traffic?.completedOrders ?? 0,
      lastUpdatedAt: traffic?.lastUpdatedAt ?? null,
    },
    topPaths: topPaths.results,
  };
}
