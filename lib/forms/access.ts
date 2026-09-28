import type { StoredFormAnswer } from '../db/repositories/form-answers';
import { configurableAdminPermissions, type Permission } from '../marketplace/permissions';
import { businessSettingKeys } from '../configuration/types';

export type FormAnswerViewer = {
  id: string;
  role: 'customer' | 'seller' | 'rider' | 'admin' | 'super_admin';
  /** A caller snapshot is not authority for another person's private answers. */
  permissions?: readonly Permission[];
};

/** Ownership is derived from the parent record, never from the submitter ID. */
export async function formAnswerOwnerId(db: D1Database, answer: Pick<StoredFormAnswer, 'subjectType' | 'subjectId'> &
  Partial<Pick<StoredFormAnswer, 'formId'>>): Promise<string | null> {
  if (answer.formId === 'seller.case-return-response' && answer.subjectType === 'return_request') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM return_requests r
      JOIN order_items i ON i.id=r.order_item_id JOIN seller_profiles s ON s.id=i.seller_id
      WHERE r.id=? AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.formId === 'seller.case-complaint-response' && answer.subjectType === 'complaint') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM complaints c
      JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=? AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'order') {
    const row = await db.prepare('SELECT customer_id AS userId FROM orders WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string | null }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'return_request') {
    const row = await db.prepare(`SELECT o.customer_id AS userId FROM return_requests r
      JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id
      WHERE r.id=? LIMIT 1`).bind(answer.subjectId).first<{ userId: string | null }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'complaint') {
    const row = await db.prepare(`SELECT o.customer_id AS userId FROM complaints c
      JOIN orders o ON o.id=c.order_id WHERE c.id=? LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string | null }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'gift_card_issue' || answer.subjectType === 'gift_card_redemption') {
    const column = answer.subjectType === 'gift_card_issue' ? 'issued_by' : 'redeemed_by';
    const row = await db.prepare(`SELECT ${column} AS userId FROM gift_cards WHERE id=? LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string | null }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'user') {
    const row = await db.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(answer.subjectId).first<{ id: string }>();
    return row?.id ?? null;
  }
  if (answer.subjectType === 'address') {
    const row = await db.prepare('SELECT user_id AS userId FROM addresses WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    if (row) return row.userId;
    const deleted = await db.prepare(`SELECT user_id AS userId FROM address_answer_owner_tombstones
      WHERE address_id=? LIMIT 1`).bind(answer.subjectId).first<{ userId: string }>();
    return deleted?.userId ?? null;
  }
  if (answer.subjectType === 'product_review') {
    const row = await db.prepare('SELECT customer_id AS userId FROM product_reviews WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'seller') {
    const row = await db.prepare('SELECT user_id AS userId FROM seller_profiles WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'product') {
    const row = await db.prepare(`SELECT seller_profiles.user_id AS userId FROM products
      INNER JOIN seller_profiles ON seller_profiles.id=products.seller_id
      WHERE products.id=? LIMIT 1`).bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'shipping_job' || answer.subjectType === 'shipping_job_event') {
    const join = answer.subjectType === 'shipping_job_event'
      ? 'JOIN shipping_job_events e ON e.shipping_job_id=j.id AND e.id=?'
      : '';
    const where = answer.subjectType === 'shipping_job' ? 'j.id=?' : '1=1';
    const row = await db.prepare(`SELECT s.user_id AS userId FROM shipping_jobs j ${join}
      JOIN seller_profiles s ON s.id=j.seller_id WHERE ${where} AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'payout_request') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM payout_requests p
      JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'review_reply') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM review_replies reply
      JOIN product_reviews review ON review.id=reply.review_id JOIN products p ON p.id=review.product_id
      JOIN seller_profiles s ON s.id=p.seller_id WHERE reply.id=? AND reply.seller_id=s.id
        AND s.status='approved' LIMIT 1`).bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'managed_supply') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM managed_supply_records supply
      JOIN seller_profiles s ON s.id=supply.seller_id WHERE supply.id=? AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'seller_route_transition') {
    const row = await db.prepare(`SELECT s.user_id AS userId FROM seller_route_transition_applications transition
      JOIN seller_profiles s ON s.id=transition.seller_id WHERE transition.id=? AND s.status='approved' LIMIT 1`)
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'rider') {
    const row = await db.prepare('SELECT user_id AS userId FROM rider_profiles WHERE user_id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'rider_application') {
    const row = await db.prepare('SELECT user_id AS userId FROM rider_applications WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'rider_report') {
    const row = await db.prepare('SELECT rider_user_id AS userId FROM rider_reports WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'parcel_cash_record') {
    const row = await db.prepare('SELECT rider_user_id AS userId FROM parcel_cash_records WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'rider_event') {
    const row = await db.prepare('SELECT user_id AS userId FROM rider_events WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  if (answer.subjectType === 'data_rights_request') {
    const row = await db.prepare('SELECT customer_id AS userId FROM data_rights_requests WHERE id=? LIMIT 1')
      .bind(answer.subjectId).first<{ userId: string }>();
    return row?.userId ?? null;
  }
  return null;
}

const riderShippingSubjects = new Map([
  ['rider.application', 'rider_application'],
  ['rider.report', 'rider_report'],
  ['rider.remittance', 'parcel_cash_record'],
  ['rider.code-verify', 'rider_event'],
  ['staff.delivery-assignment', 'order'],
  ['shipping.console-request', 'shipping_job'],
  ['shipping.console-action-seller', 'shipping_job_event'],
  ['shipping.console-action-staff', 'shipping_job_event'],
]);

export async function currentStaffGrant(db: D1Database, viewer: FormAnswerViewer,
  permission: Permission | null): Promise<boolean> {
  if (viewer.role !== 'admin' && viewer.role !== 'super_admin') return false;
  if (viewer.role === 'super_admin') return true;
  if (!permission || !configurableAdminPermissions.includes(permission)) return false;
  const safePermissions = `CASE WHEN json_valid(p.permissions_json) THEN p.permissions_json ELSE '[]' END`;
  return Boolean(await db.prepare(`SELECT 1 AS valid FROM users u JOIN user_roles r ON r.user_id=u.id
    LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
    WHERE u.id=? AND u.status='active' AND r.role='admin'
      AND (p.user_id IS NULL OR (json_type(${safePermissions})='array'
        AND EXISTS(SELECT 1 FROM json_each(${safePermissions}) item
          WHERE item.type='text' AND item.value=?)
        AND NOT EXISTS(SELECT 1 FROM json_each(${safePermissions}) item
          WHERE item.type<>'text' OR item.value NOT IN (SELECT value FROM json_each(?)))))
    LIMIT 1`).bind(viewer.id, permission, JSON.stringify(configurableAdminPermissions))
    .first<{ valid: number }>());
}

type AnswerLink = Pick<StoredFormAnswer, 'id' | 'formId' | 'subjectType' | 'subjectId' | 'actorId' | 'requestId'>;

async function committedAnswerVersion(db: D1Database, answer: AnswerLink): Promise<string | null> {
  const row = await db.prepare(`SELECT a.config_version_id AS versionId FROM form_answer_sets a
    JOIN form_config_versions v ON v.id=a.config_version_id AND v.form_id=a.form_id
    WHERE a.id=? AND a.form_id=? AND a.subject_type=? AND a.subject_id=?
      AND a.request_id=? AND a.actor_id IS ? LIMIT 1`)
    .bind(answer.id, answer.formId, answer.subjectType, answer.subjectId, answer.requestId, answer.actorId)
    .first<{ versionId: string }>();
  return row?.versionId ?? null;
}

type ActionAudit = { action: string; nextJson: string | null };
function auditContext(audit: ActionAudit): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(audit.nextJson ?? '');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
const isDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Cancellation history uses the immutable event/review and its configured-action audit. */
async function cancellationAnswerOrder(db: D1Database, answer: AnswerLink): Promise<{ orderId: string; customerId: string | null } | null> {
  const { formId, subjectType, subjectId, requestId, actorId } = answer;
  if (!['commerce.order-cancellation', 'staff.order-fulfillment', 'staff.cancellation-review'].includes(formId) ||
      !await committedAnswerVersion(db, answer)) return null;
  if (formId === 'staff.cancellation-review' && subjectType === 'order_cancellation_review') {
    const row = await db.prepare(`SELECT r.order_id AS orderId,o.customer_id AS customerId,a.action,a.next_json AS nextJson
      FROM order_cancellation_reviews r JOIN orders o ON o.id=r.order_id JOIN audit_logs a
        ON a.subject_type='order' AND a.subject_id=o.id AND a.actor_id IS ? AND a.request_id=?
        AND a.action='cancellation.review_rejected'
      WHERE r.id=? AND ?='review-reject:'||r.id AND r.reviewed_by IS ? AND r.status='rejected' LIMIT 1`)
      .bind(actorId, requestId, subjectId, requestId, actorId)
      .first<ActionAudit & { orderId: string; customerId: string | null }>();
    return row && isDigest(auditContext(row)?.catalogDigest) ? row : null;
  }
  if (subjectType !== 'order_cancellation_event' && subjectType !== 'order_cancellation_review') return null;
  const event = subjectType === 'order_cancellation_event';
  if (formId === 'staff.cancellation-review' && !event) return null;
  const row = await db.prepare(`SELECT p.order_id AS orderId,o.customer_id AS customerId,a.action,a.next_json AS nextJson
    FROM ${event ? 'order_cancellation_events' : 'order_cancellation_reviews'} p JOIN orders o ON o.id=p.order_id
    JOIN audit_logs a ON a.subject_type='order' AND a.subject_id=o.id AND a.actor_id IS ?
      AND a.request_id=? AND a.action='cancellation.form_submitted'
    WHERE p.id=? AND p.id=? AND p.${event ? 'actor_id' : 'requested_by'} IS ?
      ${event ? `AND EXISTS(SELECT 1 FROM audit_logs cancelled WHERE cancelled.subject_type='order'
        AND cancelled.subject_id=o.id AND cancelled.request_id=p.id AND cancelled.actor_id IS p.actor_id
        AND cancelled.action='order.parcel_cancelled')` : ''}
      ${formId === 'staff.cancellation-review' ? `AND EXISTS(SELECT 1 FROM order_cancellation_reviews review
        WHERE p.id='review:'||review.id AND review.order_id=p.order_id
          AND review.reviewed_by IS p.actor_id AND review.status='approved')` : ''}
    LIMIT 1`).bind(actorId, `${requestId}:catalog`, subjectId, requestId, actorId)
    .first<ActionAudit & { orderId: string; customerId: string | null }>();
  const context = row && auditContext(row);
  return row && context?.formId === formId && context.action === (formId === 'staff.cancellation-review' ? 'approve' : 'confirm') &&
    isDigest(context.catalogDigest) ? row : null;
}

/** Only the approved programmatic staff forms enter this gate; unknown staff IDs still deny. */
async function programmaticStaffGrant(db: D1Database, viewer: FormAnswerViewer, answer: AnswerLink): Promise<boolean | null> {
  const { formId, subjectType, subjectId, requestId, actorId } = answer;
  const known = ['staff.return-case-action', 'staff.complaint-case-action', 'staff.cancellation-review',
    'staff.seller-review-action', 'staff.homepage-hero-manager', 'staff.homepage-occasion-manager',
    'staff.business-settings-manager', 'staff.homepage-visibility', 'staff.order-fulfillment',
    'staff.review-moderation', 'staff.seller-governance', 'staff.product-review'];
  if (!known.includes(formId)) return null;
  if (!actorId || !requestId || (viewer.role !== 'admin' && viewer.role !== 'super_admin')) return false;
  const versionId = await committedAnswerVersion(db, answer);
  if (!versionId) return false;
  let permission: Permission;
  let sql: string;
  const values: unknown[] = [requestId, actorId, subjectId];
  let superAdminOnly = false;
  switch (formId) {
    case 'staff.return-case-action':
      if (subjectType !== 'return_request') return false;
      permission = 'refund.approve.standard';
      sql = `SELECT a.action,a.next_json AS nextJson
        FROM return_requests p JOIN order_items i ON i.id=p.order_item_id JOIN orders o ON o.id=i.order_id
        JOIN return_request_events e ON e.return_request_id=p.id AND e.request_id=? AND e.actor_id=?
        JOIN audit_logs a ON a.request_id=e.request_id AND a.actor_id=e.actor_id
          AND ((a.subject_type='return_request' AND a.subject_id=p.id AND (
            (e.action IN ('admin_request_changes','admin_reject','admin_approve') AND a.action='return.admin.'||substr(e.action,7))
            OR (e.action IN ('mark_in_transit','mark_received','resolve_replacement','resolve_return_to_origin','start_refund','complete_refund','fail_refund') AND a.action='return.operations.'||e.action)))
          OR (e.action IN ('high_value_approved','high_value_rejected') AND e.actor_type='super_admin'
            AND a.subject_type='refund' AND a.action='refund.high_value.'||substr(e.action,12)
            AND EXISTS(SELECT 1 FROM refunds f WHERE f.id=a.subject_id AND f.return_request_id=p.id)))
        WHERE p.id=? LIMIT 1`;
      break;
    case 'staff.complaint-case-action':
      if (subjectType !== 'complaint') return false;
      permission = 'support.manage';
      sql = `SELECT a.action,a.next_json AS nextJson FROM complaints p JOIN orders o ON o.id=p.order_id
        JOIN complaint_events e ON e.complaint_id=p.id AND e.request_id=? AND e.actor_id=?
        JOIN audit_logs a ON a.request_id=e.request_id AND a.actor_id=e.actor_id AND a.subject_type='complaint'
          AND a.subject_id=p.id AND a.action='complaint.admin.'||substr(e.action,7)
        WHERE p.id=? AND e.action IN ('admin_assign_to_me','admin_investigate','admin_request_customer','admin_escalate','admin_resolve','admin_close','admin_reopen') LIMIT 1`;
      break;
    case 'staff.cancellation-review':
      return Boolean(await cancellationAnswerOrder(db, answer)) && currentStaffGrant(db, viewer, 'order.manage');
    case 'staff.order-fulfillment':
      if (subjectType !== 'order') return Boolean(await cancellationAnswerOrder(db, answer)) && currentStaffGrant(db, viewer, 'order.manage');
      permission = 'order.manage';
      sql = `SELECT a.action,a.next_json AS nextJson FROM orders p JOIN audit_logs a
        ON a.request_id=? AND a.actor_id=? AND a.subject_type='order' AND a.subject_id=p.id
        AND a.action IN ('order.dispatch','order.deliver') WHERE p.id=? LIMIT 1`;
      break;
    case 'staff.seller-review-action':
      if (subjectType !== 'seller') return false;
      permission = 'seller.application.review';
      sql = `SELECT a.action,a.next_json AS nextJson FROM seller_profiles p JOIN audit_logs a
        ON a.request_id=? AND a.actor_id=? AND a.subject_type='seller' AND a.subject_id=p.id
        AND a.action IN ('seller.application.review_started','seller.application.changes_requested','seller.application.approved','seller.application.rejected','seller.application.approved_for_activation') WHERE p.id=? LIMIT 1`;
      break;
    case 'staff.seller-governance':
      if (subjectType !== 'seller') return false;
      permission = 'seller.suspend'; superAdminOnly = true;
      sql = `SELECT a.action,a.next_json AS nextJson,e.to_mode AS mode,e.obligation_mode AS obligationMode
        FROM seller_profiles p JOIN seller_restriction_events e ON e.seller_id=p.id AND e.request_id=? AND e.actor_id=?
        JOIN audit_logs a ON a.request_id=e.request_id||':audit' AND a.actor_id=e.actor_id
          AND a.subject_type='seller' AND a.subject_id=p.id AND a.action='seller.restriction.changed' WHERE p.id=? LIMIT 1`;
      break;
    case 'staff.product-review':
    case 'staff.homepage-visibility':
      if (subjectType !== 'product') return false;
      permission = formId === 'staff.homepage-visibility' ? 'admin.invite' : 'product.review';
      superAdminOnly = formId === 'staff.homepage-visibility';
      sql = `SELECT a.action,a.next_json AS nextJson FROM products p JOIN audit_logs a
        ON a.request_id=? AND a.actor_id=? AND a.subject_type='product' AND a.subject_id=p.id
        AND a.action IN (${formId === 'staff.homepage-visibility' ? "'homepage.product.hidden','homepage.product.shown'" : "'product.review.started','product.changes.requested','product.approved','product.rejected','product.published','product.unpublished'"}) WHERE p.id=? LIMIT 1`;
      break;
    case 'staff.review-moderation':
      if (subjectType !== 'product_review' && subjectType !== 'review_reply') return false;
      permission = 'product.review';
      sql = subjectType === 'product_review'
        ? `SELECT a.action,a.next_json AS nextJson FROM product_reviews p JOIN products product ON product.id=p.product_id
          JOIN audit_logs a ON a.request_id=? AND a.actor_id=? AND a.subject_type='product_review'
            AND a.subject_id=p.id AND a.action IN ('review.publish','review.reject','review.hide') WHERE p.id=? LIMIT 1`
        : `SELECT a.action,a.next_json AS nextJson,p.version AS replyVersion FROM review_replies p
          JOIN product_reviews review ON review.id=p.review_id JOIN products product ON product.id=review.product_id
          JOIN audit_logs a ON a.request_id=? AND a.actor_id=? AND a.subject_type='product_review'
            AND a.subject_id=review.id AND a.action IN ('review.reply_publish','review.reply_reject','review.reply_hide') WHERE p.id=? LIMIT 1`;
      break;
    default: {
      if (subjectType !== 'business_setting') return false;
      permission = 'business_settings.approve'; superAdminOnly = true;
      sql = `SELECT a.action,a.next_json AS nextJson,p.setting_key AS key,p.version,p.created_by AS createdBy,
        p.supersedes_id AS supersedesId FROM business_setting_versions p JOIN audit_logs a
        ON a.request_id=? AND a.actor_id=? AND a.subject_type='business_setting' AND a.subject_id=p.id
          AND a.action IN ('business_setting.draft_created','business_setting.published','business_setting.submitted','business_setting.approved','business_setting.rejected') WHERE p.id=? LIMIT 1`;
    }
  }
  const audit = await db.prepare(sql).bind(...values).first<ActionAudit & Record<string, unknown>>();
  if (!audit) return false;
  const context = auditContext(audit);
  if (!context) return false;
  if ((formId.startsWith('staff.homepage-') && formId.endsWith('-manager')) || formId === 'staff.business-settings-manager') {
    const key = formId === 'staff.homepage-hero-manager' ? 'homepage_hero_slides' : formId === 'staff.homepage-occasion-manager' ? 'homepage_occasion_slides' : null;
    if (key ? audit.key !== key : !businessSettingKeys.includes(audit.key as typeof businessSettingKeys[number]) || ['homepage_hero_slides','homepage_occasion_slides'].includes(String(audit.key))) return false;
    if (audit.action === 'business_setting.draft_created' && (context.formId !== formId || context.configVersionId !== versionId ||
        context.key !== audit.key || context.version !== audit.version || context.status !== 'draft' || context.revision !== 1 ||
        audit.createdBy !== actorId || context.supersedesId !== audit.supersedesId || !isDigest(context.requestDigest))) return false;
  } else {
    if (!isDigest(context.catalogDigest)) return false;
    if (formId === 'staff.product-review') {
      if (audit.action === 'product.published') permission = 'product.publish';
      if (audit.action === 'product.unpublished') superAdminOnly = true;
    }
    if (formId === 'staff.return-case-action' && audit.action.startsWith('refund.high_value.')) {
      permission = 'refund.approve.high_value'; superAdminOnly = true;
    }
    if (formId === 'staff.review-moderation' && subjectType === 'review_reply' && (context.replyId !== subjectId || context.replyVersion !== audit.replyVersion)) return false;
    if (formId === 'staff.seller-governance' && (context.mode !== audit.mode || context.obligationMode !== audit.obligationMode)) return false;
  }
  return (!superAdminOnly || viewer.role === 'super_admin') && currentStaffGrant(db, viewer, permission);
}

/** These staff decisions are readable only through their exact committed parent action. */
async function staffActionGrant(db: D1Database, viewer: FormAnswerViewer,
  answer: AnswerLink): Promise<boolean | null> {
  const { formId, subjectType, subjectId, requestId, actorId } = answer;
  if (!formId.startsWith('staff.')) return null;
  if (!actorId || !requestId) return false;
  let permission: Permission;
  let parentSql: string;
  let values: unknown[] = [subjectId, requestId, actorId];
  let superAdminOnly = false;
  switch (formId) {
    case 'staff.catalog':
      if (subjectType !== 'category' && subjectType !== 'occasion') return false;
      permission = 'catalog.manage';
      parentSql = `SELECT 1 FROM ${subjectType === 'category' ? 'categories' : 'occasions'} parent
        JOIN audit_logs audit ON audit.subject_type=? AND audit.subject_id=parent.id
          AND audit.request_id=? AND audit.actor_id=?
          AND audit.action IN (?,?) WHERE parent.id=? LIMIT 1`;
      values = [subjectType, requestId, actorId,
        `catalog.${subjectType}.created`, `catalog.${subjectType}.updated`, subjectId];
      break;
    case 'staff.product-classification':
      if (subjectType !== 'product') return false;
      permission = 'catalog.manage';
      parentSql = `SELECT 1 FROM products parent JOIN audit_logs audit
        ON audit.subject_type='product' AND audit.subject_id=parent.id
          AND audit.request_id=? AND audit.actor_id=? AND audit.action='catalog.product.classified'
        WHERE parent.id=? LIMIT 1`;
      values = [requestId, actorId, subjectId];
      break;
    case 'staff.exception-work': {
      if (subjectType !== 'exception_work') return false;
      permission = 'order.manage';
      const work = await db.prepare(`SELECT kind FROM exception_work_items WHERE id=? LIMIT 1`)
        .bind(subjectId).first<{ kind: string }>();
      if (!work || (work.kind === 'incorrect_cash' &&
          !await currentStaffGrant(db, viewer, 'payout.prepare'))) return false;
      parentSql = `SELECT 1 FROM exception_work_items parent
        JOIN exception_work_events event ON event.work_id=parent.id
          AND event.id=? AND event.actor_id=?
          AND event.action IN ('created','assigned','updated','resolved')
        JOIN audit_logs audit ON audit.subject_type='order' AND audit.subject_id=parent.order_id
          AND audit.actor_id=event.actor_id AND audit.request_id=?
          AND audit.action='exception.'||event.action
        WHERE parent.id=? LIMIT 1`;
      values = [requestId, actorId, `${requestId}:audit`, subjectId];
      break;
    }
    case 'staff.invoice-adjustment':
      if (subjectType !== 'managed_invoice_adjustment') return false;
      permission = 'tax_policy.manage';
      parentSql = `SELECT 1 FROM managed_invoice_adjustments parent
        JOIN managed_invoice_groups invoice ON invoice.id=parent.invoice_group_id
        JOIN audit_logs audit ON audit.subject_type='managed_invoice_adjustment'
          AND audit.subject_id=parent.id AND audit.actor_id=parent.created_by
          AND audit.action='invoice.adjustment.issued' AND audit.request_id=?
        WHERE parent.id=? AND parent.request_id=? AND parent.created_by=? LIMIT 1`;
      values = [`${requestId}:audit`, subjectId, requestId, actorId];
      break;
    case 'staff.managed-maker-activation':
      if (subjectType !== 'seller') return false;
      permission = 'business_settings.approve'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM seller_profiles parent
        JOIN seller_participation_profiles participation ON participation.seller_id=parent.id
        JOIN audit_logs audit ON audit.subject_type='seller' AND audit.subject_id=parent.id
          AND audit.actor_id=? AND audit.request_id=?
          AND audit.action='managed_maker.simulation_activated'
        WHERE parent.id=? LIMIT 1`;
      values = [actorId, requestId, subjectId];
      break;
    case 'staff.managed-supply-decision':
      if (subjectType !== 'managed_supply') return false;
      permission = 'seller.application.review'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM managed_supply_records parent JOIN audit_logs audit
        ON audit.subject_type='managed_supply' AND audit.subject_id=parent.id
          AND audit.actor_id=? AND audit.request_id=?
          AND audit.action IN ('managed_supply.accept','managed_supply.reject','managed_supply.cancel')
          AND json_type(audit.next_json,'$.catalogDigest')='text'
        WHERE parent.id=? AND parent.decision_request_id=? AND parent.decided_by=? LIMIT 1`;
      values = [actorId, requestId, subjectId, requestId, actorId];
      break;
    case 'staff.managed-adjustment':
      if (subjectType !== 'managed_supply') return false;
      permission = 'refund.approve.high_value'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM managed_supply_records parent
        JOIN managed_supplier_adjustments adjustment ON adjustment.obligation_id=parent.id
          AND adjustment.request_id=? AND adjustment.created_by=?
        JOIN audit_logs audit ON audit.subject_type='managed_supply'
          AND audit.subject_id=parent.id AND audit.actor_id=?
          AND audit.request_id=? AND audit.action='managed_supply.adjusted'
          AND json_type(audit.next_json,'$.catalogDigest')='text'
        WHERE parent.id=? LIMIT 1`;
      values = [requestId, actorId, actorId, `${requestId}:audit`, subjectId];
      break;
    case 'staff.managed-payment-preparation':
      if (subjectType !== 'managed_supplier_payment') return false;
      permission = 'payout.prepare'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM managed_supplier_payments parent JOIN audit_logs audit
        ON audit.subject_type='managed_supplier_payment' AND audit.subject_id=parent.id
          AND audit.actor_id=? AND audit.request_id=?
          AND audit.action='managed_supplier_payment.prepared'
          AND json_type(audit.next_json,'$.catalogDigest')='text'
        WHERE parent.id=? AND parent.request_id=? AND parent.prepared_by=? LIMIT 1`;
      values = [actorId, requestId, subjectId, requestId, actorId];
      break;
    case 'staff.managed-payment-action':
      if (subjectType !== 'managed_supplier_payment') return false;
      permission = 'payout.approve'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM managed_supplier_payments parent JOIN audit_logs audit
        ON audit.subject_type='managed_supplier_payment' AND audit.subject_id=parent.id
          AND audit.actor_id=? AND audit.request_id=?
          AND ((audit.action='managed_supplier_payment.approved' AND parent.approved_by=?)
            OR (audit.action='managed_supplier_payment.paid' AND parent.paid_at IS NOT NULL))
          AND json_type(audit.next_json,'$.catalogDigest')='text'
        WHERE parent.id=? LIMIT 1`;
      values = [actorId, requestId, actorId, subjectId];
      break;
    case 'staff.managed-transition-decision':
      if (subjectType !== 'seller_route_transition') return false;
      permission = 'seller.application.review'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM seller_route_transition_applications parent JOIN audit_logs audit
        ON audit.subject_type='seller_route_transition' AND audit.subject_id=parent.id
          AND audit.actor_id=? AND audit.request_id=?
          AND audit.action IN ('seller_route_transition.scheduled','seller_route_transition.rejected',
            'seller_route_transition.changes_requested')
          AND json_type(audit.next_json,'$.catalogDigest')='text'
        WHERE parent.id=? AND parent.decision_request_id=? AND parent.reviewed_by=? LIMIT 1`;
      values = [actorId, requestId, subjectId, requestId, actorId];
      break;
    case 'staff.parcel-control':
      if (subjectType !== 'shipping_job') return false;
      permission = 'order.manage';
      parentSql = `SELECT 1 FROM shipping_jobs parent WHERE parent.id=? AND (
        EXISTS(SELECT 1 FROM parcel_operation_events event JOIN audit_logs audit
          ON audit.subject_type='order' AND audit.subject_id=parent.order_id
            AND audit.actor_id=event.actor_id AND audit.action='parcel.'||event.action
            AND audit.request_id=?
          WHERE event.shipping_job_id=parent.id AND event.id=? AND event.actor_id=?)
        OR EXISTS(SELECT 1 FROM order_cancellation_reviews review JOIN audit_logs audit
          ON audit.subject_type='order' AND audit.subject_id=review.order_id
            AND audit.actor_id=review.requested_by
            AND audit.action='cancellation.review_requested' AND audit.request_id=?
          WHERE review.id=? AND review.order_id=parent.order_id AND review.requested_by=?
            AND json_extract(audit.next_json,'$.jobId')=parent.id
            AND json_extract(json_extract(audit.next_json,'$.payload'),'$.jobId')=parent.id
            AND json_extract(json_extract(audit.next_json,'$.payload'),'$.requestId')=review.id
            AND json_extract(json_extract(audit.next_json,'$.payload'),'$.actorId')=review.requested_by
            AND json_extract(json_extract(audit.next_json,'$.payload'),'$.action')='cancel'
            AND json_type(json_extract(audit.next_json,'$.payload'),'$.formDigest')='text')
      ) LIMIT 1`;
      values = [subjectId, `${requestId}:audit`, requestId, actorId,
        `${requestId}:parcel-form`, requestId, actorId];
      break;
    case 'staff.delivery-rate':
      if (subjectType !== 'delivery_rate_version') return false;
      permission = 'admin.invite'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM delivery_rate_versions parent JOIN audit_logs audit
        ON audit.subject_type='delivery_rate_version' AND audit.subject_id=parent.id
          AND audit.actor_id=parent.created_by AND audit.action='delivery.rates.updated'
          AND audit.request_id=? WHERE parent.id=? AND parent.created_by=? LIMIT 1`;
      values = [`${requestId}:audit`, subjectId, actorId];
      break;
    case 'staff.referral-settings':
      if (subjectType !== 'referral_campaign' || subjectId !== 'default') return false;
      permission = 'admin.invite'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM referral_campaign parent JOIN audit_logs audit
        ON audit.subject_type='referral_campaign' AND audit.subject_id=parent.id
          AND audit.actor_id=? AND audit.action='referral.offer.updated'
          AND audit.request_id=? WHERE parent.id=? LIMIT 1`;
      values = [actorId, requestId, subjectId];
      break;
    case 'staff.staff-invitation':
      if (subjectType !== 'staff_invitation') return false;
      permission = 'admin.invite'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM staff_invitations parent JOIN audit_logs audit
        ON audit.subject_type='staff_invitation' AND audit.subject_id=parent.id
          AND audit.actor_id=parent.invited_by AND audit.action='staff.invitation.created'
          AND audit.request_id=? WHERE parent.id=? AND parent.invited_by=? LIMIT 1`;
      values = [requestId, subjectId, actorId];
      break;
    case 'staff.staff-permission-1':
    case 'staff.staff-permission-2':
      if (subjectType !== 'staff_permission_request') return false;
      permission = 'admin.permissions.manage'; superAdminOnly = true;
      parentSql = formId === 'staff.staff-permission-1'
        ? `SELECT 1 FROM staff_permission_requests parent JOIN users target ON target.id=parent.user_id
          JOIN audit_logs audit ON audit.subject_type='staff_permissions' AND audit.subject_id=parent.user_id
            AND audit.actor_id=parent.proposed_by AND audit.action='staff.permissions.proposed'
            AND audit.request_id=? AND json_extract(audit.next_json,'$.id')=parent.id
          WHERE parent.id=? AND parent.proposed_by=? AND parent.id=? LIMIT 1`
        : `SELECT 1 FROM staff_permission_requests parent JOIN users target ON target.id=parent.user_id
          JOIN audit_logs audit ON audit.subject_type='staff_permissions' AND audit.subject_id=parent.user_id
            AND audit.actor_id=parent.decided_by AND audit.request_id=?
            AND audit.action=CASE parent.status WHEN 'approved' THEN 'staff.permissions.approved'
              WHEN 'rejected' THEN 'staff.permissions.rejected' END
            AND json_extract(audit.next_json,'$.requestId')=parent.id
          WHERE parent.id=? AND parent.decided_by=? AND parent.decided_by<>parent.proposed_by LIMIT 1`;
      values = formId === 'staff.staff-permission-1' ? [requestId, subjectId, actorId, requestId] : [requestId, subjectId, actorId];
      break;
    case 'staff.payout-1':
    case 'staff.payout-2': {
      if (subjectType !== 'payout') return false;
      const event = await db.prepare(`SELECT action FROM payout_events WHERE payout_id=? AND request_id=? AND actor_id=? LIMIT 1`)
        .bind(subjectId, requestId, actorId).first<{ action: string }>();
      if (!event || (formId === 'staff.payout-1' ? event.action !== 'prepare'
        : !['approve', 'reject', 'start_processing', 'mark_paid', 'mark_failed'].includes(event.action))) return false;
      permission = formId === 'staff.payout-1' ? 'payout.prepare'
        : event.action === 'approve' || event.action === 'reject' ? 'payout.approve' : 'payout.mark_paid';
      superAdminOnly = formId === 'staff.payout-2';
      parentSql = `SELECT 1 FROM payouts parent JOIN seller_profiles seller ON seller.id=parent.seller_id
        JOIN payout_events event ON event.payout_id=parent.id AND event.request_id=? AND event.actor_id=?
        JOIN audit_logs audit ON audit.subject_type='payout' AND audit.subject_id=parent.id
          AND audit.request_id=event.request_id AND audit.actor_id=event.actor_id
          AND audit.action=? AND json_type(audit.next_json,'$.catalogDigest')='text'
        WHERE parent.id=? ${formId === 'staff.payout-1' ? 'AND parent.created_request_id=event.request_id AND parent.prepared_by=event.actor_id'
          : event.action === 'approve' || event.action === 'reject' ? 'AND parent.prepared_by<>event.actor_id' : ''} LIMIT 1`;
      values = [requestId, actorId, formId === 'staff.payout-1' ? 'payout.prepared' : `payout.${event.action}`, subjectId];
      break;
    }
    case 'staff.payout-request-action':
      if (subjectType !== 'payout_request') return false;
      permission = 'payout.prepare';
      parentSql = `SELECT 1 FROM payout_requests parent JOIN audit_logs audit
        ON audit.subject_type='payout_request' AND audit.subject_id=parent.id
          AND audit.request_id=? AND audit.actor_id=?
          AND audit.action IN ('payout.request.prepared','payout.request.rejected')
        WHERE parent.id=? AND parent.operation_request_id=? AND parent.processed_by=? LIMIT 1`;
      values = [requestId, actorId, subjectId, requestId, actorId];
      break;
    case 'staff.privacy-action':
      if (subjectType !== 'data_rights_request') return false;
      permission = 'support.manage';
      parentSql = `SELECT 1 FROM data_rights_requests parent
        JOIN data_rights_events event ON event.data_rights_request_id=parent.id
          AND event.operation_request_id=? AND event.actor_id=?
          AND event.actor_role IN ('admin','super_admin')
        JOIN audit_logs audit ON audit.subject_type='data_rights_request'
          AND audit.subject_id=parent.id AND audit.actor_id=event.actor_id
          AND audit.request_id=? AND audit.action='privacy.'||event.action
        WHERE parent.id=? LIMIT 1`;
      values = [requestId, actorId, `${requestId}:audit`, subjectId];
      break;
    case 'staff.rider-control-1':
      if (subjectType === 'rider') {
        permission = 'admin.invite'; superAdminOnly = true;
        parentSql = `SELECT 1 FROM rider_profiles parent JOIN audit_logs audit
          ON audit.subject_type='rider' AND audit.subject_id=parent.user_id
            AND audit.request_id=? AND audit.actor_id=?
            AND audit.action IN ('rider.review.configured','rider.open_box.configured')
          WHERE parent.user_id=? LIMIT 1`;
        values = [`staff.rider-control-1:${requestId}`, actorId, subjectId];
      } else if (subjectType === 'rider_report') {
        permission = 'order.manage';
        parentSql = `SELECT 1 FROM rider_reports parent WHERE parent.id=? AND
          ((EXISTS(SELECT 1 FROM audit_logs audit WHERE audit.subject_type='rider_report'
            AND audit.subject_id=parent.id AND audit.actor_id=?
            AND audit.request_id=? AND audit.action='rider.report.rejected.configured'))
          OR (parent.status='accepted' AND parent.reviewed_by=? AND EXISTS(
            SELECT 1 FROM parcel_operation_events event
            JOIN audit_logs audit ON audit.subject_type='order'
              AND audit.subject_id=event.order_id AND audit.actor_id=event.actor_id
              AND audit.action='parcel.'||event.action AND audit.request_id=?
            WHERE event.id=? AND event.actor_id=? AND event.shipping_job_id=parent.shipping_job_id
              AND event.action IN ('deliver','fail')
              AND json_extract(event.payload_json,'$.riderReportId')=parent.id))) LIMIT 1`;
        values = [subjectId, actorId, `staff.rider-control-1:${requestId}`, actorId,
          `${requestId}:audit`, requestId, actorId];
      } else return false;
      break;
    case 'staff.rider-control-2':
      if (subjectType !== 'rider_policy' || subjectId !== 'current') return false;
      permission = 'admin.invite'; superAdminOnly = true;
      parentSql = `SELECT 1 FROM rider_policy parent JOIN audit_logs audit
        ON audit.subject_type='rider_policy' AND audit.subject_id=parent.id
          AND audit.actor_id=? AND audit.request_id=? AND audit.action='rider.policy.configured'
        WHERE parent.id='current' LIMIT 1`;
      values = [actorId, `staff.rider-control-2:${requestId}`];
      break;
    case 'staff.governance-rule-create':
    case 'staff.governance-promotion-create':
    case 'staff.governance-incident-create':
    case 'staff.governance-incident-update':
    case 'staff.governance-backup-verify': {
      const governance = {
        'staff.governance-rule-create': { subject: 'prohibited_product_rule', table: 'prohibited_product_rules',
          action: 'rule.create', parent: 'parent.created_by=?', extras: [actorId] },
        'staff.governance-promotion-create': { subject: 'promotion', table: 'promotions',
          action: 'promotion.create', parent: 'parent.created_by=? AND parent.created_request_id=?', extras: [actorId, requestId] },
        'staff.governance-incident-create': { subject: 'operational_incident', table: 'operational_incidents',
          action: 'incident.create', parent: 'parent.owner_id=? AND parent.request_id=?', extras: [actorId, requestId] },
        'staff.governance-incident-update': { subject: 'operational_incident', table: 'operational_incidents',
          action: 'incident.update', parent: '1=1', extras: [] },
        'staff.governance-backup-verify': { subject: 'backup_verification', table: 'backup_verifications',
          action: 'backup.verify', parent: 'parent.verified_by=? AND parent.request_id=?', extras: [actorId, requestId] },
      }[formId];
      if (subjectType !== governance.subject) return false;
      permission = 'catalog.manage';
      superAdminOnly = formId === 'staff.governance-incident-create' ||
        formId === 'staff.governance-incident-update' || formId === 'staff.governance-backup-verify';
      parentSql = `SELECT 1 FROM ${governance.table} parent JOIN audit_logs audit
        ON audit.subject_type=? AND audit.subject_id=parent.id AND audit.action=?
          AND audit.actor_id=? AND audit.request_id=?
          AND json_type(audit.next_json,'$.catalogDigest')='text'
        WHERE parent.id=? AND ${governance.parent} LIMIT 1`;
      values = [subjectType, governance.action, actorId, requestId, subjectId, ...governance.extras];
      break;
    }
    default: return false;
  }
  if (superAdminOnly && viewer.role !== 'super_admin') return false;
  if (!await currentStaffGrant(db, viewer, permission)) return false;
  return Boolean(await db.prepare(parentSql).bind(...values).first());
}

export async function authorizeFormAnswerRead(
  db: D1Database,
  viewer: FormAnswerViewer,
  answerSet: AnswerLink,
): Promise<boolean> {
  if (!viewer.id || !['customer', 'seller', 'rider', 'admin', 'super_admin'].includes(viewer.role)) return false;
  const identity = await db.prepare(`SELECT 1 AS valid FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.id=? AND u.status='active' AND r.role=? LIMIT 1`)
    .bind(viewer.id, viewer.role).first<{ valid: number }>();
  if (!identity) return false;
  if (answerSet.formId === 'commerce.order-cancellation') {
    const parent = await cancellationAnswerOrder(db, answerSet);
    if (!parent) return false;
    if (viewer.role === 'customer') return parent.customerId === viewer.id && answerSet.actorId === viewer.id;
    return currentStaffGrant(db, viewer, 'order.manage');
  }
  if (answerSet.formId.startsWith('identity.')) {
    if (['identity.register', 'identity.login-password', 'identity.email-code-verify',
      'identity.password-reset-complete'].includes(answerSet.formId))
      return answerSet.subjectType === 'user' && answerSet.subjectId === viewer.id &&
        answerSet.actorId === viewer.id;
    if (['identity.email-code-request', 'identity.password-reset-request'].includes(answerSet.formId))
      return viewer.role === 'super_admin' && answerSet.subjectType === 'identity_request' &&
        answerSet.actorId === null && answerSet.subjectId === answerSet.requestId;
    return false;
  }
  if (answerSet.formId === 'seller.case-return-response' ||
      answerSet.formId === 'seller.case-complaint-response') {
    const isReturn = answerSet.formId === 'seller.case-return-response';
    if (answerSet.subjectType !== (isReturn ? 'return_request' : 'complaint')) return false;
    const parent = isReturn
      ? await db.prepare(`SELECT s.user_id AS sellerUserId FROM return_request_events e
          JOIN return_requests r ON r.id=e.return_request_id
          JOIN order_items i ON i.id=r.order_item_id
          JOIN seller_profiles s ON s.id=i.seller_id
          WHERE e.return_request_id=? AND e.request_id=? AND e.actor_id=?
            AND e.action='seller_responded' AND s.status='approved' LIMIT 1`)
          .bind(answerSet.subjectId, answerSet.requestId, answerSet.actorId)
          .first<{ sellerUserId: string }>()
      : await db.prepare(`SELECT s.user_id AS sellerUserId FROM complaint_events e
          JOIN complaints c ON c.id=e.complaint_id
          JOIN seller_profiles s ON s.id=c.seller_id
          WHERE e.complaint_id=? AND e.request_id=? AND e.actor_id=?
            AND e.action='seller_responded' AND s.status='approved' LIMIT 1`)
          .bind(answerSet.subjectId, answerSet.requestId, answerSet.actorId)
          .first<{ sellerUserId: string }>();
    if (!parent || parent.sellerUserId !== answerSet.actorId) return false;
    if (viewer.role === 'seller') return viewer.id === parent.sellerUserId;
    return currentStaffGrant(db, viewer, isReturn ? 'refund.approve.standard' : 'support.manage');
  }
  if (answerSet.formId === 'commerce.checkout') {
    if (answerSet.subjectType !== 'order' || viewer.role !== 'customer' ||
        answerSet.actorId !== viewer.id) return false;
    return Boolean(await db.prepare(`SELECT 1 AS valid FROM orders o
      JOIN payments p ON p.order_id=o.id AND p.idempotency_key=?
      WHERE o.id=? AND o.customer_id=? LIMIT 1`)
      .bind(answerSet.requestId, answerSet.subjectId, viewer.id).first());
  }
  if (answerSet.formId === 'commerce.return-request' || answerSet.formId === 'commerce.complaint') {
    const isReturn = answerSet.formId === 'commerce.return-request';
    if (answerSet.subjectType !== (isReturn ? 'return_request' : 'complaint')) return false;
    const parent = isReturn
      ? await db.prepare(`SELECT o.customer_id AS customerId FROM return_requests r
          JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id
          WHERE r.id=? AND r.created_request_id=? LIMIT 1`)
          .bind(answerSet.subjectId, answerSet.requestId).first<{ customerId: string | null }>()
      : await db.prepare(`SELECT o.customer_id AS customerId FROM complaints c
          JOIN orders o ON o.id=c.order_id
          WHERE c.id=? AND c.created_request_id=? LIMIT 1`)
          .bind(answerSet.subjectId, answerSet.requestId).first<{ customerId: string | null }>();
    if (!parent) return false;
    if (viewer.role === 'customer')
      return parent.customerId === viewer.id && answerSet.actorId === viewer.id;
    return currentStaffGrant(db, viewer, isReturn ? 'refund.approve.standard' : 'support.manage');
  }
  if (answerSet.formId === 'commerce.gift-card-issue') {
    if (answerSet.subjectType !== 'gift_card_issue' || viewer.id !== answerSet.actorId) return false;
    const parent = await db.prepare(`SELECT 1 AS valid FROM gift_cards WHERE id=?
      AND issuance_request_id=? AND issued_by=? LIMIT 1`)
      .bind(answerSet.subjectId, answerSet.requestId, viewer.id).first();
    return Boolean(parent) && currentStaffGrant(db, viewer, 'admin.invite');
  }
  if (answerSet.formId === 'commerce.gift-card-redeem') {
    if (answerSet.subjectType !== 'gift_card_redemption' || viewer.role !== 'customer' ||
        viewer.id !== answerSet.actorId) return false;
    return Boolean(await db.prepare(`SELECT 1 AS valid FROM gift_cards WHERE id=?
      AND redemption_request_id=? AND redeemed_by=? LIMIT 1`)
      .bind(answerSet.subjectId, answerSet.requestId, viewer.id).first());
  }
  const expectedSubject = riderShippingSubjects.get(answerSet.formId);
  if (expectedSubject && answerSet.subjectType !== expectedSubject) return false;
  if (answerSet.formId === 'staff.delivery-assignment') {
    const parent = await db.prepare(`SELECT 1 AS valid FROM orders o JOIN audit_logs audit
      ON audit.subject_type='order' AND audit.subject_id=o.id
        AND audit.actor_id=? AND audit.action='delivery.assigned.configured'
        AND audit.request_id=?
      WHERE o.id=? LIMIT 1`)
      .bind(answerSet.actorId, `delivery.assignment:${answerSet.requestId}`, answerSet.subjectId)
      .first<{ valid: number }>();
    return Boolean(parent) && currentStaffGrant(db, viewer, 'order.manage');
  }
  if (answerSet.formId === 'shipping.console-action-staff') {
    const parent = await db.prepare(`SELECT 1 AS valid FROM shipping_job_events event
      JOIN shipping_jobs job ON job.id=event.shipping_job_id
      WHERE event.id=? AND event.request_id=? AND event.actor_id=?
        AND event.actor_role IN ('admin','super_admin') LIMIT 1`)
      .bind(answerSet.subjectId, answerSet.requestId, answerSet.actorId)
      .first<{ valid: number }>();
    return Boolean(parent) && currentStaffGrant(db, viewer, 'order.manage');
  }
  const programmatic = await programmaticStaffGrant(db, viewer, answerSet);
  if (programmatic !== null) return programmatic;
  const staffAction = await staffActionGrant(db, viewer, answerSet);
  if (staffAction !== null) return staffAction;
  // Staff-authored answers need an explicit form-specific policy. Parent
  // ownership alone never grants customers the staff decision context.
  if (answerSet.formId.startsWith('staff.')) return false;
  if (answerSet.subjectType === 'feedback_submission') {
    if (viewer.role !== 'admin' && viewer.role !== 'super_admin') return false;
    const safePermissions = `CASE WHEN json_valid(p.permissions_json) THEN p.permissions_json ELSE '[]' END`;
    return Boolean(await db.prepare(`SELECT 1 AS valid FROM users u
      JOIN user_roles r ON r.user_id=u.id
      LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
      JOIN feedback_delivery_jobs job ON job.id=? AND job.form_id=? AND job.request_id=?
        AND job.status IN ('pending','leased','sending','failed','sent')
      JOIN form_answer_sets answer ON answer.id=? AND answer.subject_type='feedback_submission'
        AND answer.subject_id=job.id AND answer.form_id=job.form_id
        AND answer.request_id=job.request_id
      WHERE u.id=? AND u.status='active' AND r.role=?
        AND (r.role='super_admin' OR p.user_id IS NULL OR (
          json_type(${safePermissions})='array'
          AND EXISTS(SELECT 1 FROM json_each(${safePermissions}) grant_item
            WHERE grant_item.type='text' AND grant_item.value='support.manage')
          AND NOT EXISTS(SELECT 1 FROM json_each(${safePermissions}) grant_item
            WHERE grant_item.type<>'text' OR grant_item.value NOT IN
              (SELECT value FROM json_each(?)))))
      LIMIT 1`)
      .bind(answerSet.subjectId, answerSet.formId, answerSet.requestId, answerSet.id,
        viewer.id, viewer.role, JSON.stringify(configurableAdminPermissions)).first<{ valid: number }>());
  }
  const ownerId = await formAnswerOwnerId(db, answerSet);
  if (!ownerId) return false;
  if (ownerId === viewer.id) return true;
  if (answerSet.formId === 'rider.application')
    return currentStaffGrant(db, viewer, null);
  if (answerSet.formId === 'rider.report' || answerSet.formId === 'rider.code-verify')
    return currentStaffGrant(db, viewer, 'order.manage');
  if (answerSet.formId === 'rider.remittance')
    return currentStaffGrant(db, viewer, 'payout.prepare');
  if (viewer.role !== 'admin' && viewer.role !== 'super_admin') return false;
  if (answerSet.subjectType === 'product_review') {
    const safeReviewPermissions = `CASE WHEN json_valid(p.permissions_json) THEN p.permissions_json ELSE '[]' END`;
    return Boolean(await db.prepare(`SELECT 1 AS valid FROM users u
      JOIN user_roles r ON r.user_id=u.id
      LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
      JOIN product_reviews review ON review.id=? AND review.customer_id=?
      WHERE u.id=? AND u.status='active' AND r.role=?
        AND (r.role='super_admin' OR p.user_id IS NULL OR (
          json_type(${safeReviewPermissions})='array'
          AND EXISTS(SELECT 1 FROM json_each(${safeReviewPermissions}) grant_item
            WHERE grant_item.type='text' AND grant_item.value='product.review')
          AND NOT EXISTS(SELECT 1 FROM json_each(${safeReviewPermissions}) grant_item
            WHERE grant_item.type<>'text' OR grant_item.value NOT IN
              (SELECT value FROM json_each(?)))))
      LIMIT 1`)
      .bind(answerSet.subjectId, ownerId, viewer.id, viewer.role,
        JSON.stringify(configurableAdminPermissions)).first<{ valid: number }>());
  }
  // Staff support authority is limited to a currently assigned case for
  // this exact owner. Other seller/rider records need their own adapter.
  if (answerSet.subjectType !== 'user' && answerSet.subjectType !== 'data_rights_request') return false;
  // One final statement checks active identity, the current persisted grant,
  // and assignment together. Missing Admin profiles retain legacy access;
  // malformed or non-allowlisted profiles fail closed.
  const safePermissions = `CASE WHEN json_valid(p.permissions_json) THEN p.permissions_json ELSE '[]' END`;
  const caseFilter = answerSet.subjectType === 'data_rights_request'
    ? 'd.id=? AND d.customer_id=?'
    : 'd.customer_id=?';
  const caseBindings = answerSet.subjectType === 'data_rights_request'
    ? [answerSet.subjectId, ownerId]
    : [ownerId];
  return Boolean(await db.prepare(`SELECT 1 AS valid FROM users u
    JOIN user_roles r ON r.user_id=u.id
    LEFT JOIN staff_permission_profiles p ON p.user_id=u.id
    WHERE u.id=? AND u.status='active' AND r.role=?
      AND (r.role='super_admin' OR p.user_id IS NULL OR (
        json_type(${safePermissions})='array'
        AND EXISTS(SELECT 1 FROM json_each(${safePermissions}) grant_item
          WHERE grant_item.type='text' AND grant_item.value='support.manage')
        AND NOT EXISTS(SELECT 1 FROM json_each(${safePermissions}) grant_item
          WHERE grant_item.type<>'text' OR grant_item.value NOT IN
            (SELECT value FROM json_each(?)))))
      AND EXISTS(SELECT 1 FROM data_rights_requests d
        WHERE ${caseFilter} AND d.assigned_to=u.id
          AND d.status IN ('assigned','needs_information','approved'))
    LIMIT 1`)
    .bind(viewer.id, viewer.role, JSON.stringify(configurableAdminPermissions), ...caseBindings)
    .first<{ valid: number }>());
}
