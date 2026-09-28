import { getFormAnswerById, type StoredFormAnswer } from '../db/repositories/form-answers';

export class FormPrivacyError extends Error {
  constructor(message: string) { super(message); this.name = 'FormPrivacyError'; }
}

// This predicate is deliberately an allowlist. A new subject type needs an
// explicit parent-owner relationship before it can enter access exports or erasure.
const ownedBase = `((subject_type='user' AND subject_id=?)
  OR (subject_type='address' AND (EXISTS(SELECT 1 FROM addresses a WHERE a.id=subject_id AND a.user_id=?)
    OR (NOT EXISTS(SELECT 1 FROM addresses live WHERE live.id=subject_id)
      AND EXISTS(SELECT 1 FROM address_answer_owner_tombstones gone
        WHERE gone.address_id=subject_id AND gone.user_id=?))))
  OR (subject_type='product_review' AND EXISTS(SELECT 1 FROM product_reviews p WHERE p.id=subject_id AND p.customer_id=?))
  OR (subject_type='seller' AND EXISTS(SELECT 1 FROM seller_profiles s WHERE s.id=subject_id AND s.user_id=?))
  OR (subject_type='product' AND EXISTS(SELECT 1 FROM products p
    JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=subject_id AND s.user_id=?))
  OR (subject_type='shipping_job' AND EXISTS(SELECT 1 FROM shipping_jobs j
    JOIN seller_profiles s ON s.id=j.seller_id WHERE j.id=subject_id AND s.user_id=?))
  OR (subject_type='shipping_job_event' AND form_id<>'shipping.console-action-staff'
    AND EXISTS(SELECT 1 FROM shipping_job_events e
    JOIN shipping_jobs j ON j.id=e.shipping_job_id JOIN seller_profiles s ON s.id=j.seller_id
    WHERE e.id=subject_id AND s.user_id=?))
  OR (subject_type='payout_request' AND EXISTS(SELECT 1 FROM payout_requests p
    JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=subject_id AND s.user_id=?))
  OR (subject_type='review_reply' AND EXISTS(SELECT 1 FROM review_replies reply
    JOIN product_reviews review ON review.id=reply.review_id JOIN products p ON p.id=review.product_id
    JOIN seller_profiles s ON s.id=p.seller_id WHERE reply.id=subject_id AND reply.seller_id=s.id AND s.user_id=?))
  OR (subject_type='managed_supply' AND EXISTS(SELECT 1 FROM managed_supply_records supply
    JOIN seller_profiles s ON s.id=supply.seller_id WHERE supply.id=subject_id AND s.user_id=?))
  OR (subject_type='seller_route_transition' AND EXISTS(SELECT 1 FROM seller_route_transition_applications transition
    JOIN seller_profiles s ON s.id=transition.seller_id WHERE transition.id=subject_id AND s.user_id=?))
  OR (subject_type='rider' AND EXISTS(SELECT 1 FROM rider_profiles r WHERE r.user_id=subject_id AND r.user_id=?))
  OR (subject_type='rider_application' AND form_id='rider.application'
    AND EXISTS(SELECT 1 FROM rider_applications application
      WHERE application.id=subject_id AND application.user_id=?))
  OR (subject_type='rider_report' AND form_id='rider.report'
    AND EXISTS(SELECT 1 FROM rider_reports report
      WHERE report.id=subject_id AND report.rider_user_id=?))
  OR (subject_type='parcel_cash_record' AND form_id='rider.remittance'
    AND EXISTS(SELECT 1 FROM parcel_cash_records cash
      WHERE cash.id=subject_id AND cash.kind='remittance' AND cash.rider_user_id=?))
  OR (subject_type='rider_event' AND form_id='rider.code-verify'
    AND EXISTS(SELECT 1 FROM rider_events event
      WHERE event.id=subject_id AND event.action='otp_verified' AND event.user_id=?))
  OR (subject_type='data_rights_request' AND EXISTS(SELECT 1 FROM data_rights_requests d WHERE d.id=subject_id AND d.customer_id=?))
  OR (subject_type='order' AND form_id='commerce.checkout' AND EXISTS(
    SELECT 1 FROM orders o WHERE o.id=subject_id AND o.customer_id=?))
  OR (subject_type='return_request' AND form_id='commerce.return-request' AND EXISTS(
    SELECT 1 FROM return_requests r JOIN order_items i ON i.id=r.order_item_id
    JOIN orders o ON o.id=i.order_id WHERE r.id=subject_id AND o.customer_id=?))
  OR (subject_type='complaint' AND form_id='commerce.complaint' AND EXISTS(
    SELECT 1 FROM complaints c JOIN orders o ON o.id=c.order_id
    WHERE c.id=subject_id AND o.customer_id=?))
  OR (subject_type='gift_card_issue' AND form_id='commerce.gift-card-issue' AND EXISTS(
    SELECT 1 FROM gift_cards g WHERE g.id=subject_id AND g.issued_by=?))
  OR (subject_type='gift_card_redemption' AND form_id='commerce.gift-card-redeem' AND EXISTS(
    SELECT 1 FROM gift_cards g WHERE g.id=subject_id AND g.redeemed_by=?))
  OR (subject_type='return_request' AND form_id='seller.case-return-response' AND EXISTS(
    SELECT 1 FROM return_requests r JOIN order_items i ON i.id=r.order_item_id
    JOIN seller_profiles s ON s.id=i.seller_id WHERE r.id=subject_id AND s.user_id=?))
  OR (subject_type='complaint' AND form_id='seller.case-complaint-response' AND EXISTS(
    SELECT 1 FROM complaints c JOIN seller_profiles s ON s.id=c.seller_id
    WHERE c.id=subject_id AND s.user_id=?))
  OR (form_answer_sets.form_id='commerce.order-cancellation' AND form_answer_sets.subject_type='order_cancellation_event'
    AND EXISTS(SELECT 1 FROM order_cancellation_events e JOIN orders o ON o.id=e.order_id
      JOIN audit_logs a ON a.subject_type='order' AND a.subject_id=o.id
        AND a.request_id=e.id||':catalog' AND a.actor_id IS e.actor_id AND a.action='cancellation.form_submitted'
      WHERE e.id=form_answer_sets.subject_id AND e.id=form_answer_sets.request_id
        AND e.actor_id=form_answer_sets.actor_id AND o.customer_id=e.actor_id AND o.customer_id=?
        AND EXISTS(SELECT 1 FROM audit_logs cancelled WHERE cancelled.subject_type='order'
          AND cancelled.subject_id=o.id AND cancelled.request_id=e.id AND cancelled.actor_id IS e.actor_id
          AND cancelled.action='order.parcel_cancelled')
        AND json_extract(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.formId')='commerce.order-cancellation'
        AND json_extract(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.action')='confirm'
        AND json_type(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.catalogDigest')='text'
        AND length(json_extract(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.catalogDigest'))=64
        AND json_extract(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.catalogDigest') NOT GLOB '*[^a-f0-9]*'))
  OR (form_answer_sets.form_id='commerce.order-cancellation' AND form_answer_sets.subject_type='order_cancellation_review'
    AND EXISTS(SELECT 1 FROM order_cancellation_reviews r JOIN orders o ON o.id=r.order_id
      JOIN audit_logs a ON a.subject_type='order' AND a.subject_id=o.id
        AND a.request_id=r.id||':catalog' AND a.actor_id IS r.requested_by AND a.action='cancellation.form_submitted'
      WHERE r.id=form_answer_sets.subject_id AND r.id=form_answer_sets.request_id
        AND r.requested_by=form_answer_sets.actor_id AND o.customer_id=r.requested_by AND o.customer_id=?
        AND json_extract(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.formId')='commerce.order-cancellation'
        AND json_extract(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.action')='confirm'
        AND json_type(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.catalogDigest')='text'
        AND length(json_extract(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.catalogDigest'))=64
        AND json_extract(CASE WHEN json_valid(a.next_json) THEN a.next_json ELSE '{}' END,'$.catalogDigest') NOT GLOB '*[^a-f0-9]*'))) `;
