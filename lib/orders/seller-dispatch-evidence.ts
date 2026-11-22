import { validateProductImage, validateProductImageContent } from '../products/submission';

// Only an explicitly supplied local fixture binding enables either capability.
export const SELLER_DISPATCH_PHOTO_UPLOAD: unique symbol = Symbol('seller dispatch photo upload');
export const SELLER_DISPATCH_PHOTO_READ: unique symbol = Symbol('seller dispatch photo read');
type DispatchPhotoBinding = D1Database & {
  [SELLER_DISPATCH_PHOTO_UPLOAD]?: true;
  [SELLER_DISPATCH_PHOTO_READ]?: true;
};

export function sellerDispatchPhotoUploadEnabled(db: D1Database): boolean {
  return (db as DispatchPhotoBinding)[SELLER_DISPATCH_PHOTO_UPLOAD] === true;
}

export function sellerDispatchPhotoReadEnabled(db: D1Database): boolean {
  return (db as DispatchPhotoBinding)[SELLER_DISPATCH_PHOTO_READ] === true;
}

export class DispatchEvidenceError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 503) { super(message); }
}

export function validDispatchEvidenceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,190}$/.test(value);
}

type Target = { orderId: string; orderItemId: string; requestId: string; now: number };
type Seller = { userId: string; sellerId: string; authSubject: string };
type SavedUpload = { id: string; orderId: string; orderItemId: string; sellerId: string; mimeType: string; sizeBytes: number; sha256: string };

const ownedItem = `FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id JOIN users u ON u.id=s.user_id
  WHERE i.id=? AND HEX(i.id)=HEX(?) AND HEX(i.order_id)=HEX(?) AND HEX(i.seller_id)=HEX(?)
    AND HEX(u.id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND u.status='active' AND s.status='approved'
    AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller')`;
const preHandoff = `AND i.fulfillment_status IN ('confirmed','packing','ready_for_pickup')
  AND NOT EXISTS(SELECT 1 FROM order_item_status_events e WHERE e.order_item_id=i.id AND e.to_status IN ('dispatched','delivered'))
  AND NOT EXISTS(SELECT 1 FROM shipping_jobs j WHERE j.order_id=i.order_id AND j.seller_id=i.seller_id
    AND j.direction='outbound' AND j.status NOT IN ('pickup_requested','label_pending','label_ready','pickup_scheduled'))`;

async function uploadReceipt(db: D1Database, actorId: string, requestId: string) {
  return db.prepare(`SELECT id,order_id AS orderId,order_item_id AS orderItemId,seller_id AS sellerId,
    mime_type AS mimeType,size_bytes AS sizeBytes,sha256 FROM seller_dispatch_evidence
    WHERE actor_id=? AND request_id=? AND HEX(actor_id)=HEX(?) AND HEX(request_id)=HEX(?)`)
    .bind(actorId, requestId, actorId, requestId).first<SavedUpload>();
}

async function discardUpload(bucket: R2Bucket, key: string) {
  await Promise.allSettled([bucket.delete(key)]);
}

