import {aftercareFollowup,publicAftercareFollowup,type PublicAftercareFollowup} from '../../returns/followup';
import {checkoutCommitClock} from '../../checkout/commit-policy-guards';
import { caseBusinessNotificationStatements } from '../../operations/business-notifications';
import { buildFormAnswerInsert } from './form-answers';
import { assertCommerceFormReplay, type CommerceForm } from './commerce-form-replay';
import { currentFormVersionGuards } from '@/lib/forms/native-version';
import { staffMutationGuard } from './staff-mutation-guard';
import { digestFormRequest } from '@/lib/forms/submission';
import type { StaffRole } from '@/lib/auth/staff';
import type { SupportedLocale } from '@/lib/marketplace/types';

export class ComplaintConflictError extends Error {}

export const complaintCategories = [
  'product',
  'delivery',
  'seller',
  'refund',
  'service',
  'safety',
  'other',
] as const;
export type ComplaintCategory = (typeof complaintCategories)[number];

type ComplaintReplayRow = { id: string; referenceNumber: string; orderItemId: string | null;
  category: ComplaintCategory; subject: string; detail: string; locale: SupportedLocale };
function assertComplaintReplay(row: ComplaintReplayRow, options: {
  orderItemId: string | null; category: ComplaintCategory; subject: string; detail: string; locale: SupportedLocale;
}): void {
  if (row.orderItemId !== options.orderItemId || row.category !== options.category ||
    row.subject !== options.subject || row.detail !== options.detail || row.locale !== options.locale) {
    throw new ComplaintConflictError('This request ID was already used for different complaint details.');
  }
}

