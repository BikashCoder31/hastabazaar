import { isRiderPortalEnabled } from '../riders/availability';
import { companyDetails } from '../content/company-details';
import { riderNotificationSourceSql } from './rider-notification-access';
import {
  can,
  configurableAdminPermissions,
  validateAdminPermissions,
  permissions as knownPermissions,
  type Permission,
} from '../marketplace/permissions';
import { hasStaffPermissionBySubject } from '../db/repositories/staff-permissions';
import type { OrderMailService } from '../email/order-updates';
import {
  emailRetryDelayMs,
  maximumEmailAttempts,
} from '../email/retry-policy';
import {
  notificationDestination,
  type NotificationAudience,
} from './notification-links';
export interface BusinessEvent {
  eventId: string;
  sourceType: 'seller_application' | 'product';
  sourceId: string;
  status: string;
  reviewRequestId?: string;
  actorId?: string;
  now: number;
  kind: 'submitted' | 'result';
}
const statuses = new Set([
  'submitted',
  'approved',
  'published',
  'needs_changes',
  'rejected',
  'under_review',
  'approved_for_activation',
]);
/** Only explicit source transitions opt in; order email templates are deliberately excluded. */
export async function businessNotificationStatements(
  db: D1Database,
  event: BusinessEvent,
): Promise<D1PreparedStatement[]> {
  if (
    !event.eventId ||
    event.eventId.length > 200 ||
    !event.sourceId ||
    !statuses.has(event.status)
  )
    throw new Error('Invalid business notification event.');
  const table = event.sourceType === 'product' ? 'products' : 'seller_profiles';
  const permission: Permission =
    event.sourceType === 'product'
      ? 'product.review'
      : 'seller.application.review';
  const participationOutcome = event.sourceType === 'seller_application' && event.status === 'approved_for_activation';
  const sourcePredicate = participationOutcome
    ? 'EXISTS(SELECT 1 FROM seller_profiles source_seller INNER JOIN seller_participation_profiles source_participation ON source_participation.seller_id=source_seller.id WHERE source_seller.id=? AND source_participation.application_stage=?' +
      (event.reviewRequestId ? ' AND source_seller.review_request_id=?' : '') + ')'
    : 'EXISTS(SELECT 1 FROM ' +
      table +
      ' WHERE id=? AND status=?' +
      (event.reviewRequestId ? ' AND review_request_id=?' : '') +
      ')';
  const sourceValues = [
    event.sourceId,
    event.status,
    ...(event.reviewRequestId ? [event.reviewRequestId] : []),
  ];
  const ownerSelect =
    event.sourceType === 'product'
      ? 'SELECT s.user_id FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?'
      : 'SELECT user_id FROM seller_profiles WHERE id=?';
  const eventKey = 'business.' + event.sourceType + '.' + event.kind;
  const label =
    event.sourceType === 'product' ? 'Product' : 'Seller application';
  const outcome = event.status.replaceAll('_', ' ');
  const statements: D1PreparedStatement[] = [];
  async function add(
    recipientSql: string,
    recipientValues: unknown[],
    audience: 'customer' | 'seller' | 'staff',
    recipientKey: string,
    required: Permission | null,
    subject: string,
    body: string,
    extraPredicate = '1=1',
    extraValues: unknown[] = [],
  ) {
    const bytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify([eventKey, event.eventId, recipientKey, audience]),
      ),
    );
    const digest = Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    for (const channel of ['in_app', 'email'])
      statements.push(
        db
          .prepare(
            'INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission) ' +
              "SELECT ?,u.id,?,?,?,?,?,?,?,?,?,'queued',?,?,?,? FROM users u WHERE u.status='active' AND u.id IN (" +
              recipientSql +
              ') AND ' +
              sourcePredicate +
              ' AND ' +
              extraPredicate,
          )
          .bind(
            crypto.randomUUID(),
            audience,
            channel,
            eventKey,
            subject,
            subject,
            body,
            body,
            event.sourceType,
            event.sourceId,
            'business:' + digest + ':' + channel,
            event.now,
            eventKey,
            required,
            ...recipientValues,
            ...sourceValues,
            ...extraValues,
          ),
      );
  }
  await add(
    ownerSelect,
    [event.sourceId],
    event.sourceType === 'product' ? 'seller' : 'customer',
    'owner',
    null,
    label + ' ' + outcome,
    event.kind === 'submitted'
      ? label +
          ' submitted. We will notify you when review requires your attention.'
      : label +
          ' update recorded: ' +
          outcome +
          '. Sign in to review the outcome and any next action.',
  );
  if (event.kind === 'submitted') {
    const candidates = await db
      .prepare(
        "SELECT DISTINCT u.id,r.role FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END",
      )
      .all<{ id: string; role: 'admin' | 'super_admin' }>();
    const visited = new Set<string>();
    for (const candidate of candidates.results) {
      if (visited.has(candidate.id) || candidate.id === event.actorId) continue;
      visited.add(candidate.id);
      const snapshot = await db
        .prepare(
          'SELECT permissions_json AS json FROM staff_permission_profiles WHERE user_id=?',
        )
        .bind(candidate.id)
        .first<{ json: string }>();
      let selected: readonly Permission[] = configurableAdminPermissions;
      if (snapshot) {
        try {
          selected = validateAdminPermissions(JSON.parse(snapshot.json));
        } catch {
          selected = [];
        }
      }
      if (!can({ role: candidate.role, permissions: selected }, permission))
        continue;
      const profileGuard =
        candidate.role === 'super_admin'
          ? '1=1'
          : snapshot
            ? 'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=? AND permissions_json=?)'
            : 'NOT EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=?)';
      const profileValues =
        candidate.role === 'super_admin'
          ? []
          : snapshot
            ? [candidate.id, snapshot.json]
            : [candidate.id];
      await add(
        'SELECT ?',
        [candidate.id],
        'staff',
        candidate.id,
        permission,
        label + ' review needed',
        'A ' +
          label.toLowerCase() +
          ' has been submitted. Review the authorized record and record your decision.',
        'EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role=?) AND u.id NOT IN (' +
          ownerSelect +
          ') AND ' +
          profileGuard,
        [candidate.role, event.sourceId, ...profileValues],
      );
    }
  }
  return statements;
}
interface BusinessEmailData {
  template?: string;
  guestOrderId?: string | null;
  orderNumber?: string | null;
  productStatus?: string | null;
  email: string;
  subject: string;
  body: string;
  audience: string;
  relatedType: string | null;
  relatedId: string | null;
}
function validateBusinessOrigin(origin: string): URL {
  const base = new URL(origin);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  )
    throw new Error('A trusted HTTPS application origin is required.');
  return base;
}
export function buildBusinessEmail(data: BusinessEmailData, origin: string) {
  const base = validateBusinessOrigin(origin);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  )
    throw new Error('A trusted HTTPS application origin is required.');
  if (
    /[\r\n]/.test(data.email + data.subject) ||
    !/^[-a-zA-Z0-9.!#$%&'*+/=?^_`{|}~]+@[^\s<>@]+\.[^\s<>@]+$/.test(data.email)
  )
    throw new Error('Invalid email recipient.');
  const deliveryAuthorization = data.template === 'delivery.authorization';
  const destination = deliveryAuthorization
    ? '/help'
    : data.guestOrderId &&
    data.orderNumber &&
    /^[A-Za-z0-9_-]{1,160}$/.test(data.orderNumber)
      ? '/track?order=' + encodeURIComponent(data.orderNumber)
      : notificationDestination(
          data.audience as NotificationAudience,
          data.audience,
          data.relatedType,
          data.relatedId,
          { orderNumber: data.orderNumber, productStatus: data.productStatus },
        );
  if (!destination) throw new Error('Authorized destination unavailable.');
  const link = new URL(destination, base);
  if (link.origin !== base.origin) throw new Error('Invalid destination.');
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]!,
    );
  const instructions = deliveryAuthorization
    ? 'This single-use code authorizes only this parcel handover. It does not provide account, invoice, or order-history access. Contact the purchaser or support if the delivery details are wrong.'
    : data.relatedType?.startsWith('account_status_')
    ? 'Contact support if you have questions about this account update. Opening the support page does not change your account.'
    : data.guestOrderId
      ? 'Use the checkout email to track your order. To review or respond to the case, open your order receipt in the original checkout browser. Contact support if that receipt is unavailable.'
      : 'Sign in to open this record. Opening the link does not approve or change anything.';
  const text = [
    data.subject,
    data.body,
    instructions,
    link.toString(),
    `Need help? ${companyDetails.supportEmail}`,
  ].join('\n\n');
  return {
    to: data.email,
    subject: 'Hastabazaar · ' + data.subject,
    text,
    html:
      '<!doctype html><html><body><h1>' +
      escape(data.subject) +
      '</h1><p>' +
      escape(data.body) +
      '</p><p>' +
      escape(instructions) +
      '</p><p><a href="' +
      escape(link.toString()) +
      '">Open record</a></p><p>Need help? ' +
      escape(companyDetails.supportEmail) +
      '</p></body></html>',
  };
}
const supportedTemplates = [
  'delivery.authorization',
  'business.cancellation.updated',
  'business.rider.update',
  'business.seller_application.submitted',
  'business.seller_application.result',
  'business.product.submitted',
  'business.product.result',
  'business.payout.requested',
  'business.payout.prepared',
  'business.payout.result',
  'business.payout.request.result',
  'business.permissions.proposed',
  'business.permissions.changed',
  'business.delivery.rates.changed',
  'business.exception.assigned',
  'business.return_request.update',
  'business.complaint.update',
  'business.permissions.rejected',
  'business.order.pickup_ready',
  'business.promotion.proposed',
  'business.promotion.result',
  'business.incident.updated',
  'business.account.status',
  'business.seller.restriction',
];
/** Inject the existing EMAIL transport. Tests supply a fake. No implicit sends or cron activation. */
export async function deliverBusinessEmails(
  db: D1Database,
  mail: OrderMailService,
  origin: string,
  options: { limit?: number; now?: number } = {},
) {
  validateBusinessOrigin(origin);
  const clock = () => options.now ?? Date.now();
  const now = clock();
  const limit = Math.max(1, Math.min(options.limit ?? 6, 20));
  const allowed = supportedTemplates.map(() => '?').join(',');
  const jobs = await db
    .prepare(
      "SELECT id FROM notification_messages WHERE channel='email' AND business_event_key=template_key AND template_key IN (" +
        allowed +
        ") AND status IN ('queued','failed') AND delivery_attempts<? AND delivery_next_attempt_at<=? AND delivery_lease_until<=? ORDER BY CASE WHEN template_key='delivery.authorization' THEN 0 ELSE 1 END,created_at,id LIMIT ?",
    )
    .bind(...supportedTemplates, maximumEmailAttempts, now, now, limit)
    .all<{ id: string }>();
  let accepted = 0,
    failed = 0,
    cancelled = 0;
  for (const job of jobs.results) {
    const token = crypto.randomUUID();
    let attemptNumber = 1;
    const claimed = await db
      .prepare(
        "UPDATE notification_messages SET delivery_claim_token=?,delivery_lease_until=?,delivery_attempts=delivery_attempts+1 WHERE id=? AND channel='email' AND business_event_key=template_key AND template_key IN (" +
          allowed +
          ") AND status IN ('queued','failed') AND delivery_attempts<? AND delivery_next_attempt_at<=? AND delivery_lease_until<=?",
      )
      .bind(
        token,
        clock() + 15 * 60000,
        job.id,
        ...supportedTemplates,
        maximumEmailAttempts,
        clock(),
        clock(),
      )
      .run();
    if (!claimed.meta.changes) continue;
    try {
      const row = await db
        .prepare(
          'SELECT n.recipient_user_id AS userId,u.auth_subject AS authSubject,u.status AS userStatus,COALESCE(u.email,n.guest_email) AS email,n.guest_order_id AS guestOrderId,n.subject_en AS subject,n.body_en AS body,n.audience_role AS audience,n.related_type AS relatedType,n.related_id AS relatedId,n.required_permission AS requiredPermission,n.template_key AS template,n.request_id AS requestId,n.delivery_attempts AS attempts FROM notification_messages n LEFT JOIN users u ON u.id=n.recipient_user_id WHERE n.id=? AND n.delivery_claim_token=?',
        )
        .bind(job.id, token)
        .first<
          BusinessEmailData & {
            userId: string;
            template: string;
            authSubject: string | null;
            userStatus: string;
            requiredPermission: Permission | null;
            requestId: string;
            attempts: number;
          }
        >();
      let authorized = !!row && row.userStatus === 'active';
      attemptNumber = row?.attempts ?? attemptNumber;
      if (row?.template === 'business.account.status')
        authorized =
          row.userId === row.relatedId &&
          row.relatedType === 'account_status_' + row.userStatus &&
          ['active', 'disabled'].includes(row.userStatus);
      if (
        row?.template === 'delivery.authorization' &&
        row.guestOrderId &&
        row.audience === 'customer'
      ) {
        const order = await db
          .prepare(
            row.userId
              ? 'SELECT order_number AS orderNumber FROM orders WHERE id=? AND customer_id=?'
              : 'SELECT order_number AS orderNumber FROM orders WHERE id=? AND recipient_email=?',
          )
          .bind(row.guestOrderId, row.userId ?? row.email)
          .first<{ orderNumber: string }>();
        authorized = isRiderPortalEnabled() && !!order;
        row.orderNumber = order?.orderNumber;
        const match = /^delivery-otp:([^:]+):(\d+)$/.exec(row.requestId);
        const expiresAt = Number(match?.[2] ?? 0);
        authorized =
          authorized &&
          !!match &&
          Number.isSafeInteger(expiresAt) &&
          expiresAt > clock() &&
          !!(await db
            .prepare(
              'SELECT 1 FROM rider_otp_challenges c JOIN shipping_jobs j ON j.id=c.shipping_job_id JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE c.shipping_job_id=? AND j.order_id=? AND c.expires_at=? AND c.expires_at>? AND c.consumed_at IS NULL AND p.rider_user_id=c.rider_user_id AND p.version=c.assignment_version',
            )
            .bind(match[1], row.guestOrderId, expiresAt, clock())
            .first());
      }
      if (
        row &&
        row.guestOrderId &&
        !row.userId &&
        row.audience === 'customer' &&
        row.template !== 'delivery.authorization'
      ) {
        const order = await db
          .prepare(
            'SELECT order_number AS orderNumber FROM orders WHERE id=? AND customer_id IS NULL AND customer_email=?',
          )
          .bind(row.guestOrderId, row.email)
          .first<{ orderNumber: string }>();
        authorized = !!order;
        row.orderNumber = order?.orderNumber;
      }
      if (
        row &&
        authorized &&
        (row.relatedType === 'return_request' ||
          row.relatedType === 'complaint')
      ) {
        const ret = row.relatedType === 'return_request';
        const source = await db
          .prepare(
            'SELECT o.id AS orderId,o.customer_id AS customerId,o.order_number AS orderNumber,s.user_id AS sellerUserId,c.status,' +
              (ret
                ? 'c.reviewed_by'
                : 'COALESCE(c.escalated_to,c.assigned_to)') +
              ' AS assignee FROM ' +
              (ret ? 'return_requests' : 'complaints') +
              ' c ' +
              (ret
                ? 'JOIN order_items i ON i.id=c.order_item_id JOIN orders o ON o.id=i.order_id LEFT JOIN seller_profiles s ON s.id=i.seller_id'
                : 'JOIN orders o ON o.id=c.order_id LEFT JOIN seller_profiles s ON s.id=c.seller_id') +
              ' WHERE c.id=?',
          )
          .bind(row.relatedId)
          .first<{
            orderId: string;
            customerId: string | null;
            orderNumber: string;
            sellerUserId: string | null;
            status: string;
            assignee: string | null;
          }>();
        authorized =
          !!source &&
          (row.audience === 'staff'
            ? !['resolved', 'closed', 'rejected'].includes(source.status) &&
              (!source.assignee || source.assignee === row.userId)
            : row.audience === 'seller'
              ? source.sellerUserId === row.userId
              : row.guestOrderId
                ? source.orderId === row.guestOrderId && !source.customerId
                : source.customerId === row.userId);
        row.orderNumber = source?.orderNumber;
        if (
          source &&
          row.audience === 'staff' &&
          row.requiredPermission === 'refund.approve.high_value'
        )
          authorized = !!(await db
            .prepare(
              "SELECT 1 FROM refunds WHERE return_request_id=? AND status='pending_high_value_approval' AND ? IS NOT NULL",
            )
            .bind(row.relatedId, row.userId)
            .first());
      }
      if (
        row &&
        authorized &&
        ['rider_profile', 'rider_report', 'rider_assignment'].includes(
          row.relatedType ?? '',
        )
      )
        authorized = !!(await db
          .prepare(
            'SELECT 1 FROM notification_messages n WHERE n.id=? AND ' +
              riderNotificationSourceSql(),
          )
          .bind(job.id)
          .first());
      if (row && authorized && row.audience === 'staff')
        authorized =
          !!row.authSubject &&
          !!row.requiredPermission &&
          knownPermissions.includes(row.requiredPermission) &&
          (await hasStaffPermissionBySubject(
            db,
            row.authSubject,
            row.requiredPermission,
          ));
      if (row && authorized && row.audience === 'staff') {
        if (
          row.relatedType === 'product' ||
          row.relatedType === 'seller_application'
        ) {
          const table =
            row.relatedType === 'product' ? 'products' : 'seller_profiles';
          authorized = !!(await db
            .prepare(
              'SELECT 1 FROM ' + table + " WHERE id=? AND status='submitted'",
            )
            .bind(row.relatedId)
            .first());
        } else if (row.relatedType === 'exception_work') {
          authorized =
            !!row.authSubject &&
            (await hasStaffPermissionBySubject(
              db,
              row.authSubject,
              'order.manage',
            )) &&
            !!(await db
              .prepare(
                "SELECT 1 FROM exception_work_items WHERE id=? AND owner_id=? AND status='open'",
              )
              .bind(row.relatedId, row.userId)
              .first());
        } else if (
          row.relatedType === 'payout' &&
          (row.requiredPermission === 'payout.approve' ||
            row.requiredPermission === 'payout.mark_paid')
        ) {
          const states =
            row.requiredPermission === 'payout.approve'
              ? "('prepared','scheduled')"
              : "('approved','failed')";
          authorized = !!(await db
            .prepare('SELECT 1 FROM payouts WHERE id=? AND status IN ' + states)
            .bind(row.relatedId)
            .first());
        } else if (row.relatedType === 'payout_request') {
          authorized = !!(await db
            .prepare(
              "SELECT 1 FROM payout_requests WHERE id=? AND status='submitted'",
            )
            .bind(row.relatedId)
            .first());
        } else if (row.relatedType === 'promotion') {
          authorized = !!(await db
            .prepare(
              row.template === 'business.promotion.proposed'
                ? "SELECT 1 FROM promotions WHERE id=? AND status='pending_approval' AND EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin')"
                : "SELECT 1 FROM promotions WHERE id=? AND created_by=? AND status IN ('active','rejected')",
            )
            .bind(row.relatedId, row.userId)
            .first());
        } else if (row.relatedType === 'operational_incident') {
          authorized = !!(await db
            .prepare(
              'SELECT 1 FROM operational_incidents WHERE id=? AND owner_id=?',
            )
            .bind(row.relatedId, row.userId)
            .first());
        } else if (row.relatedType === 'order' && row.template === 'business.order.pickup_ready') {
          authorized = !!(await db
            .prepare(
              "SELECT 1 FROM order_items WHERE order_id=? AND fulfillment_status='ready_for_pickup'",
            )
            .bind(row.relatedId)
            .first());
        } else if (row.relatedType === 'staff_permission_request') {
          authorized = !!(await db
            .prepare(
              row.template === 'business.permissions.rejected'
                ? "SELECT 1 FROM staff_permission_requests WHERE id=? AND proposed_by=? AND status='rejected'"
                : "SELECT 1 FROM staff_permission_requests WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin')",
            )
            .bind(row.relatedId, row.userId)
            .first());
        } else if (row.relatedType === 'staff_permission')
          authorized = row.relatedId === row.userId;
      }
      if (
        row &&
        authorized &&
        row.audience !== 'staff' &&
        row.relatedType !== 'return_request' &&
        row.relatedType !== 'complaint' &&
        row.template !== 'business.account.status' && row.template !== 'business.cancellation.updated' && row.template !== 'delivery.authorization' &&
        !['rider_profile', 'rider_report', 'rider_assignment'].includes(
          row.relatedType ?? '',
        )
      ) {
        const ownerSql =
          row.relatedType === 'product'
            ? 'SELECT s.user_id AS id FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?'
            : row.relatedType === 'payout' ||
                row.relatedType === 'payout_request'
              ? 'SELECT s.user_id AS id FROM ' +
                (row.relatedType === 'payout' ? 'payouts' : 'payout_requests') +
                ' p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?'
              : 'SELECT user_id AS id FROM seller_profiles WHERE id=?';
        const owner = await db
          .prepare(ownerSql)
          .bind(row.relatedId)
          .first<{ id: string }>();
        authorized = owner?.id === row.userId;
      }
      if(row&&authorized&&row.template==='business.cancellation.updated'){const current=await db.prepare('SELECT customer_id AS customerId,customer_email AS email,order_number AS number FROM orders WHERE id=?').bind(row.relatedId).first<{customerId:string|null;email:string;number:string}>();authorized=!!current&&((row.audience==='staff'&&!!await db.prepare("SELECT 1 FROM order_cancellation_reviews WHERE order_id=? AND status='pending'").bind(row.relatedId).first())||(row.audience==='customer'?(row.userId?current.customerId===row.userId:!current.customerId&&current.email===row.email):!!await db.prepare('SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=? AND s.user_id=?').bind(row.relatedId,row.userId).first()));row.orderNumber=current?.number;}
      if (!row || !authorized) {
        const cancellationReason =
          row?.template === 'delivery.authorization'
            ? 'expired_or_obsolete_otp'
            : 'obsolete_or_access_changed';
        await db
          .prepare(
            'UPDATE notification_messages SET status=\'cancelled\',failure_reason=?,delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND delivery_claim_token=?',
          )
          .bind(cancellationReason, job.id, token)
          .run();
        cancelled++;
        continue;
      }
      await mail.send(buildBusinessEmail(row, origin));
      await db
        .prepare(
          "UPDATE notification_messages SET status='sent',sent_at=?,failure_reason=NULL,delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND delivery_claim_token=?",
        )
        .bind(clock(), job.id, token)
        .run();
      accepted++;
    } catch {
      // SMTP cannot atomically commit with the database; a crash after acceptance may require retry.
      await db
        .prepare(
          "UPDATE notification_messages SET status='failed',failure_reason='delivery_failed',delivery_next_attempt_at=?,delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND delivery_claim_token=?",
        )
        .bind(
          clock() + emailRetryDelayMs(attemptNumber),
          job.id,
          token,
        )
        .run();
      failed++;
    }
  }
  return { accepted, failed, cancelled };
}
export async function businessEmailQueue(db: D1Database, now = Date.now()) {
  const allowed = supportedTemplates.map(() => '?').join(',');
  const rows = await db
    .prepare(
      "SELECT id,subject_en AS subject,audience_role AS audience,status,delivery_attempts AS attempts,delivery_lease_until AS leaseUntil,delivery_next_attempt_at AS nextAt,failure_reason AS failure,created_at AS createdAt FROM notification_messages WHERE channel='email' AND business_event_key=template_key AND template_key IN (" +
        allowed +
        ') ORDER BY created_at DESC LIMIT 100',
    )
    .bind(...supportedTemplates)
    .all<{
      id: string;
      subject: string;
      audience: string;
      status: string;
      attempts: number;
      leaseUntil: number;
      nextAt: number;
      failure: string | null;
      createdAt: number;
    }>();
  return rows.results.map((row) => ({
    ...row,
    displayStatus:
      row.status === 'sent'
        ? 'Mail server accepted'
        : row.status === 'cancelled'
          ? row.failure === 'expired_or_obsolete_otp'
            ? 'Expired or obsolete delivery code suppressed'
            : 'Obsolete or unauthorized message suppressed'
          : row.attempts >= maximumEmailAttempts && row.leaseUntil <= now
            ? 'Needs staff review'
            : row.leaseUntil > now
              ? 'Sending'
              : row.nextAt > now
                ? 'Retry waiting'
                : 'Queued',
  }));
}

