import type { StaffRole } from '@/lib/auth/staff';

export class OperationsConflictError extends Error {}

export interface NotificationRow {
  id: string;
  channel: string;
  subjectEn: string;
  subjectNe: string;
  bodyEn: string;
  bodyNe: string;
  status: string;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: number;
  readAt: number | null;
}
export interface ShippingJobRow {
  id: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  direction: string;
  status: string;
  labelReference: string | null;
  trackingCode: string | null;
  pickupWindowStart: number | null;
  pickupWindowEnd: number | null;
  claimReference: string | null;
  reconciliationStatus: string;
  reconciliationNote: string | null;
  updatedAt: number;
}
export interface DataRightsRow {
  id: string;
  referenceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  requestType: string;
  detail: string;
  status: string;
  assignedTo: string | null;
  resolution: string | null;
  createdAt: number;
  updatedAt: number;
}

export async function listNotifications(
  database: D1Database,
  userId: string,
  limit = 100,
): Promise<readonly NotificationRow[]> {
  const result = await database
    .prepare(
      `SELECT id, channel, subject_en AS subjectEn, subject_ne AS subjectNe, body_en AS bodyEn, body_ne AS bodyNe, status, related_type AS relatedType, related_id AS relatedId, created_at AS createdAt, read_at AS readAt FROM notification_messages WHERE recipient_user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<NotificationRow>();
  return result.results;
}

export async function markNotificationRead(
  database: D1Database,
  userId: string,
  notificationId: string,
  now: number,
): Promise<void> {
  const result = await database
    .prepare(
      `UPDATE notification_messages SET status = CASE WHEN channel = 'in_app' THEN 'read' ELSE status END, read_at = COALESCE(read_at, ?) WHERE id = ? AND recipient_user_id = ?`,
    )
    .bind(now, notificationId, userId)
    .run();
  if ((result.meta.changes ?? 0) !== 1)
    throw new OperationsConflictError('Notification not found.');
}

export async function getSellerAnalytics(
  database: D1Database,
  sellerId: string,
) {
  const [summary, inventory, monthly] = await Promise.all([
    database
      .prepare(
        `SELECT COUNT(DISTINCT orders.id) AS orderCount, COALESCE(SUM(CASE WHEN order_items.fulfillment_status = 'delivered' THEN order_items.line_total_paisa ELSE 0 END),0) AS deliveredSalesPaisa, COALESCE(SUM(CASE WHEN order_items.fulfillment_status = 'delivered' THEN order_items.quantity ELSE 0 END),0) AS unitsDelivered, COUNT(DISTINCT CASE WHEN return_requests.id IS NOT NULL THEN return_requests.id END) AS returnCount FROM order_items INNER JOIN orders ON orders.id = order_items.order_id LEFT JOIN return_requests ON return_requests.order_item_id = order_items.id WHERE order_items.seller_id = ?`,
      )
      .bind(sellerId)
      .first<{
        orderCount: number;
        deliveredSalesPaisa: number;
        unitsDelivered: number;
        returnCount: number;
      }>(),
    database
      .prepare(
        `SELECT id, name_en AS nameEn, inventory_quantity AS inventoryQuantity, status FROM products WHERE seller_id = ? ORDER BY inventory_quantity ASC, updated_at DESC LIMIT 50`,
      )
      .bind(sellerId)
      .all<{
        id: string;
        nameEn: string;
        inventoryQuantity: number;
        status: string;
      }>(),
    database
      .prepare(
        `SELECT strftime('%Y-%m', orders.delivered_at / 1000, 'unixepoch') AS month, SUM(order_items.line_total_paisa) AS salesPaisa FROM order_items INNER JOIN orders ON orders.id = order_items.order_id WHERE order_items.seller_id = ? AND order_items.fulfillment_status = 'delivered' AND orders.delivered_at IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 12`,
      )
      .bind(sellerId)
      .all<{ month: string; salesPaisa: number }>(),
  ]);
  return {
    summary: summary ?? {
      orderCount: 0,
      deliveredSalesPaisa: 0,
      unitsDelivered: 0,
      returnCount: 0,
    },
    inventory: inventory.results,
    monthly: monthly.results,
  };
}

export async function getMarketplaceAnalytics(database: D1Database) {
  const [commerce, sellers, cases, finance] = await Promise.all([
    database
      .prepare(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(grand_total_paisa),0) AS grossOrderValuePaisa, COALESCE(SUM(CASE WHEN status = 'delivered' THEN grand_total_paisa ELSE 0 END),0) AS deliveredValuePaisa FROM orders`,
      )
      .first<{
        orders: number;
        grossOrderValuePaisa: number;
        deliveredValuePaisa: number;
      }>(),
    database
      .prepare(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved FROM seller_profiles`,
      )
      .first<{ total: number; approved: number }>(),
    database
      .prepare(
        `SELECT (SELECT COUNT(*) FROM return_requests) AS returns, (SELECT COUNT(*) FROM complaints) AS complaints, (SELECT COUNT(*) FROM complaints WHERE status NOT IN ('resolved','closed')) AS openComplaints`,
      )
      .first<{ returns: number; complaints: number; openComplaints: number }>(),
    database
      .prepare(
        `SELECT COALESCE((SELECT SUM(amount_paisa) FROM refunds WHERE status = 'paid'),0) AS refundedPaisa, COALESCE((SELECT SUM(amount_paisa) FROM payouts WHERE status = 'paid'),0) AS paidOutPaisa`,
      )
      .first<{ refundedPaisa: number; paidOutPaisa: number }>(),
  ]);
  return { commerce, sellers, cases, finance };
}

export async function listShippingJobs(
  database: D1Database,
  sellerId?: string,
): Promise<readonly ShippingJobRow[]> {
  const filter = sellerId ? 'WHERE shipping_jobs.seller_id = ?' : '';
  const result = await database
    .prepare(
      `SELECT shipping_jobs.id, orders.order_number AS orderNumber, shipping_jobs.seller_id AS sellerId, seller_profiles.trading_name AS sellerName, shipping_jobs.direction, shipping_jobs.status, shipping_jobs.label_reference AS labelReference, shipping_jobs.tracking_code AS trackingCode, shipping_jobs.pickup_window_start AS pickupWindowStart, shipping_jobs.pickup_window_end AS pickupWindowEnd, shipping_jobs.claim_reference AS claimReference, shipping_jobs.reconciliation_status AS reconciliationStatus, shipping_jobs.reconciliation_note AS reconciliationNote, shipping_jobs.updated_at AS updatedAt FROM shipping_jobs INNER JOIN orders ON orders.id = shipping_jobs.order_id INNER JOIN seller_profiles ON seller_profiles.id = shipping_jobs.seller_id ${filter} ORDER BY shipping_jobs.updated_at DESC LIMIT 200`,
    )
    .bind(...(sellerId ? [sellerId] : []))
    .all<ShippingJobRow>();
  return result.results;
}

export async function createShippingJob(
  database: D1Database,
  options: {
    orderId: string;
    sellerId: string;
    actorId: string;
    direction: 'outbound' | 'return';
    note: string;
    requestId: string;
    now: number;
  },
): Promise<string> {
  const duplicate = await database
    .prepare(`SELECT id FROM shipping_jobs WHERE created_request_id = ?`)
    .bind(options.requestId)
    .first<{ id: string }>();
  if (duplicate) return duplicate.id;
  const owned = await database
    .prepare(
      `SELECT orders.id FROM orders INNER JOIN order_items ON order_items.order_id = orders.id WHERE orders.id = ? AND order_items.seller_id = ? LIMIT 1`,
    )
    .bind(options.orderId, options.sellerId)
    .first();
  if (!owned)
    throw new OperationsConflictError('Order is not assigned to this seller.');
  const note = options.note.trim();
  if (note.length < 8 || note.length > 1000)
    throw new OperationsConflictError(
      'Add a shipping note of 8–1,000 characters.',
    );
  const id = crypto.randomUUID();
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO shipping_jobs (id, order_id, seller_id, direction, status, carrier, reconciliation_status, created_by, created_request_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'pickup_requested', 'nepal_can_move_manual', 'unreconciled', ?, ?, ?, ?)`,
        )
        .bind(
          id,
          options.orderId,
          options.sellerId,
          options.direction,
          options.actorId,
          options.requestId,
          options.now,
          options.now,
        ),
      database
        .prepare(
          `INSERT INTO shipping_job_events (id, shipping_job_id, from_status, to_status, action, actor_id, actor_role, note, request_id, created_at) VALUES (?, ?, NULL, 'pickup_requested', 'request_pickup', ?, 'seller', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          options.actorId,
          note,
          options.requestId,
          options.now,
        ),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint'))
      throw new OperationsConflictError(
        'A shipping job already exists for this order, seller and direction.',
      );
    throw error;
  }
  return id;
}

export async function operateShippingJob(
  database: D1Database,
  options: {
    jobId: string;
    actorId: string;
    actorRole: 'seller' | StaffRole;
    sellerId?: string;
    action: string;
    note: string;
    labelReference?: string;
    trackingCode?: string;
    pickupStart?: number;
    pickupEnd?: number;
    claimReference?: string;
    reconciliationStatus?: string;
    requestId: string;
    now: number;
  },
): Promise<void> {
  if (
    await database
      .prepare(`SELECT id FROM shipping_job_events WHERE request_id = ?`)
      .bind(options.requestId)
      .first()
  )
    return;
  const current = await database
    .prepare(
      `SELECT status, seller_id AS sellerId FROM shipping_jobs WHERE id = ?`,
    )
    .bind(options.jobId)
    .first<{ status: string; sellerId: string }>();
  if (
    !current ||
    (options.actorRole === 'seller' && current.sellerId !== options.sellerId)
  )
    throw new OperationsConflictError('Shipping job not found.');
  const transitions: Record<string, { from: string[]; to: string }> = {
    record_label: {
      from: ['pickup_requested', 'label_pending'],
      to: 'label_ready',
    },
    schedule_pickup: {
      from: ['pickup_requested', 'label_ready'],
      to: 'pickup_scheduled',
    },
    picked_up: { from: ['pickup_scheduled'], to: 'picked_up' },
    in_transit: { from: ['picked_up'], to: 'in_transit' },
    delivered: { from: ['in_transit'], to: 'delivered' },
    open_claim: {
      from: ['picked_up', 'in_transit', 'delivered'],
      to: 'claim_open',
    },
    resolve_claim: { from: ['claim_open'], to: 'claim_resolved' },
    reconcile: { from: [current.status], to: current.status },
  };
  const transition = transitions[options.action];
  if (!transition || !transition.from.includes(current.status))
    throw new OperationsConflictError(
      'Shipping action is not valid from the current status.',
    );
  if (options.actorRole === 'seller' && !['picked_up'].includes(options.action))
    throw new OperationsConflictError(
      'Seller is not permitted to perform this shipping action.',
    );
  const note = options.note.trim();
  if (note.length < 8)
    throw new OperationsConflictError('Add an operational note.');
  const results = await database.batch([
    database
      .prepare(
        `UPDATE shipping_jobs SET status = ?, label_reference = COALESCE(?, label_reference), tracking_code = COALESCE(?, tracking_code), pickup_window_start = COALESCE(?, pickup_window_start), pickup_window_end = COALESCE(?, pickup_window_end), claim_reference = COALESCE(?, claim_reference), reconciliation_status = COALESCE(?, reconciliation_status), reconciliation_note = CASE WHEN ? IS NULL THEN reconciliation_note ELSE ? END, updated_at = ? WHERE id = ? AND status = ?`,
      )
      .bind(
        transition.to,
        options.labelReference ?? null,
        options.trackingCode ?? null,
        options.pickupStart ?? null,
        options.pickupEnd ?? null,
        options.claimReference ?? null,
        options.reconciliationStatus ?? null,
        options.reconciliationStatus ?? null,
        note,
        options.now,
        options.jobId,
        current.status,
      ),
    database
      .prepare(
        `INSERT INTO shipping_job_events (id, shipping_job_id, from_status, to_status, action, actor_id, actor_role, note, request_id, created_at)
         SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ? FROM shipping_jobs
         WHERE id = ? AND updated_at = ?`,
      )
      .bind(
        crypto.randomUUID(),
        current.status,
        transition.to,
        options.action,
        options.actorId,
        options.actorRole,
        note,
        options.requestId,
        options.now,
        options.jobId,
        options.now,
      ),
  ]);
  if (
    (results[0].meta.changes ?? 0) !== 1 ||
    (results[1].meta.changes ?? 0) !== 1
  )
    throw new OperationsConflictError(
      'Shipping job changed. Refresh and try again.',
    );
}

function rightsReference(now: number) {
  return `DR-${new Date(now).toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}
export async function createDataRightsRequest(
  database: D1Database,
  options: {
    customerId: string;
    requestType: string;
    detail: string;
    requestId: string;
    now: number;
  },
): Promise<string> {
  const duplicate = await database
    .prepare(`SELECT id FROM data_rights_requests WHERE created_request_id = ?`)
    .bind(options.requestId)
    .first<{ id: string }>();
  if (duplicate) return duplicate.id;
  if (
    !['access', 'correction', 'deletion', 'retention_objection'].includes(
      options.requestType,
    ) ||
    options.detail.trim().length < 20
  )
    throw new OperationsConflictError(
      'Select a request type and add at least 20 characters of detail.',
    );
  const id = crypto.randomUUID();
  await database.batch([
    database
      .prepare(
        `INSERT INTO data_rights_requests (id, reference_number, customer_id, request_type, detail, status, created_request_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
      )
      .bind(
        id,
        rightsReference(options.now),
        options.customerId,
        options.requestType,
        options.detail.trim(),
        options.requestId,
        options.now,
        options.now,
      ),
    database
      .prepare(
        `INSERT INTO data_rights_events (id, data_rights_request_id, from_status, to_status, action, actor_id, actor_role, note, operation_request_id, created_at) VALUES (?, ?, NULL, 'submitted', 'submit', ?, 'customer', 'Customer submitted a data-rights request.', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        options.customerId,
        options.requestId,
        options.now,
      ),
  ]);
  return id;
}

export async function listDataRightsRequests(
  database: D1Database,
  customerId?: string,
): Promise<readonly DataRightsRow[]> {
  const filter = customerId ? 'WHERE data_rights_requests.customer_id = ?' : '';
  const result = await database
    .prepare(
      `SELECT data_rights_requests.id, data_rights_requests.reference_number AS referenceNumber, data_rights_requests.customer_id AS customerId, users.display_name AS customerName, users.email AS customerEmail, data_rights_requests.request_type AS requestType, data_rights_requests.detail, data_rights_requests.status, data_rights_requests.assigned_to AS assignedTo, data_rights_requests.resolution, data_rights_requests.created_at AS createdAt, data_rights_requests.updated_at AS updatedAt FROM data_rights_requests INNER JOIN users ON users.id = data_rights_requests.customer_id ${filter} ORDER BY data_rights_requests.created_at DESC LIMIT 200`,
    )
    .bind(...(customerId ? [customerId] : []))
    .all<DataRightsRow>();
  return result.results;
}

export async function operateDataRightsRequest(
  database: D1Database,
  options: {
    id: string;
    actorId: string;
    actorRole: StaffRole;
    action:
      | 'assign'
      | 'request_information'
      | 'approve'
      | 'reject'
      | 'complete';
    note: string;
    requestId: string;
    now: number;
  },
): Promise<void> {
  if (
    await database
      .prepare(
        `SELECT id FROM data_rights_events WHERE operation_request_id = ?`,
      )
      .bind(options.requestId)
      .first()
  )
    return;
  const current = await database
    .prepare(
      `SELECT status, customer_id AS customerId FROM data_rights_requests WHERE id = ?`,
    )
    .bind(options.id)
    .first<{ status: string; customerId: string }>();
  if (!current)
    throw new OperationsConflictError('Data-rights request not found.');
  const map = {
    assign: 'assigned',
    request_information: 'needs_information',
    approve: 'approved',
    reject: 'rejected',
    complete: 'completed',
  } as const;
  const next = map[options.action];
  if (
    ['approve', 'reject', 'complete'].includes(options.action) &&
    options.actorRole !== 'super_admin'
  )
    throw new OperationsConflictError(
      'A Super Admin must approve, reject or complete this request.',
    );
  const note = options.note.trim();
  if (note.length < 8)
    throw new OperationsConflictError('Add a decision note.');
  const results = await database.batch([
    database
      .prepare(
        `UPDATE data_rights_requests SET status = ?, assigned_to = COALESCE(assigned_to, ?), resolution = CASE WHEN ? IN ('rejected','completed') THEN ? ELSE resolution END, operation_request_id = ?, updated_at = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END WHERE id = ? AND status = ?`,
      )
      .bind(
        next,
        options.actorId,
        next,
        note,
        options.requestId,
        options.now,
        next,
        options.now,
        options.id,
        current.status,
      ),
    database
      .prepare(
        `INSERT INTO data_rights_events (id, data_rights_request_id, from_status, to_status, action, actor_id, actor_role, note, operation_request_id, created_at)
         SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ? FROM data_rights_requests
         WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        current.status,
        next,
        options.action,
        options.actorId,
        options.actorRole,
        note,
        options.requestId,
        options.now,
        options.id,
        options.requestId,
      ),
  ]);
  if (
    (results[0].meta.changes ?? 0) !== 1 ||
    (results[1].meta.changes ?? 0) !== 1
  )
    throw new OperationsConflictError(
      'Data-rights request changed. Refresh and try again.',
    );
}

export interface GovernanceOverview {
  rules: readonly {
    id: string;
    code: string;
    titleEn: string;
    titleNe: string;
    severity: string;
    isActive: number;
  }[];
  promotions: readonly {
    id: string;
    nameEn: string;
    nameNe: string;
    placement: string;
    status: string;
    startsAt: number;
    endsAt: number;
    creatorName: string;
    approverName: string | null;
  }[];
  products: readonly { id: string; nameEn: string }[];
  users: readonly {
    id: string;
    displayName: string;
    email: string;
    status: string;
    roles: string;
  }[];
  incidents: readonly {
    id: string;
    referenceNumber: string;
    severity: string;
    status: string;
    title: string;
    resolution: string | null;
  }[];
  backups: readonly {
    id: string;
    scope: string;
    status: string;
    evidenceReference: string;
    note: string;
    verifiedAt: number;
  }[];
}

export async function getGovernanceOverview(
  database: D1Database,
): Promise<GovernanceOverview> {
  const [rules, promotions, products, users, incidents, backups] =
    await Promise.all([
      database
        .prepare(
          `SELECT id, code, title_en AS titleEn, title_ne AS titleNe, severity, is_active AS isActive FROM prohibited_product_rules ORDER BY is_active DESC, severity DESC, code`,
        )
        .all<GovernanceOverview['rules'][number]>(),
      database
        .prepare(
          `SELECT promotions.id, promotions.name_en AS nameEn, promotions.name_ne AS nameNe, promotions.placement, promotions.status, promotions.starts_at AS startsAt, promotions.ends_at AS endsAt, creator.display_name AS creatorName, approver.display_name AS approverName FROM promotions INNER JOIN users creator ON creator.id = promotions.created_by LEFT JOIN users approver ON approver.id = promotions.approved_by ORDER BY promotions.created_at DESC`,
        )
        .all<GovernanceOverview['promotions'][number]>(),
      database
        .prepare(
          `SELECT id, name_en AS nameEn FROM products WHERE status = 'published' ORDER BY name_en`,
        )
        .all<GovernanceOverview['products'][number]>(),
      database
        .prepare(
          `SELECT users.id, users.display_name AS displayName, users.email, users.status, GROUP_CONCAT(user_roles.role, ', ') AS roles FROM users LEFT JOIN user_roles ON user_roles.user_id = users.id GROUP BY users.id ORDER BY users.created_at DESC LIMIT 300`,
        )
        .all<GovernanceOverview['users'][number]>(),
      database
        .prepare(
          `SELECT id, reference_number AS referenceNumber, severity, status, title, resolution FROM operational_incidents ORDER BY created_at DESC LIMIT 100`,
        )
        .all<GovernanceOverview['incidents'][number]>(),
      database
        .prepare(
          `SELECT id, scope, status, evidence_reference AS evidenceReference, note, verified_at AS verifiedAt FROM backup_verifications ORDER BY verified_at DESC LIMIT 100`,
        )
        .all<GovernanceOverview['backups'][number]>(),
    ]);
  return {
    rules: rules.results,
    promotions: promotions.results,
    products: products.results,
    users: users.results,
    incidents: incidents.results,
    backups: backups.results,
  };
}

function requiredText(
  value: string | undefined,
  label: string,
  min = 2,
  max = 1000,
): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length < min || normalized.length > max)
    throw new OperationsConflictError(
      `${label} must be ${min}–${max} characters.`,
    );
  return normalized;
}

function dataText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function performGovernanceAction(
  database: D1Database,
  options: {
    actorId: string;
    actorRole: StaffRole;
    action: string;
    requestId: string;
    data: Record<string, unknown>;
    now: number;
  },
): Promise<void> {
  if (!options.requestId || options.requestId.length > 100)
    throw new OperationsConflictError(
      'A valid request identifier is required.',
    );
  if (
    await database
      .prepare(`SELECT id FROM audit_logs WHERE request_id = ?`)
      .bind(options.requestId)
      .first()
  )
    return;
  const highRisk = [
    'promotion.approve',
    'promotion.reject',
    'user.status',
    'incident.create',
    'incident.update',
    'backup.verify',
  ];
  if (highRisk.includes(options.action) && options.actorRole !== 'super_admin')
    throw new OperationsConflictError(
      'This action requires Super Admin approval.',
    );
  const statements: D1PreparedStatement[] = [];
  let subjectType = 'governance';
  let subjectId = dataText(options.data.id);
  let next: Record<string, unknown> = { action: options.action };
  if (options.action === 'rule.create') {
    const id = crypto.randomUUID();
    subjectType = 'prohibited_product_rule';
    subjectId = id;
    const code = requiredText(dataText(options.data.code), 'Code', 2, 40)
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_');
    const titleEn = requiredText(
      dataText(options.data.titleEn),
      'English title',
      3,
      160,
    );
    const titleNe = requiredText(
      dataText(options.data.titleNe) || titleEn,
      'Stored secondary title',
      2,
      160,
    );
    const descriptionEn = requiredText(
      dataText(options.data.descriptionEn),
      'English description',
      10,
      1000,
    );
    const descriptionNe = requiredText(
      dataText(options.data.descriptionNe) || descriptionEn,
      'Stored secondary description',
      5,
      1000,
    );
    const severity =
      options.data.severity === 'restricted' ? 'restricted' : 'prohibited';
    statements.push(
      database
        .prepare(
          `INSERT INTO prohibited_product_rules (id, code, title_en, title_ne, description_en, description_ne, severity, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .bind(
          id,
          code,
          titleEn,
          titleNe,
          descriptionEn,
          descriptionNe,
          severity,
          options.actorId,
          options.now,
          options.now,
        ),
    );
    next = { code, titleEn, titleNe, severity };
  } else if (options.action === 'rule.toggle') {
    subjectType = 'prohibited_product_rule';
    const active = options.data.isActive === true;
    statements.push(
      database
        .prepare(
          `UPDATE prohibited_product_rules SET is_active = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(active ? 1 : 0, options.now, subjectId),
    );
    next = { isActive: active };
  } else if (options.action === 'promotion.create') {
    const id = crypto.randomUUID();
    subjectType = 'promotion';
    subjectId = id;
    const startsAt = Number(options.data.startsAt);
    const endsAt = Number(options.data.endsAt);
    if (
      !Number.isSafeInteger(startsAt) ||
      !Number.isSafeInteger(endsAt) ||
      endsAt <= startsAt
    )
      throw new OperationsConflictError('Promotion dates are invalid.');
    const placement =
      options.data.placement === 'homepage' ? 'homepage' : 'shop';
    const nameEn = requiredText(
      dataText(options.data.nameEn),
      'English name',
      3,
      160,
    );
    const nameNe = requiredText(
      dataText(options.data.nameNe) || nameEn,
      'Stored secondary name',
      2,
      160,
    );
    const note = requiredText(
      dataText(options.data.note),
      'Promotion note',
      8,
      1000,
    );
    statements.push(
      database
        .prepare(
          `INSERT INTO promotions (id, name_en, name_ne, status, placement, starts_at, ends_at, created_by, approved_by, note, created_request_id, operation_request_id, created_at, updated_at) VALUES (?, ?, ?, 'pending_approval', ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          id,
          nameEn,
          nameNe,
          placement,
          startsAt,
          endsAt,
          options.actorId,
          note,
          options.requestId,
          options.now,
          options.now,
        ),
    );
    const productIds = Array.isArray(options.data.productIds)
      ? [
          ...new Set(
            options.data.productIds.filter(
              (id): id is string => typeof id === 'string',
            ),
          ),
        ].slice(0, 24)
      : [];
    for (const [index, productId] of productIds.entries())
      statements.push(
        database
          .prepare(
            `INSERT INTO promotion_products (promotion_id, product_id, sort_order) SELECT ?, id, ? FROM products WHERE id = ? AND status = 'published'`,
          )
          .bind(id, index, productId),
      );
    next = { nameEn, nameNe, placement, startsAt, endsAt, productIds };
  } else if (
    options.action === 'promotion.approve' ||
    options.action === 'promotion.reject'
  ) {
    subjectType = 'promotion';
    const target = await database
      .prepare(
        `SELECT created_by AS createdBy, status FROM promotions WHERE id = ?`,
      )
      .bind(subjectId)
      .first<{ createdBy: string; status: string }>();
    if (!target || target.status !== 'pending_approval')
      throw new OperationsConflictError(
        'Only a pending promotion can be decided.',
      );
    if (target.createdBy === options.actorId)
      throw new OperationsConflictError(
        'The promotion maker cannot approve their own promotion.',
      );
    const status =
      options.action === 'promotion.approve' ? 'active' : 'rejected';
    statements.push(
      database
        .prepare(
          `UPDATE promotions SET status = ?, approved_by = ?, operation_request_id = ?, updated_at = ? WHERE id = ? AND status = 'pending_approval'`,
        )
        .bind(
          status,
          options.actorId,
          options.requestId,
          options.now,
          subjectId,
        ),
    );
    next = { status };
  } else if (options.action === 'user.status') {
    subjectType = 'user';
    if (subjectId === options.actorId)
      throw new OperationsConflictError(
        'You cannot change your own account status.',
      );
    const status = options.data.status === 'disabled' ? 'disabled' : 'active';
    statements.push(
      database
        .prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`)
        .bind(status, options.now, subjectId),
    );
    next = { status };
  } else if (options.action === 'incident.create') {
    const id = crypto.randomUUID();
    subjectType = 'operational_incident';
    subjectId = id;
    const severityInput = dataText(options.data.severity);
    const severity = ['low', 'medium', 'high', 'critical'].includes(
      severityInput,
    )
      ? severityInput
      : 'medium';
    const title = requiredText(
      dataText(options.data.title),
      'Incident title',
      4,
      160,
    );
    const detail = requiredText(
      dataText(options.data.detail),
      'Incident detail',
      20,
      3000,
    );
    const reference = `INC-${new Date(options.now).toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    statements.push(
      database
        .prepare(
          `INSERT INTO operational_incidents (id, reference_number, severity, status, title, detail, resolution, owner_id, request_id, created_at, updated_at, resolved_at) VALUES (?, ?, ?, 'open', ?, ?, NULL, ?, ?, ?, ?, NULL)`,
        )
        .bind(
          id,
          reference,
          severity,
          title,
          detail,
          options.actorId,
          options.requestId,
          options.now,
          options.now,
        ),
    );
    next = { reference, severity, title };
  } else if (options.action === 'incident.update') {
    subjectType = 'operational_incident';
    const statusInput = dataText(options.data.status);
    const status = ['mitigating', 'monitoring', 'resolved'].includes(
      statusInput,
    )
      ? statusInput
      : 'monitoring';
    const resolution = requiredText(
      dataText(options.data.resolution),
      'Incident note',
      8,
      2000,
    );
    statements.push(
      database
        .prepare(
          `UPDATE operational_incidents SET status = ?, resolution = ?, updated_at = ?, resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END WHERE id = ?`,
        )
        .bind(status, resolution, options.now, status, options.now, subjectId),
    );
    next = { status, resolution };
  } else if (options.action === 'backup.verify') {
    const id = crypto.randomUUID();
    subjectType = 'backup_verification';
    subjectId = id;
    const scopeInput = dataText(options.data.scope);
    const scope = ['d1', 'r2', 'full'].includes(scopeInput)
      ? scopeInput
      : 'full';
    const status = options.data.status === 'failed' ? 'failed' : 'verified';
    const evidence = requiredText(
      dataText(options.data.evidenceReference),
      'Evidence reference',
      4,
      500,
    );
    const note = requiredText(
      dataText(options.data.note),
      'Verification note',
      8,
      1000,
    );
    statements.push(
      database
        .prepare(
          `INSERT INTO backup_verifications (id, scope, status, evidence_reference, note, verified_by, request_id, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          scope,
          status,
          evidence,
          note,
          options.actorId,
          options.requestId,
          options.now,
        ),
    );
    next = { scope, status, evidence };
  } else throw new OperationsConflictError('Unsupported governance action.');
  statements.push(
    database
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, 'Governance console operation', NULL, ?, ?, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        options.action,
        subjectType,
        subjectId,
        JSON.stringify(next),
        options.requestId,
        options.now,
      ),
  );
  try {
    await database.batch(statements);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint'))
      throw new OperationsConflictError(
        'This record or operation already exists.',
      );
    throw error;
  }
}
