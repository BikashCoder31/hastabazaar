import { caseBusinessNotificationStatements } from '../../operations/business-notifications';
import { buildFormAnswerInsert } from './form-answers';
import { assertCommerceFormReplay, type CommerceForm } from './commerce-form-replay';
import { staffMutationGuard } from './staff-mutation-guard';
import { digestFormRequest } from '@/lib/forms/submission';
import type { StaffRole } from '@/lib/auth/staff';
import { splitCreditRefund } from './wallet';
import type { SupportedLocale } from '@/lib/marketplace/types';
import { roundHalfUpRatio } from '@/lib/marketplace/policy';
import {
  evaluateReturnEligibility,
  parseReturnPolicySnapshot,
  type RequestedResolution,
  type ReturnReason,
} from '@/lib/returns/validation';

export class ReturnConflictError extends Error {}

export interface ReturnEvidenceInput {
  id: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  nameSha256?: string;
}

type ReturnReplayRow = { id: string; referenceNumber: string; eligibilityDecision: string;
  orderItemId: string; quantity: number; reason: ReturnReason; requestedResolution: RequestedResolution;
  originalSealIntact: number; detail: string; locale: SupportedLocale };

function assertReturnReplay(row: ReturnReplayRow, options: {
  orderItemId: string; quantity: number; reason: ReturnReason; requestedResolution: RequestedResolution;
  originalSealIntact?: boolean; detail: string; locale: SupportedLocale;
}): void {
  if (row.orderItemId !== options.orderItemId || row.quantity !== options.quantity ||
    row.reason !== options.reason || row.requestedResolution !== options.requestedResolution ||
    Boolean(row.originalSealIntact) !== Boolean(options.originalSealIntact) ||
    row.detail !== options.detail || row.locale !== options.locale) {
    throw new ReturnConflictError('This request ID was already used for different return details.');
  }
}

function evidenceManifest(evidence: readonly ReturnEvidenceInput[]) {
  if (evidence.some((file) => !file.sha256 || !/^[a-f0-9]{64}$/.test(file.sha256) ||
    (file.nameSha256 !== undefined && !/^[a-f0-9]{64}$/.test(file.nameSha256))))
    throw new ReturnConflictError('Evidence content could not be verified for this return request.');
  return evidence.map(({ originalName, mimeType, sizeBytes, sha256, nameSha256 }) => ({
    originalName, mimeType, sizeBytes, sha256, nameSha256,
  }));
}

async function assertReturnEvidenceReplay(database: D1Database, caseId: string,
  requestId: string, submitted: readonly ReturnEvidenceInput[]): Promise<void> {
  const recorded = await database.prepare(`SELECT next_json AS nextJson FROM audit_logs
    WHERE action='return.customer.requested' AND subject_type='return_request'
      AND subject_id=? AND request_id=? LIMIT 1`).bind(caseId, requestId)
    .first<{ nextJson: string | null }>();
  let saved: unknown;
  try { saved = recorded?.nextJson ? JSON.parse(recorded.nextJson).evidenceManifest : undefined; }
  catch { throw new ReturnConflictError('Saved return evidence could not be verified.'); }
  if (saved === undefined) {
    const prior = await database.prepare('SELECT COUNT(*) AS count FROM return_evidence WHERE return_request_id=?')
      .bind(caseId).first<{ count: number }>();
    if ((prior?.count ?? 0) === 0 && submitted.length === 0) return;
  }
  if (JSON.stringify(saved) !== JSON.stringify(evidenceManifest(submitted)))
    throw new ReturnConflictError('This request ID was already used for different return details.');
}

