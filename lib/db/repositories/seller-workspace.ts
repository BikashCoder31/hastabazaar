export interface SellerWorkSummary {
  toPack: number;
  packing: number;
  ready: number;
  needsChanges: number;
  awaitingConfirmation: number;
}

/** Only cases that the existing seller response handlers still allow a seller to answer. */
export async function getSellerActionCaseCounts(
  database: D1Database,
  sellerId: string,
): Promise<{ returns: number; complaints: number }> {
  const row = await database
    .prepare(`SELECT
    (SELECT COUNT(*) FROM return_requests r JOIN order_items i ON i.id=r.order_item_id
      WHERE i.seller_id=? AND r.status='requested' AND r.seller_response IS NULL) AS returns,
    (SELECT COUNT(*) FROM complaints WHERE seller_id=? AND status NOT IN ('resolved','closed')
      AND seller_response IS NULL) AS complaints`)
    .bind(sellerId, sellerId)
    .first<{ returns: number; complaints: number }>();
  return {
    returns: Number(row?.returns ?? 0),
    complaints: Number(row?.complaints ?? 0),
  };
}

/** Whole-shop counts, independent of list-page limits and other vendors' items. */
export async function getSellerWorkSummary(
  database: D1Database,
  sellerId: string,
): Promise<SellerWorkSummary> {
  const [orders, products] = await Promise.all([
    database
      .prepare(`SELECT
      COUNT(DISTINCT CASE WHEN i.fulfillment_status = 'confirmed' AND NOT EXISTS(SELECT 1 FROM first_cod_reviews c WHERE c.order_id=i.order_id AND c.status='pending') THEN i.order_id END) AS toPack,
      COUNT(DISTINCT CASE WHEN i.fulfillment_status = 'packing' AND NOT EXISTS(SELECT 1 FROM first_cod_reviews c WHERE c.order_id=i.order_id AND c.status='pending') THEN i.order_id END) AS packing,
      COUNT(DISTINCT CASE WHEN i.fulfillment_status = 'ready_for_pickup' AND NOT EXISTS(SELECT 1 FROM first_cod_reviews c WHERE c.order_id=i.order_id AND c.status='pending') THEN i.order_id END) AS ready,
      COUNT(DISTINCT CASE WHEN i.fulfillment_status IN ('confirmed','packing','ready_for_pickup') AND EXISTS(SELECT 1 FROM first_cod_reviews c WHERE c.order_id=i.order_id AND c.status='pending') THEN i.order_id END) AS awaitingConfirmation
      FROM order_items i WHERE i.seller_id = ?`)
      .bind(sellerId)
      .first<{
        toPack: number;
        packing: number;
        ready: number;
        awaitingConfirmation: number;
      }>(),
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
    awaitingConfirmation: orders?.awaitingConfirmation ?? 0,
  };
}