function complaintReference(now: number): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(now))
    .replaceAll('-', '');
  return `CMP-${date}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

export async function createCustomerComplaint(
  database: D1Database,
  options: {
    orderNumber: string;
    receiptTokenHash: string | null;
    customerId?: string | null;
    orderItemId: string | null;
    category: ComplaintCategory;
    subject: string;
    detail: string;
    locale: SupportedLocale;
    requestId: string;
    now: number;
    form?: CommerceForm;
    /** Trusted staff intake only. Public customer handlers never accept these fields. */
    supportIntake?:{actorId:string;receivedAt:number;channel:'email'|'support';sourceReference:string};
  },
): Promise<{ id: string; referenceNumber: string; duplicate: boolean }> {
  const intake=options.supportIntake,firstReceivedAt=intake?.receivedAt??options.now,clock=checkoutCommitClock(database);
  const intakeAuthority=intake?await staffMutationGuard(database,intake.actorId,'support.manage',ComplaintConflictError):null;
  if(intake){const current=await database.prepare(`SELECT ${clock} AS now`).first<{now:number}>();if(!Number.isSafeInteger(firstReceivedAt)||firstReceivedAt<=0||firstReceivedAt>current!.now||!['email','support'].includes(intake.channel)||typeof intake.sourceReference!=='string'||intake.sourceReference.trim().length<8||intake.sourceReference.length>500)throw new ComplaintConflictError('Retain the actual first received time and its supported source evidence.');}
  async function assertIntake(id:string){const row=await database.prepare('SELECT created_at AS receivedAt,intake_channel AS channel,intake_recorded_by AS actorId,received_evidence_reference AS reference FROM complaints WHERE id=?').bind(id).first<{receivedAt:number;channel:string;actorId:string|null;reference:string|null}>();if(!row||row.channel!==(intake?.channel??'web')||row.actorId!==(intake?.actorId??null)||row.reference!==(intake?.sourceReference.trim()??null)||intake&&row.receivedAt!==firstReceivedAt)throw new ComplaintConflictError('This reference already records different original intake evidence.');}
  const previous = await database
    .prepare(
      `SELECT complaints.id, complaints.reference_number AS referenceNumber,
        complaints.order_item_id AS orderItemId, complaints.category,
        complaints.subject, complaints.detail, complaints.locale
       FROM complaints INNER JOIN orders ON orders.id = complaints.order_id
       WHERE complaints.created_request_id = ? AND orders.order_number = ?
         AND (orders.receipt_token_hash = ? OR orders.customer_id = ?) LIMIT 1`,
    )
    .bind(
      options.requestId,
      options.orderNumber,
      options.receiptTokenHash,
      options.customerId ?? null,
    )
    .first<ComplaintReplayRow>();
  if (previous) {
    await assertIntake(previous.id);
    assertComplaintReplay(previous, options);
    await assertCommerceFormReplay(database, { formId: 'commerce.complaint',
      requestId: options.requestId, subjectType: 'complaint', subjectId: previous.id,
      actorId: intake?.actorId??options.customerId ?? null, form: options.form, conflictError: ComplaintConflictError });
    return { id: previous.id, referenceNumber: previous.referenceNumber, duplicate: true };
  }
  const order = await database
    .prepare(
      `SELECT orders.id AS orderId,
        CASE WHEN ? IS NULL THEN NULL ELSE order_items.id END AS orderItemId,
        CASE WHEN ? IS NULL THEN NULL ELSE order_items.seller_id END AS sellerId
       FROM orders LEFT JOIN order_items ON order_items.order_id = orders.id AND order_items.id = ?
       WHERE orders.order_number = ?
         AND (orders.receipt_token_hash = ? OR orders.customer_id = ?)
         AND (? IS NULL OR order_items.id IS NOT NULL) LIMIT 1`,
    )
    .bind(
      options.orderItemId,
      options.orderItemId,
      options.orderItemId,
      options.orderNumber,
      options.receiptTokenHash,
      options.customerId ?? null,
      options.orderItemId,
    )
    .first<{
      orderId: string;
      orderItemId: string | null;
      sellerId: string | null;
    }>();
  if (!order)
    throw new ComplaintConflictError(
      'The order or selected item could not be verified.',
    );
  const id = crypto.randomUUID();
  const referenceNumber = complaintReference(options.now);
  const priority = options.category === 'safety' ? 'urgent' : 'normal';
  try {
    const results = await database.batch([
      database
        .prepare(
          `INSERT INTO complaints (
            id, reference_number, customer_id, order_id, order_item_id, seller_id,
            category, subject, detail, locale, priority, status, assigned_to,
            resolution, resolution_ne, created_request_id, operation_request_id,
            created_at, updated_at, resolved_at,recorded_at,intake_channel,intake_recorded_by,received_evidence_reference
          ) SELECT ?, ?, ?, id, ?, ?, ?, ?, ?, ?, ?, 'open', NULL,
            NULL, NULL, ?, ?, ?, ?, NULL,${clock},?,?,? FROM orders
            WHERE id = ? AND order_number = ?
              AND (receipt_token_hash = ? OR customer_id = ?)`,
        )
        .bind(
          id,
          referenceNumber,
          options.customerId ?? null,
          order.orderItemId,
          order.sellerId,
          options.category,
          options.subject,
          options.detail,
          options.locale,
          priority,
          options.requestId,
          options.requestId,
          firstReceivedAt,
          options.now,
          intake?.channel??'web',intake?.actorId??null,intake?.sourceReference.trim()??null,
          order.orderId,
          options.orderNumber,
          options.receiptTokenHash,
          options.customerId ?? null,
        ),
      // Abort the D1 batch if the conditional parent insert matched no order.
      database.prepare(
        `SELECT CASE WHEN EXISTS (
          SELECT 1 FROM complaints WHERE id = ? AND created_request_id = ?
        ) THEN 1 ELSE json_extract('invalid-case-insert', '$') END`,
      ).bind(id, options.requestId),
      database
        .prepare(
          `INSERT INTO complaint_events (
            id, complaint_id, from_status, to_status, action, actor_id,
            actor_type, public_message_en, public_message_ne, internal_note,
            request_id, created_at
          ) SELECT ?, id, NULL, 'open', ?, ?, ?,
            'Complaint received. Hastabazaar will review it.',
            'गुनासो प्राप्त भयो। हथकृतिले यसको समीक्षा गर्नेछ।', NULL, ?, ?
            FROM complaints WHERE id = ? AND created_request_id = ?`,
        )
        .bind(
          crypto.randomUUID(),
          intake?'support_recorded':'customer_created',intake?.actorId??options.customerId??null,intakeAuthority?.role??'customer',
          options.requestId,
          options.now,
          id,
          options.requestId,
        ),
      database
        .prepare(
          `INSERT INTO audit_logs (
            id, actor_id, action, subject_type, subject_id, reason,
            previous_json, next_json, request_id, ip_hash, created_at
          ) SELECT ?, ?, ?, 'complaint', id, ?,
            NULL, ?, ?, NULL, ? FROM complaints WHERE id = ? AND created_request_id = ?`,
        )
        .bind(
          crypto.randomUUID(),
          intake?.actorId??options.customerId??null,intake?'complaint.support.recorded':'complaint.customer.created',
          options.detail,
          JSON.stringify({
            referenceNumber,
            category: options.category,
            status: 'open',
          }),
          options.requestId,
          options.now,
          id,
          options.requestId,
        ),
      ...(options.form ? [buildFormAnswerInsert(database, {
        formId: 'commerce.complaint', requestId: options.requestId,
        versionId: options.form.versionId, subjectType: 'complaint', subjectId: id,
        actorId: intake?.actorId??options.customerId ?? null, answers: options.form.answers, now: options.now,
      })] : []),
      ...(intakeAuthority?.statements??[]),
      ...(await caseBusinessNotificationStatements(database, {
        sourceType: 'complaint',
        sourceId: id,
        eventId: options.requestId,
        actorId: intake?.actorId??options.customerId,
        action: 'created',
        now: options.now,
      })),
    ]);
    if ((results[0].meta.changes ?? 0) < 1)
      throw new ComplaintConflictError(
        'The complaint could not be linked to this order.',
      );
  } catch (error) {
    if (error instanceof ComplaintConflictError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNIQUE constraint failed')) {
      const duplicate = await database
        .prepare(
          `SELECT id, reference_number AS referenceNumber, order_item_id AS orderItemId,
            category, subject, detail, locale FROM complaints WHERE created_request_id = ? LIMIT 1`,
        )
        .bind(options.requestId)
        .first<ComplaintReplayRow>();
      if (duplicate) {
        await assertIntake(duplicate.id);
        assertComplaintReplay(duplicate, options);
        await assertCommerceFormReplay(database, { formId: 'commerce.complaint',
          requestId: options.requestId, subjectType: 'complaint', subjectId: duplicate.id,
          actorId: intake?.actorId??options.customerId ?? null, form: options.form, conflictError: ComplaintConflictError });
        return { id: duplicate.id, referenceNumber: duplicate.referenceNumber, duplicate: true };
      }
    }
    throw error;
  }
  return { id, referenceNumber, duplicate: false };
}

export interface ComplaintRow {
  followup?:PublicAftercareFollowup;
  id: string;
  referenceNumber: string;
  orderNumber: string;
  orderItemId: string | null;
  productName: string | null;
  sellerName: string | null;
  category: string;
  subject: string;
  detail: string;
  locale: SupportedLocale;
  priority: string;
  status: string;
  assignedTo: string | null;
  assignedName: string | null;
  resolution: string | null;
  resolutionNe: string | null;
  sellerResponse: string | null;
  escalationReason: string | null;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export interface ComplaintEventRow {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  actorType: string;
  publicMessageEn: string;
  publicMessageNe: string;
  internalNote: string | null;
  createdAt: number;
}

export interface ComplaintDetail extends ComplaintRow {
  staffFollowup?:Awaited<ReturnType<typeof aftercareFollowup>>;
  customerEmail?: string;
  customerPhone?: string;
  sellerId?: string | null;
  events: readonly ComplaintEventRow[];
}

const complaintSelect = `SELECT complaints.id,
  complaints.reference_number AS referenceNumber,
  orders.order_number AS orderNumber, complaints.order_item_id AS orderItemId,
  order_items.product_name_snapshot AS productName,
  order_items.seller_name_snapshot AS sellerName,
  complaints.category, complaints.subject, complaints.detail, complaints.locale,
  complaints.priority, complaints.status, complaints.assigned_to AS assignedTo,
  assigned.display_name AS assignedName, complaints.resolution,
  complaints.resolution_ne AS resolutionNe,
  complaints.seller_response AS sellerResponse,
  complaints.escalation_reason AS escalationReason,
  complaints.created_at AS createdAt, complaints.updated_at AS updatedAt,
  complaints.resolved_at AS resolvedAt
  FROM complaints INNER JOIN orders ON orders.id = complaints.order_id
  LEFT JOIN order_items ON order_items.id = complaints.order_item_id
  LEFT JOIN users AS assigned ON assigned.id = complaints.assigned_to`;

async function complaintEvents(
  database: D1Database,
  complaintId: string,
  privateAccess=true,
): Promise<readonly ComplaintEventRow[]> {
  const result = await database
    .prepare(
      `SELECT id, from_status AS fromStatus, to_status AS toStatus, action,
        actor_type AS actorType, public_message_en AS publicMessageEn,
        public_message_ne AS publicMessageNe, internal_note AS internalNote,
        created_at AS createdAt FROM complaint_events
       WHERE complaint_id = ? ORDER BY created_at ASC`,
    )
    .bind(complaintId)
    .all<ComplaintEventRow>();
  return privateAccess?result.results:result.results.map(event=>({...event,internalNote:null}));
}

export async function listComplaintsForCustomerReceipt(
  database: D1Database,
  orderNumber: string,
  receiptTokenHash: string | null,
  customerId: string | null = null,
): Promise<readonly ComplaintRow[]> {
  const result = await database
    .prepare(
      `${complaintSelect} WHERE orders.order_number = ? AND (orders.receipt_token_hash = ? OR orders.customer_id = ?) ORDER BY complaints.updated_at DESC`,
    )
    .bind(orderNumber, receiptTokenHash, customerId)
    .all<ComplaintRow>();
  return Promise.all(result.results.map(async row=>({...row,followup:await publicAftercareFollowup(database,'complaint',row.id),escalationReason:null,assignedTo:null,assignedName:null})));
}

export async function getCustomerComplaintDetail(
  database: D1Database,
  complaintId: string,
  orderNumber: string,
  receiptTokenHash: string | null,
  customerId: string | null = null,
): Promise<ComplaintDetail | null> {
  const row = await database
    .prepare(
      `${complaintSelect} WHERE complaints.id = ? AND orders.order_number = ? AND (orders.receipt_token_hash = ? OR orders.customer_id = ?) LIMIT 1`,
    )
    .bind(complaintId, orderNumber, receiptTokenHash, customerId)
    .first<ComplaintRow>();
  return row
    ? { ...row, followup:await publicAftercareFollowup(database,'complaint',row.id),escalationReason:null,assignedTo:null,assignedName:null, events: await complaintEvents(database, row.id,false) }
    : null;
}

export async function addCustomerComplaintReply(
  database: D1Database,
  options: {
    complaintId: string;
    orderNumber: string;
    receiptTokenHash: string | null;
    customerId?: string | null;
    message: string;
    locale: SupportedLocale;
    requestId: string;
    now: number;
  },
): Promise<void> {
  if (
    await database
      .prepare(`SELECT id FROM complaint_events WHERE request_id = ? LIMIT 1`)
      .bind(options.requestId)
      .first()
  )
    return;
  const results = await database.batch([
    database
      .prepare(
        `UPDATE complaints SET status = 'investigating', detail = detail || ?, locale = ?,
          operation_request_id = ?, updated_at = ? WHERE id = ? AND status = 'waiting_customer'
          AND EXISTS (SELECT 1 FROM orders WHERE orders.id = complaints.order_id
            AND orders.order_number = ?
            AND (orders.receipt_token_hash = ? OR orders.customer_id = ?))`,
      )
      .bind(
        `\n\nCustomer reply: ${options.message}`,
        options.locale,
        options.requestId,
        options.now,
        options.complaintId,
        options.orderNumber,
        options.receiptTokenHash,
        options.customerId ?? null,
      ),
    database
      .prepare(
        `INSERT INTO complaint_events (
          id, complaint_id, from_status, to_status, action, actor_id, actor_type,
          public_message_en, public_message_ne, internal_note, request_id, created_at
        ) SELECT ?, id, 'waiting_customer', 'investigating', 'customer_replied', NULL,
          'customer', 'Customer reply received; investigation resumed.',
          'ग्राहकको जवाफ प्राप्त भयो; जाँच पुनः सुरु भयो।', ?, ?, ?
          FROM complaints WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.message,
        options.requestId,
        options.now,
        options.complaintId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, NULL, 'complaint.customer.replied', 'complaint', id, ?, ?, ?, ?, NULL, ?
          FROM complaints WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.message,
        JSON.stringify({ status: 'waiting_customer' }),
        JSON.stringify({ status: 'investigating' }),
        options.requestId,
        options.now,
        options.complaintId,
        options.requestId,
      ),
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'complaint',
      sourceId: options.complaintId,
      eventId: options.requestId,
      actorId: options.customerId,
      action: 'customer_response',
      now: options.now,
    })),
  ]);
  if ((results[0].meta.changes ?? 0) < 1)
    throw new ComplaintConflictError(
      'This complaint is not waiting for a customer reply.',
    );
}