function caseReference(prefix: 'RET' | 'CMP', now: number): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(now))
    .replaceAll('-', '');
  return `${prefix}-${date}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

interface ReturnOrderItemRow {
  orderId: string;
  orderItemId: string;
  orderStatus: string;
  fulfillmentStatus: string;
  deliveredAt: number | null;
  policySnapshotJson: string;
  locale: SupportedLocale;
  itemQuantity: number;
  lineTotalPaisa: number;
  taxPaisa: number;
  deliveryChargePaisa: number;
  returnEligible: number;
}

export async function createCustomerReturnRequest(
  database: D1Database,
  options: {
    orderNumber: string;
    receiptTokenHash: string | null;
    customerId?: string | null;
    orderItemId: string;
    quantity: number;
    reason: ReturnReason;
    requestedResolution: RequestedResolution;
    originalSealIntact?: boolean;
    detail: string;
    locale: SupportedLocale;
    idempotencyKey: string;
    evidence: readonly ReturnEvidenceInput[];
    now: number;
    form?: CommerceForm;
  },
): Promise<{
  id: string;
  referenceNumber: string;
  eligibilityDecision: string;
  duplicate: boolean;
}> {
  const previous = await database
    .prepare(
      `SELECT return_requests.id, return_requests.reference_number AS referenceNumber,
        return_requests.eligibility_decision AS eligibilityDecision,
        return_requests.order_item_id AS orderItemId, return_requests.quantity,
        return_requests.reason, return_requests.requested_resolution AS requestedResolution,
        return_requests.original_seal_intact AS originalSealIntact,
        return_requests.detail, return_requests.locale
       FROM return_requests
       INNER JOIN order_items ON order_items.id = return_requests.order_item_id
       INNER JOIN orders ON orders.id = order_items.order_id
       WHERE return_requests.created_request_id = ?
         AND orders.order_number = ?
         AND (orders.receipt_token_hash = ? OR orders.customer_id = ?)
       LIMIT 1`,
    )
    .bind(
      options.idempotencyKey,
      options.orderNumber,
      options.receiptTokenHash,
      options.customerId ?? null,
    )
    .first<ReturnReplayRow>();
  if (previous) {
    assertReturnReplay(previous, options);
    await assertReturnEvidenceReplay(database, previous.id, options.idempotencyKey, options.evidence);
    await assertCommerceFormReplay(database, { formId: 'commerce.return-request',
      requestId: options.idempotencyKey, subjectType: 'return_request', subjectId: previous.id,
      actorId: options.customerId ?? null, form: options.form, conflictError: ReturnConflictError });
    return { id: previous.id, referenceNumber: previous.referenceNumber,
      eligibilityDecision: previous.eligibilityDecision, duplicate: true };
  }

  const item = await database
    .prepare(
      `SELECT orders.id AS orderId, order_items.id AS orderItemId,
        CASE WHEN EXISTS(SELECT 1 FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=orders.id AND j.seller_id=order_items.seller_id AND p.delivered_at IS NOT NULL) THEN 'delivered' ELSE orders.status END AS orderStatus, order_items.fulfillment_status AS fulfillmentStatus,
        COALESCE((SELECT p.delivered_at FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=orders.id AND j.seller_id=order_items.seller_id),orders.delivered_at) AS deliveredAt,
        orders.return_policy_snapshot_json AS policySnapshotJson, orders.locale,
        order_items.quantity AS itemQuantity,
        order_items.line_total_paisa AS lineTotalPaisa,
        order_items.tax_paisa AS taxPaisa,
        orders.delivery_charge_paisa AS deliveryChargePaisa,
        order_items.return_eligible_snapshot AS returnEligible
       FROM orders INNER JOIN order_items ON order_items.order_id = orders.id
       WHERE orders.order_number = ?
         AND (orders.receipt_token_hash = ? OR orders.customer_id = ?)
         AND order_items.id = ? LIMIT 1`,
    )
    .bind(
      options.orderNumber,
      options.receiptTokenHash,
      options.customerId ?? null,
      options.orderItemId,
    )
    .first<ReturnOrderItemRow>();
  if (!item)
    throw new ReturnConflictError(
      'The selected delivered item could not be verified.',
    );
  if (
    item.orderStatus !== 'delivered' ||
    item.fulfillmentStatus !== 'delivered' ||
    !item.deliveredAt
  ) {
    throw new ReturnConflictError(
      'Returns can be requested only after this item is delivered.',
    );
  }
  if (options.quantity > item.itemQuantity) {
    throw new ReturnConflictError(
      'The return quantity is greater than the delivered quantity.',
    );
  }
  const existingQuantity = await database
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS quantity,
        MAX(CASE WHEN status NOT IN ('rejected', 'resolved') THEN 1 ELSE 0 END) AS hasOpen
       FROM return_requests WHERE order_item_id = ? AND status != 'rejected'`,
    )
    .bind(options.orderItemId)
    .first<{ quantity: number; hasOpen: number }>();
  if (existingQuantity?.hasOpen) {
    throw new ReturnConflictError(
      'Another return request for this item is still open.',
    );
  }
  if (
    (existingQuantity?.quantity ?? 0) + options.quantity >
    item.itemQuantity
  ) {
    throw new ReturnConflictError(
      'The requested quantity exceeds the remaining returnable quantity.',
    );
  }

  const policy = parseReturnPolicySnapshot(item.policySnapshotJson);
  const eligibility = evaluateReturnEligibility({
    reason: options.reason,
    deliveredAt: item.deliveredAt,
    now: options.now,
    productReturnEligible: Boolean(item.returnEligible),
    originalSealIntact: Boolean(options.originalSealIntact),
    policy,
  });
  const id = crypto.randomUUID();
  const submittedEvidenceManifest = evidenceManifest(options.evidence);
  const referenceNumber = caseReference('RET', options.now);
  const eventId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO return_requests (
          id, reference_number, order_item_id, requested_by, reason, detail,
          locale, quantity, requested_resolution, original_seal_intact,
          status, responsibility,
          eligibility_decision, eligibility_reason_en, eligibility_reason_ne,
          policy_snapshot_json, created_request_id, operation_request_id,
          requested_at, updated_at, resolved_at, reviewed_by
        ) SELECT ?, ?, order_items.id, NULL, ?, ?, ?, ?, ?, ?, 'requested',
          'undetermined', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL
          FROM order_items INNER JOIN orders ON orders.id = order_items.order_id
          WHERE order_items.id = ? AND orders.order_number = ?
            AND (orders.receipt_token_hash = ? OR orders.customer_id = ?)
            AND (orders.status = 'delivered' OR EXISTS(SELECT 1 FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=orders.id AND j.seller_id=order_items.seller_id AND p.delivered_at IS NOT NULL))
            AND order_items.fulfillment_status = 'delivered'
            AND NOT EXISTS (
              SELECT 1 FROM return_requests WHERE order_item_id = order_items.id
                AND status NOT IN ('rejected', 'resolved')
            )
            AND ? <= order_items.quantity - COALESCE((
              SELECT SUM(quantity) FROM return_requests
              WHERE order_item_id = order_items.id AND status != 'rejected'
            ), 0)`,
      )
      .bind(
        id,
        referenceNumber,
        options.reason,
        options.detail,
        options.locale,
        options.quantity,
        options.requestedResolution,
        options.originalSealIntact ? 1 : 0,
        eligibility.decision,
        eligibility.reasonEn,
        eligibility.reasonNe,
        item.policySnapshotJson,
        options.idempotencyKey,
        options.idempotencyKey,
        options.now,
        options.now,
        options.orderItemId,
        options.orderNumber,
        options.receiptTokenHash,
        options.customerId ?? null,
        options.quantity,
      ),
    database
      .prepare(
        `INSERT INTO return_request_events (
          id, return_request_id, from_status, to_status, action, actor_id,
          actor_type, public_message_en, public_message_ne, internal_note,
          request_id, created_at
        ) SELECT ?, id, NULL, 'requested', 'customer_requested', NULL,
          'customer', 'Return request received for review.',
          'फिर्ता अनुरोध समीक्षाका लागि प्राप्त भयो।', NULL, ?, ?
          FROM return_requests WHERE id = ? AND created_request_id = ?`,
      )
      .bind(
        eventId,
        options.idempotencyKey,
        options.now,
        id,
        options.idempotencyKey,
      ),
  ];

  // Keep the conditional case insert and its answer/event writes in one rollback boundary.
  // D1 batch success alone does not mean the INSERT ... SELECT matched a row.
  statements.splice(1, 0, database.prepare(
    `SELECT CASE WHEN EXISTS (
      SELECT 1 FROM return_requests WHERE id = ? AND created_request_id = ?
    ) THEN 1 ELSE json_extract('invalid-case-insert', '$') END`,
  ).bind(id, options.idempotencyKey));

  for (const evidence of options.evidence) {
    statements.push(
      database
        .prepare(
          `INSERT INTO return_evidence (
            id, return_request_id, object_key, original_name, mime_type,
            size_bytes, uploaded_by_type, uploaded_by, created_at
          ) SELECT ?, id, ?, ?, ?, ?, 'customer', NULL, ?
            FROM return_requests WHERE id = ? AND created_request_id = ?`,
        )
        .bind(
          evidence.id,
          evidence.objectKey,
          evidence.originalName,
          evidence.mimeType,
          evidence.sizeBytes,
          options.now,
          id,
          options.idempotencyKey,
        ),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, NULL, 'return.customer.requested', 'return_request', id, ?,
          NULL, ?, ?, NULL, ? FROM return_requests
          WHERE id = ? AND created_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.detail,
        JSON.stringify({
          referenceNumber,
          orderItemId: options.orderItemId,
          quantity: options.quantity,
          reason: options.reason,
          requestedResolution: options.requestedResolution,
          originalSealIntact: Boolean(options.originalSealIntact),
          eligibility: eligibility.decision,
          evidenceManifest: submittedEvidenceManifest,
        }),
        options.idempotencyKey,
        options.now,
        id,
        options.idempotencyKey,
      ),
  );

  if (options.form) statements.push(buildFormAnswerInsert(database, {
    formId: 'commerce.return-request', requestId: options.idempotencyKey,
    versionId: options.form.versionId, subjectType: 'return_request', subjectId: id,
    actorId: options.customerId ?? null, answers: options.form.answers, now: options.now,
  }));

  try {
    statements.push(
      ...(await caseBusinessNotificationStatements(database, {
        sourceType: 'return_request',
        sourceId: id,
        eventId: options.idempotencyKey,
        actorId: options.customerId,
        action: 'created',
        now: options.now,
      })),
    );
    const results = await database.batch(statements);
    if ((results[0].meta.changes ?? 0) !== 1) {
      throw new ReturnConflictError(
        'Another return is open or the remaining item quantity is insufficient.',
      );
    }
  } catch (error) {
    if (error instanceof ReturnConflictError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNIQUE constraint failed')) {
      const duplicate = await database
        .prepare(
          `SELECT id, reference_number AS referenceNumber,
            eligibility_decision AS eligibilityDecision, order_item_id AS orderItemId,
            quantity, reason, requested_resolution AS requestedResolution,
            original_seal_intact AS originalSealIntact, detail, locale
           FROM return_requests WHERE created_request_id = ? LIMIT 1`,
        )
        .bind(options.idempotencyKey)
        .first<ReturnReplayRow>();
      if (duplicate) {
        assertReturnReplay(duplicate, options);
        await assertReturnEvidenceReplay(database, duplicate.id, options.idempotencyKey, options.evidence);
        await assertCommerceFormReplay(database, { formId: 'commerce.return-request',
          requestId: options.idempotencyKey, subjectType: 'return_request', subjectId: duplicate.id,
          actorId: options.customerId ?? null, form: options.form, conflictError: ReturnConflictError });
        return { id: duplicate.id, referenceNumber: duplicate.referenceNumber,
          eligibilityDecision: duplicate.eligibilityDecision, duplicate: true };
      }
      throw new ReturnConflictError(
        'Another return is open or the remaining item quantity is insufficient.',
      );
    }
    throw error;
  }
  return {
    id,
    referenceNumber,
    eligibilityDecision: eligibility.decision,
    duplicate: false,
  };
}

export interface ReturnCaseRow {
  id: string;
  referenceNumber: string;
  orderNumber: string;
  orderItemId: string;
  productName: string;
  sellerName: string;
  quantity: number;
  reason: string;
  detail: string;
  locale: SupportedLocale;
  requestedResolution: string;
  originalSealIntact: number;
  status: string;
  responsibility: string;
  eligibilityDecision: string;
  eligibilityReasonEn: string;
  eligibilityReasonNe: string;
  sellerRecommendation: string | null;
  sellerResponse: string | null;
  investigationSummary: string | null;
  resolutionOutcome: string | null;
  returnShipmentReference: string | null;
  requestedAt: number;
  updatedAt: number;
  resolvedAt: number | null;
  refundId: string | null;
  refundStatus: string | null;
  refundAmountPaisa: number | null;
  refundWalletPaisa: number | null;
  refundDiscountPaisa: number | null;
  refundProviderReference: string | null;
}

export interface CaseEventRow {
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

export interface EvidenceRow {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByType: string;
  createdAt: number;
}

export interface ReturnCaseDetail extends ReturnCaseRow {
  customerEmail?: string;
  customerPhone?: string;
  sellerId?: string;
  itemQuantity?: number;
  lineTotalPaisa?: number;
  taxPaisa?: number;
  deliveryChargePaisa?: number;
  policySnapshotJson?: string;
  approvedBy?: string | null;
  highValueApprovedBy?: string | null;
  isHighValue?: number | null;
  events: readonly CaseEventRow[];
  evidence: readonly EvidenceRow[];
}

const returnSelect = `SELECT return_requests.id,
  return_requests.reference_number AS referenceNumber,
  orders.order_number AS orderNumber, order_items.id AS orderItemId,
  order_items.product_name_snapshot AS productName,
  order_items.seller_name_snapshot AS sellerName, return_requests.quantity,
  return_requests.reason, return_requests.detail, return_requests.locale,
  return_requests.requested_resolution AS requestedResolution,
  return_requests.original_seal_intact AS originalSealIntact,
  return_requests.status, return_requests.responsibility,
  return_requests.eligibility_decision AS eligibilityDecision,
  return_requests.eligibility_reason_en AS eligibilityReasonEn,
  return_requests.eligibility_reason_ne AS eligibilityReasonNe,
  return_requests.seller_recommendation AS sellerRecommendation,
  return_requests.seller_response AS sellerResponse,
  return_requests.investigation_summary AS investigationSummary,
  return_requests.resolution_outcome AS resolutionOutcome,
  return_requests.return_shipment_reference AS returnShipmentReference,
  return_requests.requested_at AS requestedAt,
  return_requests.updated_at AS updatedAt,
  return_requests.resolved_at AS resolvedAt,
  refunds.id AS refundId, refunds.status AS refundStatus,
  refunds.amount_paisa AS refundAmountPaisa,
  refunds.wallet_credit_paisa AS refundWalletPaisa,
  refunds.referral_discount_paisa AS refundDiscountPaisa,
  refunds.provider_reference AS refundProviderReference
  FROM return_requests
  INNER JOIN order_items ON order_items.id = return_requests.order_item_id
  INNER JOIN orders ON orders.id = order_items.order_id
  LEFT JOIN refunds ON refunds.return_request_id = return_requests.id`;

async function returnCaseParts(database: D1Database, returnRequestId: string) {
  const [events, evidence] = await Promise.all([
    database
      .prepare(
        `SELECT id, from_status AS fromStatus, to_status AS toStatus, action,
          actor_type AS actorType, public_message_en AS publicMessageEn,
          public_message_ne AS publicMessageNe, internal_note AS internalNote,
          created_at AS createdAt FROM return_request_events
         WHERE return_request_id = ? ORDER BY created_at ASC`,
      )
      .bind(returnRequestId)
      .all<CaseEventRow>(),
    database
      .prepare(
        `SELECT id, original_name AS originalName, mime_type AS mimeType,
          size_bytes AS sizeBytes, uploaded_by_type AS uploadedByType,
          created_at AS createdAt FROM return_evidence
         WHERE return_request_id = ? ORDER BY created_at ASC`,
      )
      .bind(returnRequestId)
      .all<EvidenceRow>(),
  ]);
  return { events: events.results, evidence: evidence.results };
}

export async function listReturnsForCustomerReceipt(
  database: D1Database,
  orderNumber: string,
  receiptTokenHash: string | null,
  customerId: string | null = null,
): Promise<readonly ReturnCaseRow[]> {
  const result = await database
    .prepare(
      `${returnSelect}
       WHERE orders.order_number = ?
         AND (orders.receipt_token_hash = ? OR orders.customer_id = ?)
       ORDER BY return_requests.requested_at DESC`,
    )
    .bind(orderNumber, receiptTokenHash, customerId)
    .all<ReturnCaseRow>();
  return result.results;
}

export async function getCustomerReturnDetail(
  database: D1Database,
  returnRequestId: string,
  orderNumber: string,
  receiptTokenHash: string | null,
  customerId: string | null = null,
): Promise<ReturnCaseDetail | null> {
  const row = await database
    .prepare(
      `${returnSelect}
       WHERE return_requests.id = ? AND orders.order_number = ?
         AND (orders.receipt_token_hash = ? OR orders.customer_id = ?) LIMIT 1`,
    )
    .bind(returnRequestId, orderNumber, receiptTokenHash, customerId)
    .first<ReturnCaseRow>();
  if (!row) return null;
  return { ...row, ...(await returnCaseParts(database, row.id)) };
}

export async function addCustomerReturnClarification(
  database: D1Database,
  options: {
    returnRequestId: string;
    orderNumber: string;
    receiptTokenHash: string | null;
    customerId?: string | null;
    message: string;
    locale: SupportedLocale;
    requestId: string;
    now: number;
  },
): Promise<void> {
  const duplicate = await database.prepare(`SELECT id FROM return_request_events WHERE request_id = ? LIMIT 1`)
    .bind(options.requestId).first();
  if (duplicate) return;
  const results = await database.batch([
    database
      .prepare(
        `UPDATE return_requests SET status = 'under_investigation', detail = detail || ?,
          locale = ?, operation_request_id = ?, updated_at = ?
         WHERE id = ? AND status = 'needs_customer_changes'
           AND EXISTS (
             SELECT 1 FROM order_items INNER JOIN orders ON orders.id = order_items.order_id
             WHERE order_items.id = return_requests.order_item_id
               AND orders.order_number = ?
               AND (orders.receipt_token_hash = ? OR orders.customer_id = ?)
           )`,
      )
      .bind(
        `\n\nCustomer clarification: ${options.message}`,
        options.locale,
        options.requestId,
        options.now,
        options.returnRequestId,
        options.orderNumber,
        options.receiptTokenHash,
        options.customerId ?? null,
      ),
    database
      .prepare(
        `INSERT INTO return_request_events (
          id, return_request_id, from_status, to_status, action, actor_id,
          actor_type, public_message_en, public_message_ne, internal_note,
          request_id, created_at
        ) SELECT ?, id, 'needs_customer_changes', 'under_investigation',
          'customer_clarified', NULL, 'customer',
          'Customer supplied the requested information.',
          'ग्राहकले मागिएको जानकारी उपलब्ध गराउनुभयो।', ?, ?, ?
          FROM return_requests WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.message,
        options.requestId,
        options.now,
        options.returnRequestId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, NULL, 'return.customer.clarified', 'return_request', id, ?,
          ?, ?, ?, NULL, ? FROM return_requests
          WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.message,
        JSON.stringify({ status: 'needs_customer_changes' }),
        JSON.stringify({ status: 'under_investigation' }),
        options.requestId,
        options.now,
        options.returnRequestId,
        options.requestId,
      ),
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'return_request',
      sourceId: options.returnRequestId,
      eventId: options.requestId,
      actorId: options.customerId,
      action: 'customer_response',
      now: options.now,
    })),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new ReturnConflictError(
      'This return request no longer needs customer information.',
    );
  }
}

