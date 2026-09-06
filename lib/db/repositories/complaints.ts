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
  },
): Promise<{ id: string; referenceNumber: string; duplicate: boolean }> {
  const previous = await database
    .prepare(
      `SELECT complaints.id, complaints.reference_number AS referenceNumber
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
    .first<{ id: string; referenceNumber: string }>();
  if (previous) return { ...previous, duplicate: true };
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
            created_at, updated_at, resolved_at
          ) SELECT ?, ?, ?, id, ?, ?, ?, ?, ?, ?, ?, 'open', NULL,
            NULL, NULL, ?, ?, ?, ?, NULL FROM orders
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
          options.now,
          options.now,
          order.orderId,
          options.orderNumber,
          options.receiptTokenHash,
          options.customerId ?? null,
        ),
      database
        .prepare(
          `INSERT INTO complaint_events (
            id, complaint_id, from_status, to_status, action, actor_id,
            actor_type, public_message_en, public_message_ne, internal_note,
            request_id, created_at
          ) SELECT ?, id, NULL, 'open', 'customer_created', NULL, 'customer',
            'Complaint received. Hastabazaar will review it.',
            'गुनासो प्राप्त भयो। हथकृतिले यसको समीक्षा गर्नेछ।', NULL, ?, ?
            FROM complaints WHERE id = ? AND created_request_id = ?`,
        )
        .bind(
          crypto.randomUUID(),
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
          ) SELECT ?, NULL, 'complaint.customer.created', 'complaint', id, ?,
            NULL, ?, ?, NULL, ? FROM complaints WHERE id = ? AND created_request_id = ?`,
        )
        .bind(
          crypto.randomUUID(),
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
    ]);
    if ((results[0].meta.changes ?? 0) !== 1)
      throw new ComplaintConflictError(
        'The complaint could not be linked to this order.',
      );
  } catch (error) {
    if (error instanceof ComplaintConflictError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNIQUE constraint failed')) {
      const duplicate = await database
        .prepare(
          `SELECT id, reference_number AS referenceNumber FROM complaints WHERE created_request_id = ? LIMIT 1`,
        )
        .bind(options.requestId)
        .first<{ id: string; referenceNumber: string }>();
      if (duplicate) return { ...duplicate, duplicate: true };
    }
    throw error;
  }
  return { id, referenceNumber, duplicate: false };
}

export interface ComplaintRow {
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
  return result.results;
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
  return result.results;
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
    ? { ...row, events: await complaintEvents(database, row.id) }
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
  ]);
  if ((results[0].meta.changes ?? 0) !== 1)
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
  return result.results;
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
    ? { ...row, events: await complaintEvents(database, row.id) }
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
  },
): Promise<void> {
  if (
    await database
      .prepare(`SELECT id FROM complaint_events WHERE request_id = ? LIMIT 1`)
      .bind(options.requestId)
      .first()
  )
    return;
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
          AND seller_response IS NULL AND status NOT IN ('resolved', 'closed')`,
      )
      .bind(
        options.response,
        options.actorId,
        options.now,
        options.requestId,
        options.now,
        options.complaintId,
        options.sellerId,
      ),
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
  ]);
  if ((results[0].meta.changes ?? 0) !== 1)
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
    ? { ...row, events: await complaintEvents(database, row.id) }
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
  },
): Promise<void> {
  if (
    await database
      .prepare(`SELECT id FROM complaint_events WHERE request_id = ? LIMIT 1`)
      .bind(options.requestId)
      .first()
  )
    return;
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
        JSON.stringify({ status: toStatus, assignedTo, escalatedTo }),
        options.requestId,
        options.now,
        options.complaintId,
        options.requestId,
      ),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1)
    throw new ComplaintConflictError(
      'The complaint changed. Refresh and try again.',
    );
}
