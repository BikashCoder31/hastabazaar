import { parseNepalDateTime } from '../../commission/rates';
import type {
  CommissionFilters,
  CommissionReport,
  CommissionOrderRow,
  CommissionTotals,
} from '../../commission/reporting';

export async function getCommissionReport(
  db: D1Database,
  filters: CommissionFilters,
): Promise<CommissionReport> {
  // Managed settlements deliberately do not post independent seller commissions.
  const independentItem = "NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=i.id) AND COALESCE(i.commission_rule_version,'') NOT LIKE 'managed-%'";
  const where: string[] = [independentItem];
  const values: (string | number)[] = [];
  function day(value: string) {
    return parseNepalDateTime(`${value}T00:00`);
  }
  if (filters.from) {
    where.push('COALESCE(o.placed_at, o.created_at) >= ?');
    values.push(day(filters.from));
  }
  if (filters.to) {
    where.push('COALESCE(o.placed_at, o.created_at) < ?');
    values.push(day(filters.to) + 86_400_000);
  }
  if (filters.from && filters.to && filters.from > filters.to)
    throw new RangeError('The end date must be on or after the start date.');
  if (filters.sellerId) {
    where.push('i.seller_id = ?');
    values.push(filters.sellerId);
  }
  const query = filters.query?.trim().slice(0, 100);
  if (query) {
    where.push(
      "(o.order_number LIKE ? ESCAPE '\\' OR i.seller_name_snapshot LIKE ? ESCAPE '\\')",
    );
    const literal = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    values.push(literal, literal);
  }
  if (
    filters.status &&
    !['all', 'earned', 'pending', 'cancelled'].includes(filters.status)
  )
    throw new RangeError('Choose a valid commission status.');
  const excluded =
    "i.fulfillment_status IN ('cancelled','returned','refunded') OR o.status = 'cancelled' OR o.payment_status IN ('cancelled','refunded') OR EXISTS(SELECT 1 FROM shipping_jobs closed_parcel WHERE closed_parcel.order_id = o.id AND closed_parcel.seller_id = i.seller_id AND closed_parcel.direction = 'outbound' AND closed_parcel.status IN ('returned','cancelled'))";
  const cte = `WITH ledger AS (
    SELECT order_item_id, seller_id,
      SUM(CASE WHEN type = 'commission' THEN -amount_paisa ELSE 0 END) AS earned,
      SUM(CASE WHEN type = 'commission_reversal' THEN amount_paisa ELSE 0 END) AS reversed,
      SUM(CASE WHEN type = 'commission' THEN 1 ELSE 0 END) AS recorded
    FROM seller_ledger_entries WHERE type IN ('commission','commission_reversal')
    GROUP BY order_item_id, seller_id
  ), grouped AS (
    SELECT o.id AS orderId, o.order_number AS orderNumber, i.seller_id AS sellerId,
      MIN(i.seller_name_snapshot) AS sellerName, COALESCE(o.placed_at, o.created_at) AS placedAt,
      o.status AS orderStatus, o.payment_status AS paymentStatus, COUNT(*) AS itemCount,
      SUM(COALESCE(i.commission_base_paisa, i.line_total_paisa - i.seller_discount_paisa)) AS eligibleBasePaisa,
      SUM(i.commission_paisa) AS originalCommissionPaisa, MIN(COALESCE(f.standard_bps,i.commission_bps)) AS minRateBps, MAX(COALESCE(f.standard_bps,i.commission_bps)) AS maxRateBps,
      SUM(COALESCE(f.standard_paisa,i.commission_paisa)) AS originalStandardPaisa,
      SUM(COALESCE(f.waived_paisa,0)) AS originalWaivedPaisa,
      SUM(COALESCE(l.earned,0)) AS earnedPaisa, SUM(COALESCE(l.reversed,0)) AS reversedPaisa,
      SUM(COALESCE(l.earned,0) - COALESCE(l.reversed,0)) AS netPaisa,
      SUM(CASE WHEN COALESCE(l.recorded,0) = 0 AND NOT (${excluded}) THEN i.commission_paisa ELSE 0 END) AS pendingPaisa,
      SUM(CASE WHEN i.commission_paisa > 0 AND COALESCE(l.recorded,0) = 0 AND o.status = 'delivered' AND o.payment_status = 'paid' AND i.fulfillment_status = 'delivered'
        AND NOT EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id = p.shipping_job_id WHERE j.order_id = o.id AND (j.status NOT IN ('delivered','cancelled') OR p.remitted_paisa <> p.cod_due_paisa)) THEN 1 ELSE 0 END) AS missingEntries,
      CASE WHEN SUM(COALESCE(l.recorded,0)) > 0 THEN 'earned' WHEN SUM(CASE WHEN NOT (${excluded}) THEN 1 ELSE 0 END) > 0 THEN 'pending' ELSE 'cancelled' END AS status
    FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN ledger l ON l.order_item_id = i.id AND l.seller_id = i.seller_id
    LEFT JOIN order_item_marketplace_fees f ON f.order_item_id=i.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY o.id, o.order_number, i.seller_id, o.placed_at, o.created_at, o.status, o.payment_status
  )`;
  const status =
    filters.status && filters.status !== 'all' ? 'WHERE status = ?' : '';
  const bindings = status ? [...values, filters.status!] : values;
  const pageSize = Number.isInteger(filters.pageSize)
    ? Math.min(100, Math.max(1, filters.pageSize!))
    : 25;
  const [summary, sellers] = await Promise.all([
    db
      .prepare(`${cte} SELECT COUNT(*) AS totalRows, COALESCE(SUM(originalStandardPaisa),0) AS originalStandardPaisa, COALESCE(SUM(originalWaivedPaisa),0) AS originalWaivedPaisa,
      COALESCE(SUM(earnedPaisa),0) AS earnedPaisa, COALESCE(SUM(reversedPaisa),0) AS reversedPaisa,
      COALESCE(SUM(netPaisa),0) AS netPaisa, COALESCE(SUM(pendingPaisa),0) AS pendingPaisa, COALESCE(SUM(missingEntries),0) AS missingEntries FROM grouped ${status}`)
      .bind(...bindings)
      .first<CommissionTotals & { totalRows: number }>(),
    db
      .prepare(
        `SELECT i.seller_id AS id, MIN(i.seller_name_snapshot) AS name FROM order_items i WHERE ${independentItem} GROUP BY i.seller_id ORDER BY name`,
      )
      .all<{ id: string; name: string }>(),
  ]);
  const totalRows = Number(summary?.totalRows ?? 0);
  const page = Math.min(
    Math.max(1, Number.isSafeInteger(filters.page) ? filters.page! : 1),
    Math.max(1, Math.ceil(totalRows / pageSize)),
  );
  const rows = await db
    .prepare(
      `${cte} SELECT * FROM grouped ${status} ORDER BY placedAt DESC, orderId DESC, sellerId LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, pageSize, (page - 1) * pageSize)
    .all<CommissionOrderRow>();
  const totals: CommissionTotals = {
    originalStandardPaisa: Number(summary?.originalStandardPaisa ?? 0),
    originalWaivedPaisa: Number(summary?.originalWaivedPaisa ?? 0),
    earnedPaisa: Number(summary?.earnedPaisa ?? 0),
    reversedPaisa: Number(summary?.reversedPaisa ?? 0),
    netPaisa: Number(summary?.netPaisa ?? 0),
    pendingPaisa: Number(summary?.pendingPaisa ?? 0),
    missingEntries: Number(summary?.missingEntries ?? 0),
  };
  const campaignNames = new Map<string, Set<string>>();
  const orderIds = [...new Set(rows.results.map(row=>row.orderId))];
  for(let start=0;start<orderIds.length;start+=90) {
    const batch=orderIds.slice(start,start+90);
    const names=await db.prepare(`SELECT DISTINCT i.order_id AS orderId,i.seller_id AS sellerId,r.name
      FROM order_items i JOIN order_item_marketplace_fees f ON f.order_item_id=i.id
      JOIN marketplace_fee_waiver_revisions r ON r.campaign_id=f.campaign_id AND r.revision=f.campaign_revision
      WHERE i.order_id IN (${batch.map(()=>'?').join(',')}) AND ${independentItem}`).bind(...batch).all<{orderId:string;sellerId:string;name:string}>();
    for(const row of names.results) {
      const key=JSON.stringify([row.orderId,row.sellerId]);
      const names=campaignNames.get(key)??new Set<string>();names.add(row.name);campaignNames.set(key,names);
    }
  }
  return {
    totals,
    totalRows,
    page,
    pageSize,
    rows: rows.results.map(row=>({...row,campaignNames:[...(campaignNames.get(JSON.stringify([row.orderId,row.sellerId]))??[])].sort()})),
    sellers: sellers.results,
  };
}
