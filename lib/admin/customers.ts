import { CURRENT_CUSTOMER_ROLE_SQL } from '@/lib/auth/customer-scope';
import { nepalDayIso } from '@/lib/dates/nepal-calendar';

export const customerFilters = [
  ['all', 'All'],
  ['risk', 'COD risk'],
  ['new', 'New this month'],
] as const;

type CustomerFilter = (typeof customerFilters)[number][0];
type CustomerQuery = {
  q?: string;
  view?: string;
  page?: string;
  customer?: string;
};
type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: number;
  orderCount: number;
  deliveredCount: number;
  unsuccessfulCount: number;
  codOrderCount: number;
  codRefusalCount: number;
  unsuccessfulCodCount: number;
  walletPaisa: number;
  location: string | null;
};
type CustomerOrder = {
  id: string;
  orderNumber: string;
  productName: string | null;
  status: string;
  outcome: 'refused' | 'not_reached' | null;
};

export const customerRiskThreshold = 2;
const pageSize = 5;
const pathname = '/admin/customers';

export function customerWorkspaceHref({
  q,
  view,
  page,
  customer,
}: Omit<CustomerQuery, 'page'> & { page?: number }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (view && view !== 'all') params.set('view', view);
  if (page && page > 1) params.set('page', String(page));
  if (customer) params.set('customer', customer);
  return params.size ? pathname + '?' + params : pathname;
}

function customerLocation(value: string | null) {
  if (!value) return null;
  try {
    const data = JSON.parse(value) as {
      locality?: unknown;
      district?: unknown;
    } | null;
    if (!data) return null;
    return (
      [data.locality, data.district]
        .filter(
          (part): part is string =>
            typeof part === 'string' && Boolean(part.trim()),
        )
        .map((part) => part.trim())
        .join(', ') || null
    );
  } catch {
    return null;
  }
}