export async function listComplaintsForSeller(
  database: D1Database,
  sellerId: string,
  limit = 100,
): Promise<readonly ComplaintRow[]> {
  const result = await database
    .prepare(
      `${complaintSelect} WHERE complaints.seller_id = ? ORDER BY complaints.updated_at DESC LIMIT ?`,
    )
    .bind(sellerId, limit)
    .all<ComplaintRow>();
  return Promise.all(result.results.map(async row=>({...row,followup:await publicAftercareFollowup(database,'complaint',row.id),escalationReason:null,assignedTo:null,assignedName:null})));
}

export async function getSellerComplaintDetail(
  database: D1Database,
  complaintId: string,
  sellerId: string,
): Promise<ComplaintDetail | null> {
  const row = await database
    .prepare(
      `${complaintSelect} WHERE complaints.id = ? AND complaints.seller_id = ? LIMIT 1`,
    )
    .bind(complaintId, sellerId)
    .first<ComplaintRow>();
  return row
    ? { ...row, followup:await publicAftercareFollowup(database,'complaint',row.id),escalationReason:null,assignedTo:null,assignedName:null, events: await complaintEvents(database, row.id,false) }
    : null;
}

export async function respondToComplaintAsSeller(
  database: D1Database,
  options: {
    complaintId: string;
    sellerId: string;
    actorId: string;
    response: string;
    requestId: string;
    now: number;
    form?: CommerceForm;
  },
): Promise<void> {
  if (options.response.trim().length < 20 || options.response.length > 2000 ||
      options.requestId.length < 8 || options.requestId.length > 100)
    throw new ComplaintConflictError('Seller response details are invalid.');
  const seller = await database.prepare(`SELECT 1 AS valid FROM seller_profiles s
    JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=?
      AND s.status='approved' AND u.status='active' LIMIT 1`)
    .bind(options.sellerId, options.actorId).first();
  if (!seller) throw new ComplaintConflictError('Seller authority changed.');
  const duplicate = await database.prepare(`SELECT e.complaint_id AS caseId,
    e.actor_id AS actorId,e.internal_note AS response,e.action,c.seller_id AS sellerId
    FROM complaint_events e JOIN complaints c ON c.id=e.complaint_id
    WHERE e.request_id=? LIMIT 1`).bind(options.requestId)
    .first<{ caseId: string; actorId: string | null; response: string | null;
      action: string; sellerId: string | null }>();
  if (duplicate) {
    if (duplicate.caseId !== options.complaintId || duplicate.actorId !== options.actorId ||
        duplicate.sellerId !== options.sellerId || duplicate.action !== 'seller_responded' ||
        duplicate.response !== options.response)
      throw new ComplaintConflictError('This request was already used for a different response.');
    await assertCommerceFormReplay(database, { formId: 'seller.case-complaint-response',
      requestId: options.requestId, subjectType: 'complaint', subjectId: duplicate.caseId,
      actorId: options.actorId, form: options.form, conflictError: ComplaintConflictError });
    return;
  }
  const current = await database
    .prepare(
      `SELECT status FROM complaints WHERE id = ? AND seller_id = ? LIMIT 1`,
    )
    .bind(options.complaintId, options.sellerId)
    .first<{ status: string }>();
  if (
    !current ||
    current.status === 'resolved' ||
    current.status === 'closed'
  ) {
    throw new ComplaintConflictError(
      'This complaint is not open for a seller response.',
    );
  }
  const toStatus = current.status === 'open' ? 'investigating' : current.status;
  const results = await database.batch([
    database
      .prepare(
        `UPDATE complaints SET seller_response = ?, seller_responded_by = ?,
          seller_responded_at = ?, status = CASE WHEN status = 'open' THEN 'investigating' ELSE status END,
          operation_request_id = ?, updated_at = ? WHERE id = ? AND seller_id = ?
          AND seller_response IS NULL AND status NOT IN ('resolved', 'closed')
          AND EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
            WHERE s.id=complaints.seller_id AND s.user_id=? AND s.status='approved'
              AND u.status='active')`,
      )
      .bind(
        options.response,
        options.actorId,
        options.now,
        options.requestId,
        options.now,
        options.complaintId,
        options.sellerId,
        options.actorId,
      ),
    database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM complaints
      WHERE id=? AND operation_request_id=? AND seller_responded_by=?)
      THEN 1 ELSE json_extract('invalid-seller-response','$') END`)
      .bind(options.complaintId, options.requestId, options.actorId),
    database
      .prepare(
        `INSERT INTO complaint_events (
          id, complaint_id, from_status, to_status, action, actor_id, actor_type,
          public_message_en, public_message_ne, internal_note, request_id, created_at
        ) SELECT ?, id, ?, ?, 'seller_responded', ?, 'seller',
          'Seller response received for the investigation.',
          'जाँचका लागि विक्रेताको जवाफ प्राप्त भयो।', ?, ?, ?
          FROM complaints WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        current.status,
        toStatus,
        options.actorId,
        options.response,
        options.requestId,
        options.now,
        options.complaintId,
        options.requestId,
      ),
    ...(options.form ? [buildFormAnswerInsert(database, {
      formId: 'seller.case-complaint-response', requestId: options.requestId,
      versionId: options.form.versionId, subjectType: 'complaint',
      subjectId: options.complaintId, actorId: options.actorId,
      answers: options.form.answers, now: options.now,
    })] : []),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, 'complaint.seller.responded', 'complaint', id, ?, NULL, ?, ?, NULL, ?
          FROM complaints WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        options.response,
        JSON.stringify({ sellerResponse: true }),
        options.requestId,
        options.now,
        options.complaintId,
        options.requestId,
      ),
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'complaint',
      sourceId: options.complaintId,
      eventId: options.requestId,
      actorId: options.actorId,
      action: 'seller_response',
      now: options.now,
    })),
  ]);
  if ((results[0].meta.changes ?? 0) < 1)
    throw new ComplaintConflictError(
      'This complaint already has a seller response or is closed.',
    );
}

