import { publicProductEligibility } from '@/lib/products/eligibility';
import { CustomerDataConflictError } from './customers';
import { buildFormAnswerInsert } from './form-answers';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { digestFormRequest, formRequestReplay, FormRequestConflictError } from '@/lib/forms/submission';
import { staffMutationGuard } from './staff-mutation-guard';
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
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot };
  },
) {
  const catalogDigest = o.form ? await digestFormRequest({ reviewId: o.reviewId, sellerId: o.sellerId,
    body: o.body.trim(), version: o.version, versionId: o.form.versionId, answers: o.form.answers }) : null;
  if (o.form) {
    const replay = await formRequestReplay(db, { formId: 'seller.review-reply', requestId: o.requestId,
      actorId: o.actorId, action: 'review.reply_submitted', digest: catalogDigest! });
    if (replay) {
      const owned = await db.prepare(`SELECT 1 FROM review_replies rr JOIN product_reviews r ON r.id=rr.review_id
        JOIN products p ON p.id=r.product_id JOIN seller_profiles s ON s.id=p.seller_id
        WHERE rr.id=? AND rr.review_id=? AND rr.seller_id=? AND s.user_id=? AND s.status='approved' LIMIT 1`)
        .bind(replay, o.reviewId, o.sellerId, o.actorId).first();
      if (!owned) throw new FormRequestConflictError('Request reference is already used for another reply.');
      return;
    }
  }
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
  if (!o.form &&
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
  const replyId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO review_replies(id,review_id,seller_id,body,version,status,created_at) VALUES (?,?,?,?,?,'pending',?)",
        )
        .bind(
          replyId,
          o.reviewId,
          o.sellerId,
          body,
          o.version + 1,
          o.now,
        ),
      ...(o.form ? [db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
        VALUES (?,?,'review.reply_submitted','review_reply',?,'Seller reply submitted for moderation',?,?,?)`)
        .bind(crypto.randomUUID(), o.actorId, replyId, JSON.stringify({ catalogDigest }), o.requestId, o.now),
        buildFormAnswerInsert(db, { formId: 'seller.review-reply', requestId: o.requestId,
          versionId: o.form.versionId, subjectType: 'review_reply', subjectId: replyId,
          actorId: o.actorId, answers: o.form.answers, now: o.now })] : [db.prepare(
          "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at) VALUES (?,?,'review.reply_submitted','product_review',?,'Seller reply submitted for moderation',?,?)",
        ).bind(crypto.randomUUID(), o.actorId, o.reviewId, o.requestId, o.now)]),
    ]);
  } catch (e) {
    if (o.form) {
      const replay = await formRequestReplay(db, { formId: 'seller.review-reply', requestId: o.requestId,
        actorId: o.actorId, action: 'review.reply_submitted', digest: catalogDigest! });
      if (replay) {
        const owned = await db.prepare(`SELECT 1 FROM review_replies rr JOIN product_reviews r ON r.id=rr.review_id
          JOIN products p ON p.id=r.product_id JOIN seller_profiles s ON s.id=p.seller_id
          WHERE rr.id=? AND rr.review_id=? AND rr.seller_id=? AND s.user_id=? AND s.status='approved' LIMIT 1`)
          .bind(replay, o.reviewId, o.sellerId, o.actorId).first();
        if (!owned) throw new FormRequestConflictError('Request reference is already used for another reply.');
        return;
      }
    }
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
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot };
  },
) {
  const note = o.note.trim();
  if (note.length < 8 || note.length > 1000)
    throw new CustomerDataConflictError(
      'Add a moderation note of 8â€“1,000 characters.',
    );
  if (!['publish', 'reject', 'hide'].includes(o.action))
    throw new CustomerDataConflictError('Invalid moderation action.');
  if (o.form && o.form.requestId !== o.requestId)
    throw new CustomerDataConflictError('Form request reference does not match the reply decision.');
  const digest = o.form ? await digestFormRequest({ reviewId: o.reviewId, actorId: o.actorId,
    action: o.action, version: o.version, note, versionId: o.form.versionId, answers: o.form.answers }) : null;
  const authority = o.form ? await staffMutationGuard(db, o.actorId, 'product.review', CustomerDataConflictError) : null;
  const prior = await db.prepare(`SELECT actor_id AS actorId,action,subject_type AS subjectType,
    subject_id AS subjectId,next_json AS nextJson FROM audit_logs WHERE request_id=? LIMIT 1`)
    .bind(o.requestId).first<{ actorId: string; action: string; subjectType: string;
      subjectId: string; nextJson: string | null }>();
  if (prior) {
    if (!o.form && prior.actorId === o.actorId && prior.action === `review.reply_${o.action}` &&
      prior.subjectType === 'product_review' && prior.subjectId === o.reviewId) return;
    let savedDigest: unknown;
    try { savedDigest = JSON.parse(prior.nextJson ?? '').catalogDigest; } catch { /* conflict below */ }
    const answer = o.form && await db.prepare(`SELECT actor_id AS actorId,config_version_id AS versionId,
      subject_type AS subjectType,subject_id AS subjectId FROM form_answer_sets
      WHERE form_id='staff.review-moderation' AND request_id=? LIMIT 1`)
      .bind(o.requestId).first<{ actorId: string; versionId: string; subjectType: string; subjectId: string }>();
    const reply = answer && await db.prepare('SELECT review_id AS reviewId,version FROM review_replies WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ reviewId: string; version: number }>();
    if (!o.form || prior.actorId !== o.actorId || prior.action !== `review.reply_${o.action}` ||
      prior.subjectType !== 'product_review' || prior.subjectId !== o.reviewId || savedDigest !== digest ||
      answer?.actorId !== o.actorId || answer?.versionId !== o.form.versionId ||
      answer?.subjectType !== 'review_reply' || reply?.reviewId !== o.reviewId || reply?.version !== o.version)
      throw new CustomerDataConflictError('Request reference already used for different reply content.');
    return;
  }
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
  const guardId = crypto.randomUUID();
  const results = await db.batch([
    db
      .prepare(
        'UPDATE review_replies SET status=?,moderated_by=?,moderation_note=? WHERE id=? AND status=?',
      )
      .bind(next, o.actorId, note, current.id, current.status),
    ...(o.form ? [db.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM review_replies reply WHERE reply.id=? AND reply.review_id=?
        AND reply.version=? AND reply.status=? AND reply.moderated_by=? AND reply.moderation_note=?
        AND NOT EXISTS(SELECT 1 FROM review_replies newer WHERE newer.review_id=reply.review_id AND newer.version>reply.version))
      THEN 1 ELSE 0 END`).bind(guardId, current.id, o.reviewId, o.version, next, o.actorId, note),
      db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId)] : []),
    db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES (?,?,?,'product_review',?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        o.actorId,
        `review.reply_${o.action}`,
        o.reviewId,
        note,
        digest ? JSON.stringify({ catalogDigest: digest, replyId: current.id, replyVersion: o.version }) : null,
        o.requestId,
        o.now,
      ),
    ...(o.form ? [buildFormAnswerInsert(db, { formId: 'staff.review-moderation', requestId: o.requestId,
      versionId: o.form.versionId, subjectType: 'review_reply', subjectId: current.id,
      actorId: o.actorId, answers: o.form.answers, now: o.now }), ...(authority?.statements ?? [])] : []),
  ]);
  if (!results[0].meta.changes)
    throw new CustomerDataConflictError(
      'This reply changed. Refresh the page.',
    );
}