const owned = `(form_id NOT LIKE 'staff.%' AND
  (form_id NOT LIKE 'identity.%' OR
    (form_id IN ('identity.register','identity.login-password',
      'identity.email-code-verify','identity.password-reset-complete')
      AND subject_type='user' AND actor_id=subject_id)) AND ${ownedBase})`;
const ownerBindings = (userId: string) => Array(27).fill(userId) as string[];
const deletable = `(form_id='account.profile' AND subject_type='user' AND subject_id=?)`;

function required(value: string, label: string, max = 191): string {
  if (!value?.trim() || value.length > max) throw new FormPrivacyError(`${label} is invalid.`);
  return value;
}

async function requireSuperAdmin(db: D1Database, actorId: string): Promise<void> {
  const row = await db.prepare(`SELECT 1 AS valid FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.id=? AND u.status='active' AND r.role='super_admin' LIMIT 1`)
    .bind(actorId).first<{ valid: number }>();
  if (!row) throw new FormPrivacyError('An active Super Admin is required.');
}

export async function collectFormAnswersForPrivacy(db: D1Database, userId: string): Promise<StoredFormAnswer[]> {
  required(userId, 'User ID');
  const answers: StoredFormAnswer[] = [];
  let cursor: { createdAt: number; id: string } | null = null;
  while (true) {
    const rows: { results: { id: string; createdAt: number }[] } = await db.prepare(`SELECT id,created_at AS createdAt
      FROM form_answer_sets WHERE ${owned}
        AND (? IS NULL OR created_at>? OR (created_at=? AND id>?))
      ORDER BY created_at,id LIMIT 100`)
      .bind(...ownerBindings(userId), cursor?.createdAt ?? null,
        cursor?.createdAt ?? 0, cursor?.createdAt ?? 0, cursor?.id ?? '').all<{ id: string; createdAt: number }>();
    for (const { id } of rows.results) {
      const answer = await getFormAnswerById(db, id);
      if (!answer) throw new FormPrivacyError('An answer changed during export. Retry.');
      answers.push(answer);
    }
    if (rows.results.length < 100) break;
    cursor = rows.results[rows.results.length - 1];
  }
  return answers;
}