export async function listReturnsForSeller(
  database: D1Database,
  sellerId: string,
  limit = 100,
): Promise<readonly ReturnCaseRow[]> {
  const result = await database
    .prepare(
      `${returnSelect}
       WHERE order_items.seller_id = ?
       ORDER BY return_requests.updated_at DESC LIMIT ?`,
    )
    .bind(sellerId, limit)
    .all<ReturnCaseRow>();
  return result.results;
}

export async function getSellerReturnDetail(
  database: D1Database,
  returnRequestId: string,
  sellerId: string,
): Promise<ReturnCaseDetail | null> {
  const row = await database
    .prepare(
      `${returnSelect}
       WHERE return_requests.id = ? AND order_items.seller_id = ? LIMIT 1`,
    )
    .bind(returnRequestId, sellerId)
    .first<ReturnCaseRow>();
  if (!row) return null;
  return { ...row, ...(await returnCaseParts(database, row.id)) };
}

export async function respondToReturnAsSeller(
  database: D1Database,
  options: {
    returnRequestId: string;
    sellerId: string;
    actorId: string;
    recommendation: 'accept' | 'contest' | 'request_information';
    response: string;
    locale: SupportedLocale;
    requestId: string;
    now: number;
    form?: CommerceForm;
  },
): Promise<void> {
  if (!['accept', 'contest', 'request_information'].includes(options.recommendation) ||
      !['en-NP', 'ne-NP'].includes(options.locale) ||
      options.response.trim().length < 20 || options.response.length > 2000 ||
      options.requestId.length < 8 || options.requestId.length > 100)
    throw new ReturnConflictError('Seller response details are invalid.');
  const seller = await database.prepare(`SELECT 1 AS valid FROM seller_profiles s
    JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=?
      AND s.status='approved' AND u.status='active' LIMIT 1`)
    .bind(options.sellerId, options.actorId).first();
  if (!seller) throw new ReturnConflictError('Seller authority changed.');
  const duplicate = await database
    .prepare(
      `SELECT e.return_request_id AS caseId,e.actor_id AS actorId,e.internal_note AS response,
        e.action,r.seller_recommendation AS recommendation,r.seller_response_locale AS locale,
        i.seller_id AS sellerId FROM return_request_events e
        JOIN return_requests r ON r.id=e.return_request_id
        JOIN order_items i ON i.id=r.order_item_id
        WHERE e.request_id = ? LIMIT 1`,
    )
    .bind(options.requestId)
    .first<{ caseId: string; actorId: string | null; response: string | null;
      action: string; recommendation: string | null; locale: string | null; sellerId: string }>();
  if (duplicate) {
    if (duplicate.caseId !== options.returnRequestId || duplicate.actorId !== options.actorId ||
        duplicate.sellerId !== options.sellerId || duplicate.action !== 'seller_responded' ||
        duplicate.response !== options.response || duplicate.recommendation !== options.recommendation ||
        duplicate.locale !== options.locale)
      throw new ReturnConflictError('This request was already used for a different response.');
    await assertCommerceFormReplay(database, { formId: 'seller.case-return-response',
      requestId: options.requestId, subjectType: 'return_request', subjectId: duplicate.caseId,
      actorId: options.actorId, form: options.form, conflictError: ReturnConflictError });
    return;
  }
  const current = await database.prepare(`SELECT r.status FROM return_requests r
    JOIN order_items i ON i.id=r.order_item_id
    WHERE r.id=? AND i.seller_id=? AND r.seller_response IS NULL LIMIT 1`)
    .bind(options.returnRequestId, options.sellerId).first<{ status: string }>();
  if (!current || current.status !== 'requested')
    throw new ReturnConflictError('This case is not awaiting a seller response.');
  const results = await database.batch([
    database
      .prepare(
        `UPDATE return_requests SET seller_recommendation = ?, seller_response = ?,
          seller_response_locale = ?, seller_responded_by = ?, seller_responded_at = ?,
          status = 'under_investigation', operation_request_id = ?, updated_at = ?
         WHERE id = ? AND status = 'requested' AND seller_response IS NULL
           AND EXISTS (
             SELECT 1 FROM order_items JOIN seller_profiles s ON s.id=order_items.seller_id
               JOIN users u ON u.id=s.user_id
             WHERE order_items.id = return_requests.order_item_id
               AND order_items.seller_id = ? AND s.user_id=?
               AND s.status='approved' AND u.status='active'
           )`,
      )
      .bind(
        options.recommendation,
        options.response,
        options.locale,
        options.actorId,
        options.now,
        options.requestId,
        options.now,
        options.returnRequestId,
        options.sellerId,
        options.actorId,
      ),
    database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM return_requests
      WHERE id=? AND operation_request_id=? AND seller_responded_by=?)
      THEN 1 ELSE json_extract('invalid-seller-response','$') END`)
      .bind(options.returnRequestId, options.requestId, options.actorId),
    database
      .prepare(
        `INSERT INTO return_request_events (
          id, return_request_id, from_status, to_status, action, actor_id,
          actor_type, public_message_en, public_message_ne, internal_note,
          request_id, created_at
        ) SELECT ?, id, 'requested', 'under_investigation', 'seller_responded', ?,
          'seller', 'Seller response received; HastaBazaar is investigating.',
          'विक्रेताको जवाफ प्राप्त भयो; हथकृति जाँच गर्दैछ।', ?, ?, ?
          FROM return_requests WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        options.response,
        options.requestId,
        options.now,
        options.returnRequestId,
        options.requestId,
      ),
    ...(options.form ? [buildFormAnswerInsert(database, {
      formId: 'seller.case-return-response', requestId: options.requestId,
      versionId: options.form.versionId, subjectType: 'return_request',
      subjectId: options.returnRequestId, actorId: options.actorId,
      answers: options.form.answers, now: options.now,
    })] : []),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, 'return.seller.responded', 'return_request', id, ?, ?, ?, ?, NULL, ?
          FROM return_requests WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        options.response,
        JSON.stringify({ status: 'requested' }),
        JSON.stringify({
          status: 'under_investigation',
          recommendation: options.recommendation,
        }),
        options.requestId,
        options.now,
        options.returnRequestId,
        options.requestId,
      ),
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'return_request',
      sourceId: options.returnRequestId,
      eventId: options.requestId,
      actorId: options.actorId,
      action: 'seller_response',
      now: options.now,
    })),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new ReturnConflictError(
      'This case already has a seller response or is no longer awaiting one.',
    );
  }
}