export async function listComplaintsForOperations(
  database: D1Database,
  limit = 150,
): Promise<readonly ComplaintRow[]> {
  const result = await database
    .prepare(
      `${complaintSelect} ORDER BY CASE complaints.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, complaints.updated_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<ComplaintRow>();
  return result.results;
}

export async function getOperationsComplaintDetail(
  database: D1Database,
  complaintId: string,
): Promise<ComplaintDetail | null> {
  const row = await database
    .prepare(
      `SELECT base.*, orders.customer_email AS customerEmail,
        orders.customer_phone AS customerPhone, complaints.seller_id AS sellerId
       FROM (${complaintSelect}) AS base
       INNER JOIN complaints ON complaints.id = base.id
       INNER JOIN orders ON orders.id = complaints.order_id
       WHERE base.id = ? LIMIT 1`,
    )
    .bind(complaintId)
    .first<
      ComplaintRow & {
        customerEmail: string;
        customerPhone: string;
        sellerId: string | null;
      }
    >();
  return row
    ? { ...row, staffFollowup:await aftercareFollowup(database,'complaint',row.id),events: await complaintEvents(database, row.id) }
    : null;
}

export type ComplaintAdminAction =
  | 'assign_to_me'
  | 'investigate'
  | 'request_customer'
  | 'escalate'
  | 'resolve'
  | 'close'
  | 'reopen';

export async function updateComplaintAsAdmin(
  database: D1Database,
  options: {
    complaintId: string;
    actorId: string;
    actorRole: StaffRole;
    action: ComplaintAdminAction;
    note: string;
    publicMessageEn: string;
    publicMessageNe: string;
    resolutionEn?: string;
    resolutionNe?: string;
    requestId: string;
    now: number;
    form?: CommerceForm;
  },
): Promise<void> {
  if (options.form && options.form.answers.formId !== 'staff.complaint-case-action')
    throw new ComplaintConflictError('Complaint form context is invalid.');
  const authority = await staffMutationGuard(database, options.actorId,
    'support.manage', ComplaintConflictError, options.actorRole);
  const catalogDigest = await digestFormRequest({ caseId: options.complaintId,
    actorId: options.actorId, actorRole: options.actorRole, action: options.action,
    note: options.note, publicMessageEn: options.publicMessageEn,
    publicMessageNe: options.publicMessageNe, resolutionEn: options.resolutionEn ?? null,
    resolutionNe: options.resolutionNe ?? null, versionId: options.form?.versionId??null,
    answers: options.form?.answers??null });
  {
    const prior = await database.prepare(`SELECT complaint_id AS caseId, actor_id AS actorId,
      action FROM complaint_events WHERE request_id=? LIMIT 1`).bind(options.requestId)
      .first<{ caseId: string; actorId: string; action: string }>();
    if (prior) {
      const audit = await database.prepare(`SELECT actor_id AS actorId, action,
        next_json AS nextJson FROM audit_logs WHERE request_id=? LIMIT 1`).bind(options.requestId)
        .first<{ actorId: string; action: string; nextJson: string | null }>();
      let savedDigest: unknown;
      try { savedDigest = JSON.parse(audit?.nextJson ?? '').catalogDigest; } catch { /* Conflict below. */ }
      if (prior.caseId !== options.complaintId || prior.actorId !== options.actorId ||
        prior.action !== `admin_${options.action}` || audit?.actorId !== options.actorId ||
        audit.action !== `complaint.admin.${options.action}` || savedDigest !== catalogDigest)
        throw new ComplaintConflictError('This request reference was already used for different complaint content.');
      await assertCommerceFormReplay(database, { formId: 'staff.complaint-case-action',
        requestId: options.requestId, subjectType: 'complaint', subjectId: options.complaintId,
        actorId: options.actorId, form: options.form, conflictError: ComplaintConflictError });
      return;
    }
  }
  const current = await database
    .prepare(`SELECT status FROM complaints WHERE id = ? LIMIT 1`)
    .bind(options.complaintId)
    .first<{ status: string }>();
  if (!current) throw new ComplaintConflictError('Complaint not found.');
  let toStatus: string;
  let assignedTo: string | null = null;
  let escalatedTo: string | null = null;
  if (options.action === 'assign_to_me') {
    if (['resolved', 'closed'].includes(current.status))
      throw new ComplaintConflictError(
        'A closed complaint cannot be assigned.',
      );
    toStatus = 'assigned';
    assignedTo = options.actorId;
  } else if (options.action === 'investigate' || options.action === 'reopen') {
    if (
      options.action === 'reopen'
        ? current.status !== 'resolved'
        : current.status === 'closed'
    )
      throw new ComplaintConflictError(
        'This complaint cannot move to investigation.',
      );
    toStatus = 'investigating';
  } else if (options.action === 'request_customer') {
    if (!['assigned', 'investigating', 'escalated'].includes(current.status))
      throw new ComplaintConflictError(
        'Start the investigation before requesting customer information.',
      );
    toStatus = 'waiting_customer';
  } else if (options.action === 'escalate') {
    if (current.status === 'closed')
      throw new ComplaintConflictError(
        'A closed complaint cannot be escalated.',
      );
    const superAdmin =
      options.actorRole === 'super_admin'
        ? { id: options.actorId }
        : await database
            .prepare(
              `SELECT users.id FROM users INNER JOIN user_roles ON user_roles.user_id = users.id
             WHERE users.status = 'active' AND user_roles.role = 'super_admin'
             ORDER BY users.created_at ASC LIMIT 1`,
            )
            .first<{ id: string }>();
    if (!superAdmin)
      throw new ComplaintConflictError(
        'No active Super Admin is available for escalation.',
      );
    toStatus = 'escalated';
    escalatedTo = superAdmin.id;
  } else if (options.action === 'resolve') {
    if (current.status === 'closed')
      throw new ComplaintConflictError(
        'A closed complaint cannot be resolved again.',
      );
    if (!options.resolutionEn || options.resolutionEn.length < 8)
      throw new ComplaintConflictError('Add the English resolution text.');
    if (!options.resolutionNe || options.resolutionNe.length < 4)
      throw new ComplaintConflictError('Add the Nepali resolution text.');
    toStatus = 'resolved';
  } else if (options.action === 'close') {
    if (current.status !== 'resolved')
      throw new ComplaintConflictError(
        'Resolve the complaint before closing it.',
      );
    toStatus = 'closed';
  } else {
    throw new ComplaintConflictError('Unsupported complaint action.');
  }
  const results = await database.batch([
    database
      .prepare(
        `UPDATE complaints SET status = ?, assigned_to = COALESCE(?, assigned_to),
          assigned_at = CASE WHEN ? IS NOT NULL THEN ? ELSE assigned_at END,
          escalation_reason = CASE WHEN ? = 'escalate' THEN ? ELSE escalation_reason END,
          escalated_to = COALESCE(?, escalated_to),
          resolution = CASE WHEN ? = 'resolve' THEN ? ELSE resolution END,
          resolution_ne = CASE WHEN ? = 'resolve' THEN ? ELSE resolution_ne END,
          resolved_at = CASE WHEN ? = 'resolve' THEN ? WHEN ? = 'reopen' THEN NULL ELSE resolved_at END,
          operation_request_id = ?, updated_at = ? WHERE id = ? AND status = ?`,
      )
      .bind(
        toStatus,
        assignedTo,
        assignedTo,
        options.now,
        options.action,
        options.note,
        escalatedTo,
        options.action,
        options.resolutionEn ?? null,
        options.action,
        options.resolutionNe ?? null,
        options.action,
        options.now,
        options.action,
        options.requestId,
        options.now,
        options.complaintId,
        current.status,
      ),
    database
      .prepare(
        `INSERT INTO complaint_events (
          id, complaint_id, from_status, to_status, action, actor_id, actor_type,
          public_message_en, public_message_ne, internal_note, request_id, created_at
        ) SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM complaints WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        current.status,
        toStatus,
        `admin_${options.action}`,
        options.actorId,
        options.actorRole,
        options.publicMessageEn,
        options.publicMessageNe,
        options.note,
        options.requestId,
        options.now,
        options.complaintId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, ?, 'complaint', id, ?, ?, ?, ?, NULL, ?
          FROM complaints WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        `complaint.admin.${options.action}`,
        options.note,
        JSON.stringify({ status: current.status }),
        JSON.stringify({ status: toStatus, assignedTo, escalatedTo,
          ...(catalogDigest ? { catalogDigest } : {}) }),
        options.requestId,
        options.now,
        options.complaintId,
        options.requestId,
      ),
    ...(options.form ? [...currentFormVersionGuards(database, 'staff.complaint-case-action', options.form.versionId),
    database.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM complaints
      WHERE id=? AND operation_request_id=? AND status=?) THEN 1
      ELSE json_extract('invalid-staff-complaint-transition', '$') END`)
      .bind(options.complaintId, options.requestId, toStatus),
    buildFormAnswerInsert(database, { formId: 'staff.complaint-case-action',
      requestId: options.requestId, versionId: options.form.versionId, subjectType: 'complaint',
      subjectId: options.complaintId, actorId: options.actorId, answers: options.form.answers,
      now: options.now })] : []),
    ...(authority?.statements ?? []),
    database.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM complaints c JOIN orders o ON o.id=c.order_id WHERE c.id=? AND o.customer_id=?) AND NOT EXISTS(SELECT 1 FROM complaints c JOIN order_items i ON i.order_id=c.order_id JOIN seller_profiles s ON s.id=i.seller_id WHERE c.id=? AND s.user_id=?) THEN 1 ELSE json_extract('personally-conflicted-complaint-operator','$') END`).bind(options.complaintId,options.actorId,options.complaintId,options.actorId),
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'complaint',
      sourceId: options.complaintId,
      eventId: options.requestId,
      actorId: options.actorId,
      action: options.action,
      now: options.now,
    })),
  ]);
  if ((results[0].meta.changes ?? 0) < 1)
    throw new ComplaintConflictError(
      'The complaint changed. Refresh and try again.',
    );
}