export async function eraseFormAnswersForPrivacy(db: D1Database, input: {
  userId: string; requestId: string; actorId: string; dataRightsRequestId?: string;
}): Promise<{ deletedCount: number }> {
  const userId = required(input.userId, 'User ID');
  const requestId = required(input.requestId, 'Request ID');
  const actorId = required(input.actorId, 'Actor ID');
  const dataRightsRequestId = required(input.dataRightsRequestId ?? requestId, 'Data-rights request ID');
  await requireSuperAdmin(db, actorId);
  const key = `form-answer-erasure:${requestId}`;
  const prior = await db.prepare(`SELECT actor_id AS actorId,subject_id AS userId,next_json AS nextJson
    FROM audit_logs WHERE request_id=? AND action='form.answers.erased' LIMIT 1`)
    .bind(key).first<{ actorId: string; userId: string; nextJson: string }>();
  if (prior) {
    if (prior.actorId !== actorId || prior.userId !== userId) throw new FormPrivacyError('Request ID belongs to a different erasure.');
    const details = JSON.parse(prior.nextJson) as { deletedCount: number; dataRightsRequestId: string };
    if (details.dataRightsRequestId !== dataRightsRequestId)
      throw new FormPrivacyError('Request ID belongs to a different erasure.');
    return { deletedCount: details.deletedCount };
  }
  const existingErasure = await db.prepare(`SELECT 1 AS valid FROM audit_logs
    WHERE action='form.answers.erased' AND subject_id=?
      AND json_extract(next_json,'$.dataRightsRequestId')=? LIMIT 1`)
    .bind(userId, dataRightsRequestId).first<{ valid: number }>();
  if (existingErasure) throw new FormPrivacyError('Erasure was already recorded for this request.');
  const request = await db.prepare(`SELECT 1 AS valid FROM data_rights_requests
    WHERE id=? AND customer_id=? AND request_type='deletion' AND status='approved'
      AND assigned_to=? LIMIT 1`)
    .bind(dataRightsRequestId, userId, actorId).first<{ valid: number }>();
  if (!request) throw new FormPrivacyError('An approved deletion request is required.');
  const hold = await db.prepare(`SELECT 1 AS valid FROM data_rights_legal_holds
    WHERE user_id=? AND released_at IS NULL LIMIT 1`).bind(userId).first<{ valid: number }>();
  if (hold) throw new FormPrivacyError('A stored legal hold blocks deletion.');
  const now = Date.now();
  // The first statement rechecks authority, the approved request and active
  // hold inside the same D1 batch as the delete. A failed guard aborts both.
  const audit = db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,
    reason,previous_json,next_json,request_id,created_at)
    VALUES (?,?,'form.answers.erased','user',?,'Approved account-profile answer deletion; linked records retained',NULL,
      CASE WHEN EXISTS(SELECT 1 FROM data_rights_legal_holds WHERE user_id=? AND released_at IS NULL)
        OR EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
        OR EXISTS(SELECT 1 FROM audit_logs WHERE action='form.answers.erased' AND subject_id=?
          AND json_extract(next_json,'$.dataRightsRequestId')=?)
        OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
          WHERE u.id=? AND u.status='active' AND r.role='super_admin')
        OR NOT EXISTS(SELECT 1 FROM data_rights_requests WHERE id=? AND customer_id=?
          AND request_type='deletion' AND status='approved' AND assigned_to=?)
      THEN json_extract('invalid guard', '$')
      ELSE json_object('deletedCount',(SELECT COUNT(*) FROM form_answer_sets WHERE ${deletable}),
        'dataRightsRequestId',?,'scope','account.profile') END,?,?)`)
    .bind(crypto.randomUUID(), actorId, userId, userId, key, userId, dataRightsRequestId,
      actorId, dataRightsRequestId, userId, actorId,
      userId, dataRightsRequestId, key, now);
  const deletion = db.prepare(`DELETE FROM form_answer_sets WHERE ${deletable}
    AND NOT EXISTS(SELECT 1 FROM data_rights_legal_holds WHERE user_id=? AND released_at IS NULL)`)
    .bind(userId, userId);
  try { await db.batch([audit, deletion]); }
  catch (error) {
    if (error instanceof Error && /malformed JSON|invalid guard/i.test(error.message)) {
      const activeHold = await db.prepare(`SELECT 1 AS valid FROM data_rights_legal_holds
        WHERE user_id=? AND released_at IS NULL LIMIT 1`).bind(userId).first<{ valid: number }>();
      if (activeHold) throw new FormPrivacyError('A stored legal hold blocks deletion.');
      const claimed = await db.prepare('SELECT 1 AS valid FROM audit_logs WHERE request_id=? LIMIT 1')
        .bind(key).first<{ valid: number }>();
      if (claimed) throw new FormPrivacyError('Request ID belongs to a different erasure.');
      const alreadyRecorded = await db.prepare(`SELECT 1 AS valid FROM audit_logs
        WHERE action='form.answers.erased' AND subject_id=?
          AND json_extract(next_json,'$.dataRightsRequestId')=? LIMIT 1`)
        .bind(userId, dataRightsRequestId).first<{ valid: number }>();
      if (alreadyRecorded) throw new FormPrivacyError('Erasure was already recorded for this request.');
      throw new FormPrivacyError('Deletion authority or request status changed.');
    }
    throw error;
  }
  const saved = await db.prepare(`SELECT next_json AS nextJson FROM audit_logs WHERE request_id=?
    AND actor_id=? AND subject_id=? AND action='form.answers.erased' LIMIT 1`)
    .bind(key, actorId, userId).first<{ nextJson: string }>();
  if (!saved) throw new FormPrivacyError('Erasure audit was not saved.');
  return { deletedCount: (JSON.parse(saved.nextJson) as { deletedCount: number }).deletedCount };
}

export async function placeDataRightsLegalHold(db: D1Database, input: {
  userId: string; actorId: string; reason: string; requestId: string; now: number;
}): Promise<{ id: string }> {
  const userId = required(input.userId, 'User ID');
  const actorId = required(input.actorId, 'Actor ID');
  const requestId = required(input.requestId, 'Request ID');
  const reason = required(input.reason.trim(), 'Legal hold reason', 2000);
  if (reason.length < 8 || !Number.isSafeInteger(input.now) || input.now < 0) throw new FormPrivacyError('Legal hold reason or time is invalid.');
  await requireSuperAdmin(db, actorId);
  const key = `legal-hold-place:${requestId}`;
  const prior = await db.prepare(`SELECT subject_id AS holdId,actor_id AS actorId,reason
    FROM audit_logs WHERE request_id=? AND action='privacy.legal_hold.placed' LIMIT 1`)
    .bind(key).first<{ holdId: string; actorId: string; reason: string }>();
  if (prior) {
    const existing = await db.prepare('SELECT user_id AS userId FROM data_rights_legal_holds WHERE id=?')
      .bind(prior.holdId).first<{ userId: string }>();
    if (prior.actorId !== actorId || prior.reason !== reason || existing?.userId !== userId)
      throw new FormPrivacyError('Request ID belongs to a different legal hold.');
    return { id: prior.holdId };
  }
  const id = crypto.randomUUID();
  const [placed, audited] = await db.batch([
    db.prepare(`INSERT INTO data_rights_legal_holds(id,user_id,reason,placed_by,placed_at)
      SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
        AND EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
        WHERE u.id=? AND u.status='active' AND r.role='super_admin')`)
      .bind(id, userId, reason, actorId, input.now, key, actorId),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,
      previous_json,next_json,request_id,created_at)
      SELECT ?,?,'privacy.legal_hold.placed','data_rights_legal_hold',?, ?,NULL,
        json_object('userId',?),?,? FROM data_rights_legal_holds WHERE id=?`)
      .bind(crypto.randomUUID(), actorId, id, reason, userId, key, input.now, id),
  ]);
  if ((placed.meta.changes ?? 0) !== 1 || (audited.meta.changes ?? 0) !== 1)
    throw new FormPrivacyError('Legal hold authority changed.');
  return { id };
}

