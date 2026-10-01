export interface SellerWorkSummary {
  toPack: number;
  packing: number;
  ready: number;
  needsChanges: number;
}

/** Whole-shop counts, independent of list-page limits and other vendors' items. */
export async function getSellerWorkSummary(
  database: D1Database,
  sellerId: string,
): Promise<SellerWorkSummary> {
  const [orders, products] = await Promise.all([
    database
      .prepare(`SELECT
      COUNT(DISTINCT CASE WHEN fulfillment_status = 'confirmed' THEN order_id END) AS toPack,
      COUNT(DISTINCT CASE WHEN fulfillment_status = 'packing' THEN order_id END) AS packing,
      COUNT(DISTINCT CASE WHEN fulfillment_status = 'ready_for_pickup' THEN order_id END) AS ready
      FROM order_items WHERE seller_id = ?`)
      .bind(sellerId)
      .first<{ toPack: number; packing: number; ready: number }>(),
    database
      .prepare(
        `SELECT COUNT(*) AS needsChanges FROM products WHERE seller_id = ? AND status = 'needs_changes'`,
      )
      .bind(sellerId)
      .first<{ needsChanges: number }>(),
  ]);
  return {
    toPack: orders?.toPack ?? 0,
    packing: orders?.packing ?? 0,
    ready: orders?.ready ?? 0,
    needsChanges: products?.needsChanges ?? 0,
  };
}
