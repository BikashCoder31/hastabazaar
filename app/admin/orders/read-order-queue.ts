import {
  normalizeQueueFilters,
  orderQueueStatuses,
  orderQueueWhere,
} from '@/lib/admin/queue-filters';
import { payableOrderTotalSql } from '@/lib/db/repositories/platform-service-fee';
import type { FulfillmentOrderDetail } from '@/lib/db/repositories/fulfillment';
import { orderViews, type OrderFilters } from './order-queue-presentation';

export type OrderQueueParams = {
  q?: string;
  status?: string;
  seller?: string;
  view?: string;
  page?: string;
  order?: string;
  workspace?: string;
};

type OrderQueueRow = {
  id: string;
  orderNumber: string;
  status: string;
  customerEmail: string;
  customerPhone: string;
  addressJson: string;
  sellerName: string;
  itemCount: number;
  grandTotalPaisa: number;
  paymentMode: string;
  paymentStatus: string;
  placedAt: number;
  dueAt: number | null;
  pickupAt: number | null;
  parcelProblem: number;
  customerUnavailable: number;
  codDue: number;
  codCollected: number;
  codRemitted: number;
};

const addressFields = [
  'recipientName',
  'locality',
  'municipality',
  'district',
] as const;
const pageSize = 50;

export function orderContact(
  json: string,
): Pick<
  FulfillmentOrderDetail['address'],
  (typeof addressFields)[number]
> | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function readOrderQueue(
  db: D1Database,
  params: OrderQueueParams,
  options: {
    now: number;
    isSuperAdmin: boolean;
    canViewFinanceFollowups: boolean;
  },
) {
  const view =
    orderViews.find(([value]) => value === params.view)?.[0] ?? 'all';
  const filters: OrderFilters = {
    ...normalizeQueueFilters(params, orderQueueStatuses),
    view,
    seller:
      typeof params.seller === 'string'
        ? params.seller.trim().slice(0, 160)
        : '',
  };
  // Keep the original order-status and first-COD filter semantics.
  const status = orderQueueWhere({ status: filters.status });
  const conditions = [
    status.sql.replace(/^WHERE /, ''),
    'EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=orders.id)',
  ].filter(Boolean);
  const bindings: (string | number)[] = [...status.values];
  if (filters.q) {
    const address =
      "CASE WHEN json_valid(orders.shipping_address_json) THEN orders.shipping_address_json ELSE '{}' END";
    const fields = [
      'orders.order_number',
      'orders.customer_email',
      'orders.customer_phone',
      ...addressFields.map((field) => `json_extract(${address}, '$.${field}')`),
    ];
    conditions.push(
      '(' +
        fields
          .map((field) => `INSTR(LOWER(COALESCE(${field},'')),?) > 0`)
          .join(' OR ') +
        ' OR EXISTS(SELECT 1 FROM order_items seller_search WHERE seller_search.order_id=orders.id AND INSTR(LOWER(seller_search.seller_name_snapshot),?) > 0))',
    );
    bindings.push(
      ...fields.concat('seller').map(() => filters.q!.toLowerCase()),
    );
  }
  if (filters.seller) {
    conditions.push(
      'EXISTS(SELECT 1 FROM order_items seller_filter WHERE seller_filter.order_id=orders.id AND LOWER(seller_filter.seller_name_snapshot)=?)',
    );
    bindings.push(filters.seller.toLowerCase());
  }

  const publicParcel = options.isSuperAdmin
    ? ''
    : " AND NOT EXISTS(SELECT 1 FROM shipping_parcels private_parcel WHERE private_parcel.shipping_job_id=j.id AND (private_parcel.method='own_rider' OR private_parcel.rider_user_id IS NOT NULL))";
  const financeFilter = options.canViewFinanceFollowups
    ? ''
    : " AND w.kind<>'incorrect_cash'";
  const dueAt = `CASE WHEN orders.status NOT IN ('cancelled','delivered','returned','refund_processing','refunded') THEN (
    SELECT MIN(CASE WHEN c.first_action_at IS NULL THEN c.first_due_at ELSE c.next_update_at END)
    FROM order_response_cases c JOIN order_response_portions response_portion ON response_portion.id=c.portion_id
    WHERE response_portion.order_id=orders.id AND c.state<>'resolved'
  ) END`;
  const hasException = (
    kind = '',
  ) => `EXISTS(SELECT 1 FROM exception_work_items w
    JOIN shipping_jobs j ON j.id=w.shipping_job_id
    WHERE w.order_id=orders.id AND w.status='open'${financeFilter}${publicParcel}${kind})`;
  const parcelProblem = `EXISTS(SELECT 1 FROM shipping_jobs j WHERE j.order_id=orders.id
    AND j.status IN ('delivery_failed','returning','returned','claim_open')${publicParcel}) OR ${hasException()}`;
  const codPending =
    "orders.status<>'cancelled' AND EXISTS(SELECT 1 FROM first_cod_reviews r WHERE r.order_id=orders.id AND r.status='pending')";
  const queue = `SELECT orders.id, orders.created_at AS createdAt,
    CASE WHEN ${codPending} THEN 'awaiting_cod_confirmation' ELSE orders.status END AS status,
    ${dueAt} AS dueAt, CASE WHEN ${parcelProblem} THEN 1 ELSE 0 END AS parcelProblem
    FROM orders WHERE ${conditions.join(' AND ')}`;
  const viewConditions = {
    all: '1=1',
    attention:
      "(parcelProblem=1 OR dueAt<=? OR status='awaiting_cod_confirmation')",
    new: "status IN ('pending_payment','awaiting_cod_confirmation','confirmed')",
    transit: "status IN ('ready_for_pickup','dispatched')",
    delivered: "status='delivered'",
  };
  const counts = await db
    .prepare(`WITH queue AS (${queue})
    SELECT COUNT(*) AS allOrders,
    SUM(CASE WHEN ${viewConditions.attention} THEN 1 ELSE 0 END) AS attention,
    SUM(CASE WHEN ${viewConditions.new} THEN 1 ELSE 0 END) AS newOrders,
    SUM(CASE WHEN ${viewConditions.transit} THEN 1 ELSE 0 END) AS transit,
    SUM(CASE WHEN ${viewConditions.delivered} THEN 1 ELSE 0 END) AS delivered
    FROM queue`)
    .bind(...bindings, options.now)
    .first<{
      allOrders: number;
      attention: number | null;
      newOrders: number | null;
      transit: number | null;
      delivered: number | null;
    }>();
  const viewCounts = {
    all: counts?.allOrders ?? 0,
    attention: counts?.attention ?? 0,
    new: counts?.newOrders ?? 0,
    transit: counts?.transit ?? 0,
    delivered: counts?.delivered ?? 0,
  };
  const total = viewCounts[view];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number(params.page ?? 1);
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, pageCount)
      : 1;
  const offset = (page - 1) * pageSize;
  const cash = (
    column: 'cod_due_paisa' | 'collected_paisa' | 'remitted_paisa',
  ) =>
    `(SELECT COALESCE(SUM(p.${column}),0) FROM shipping_parcels p
      JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=orders.id AND j.direction='outbound'${publicParcel})`;
  const orders = total
    ? (
        await db
          .prepare(`WITH queue AS (${queue}),
    page_orders AS (SELECT * FROM queue WHERE ${viewConditions[view]} ORDER BY createdAt DESC,id LIMIT ? OFFSET ?)
    SELECT orders.id, orders.order_number AS orderNumber, page_orders.status, page_orders.dueAt, page_orders.parcelProblem,
    orders.customer_email AS customerEmail, orders.customer_phone AS customerPhone, orders.shipping_address_json AS addressJson,
    (SELECT MIN(i.seller_name_snapshot) FROM order_items i WHERE i.order_id=orders.id) AS sellerName,
    (SELECT COUNT(DISTINCT i.seller_id) FROM order_items i WHERE i.order_id=orders.id) AS sellerCount,
    (SELECT SUM(i.quantity) FROM order_items i WHERE i.order_id=orders.id) AS itemCount,
    ${payableOrderTotalSql()} AS grandTotalPaisa, orders.payment_mode AS paymentMode, orders.payment_status AS paymentStatus,
    orders.placed_at AS placedAt,
    (SELECT MIN(j.pickup_window_start) FROM shipping_jobs j WHERE j.order_id=orders.id
      AND j.status IN ('pickup_requested','pickup_scheduled') AND j.direction='outbound'${publicParcel}) AS pickupAt,
    CASE WHEN ${hasException(" AND w.kind='customer_unavailable'")} THEN 1 ELSE 0 END AS customerUnavailable,
    ${cash('cod_due_paisa')} AS codDue, ${cash('collected_paisa')} AS codCollected, ${cash('remitted_paisa')} AS codRemitted
    FROM page_orders JOIN orders ON orders.id=page_orders.id ORDER BY page_orders.createdAt DESC,page_orders.id`)
          .bind(
            ...bindings,
            ...(view === 'attention' ? [options.now] : []),
            pageSize,
            offset,
          )
          .all<OrderQueueRow & { sellerCount: number }>()
      ).results
    : [];
  return { filters, orders, total, page, pageCount, offset, viewCounts };
}

export function queueCash(order: OrderQueueRow) {
  if (order.paymentMode !== 'cod')
    return order.paymentStatus === 'paid' ? 'Paid' : 'Prepaid';
  if (order.codDue > 0) {
    if (order.codRemitted >= order.codDue) return 'Collected and counted';
    if (order.codCollected >= order.codDue) return 'With courier';
    if (order.codCollected > 0) return 'Partly collected';
  }
  if (order.status === 'cancelled' || order.customerUnavailable)
    return 'Not collected';
  return order.paymentStatus === 'paid' ? 'Collected' : 'To collect';
}