export async function releaseDataRightsLegalHold(db: D1Database, input: {
  holdId: string; actorId: string; reason: string; requestId: string; now: number;
}): Promise<void> {
  const holdId = required(input.holdId, 'Hold ID');
  const actorId = required(input.actorId, 'Actor ID');
  const requestId = required(input.requestId, 'Request ID');
  const reason = required(input.reason.trim(), 'Release reason', 2000);
  if (reason.length < 8 || !Number.isSafeInteger(input.now) || input.now < 0) throw new FormPrivacyError('Release reason or time is invalid.');
  await requireSuperAdmin(db, actorId);
  const key = `legal-hold-release:${requestId}`;
  const prior = await db.prepare(`SELECT subject_id AS holdId,actor_id AS actorId,reason FROM audit_logs
    WHERE request_id=? AND action='privacy.legal_hold.released' LIMIT 1`)
    .bind(key).first<{ holdId: string; actorId: string; reason: string }>();
  if (prior) {
    if (prior.holdId !== holdId || prior.actorId !== actorId || prior.reason !== reason)
      throw new FormPrivacyError('Request ID belongs to a different hold release.');
    return;
  }
  const [released, audited] = await db.batch([
    db.prepare(`UPDATE data_rights_legal_holds SET released_by=?,released_at=? WHERE id=?
      AND released_at IS NULL AND placed_at<=? AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
      AND EXISTS(SELECT 1 FROM users u
        JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin')`)
      .bind(actorId, input.now, holdId, input.now, key, actorId),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,
      previous_json,next_json,request_id,created_at)
      SELECT ?,?,'privacy.legal_hold.released','data_rights_legal_hold',?, ?,NULL,
        json_object('userId',user_id),?,? FROM data_rights_legal_holds
      WHERE id=? AND released_by=? AND released_at=? AND changes()=1`)
      .bind(crypto.randomUUID(), actorId, holdId, reason, key, input.now, holdId, actorId, input.now),
  ]);
  if ((released.meta.changes ?? 0) !== 1 || (audited.meta.changes ?? 0) !== 1)
    throw new FormPrivacyError('Legal hold was already released or authority changed.');
}
