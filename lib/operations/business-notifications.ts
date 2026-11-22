import { isRiderPortalEnabled } from '../riders/availability';
import { sellerNotificationEmail } from '../sellers/registration-email';
import { payoutFixDocumentNames, type ApplicationDocumentProblem } from '../sellers/payout-fixes';
import {independentProductStaffSql,independentProductIntakeStaffSql} from '../products/party-scope';
import {emailApplicationOrigin} from '../email/origin';
import { catalogNotificationRequestId, isCurrentCatalogNotice, operationalNotificationChannels, hasOperationalNoticeSource, isCurrentOperationalNotice, isCurrentCaseNotice } from './event-catalog';
import { businessEmailLayout, type BusinessEmailData } from '../email/business-message';
import { addBusinessEmailDetails } from '../email/business-message-details';
import { marketplaceSubject, renderMarketplaceEmail } from '../email/message-layout';
import { courierBookedTemplate, missedDeliveryTemplate } from './courier-email-notices';
import { riderNotificationSourceSql } from './rider-notification-access';
import {
  can,
  defaultAdminPermissions,
  validateAdminPermissions,
  permissions as knownPermissions,
  type Permission,
} from '../marketplace/permissions';
import { hasStaffPermissionBySubject } from '../db/repositories/staff-permissions';
import type { OrderMailService } from '../email/order-updates';
import { accountedDeliveryAttemptsSql, deliverDurably, eligibleDeliverySql, fenceLegacyDeliveryGap, fenceLegacyDeliveryQueue, readDeliveryStatus, recordUnstartedDeliveryAttempt, recoverDeliveryReceipts, validMailRecipient } from '../email/delivery-attempts';
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
  registrationIntake?: boolean;
  registeredApproval?: boolean;
  payoutFixes?: ReadonlyArray<Pick<ApplicationDocumentProblem, 'kind' | 'note'>>;
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
  const registrationApproval = event.registrationIntake && event.kind === 'result' &&
    event.sourceType === 'seller_application' && (event.status === 'approved' || participationOutcome);
  const registeredApproval = event.registeredApproval && event.kind === 'result'
    && event.sourceType === 'seller_application' && event.status === 'approved';
  const fixes = event.payoutFixes ?? [];
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
    copy?: { subjectNe: string; bodyNe: string; relatedType: string },
  ) {
    for (const channel of operationalNotificationChannels)
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
            copy?.subjectNe ?? subject,
            body,
            copy?.bodyNe ?? body,
            copy?.relatedType ?? event.sourceType,
            event.sourceId,
            await catalogNotificationRequestId(eventKey, event.eventId, recipientKey, audience, channel),
            event.now,
            eventKey,
            required,
            ...recipientValues,
            ...sourceValues,
            ...extraValues,
          ),
      );
  }
  if (registeredApproval) {
    const subject = fixes.length
      ? `Your shop is approved · ${fixes.length} ${fixes.length === 1 ? 'thing' : 'things'} to fix before your first payout`
      : 'Your shop is approved';
    const body = fixes.length
      ? ['You can start adding products now. Please fix these items before your first payout.',
        ...fixes.map(fix => `${payoutFixDocumentNames[fix.kind].en}: ${fix.note}`)].join('\n')
      : 'Your shop is approved. Add your first product to go live.';
    const bodyNe = fixes.length
      ? ['अब उत्पादनहरू थप्न सक्नुहुन्छ। पहिलो भुक्तानीअघि यी कागजातहरू सच्याउनुहोस्।',
        ...fixes.map(fix => `${payoutFixDocumentNames[fix.kind].ne}: ${fix.note}`)].join('\n')
      : 'तपाईंको पसल स्वीकृत भएको छ। पसल सुरु गर्न पहिलो उत्पादन थप्नुहोस्।';
    await add(ownerSelect, [event.sourceId], 'seller', 'owner', null, subject, body, '1=1', [], {
      subjectNe: fixes.length ? `तपाईंको पसल स्वीकृत भयो · पहिलो भुक्तानीअघि ${fixes.length} कागजात सच्याउनुहोस्` : 'तपाईंको पसल स्वीकृत भयो',
      bodyNe, relatedType: fixes.length ? 'seller_registered_payout_fixes' : 'seller_registered_application',
    });
  } else await add(
    ownerSelect,
    [event.sourceId],
    event.sourceType === 'product' ? 'seller' : 'customer',
    'owner',
    null,
    label + ' ' + outcome,
    registrationApproval
      ? (participationOutcome ? 'Your Managed Maker application was approved for activation.' : 'Your seller application was approved.') +
        ' You can submit products for review. Each listing requires separate approval before publication. From Application progress, open Registration & documents to check and complete any outstanding details. Use Finance to check bank and payout requirements.'
      : event.kind === 'submitted'
      ? label +
          ' submitted. We will notify you when review requires your attention.'
      : label +
          ' update recorded: ' +
          outcome +
          '. Sign in to review the outcome and any next action.',
  );
  {
    const candidates = await db
      .prepare(
        "SELECT DISTINCT u.id,r.role FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END",
      )
      .all<{ id: string; role: 'admin' | 'super_admin' }>();
    const visited = new Set<string>();
    for (const candidate of candidates.results) {
      if (visited.has(candidate.id)) continue;
      visited.add(candidate.id);
      if (candidate.role !== 'super_admin' && (event.kind !== 'submitted' || candidate.id === event.actorId)) continue;
      const snapshot = await db
        .prepare(
          'SELECT permissions_json AS json FROM staff_permission_profiles WHERE user_id=?',
        )
        .bind(candidate.id)
        .first<{ json: string }>();
      let selected: readonly Permission[] = defaultAdminPermissions;
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
        event.kind === 'result' ? 'admin.invite' : permission,
        event.kind === 'submitted' ? label + ' review needed' : label + ' ' + outcome,
        event.kind === 'submitted' ? 'A ' +
          label.toLowerCase() +
          ' has been submitted. Review the authorized record and record your decision.' :
          label + ' update recorded: ' + outcome + '. Open the authorized record for the saved outcome.',
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
export function buildBusinessEmail(data: BusinessEmailData, origin: string,options:{transport?:'provider'|'capture';isolatedCaptureOrigin?:string}={}) {
  const base = emailApplicationOrigin(origin,options.transport,options.isolatedCaptureOrigin);
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
          { orderNumber: data.orderNumber, productStatus: data.productStatus, requiredPermission:data.requiredPermission },
        );
  if (!destination) throw new Error('Authorized destination unavailable.');
  const link = new URL(destination, base);
  if (link.origin !== base.origin) throw new Error('Invalid destination.');
  const layout = businessEmailLayout(data, link);
  return {
    to: data.email,
    subject: marketplaceSubject(layout.subject, data.orderNumber ?? data.reference),
    ...renderMarketplaceEmail(layout),
  };
}
const supportedTemplates = [
  'business.gift.issued','business.gift.redeemed',
  'business.programme.updated',
  'business.finance.refund',
  'business.finance.fee_refund_authorized',
  'business.finance.invoice_adjustment',
  'business.finance.funding_verified',
  'business.finance.payout',
  'business.seller.live_clearance',
  'business.company.live_financial_scope',
  'business.workflow.reminder',
    'business.workflow.assignment',
  'business.system.email_health',
  'business.system.incident',
  'business.team.governance',
  'business.team.handoff',
  'business.product.discount_suggestion',
  'business.product.intake',
  'business.product.availability',
  'business.product.priority',
  'business.seller.document.change',
  'business.seller.document.review',
  'business.seller.protected_change',
  'business.seller.public_profile',
  'business.seller.profile_correction',
  'business.seller.support_contact',
  'business.seller.live_activation',
  'business.seller.recovery',
  'business.seller.recovery.claim',
  'business.category.policy',
  'business.company.account',
  'business.payment.order',
  'business.payment.reminder',
  'business.payment.exception',
  'business.payment.return_loss',
  'business.payment.return_satisfied',
  'business.order.response',
  'business.order.preparation_update',
  courierBookedTemplate,
  missedDeliveryTemplate,
  'business.fee.policy',
  'business.fee.terms',
  'business.fee.followup',
  'business.fee.holds',
  'delivery.authorization',
  'business.cancellation.updated',
  'business.rider.update',
  'business.seller_application.submitted',
  'business.seller_application.result',
  'business.seller.payout_fix_ready',
  'business.product.submitted',
  'business.product.result',
  'business.payout.requested',
  'business.payout.prepared',
  'business.payout.result',
  'business.payout.request.result',
  'business.permissions.proposed',
  'business.permissions.changed',
  'business.form.compatibility.changed',
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
  options: { limit?: number; now?: number; deadlineMs?:number; deliveryTransport?:'capture'|'provider' } = {},
) {
  if(options.deliveryTransport!==undefined&&!['capture','provider'].includes(options.deliveryTransport))throw new Error('Use the actual configured email transport.');
  const isolatedCaptureOrigin = mail.transport === 'capture'
    ? await mail.readIsolatedCaptureOrigin?.()
    : undefined;
  emailApplicationOrigin(origin,mail.transport,isolatedCaptureOrigin);
  await recoverDeliveryReceipts(db,'business');
  const clock = () => options.now ?? Date.now();
  const now = clock();
  await fenceLegacyDeliveryQueue(db,'business',now);
  const limit = Math.max(1, Math.min(options.limit ?? 6, 20));
  const allowed = supportedTemplates.map(() => '?').join(',');
  const jobs = await db
    .prepare(
      "SELECT id,delivery_attempts AS attempts FROM notification_messages WHERE channel='email' AND business_event_key=template_key AND template_key IN (" +
        allowed +
        ") AND status IN ('queued','failed') AND " + eligibleDeliverySql('business','notification_messages.id') + " AND "+accountedDeliveryAttemptsSql('business','notification_messages.id','notification_messages.delivery_attempts')+" AND delivery_attempts<? AND delivery_next_attempt_at<=? AND delivery_lease_until<=? ORDER BY CASE WHEN template_key='delivery.authorization' THEN 0 ELSE 1 END,delivery_next_attempt_at,created_at,id LIMIT ?",
    )
    .bind(...supportedTemplates, maximumEmailAttempts, now, now, limit)
    .all<{ id: string; attempts:number }>();
  let accepted = 0,
    failed = 0,
    cancelled = 0;
  for (const job of jobs.results) {
    if(options.deadlineMs!==undefined&&Date.now()>=options.deadlineMs)break;
    if(await fenceLegacyDeliveryGap(db,'business',job.id,job.attempts,clock(),true))continue;
    const token = crypto.randomUUID();
    let attemptNumber = job.attempts+1;
    let feeRoutineClaimed = false;
    const claimed = await db
      .prepare(
        "UPDATE notification_messages SET delivery_claim_token=?,delivery_lease_until=?,delivery_attempts=delivery_attempts+1 WHERE id=? AND channel='email' AND business_event_key=template_key AND template_key IN (" +
          allowed +
          ") AND status IN ('queued','failed') AND " + eligibleDeliverySql('business','notification_messages.id') + " AND " +accountedDeliveryAttemptsSql('business','notification_messages.id','notification_messages.delivery_attempts')+" AND delivery_attempts<? AND delivery_next_attempt_at<=? AND delivery_lease_until<=?",
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
      let rejectedTemplate: string | undefined;
      const loadCurrent = async () => {
      const row = await db
        .prepare(
          `SELECT n.recipient_user_id AS userId,u.auth_subject AS authSubject,u.status AS userStatus,COALESCE(u.email,n.guest_email) AS email,
          (SELECT i.answers_json FROM seller_registration_intakes i WHERE i.user_id=n.recipient_user_id
            AND (n.audience_role='seller' OR (n.audience_role='customer' AND n.related_type='seller_application'))) AS sellerEmailAnswers,
          n.guest_order_id AS guestOrderId,n.subject_en AS subject,n.subject_ne AS subjectNe,n.body_en AS body,n.body_ne AS bodyNe,n.audience_role AS audience,n.related_type AS relatedType,n.related_id AS relatedId,
          n.required_permission AS requiredPermission,n.template_key AS template,n.request_id AS requestId,n.delivery_attempts AS attempts
          FROM notification_messages n LEFT JOIN users u ON u.id=n.recipient_user_id WHERE n.id=? AND n.delivery_claim_token=? AND n.delivery_lease_until>?`,
        )
        .bind(job.id, token, clock())
        .first<
          BusinessEmailData & {
            userId: string;
            template: string;
            authSubject: string | null;
            userStatus: string;
            requiredPermission: Permission | null;
            requestId: string;
            attempts: number;
            sellerEmailAnswers: string | null;
          }
        >();
      if (row) row.email = sellerNotificationEmail(row.email, row.sellerEmailAnswers) ?? '';
      let authorized = !!row && row.userStatus === 'active';
      attemptNumber = row?.attempts ?? attemptNumber;
      if (row?.template === 'business.account.status' && row.audience !== 'staff')
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
            ? ['admin.invite', 'refund.approve.high_value'].includes(row.requiredPermission ?? '') || (!['resolved', 'closed', 'rejected'].includes(source.status) &&
              (!source.assignee || source.assignee === row.userId))
            : row.audience === 'seller'
              ? source.sellerUserId === row.userId
              : row.guestOrderId
                ? source.orderId === row.guestOrderId && !source.customerId
                : source.customerId === row.userId);
        row.orderNumber = source?.orderNumber;
        row.currentStatus = source?.status;
        if (authorized) authorized = await isCurrentCaseNotice(db, { ...row, channel: 'email' });
        if (
          source &&
          row.audience === 'staff' &&
          row.requiredPermission === 'refund.approve.high_value'
        )
          authorized = authorized && !!(await db
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
      if (row && authorized)
        authorized = await isCurrentOperationalNotice(db, { ...row, channel: 'email' },clock());
      if (row && authorized && row.audience === 'staff' && !(row.requiredPermission === 'admin.invite' && hasOperationalNoticeSource(row.template))) {
        if (
          row.relatedType === 'product' ||
          row.relatedType === 'seller_application'
        ) {
          authorized = await isCurrentCatalogNotice(db, { ...row, channel: 'email' });
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
      if (row && authorized && row.audience !== 'staff')
        authorized = await isCurrentCatalogNotice(db, { ...row, channel: 'email' });
      if (
        row &&
        authorized &&
        row.audience !== 'staff' &&
        !hasOperationalNoticeSource(row.template) &&
        row.relatedType !== 'return_request' &&
        row.relatedType !== 'complaint' &&
        row.template !== 'business.account.status' && row.template !== 'business.cancellation.updated' && row.template !== 'delivery.authorization' &&
        !['rider_profile', 'rider_report', 'rider_assignment'].includes(
          row.relatedType ?? '',
        )
      ) {
        const ownerSql =
          row.relatedType === 'receipt_return_bank_satisfaction'
            ? 'SELECT satisfaction.customer_id AS id FROM receipt_return_bank_satisfactions satisfaction JOIN seller_recovery_receipt_reversal_reviews review ON review.id=satisfaction.review_id WHERE satisfaction.id=? AND review.state=\'completed\''
          : row.relatedType === 'receipt_return_bank_loss'
            ? 'SELECT original.customer_id AS id FROM receipt_return_bank_losses loss JOIN refund_obligations original ON original.id=loss.obligation_id JOIN seller_recovery_receipt_reversal_reviews review ON review.id=loss.review_id WHERE loss.id=? AND review.state=\'completed\''
          : row.relatedType === 'seller_recovery_claim'
            ? 'SELECT q.submitted_by AS id FROM seller_recovery_repayment_claims q JOIN seller_recovery_cases c ON c.id=q.case_id JOIN seller_profiles s ON s.id=c.seller_id WHERE q.id=? AND s.user_id=q.submitted_by'
          : row.relatedType === 'seller_recovery'
            ? 'SELECT s.user_id AS id FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?'
          : row.relatedType === 'product'
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
      if(row&&authorized&&row.template==='business.cancellation.updated'){authorized=await(await import('../cancellation/notifications')).currentCancellationNotice(db,row);const current=await db.prepare('SELECT order_number AS number FROM orders WHERE id=?').bind(row.relatedId).first<{number:string}>();row.orderNumber=current?.number;}
        rejectedTemplate=row?.template;
        return authorized ? row : null;
      };
      const row = await loadCurrent();
      if (!row) {
        await recordUnstartedDeliveryAttempt(db,{queueKind:'business',queueId:job.id,claimToken:token,attemptNumber,now:clock(),cancelled:true});
        const cancellationReason =
          rejectedTemplate === 'delivery.authorization'
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
      if(row.template==='business.fee.terms'&&row.audience==='seller'){
        const gate=await(await import('../commission/terms-followup')).claimFeeRoutineDelivery(db,job.id,token,clock());
        if(gate.cancel){await recordUnstartedDeliveryAttempt(db,{queueKind:'business',queueId:job.id,claimToken:token,attemptNumber,now:clock(),cancelled:true});await db.prepare("UPDATE notification_messages SET status='cancelled',failure_reason='obsolete_or_access_changed',delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND delivery_claim_token=?").bind(job.id,token).run();cancelled++;continue;}
        if(gate.deferUntil){await db.prepare("UPDATE notification_messages SET status='queued',delivery_attempts=delivery_attempts-1,delivery_next_attempt_at=?,delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND delivery_claim_token=?").bind(gate.deferUntil,job.id,token).run();continue;}
        feeRoutineClaimed=!!gate.claimed;
      }
      if (validMailRecipient(row.email)) await addBusinessEmailDetails(db, row, clock());
      const message=validMailRecipient(row.email)?buildBusinessEmail(row,origin,{transport:mail.transport,isolatedCaptureOrigin}):{to:row.email,subject:'',text:'',html:''};
      const outcome=await deliverDurably(db,mail,message,{
        queueKind:'business',queueId:job.id,claimToken:token,attemptNumber,
        now:clock,
        validate:async()=>{const current=await loadCurrent();return !!current && current.email===row.email;},
      });
      if(outcome.outcome==='accepted'||outcome.outcome==='captured'){
        // Record transport only from the actual receipt, never from caller options.
        await db.prepare("UPDATE notification_messages SET status='sent',sent_at=?,delivery_transport=?,failure_reason=NULL,delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND delivery_claim_token=?").bind(clock(),outcome.transport??null,job.id,token).run();
        if(feeRoutineClaimed)await(await import('../commission/terms-followup')).finishFeeRoutineDelivery(db,token,job.id,clock());
        accepted++;
      }else{
        if(feeRoutineClaimed)await(await import('../commission/terms-followup')).finishFeeRoutineDelivery(db,token,null,clock());
        if(outcome.outcome==='cancelled'){
          await db.prepare("UPDATE notification_messages SET status='cancelled',failure_reason='obsolete_or_access_changed',delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND delivery_claim_token=?").bind(job.id,token).run();cancelled++;
        }else{
          await db.prepare("UPDATE notification_messages SET status='failed',failure_reason=?,delivery_next_attempt_at=?,delivery_attempts=delivery_attempts-?,delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND delivery_claim_token=?").bind(outcome.failureCode??'delivery_held',outcome.retryAt??(outcome.outcome==='intervention'?clock()+60_000:0),outcome.outcome==='held'?1:0,job.id,token).run();
          if(outcome.outcome!=='held')failed++;
        }
      }
    } catch {
      await recordUnstartedDeliveryAttempt(db,{queueKind:'business',queueId:job.id,claimToken:token,attemptNumber,now:clock(),retryAt:clock()+emailRetryDelayMs(attemptNumber)});
      if(feeRoutineClaimed)await(await import('../commission/terms-followup')).finishFeeRoutineDelivery(db,token,null,clock());
      // Durable accepted/handoff fences exclude replay even if this queue update fails.
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
export async function businessEmailQueue(db: D1Database, now = Date.now(), options:{reference?:string;fromAt?:number;beforeAt?:number}={}) {
  const allowed = supportedTemplates.map(() => '?').join(',');
  const scope:string[]=[],scopeValues:(string|number)[]=[];
  if(options.reference){scope.push('id=?');scopeValues.push(options.reference);}
  if(options.fromAt!==undefined){scope.push('created_at>=?');scopeValues.push(options.fromAt);}
  if(options.beforeAt!==undefined){scope.push('created_at<?');scopeValues.push(options.beforeAt);}
  const rows = await db
    .prepare(
      `SELECT id,subject_en AS subject,audience_role AS audience,status,related_type AS relatedType,related_id AS relatedId,
      COALESCE((SELECT u.email FROM users u WHERE u.id=recipient_user_id),guest_email) AS recipientEmail,
      (SELECT i.answers_json FROM seller_registration_intakes i WHERE i.user_id=notification_messages.recipient_user_id
        AND (notification_messages.audience_role='seller' OR (notification_messages.audience_role='customer' AND notification_messages.related_type='seller_application'))) AS sellerEmailAnswers,
      delivery_attempts AS attempts,(SELECT COUNT(*) FROM email_delivery_attempts counted WHERE counted.queue_kind='business' AND counted.queue_id=notification_messages.id) AS accountedAttempts,
      delivery_lease_until AS leaseUntil,delivery_next_attempt_at AS nextAt,failure_reason AS failure,created_at AS createdAt
      FROM notification_messages WHERE channel='email' AND business_event_key=template_key AND template_key IN (` +
        allowed +
        ')'+(scope.length?' AND '+scope.join(' AND '):'')+' ORDER BY created_at DESC,id DESC LIMIT 100',
    )
    .bind(...supportedTemplates,...scopeValues)
    .all<{
      id: string;
      subject: string;
      audience: string;
      status: string;
      attempts: number;
      accountedAttempts:number;
      leaseUntil: number;
      nextAt: number;
      failure: string | null;
      createdAt: number;
      relatedType:string|null;
      relatedId:string|null;
      recipientEmail:string|null;
      sellerEmailAnswers:string|null;
    }>();
  return Promise.all(rows.results.map(async(row)=>{
    const delivery=await readDeliveryStatus(db,'business',row.id);
    const durable=['accepted','captured','uncertain'].includes(delivery.status)?delivery.status:['queued','failed'].includes(row.status)&&row.attempts>row.accountedAttempts?'uncertain':delivery.status;
    const displayStatus = durable==='accepted' ? 'Sent to mail service'
      : durable==='captured' ? 'Captured locally — not sent'
      : row.status==='cancelled' ? 'No longer needed'
      : durable==='uncertain' ? row.leaseUntil>now ? 'Sending' : 'Outcome uncertain'
      : durable==='intervention' ? 'Needs intervention'
      : row.leaseUntil>now ? 'Sending'
      : durable==='retrying' ? 'Retrying automatically'
      : row.status==='sent' ? 'Sent record — transport not confirmed'
      : 'Scheduled / waiting';
    const {recipientEmail: accountEmail,sellerEmailAnswers,...safeRow}=row;
    const recipientEmail = sellerNotificationEmail(accountEmail, sellerEmailAnswers);
    const maskedRecipient=recipientEmail?.includes('@')?recipientEmail.slice(0,1)+'***@'+recipientEmail.split('@')[1]:null;
    const legacyObservation=delivery.attempt?.failureCode==='legacy_outcome_unverified';
    return {...safeRow,maskedRecipient,sourceReference:notificationDestination('staff','staff',row.relatedType,row.relatedId),displayStatus,deliveryState:durable,lastAttemptAt:legacyObservation?null:delivery.attempt?.startedAt??null,legacyObservationAt:legacyObservation?delivery.attempt?.startedAt??null:null,nextAt:delivery.attempt?.retryAt??row.nextAt,failureCategory:delivery.attempt?.failureCategory??(durable==='uncertain'?'unknown':null)};
  }));
}

export async function businessEmailQueueSummary(db:D1Database,now=Date.now(),transport?:Pick<OrderMailService,'transportKey'|'configurationFingerprint'>) {
  const allowed=supportedTemplates.map(()=>'?').join(',');
  const pending="n.status IN ('queued','failed') AND COALESCE(a.phase,'') NOT IN ('accepted','captured','cancelled')";
  const accounted=accountedDeliveryAttemptsSql('business','n.id','n.delivery_attempts');
  const intervention="a.phase='not_accepted' AND a.failure_category IN ('permanent_recipient','configuration')";
  const uncertain=`${pending} AND (a.phase IN ('handoff_started','uncertain') OR NOT ${accounted}) AND n.delivery_lease_until<=?`;
  const eligible=`${pending} AND ${accounted} AND COALESCE(a.phase,'') NOT IN ('handoff_started','uncertain') AND NOT(COALESCE(a.phase,'')='not_accepted' AND COALESCE(a.failure_category,'') IN ('permanent_recipient','configuration')) AND n.delivery_next_attempt_at<=? AND n.delivery_lease_until<=?`;
  const row=await db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN ${pending} THEN 1 ELSE 0 END),0) AS pending,
    COALESCE(SUM(CASE WHEN ${pending} AND n.status='failed' THEN 1 ELSE 0 END),0) AS failures,
    COALESCE(SUM(CASE WHEN ${intervention} THEN 1 ELSE 0 END),0) AS intervention,
    COALESCE(SUM(CASE WHEN ${uncertain} THEN 1 ELSE 0 END),0) AS uncertain,
    COALESCE(SUM(CASE WHEN ${pending} AND n.delivery_lease_until>? THEN 1 ELSE 0 END),0) AS activeLeases,
    COALESCE(SUM(CASE WHEN ${eligible} THEN 1 ELSE 0 END),0) AS due,
    MIN(CASE WHEN n.delivery_attempts=0 AND ${eligible} THEN CASE WHEN n.created_at>n.delivery_next_attempt_at THEN n.created_at ELSE n.delivery_next_attempt_at END ELSE NULL END) AS oldestEligibleAt,
    COALESCE(SUM(CASE WHEN n.delivery_attempts=0 AND ${eligible} AND n.created_at<=? THEN 1 ELSE 0 END),0) AS overdueFirstAttempts,
    MIN(CASE WHEN ${pending} THEN n.created_at ELSE NULL END) AS oldestAt
    FROM notification_messages n LEFT JOIN email_delivery_attempts a ON a.id=(SELECT latest.id FROM email_delivery_attempts latest WHERE latest.queue_kind='business' AND latest.queue_id=n.id ORDER BY latest.attempt_number DESC LIMIT 1)
    WHERE n.channel='email' AND n.business_event_key=n.template_key AND n.template_key IN (${allowed})`).bind(now,now,now,now,now,now,now,now,now-300_000,...supportedTemplates).first<{pending:number;failures:number;intervention:number;uncertain:number;activeLeases:number;due:number;oldestEligibleAt:number|null;overdueFirstAttempts:number;oldestAt:number|null}>();
  const backoff=transport?.transportKey?await db.prepare('SELECT blocked_until AS untilAt,config_fingerprint AS fingerprint FROM email_transport_backoff WHERE transport_key=?').bind(transport.transportKey).first<{untilAt:number;fingerprint:string|null}>():null;
  const blocked=!!backoff&&backoff.fingerprint===(transport?.configurationFingerprint??null)&&backoff.untilAt>now;
  return Object.freeze({pending:Number(row?.pending??0),failures:Number(row?.failures??0),exhausted:0,intervention:Number(row?.intervention??0),uncertain:Number(row?.uncertain??0),activeLeases:Number(row?.activeLeases??0),due:blocked?0:Number(row?.due??0),oldestEligibleAt:blocked?null:row?.oldestEligibleAt??null,overdueFirstAttempts:blocked?0:Number(row?.overdueFirstAttempts??0),transportBackoffUntil:blocked?backoff!.untilAt:null,oldestAgeMinutes:row?.oldestAt==null?0:Math.max(0,Math.floor((now-row.oldestAt)/60_000))});
}

export interface OperationalBusinessEvent {
  kind:
    | 'gift.issued'
    | 'gift.redeemed'
    | 'programme.updated'
    | 'finance.refund'
    | 'finance.fee_refund_authorized'
    | 'finance.invoice_adjustment'
    | 'finance.funding_verified'
    | 'finance.payout'
    | 'seller.live_clearance'
    | 'company.live_financial_scope'
    | 'workflow.reminder'
    | 'workflow.assignment'
    | 'system.email_health'
    | 'system.incident'
    | 'team.governance'
    | 'team.handoff'
    | 'category.policy'
    | 'company.account'
    | 'payment.order'
    | 'payment.reminder'
    | 'payment.exception'
    | 'payment.return_loss'
    | 'payment.return_satisfied'
    | 'order.response'
    | 'order.preparation_update'
    | 'fee.policy'
    | 'fee.terms'
    | 'fee.followup'
    | 'fee.holds'
    | 'product.discount_suggestion'
    | 'product.intake'
    | 'product.availability'
    | 'product.priority'
    | 'payout.requested'
    | 'payout.prepared'
    | 'payout.result'
    | 'payout.request.result'
    | 'seller.live_activation'
    | 'seller.recovery'
    | 'seller.recovery.claim'
    | 'permissions.proposed'
    | 'permissions.changed'
    | 'form.compatibility.changed'
    | 'permissions.rejected'
    | 'order.pickup_ready'
    | 'promotion.proposed'
    | 'promotion.result'
    | 'incident.updated'
    | 'account.status'
    | 'delivery.rates.changed'
    | 'seller.document.change'
    | 'seller.document.review'
    | 'seller.protected_change'
    | 'seller.public_profile'
    | 'seller.profile_correction'
    | 'seller.support_contact'
    | 'exception.assigned';
  sourceId: string;
  eventId: string;
  actorId: string;
  now: number;
  status?: string;
  detail?:string;
  correctionDocument?: { en:string;ne:string;bank:boolean;note:string };
  assignment?:import('./review-task-assignment-notices').ReviewTaskAssignmentEvidence;
  /** Native fee producer only; never accepted from a browser payload. */
  ownerEmail?:boolean;
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
  let alternativeStaffPermission:Permission|undefined;
  let staffGuard='1=1';
  let staffGuardValues:unknown[]=[];
  let discountReviewOwner:string|null=null;
  if(e.kind==='gift.issued'||e.kind==='gift.redeemed'){
    const source=(await import('../gift-cards/notice-sources')).giftOperationalSource(db,e);if(!source)throw new Error('Native gift notice source is unavailable.');
    ({guard,guardValues,ownerSql,ownerValues,audience,required,staffPermission,relatedType,subject,staffGuard,staffGuardValues}=source);
  }else if(e.kind==='workflow.assignment'){
      const source=await(await import('./review-task-assignment-notices')).reviewAssignmentOperationalSource(db,e);if(!source)throw new Error('Assignment notification source is unavailable.');
      ({guard,guardValues,ownerSql,ownerValues,audience,staffPermission,alternativeStaffPermission,relatedType,subject,staffGuard='1=1',staffGuardValues=[]}=source);
    }else if(e.kind==='team.governance'||e.kind==='team.handoff'){
    const source=(await import('./team-notice-sources')).teamOperationalSource(db,e);
    if(!source)throw new Error('Team notification source is unavailable.');
    ({guard,guardValues,ownerSql,ownerValues,audience,staffPermission,alternativeStaffPermission,relatedType,subject,staffGuard='1=1',staffGuardValues=[]}=source);
  }else if(e.kind==='system.incident'){
    const source=(await import('./incident-review')).incidentOperationalSource(db,e);
    if(!source)throw new Error('Incident notification source is unavailable.');
    ({guard,guardValues,ownerSql,ownerValues,audience,staffPermission,alternativeStaffPermission,relatedType,subject,staffGuard='1=1',staffGuardValues=[]}=source);
  }else if(e.kind==='system.email_health'){
    ({guard,guardValues,ownerSql,ownerValues,audience,staffPermission,relatedType,subject}=await(await import('./service-health-notifications')).healthOperationalSource(db,e));
  }else if(['finance.refund','finance.payout','finance.fee_refund_authorized','finance.invoice_adjustment','finance.funding_verified','seller.live_clearance','company.live_financial_scope'].includes(e.kind)){
    const source=(await import('./financial-notice-sources')).financialOperationalSource(db,e);
    if(!source)throw new Error('Financial notification source is unavailable.');
    ({guard,guardValues,ownerSql,ownerValues,audience,staffPermission,relatedType,subject,staffGuard='1=1',staffGuardValues=[]}=source);
  }else if(e.kind==='programme.updated'){
    const source=(await import('./programme-notice-sources')).programmeOperationalSource(db,e);
    if(!source)throw new Error('Programme notification source is unavailable.');
    ({guard,guardValues,ownerSql,ownerValues,audience,staffPermission,relatedType,subject,staffGuard='1=1',staffGuardValues=[]}=source);
  }else if(e.kind==='workflow.reminder'){
    const source=await(await import('./reminder-notice-sources')).reminderOperationalSource(db,e);
    if(!source)throw new Error('Reminder notification source is unavailable.');
    ({guard,guardValues,ownerSql,ownerValues,audience,staffPermission,alternativeStaffPermission,relatedType,subject,staffGuard='1=1',staffGuardValues=[]}=source);
  }else if(e.kind==='seller.live_activation'){
    relatedType='managed_live_activation';subject='Managed-maker live activation recorded';audience='seller';
    guard="EXISTS(SELECT 1 FROM managed_live_activation_decisions d JOIN seller_profiles s ON s.id=d.seller_id JOIN managed_live_clearances c ON c.id=d.clearance_id WHERE d.id=? AND d.request_id=? AND d.owner_id=s.user_id AND c.state='active' AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions newer WHERE newer.seller_id=d.seller_id AND newer.revision>d.revision))";guardValues=[e.sourceId,e.eventId];
    ownerSql='SELECT s.user_id FROM managed_live_activation_decisions d JOIN seller_profiles s ON s.id=d.seller_id WHERE d.id=? AND d.owner_id=s.user_id';ownerValues=[e.sourceId];
  }else if(e.kind==='payment.reminder'){
    relatedType='order_payment';subject='Payment window reminder';guard='EXISTS(SELECT 1 FROM manual_payment_reminders r JOIN manual_payment_windows w ON w.order_id=r.order_id WHERE r.order_id=? AND r.event_id=? AND w.last_event_id=r.event_id)';guardValues=[e.sourceId,e.eventId];ownerSql='SELECT customer_id FROM orders WHERE id=?';ownerValues=[e.sourceId];audience='customer';
  }else if(e.kind==='order.preparation_update'){
    relatedType='order_response_event';subject='We are checking your order preparation';guard="EXISTS(SELECT 1 FROM order_response_events WHERE id=? AND kind='customer_update')";guardValues=[e.sourceId];ownerSql='SELECT o.customer_id FROM order_response_events e JOIN orders o ON o.id=e.order_id WHERE e.id=?';ownerValues=[e.sourceId];audience='customer';
  }else if(e.kind==='order.response'){
    relatedType='order_response_event';subject=e.status?.startsWith('released')?'New preparation work':e.status?.startsWith('reminder')?'Preparation response needed':e.status?.startsWith('checkpoint')?'Aged order requires Super Admin follow-up':'Order preparation needs staff follow-up';
    guard='EXISTS(SELECT 1 FROM order_response_events WHERE id=?)';guardValues=[e.sourceId];
    if(e.status?.endsWith('_seller')&&(e.status.startsWith('released')||e.status.startsWith('reminder')||e.status.startsWith('followup'))){ownerSql="SELECT s.user_id FROM order_response_events e JOIN order_response_portions p ON p.id=e.portion_id JOIN seller_profiles s ON s.id=p.seller_id WHERE e.id=? AND p.operator_mode='seller'";ownerValues=[e.sourceId];audience='seller';}
    staffPermission=e.status?.startsWith('checkpoint')||e.status?.endsWith('_company')?'admin.invite':['escalation','delay','followup'].some(kind=>e.status?.startsWith(kind))?'order.manage':null;
  }else if(e.kind==='payment.return_satisfied'){
    relatedType='receipt_return_bank_satisfaction';subject='Original return: bank return reconciled';audience='customer';staffPermission='refund.approve.standard';
    guard="EXISTS(SELECT 1 FROM receipt_return_bank_satisfactions satisfaction JOIN seller_recovery_receipt_reversal_reviews review ON review.id=satisfaction.review_id WHERE satisfaction.id=? AND review.request_id=? AND review.state='completed')";guardValues=[e.sourceId,e.eventId];
    ownerSql='SELECT customer_id FROM receipt_return_bank_satisfactions WHERE id=?';ownerValues=[e.sourceId];
  }else if(e.kind==='payment.return_loss'){
    relatedType='receipt_return_bank_loss';subject='Completed return: bank reconciliation resolved';audience='customer';staffPermission='refund.approve.standard';
    guard="EXISTS(SELECT 1 FROM receipt_return_bank_losses loss JOIN seller_recovery_receipt_reversal_reviews review ON review.id=loss.review_id WHERE loss.id=? AND review.request_id=? AND review.state='completed')";guardValues=[e.sourceId,e.eventId];
    ownerSql='SELECT original.customer_id FROM receipt_return_bank_losses loss JOIN refund_obligations original ON original.id=loss.obligation_id WHERE loss.id=?';ownerValues=[e.sourceId];
  }else if(e.kind==='payment.exception'){
    relatedType='payment_exception';subject='Finance review: '+(e.status??'payment exception').replaceAll('_',' ');staffPermission=e.status==='fulfillment_release'?'order.manage':'payment.receipt.verify';
    guard="EXISTS(SELECT 1 FROM manual_payment_exceptions WHERE id=? AND last_event_id=? AND state<>'resolved')";guardValues=[e.sourceId,e.eventId];
  }else if(e.kind==='payment.order'){
    relatedType='order_payment';subject=({reconciliation_required:'Payment correction under review',issued:'Bank payment instructions ready',claim_received:'Payment claim received for review',late_claim_received:'Late payment claim received for review',partial_payment_received:'Partial payment verified',paid_review_release:'Payment verified',released:'Payment received',expired:'Payment window expired'} as Record<string,string>)[e.status??'']??'Order payment updated';
    guard='EXISTS(SELECT 1 FROM manual_payment_windows WHERE order_id=? AND last_event_id=?)';guardValues=[e.sourceId,e.eventId];ownerSql='SELECT customer_id FROM orders WHERE id=?';ownerValues=[e.sourceId];audience='customer';staffPermission=e.status==='issued'?null:'payment.receipt.verify';
  }else if(e.kind==='product.priority'){
    relatedType='product_priority';subject=e.status==='resolved'?'Product concern resolved':e.status==='reported'?'Priority product concern received':'Priority product review update';staffPermission='product.review';
    guard='EXISTS(SELECT 1 FROM product_priority_cases WHERE id=? AND last_event_id=?)';guardValues=[e.sourceId,e.eventId];ownerSql='SELECT s.user_id FROM product_priority_cases c JOIN products p ON p.id=c.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE c.id=?';ownerValues=[e.sourceId];audience='seller';
    staffGuard=independentProductStaffSql('(SELECT product_id FROM product_priority_cases WHERE id=?)','u.id').map(predicate=>'('+predicate+')').join(' AND ');staffGuardValues=[e.sourceId,e.sourceId];
  }else if(e.kind==='product.availability'){
    relatedType='product_availability';subject=({owner_pause:'New orders paused',owner_resume:'Your order pause is released',owner_stop:'Listing stopped by its owner',owner_restore:'Listing restored by its owner',staff_withdraw:'Listing withdrawn by authorized staff',staff_restore:'Staff listing withdrawal released'} as Record<string,string>)[e.status??'']??'Product availability updated';
    guard='EXISTS(SELECT 1 FROM product_availability_states WHERE product_id=? AND last_event_id=?)';guardValues=[e.sourceId,e.eventId];ownerSql='SELECT s.user_id FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?';ownerValues=[e.sourceId];audience='seller';
    staffGuard=independentProductStaffSql('?','u.id').map(predicate=>'('+predicate+')').join(' AND ');staffGuardValues=[e.sourceId,e.sourceId];
  }else if(e.kind==='product.intake'){
    relatedType='product_intake';subject=({published_held:'Product version recorded; availability holds remain',published:'Product version published',approved:'Product version approved; publication pending',rejected:'Product candidate rejected',changes_requested:'Product correction requested'} as Record<string,string>)[e.status??'']??('Product assistance: '+(e.status??'updated').replaceAll('_',' '));staffPermission=e.status==='approved'?'product.publish':'product.review';
    guard='EXISTS(SELECT 1 FROM product_intake_cases WHERE id=? AND last_event_id=?)';guardValues=[e.sourceId,e.eventId];
    ownerSql='SELECT d.owner_id FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id WHERE c.id=?';ownerValues=[e.sourceId];audience='seller';
    staffGuard=independentProductIntakeStaffSql('?','u.id').map(predicate=>'('+predicate+')').join(' AND ');staffGuardValues=[e.sourceId,e.sourceId];
  }else if(e.kind==='product.discount_suggestion'){
    relatedType='product_discount_advisory';subject='Optional pricing suggestion';staffPermission='product.review';
    guard='EXISTS(SELECT 1 FROM product_discount_advisories WHERE id=? AND product_id=?)';guardValues=[e.sourceId,e.status??''];
    ownerSql='SELECT s.user_id FROM product_discount_advisories a JOIN products p ON p.id=a.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE a.id=?';ownerValues=[e.sourceId];audience='seller';
    discountReviewOwner=(await db.prepare(currentProductReviewOwnerSql('?')).bind(e.status??'').first<{owner_id:string|null}>())?.owner_id??null;
  }else if(e.kind==='fee.terms'||e.kind==='fee.followup'){
    relatedType='commission_terms_event';subject=e.kind==='fee.followup'?'Selling fee follow-up needs attention':'Selling fee: '+(e.status??'review terms').replaceAll('_',' ');staffPermission='seller.application.review';
    guard=`EXISTS(SELECT 1 FROM commission_terms_events v JOIN commission_terms_cases c ON c.id=v.case_id WHERE v.id=? AND c.${e.kind==='fee.followup'?'last_staff_event_id':'last_notice_event_id'}=?)`;guardValues=[e.sourceId,e.eventId];
    if(e.kind==='fee.terms'){ownerSql='SELECT s.user_id FROM commission_terms_events v JOIN commission_terms_cases c ON c.id=v.case_id JOIN seller_profiles s ON s.id=c.seller_id WHERE v.id=?';ownerValues=[e.sourceId];audience='seller';}
  }else if(e.kind==='fee.holds'){
    relatedType='commission_terms_batch';subject='New selling fee holds need review';staffPermission='seller.application.review';guard='EXISTS(SELECT 1 FROM commission_terms_hold_batches WHERE id=?)';guardValues=[e.sourceId];
  }else if(e.kind==='fee.policy'){
    relatedType='commission_policy';subject='Selling fee policy: '+(e.status??'published').replaceAll('_',' ');staffPermission='commercial_policy.manage';
    guard="EXISTS(SELECT 1 FROM commission_common_policies p LEFT JOIN commission_common_cancellations c ON c.policy_id=p.id WHERE p.id=? AND COALESCE(c.event_id,p.id)=?)";guardValues=[e.sourceId,e.eventId];
  }else if(e.kind==='category.policy'){
    relatedType='category_policy';subject='Category requirements updated';staffPermission='catalog.manage';
    guard='EXISTS(SELECT 1 FROM category_template_states WHERE category_id=? AND last_event_id=?)';guardValues=[e.sourceId,e.eventId];
  }else if(e.kind==='company.account'){
    relatedType='company_payment_account';subject='Company receiving account: '+(e.status??'updated').replaceAll('_',' ');
    guard='EXISTS(SELECT 1 FROM company_payment_accounts WHERE id=? AND last_event_id=?)';guardValues=[e.sourceId,e.eventId];
  }else if(e.kind==='seller.support_contact'){
    relatedType='seller_support_contact';subject='Public customer-support contacts updated';
    guard='EXISTS(SELECT 1 FROM seller_public_profile_states WHERE seller_id=? AND support_request_id=?)';guardValues=[e.sourceId,e.eventId];
  }else if(e.kind==='seller.public_profile'||e.kind==='seller.profile_correction'){
    const correction=e.kind==='seller.profile_correction';relatedType=correction?'seller_profile_correction':'seller_public_profile';
    subject=(correction?'Profile correction: ':'Public profile: ')+(e.status??'updated').replaceAll('_',' ');
    guard=correction?'EXISTS(SELECT 1 FROM seller_public_profile_corrections WHERE id=? AND operation_request_id=?)':
      `EXISTS(SELECT 1 FROM seller_public_profile_revisions c WHERE c.seller_id=? AND c.kind='normal' AND c.operation_request_id=? AND c.sequence=(SELECT MAX(latest.sequence) FROM seller_public_profile_revisions latest WHERE latest.seller_id=c.seller_id AND latest.kind='normal'))`;
    guardValues=[e.sourceId,e.eventId];ownerSql=correction?'SELECT s.user_id FROM seller_public_profile_corrections c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?':'SELECT user_id FROM seller_profiles WHERE id=?';ownerValues=[e.sourceId];audience='seller';
  }else if(e.kind==='seller.protected_change') {
    relatedType='seller_protected_change';subject='Protected identity or bank review updated';
    guard='EXISTS(SELECT 1 FROM seller_protected_change_cases WHERE id=? AND operation_request_id=?)';guardValues=[e.sourceId,e.eventId];
    ownerSql='SELECT s.user_id FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?';ownerValues=[e.sourceId];audience='seller';
  } else if (e.kind === 'seller.document.change' || e.kind === 'seller.document.review') {
    const change = e.kind === 'seller.document.change';
    relatedType = change ? 'seller_document_change' : e.correctionDocument?.bank ? 'seller_bank_document' : 'seller_document';
    subject = e.correctionDocument ? 'Please fix your ' + e.correctionDocument.en
      : change ? 'Document change request updated' : 'Document review updated';
    guard = change ? 'EXISTS(SELECT 1 FROM seller_document_change_requests WHERE id=? AND operation_request_id=?)'
      : 'EXISTS(SELECT 1 FROM seller_documents WHERE id=? AND review_request_id=?)';
    guardValues = [e.sourceId, e.eventId];
    ownerSql = change ? 'SELECT s.user_id FROM seller_document_change_requests r JOIN seller_profiles s ON s.id=r.seller_id WHERE r.id=?'
      : 'SELECT s.user_id FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id WHERE d.id=?';
    ownerValues = [e.sourceId]; audience = 'seller';
    // PAN/identity decisions remain Super Admin-only. Existing oversight selection supplies those recipients.
  } else if(e.kind==='seller.recovery.claim'){
    relatedType='seller_recovery_claim';subject='Repayment claim: '+(e.status??'updated').replaceAll('_',' ');
    guard='EXISTS(SELECT 1 FROM seller_recovery_repayment_claims q WHERE q.id=? AND q.operation_request_id=?)';guardValues=[e.sourceId,e.eventId];
    ownerSql='SELECT q.submitted_by FROM seller_recovery_repayment_claims q JOIN seller_recovery_cases c ON c.id=q.case_id JOIN seller_profiles s ON s.id=c.seller_id WHERE q.id=? AND s.user_id=q.submitted_by';
    ownerValues=[e.sourceId];audience='seller';staffPermission='payout.prepare';
  } else if(e.kind==='seller.recovery'){
    relatedType='seller_recovery';subject='Recovery statement: '+(e.status??'updated').replaceAll('_',' ');
    guard='EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_events x ON x.case_id=c.id AND x.revision=c.revision WHERE c.id=? AND x.request_id=?)';
    guardValues=[e.sourceId,e.eventId];ownerSql='SELECT s.user_id FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?';
    ownerValues=[e.sourceId];audience='seller';staffPermission='payout.prepare';
  } else if (e.kind === 'payout.requested' || e.kind === 'payout.request.result') {
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
  } else if (e.kind === 'form.compatibility.changed') {
    relatedType = 'form_configuration';
    subject = 'Form compatibility policy updated';
    guard = "EXISTS(SELECT 1 FROM audit_logs a JOIN form_config_versions v ON v.id=a.subject_id WHERE a.id=? AND v.form_id=? AND a.action IN ('form.compatibility.granted','form.compatibility.revoked') AND v.status='published' AND v.version=(SELECT MAX(latest.version) FROM form_config_versions latest WHERE latest.form_id=v.form_id AND latest.status='published'))";
    guardValues = [e.eventId, e.sourceId];
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
    e.correctionDocument ? subject + ': ' + e.correctionDocument.note :
    e.kind==='gift.issued'?'A gift card issuance was recorded. Open the authorized original record. Secret codes are never included in notices.':e.kind==='gift.redeemed'?'A gift card redemption and shopping-credit addition were recorded. Open the authorized original record and current wallet; this notice does not state the current balance.':e.detail??(e.kind === 'account.status'
      ? 'Your account status was updated. Contact support@hastabazaar.com if you need help. '
      : 'A business update requires your attention. Sign in to review the authorized record and its current next action.');
  const result: D1PreparedStatement[] = [];
  const supplementalOwnerEmail=e.kind==='fee.terms'&&e.ownerEmail===false;
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
    const notificationSubject = role === 'staff' && e.kind === 'account.status' ? `Account status changed: ${e.status}` : subject;
    const notificationBody = role === 'staff' && e.kind === 'account.status' ? 'An account status change was recorded. Open the authorized account workspace for the current state.' : body;
    const subjectNe = e.correctionDocument ? `आफ्नो ${e.correctionDocument.ne} सच्याउनुहोस्` : notificationSubject;
    const bodyNe = e.correctionDocument ? subjectNe + ': ' + e.correctionDocument.note : notificationBody;
    const ownerInAppHandled=role==='staff'&&permission==='admin.invite'&&supplementalOwnerEmail&&!!ownerSql;
    for (const channel of role==='staff'&&permission==='admin.invite'?['in_app','email']:e.kind==='fee.holds'?['email']:e.kind==='fee.terms'&&((role==='staff'&&e.status==='hold_started')||(role!=='staff'&&e.ownerEmail===false))?['in_app']:role !== 'staff' && e.kind === 'account.status' && e.status === 'disabled'
      ? ['email']
      : ['in_app', 'email'])
      result.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission) SELECT ?,u.id,?,?,?,?,?,?,?,?,?,'queued',?,?,?,? FROM users u WHERE " +
              (role !== 'staff' && e.kind === 'account.status'
                ? "u.status IN ('active','disabled')"
                : "u.status='active'") +
              ' AND u.id IN (' +
              select +
              ') AND ' +
              guard +
              ' AND ' +
              extra+(channel==='in_app'&&ownerInAppHandled?' AND u.id NOT IN ('+ownerSql+')':''),
          )
          .bind(
            crypto.randomUUID(),
            role,
            channel,
            template,
            notificationSubject,
            subjectNe,
            notificationBody,
            bodyNe,
            relatedType,
            e.sourceId,
            key==='owner'&&channel==='in_app'&&(e.kind==='gift.issued'||e.kind==='gift.redeemed')?'gift:'+e.sourceId+':'+(e.kind==='gift.issued'?'issued':'redeemed'):'business:' + digest + ':' + channel,
            e.now,
            template,
            permission,
            ...values,
            ...guardValues,
            ...extraValues,
            ...(channel==='in_app'&&ownerInAppHandled?ownerValues:[]),
          ),
      );
  }
  if (ownerSql)
    await insert(ownerSql, ownerValues, audience, required, 'owner');
  {
    const ordinaryStaffEvent=e.kind!=='order.preparation_update'&&!(e.kind==='order.response'&&(e.status==='released_seller'||e.status==='reminder_seller'))&&e.kind!=='payment.reminder'&&(e.kind!=='payment.order'||e.status==='claim_received')&&!(e.kind==='fee.terms'&&!['accepted','hold_started'].includes(e.status??''));
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
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      if(row.role!=='super_admin'&&!ordinaryStaffEvent)continue;
      if(e.kind==='product.discount_suggestion'&&row.role!=='super_admin'&&row.id!==discountReviewOwner)continue;
      if (row.role !== 'super_admin' && (!staffPermission || (row.id === e.actorId && !['payout.prepared', 'permissions.proposed', 'promotion.proposed', 'team.governance', 'team.handoff', 'system.incident','workflow.assignment'].includes(e.kind)))) continue;
      let recipientPermission:Permission = row.role === 'super_admin' ? 'admin.invite' : staffPermission!;
      let selected: readonly Permission[] = defaultAdminPermissions;
      if (row.json !== null) {
        try {
          selected = validateAdminPermissions(JSON.parse(row.json));
        } catch {
          selected = [];
        }
      }
      if(e.kind==='product.intake'&&!['approved','published','published_held'].includes(e.status??'')&&row.role!=='super_admin'&&!can({role:row.role,permissions:selected},recipientPermission)&&can({role:row.role,permissions:selected},'support.manage'))recipientPermission='support.manage';
      if(row.role!=='super_admin'&&alternativeStaffPermission&&!can({role:row.role,permissions:selected},recipientPermission)&&can({role:row.role,permissions:selected},alternativeStaffPermission))recipientPermission=alternativeStaffPermission;
      if (!can({ role: row.role, permissions: selected }, recipientPermission))
        continue;
      const profileSensitive=row.role!=='super_admin'&&recipientPermission!=='account.self.manage';
      const profileGuard =
        // Self-service is intrinsic to every current staff role, including an
        // explicit empty profile. The role/status/source fences still apply.
        !profileSensitive
          ? '1=1'
          : row.json !== null
            ? 'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=u.id AND permissions_json=?)'
            : 'NOT EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=u.id)';
      const excludeOwner=!!ownerSql&&!(row.role==='super_admin'&&supplementalOwnerEmail);
      const extra =
        'EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role=?) AND ' +
        profileGuard +
        ' AND ('+staffGuard+')'+
        (excludeOwner ? ' AND u.id NOT IN (' + ownerSql + ')' : '')+
        (e.kind==='seller.recovery'?` AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases recovery JOIN refunds refund ON refund.id=recovery.refund_id JOIN orders original_order ON original_order.id=refund.order_id WHERE recovery.id=? AND original_order.customer_id=u.id)`:'')+
        (e.kind==='seller.recovery.claim'?` AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_claims claim JOIN seller_recovery_cases recovery ON recovery.id=claim.case_id JOIN refunds refund ON refund.id=recovery.refund_id JOIN orders original_order ON original_order.id=refund.order_id WHERE claim.id=? AND original_order.customer_id=u.id)`:'')+
        (e.kind==='product.discount_suggestion'&&row.role!=='super_admin'?` AND EXISTS(SELECT 1 FROM product_discount_advisories a WHERE a.id=? AND u.id=(${currentProductReviewOwnerSql('a.product_id')}))`:'');
      await insert(
        'SELECT ?',
        [row.id],
        'staff',
        recipientPermission,
        row.id,
        extra,
        [
          row.role,
          ...(profileSensitive && row.json !== null
            ? [row.json]
            : []),
          ...staffGuardValues,
          ...(excludeOwner ? ownerValues : []),
          ...(e.kind==='seller.recovery'?[e.sourceId]:[]),
          ...(e.kind==='seller.recovery.claim'?[e.sourceId]:[]),
          ...(e.kind==='product.discount_suggestion'&&row.role!=='super_admin'?[e.sourceId]:[]),
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
  const participants = await db.prepare(`SELECT o.customer_id customerId,s.user_id sellerId FROM ${table} c ${join} LEFT JOIN seller_profiles s ON s.id=${seller} WHERE c.id=?`)
    .bind(e.sourceId).first<{customerId:string|null;sellerId:string|null}>();
  const notifiedOwners = new Set<string>();
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
    if (participants?.customerId) notifiedOwners.add(participants.customerId);
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
  if (e.action !== 'seller_response' && e.action !== 'customer_response' && (!participants?.sellerId || !notifiedOwners.has(participants.sellerId))) {
    if (participants?.sellerId) notifiedOwners.add(participants.sellerId);
    await add(
      `SELECT s.user_id FROM ${table} c ${join} JOIN seller_profiles s ON s.id=${seller} WHERE c.id=?`,
      [e.sourceId],
      'seller',
      null,
      'seller',
    );
  }
  const rows = await db
    .prepare(
      "SELECT DISTINCT u.id,r.role,p.permissions_json AS json FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END",
    )
    .all<{ id: string; role: 'admin' | 'super_admin'; json: string | null }>();
  const seen = new Set<string>();
  for (const row of rows.results) {
    if (seen.has(row.id) || notifiedOwners.has(row.id) || (row.id === e.actorId && row.role !== 'super_admin')) continue;
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

    let selected: readonly Permission[] = defaultAdminPermissions;
    if (row.json !== null) {
      try {
        selected = validateAdminPermissions(JSON.parse(row.json));
      } catch {
        selected = [];
      }
    }
    const permission: Permission = row.role === 'super_admin' ? 'admin.invite' : 'support.manage';
    if (!can({ role: row.role, permissions: selected }, permission)) continue;
    const profile =
      row.role === 'super_admin'
        ? '1=1'
        : row.json !== null
          ? 'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=u.id AND permissions_json=?)'
          : 'NOT EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=u.id)';
    // Assigned cases go to that person; unassigned open cases enter the permitted support queue.
    const actionable = row.role === 'super_admin'
      ? (isReturn ? "NOT EXISTS(SELECT 1 FROM refunds WHERE return_request_id=? AND status='pending_high_value_approval')" : 'EXISTS(SELECT 1 FROM complaints WHERE id=?)')
      : `EXISTS(SELECT 1 FROM ${table} c WHERE c.id=? AND c.status NOT IN ('resolved','closed','rejected','pending_high_value_approval') AND (${assignee}=u.id OR ${assignee} IS NULL))`;
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
import {currentProductReviewOwnerSql} from '../workflows/review-tasks';