export async function listReturnsForOperations(
  database: D1Database,
  limit = 150,
): Promise<readonly ReturnCaseRow[]> {
  const result = await database
    .prepare(`${returnSelect} ORDER BY return_requests.updated_at DESC LIMIT ?`)
    .bind(limit)
    .all<ReturnCaseRow>();
  return result.results;
}

export async function getOperationsReturnDetail(
  database: D1Database,
  returnRequestId: string,
): Promise<ReturnCaseDetail | null> {
  const row = await database
    .prepare(
      `SELECT base.*, orders.customer_email AS customerEmail,
        orders.customer_phone AS customerPhone, order_items.seller_id AS sellerId,
        order_items.quantity AS itemQuantity,
        order_items.line_total_paisa AS lineTotalPaisa,
        order_items.tax_paisa AS taxPaisa,
        orders.delivery_charge_paisa AS deliveryChargePaisa,
        return_requests.policy_snapshot_json AS policySnapshotJson,
        refunds.approved_by AS approvedBy,
        refunds.high_value_approved_by AS highValueApprovedBy,
        refunds.is_high_value AS isHighValue
       FROM (${returnSelect}) AS base
       INNER JOIN return_requests ON return_requests.id = base.id
       INNER JOIN order_items ON order_items.id = return_requests.order_item_id
       INNER JOIN orders ON orders.id = order_items.order_id
       LEFT JOIN refunds ON refunds.return_request_id = return_requests.id
       WHERE base.id = ? LIMIT 1`,
    )
    .bind(returnRequestId)
    .first<
      ReturnCaseRow &
        Omit<ReturnCaseDetail, keyof ReturnCaseRow | 'events' | 'evidence'>
    >();
  if (!row) return null;
  return { ...row, ...(await returnCaseParts(database, row.id)) };
}

export type AdminReturnReviewAction = 'request_changes' | 'reject' | 'approve';
export type ReturnResponsibility = 'buyer' | 'seller' | 'carrier' | 'platform';
export type ReturnOutcome = 'refund' | 'replacement' | 'return_to_origin';

async function assertStaffReturnReplay(database: D1Database, options: {
  requestId: string; returnRequestId: string; actorId: string; eventAction: string;
  auditAction: string; digest: string; form: CommerceForm;
}): Promise<boolean> {
  const event = await database.prepare(`SELECT return_request_id AS caseId, actor_id AS actorId,
    action FROM return_request_events WHERE request_id=? LIMIT 1`).bind(options.requestId)
    .first<{ caseId: string; actorId: string; action: string }>();
  if (!event) return false;
  const audit = await database.prepare(`SELECT actor_id AS actorId, action, next_json AS nextJson
    FROM audit_logs WHERE request_id=? LIMIT 1`).bind(options.requestId)
    .first<{ actorId: string; action: string; nextJson: string | null }>();
  let savedDigest: unknown;
  try { savedDigest = JSON.parse(audit?.nextJson ?? '').catalogDigest; } catch { /* Conflict below. */ }
  if (event.caseId !== options.returnRequestId || event.actorId !== options.actorId ||
    event.action !== options.eventAction || audit?.actorId !== options.actorId ||
    audit.action !== options.auditAction || savedDigest !== options.digest)
    throw new ReturnConflictError('This request reference was already used for different return content.');
  await assertCommerceFormReplay(database, { formId: 'staff.return-case-action', requestId: options.requestId,
    subjectType: 'return_request', subjectId: options.returnRequestId, actorId: options.actorId,
    form: options.form, conflictError: ReturnConflictError });
  return true;
}

function returnFormStatements(database: D1Database, options: { returnRequestId: string;
  actorId: string; requestId: string; now: number; form?: CommerceForm }, expectedStatus: string,
  expectedRefundStatus?: string | null): D1PreparedStatement[] {
  if (!options.form) return [];
  return [database.prepare(`SELECT CASE WHEN (SELECT id FROM form_config_versions
    WHERE form_id='staff.return-case-action' AND status='published'
    ORDER BY version DESC LIMIT 1)=? THEN 1
    ELSE json_extract('stale-staff-return-form', '$') END`).bind(options.form.versionId),
  database.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM return_requests
    WHERE id=? AND operation_request_id=? AND status=?) THEN 1
    ELSE json_extract('invalid-staff-return-transition', '$') END`)
    .bind(options.returnRequestId, options.requestId, expectedStatus),
  ...(expectedRefundStatus ? [database.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM refunds
    WHERE return_request_id=? AND operation_request_id=? AND status=?) THEN 1
    ELSE json_extract('invalid-staff-refund-transition', '$') END`)
    .bind(options.returnRequestId, options.requestId, expectedRefundStatus)] : []),
  buildFormAnswerInsert(database, { formId: 'staff.return-case-action', requestId: options.requestId,
    versionId: options.form.versionId, subjectType: 'return_request', subjectId: options.returnRequestId,
    actorId: options.actorId, answers: options.form.answers, now: options.now })];
}