export async function businessEmailQueueSummary(
  db: D1Database,
  now = Date.now(),
) {
  const allowed = supportedTemplates.map(() => '?').join(',');
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS pending,COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failures,COALESCE(SUM(CASE WHEN status='failed' AND delivery_attempts>=? THEN 1 ELSE 0 END),0) AS exhausted,COALESCE(SUM(CASE WHEN delivery_lease_until>? THEN 1 ELSE 0 END),0) AS activeLeases,COALESCE(SUM(CASE WHEN status IN ('queued','failed') AND delivery_attempts<? AND delivery_next_attempt_at<=? AND delivery_lease_until<=? THEN 1 ELSE 0 END),0) AS due,MIN(created_at) AS oldestAt FROM notification_messages WHERE channel='email' AND business_event_key=template_key AND template_key IN (" +
        allowed +
        ") AND status IN ('queued','failed')",
    )
    .bind(
      maximumEmailAttempts,
      now,
      maximumEmailAttempts,
      now,
      now,
      ...supportedTemplates,
    )
    .first<{
      pending: number;
      failures: number;
      exhausted: number;
      activeLeases: number;
      due: number;
      oldestAt: number | null;
    }>();
  return Object.freeze({
    pending: Number(row?.pending ?? 0),
    failures: Number(row?.failures ?? 0),
    exhausted: Number(row?.exhausted ?? 0),
    activeLeases: Number(row?.activeLeases ?? 0),
    due: Number(row?.due ?? 0),
    oldestAgeMinutes:
      row?.oldestAt == null
        ? 0
        : Math.max(0, Math.floor((now - row.oldestAt) / 60_000)),
  });
}
export interface OperationalBusinessEvent {
  kind:
    | 'payout.requested'
    | 'payout.prepared'
    | 'payout.result'
    | 'payout.request.result'
    | 'permissions.proposed'
    | 'permissions.changed'
    | 'permissions.rejected'
    | 'order.pickup_ready'
    | 'promotion.proposed'
    | 'promotion.result'
    | 'incident.updated'
    | 'account.status'
    | 'delivery.rates.changed'
    | 'exception.assigned';
  sourceId: string;
  eventId: string;
  actorId: string;
  now: number;
  status?: string;
}
/** Explicit operational event matrix; callers append these statements after the source event in its transaction. */
export async function operationalBusinessNotificationStatements(
  db: D1Database,
  e: OperationalBusinessEvent,
): Promise<D1PreparedStatement[]> {
  let guard: string,
    guardValues: unknown[],
    ownerSql: string | null = null,
    ownerValues: unknown[] = [],
    audience: 'staff' | 'seller' | 'customer' = 'staff',
    required: Permission | null = null,
    relatedType: string,
    subject: string;
  let staffPermission: Permission | null = null;
  if (e.kind === 'payout.requested' || e.kind === 'payout.request.result') {
    relatedType = 'payout_request';
    subject =
      e.kind === 'payout.requested'
        ? 'Payout request received'
        : 'Payout request update recorded';
    const column =
      e.kind === 'payout.requested'
        ? 'created_request_id'
        : 'operation_request_id';
    guard =
      'EXISTS(SELECT 1 FROM payout_requests WHERE id=? AND ' + column + '=?)';
    guardValues = [e.sourceId, e.eventId];
    ownerSql =
      'SELECT s.user_id FROM payout_requests p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?';
    ownerValues = [e.sourceId];
    audience = 'seller';
    if (e.kind === 'payout.requested') staffPermission = 'payout.prepare';
  } else if (e.kind === 'payout.prepared' || e.kind === 'payout.result') {
    relatedType = 'payout';
    subject =
      e.kind === 'payout.prepared'
        ? e.status === 'approved' ? 'Payout approved; payment recording is available' : 'Payout prepared for Super Admin approval'
        : 'Payout update recorded: ' +
          (e.status ?? 'review available').replaceAll('_', ' ');
    const column =
      e.kind === 'payout.prepared'
        ? 'created_request_id'
        : 'operation_request_id';
    guard = 'EXISTS(SELECT 1 FROM payouts WHERE id=? AND ' + column + '=?)';
    guardValues = [e.sourceId, e.eventId];
    ownerSql =
      'SELECT s.user_id FROM payouts p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?';
    ownerValues = [e.sourceId];
    audience = 'seller';
    if (e.kind === 'payout.prepared') staffPermission = e.status==='approved'?'payout.mark_paid':'payout.approve';
    else if (e.status === 'approved' || e.status === 'failed')
      staffPermission = 'payout.mark_paid';
  } else if (e.kind === 'promotion.proposed' || e.kind === 'promotion.result') {
    relatedType = 'promotion';
    subject =
      e.kind === 'promotion.proposed'
        ? 'Super Admin promotion approval needed'
        : 'Your promotion proposal has a decision';
    guard =
      'EXISTS(SELECT 1 FROM promotions WHERE id=? AND ' +
      (e.kind === 'promotion.proposed'
        ? 'created_request_id'
        : 'operation_request_id') +
      '=?)';
    guardValues = [e.sourceId, e.eventId];
    if (e.kind === 'promotion.proposed') staffPermission = 'admin.invite';
    else {
      ownerSql = 'SELECT created_by FROM promotions WHERE id=?';
      ownerValues = [e.sourceId];
      required = 'catalog.manage';
    }
  } else if (e.kind === 'incident.updated') {
    relatedType = 'operational_incident';
    subject = 'Your operational incident has an update';
    guard =
      "EXISTS(SELECT 1 FROM audit_logs WHERE subject_id=? AND request_id=? AND action='incident.update')";
    guardValues = [e.sourceId, e.eventId];
    ownerSql =
      'SELECT owner_id FROM operational_incidents WHERE id=? AND owner_id<>?';
    ownerValues = [e.sourceId, e.actorId];
    required = 'admin.invite';
  } else if (e.kind === 'account.status') {
    if (e.status !== 'active' && e.status !== 'disabled')
      throw new Error('Invalid account status event.');
    relatedType = 'account_status_' + e.status;
    subject = 'Your account is now ' + e.status;
    guard =
      "EXISTS(SELECT 1 FROM users WHERE id=? AND status=?) AND EXISTS(SELECT 1 FROM audit_logs WHERE subject_id=? AND request_id=? AND action='user.status')";
    guardValues = [e.sourceId, e.status, e.sourceId, e.eventId];
    ownerSql = 'SELECT ?';
    ownerValues = [e.sourceId];
    audience = 'customer';
  } else if (e.kind === 'permissions.proposed') {
    relatedType = 'staff_permission_request';
    subject = 'Super Admin permission approval needed';
    guard =
      "EXISTS(SELECT 1 FROM staff_permission_requests WHERE id=? AND status='pending')";
    guardValues = [e.sourceId];
    staffPermission = 'admin.permissions.manage';
  } else if (e.kind === 'permissions.rejected') {
    relatedType = 'staff_permission_request';
    subject = 'Your permission change proposal was rejected';
    guard =
      "EXISTS(SELECT 1 FROM staff_permission_requests WHERE id=? AND status='rejected')";
    guardValues = [e.sourceId];
    ownerSql = 'SELECT proposed_by FROM staff_permission_requests WHERE id=?';
    ownerValues = [e.sourceId];
    required = 'admin.permissions.manage';
  } else if (e.kind === 'order.pickup_ready') {
    relatedType = 'order';
    subject = 'Seller items are ready for pickup';
    guard =
      "EXISTS(SELECT 1 FROM order_items WHERE order_id=? AND fulfillment_request_id=? AND fulfillment_status='ready_for_pickup')";
    guardValues = [e.sourceId, e.eventId];
    staffPermission = 'order.manage';
  } else if (e.kind === 'permissions.changed') {
    relatedType = 'staff_permission';
    subject = 'Your Admin permissions changed';
    guard =
      'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=? AND last_request_id=?)';
    guardValues = [e.sourceId, e.eventId];
    ownerSql = 'SELECT ?';
    ownerValues = [e.sourceId];
    required = 'account.self.manage';
  } else if (e.kind === 'delivery.rates.changed') {
    relatedType = 'delivery_rate_version';
    subject = 'Delivery rates updated for future orders';
    guard = 'EXISTS(SELECT 1 FROM delivery_rate_versions WHERE id=?)';
    guardValues = [e.sourceId];
    staffPermission = 'order.manage';
  } else {
    relatedType = 'exception_work';
    subject = 'Exception follow-up assigned to you';
    guard =
      'EXISTS(SELECT 1 FROM exception_work_events v JOIN exception_work_items w ON w.id=v.work_id WHERE v.id=? AND v.work_id=? AND w.kind=?)';
    guardValues = [e.eventId, e.sourceId, e.status ?? ''];
    ownerSql =
      "SELECT owner_id FROM exception_work_items WHERE id=? AND status='open'";
    ownerValues = [e.sourceId];
    required =
      e.status === 'incorrect_cash' ? 'payout.prepare' : 'order.manage';
  }
  const template = 'business.' + e.kind;
  const body =
    e.kind === 'account.status'
      ? 'Your account status was updated. Contact support@hastabazaar.com if you need help. '
      : 'A business update requires your attention. Sign in to review the authorized record and its current next action.';
  const result: D1PreparedStatement[] = [];
  async function insert(
    select: string,
    values: unknown[],
    role: 'staff' | 'seller' | 'customer',
    permission: Permission | null,
    key: string,
    extra = '1=1',
    extraValues: unknown[] = [],
  ) {
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify([template, e.eventId, key])),
    );
    const digest = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    for (const channel of e.kind === 'account.status' && e.status === 'disabled'
      ? ['email']
      : ['in_app', 'email'])
      result.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission) SELECT ?,u.id,?,?,?,?,?,?,?,?,?,'queued',?,?,?,? FROM users u WHERE " +
              (e.kind === 'account.status'
                ? "u.status IN ('active','disabled')"
                : "u.status='active'") +
              ' AND u.id IN (' +
              select +
              ') AND ' +
              guard +
              ' AND ' +
              extra,
          )
          .bind(
            crypto.randomUUID(),
            role,
            channel,
            template,
            subject,
            subject,
            body,
            body,
            relatedType,
            e.sourceId,
            'business:' + digest + ':' + channel,
            e.now,
            template,
            permission,
            ...values,
            ...guardValues,
            ...extraValues,
          ),
      );
  }
  if (ownerSql)
    await insert(ownerSql, ownerValues, audience, required, 'owner');
  if (staffPermission) {
    const rows = await db
      .prepare(
        "SELECT DISTINCT u.id,r.role,p.permissions_json AS json FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END",
      )
      .all<{
        id: string;
        role: 'admin' | 'super_admin';
        json: string | null;
      }>();
    const seen = new Set<string>();
    for (const row of rows.results) {
      if (seen.has(row.id) || (row.id === e.actorId && !['payout.prepared', 'permissions.proposed', 'promotion.proposed'].includes(e.kind))) continue;
      seen.add(row.id);
      let selected: readonly Permission[] = configurableAdminPermissions;
      if (row.json !== null) {
        try {
          selected = validateAdminPermissions(JSON.parse(row.json));
        } catch {
          selected = [];
        }
      }
      if (!can({ role: row.role, permissions: selected }, staffPermission))
        continue;
      const profileGuard =
        row.role === 'super_admin'
          ? '1=1'
          : row.json !== null
            ? 'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=u.id AND permissions_json=?)'
            : 'NOT EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=u.id)';
      const extra =
        'EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role=?) AND ' +
        profileGuard +
        (ownerSql ? ' AND u.id NOT IN (' + ownerSql + ')' : '');
      await insert(
        'SELECT ?',
        [row.id],
        'staff',
        staffPermission,
        row.id,
        extra,
        [
          row.role,
          ...(row.role !== 'super_admin' && row.json !== null
            ? [row.json]
            : []),
          ...(ownerSql ? ownerValues : []),
        ],
      );
    }
  }
  return result;
}