export async function saveSellerDispatchPhoto(db: D1Database, bucket: R2Bucket, seller: Seller, target: Target, file: File) {
  if (!sellerDispatchPhotoUploadEnabled(db)) throw new DispatchEvidenceError('Dispatch evidence is unavailable.', 404);
  const { orderId, orderItemId, requestId, now } = target;
  if (!validDispatchEvidenceId(orderId) || !validDispatchEvidenceId(orderItemId) || !validDispatchEvidenceId(requestId) ||
      requestId.length < 8 || requestId.length > 150) {
    throw new DispatchEvidenceError('Use the exact order item and an upload request reference.', 400);
  }
  const scope = [orderItemId, orderItemId, orderId, seller.sellerId, seller.userId, seller.authSubject];
  const ownsItem = () => db.prepare(`SELECT 1 ${ownedItem}`).bind(...scope).first();
  if (!await ownsItem()) {
    throw new DispatchEvidenceError('Order item not found.', 404);
  }
  const existing = await uploadReceipt(db, seller.userId, requestId);
  if (!existing && !await db.prepare(`SELECT 1 ${ownedItem} ${preHandoff}`).bind(...scope).first()) {
    throw new DispatchEvidenceError('Dispatch photos can be added before carrier handoff.', 409);
  }
  const error = validateProductImage(file) ?? await validateProductImageContent(file);
  if (error) throw new DispatchEvidenceError(error, 400);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  const matches = (row: SavedUpload) => row.orderId === orderId && row.orderItemId === orderItemId && row.sellerId === seller.sellerId &&
    row.sha256 === sha256 && row.mimeType === file.type && Number(row.sizeBytes) === file.size;
  const conflict = () => new DispatchEvidenceError('This request reference already belongs to a different photo or item.', 409);
  if (existing) {
    if (!await ownsItem()) throw new DispatchEvidenceError('Order item not found.', 404);
    if (!matches(existing)) throw conflict();
    return { id: existing.id, replayed: true };
  }

  const id = crypto.randomUUID();
  const key = `private/seller-dispatch-evidence/${id}`;
  try {
    await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  } catch {
    await discardUpload(bucket, key);
    throw new DispatchEvidenceError('The photo could not be stored. Retry the same upload.', 503);
  }

  try {
    await db.batch([
      db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(orderId),
      db.prepare("UPDATE shipping_jobs SET updated_at=updated_at WHERE order_id=? AND seller_id=? AND direction='outbound'")
        .bind(orderId, seller.sellerId),
      db.prepare(`INSERT INTO seller_dispatch_evidence(id,order_id,order_item_id,seller_id,actor_id,request_id,object_key,mime_type,size_bytes,sha256,created_at)
        SELECT ?,i.order_id,i.id,i.seller_id,u.id,?,?,?,?,?,? ${ownedItem} ${preHandoff}`)
        .bind(id, requestId, key, file.type, file.size, sha256, now, ...scope),
      db.prepare('INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM seller_dispatch_evidence WHERE id=?) THEN 1 ELSE 0 END')
        .bind(id, id),
      db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),
    ]);
  } catch {
    let recorded: SavedUpload | null;
    try {
      recorded = await uploadReceipt(db, seller.userId, requestId);
    } catch {
      // Keep the exact bytes when the database outcome cannot be established.
      throw new DispatchEvidenceError('The upload outcome is unconfirmed. Retry the same photo and request.', 503);
    }
    if (recorded?.id !== id) await discardUpload(bucket, key);
    if (recorded) {
      if (!await ownsItem()) throw new DispatchEvidenceError('Order item not found.', 404);
      if (!matches(recorded)) throw conflict();
      return { id: recorded.id, replayed: true };
    }
    throw new DispatchEvidenceError('The order item or seller access changed. Reopen the order before uploading.', 409);
  }
  return { id, replayed: false };
}

/** The caller first proves current staff evidence-read permission. */
export async function getSellerDispatchPhotoForCase(db: D1Database, caseId: string, photoId: string, staffId: string) {
  if (!sellerDispatchPhotoReadEnabled(db) || !validDispatchEvidenceId(caseId) || !validDispatchEvidenceId(photoId)) return null;
  return db.prepare(`SELECT p.object_key AS objectKey,p.mime_type AS mimeType
    FROM seller_dispatch_evidence p JOIN order_items i ON i.id=p.order_item_id AND i.order_id=p.order_id AND i.seller_id=p.seller_id
    JOIN return_requests r ON r.order_item_id=i.id JOIN orders o ON o.id=i.order_id JOIN seller_profiles s ON s.id=i.seller_id
    WHERE r.id=? AND HEX(r.id)=HEX(?) AND p.id=? AND HEX(p.id)=HEX(?)
      AND (o.customer_id IS NULL OR HEX(o.customer_id)<>HEX(?)) AND HEX(s.user_id)<>HEX(?) AND HEX(p.actor_id)<>HEX(?)`)
    .bind(caseId, caseId, photoId, photoId, staffId, staffId, staffId).first<{ objectKey: string; mimeType: string }>();
}
