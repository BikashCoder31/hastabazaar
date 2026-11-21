import { isPackedWeightGrams } from './packed-weight';

const parcelColumns = ['order_id', 'seller_id', 'weight_grams', 'item_count', 'recorded_by', 'request_id', 'recorded_at'];

function isMariaDb(db: D1Database) {
  return (db as D1Database & { dialect?: string }).dialect === 'mariadb';
}

export async function packedWeightSchemaAvailable(db: D1Database): Promise<boolean> {
  if (isMariaDb(db)) {
    const { results } = await db.prepare(`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
        AND ((TABLE_NAME='products' AND COLUMN_NAME='packed_weight_grams') OR TABLE_NAME='seller_parcel_weights')`)
      .all<{ tableName: string; name: string }>();
    return results.some(row => row.tableName === 'products' && row.name === 'packed_weight_grams') &&
      parcelColumns.every(name => results.some(row => row.tableName === 'seller_parcel_weights' && row.name === name));
  }
  const [products, parcels] = await Promise.all([
    db.prepare('PRAGMA table_info(products)').all<{ name: string }>(),
    db.prepare('PRAGMA table_info(seller_parcel_weights)').all<{ name: string }>(),
  ]);
  return products.results.some(row => row.name === 'packed_weight_grams') &&
    parcelColumns.every(name => parcels.results.some(row => row.name === name));
}

export async function readPackedParcelPrefill(db: D1Database, orderId: string, sellerId: string) {
  const rows = await db.prepare(`SELECT i.quantity, p.packed_weight_grams AS grams
    FROM order_items i LEFT JOIN products p ON p.id=i.product_id AND p.seller_id=i.seller_id
    WHERE i.order_id=? AND i.seller_id=? AND i.fulfillment_status<>'cancelled'`)
    .bind(orderId, sellerId).all<{ quantity: number; grams: number | null }>();
  let total = 0;
  for (const { grams, quantity } of rows.results) {
    if (!isPackedWeightGrams(grams)) return null;
    total += grams * quantity;
  }
  return isPackedWeightGrams(total) ? total : null;
}

export function packedParcelWeightStatement(db: D1Database, input: {
  orderId: string;
  sellerId: string;
  actorId: string;
  requestId: string;
  now: number;
}, grams: number) {
  const upsert = isMariaDb(db)
    ? `ON DUPLICATE KEY UPDATE weight_grams=VALUES(weight_grams), item_count=VALUES(item_count), recorded_by=VALUES(recorded_by),
        request_id=VALUES(request_id), recorded_at=VALUES(recorded_at)`
    : `ON CONFLICT(order_id,seller_id) DO UPDATE SET weight_grams=excluded.weight_grams, item_count=excluded.item_count,
        recorded_by=excluded.recorded_by, request_id=excluded.request_id, recorded_at=excluded.recorded_at`;
  return db.prepare(`INSERT INTO seller_parcel_weights(order_id,seller_id,weight_grams,item_count,recorded_by,request_id,recorded_at)
    SELECT o.id,?,?,(SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id AND i.seller_id=? AND i.fulfillment_status<>'cancelled'),?,?,?
    FROM orders o WHERE o.id=? AND o.operation_request_id=? AND EXISTS(
      SELECT 1 FROM order_item_status_events e JOIN order_items i ON i.id=e.order_item_id
      WHERE i.order_id=o.id AND i.seller_id=? AND e.actor_id=? AND e.request_id=? AND e.created_at=? AND e.to_status='ready_for_pickup'
    ) ${upsert}`)
    .bind(input.sellerId, grams, input.sellerId, input.actorId, input.requestId, input.now, input.orderId, input.requestId,
      input.sellerId, input.actorId, input.requestId, input.now);
}