export interface CaseBusinessEvent {
  sourceType: 'return_request' | 'complaint';
  sourceId: string;
  eventId: string;
  actorId?: string | null;
  action: string;
  now: number;
}
/** Source marker gates every recipient row inside the caller's mutation transaction. */
export async function caseBusinessNotificationStatements(
  db: D1Database,
  e: CaseBusinessEvent,
): Promise<D1PreparedStatement[]> {
  const isReturn = e.sourceType === 'return_request';
  const table = isReturn ? 'return_requests' : 'complaints';
  const join = isReturn
    ? 'JOIN order_items i ON i.id=c.order_item_id JOIN orders o ON o.id=i.order_id'
    : 'JOIN orders o ON o.id=c.order_id';
  const seller = isReturn ? 'i.seller_id' : 'c.seller_id';
  const assignee = isReturn
    ? 'c.reviewed_by'
    : 'COALESCE(c.escalated_to,c.assigned_to)';
  const guard = `EXISTS(SELECT 1 FROM ${table} WHERE id=? AND operation_request_id=?)`;
  const template = 'business.' + e.sourceType + '.update';
  const subject =
    (isReturn ? 'Return request' : 'Complaint') + ' update available';
  const body =
    'An update was recorded for your case. Open the authorized record to review its status and any requested next action.';
  const result: D1PreparedStatement[] = [];
  const digest = async (key: string) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify([template, e.eventId, key])),
        ),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
  async function add(
    select: string,
    values: unknown[],
    audience: 'customer' | 'seller' | 'staff',
    permission: Permission | null,
    key: string,
    extra = '1=1',
    extraValues: unknown[] = [],
  ) {
    const hash = await digest(key);
    for (const channel of ['in_app', 'email'])
      result.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission) SELECT ?,u.id,?,?,?,?,?,?,?,?,?,'queued',?,?,?,? FROM users u WHERE u.status='active' AND u.id IN (${select}) AND ${guard} AND ${extra}`,
          )
          .bind(
            crypto.randomUUID(),
            audience,
            channel,
            template,
            subject,
            subject,
            body,
            body,
            e.sourceType,
            e.sourceId,
            'business:' + hash + ':' + channel,
            e.now,
            template,
            permission,
            ...values,
            e.sourceId,
            e.eventId,
            ...extraValues,
          ),
      );
  }
  // Customer replies already receive immediate UI acknowledgement; notify the people who must act.
  if (e.action !== 'customer_response') {
    await add(
      `SELECT o.customer_id FROM ${table} c ${join} WHERE c.id=?`,
      [e.sourceId],
      'customer',
      null,
      'customer',
    );
    const hash = await digest('guest');
    result.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,guest_email,guest_order_id) SELECT ?,NULL,'customer','email',?,?,?,?,?,?,?,'queued',?,?,?,o.customer_email,o.id FROM ${table} c ${join} WHERE c.id=? AND o.customer_id IS NULL AND o.customer_email IS NOT NULL AND ${guard}`,
        )
        .bind(
          crypto.randomUUID(),
          template,
          subject,
          subject,
          body,
          body,
          e.sourceType,
          e.sourceId,
          'business:' + hash + ':email',
          e.now,
          template,
          e.sourceId,
          e.sourceId,
          e.eventId,
        ),
    );
  }
  if (e.action !== 'seller_response' && e.action !== 'customer_response')
    await add(
      `SELECT s.user_id FROM ${table} c ${join} JOIN seller_profiles s ON s.id=${seller} WHERE c.id=?`,
      [e.sourceId],
      'seller',
      null,
      'seller',
    );
  const rows = await db
    .prepare(
      "SELECT DISTINCT u.id,r.role,p.permissions_json AS json FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END",
    )
    .all<{ id: string; role: 'admin' | 'super_admin'; json: string | null }>();
  const seen = new Set<string>();
  for (const row of rows.results) {
    if (seen.has(row.id) || (row.id === e.actorId && !(isReturn && row.role === 'super_admin'))) continue;
    seen.add(row.id);
    if (isReturn && row.role === 'super_admin')
      await add(
        'SELECT ?',
        [row.id],
        'staff',
        'refund.approve.high_value',
        'high-value:' + row.id,
        "EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='super_admin') AND EXISTS(SELECT 1 FROM refunds WHERE return_request_id=? AND status='pending_high_value_approval')",
        [e.sourceId],
      );

    let selected: readonly Permission[] = configurableAdminPermissions;
    if (row.json !== null) {
      try {
        selected = validateAdminPermissions(JSON.parse(row.json));
      } catch {
        selected = [];
      }
    }
    const permission: Permission = 'support.manage';
    if (!can({ role: row.role, permissions: selected }, permission)) continue;
    const profile =
      row.role === 'super_admin'
        ? '1=1'
        : row.json !== null
          ? 'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=u.id AND permissions_json=?)'
          : 'NOT EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=u.id)';
    // Assigned cases go to that person; unassigned open cases enter the permitted support queue.
    const actionable = `EXISTS(SELECT 1 FROM ${table} c WHERE c.id=? AND c.status NOT IN ('resolved','closed','rejected','pending_high_value_approval') AND (${assignee}=u.id OR ${assignee} IS NULL))`;
    await add(
      'SELECT ?',
      [row.id],
      'staff',
      permission,
      row.id,
      `EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role=?) AND ${profile} AND ${actionable}`,
      [
        row.role,
        ...(row.role !== 'super_admin' && row.json !== null ? [row.json] : []),
        e.sourceId,
      ],
    );
  }
  return result;
}