export async function reviewReturnAsAdmin(
  database: D1Database,
  options: {
    returnRequestId: string;
    actorId: string;
    actorRole: StaffRole;
    action: AdminReturnReviewAction;
    note: string;
    publicMessageEn: string;
    publicMessageNe: string;
    responsibility?: ReturnResponsibility;
    outcome?: ReturnOutcome;
    itemRefundPaisa?: number;
    deliveryRefundPaisa?: number;
    requestId: string;
    now: number;
    form?: CommerceForm;
  },
): Promise<void> {
  if (options.form && options.form.answers.formId !== 'staff.return-case-action')
    throw new ReturnConflictError('Return form context is invalid.');
  const authority = options.form ? await staffMutationGuard(database, options.actorId,
    'refund.approve.standard', ReturnConflictError, options.actorRole) : null;
  const catalogDigest = options.form ? await digestFormRequest({ caseId: options.returnRequestId,
    actorId: options.actorId, actorRole: options.actorRole, action: options.action, note: options.note,
    publicMessageEn: options.publicMessageEn, publicMessageNe: options.publicMessageNe,
    responsibility: options.responsibility ?? null, outcome: options.outcome ?? null,
    itemRefundPaisa: options.itemRefundPaisa ?? null, deliveryRefundPaisa: options.deliveryRefundPaisa ?? null,
    versionId: options.form.versionId, answers: options.form.answers }) : null;
  if (options.form && await assertStaffReturnReplay(database, { requestId: options.requestId,
    returnRequestId: options.returnRequestId, actorId: options.actorId,
    eventAction: `admin_${options.action}`, auditAction: `return.admin.${options.action}`,
    digest: catalogDigest!, form: options.form })) return;
  if (
    await database
      .prepare(
        `SELECT id FROM return_request_events WHERE request_id = ? LIMIT 1`,
      )
      .bind(options.requestId)
      .first()
  )
    return;
  const current = await database
    .prepare(
      `SELECT return_requests.status, return_requests.requested_by AS requestedBy,
        return_requests.quantity, return_requests.policy_snapshot_json AS policySnapshotJson,
        orders.id AS orderId, orders.delivery_charge_paisa AS deliveryChargePaisa,
        order_items.id AS orderItemId, order_items.seller_id AS sellerId,
        order_items.quantity AS itemQuantity, order_items.line_total_paisa AS lineTotalPaisa,
        order_items.tax_paisa AS taxPaisa,
        COALESCE(order_items.commission_base_paisa,
          order_items.line_total_paisa - order_items.seller_discount_paisa) AS commissionBasePaisa,
        payments.id AS paymentId
       FROM return_requests
       INNER JOIN order_items ON order_items.id = return_requests.order_item_id
       INNER JOIN orders ON orders.id = order_items.order_id
       LEFT JOIN payments ON payments.order_id = orders.id
       WHERE return_requests.id = ? LIMIT 1`,
    )
    .bind(options.returnRequestId)
    .first<{
      status: string;
      requestedBy: string | null;
      quantity: number;
      policySnapshotJson: string;
      orderId: string;
      deliveryChargePaisa: number;
      orderItemId: string;
      sellerId: string;
      itemQuantity: number;
      lineTotalPaisa: number;
      taxPaisa: number;
      commissionBasePaisa: number;
      paymentId: string | null;
    }>();
  if (
    !current ||
    !['requested', 'under_investigation', 'needs_customer_changes'].includes(
      current.status,
    )
  ) {
    throw new ReturnConflictError(
      'This return request is no longer awaiting an investigation decision.',
    );
  }
  if (current.requestedBy && current.requestedBy === options.actorId) {
    throw new ReturnConflictError(
      'You cannot review a return request that you created.',
    );
  }

  let toStatus =
    options.action === 'request_changes'
      ? 'needs_customer_changes'
      : options.action === 'reject'
        ? 'rejected'
        : 'approved';
  let refundId: string | null = null;
  let refundStatus: string | null = null;
  let isHighValue = false;
  let itemRefundPaisa = 0;
  let deliveryRefundPaisa = 0;
  let amountPaisa = 0;
  let commissionBaseRefundedPaisa = 0;
  let refundCredit = { walletPaisa: 0, discountPaisa: 0, basePaisa: 0 };

  if (options.action === 'approve') {
    if (!options.outcome || !options.responsibility)
      throw new ReturnConflictError(
        'Select the approved outcome and responsible party.',
      );
    if (options.outcome === 'refund') {
      itemRefundPaisa = options.itemRefundPaisa ?? 0;
      deliveryRefundPaisa = options.deliveryRefundPaisa ?? 0;
      amountPaisa = itemRefundPaisa + deliveryRefundPaisa;
      const maximumItemRefund = Math.round(
        ((current.lineTotalPaisa + current.taxPaisa) * current.quantity) /
          current.itemQuantity,
      );
      const paidDelivery = await database
        .prepare(
          `SELECT COALESCE(SUM(refunds.delivery_amount_paisa), 0) AS amount
           FROM refunds WHERE refunds.order_id = ?
             AND refunds.status NOT IN ('rejected', 'failed')`,
        )
        .bind(current.orderId)
        .first<{ amount: number }>();
      const remainingDelivery = Math.max(
        0,
        current.deliveryChargePaisa - (paidDelivery?.amount ?? 0),
      );
      if (
        !Number.isInteger(itemRefundPaisa) ||
        itemRefundPaisa < 0 ||
        itemRefundPaisa > maximumItemRefund
      ) {
        throw new ReturnConflictError(
          'The item refund exceeds the return quantity value.',
        );
      }
      if (
        !Number.isInteger(deliveryRefundPaisa) ||
        deliveryRefundPaisa < 0 ||
        deliveryRefundPaisa > remainingDelivery
      ) {
        throw new ReturnConflictError(
          'The delivery refund exceeds the remaining delivery charge.',
        );
      }
      if (amountPaisa <= 0)
        throw new ReturnConflictError(
          'The approved refund must be greater than zero.',
        );
      const maximumCommissionBaseRefund = roundHalfUpRatio(
        current.commissionBasePaisa,
        current.quantity,
        current.itemQuantity,
      );
      commissionBaseRefundedPaisa = Math.min(
        itemRefundPaisa,
        maximumCommissionBaseRefund,
      );
      const existingCommissionBase = await database
        .prepare(
          `SELECT COALESCE(SUM(refunds.commission_base_refunded_paisa), 0) AS amount
           FROM refunds
           INNER JOIN return_requests ON return_requests.id = refunds.return_request_id
           WHERE return_requests.order_item_id = ?
             AND refunds.status NOT IN ('rejected', 'failed')`,
        )
        .bind(current.orderItemId)
        .first<{ amount: number }>();
      if (
        Number(existingCommissionBase?.amount ?? 0) +
          commissionBaseRefundedPaisa >
        current.commissionBasePaisa
      ) {
        throw new ReturnConflictError(
          'The cumulative refunded merchandise exceeds the original commission base.',
        );
      }
      const policy = parseReturnPolicySnapshot(current.policySnapshotJson);
      isHighValue = amountPaisa >= policy.highValueRefundThresholdPaisa;
      toStatus = isHighValue ? 'pending_high_value_approval' : 'approved';
      refundStatus = isHighValue ? 'pending_high_value_approval' : 'approved';
      refundId = crypto.randomUUID();
      refundCredit = await splitCreditRefund(
        database,
        current.orderId,
        itemRefundPaisa,
      );
    }
  }

  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE return_requests SET status = ?, responsibility = COALESCE(?, responsibility),
          resolution_outcome = COALESCE(?, resolution_outcome),
          investigation_summary = ?, reviewed_by = ?, operation_request_id = ?,
          updated_at = ?, resolved_at = CASE WHEN ? = 'rejected' THEN ? ELSE resolved_at END
         WHERE id = ? AND status = ?`,
      )
      .bind(
        toStatus,
        options.responsibility ?? null,
        options.action === 'reject' ? 'no_action' : (options.outcome ?? null),
        options.note,
        options.actorId,
        options.requestId,
        options.now,
        toStatus,
        options.now,
        options.returnRequestId,
        current.status,
      ),
  ];

  if (refundId && refundStatus && options.responsibility) {
    statements.push(
      database
        .prepare(
          `INSERT INTO refunds (
            id, order_id, return_request_id, payment_id, status, amount_paisa,
            item_amount_paisa, delivery_amount_paisa, reason, requested_by,
            approved_by, high_value_approved_by, processed_by, liability,
            is_high_value, operation_request_id, provider_reference,
            requested_at, approved_at, processed_at, wallet_credit_paisa,
            referral_discount_paisa, credit_base_paisa,
            commission_base_refunded_paisa, commission_reversal_paisa
          ) SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, requested_by, ?, NULL, NULL, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, 0
            FROM return_requests WHERE id = ? AND operation_request_id = ?`,
        )
        .bind(
          refundId,
          current.orderId,
          current.paymentId,
          refundStatus,
          amountPaisa,
          itemRefundPaisa,
          deliveryRefundPaisa,
          options.note,
          options.actorId,
          options.responsibility,
          isHighValue ? 1 : 0,
          options.requestId,
          options.now,
          isHighValue ? null : options.now,
          refundCredit.walletPaisa,
          refundCredit.discountPaisa,
          refundCredit.basePaisa,
          commissionBaseRefundedPaisa,
          options.returnRequestId,
          options.requestId,
        ),
      database
        .prepare(
          `INSERT INTO refund_liability_entries (
            id, refund_id, seller_id, party, amount_paisa, description, created_at
          ) SELECT ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM refunds WHERE id = ? AND operation_request_id = ?)`,
        )
        .bind(
          crypto.randomUUID(),
          refundId,
          options.responsibility === 'seller' ? current.sellerId : null,
          options.responsibility,
          amountPaisa,
          `Approved ${options.responsibility} liability for return ${options.returnRequestId}`,
          options.now,
          refundId,
          options.requestId,
        ),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO return_request_events (
          id, return_request_id, from_status, to_status, action, actor_id,
          actor_type, public_message_en, public_message_ne, internal_note,
          request_id, created_at
        ) SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM return_requests WHERE id = ? AND operation_request_id = ?`,
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
        options.returnRequestId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, ?, 'return_request', id, ?, ?, ?, ?, NULL, ?
          FROM return_requests WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        `return.admin.${options.action}`,
        options.note,
        JSON.stringify({ status: current.status }),
        JSON.stringify({
          status: toStatus,
          outcome: options.outcome,
          responsibility: options.responsibility,
          refundAmountPaisa: amountPaisa || undefined,
          ...(catalogDigest ? { catalogDigest } : {}),
        }),
        options.requestId,
        options.now,
        options.returnRequestId,
        options.requestId,
      ),
  );
  statements.push(
    ...returnFormStatements(database, options, toStatus, refundStatus),
    ...(authority?.statements ?? []),
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'return_request',
      sourceId: options.returnRequestId,
      eventId: options.requestId,
      actorId: options.actorId,
      action: options.action,
      now: options.now,
    })),
  );
  const results = await database.batch(statements);
  if ((results[0].meta.changes ?? 0) !== 1)
    throw new ReturnConflictError(
      'The return request changed. Refresh and try again.',
    );
}

