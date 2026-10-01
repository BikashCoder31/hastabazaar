import { publicProductEligibility } from '@/lib/products/eligibility';
import { CustomerDataConflictError } from './customers';
export interface ReviewPhoto {
  id: string;
  reviewId: string;
  sortOrder: number;
}
export interface SellerReply {
  id: string;
  reviewId: string;
  body: string;
  version: number;
  status: string;
  sellerName: string;
  createdAt: number;
}
export async function getReviewExtras(
  db: D1Database,
  reviewIds: readonly string[],
  privateAccess = false,
) {
  if (!reviewIds.length)
    return { photos: [] as ReviewPhoto[], replies: [] as SellerReply[] };
  const ids = reviewIds.slice(0, 100);
  const placeholders = ids.map(() => '?').join(',');
  const visibility = privateAccess
    ? ''
    : `AND r.status='published' AND ${publicProductEligibility('p')}`;
  const [photos, replies] = await Promise.all([
    db
      .prepare(
        `SELECT f.id,f.review_id AS reviewId,f.sort_order AS sortOrder FROM review_photos f JOIN product_reviews r ON r.id=f.review_id JOIN products p ON p.id=r.product_id WHERE r.id IN (${placeholders}) ${visibility} ORDER BY f.sort_order`,
      )
      .bind(...ids)
      .all<ReviewPhoto>(),
    db
      .prepare(`SELECT x.id,x.review_id AS reviewId,x.body,x.version,x.status,x.created_at AS createdAt,s.trading_name AS sellerName
   FROM review_replies x JOIN product_reviews r ON r.id=x.review_id JOIN products p ON p.id=r.product_id JOIN seller_profiles s ON s.id=x.seller_id
   WHERE r.id IN (${placeholders}) ${visibility} ${privateAccess ? '' : "AND x.status='published'"}
   AND x.version=(SELECT MAX(newer.version) FROM review_replies newer WHERE newer.review_id=x.review_id)`)
      .bind(...ids)
      .all<SellerReply>(),
  ]);
  return { photos: photos.results, replies: replies.results };
}
export async function getReviewPhotoAccess(db: D1Database, id: string) {
  const row = await db
    .prepare(`SELECT f.object_key AS objectKey,f.mime_type AS mimeType,r.customer_id AS customerId,r.status AS reviewStatus,CASE WHEN ${publicProductEligibility('p')} THEN 'published' ELSE 'archived' END AS productStatus
 FROM review_photos f JOIN product_reviews r ON r.id=f.review_id JOIN products p ON p.id=r.product_id WHERE f.id=?`)
    .bind(id)
    .first<{
      objectKey: string;
      mimeType: string;
      customerId: string;
      reviewStatus: string;
      productStatus: string;
    }>();
  return row
    ? {
        ...row,
        isPublic:
          row.reviewStatus === 'published' && row.productStatus === 'published',
      }
    : null;
}
export async function saveSellerReply(
  db: D1Database,
  o: {
    reviewId: string;
    sellerId: string;
    actorId: string;
    body: string;
    version: number;
    requestId: string;
    now: number;
  },
) {
  const body = o.body.trim();
  if (
    body.length < 10 ||
    body.length > 2000 ||
    !Number.isInteger(o.version) ||
    o.version < 0
  )
    throw new CustomerDataConflictError('Reply must be 10â€“2,000 characters.');
  const owns = await db
    .prepare(`SELECT r.id FROM product_reviews r JOIN products p ON p.id=r.product_id JOIN seller_profiles s ON s.id=p.seller_id
 WHERE r.id=? AND p.seller_id=? AND s.user_id=? AND s.status='approved' AND r.status='published'`)
    .bind(o.reviewId, o.sellerId, o.actorId)
    .first();
  if (!owns)
    throw new CustomerDataConflictError(
      'Only the productâ€™s seller can reply to a published review.',
    );
  if (
    await db
      .prepare(
        "SELECT id FROM audit_logs WHERE request_id=? AND actor_id=? AND subject_id=? AND action='review.reply_submitted'",
      )
      .bind(o.requestId, o.actorId, o.reviewId)
      .first()
  )
    return;
  const current = await db
    .prepare(
      'SELECT COALESCE(MAX(version),0) AS version FROM review_replies WHERE review_id=?',
    )
    .bind(o.reviewId)
    .first<{ version: number }>();
  if (current?.version !== o.version)
    throw new CustomerDataConflictError(
      'This reply changed. Refresh before replying.',
    );
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at) VALUES (?,?,?,?,?,'pending',?)",
        )
        .bind(
          crypto.randomUUID(),
          o.reviewId,
          o.sellerId,
          body,
          o.version + 1,
          o.now,
        ),
      db
        .prepare(
          "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at) VALUES (?,?,'review.reply_submitted','product_review',?,'Seller reply submitted for moderation',?,?)",
        )
        .bind(crypto.randomUUID(), o.actorId, o.reviewId, o.requestId, o.now),
    ]);
  } catch (e) {
    if (
      e instanceof Error &&
      /UNIQUE constraint|Duplicate entry/.test(e.message)
    )
      throw new CustomerDataConflictError(
        'This reply changed. Refresh before replying.',
      );
    throw e;
  }
}
export async function moderateSellerReply(
  db: D1Database,
  o: {
    reviewId: string;
    actorId: string;
    action: 'publish' | 'reject' | 'hide';
    version: number;
    note: string;
    requestId: string;
    now: number;
  },
) {
  const note = o.note.trim();
  if (note.length < 8 || note.length > 1000)
    throw new CustomerDataConflictError(
      'Add a moderation note of 8â€“1,000 characters.',
    );
  if (!['publish', 'reject', 'hide'].includes(o.action))
    throw new CustomerDataConflictError('Invalid moderation action.');
  if (
    await db
      .prepare(
        'SELECT id FROM audit_logs WHERE request_id=? AND actor_id=? AND subject_id=? AND action=?',
      )
      .bind(o.requestId, o.actorId, o.reviewId, `review.reply_${o.action}`)
      .first()
  )
    return;
  const current = await db
    .prepare(
      'SELECT id,version,status FROM review_replies WHERE review_id=? ORDER BY version DESC LIMIT 1',
    )
    .bind(o.reviewId)
    .first<{ id: string; version: number; status: string }>();
  if (!current || current.version !== o.version)
    throw new CustomerDataConflictError(
      'The seller reply changed. Refresh and review the latest version.',
    );
  if (current.status !== (o.action === 'hide' ? 'published' : 'pending'))
    throw new CustomerDataConflictError(
      'This reply has already been moderated.',
    );
  const next =
    o.action === 'publish'
      ? 'published'
      : o.action === 'reject'
        ? 'rejected'
        : 'hidden';
  const results = await db.batch([
    db
      .prepare(
        'UPDATE review_replies SET status=?,moderated_by=?,moderation_note=? WHERE id=? AND status=?',
      )
      .bind(next, o.actorId, note, current.id, current.status),
    db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at) VALUES (?,?,?,'product_review',?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        o.actorId,
        `review.reply_${o.action}`,
        o.reviewId,
        note,
        o.requestId,
        o.now,
      ),
  ]);
  if (!results[0].meta.changes)
    throw new CustomerDataConflictError(
      'This reply changed. Refresh the page.',
    );
}