const searchablePhone = (column: 'phone' | 'customer_phone') =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column},' ',''),'-',''),'(',''),')',''),'+','')`;

// Only explicit outcomes with courier shipment and event references qualify.
// A generic delivery failure or return to origin does not identify its cause.
const courierOutcomes = (candidateOrders: string) => `
  SELECT s.order_id,
    MAX(CASE WHEN e.status='refused' THEN 1 ELSE 0 END) AS refused,
    MAX(CASE WHEN e.status='not_reached' THEN 1 ELSE 0 END) AS notReached
  FROM shipments s
  JOIN shipment_events e ON e.shipment_id=s.id
  WHERE s.order_id IN (${candidateOrders})
    AND NULLIF(TRIM(s.provider_shipment_id),'') IS NOT NULL
    AND NULLIF(TRIM(e.provider_event_id),'') IS NOT NULL
    AND s.provider<>'own_rider'
    AND e.status IN ('refused','not_reached')
  GROUP BY s.order_id`;

export async function readCustomerWorkspace(
  db: D1Database,
  query: CustomerQuery,
  now: number,
) {
  const q = query.q?.trim().slice(0, 160) ?? '';
  const view: CustomerFilter =
    customerFilters.find(([id]) => id === query.view)?.[0] ?? 'all';
  const monthStart = Date.parse(
    nepalDayIso(now).slice(0, 7) + '-01T00:00:00+05:45',
  );
  const phoneDigits = /^\+?[\d ().-]+$/.test(q) ? q.replace(/[^\d]/g, '') : '';
  const bindings = q
    ? [q, q, phoneDigits, phoneDigits, q, q, phoneDigits, phoneDigits]
    : [];
  const search = q
    ? `AND (
    INSTR(LOWER(users.display_name),LOWER(?))>0 OR INSTR(LOWER(users.email),LOWER(?))>0
    OR (?<>'' AND INSTR(${searchablePhone('phone')},?)>0)
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.customer_id=users.id AND (
        INSTR(LOWER(order_number),LOWER(?))>0 OR INSTR(LOWER(customer_email),LOWER(?))>0
        OR (?<>'' AND INSTR(${searchablePhone('customer_phone')},?)>0)
      )
    )
  )`
    : '';
  const customers = `WITH matching AS (
    SELECT users.id,display_name AS name,email,phone,created_at AS createdAt
    FROM users
    WHERE users.status<>'deleted' AND ${CURRENT_CUSTOMER_ROLE_SQL} ${search}
  ), customer_orders AS (
    SELECT o.id,o.customer_id,o.delivered_at,o.status,o.payment_mode
    FROM matching m JOIN orders o ON o.customer_id=m.id
  ), outcomes AS (
    ${courierOutcomes('SELECT id FROM customer_orders')}
  ), totals AS (
    SELECT o.customer_id,COUNT(*) AS orderCount,
      SUM(CASE WHEN o.delivered_at IS NOT NULL OR o.status='delivered' THEN 1 ELSE 0 END) AS deliveredCount,
      SUM(CASE WHEN result.order_id IS NOT NULL THEN 1 ELSE 0 END) AS unsuccessfulCount,
      SUM(CASE WHEN o.payment_mode='cod' THEN 1 ELSE 0 END) AS codOrderCount,
      SUM(CASE WHEN o.payment_mode='cod' AND result.refused=1 THEN 1 ELSE 0 END) AS codRefusalCount,
      SUM(CASE WHEN o.payment_mode='cod' AND result.order_id IS NOT NULL THEN 1 ELSE 0 END) AS unsuccessfulCodCount
    FROM customer_orders o LEFT JOIN outcomes result ON result.order_id=o.id
    GROUP BY o.customer_id
  )`;
  const counts = await db
    .prepare(`${customers}
    SELECT COUNT(*) AS allCount,
      COUNT(CASE WHEN t.codRefusalCount>=? THEN 1 END) AS riskCount,
      COUNT(CASE WHEN m.createdAt BETWEEN ? AND ? THEN 1 END) AS newCount
    FROM matching m LEFT JOIN totals t ON t.customer_id=m.id`)
    .bind(...bindings, customerRiskThreshold, monthStart, now)
    .first<{ allCount: number; riskCount: number; newCount: number }>();
  const countByView = {
    all: counts?.allCount ?? 0,
    risk: counts?.riskCount ?? 0,
    new: counts?.newCount ?? 0,
  };
  const pageCount = Math.max(1, Math.ceil(countByView[view] / pageSize));
  const requestedPage = Number(query.page);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(Math.max(1, requestedPage), pageCount)
    : 1;
  const filter =
    view === 'risk'
      ? { sql: 'WHERE t.codRefusalCount>=?', args: [customerRiskThreshold] }
      : view === 'new'
        ? { sql: 'WHERE m.createdAt BETWEEN ? AND ?', args: [monthStart, now] }
        : { sql: '', args: [] };
  const workspaceQuery = `${customers}
    SELECT m.*,COALESCE(t.orderCount,0) AS orderCount,COALESCE(t.deliveredCount,0) AS deliveredCount,
      COALESCE(t.unsuccessfulCount,0) AS unsuccessfulCount,COALESCE(t.codOrderCount,0) AS codOrderCount,
      COALESCE(t.codRefusalCount,0) AS codRefusalCount,COALESCE(t.unsuccessfulCodCount,0) AS unsuccessfulCodCount,
      COALESCE(w.balance_paisa,0) AS walletPaisa,
      (SELECT o.shipping_address_json FROM orders o WHERE o.customer_id=m.id AND o.delivery_for='self'
        ORDER BY o.created_at DESC,o.id DESC LIMIT 1) AS addressJson
    FROM matching m LEFT JOIN totals t ON t.customer_id=m.id
    LEFT JOIN wallet_accounts w ON w.user_id=m.id`;
  type QueryRow = Omit<CustomerRow, 'location'> & {
    addressJson: string | null;
  };
  const customerId = query.customer?.trim().slice(0, 160);
  const [rows, selected] = await Promise.all([
    db
      .prepare(
        `${workspaceQuery} ${filter.sql} ORDER BY m.createdAt DESC,m.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, ...filter.args, pageSize, (page - 1) * pageSize)
      .all<QueryRow>(),
    customerId
      ? db
          .prepare(
            `${workspaceQuery} ${filter.sql ? filter.sql + ' AND' : 'WHERE'} m.id=?`,
          )
          .bind(...bindings, ...filter.args, customerId)
          .first<QueryRow>()
      : null,
  ]);
  const format = ({ addressJson, ...row }: QueryRow): CustomerRow => ({
    ...row,
    location: customerLocation(addressJson),
  });
  const result = selected ?? rows.results[0];
  const customer = result ? format(result) : null;
  const recentOrders = customer
    ? (
        await db
          .prepare(`WITH recent AS (
        SELECT id,order_number,status,delivered_at,created_at FROM orders
        WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 5
      ), outcomes AS (
        ${courierOutcomes('SELECT id FROM recent')}
      )
      SELECT o.id,o.order_number AS orderNumber,o.status,
        (SELECT i.product_name_snapshot FROM order_items i WHERE i.order_id=o.id ORDER BY i.id LIMIT 1) AS productName,
        CASE WHEN o.delivered_at IS NOT NULL OR o.status='delivered' THEN NULL
          WHEN result.refused=1 THEN 'refused'
          WHEN result.notReached=1 THEN 'not_reached' END AS outcome
      FROM recent o LEFT JOIN outcomes result ON result.order_id=o.id
      ORDER BY o.created_at DESC,o.id DESC`)
          .bind(customer.id)
          .all<CustomerOrder>()
      ).results
    : [];

  return {
    q,
    view,
    page,
    pageCount,
    counts: countByView,
    customers: rows.results.map(format),
    customer,
    recentOrders,
  };
}