export async function decideHighValueRefund(
  database: D1Database,
  options: {
    returnRequestId: string;
    actorId: string;
    approve: boolean;
    note: string;
    publicMessageEn: string;
    publicMessageNe: string;
    requestId: string;
    now: number;
    form?: CommerceForm;
  },
): Promise<void> {
  if (options.form && options.form.answers.formId !== 'staff.return-case-action')
    throw new ReturnConflictError('Return form context is invalid.');
  const authority = options.form ? await staffMutationGuard(database, options.actorId,
    'refund.approve.high_value', ReturnConflictError, 'super_admin') : null;
  const catalogDigest = options.form ? await digestFormRequest({ caseId: options.returnRequestId,
    actorId: options.actorId, action: options.approve ? 'high_value_approve' : 'high_value_reject',
    note: options.note, publicMessageEn: options.publicMessageEn,
    publicMessageNe: options.publicMessageNe, versionId: options.form.versionId,
    answers: options.form.answers }) : null;
  if (options.form && await assertStaffReturnReplay(database, { requestId: options.requestId,
    returnRequestId: options.returnRequestId, actorId: options.actorId,
    eventAction: options.approve ? 'high_value_approved' : 'high_value_rejected',
    auditAction: options.approve ? 'refund.high_value.approved' : 'refund.high_value.rejected',
    digest: catalogDigest!, form: options.form })) return;
  if (
    await database
      .prepare(
        `SELECT id FROM return_request_events WHERE request_id = ? LIMIT 1`,
      )
      .bind(options.requestId)
      .first()
  )
    return;
  const current = await database
    .prepare(
      `SELECT return_requests.status, refunds.id AS refundId,
        refunds.approved_by AS approvedBy FROM return_requests
       INNER JOIN refunds ON refunds.return_request_id = return_requests.id
       WHERE return_requests.id = ? AND refunds.status = 'pending_high_value_approval'
       LIMIT 1`,
    )
    .bind(options.returnRequestId)
    .first<{ status: string; refundId: string; approvedBy: string | null }>();
  if (!current || current.status !== 'pending_high_value_approval')
    throw new ReturnConflictError(
      'This refund is not awaiting Super Admin approval.',
    );
  if (current.approvedBy === options.actorId)
    throw new ReturnConflictError(
      'A different Super Admin must approve this high-value refund.',
    );
  const toStatus = options.approve ? 'approved' : 'rejected';
  const refundStatus = options.approve ? 'approved' : 'rejected';
  const results = await database.batch([
    database
      .prepare(
        `UPDATE return_requests SET status = ?, operation_request_id = ?, updated_at = ?,
          resolved_at = CASE WHEN ? = 'rejected' THEN ? ELSE resolved_at END
         WHERE id = ? AND status = 'pending_high_value_approval'`,
      )
      .bind(
        toStatus,
        options.requestId,
        options.now,
        toStatus,
        options.now,
        options.returnRequestId,
      ),
    database
      .prepare(
        `UPDATE refunds SET status = ?, high_value_approved_by = ?, approved_at = ?,
          operation_request_id = ? WHERE id = ? AND status = 'pending_high_value_approval'
          AND approved_by != ?`,
      )
      .bind(
        refundStatus,
        options.actorId,
        options.now,
        options.requestId,
        current.refundId,
        options.actorId,
      ),
    database
      .prepare(
        `INSERT INTO return_request_events (
          id, return_request_id, from_status, to_status, action, actor_id,
          actor_type, public_message_en, public_message_ne, internal_note,
          request_id, created_at
        ) SELECT ?, id, 'pending_high_value_approval', ?, ?, ?, 'super_admin',
          ?, ?, ?, ?, ? FROM return_requests WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        toStatus,
        options.approve ? 'high_value_approved' : 'high_value_rejected',
        options.actorId,
        options.publicMessageEn,
        options.publicMessageNe,
        options.note,
        options.requestId,
        options.now,
        options.returnRequestId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, ?, 'refund', ?, ?, ?, ?, ?, NULL, ?
          WHERE EXISTS (SELECT 1 FROM refunds WHERE id = ? AND operation_request_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        options.approve
          ? 'refund.high_value.approved'
          : 'refund.high_value.rejected',
        current.refundId,
        options.note,
        JSON.stringify({ status: 'pending_high_value_approval' }),
        JSON.stringify({ status: refundStatus, ...(catalogDigest ? { catalogDigest } : {}) }),
        options.requestId,
        options.now,
        current.refundId,
        options.requestId,
      ),
    ...returnFormStatements(database, options, toStatus, refundStatus),
    ...(authority?.statements ?? []),
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'return_request',
      sourceId: options.returnRequestId,
      eventId: options.requestId,
      actorId: options.actorId,
      action: 'high_value_decision',
      now: options.now,
    })),
  ]);
  if (
    (results[0].meta.changes ?? 0) !== 1 ||
    (results[1].meta.changes ?? 0) !== 1
  ) {
    throw new ReturnConflictError('The refund changed. Refresh and try again.');
  }
}

export type ReturnOperationsAction =
  | 'mark_in_transit'
  | 'mark_received'
  | 'resolve_replacement'
  | 'resolve_return_to_origin'
  | 'start_refund'
  | 'complete_refund'
  | 'fail_refund';

export async function advanceReturnAsAdmin(
  database: D1Database,
  options: {
    returnRequestId: string;
    actorId: string;
    actorRole: StaffRole;
    action: ReturnOperationsAction;
    note: string;
    publicMessageEn: string;
    publicMessageNe: string;
    reference?: string;
    restockQuantity?: number;
    requestId: string;
    now: number;
    form?: CommerceForm;
  },
): Promise<void> {
  if (options.form && options.form.answers.formId !== 'staff.return-case-action')
    throw new ReturnConflictError('Return form context is invalid.');
  const authority = options.form ? await staffMutationGuard(database, options.actorId,
    'refund.approve.standard', ReturnConflictError, options.actorRole) : null;
  const catalogDigest = options.form ? await digestFormRequest({ caseId: options.returnRequestId,
    actorId: options.actorId, actorRole: options.actorRole, action: options.action,
    note: options.note, publicMessageEn: options.publicMessageEn,
    publicMessageNe: options.publicMessageNe, reference: options.reference?.trim() || null,
    restockQuantity: options.restockQuantity ?? 0, versionId: options.form.versionId,
    answers: options.form.answers }) : null;
  if (options.form && await assertStaffReturnReplay(database, { requestId: options.requestId,
    returnRequestId: options.returnRequestId, actorId: options.actorId,
    eventAction: options.action, auditAction: `return.operations.${options.action}`,
    digest: catalogDigest!, form: options.form })) return;
  if (
    await database
      .prepare(
        `SELECT id FROM return_request_events WHERE request_id = ? LIMIT 1`,
      )
      .bind(options.requestId)
      .first()
  )
    return;
  const current = await database
    .prepare(
      `SELECT return_requests.status, return_requests.resolution_outcome AS outcome,
        return_requests.quantity, return_requests.responsibility,
        order_items.id AS orderItemId, order_items.product_id AS productId,
        order_items.seller_id AS sellerId, orders.id AS orderId,
        products.inventory_quantity AS inventoryQuantity,
        refunds.id AS refundId, refunds.status AS refundStatus,
        refunds.amount_paisa AS refundAmountPaisa,
        refunds.liability AS refundLiability,
        refunds.commission_base_refunded_paisa AS commissionBaseRefundedPaisa,
        COALESCE(order_items.commission_base_paisa,
          order_items.line_total_paisa - order_items.seller_discount_paisa) AS originalCommissionBasePaisa,
        order_items.commission_paisa AS originalCommissionPaisa
       FROM return_requests
       INNER JOIN order_items ON order_items.id = return_requests.order_item_id
       INNER JOIN orders ON orders.id = order_items.order_id
       LEFT JOIN refunds ON refunds.return_request_id = return_requests.id
       LEFT JOIN products ON products.id = order_items.product_id
       WHERE return_requests.id = ? LIMIT 1`,
    )
    .bind(options.returnRequestId)
    .first<{
      status: string;
      outcome: string | null;
      quantity: number;
      responsibility: string;
      orderItemId: string;
      productId: string | null;
      sellerId: string;
      orderId: string;
      inventoryQuantity: number | null;
      refundId: string | null;
      refundStatus: string | null;
      refundAmountPaisa: number | null;
      refundLiability: string | null;
      commissionBaseRefundedPaisa: number | null;
      originalCommissionBasePaisa: number;
      originalCommissionPaisa: number;
    }>();
  if (!current) throw new ReturnConflictError('Return request not found.');
  const restock = options.restockQuantity ?? 0;
  if (!Number.isInteger(restock) || restock < 0 || restock > current.quantity)
    throw new ReturnConflictError(
      'Restock quantity must be within the approved return quantity.',
    );
  const reference = options.reference?.trim() || null;
  const fromStatus = current.status;
  let toStatus = current.status;
  let refundFrom: string | null = null;
  let refundTo: string | null = null;
  let resolvedOutcome: 'refund' | 'replacement' | 'return_to_origin' | null =
    null;

  if (options.action === 'mark_in_transit') {
    if (current.status !== 'approved')
      throw new ReturnConflictError(
        'Only an approved return can be marked in transit.',
      );
    if (!reference || reference.length < 4 || reference.length > 100)
      throw new ReturnConflictError(
        'Add a return shipment reference of 4–100 characters.',
      );
    toStatus = 'in_transit';
  } else if (options.action === 'mark_received') {
    if (current.status !== 'in_transit')
      throw new ReturnConflictError(
        'Only an in-transit return can be marked received.',
      );
    toStatus = 'received';
  } else if (options.action === 'resolve_replacement') {
    if (
      !['approved', 'received'].includes(current.status) ||
      current.outcome !== 'replacement'
    )
      throw new ReturnConflictError(
        'This case is not approved for replacement.',
      );
    if (!reference || reference.length < 4 || reference.length > 100)
      throw new ReturnConflictError(
        'Add a replacement reference of 4–100 characters.',
      );
    toStatus = 'resolved';
    resolvedOutcome = 'replacement';
  } else if (options.action === 'resolve_return_to_origin') {
    if (
      !['approved', 'received'].includes(current.status) ||
      current.outcome !== 'return_to_origin'
    )
      throw new ReturnConflictError(
        'This case is not approved for return to origin.',
      );
    if (!reference || reference.length < 4 || reference.length > 100)
      throw new ReturnConflictError(
        'Add a return-to-origin reference of 4–100 characters.',
      );
    toStatus = 'resolved';
    resolvedOutcome = 'return_to_origin';
  } else if (options.action === 'start_refund') {
    if (
      !['approved', 'received'].includes(current.status) ||
      current.outcome !== 'refund' ||
      !['approved', 'failed'].includes(current.refundStatus || '')
    )
      throw new ReturnConflictError(
        'This refund is not approved for processing.',
      );
    refundFrom = current.refundStatus;
    refundTo = 'processing';
  } else if (options.action === 'complete_refund') {
    if (
      !['approved', 'received'].includes(current.status) ||
      current.outcome !== 'refund' ||
      current.refundStatus !== 'processing'
    )
      throw new ReturnConflictError(
        'Only a processing refund can be completed.',
      );
    if (!reference || reference.length < 4 || reference.length > 120)
      throw new ReturnConflictError(
        'Add a refund transaction reference of 4–120 characters.',
      );
    refundFrom = 'processing';
    refundTo = 'paid';
    toStatus = 'resolved';
    resolvedOutcome = 'refund';
  } else {
    if (!current.refundId || current.refundStatus !== 'processing')
      throw new ReturnConflictError(
        'Only a processing refund can be marked failed.',
      );
    refundFrom = 'processing';
    refundTo = 'failed';
  }

  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE return_requests SET status = ?, operation_request_id = ?, updated_at = ?,
          return_shipment_reference = CASE WHEN ? = 'mark_in_transit' THEN ? ELSE return_shipment_reference END,
          resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END
         WHERE id = ? AND status = ?`,
      )
      .bind(
        toStatus,
        options.requestId,
        options.now,
        options.action,
        reference,
        toStatus,
        options.now,
        options.returnRequestId,
        fromStatus,
      ),
  ];
  if (refundFrom && refundTo && current.refundId) {
    statements.push(
      database
        .prepare(
          `UPDATE refunds SET status = ?, processed_by = ?,
            provider_reference = COALESCE(?, provider_reference),
            operation_request_id = ?, processed_at = CASE WHEN ? = 'paid' THEN ? ELSE processed_at END
           WHERE id = ? AND status = ?`,
        )
        .bind(
          refundTo,
          options.actorId,
          reference,
          options.requestId,
          refundTo,
          options.now,
          current.refundId,
          refundFrom,
        ),
    );
  }
  if (resolvedOutcome) {
    statements.push(
      database
        .prepare(
          `INSERT INTO return_outcomes (
            id, return_request_id, outcome, refund_id, replacement_reference,
            return_shipment_reference, restock_quantity, note_en, note_ne,
            resolved_by, request_id, created_at
          ) SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            FROM return_requests WHERE id = ? AND operation_request_id = ?`,
        )
        .bind(
          crypto.randomUUID(),
          resolvedOutcome,
          resolvedOutcome === 'refund' ? current.refundId : null,
          resolvedOutcome === 'replacement' ? reference : null,
          resolvedOutcome === 'return_to_origin' ? reference : null,
          restock,
          options.publicMessageEn,
          options.publicMessageNe,
          options.actorId,
          options.requestId,
          options.now,
          options.returnRequestId,
          options.requestId,
        ),
    );
    const replacementOut =
      resolvedOutcome === 'replacement' ? current.quantity : 0;
    const inventoryDelta = restock - replacementOut;
    if (
      inventoryDelta < 0 &&
      (current.inventoryQuantity ?? 0) + inventoryDelta < 0
    ) {
      throw new ReturnConflictError(
        'There is not enough inventory to issue this replacement.',
      );
    }
    if (current.productId && inventoryDelta !== 0) {
      statements.push(
        database
          .prepare(
            `UPDATE products SET inventory_quantity = inventory_quantity + ?, updated_at = ?
             WHERE id = ? AND inventory_quantity + ? >= 0
               AND EXISTS (SELECT 1 FROM return_outcomes WHERE return_request_id = ? AND request_id = ?)`,
          )
          .bind(
            inventoryDelta,
            options.now,
            current.productId,
            inventoryDelta,
            options.returnRequestId,
            options.requestId,
          ),
        database
          .prepare(
            `INSERT INTO inventory_adjustments (
              id, product_id, seller_id, actor_id, previous_quantity,
              next_quantity, reason, created_at
            ) SELECT ?, id, ?, ?, inventory_quantity - ?, inventory_quantity, ?, ?
              FROM products WHERE id = ?
                AND EXISTS (SELECT 1 FROM return_outcomes WHERE return_request_id = ? AND request_id = ?)`,
          )
          .bind(
            crypto.randomUUID(),
            current.sellerId,
            options.actorId,
            inventoryDelta,
            `Return outcome ${resolvedOutcome}: ${options.note}`,
            options.now,
            current.productId,
            options.returnRequestId,
            options.requestId,
          ),
      );
    }
  }
  if (
    resolvedOutcome === 'refund' &&
    current.refundId &&
    current.refundLiability === 'seller' &&
    current.refundAmountPaisa
  ) {
    statements.push(
      database
        .prepare(
          `INSERT INTO seller_ledger_entries (
            id, seller_id, order_item_id, refund_id, type, amount_paisa,
            available_at, description, created_at
          ) SELECT ?, ?, ?, ?, 'refund', ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM refunds WHERE id = ? AND status = 'paid' AND operation_request_id = ?)`,
        )
        .bind(
          crypto.randomUUID(),
          current.sellerId,
          current.orderItemId,
          current.refundId,
          -current.refundAmountPaisa,
          options.now,
          `Seller liability for paid refund ${current.refundId}`,
          options.now,
          current.refundId,
          options.requestId,
        ),
      database
        .prepare(
          `UPDATE orders SET payment_status = CASE
            WHEN (SELECT COALESCE(SUM(amount_paisa), 0) FROM refunds WHERE order_id = orders.id AND status = 'paid') >= COALESCE(current_total_paisa,grand_total_paisa) + COALESCE(current_wallet_paisa,wallet_credit_paisa) + COALESCE(current_discount_paisa,referral_discount_paisa) THEN 'refunded'
            ELSE 'part_refunded' END, updated_at = ? WHERE id = ?`,
        )
        .bind(options.now, current.orderId),
    );
  } else if (resolvedOutcome === 'refund') {
    statements.push(
      database
        .prepare(
          `UPDATE orders SET payment_status = CASE
            WHEN (SELECT COALESCE(SUM(amount_paisa), 0) FROM refunds WHERE order_id = orders.id AND status = 'paid') >= COALESCE(current_total_paisa,grand_total_paisa) + COALESCE(current_wallet_paisa,wallet_credit_paisa) + COALESCE(current_discount_paisa,referral_discount_paisa) THEN 'refunded'
            ELSE 'part_refunded' END, updated_at = ? WHERE id = ?`,
        )
        .bind(options.now, current.orderId),
    );
  }
  if (resolvedOutcome === 'refund' && current.refundId) {
    statements.push(
      database
        .prepare(
          `UPDATE refunds AS current_refund
           SET commission_reversal_paisa = CASE
             WHEN (SELECT COALESCE(commission_base_paisa,
                    line_total_paisa - seller_discount_paisa)
                   FROM order_items WHERE id = ?) = 0 THEN 0
             ELSE (
               (2 * (SELECT commission_paisa FROM order_items WHERE id = ?) *
                 (SELECT COALESCE(SUM(r.commission_base_refunded_paisa), 0)
                  FROM refunds r
                  INNER JOIN return_requests rr ON rr.id = r.return_request_id
                  WHERE rr.order_item_id = ? AND r.status = 'paid') +
                 (SELECT COALESCE(commission_base_paisa,
                    line_total_paisa - seller_discount_paisa)
                  FROM order_items WHERE id = ?)) /
               (2 * (SELECT COALESCE(commission_base_paisa,
                    line_total_paisa - seller_discount_paisa)
                  FROM order_items WHERE id = ?))
             ) - (
               SELECT COALESCE(SUM(r.commission_reversal_paisa), 0)
               FROM refunds r
               INNER JOIN return_requests rr ON rr.id = r.return_request_id
               WHERE rr.order_item_id = ? AND r.status = 'paid'
                 AND r.id <> current_refund.id
             )
           END
           WHERE current_refund.id = ? AND current_refund.status = 'paid'
             AND current_refund.operation_request_id = ?`,
        )
        .bind(
          current.orderItemId,
          current.orderItemId,
          current.orderItemId,
          current.orderItemId,
          current.orderItemId,
          current.orderItemId,
          current.refundId,
          options.requestId,
        ),
      database
        .prepare(
          `INSERT OR IGNORE INTO seller_ledger_entries (
            id, seller_id, order_item_id, refund_id, type, amount_paisa,
            available_at, description, created_at
          ) SELECT ?, order_items.seller_id, order_items.id, refunds.id,
            'commission_reversal', refunds.commission_reversal_paisa, ?, ?, ?
            FROM refunds
            INNER JOIN return_requests ON return_requests.id = refunds.return_request_id
            INNER JOIN order_items ON order_items.id = return_requests.order_item_id
            WHERE refunds.id = ? AND refunds.status = 'paid'
              AND refunds.operation_request_id = ?
              AND refunds.commission_reversal_paisa > 0
              AND EXISTS (
                SELECT 1 FROM seller_ledger_entries original_commission
                WHERE original_commission.order_item_id = order_items.id
                  AND original_commission.type = 'commission'
              )`,
        )
        .bind(
          crypto.randomUUID(),
          options.now,
          `Commission reversal for paid refund ${current.refundId}`,
          options.now,
          current.refundId,
          options.requestId,
        ),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO return_request_events (
          id, return_request_id, from_status, to_status, action, actor_id,
          actor_type, public_message_en, public_message_ne, internal_note,
          request_id, created_at
        ) SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM return_requests WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        fromStatus,
        toStatus,
        options.action,
        options.actorId,
        options.actorRole,
        options.publicMessageEn,
        options.publicMessageNe,
        options.note,
        options.requestId,
        options.now,
        options.returnRequestId,
        options.requestId,
      ),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) SELECT ?, ?, ?, 'return_request', id, ?, ?, ?, ?, NULL, ?
          FROM return_requests WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorId,
        `return.operations.${options.action}`,
        options.note,
        JSON.stringify({ returnStatus: fromStatus, refundStatus: refundFrom }),
        JSON.stringify({ returnStatus: toStatus, refundStatus: refundTo,
          ...(catalogDigest ? { catalogDigest } : {}) }),
        options.requestId,
        options.now,
        options.returnRequestId,
        options.requestId,
      ),
  );
  statements.push(
    ...returnFormStatements(database, options, toStatus, refundTo),
    ...(authority?.statements ?? []),
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'return_request',
      sourceId: options.returnRequestId,
      eventId: options.requestId,
      actorId: options.actorId,
      action: options.action,
      now: options.now,
    })),
  );
  const results = await database.batch(statements);
  if ((results[0].meta.changes ?? 0) !== 1)
    throw new ReturnConflictError(
      'The return request changed. Refresh and try again.',
    );
  if (refundFrom && (results[1]?.meta.changes ?? 0) !== 1)
    throw new ReturnConflictError('The refund changed. Refresh and try again.');
}

export async function getReturnEvidenceAccess(
  database: D1Database,
  evidenceId: string,
): Promise<{
  objectKey: string;
  originalName: string;
  mimeType: string;
  orderNumber: string;
  receiptTokenHash: string | null;
  sellerId: string;
} | null> {
  return (
    (await database
      .prepare(
        `SELECT return_evidence.object_key AS objectKey,
          return_evidence.original_name AS originalName,
          return_evidence.mime_type AS mimeType,
          orders.order_number AS orderNumber,
          orders.receipt_token_hash AS receiptTokenHash,
          order_items.seller_id AS sellerId
         FROM return_evidence
         INNER JOIN return_requests ON return_requests.id = return_evidence.return_request_id
         INNER JOIN order_items ON order_items.id = return_requests.order_item_id
         INNER JOIN orders ON orders.id = order_items.order_id
         WHERE return_evidence.id = ? LIMIT 1`,
      )
      .bind(evidenceId)
      .first<{
        objectKey: string;
        originalName: string;
        mimeType: string;
        orderNumber: string;
        receiptTokenHash: string | null;
        sellerId: string;
      }>()) ?? null
  );
}
