import {paymentGuard} from '../../payments/manual-receipts';
import {readRefundCurrentProgress,readReturnRefundPaymentProgress,refundBankReturnSettlementSql,type CustomerRefundPaymentProgress,type RefundCurrentProgress} from '../../payments/refund-current-progress';
import {originalReturnDelivery,effectiveDeliveryAllocationSql} from '../../returns/delivery-allocation';
import { prepareRefundDeliveryUnitClaims, usesSellerShipmentDelivery } from '../../returns/seller-shipment-delivery';
import { originalVoluntaryDeliveryTerms } from '../../returns/priced-return-policy';
import { prepareOriginalBuyerMerchandiseRefundGuard, quoteOriginalBuyerMerchandiseRefund } from '../../incentives/original-benefit-refunds';
import {aftercareFollowup,publicAftercareFollowup,type PublicAftercareFollowup} from '../../returns/followup';
import {returnHandlingWorkspace,publicReturnHandling,type ReturnHandlingWorkspace,type PublicReturnHandling} from '../../returns/handling';
import {checkoutCommitClock} from '../../checkout/commit-policy-guards';
import {itemDeliverySql} from '../../returns/item-delivery';
import {withOrderOfferSnapshots,getOrderItemOfferSnapshot} from '../../products/offer-order-contract';
import { buildManagedRefundAdjustmentStatements } from './managed-settlements';
import {managedRefundResponsibilityStatements} from '../../managed-commerce/refund-responsibility';
import { lawfulServiceFeeRefundTotalSql } from './platform-service-fee-refunds';
import { payableOrderTotalSql } from './platform-service-fee';
import { caseBusinessNotificationStatements } from '../../operations/business-notifications';
import { buildFormAnswerInsert } from './form-answers';
import { assertCommerceFormReplay, type CommerceForm } from './commerce-form-replay';
import { currentFormVersionGuards } from '@/lib/forms/native-version';
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
    /** Trusted staff intake only; customer HTTP handlers do not accept this field. */
    supportIntake?:{actorId:string;receivedAt:number;channel:'email'|'support';sourceReference:string};
  },
): Promise<{
  id: string;
  referenceNumber: string;
  eligibilityDecision: string;
  duplicate: boolean;
}> {
  const intake=options.supportIntake,firstReceivedAt=intake?.receivedAt??options.now;
  const intakeAuthority=intake?await staffMutationGuard(database,intake.actorId,'support.manage',ReturnConflictError):null;
  if(intake){
    const clock=await database.prepare(`SELECT ${checkoutCommitClock(database)} AS now`).first<{now:number}>();
    if(!Number.isSafeInteger(intake.receivedAt)||intake.receivedAt<=0||intake.receivedAt>clock!.now||!['email','support'].includes(intake.channel)||intake.sourceReference.trim().length<8||intake.sourceReference.length>500)throw new ReturnConflictError('Record the actual first received time and the retained support source evidence.');
  }
  async function assertIntakeReplay(id:string){
    const row=await database.prepare('SELECT requested_at AS receivedAt,intake_channel AS channel,intake_recorded_by AS actorId,received_evidence_reference AS reference FROM return_requests WHERE id=?').bind(id).first<{receivedAt:number;channel:string;actorId:string|null;reference:string|null}>();
    if(!row||row.channel!==(intake?.channel??'web')||row.actorId!==(intake?.actorId??null)||row.reference!==(intake?.sourceReference.trim()??null)||intake&&row.receivedAt!==intake.receivedAt)throw new ReturnConflictError('This request reference belongs to different original intake evidence.');
  }
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
    await assertIntakeReplay(previous.id);
    assertReturnReplay(previous, options);
    await assertReturnEvidenceReplay(database, previous.id, options.idempotencyKey, options.evidence);
    await assertCommerceFormReplay(database, { formId: 'commerce.return-request',
      requestId: options.idempotencyKey, subjectType: 'return_request', subjectId: previous.id,
      actorId: intake?.actorId??options.customerId ?? null, form: options.form, conflictError: ReturnConflictError });
    return { id: previous.id, referenceNumber: previous.referenceNumber,
      eligibilityDecision: previous.eligibilityDecision, duplicate: true };
  }

  const item = await database
    .prepare(
      `SELECT orders.id AS orderId, order_items.id AS orderItemId,
        CASE WHEN EXISTS(SELECT 1 FROM shipping_jobs j JOIN shipping_parcels p ON p.shipping_job_id=j.id WHERE j.order_id=orders.id AND j.seller_id=order_items.seller_id AND p.delivered_at IS NOT NULL) THEN 'delivered' ELSE orders.status END AS orderStatus, order_items.fulfillment_status AS fulfillmentStatus,
        ${itemDeliverySql()} AS deliveredAt,
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
    item.fulfillmentStatus !== 'delivered'
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
    deliveredAt: item.deliveredAt??0,
    now: firstReceivedAt,
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
          requested_at, updated_at, resolved_at, reviewed_by,recorded_at,intake_channel,intake_recorded_by,received_evidence_reference,delivered_at_snapshot
        ) SELECT ?, ?, order_items.id, ?, ?, ?, ?, ?, ?, ?, 'requested',
          'undetermined', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL,${checkoutCommitClock(database)},?,?,?,?
          FROM order_items INNER JOIN orders ON orders.id = order_items.order_id
          WHERE order_items.id = ? AND orders.order_number = ?
            AND (orders.receipt_token_hash = ? OR orders.customer_id = ?)
            AND COALESCE(${itemDeliverySql()},-1)=?
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
        options.customerId ?? null,
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
        firstReceivedAt,
        options.now,
        intake?.channel??'web',intake?.actorId??null,intake?.sourceReference.trim()??null,item.deliveredAt,
        options.orderItemId,
        options.orderNumber,
        options.receiptTokenHash,
        options.customerId ?? null,
        item.deliveredAt??-1,
        options.quantity,
      ),
    database
      .prepare(
        `INSERT INTO return_request_events (
          id, return_request_id, from_status, to_status, action, actor_id,
          actor_type, public_message_en, public_message_ne, internal_note,
          request_id, created_at
        ) SELECT ?, id, NULL, 'requested', ?, ?,
          ?, 'Return request received for review.',
          'फिर्ता अनुरोध समीक्षाका लागि प्राप्त भयो।', NULL, ?, ?
          FROM return_requests WHERE id = ? AND created_request_id = ?`,
      )
      .bind(
        eventId,
        intake?'support_recorded':'customer_requested',intake?.actorId??null,intakeAuthority?.role??'customer',
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
        ) SELECT ?, ?, ?, 'return_request', id, ?,
          NULL, ?, ?, NULL, ? FROM return_requests
          WHERE id = ? AND created_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        intake?.actorId??options.customerId??null,intake?'return.support.recorded':'return.customer.requested',
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
    actorId: intake?.actorId??options.customerId ?? null, answers: options.form.answers, now: options.now,
  }));

  try {
    statements.push(
      ...(await caseBusinessNotificationStatements(database, {
        sourceType: 'return_request',
        sourceId: id,
        eventId: options.idempotencyKey,
        actorId: intake?.actorId??options.customerId,
        action: 'created',
        now: options.now,
      })),
    );
    statements.push(...intakeAuthority?.statements??[]);
    const results = await database.batch(statements);
    if ((results[0].meta.changes ?? 0) < 1) {
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
        await assertIntakeReplay(duplicate.id);
        assertReturnReplay(duplicate, options);
        await assertReturnEvidenceReplay(database, duplicate.id, options.idempotencyKey, options.evidence);
        await assertCommerceFormReplay(database, { formId: 'commerce.return-request',
          requestId: options.idempotencyKey, subjectType: 'return_request', subjectId: duplicate.id,
          actorId: intake?.actorId??options.customerId ?? null, form: options.form, conflictError: ReturnConflictError });
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
  followup?:PublicAftercareFollowup;
  currentPublicMessage?:string|null;
  physical?:PublicReturnHandling;
  offerSnapshot?: import('../../products/offer-order-contract').OrderOfferSnapshot | null;
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
  refundProgress?:RefundCurrentProgress|null;
  refundPaymentProgress?:CustomerRefundPaymentProgress|null;
  refundAmountPaisa: number | null;
  refundWalletPaisa: number | null;
  refundDiscountPaisa: number | null;
  refundPromoPaisa: number | null;
  refundCashPaisa: number | null;
  refundProviderReference: string | null;
}

async function withCurrentRefundProgress<T extends ReturnCaseRow>(db:D1Database,row:T){
  const refundProgress=row.refundId?await readRefundCurrentProgress(db,row.refundId):null;
  const refundPaymentProgress=row.refundId&&!refundProgress?await readReturnRefundPaymentProgress(db,row.refundId):null;
  return {...row,refundProgress,refundPaymentProgress,
    currentPublicMessage:refundProgress?.message??refundPaymentProgress?.message??row.currentPublicMessage};
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
  deliveryEntitlement?:Awaited<ReturnType<typeof originalReturnDelivery>>;
  pricingEntitlement?: {kind:'ready';itemPaisa:number;deliveryPaisa:number;cashPaisa:number;usesVariantPricing?:boolean;canRetainVoluntaryDelivery?:boolean}
    | {kind:'needs_reconciliation'} | null;
  staffFollowup?:Awaited<ReturnType<typeof aftercareFollowup>>;
  handling?:ReturnHandlingWorkspace;physical?:PublicReturnHandling;
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
  (SELECT e.public_message_en FROM return_request_events e WHERE e.return_request_id=return_requests.id AND e.request_id=return_requests.operation_request_id LIMIT 1) AS currentPublicMessage,
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
  refunds.promo_discount_paisa AS refundPromoPaisa,
  refunds.amount_paisa-refunds.wallet_credit_paisa-refunds.referral_discount_paisa-refunds.promo_discount_paisa AS refundCashPaisa,
  refunds.provider_reference AS refundProviderReference
  FROM return_requests
  INNER JOIN order_items ON order_items.id = return_requests.order_item_id
  INNER JOIN orders ON orders.id = order_items.order_id
  LEFT JOIN refunds ON refunds.return_request_id = return_requests.id`;

async function returnCaseParts(database: D1Database, returnRequestId: string,privateAccess=true) {
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
  return { events: privateAccess?events.results:events.results.map(event=>({...event,internalNote:null})), evidence: evidence.results };
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
  const rows=await withOrderOfferSnapshots(database,result.results,row=>row.orderItemId);
  return Promise.all(rows.map(async row=>withCurrentRefundProgress(database,{...row,investigationSummary:null,followup:await publicAftercareFollowup(database,'return_request',row.id),physical:await publicReturnHandling(database,row.id)})));
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
  return withCurrentRefundProgress(database,{ ...row,investigationSummary:null,followup:await publicAftercareFollowup(database,'return_request',row.id),physical:await publicReturnHandling(database,row.id), offerSnapshot:await getOrderItemOfferSnapshot(database,row.orderItemId), ...(await returnCaseParts(database, row.id,false)) });
}

interface CustomerReturnClarificationScope {
  returnRequestId: string;
  orderNumber: string;
  receiptTokenHash: string | null;
  customerId?: string | null;
}

function readCustomerReturnClarificationSource(database: D1Database, options: CustomerReturnClarificationScope) {
  return database.prepare(`SELECT r.status, h.waiting_for AS waitingFor, h.clarification_at AS clarificationAt
    FROM return_requests r JOIN order_items i ON i.id = r.order_item_id JOIN orders o ON o.id = i.order_id
    LEFT JOIN return_handling h ON h.case_id = r.id
    WHERE r.id = ? AND o.order_number = ? AND (o.receipt_token_hash = ? OR o.customer_id = ?)`)
    .bind(options.returnRequestId, options.orderNumber, options.receiptTokenHash, options.customerId ?? null)
    .first<{ status: string; waitingFor: string | null; clarificationAt: number | null }>();
}

export async function hasCustomerReturnClarificationAccess(database: D1Database, options: CustomerReturnClarificationScope) {
  return Boolean(await readCustomerReturnClarificationSource(database, options));
}

export async function addCustomerReturnClarification(
  database: D1Database,
  options: CustomerReturnClarificationScope & {
    message: string;
    locale: SupportedLocale;
    requestId: string;
    now: number;
    evidence?: readonly ReturnEvidenceInput[];
  },
): Promise<{ duplicate: boolean }> {
  if (options.message.trim().length < 10 || options.message.length > 4000)
    throw new ReturnConflictError('Provide the actual requested clarification.');
  const source = await readCustomerReturnClarificationSource(database, options);
  if (!source) throw new ReturnConflictError('This original return is unavailable.');
  const evidence = options.evidence ?? [];
  const manifest = evidenceManifest(evidence);

  async function hasExactReplay() {
    const saved = await database.prepare(`SELECT e.return_request_id AS caseId, e.action, e.internal_note AS message,
      a.next_json AS nextJson FROM return_request_events e LEFT JOIN audit_logs a
        ON a.subject_type = 'return_request' AND a.subject_id = e.return_request_id
          AND a.action = 'return.customer.clarified' AND a.request_id = e.request_id
      WHERE e.request_id = ? LIMIT 1`).bind(options.requestId)
      .first<{ caseId: string; action: string; message: string; nextJson: string | null }>();
    if (!saved) return false;
    let savedPayload: { evidenceManifest?: unknown; locale?: string } = {};
    try { if (saved.nextJson) savedPayload = JSON.parse(saved.nextJson) as typeof savedPayload; }
    catch { throw new ReturnConflictError('Saved reply evidence could not be verified.'); }
    if (saved.caseId !== options.returnRequestId || saved.action !== 'customer_clarified' || saved.message !== options.message
      || (savedPayload.locale !== undefined && savedPayload.locale !== options.locale)
      || JSON.stringify(savedPayload.evidenceManifest ?? []) !== JSON.stringify(manifest)) {
      throw new ReturnConflictError('This reference already records different clarification content.');
    }
    return true;
  }
  if (await hasExactReplay()) return { duplicate: true };
  if(['resolved','rejected'].includes(source.status)||source.status!=='needs_customer_changes'&&source.waitingFor!=='customer')throw new ReturnConflictError('This case is not waiting for customer clarification.');
  const toStatus=source.status==='needs_customer_changes'?'under_investigation':source.status;
  const statements = [
    database
      .prepare(
        `UPDATE return_requests SET status = ?, detail = detail || ?,
          locale = ?, operation_request_id = ?, updated_at = ?
         WHERE id = ? AND status = ? AND (status='needs_customer_changes' OR EXISTS(SELECT 1 FROM return_handling h WHERE h.case_id=return_requests.id AND h.waiting_for='customer' AND COALESCE(h.clarification_at,-1)=?))
           AND EXISTS (
             SELECT 1 FROM order_items INNER JOIN orders ON orders.id = order_items.order_id
             WHERE order_items.id = return_requests.order_item_id
               AND orders.order_number = ?
               AND (orders.receipt_token_hash = ? OR orders.customer_id = ?)
           )`,
      )
      .bind(
        toStatus,
        `\n\nCustomer clarification: ${options.message}`,
        options.locale,
        options.requestId,
        options.now,
        options.returnRequestId,source.status,source.clarificationAt??-1,
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
        ) SELECT ?, id, ?, ?,
          'customer_clarified', NULL, 'customer',
          'Customer supplied the requested information.',
          'ग्राहकले मागिएको जानकारी उपलब्ध गराउनुभयो।', ?, ?, ?
          FROM return_requests WHERE id = ? AND operation_request_id = ?`,
      )
      .bind(
        crypto.randomUUID(), source.status, toStatus,
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
        JSON.stringify({ status: source.status }),
        JSON.stringify({ status: toStatus, locale: options.locale, evidenceManifest: manifest }),
        options.requestId,
        options.now,
        options.returnRequestId,
        options.requestId,
      ),
    database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM return_requests WHERE id=? AND operation_request_id=?) THEN 1 ELSE json_extract('stale-return-clarification','$') END`).bind(options.returnRequestId,options.requestId),
    ...evidence.map(file => database.prepare(`INSERT INTO return_evidence (
      id, return_request_id, object_key, original_name, mime_type, size_bytes,
      uploaded_by_type, uploaded_by, created_at) SELECT ?, id, ?, ?, ?, ?, 'customer', ?, ?
      FROM return_requests WHERE id = ? AND operation_request_id = ?`)
      .bind(file.id, file.objectKey, file.originalName, file.mimeType, file.sizeBytes,
        options.customerId ?? null, options.now, options.returnRequestId, options.requestId)),
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'return_request',
      sourceId: options.returnRequestId,
      eventId: options.requestId,
      actorId: options.customerId,
      action: 'customer_response',
      now: options.now,
    })),
  ];
  try {
    const results = await database.batch(statements);
    if ((results[0].meta.changes ?? 0) !== 1)
      throw new ReturnConflictError('This return request no longer needs customer information.');
  } catch (error) {
    if (await hasExactReplay()) return { duplicate: true };
    throw error;
  }
  return { duplicate: false };
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
  const rows=await withOrderOfferSnapshots(database,result.results,row=>row.orderItemId);
  return rows.map(row=>({...row,investigationSummary:null,refundProviderReference:null}));
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
  return { ...row,investigationSummary:null,refundProviderReference:null,followup:await publicAftercareFollowup(database,'return_request',row.id),physical:await publicReturnHandling(database,row.id), offerSnapshot:await getOrderItemOfferSnapshot(database,row.orderItemId), ...(await returnCaseParts(database, row.id,false)) };
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
          'seller', 'Seller response received; Hastabazaar is investigating.',
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
  return withOrderOfferSnapshots(database,result.results,row=>row.orderItemId);
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
        return_requests.policy_snapshot_json AS policySnapshotJson, orders.id AS pricingOrderId,
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
        Omit<ReturnCaseDetail, keyof ReturnCaseRow | 'events' | 'evidence'> & {pricingOrderId:string}
    >();
  if (!row) return null;
  const deliveryEntitlement=await originalReturnDelivery(database,row.id);
  let pricingEntitlement:ReturnCaseDetail['pricingEntitlement']=null;
  if (['requested','under_investigation','needs_customer_changes'].includes(row.status)) {
    try {
      const quote=await quoteOriginalBuyerMerchandiseRefund(database,{orderId:row.pricingOrderId,
        orderItemId:row.orderItemId,quantity:row.quantity,
        unitOrdinals:deliveryEntitlement.kind==='ready'?deliveryEntitlement.units?.map(unit=>unit.unitOrdinal):undefined});
      if (quote) pricingEntitlement=deliveryEntitlement.kind==='ready'
        ? {kind:'ready',itemPaisa:quote.itemPaisa,deliveryPaisa:deliveryEntitlement.amountPaisa,
          cashPaisa:quote.cashMerchandisePaisa+deliveryEntitlement.amountPaisa,usesVariantPricing:quote.usesVariantPricing,
          canRetainVoluntaryDelivery:quote.usesVariantPricing&&row.reason==='change_of_mind'&&Boolean(originalVoluntaryDeliveryTerms(row.policySnapshotJson!))}
        : {kind:'needs_reconciliation'};
    } catch { pricingEntitlement={kind:'needs_reconciliation'}; }
  }
  return withCurrentRefundProgress(database,{ ...row,deliveryEntitlement,pricingEntitlement,staffFollowup:await aftercareFollowup(database,'return_request',row.id),handling:await returnHandlingWorkspace(database,row.id),followup:await publicAftercareFollowup(database,'return_request',row.id),physical:await publicReturnHandling(database,row.id), offerSnapshot:await getOrderItemOfferSnapshot(database,row.orderItemId), ...(await returnCaseParts(database, row.id)) });
}

export type AdminReturnReviewAction = 'request_changes' | 'reject' | 'approve';
export type ReturnResponsibility = 'buyer' | 'seller' | 'carrier' | 'platform';
export type ReturnOutcome = 'refund' | 'replacement' | 'return_to_origin';

async function assertStaffReturnReplay(database: D1Database, options: {
  requestId: string; returnRequestId: string; actorId: string; eventAction: string;
  auditAction: string; digest: string; form?: CommerceForm;
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
  if(options.form) await assertCommerceFormReplay(database, { formId: 'staff.return-case-action', requestId: options.requestId,
    subjectType: 'return_request', subjectId: options.returnRequestId, actorId: options.actorId,
    form: options.form, conflictError: ReturnConflictError });
  return true;
}

function returnFormStatements(database: D1Database, options: { returnRequestId: string;
  actorId: string; requestId: string; now: number; form?: CommerceForm }, expectedStatus: string,
  expectedRefundStatus?: string | null): D1PreparedStatement[] {
  if (!options.form) return [];
  return [...currentFormVersionGuards(database, 'staff.return-case-action', options.form.versionId),
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
    decisionEvidenceReference?: string;
    correctSellerFulfillment?: boolean;
    requestId: string;
    now: number;
    form?: CommerceForm;
  },
): Promise<void> {
  if (options.form && options.form.answers.formId !== 'staff.return-case-action')
    throw new ReturnConflictError('Return form context is invalid.');
  const authority = await staffMutationGuard(database, options.actorId,
    'refund.approve.standard', ReturnConflictError, options.actorRole);
  const decisionEvidenceReference=options.decisionEvidenceReference?.trim();
  const catalogDigest = await digestFormRequest({ caseId: options.returnRequestId,
    actorId: options.actorId, actorRole: options.actorRole, action: options.action, note: options.note,
    publicMessageEn: options.publicMessageEn, publicMessageNe: options.publicMessageNe,
    responsibility: options.responsibility ?? null, outcome: options.outcome ?? null,
    itemRefundPaisa: options.itemRefundPaisa ?? null, deliveryRefundPaisa: options.deliveryRefundPaisa ?? null,
    ...(decisionEvidenceReference?{decisionEvidenceReference}:{}),
    ...(options.correctSellerFulfillment===true?{correctSellerFulfillment:true}:{}),
    versionId: options.form?.versionId ?? null, answers: options.form?.answers ?? null });
  if (await assertStaffReturnReplay(database, { requestId: options.requestId,
    returnRequestId: options.returnRequestId, actorId: options.actorId,
    eventAction: `admin_${options.action}`, auditAction: `return.admin.${options.action}`,
    digest: catalogDigest!, form: options.form })) return;
  const current = await database
    .prepare(
      `SELECT return_requests.status, return_requests.reason AS caseReason,return_requests.requested_by AS requestedBy,
        return_requests.quantity, return_requests.policy_snapshot_json AS policySnapshotJson,
        orders.id AS orderId, orders.customer_id AS customerId,
        COALESCE(orders.current_delivery_paisa,orders.delivery_charge_paisa)
          + CASE WHEN orders.promo_discount_paisa>0 AND orders.current_delivery_paisa IS NOT NULL
            THEN COALESCE((SELECT SUM(r.delivery_amount_paisa) FROM refunds r WHERE r.order_id=orders.id AND r.status='paid'),0)
            ELSE 0 END AS deliveryChargePaisa,
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
      caseReason:string;
      customerId: string | null;
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
  if (current.requestedBy === options.actorId || current.customerId === options.actorId) {
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
  let deliverySourceVersion=0;
  let deliveryUnits: readonly { unitOrdinal: number; amountPaisa: number }[] | undefined;
  let pricedRefund: Awaited<ReturnType<typeof quoteOriginalBuyerMerchandiseRefund>> = null;
  let savedDeliveryShare = 0;
  let voluntaryPolicyVersion: string | null = null;
  let trackRetainedDelivery = false;
  let amountPaisa = 0;
  let commissionBaseRefundedPaisa = 0;
  let refundCredit: {walletPaisa:number;discountPaisa:number;basePaisa:number;promoPaisa?:number} = { walletPaisa: 0, discountPaisa: 0, basePaisa: 0 };

  if (options.action === 'approve') {
    if (!options.outcome || !['refund','replacement','return_to_origin'].includes(options.outcome) ||
        !options.responsibility || !['buyer','seller','carrier','platform'].includes(options.responsibility))
      throw new ReturnConflictError(
        'Select the approved outcome and responsible party.',
      );
    if (options.outcome === 'refund') {
      const deliveryEntitlement=await originalReturnDelivery(database,options.returnRequestId);
      if(deliveryEntitlement.kind!=='ready')throw new ReturnConflictError('Reconcile the original saved delivery allocation before approving this refund.');
      deliverySourceVersion=deliveryEntitlement.sourceVersion;
      deliveryUnits = deliveryEntitlement.units;
      try {
        pricedRefund=await quoteOriginalBuyerMerchandiseRefund(database,{orderId:current.orderId,
          orderItemId:current.orderItemId,quantity:current.quantity,unitOrdinals:deliveryUnits?.map(unit=>unit.unitOrdinal)});
      } catch { throw new ReturnConflictError('Reconcile the original saved merchandise and tender before approving this refund.'); }
      if (pricedRefund?.usesVariantPricing) {
        if (!decisionEvidenceReference || decisionEvidenceReference.length<8 || decisionEvidenceReference.length>191 || options.note.trim().length<8)
          throw new ReturnConflictError('Record the reviewed evidence reference and the reason for the refund decision.');
        const namedEvidence=await database.prepare('SELECT return_request_id AS caseId FROM return_evidence WHERE id=?')
          .bind(decisionEvidenceReference).first<{caseId:string}>();
        if (namedEvidence&&namedEvidence.caseId!==options.returnRequestId)
          throw new ReturnConflictError('The named evidence belongs to a different return case.');
        if ((options.responsibility==='platform'||options.responsibility==='carrier') && options.correctSellerFulfillment!==true)
          throw new ReturnConflictError('Confirm from the reviewed evidence that the seller fulfilled correctly.');
        if (options.responsibility==='seller' && (options.correctSellerFulfillment===true||current.caseReason==='change_of_mind'))
          throw new ReturnConflictError('Record separately established seller fault before charging the seller.');
        const savedVoluntaryTerms=originalVoluntaryDeliveryTerms(current.policySnapshotJson);
        trackRetainedDelivery=Boolean(savedVoluntaryTerms);
        if (current.caseReason==='change_of_mind' && options.responsibility==='buyer')
          voluntaryPolicyVersion=savedVoluntaryTerms?.version??null;
      }
      itemRefundPaisa=options.itemRefundPaisa??pricedRefund?.itemPaisa??0;
      savedDeliveryShare=deliveryEntitlement.amountPaisa;
      const approvedDelivery=voluntaryPolicyVersion?0:savedDeliveryShare;
      deliveryRefundPaisa=options.deliveryRefundPaisa??approvedDelivery;
      if(deliveryRefundPaisa!==approvedDelivery)throw new ReturnConflictError(voluntaryPolicyVersion
        ? 'Use the delivery amount in the accepted voluntary return terms.'
        : 'Refund the exact attributable original delivery allocation, including eligible no-fault returns.');
      if (pricedRefund && itemRefundPaisa!==pricedRefund.itemPaisa)
        throw new ReturnConflictError('Use the exact saved buyer merchandise amount for the approved units.');
      if (!Number.isSafeInteger(itemRefundPaisa) || itemRefundPaisa<0 ||
          !Number.isSafeInteger(deliveryRefundPaisa) || deliveryRefundPaisa<0)
        throw new ReturnConflictError('Refund amounts must be non-negative safe integers.');
      const grossRefund=BigInt(itemRefundPaisa)+BigInt(deliveryRefundPaisa);
      if (grossRefund>BigInt(Number.MAX_SAFE_INTEGER))
        throw new ReturnConflictError('The refund total exceeds the supported amount.');
      amountPaisa = Number(grossRefund);
      const maximumItemRefund = pricedRefund?.itemPaisa ?? Math.round(
        ((current.lineTotalPaisa + current.taxPaisa) * current.quantity) /
          current.itemQuantity,
      );
      const paidDelivery = await database
        .prepare(
          `SELECT COALESCE(SUM(refunds.delivery_amount_paisa), 0) AS amount
           FROM refunds WHERE refunds.order_id = ?
             AND refunds.status<>'rejected'`,
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
      if (pricedRefund?.usesVariantPricing) commissionBaseRefundedPaisa=options.responsibility==='seller'?pricedRefund.sellerPrincipalPaisa:0;
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
      toStatus = isHighValue && authority.role!=='super_admin' ? 'pending_high_value_approval' : 'approved';
      refundStatus = toStatus;
      refundId = crypto.randomUUID();
      refundCredit = pricedRefund ?? await splitCreditRefund(
        database,
        current.orderId,
        itemRefundPaisa,
        current.orderItemId,
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
    const versioned=pricedRefund?.usesVariantPricing===true;
    const merchandiseParty=versioned&&options.responsibility==='seller'&&commissionBaseRefundedPaisa===0?'platform':options.responsibility;
    const merchandiseAmount=versioned&&merchandiseParty==='seller'?commissionBaseRefundedPaisa:itemRefundPaisa;
    const deliveryParty=versioned||current.caseReason==='change_of_mind'?'platform':options.responsibility;
    const retainedDelivery=trackRetainedDelivery?`-COALESCE((SELECT SUM(effect.retained_outbound_paisa) FROM refund_variant_pricing_effects effect
      JOIN refunds r ON r.id=effect.refund_id WHERE effect.order_item_id=original_item.id AND r.status<>'rejected'),0)`:'';
    statements.push(
      // Reserve remaining delivery cash for every financial model in this batch.
      // Promo completion already reduces the current snapshot, so add paid
      // delivery back before subtracting all active reservations exactly once.
      database.prepare(`UPDATE orders SET updated_at=updated_at WHERE id=?`).bind(current.orderId),
      database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM orders o WHERE o.id=?
        AND COALESCE(o.current_delivery_paisa,o.delivery_charge_paisa)
          +CASE WHEN o.promo_discount_paisa>0 AND o.current_delivery_paisa IS NOT NULL
            THEN COALESCE((SELECT SUM(r.delivery_amount_paisa) FROM refunds r WHERE r.order_id=o.id AND r.status='paid'),0)
            ELSE 0 END
          -COALESCE((SELECT SUM(r.delivery_amount_paisa) FROM refunds r
            WHERE r.order_id=o.id AND r.status<>'rejected'),0)>=?)
        THEN 1 ELSE json_extract('stale-delivery-refund-capacity','$') END`)
        .bind(current.orderId,deliveryRefundPaisa),
      ...(pricedRefund?prepareOriginalBuyerMerchandiseRefundGuard(database,pricedRefund):[]),
      ...(versioned?paymentGuard(database,`NOT EXISTS(SELECT 1 FROM return_evidence WHERE id=? AND return_request_id<>?)`,
        [decisionEvidenceReference!,options.returnRequestId]):[]),
      ...(deliveryUnits ? paymentGuard(database, 'EXISTS(SELECT 1 FROM orders WHERE id=? AND cancellation_version=?)',
        [current.orderId, deliverySourceVersion])
        : paymentGuard(database,`EXISTS(SELECT 1 FROM orders o JOIN order_items original_item ON original_item.order_id=o.id WHERE original_item.id=? AND o.cancellation_version=?
        AND (${effectiveDeliveryAllocationSql()})-COALESCE((SELECT SUM(r.delivery_amount_paisa) FROM refunds r JOIN return_requests rr ON rr.id=r.return_request_id WHERE rr.order_item_id=original_item.id AND r.status<>'rejected'),0)${retainedDelivery}>=?)`,[current.orderItemId,deliverySourceVersion,savedDeliveryShare])),
      database
        .prepare(
          `INSERT INTO refunds (
            id, order_id, return_request_id, payment_id, status, amount_paisa,
            item_amount_paisa, delivery_amount_paisa, reason, requested_by,
            approved_by, high_value_approved_by, processed_by, liability,
            is_high_value, operation_request_id, provider_reference,
            requested_at, approved_at, processed_at, wallet_credit_paisa,
            referral_discount_paisa, promo_discount_paisa, credit_base_paisa,
            commission_base_refunded_paisa, commission_reversal_paisa
          ) SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, requested_by, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, 0
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
          isHighValue && authority.role==='super_admin'?options.actorId:null,
          options.responsibility,
          isHighValue ? 1 : 0,
          options.requestId,
          options.now,
          refundStatus==='approved'?options.now:null,
          refundCredit.walletPaisa,
          refundCredit.discountPaisa,
          refundCredit.promoPaisa ?? 0,
          refundCredit.basePaisa,
          commissionBaseRefundedPaisa,
          options.returnRequestId,
          options.requestId,
        ),
      ...(deliveryUnits ? prepareRefundDeliveryUnitClaims(database, {
        refundId, orderItemId: current.orderItemId, units: deliveryUnits, now: options.now,
      }) : []),
      ...(pricedRefund?.usesVariantPricing?[database.prepare(`INSERT INTO refund_variant_pricing_effects
        (refund_id,order_item_id,policy_version,quantity,unit_ordinals_json,gross_item_paisa,seller_principal_paisa,
         platform_addition_paisa,tax_paisa,unallocated_merchandise_paisa,saved_delivery_share_paisa,retained_outbound_paisa,
         voluntary_policy_version,decision_evidence_reference,correct_seller_fulfillment,approved_by,created_at)
        VALUES (?,?,'saved_variant_return_v1',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(refundId,current.orderItemId,
        current.quantity,JSON.stringify(pricedRefund.unitOrdinals),itemRefundPaisa,commissionBaseRefundedPaisa,
        pricedRefund.platformAdditionPaisa,pricedRefund.taxPaisa,itemRefundPaisa-merchandiseAmount,
        savedDeliveryShare,savedDeliveryShare-deliveryRefundPaisa,voluntaryPolicyVersion,
        decisionEvidenceReference!,options.correctSellerFulfillment===true?1:0,options.actorId,options.now)]:[]),
      ...([{component:'merchandise',amount:merchandiseAmount,party:merchandiseParty},{component:'original_delivery',amount:deliveryRefundPaisa,party:deliveryParty}].filter(part=>part.amount>0).flatMap(part=>[
        database.prepare(`INSERT INTO refund_cost_allocations(refund_id,component,party,seller_id,amount_paisa,policy_version,created_by,created_at) VALUES(?,?,?,?,?,'approved_original_refund_costs_v1',?,?)`).bind(refundId,part.component,part.party,part.party==='seller'?current.sellerId:null,part.amount,options.actorId,options.now),
        database.prepare('INSERT INTO refund_liability_entries(id,refund_id,seller_id,party,amount_paisa,description,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),refundId,part.party==='seller'?current.sellerId:null,part.party,part.amount,'Approved original '+part.component+' allocation for '+options.returnRequestId,options.now),
      ])),
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
          highValueApprovedBy:isHighValue && authority.role==='super_admin'?options.actorId:null,
          outcome: options.outcome,
          responsibility: options.responsibility,
          ...(pricedRefund?.usesVariantPricing?{pricingPolicyVersion:'saved_variant_return_v1',decisionEvidenceReference,
            correctSellerFulfillment:options.correctSellerFulfillment===true,voluntaryPolicyVersion}:{}),
          refundAmountPaisa: amountPaisa || undefined,
          refundWalletPaisa: refundCredit.walletPaisa,
          refundDiscountPaisa: refundCredit.discountPaisa,
          refundPromoPaisa: refundCredit.promoPaisa ?? 0,
          refundCashPaisa: amountPaisa-refundCredit.walletPaisa-refundCredit.discountPaisa-(refundCredit.promoPaisa ?? 0),
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
    ...authority.statements,
    ...(await caseBusinessNotificationStatements(database, {
      sourceType: 'return_request',
      sourceId: options.returnRequestId,
      eventId: options.requestId,
      actorId: options.actorId,
      action: options.action,
      now: options.now,
    })),
  );
  statements.push(database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM return_requests c
    JOIN order_items i ON i.id=c.order_item_id JOIN orders o ON o.id=i.order_id
    WHERE c.id=? AND c.operation_request_id=? AND c.status=? AND c.reviewed_by=?
      AND (c.requested_by IS NULL OR c.requested_by<>c.reviewed_by)
      AND (o.customer_id IS NULL OR o.customer_id<>c.reviewed_by)) THEN 1
    ELSE json_extract('stale-initial-return-review','$') END`)
    .bind(options.returnRequestId,options.requestId,toStatus,options.actorId));
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
  const authority = await staffMutationGuard(database, options.actorId,
    'refund.approve.high_value', ReturnConflictError, 'super_admin');
  const catalogDigest = await digestFormRequest({ caseId: options.returnRequestId,
    actorId: options.actorId, action: options.approve ? 'high_value_approve' : 'high_value_reject',
    note: options.note, publicMessageEn: options.publicMessageEn,
    publicMessageNe: options.publicMessageNe, versionId: options.form?.versionId ?? null,
    answers: options.form?.answers ?? null });
  if (await assertStaffReturnReplay(database, { requestId: options.requestId,
    returnRequestId: options.returnRequestId, actorId: options.actorId,
    eventAction: options.approve ? 'high_value_approved' : 'high_value_rejected',
    auditAction: options.approve ? 'refund.high_value.approved' : 'refund.high_value.rejected',
    digest: catalogDigest!, form: options.form })) return;
  const current = await database
    .prepare(
      `SELECT return_requests.status, return_requests.requested_by AS requestedBy,
        orders.customer_id AS customerId, orders.delivery_rate_snapshot_json AS deliverySnapshot, refunds.id AS refundId,
        refunds.approved_by AS approvedBy FROM return_requests
       INNER JOIN order_items ON order_items.id=return_requests.order_item_id
       INNER JOIN orders ON orders.id=order_items.order_id
       INNER JOIN refunds ON refunds.return_request_id = return_requests.id
       WHERE return_requests.id = ? AND refunds.status = 'pending_high_value_approval'
       LIMIT 1`,
    )
    .bind(options.returnRequestId)
    .first<{ status: string; refundId: string; approvedBy: string | null; requestedBy:string|null; customerId:string|null; deliverySnapshot:string|null }>();
  if (!current || current.status !== 'pending_high_value_approval')
    throw new ReturnConflictError(
      'This refund is not awaiting Super Admin approval.',
    );
  if(current.requestedBy===options.actorId || current.customerId===options.actorId)
    throw new ReturnConflictError('You cannot review a refund for a return request that you created or an order that you own.');
  const toStatus = options.approve ? 'approved' : 'rejected';
  const refundStatus = options.approve ? 'approved' : 'rejected';
  const outcomeGuardId = crypto.randomUUID();
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
          AND ((approved_by = ?) OR (approved_by IS NULL AND ? IS NULL))`,
      )
      .bind(
        refundStatus,
        options.actorId,
        options.now,
        options.requestId,
        current.refundId,
        current.approvedBy,
        current.approvedBy,
      ),
    ...(!options.approve && usesSellerShipmentDelivery(current.deliverySnapshot)
      ? [database.prepare(`DELETE FROM order_delivery_unit_claims WHERE refund_id=? AND EXISTS (
           SELECT 1 FROM refunds WHERE id=? AND status='rejected' AND operation_request_id=?
         )`).bind(current.refundId, current.refundId, options.requestId)]
      : []),
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
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN EXISTS (
        SELECT 1 FROM return_requests c JOIN refunds f ON f.return_request_id=c.id
        WHERE c.id=? AND c.status=? AND c.operation_request_id=?
          AND f.id=? AND f.status=? AND f.operation_request_id=?
          AND f.high_value_approved_by=?) THEN 1 ELSE 0 END`)
      .bind(outcomeGuardId,options.returnRequestId,toStatus,options.requestId,
        current.refundId,refundStatus,options.requestId,options.actorId),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(outcomeGuardId),
    database.prepare(`UPDATE orders SET updated_at=updated_at WHERE id=(
      SELECT i.order_id FROM return_requests c JOIN order_items i ON i.id=c.order_item_id WHERE c.id=?)`)
      .bind(options.returnRequestId),
    database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM return_requests c
      JOIN order_items i ON i.id=c.order_item_id JOIN orders o ON o.id=i.order_id
      WHERE c.id=? AND (c.requested_by IS NULL OR c.requested_by<>?)
        AND (o.customer_id IS NULL OR o.customer_id<>?))
      THEN 1 ELSE json_extract('stale-high-value-return-owner','$') END`)
      .bind(options.returnRequestId,options.actorId,options.actorId),
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
  | 'close_paid_refund'
  | 'start_refund'
  | 'complete_refund'
  | 'fail_refund';

export async function prepareReturnOperationStatements(
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
  execution?:{packetId:string},
): Promise<D1PreparedStatement[]> {
  if (options.form && options.form.answers.formId !== 'staff.return-case-action')
    throw new ReturnConflictError('Return form context is invalid.');
  const financial=['start_refund','complete_refund','fail_refund'].includes(options.action);
  const authority = await staffMutationGuard(database, options.actorId,
    financial?'refund.approve.standard':'order.manage', ReturnConflictError, financial?'super_admin':options.actorRole);
  if(financial&&!execution)throw new ReturnConflictError('Use the verified refund funding packet and its actual bank outcome.');
  const catalogDigest = await digestFormRequest({ caseId: options.returnRequestId,
    actorId: options.actorId, actorRole: options.actorRole, action: options.action,
    note: options.note, publicMessageEn: options.publicMessageEn,
    publicMessageNe: options.publicMessageNe, reference: options.reference?.trim() || null,
    restockQuantity: options.restockQuantity ?? 0, versionId: options.form?.versionId??null,
    answers: options.form?.answers??null });
  if (await assertStaffReturnReplay(database, { requestId: options.requestId,
    returnRequestId: options.returnRequestId, actorId: options.actorId,
    eventAction: options.action, auditAction: `return.operations.${options.action}`,
    digest: catalogDigest, form: options.form })) return [];
  const current = await database
    .prepare(
      `SELECT return_requests.status, return_requests.resolution_outcome AS outcome,
        return_requests.quantity, return_requests.responsibility,
        order_items.id AS orderItemId, order_items.product_id AS productId,
        order_items.seller_id AS sellerId, orders.id AS orderId,
        products.inventory_quantity AS inventoryQuantity,
        refunds.id AS refundId, refunds.status AS refundStatus,
        refunds.amount_paisa AS refundAmountPaisa,
        refunds.liability AS refundLiability,COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=refunds.id AND cost.party='seller'),0) AS sellerRefundLiabilityPaisa,
        refunds.commission_base_refunded_paisa AS commissionBaseRefundedPaisa,
        COALESCE(order_items.commission_base_paisa,
          order_items.line_total_paisa - order_items.seller_discount_paisa) AS originalCommissionBasePaisa,
        order_items.commission_paisa AS originalCommissionPaisa,
        managed.commercial_model AS commercialModel,entitlement.id AS entitlementId
       FROM return_requests
       INNER JOIN order_items ON order_items.id = return_requests.order_item_id
       INNER JOIN orders ON orders.id = order_items.order_id
       LEFT JOIN refunds ON refunds.return_request_id = return_requests.id
       LEFT JOIN products ON products.id = order_items.product_id
       LEFT JOIN managed_commercial_snapshots managed ON managed.order_item_id=order_items.id
       LEFT JOIN managed_entitlements entitlement ON entitlement.snapshot_id=managed.id
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
      sellerRefundLiabilityPaisa:number;
      commissionBaseRefundedPaisa: number | null;
      originalCommissionBasePaisa: number;
      originalCommissionPaisa: number;
      commercialModel: string | null;
      entitlementId: string | null;
    }>();
  if (!current) throw new ReturnConflictError('Return request not found.');
  const handling=await database.prepare('SELECT revision,received_quantity AS receivedQuantity,inspected_quantity AS inspectedQuantity,waived_quantity AS waivedQuantity,restocked_quantity AS restockedQuantity FROM return_handling WHERE case_id=?').bind(options.returnRequestId).first<{revision:number;receivedQuantity:number;inspectedQuantity:number;waivedQuantity:number;restockedQuantity:number}>();
  const restock=handling?.restockedQuantity??0,physicalComplete=!!handling&&handling.inspectedQuantity+handling.waivedQuantity>=current.quantity;
  if(options.restockQuantity!==undefined&&options.restockQuantity!==0&&options.restockQuantity!==restock)throw new ReturnConflictError('Record actual receipt, inspection and stock disposition before claiming a restocked quantity.');
  if(['mark_in_transit','mark_received'].includes(options.action))throw new ReturnConflictError('Use physical handling to record actual custody, quantity, time and evidence.');
  const reference = options.reference?.trim() || null;
  const fromStatus = current.status;
  let toStatus = current.status;
  let refundFrom: string | null = null;
  let refundTo: string | null = null;
  let resolvedOutcome: 'refund' | 'replacement' | 'return_to_origin' | null =
    null;

  const refundDeliveryCapacity=`COALESCE(o.current_delivery_paisa,o.delivery_charge_paisa)
    +CASE WHEN o.promo_discount_paisa>0 AND o.current_delivery_paisa IS NOT NULL
      THEN COALESCE((SELECT SUM(x.delivery_amount_paisa) FROM refunds x WHERE x.order_id=o.id AND x.status='paid'),0)
      ELSE 0 END
    -COALESCE((SELECT SUM(x.delivery_amount_paisa) FROM refunds x WHERE x.order_id=o.id AND x.id<>r.id
      AND x.status<>'rejected' AND (x.status<>'failed' OR o.promo_discount_paisa>0)),0)`;

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
    if(!physicalComplete||!await database.prepare("SELECT 1 FROM return_replacement_shipments WHERE case_id=? AND state='delivered' AND quantity=? AND carrier_reference=?").bind(options.returnRequestId,current.quantity,reference).first())throw new ReturnConflictError('The required return disposition and actual replacement delivery must be recorded before completion.');
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
    if(!handling||handling.inspectedQuantity<current.quantity)throw new ReturnConflictError('Record actual receipt and inspection before completing return to origin.');
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
  } else if (options.action === 'close_paid_refund') {
    if(!physicalComplete||current.outcome!=='refund'||current.refundStatus!=='paid'||!['approved','in_transit','received'].includes(current.status))throw new ReturnConflictError('Complete the original refund and required physical disposition before closing this case.');
    if(!current.refundId||!await database.prepare('SELECT 1 WHERE '+refundBankReturnSettlementSql('?')).bind(current.refundId).first())throw new ReturnConflictError('Resolve the returned-credit review and complete any continuing refund before closing this case as paid.');
    toStatus='resolved';resolvedOutcome='refund';
  } else if (options.action === 'start_refund') {
    if (
      !['approved', 'in_transit', 'received'].includes(current.status) ||
      current.outcome !== 'refund' ||
      !['approved', 'failed'].includes(current.refundStatus || '')
    )
      throw new ReturnConflictError(
        'This refund is not approved for processing.',
      );
    const capacity=await database.prepare(`SELECT r.delivery_amount_paisa AS requested,
      ${refundDeliveryCapacity} AS available FROM orders o JOIN refunds r ON r.order_id=o.id
      WHERE o.id=? AND r.id=?`).bind(current.orderId,current.refundId).first<{requested:number;available:number}>();
    if(!capacity || capacity.requested>capacity.available)
      throw new ReturnConflictError('Refund exceeds the remaining delivery charge.');
    refundFrom = current.refundStatus;
    refundTo = 'processing';
  } else if (options.action === 'complete_refund') {
    if (
      !['approved', 'in_transit', 'received'].includes(current.status) ||
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
    toStatus = physicalComplete?'resolved':current.status;
    resolvedOutcome = physicalComplete?'refund':null;
  } else {
    if (!current.refundId || current.refundStatus !== 'processing')
      throw new ReturnConflictError(
        'Only a processing refund can be marked failed.',
      );
    refundFrom = 'processing';
    refundTo = 'failed';
  }

  type PromoAftercare = {subtotal:number;delivery:number;wallet:number;promo:number;total:number;refunded:number;itemRefund:number;deliveryRefund:number;walletRefund:number;promoRefund:number};
  let promoAftercare: PromoAftercare | null = null;
  if (refundTo==='paid' && current.refundId) {
    promoAftercare = await database.prepare(`SELECT COALESCE(o.current_subtotal_paisa,o.item_subtotal_paisa) AS subtotal,
      COALESCE(o.current_delivery_paisa,o.delivery_charge_paisa) AS delivery,COALESCE(o.current_wallet_paisa,o.wallet_credit_paisa) AS wallet,
      CASE WHEN o.current_discount_paisa IS NULL THEN o.promo_discount_paisa ELSE o.current_promo_discount_paisa END AS promo,
      COALESCE(o.current_total_paisa,o.grand_total_paisa) AS total,o.refunded_promo_discount_paisa AS refunded,
      r.item_amount_paisa AS itemRefund,r.delivery_amount_paisa AS deliveryRefund,r.wallet_credit_paisa AS walletRefund,r.promo_discount_paisa AS promoRefund
      FROM orders o JOIN refunds r ON r.order_id=o.id WHERE o.id=? AND r.id=? AND o.promo_discount_paisa>0`)
      .bind(current.orderId,current.refundId).first<PromoAftercare>();
    if (promoAftercare && !Object.values(promoAftercare).every(n=>Number.isSafeInteger(n)&&n>=0))
      throw new ReturnConflictError('Remaining refund amounts require reconciliation.');
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
    if(refundTo==='processing')statements.push(
      // Failed standard refunds release capacity. Reacquire it under the same
      // order lock used by approval before moving any refund into processing.
      database.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(current.orderId),
      database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM orders o JOIN refunds r ON r.order_id=o.id
        WHERE o.id=? AND r.id=? AND ${refundDeliveryCapacity}>=r.delivery_amount_paisa)
        THEN 1 ELSE json_extract('stale-refund-restart-capacity','$') END`).bind(current.orderId,current.refundId),
    );
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
      database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM refunds WHERE id=? AND status=?
        AND operation_request_id=?) THEN 1 ELSE json_extract('stale-refund-transition','$') END`)
        .bind(current.refundId,refundTo,options.requestId),
    );
  }
  if (promoAftercare && current.refundId) {
    const p=promoAftercare;
    const bounded=(n:bigint)=>{
      if(n<BigInt(0)||n>BigInt(Number.MAX_SAFE_INTEGER))throw new ReturnConflictError('Refund exceeds remaining order amounts.');
      return Number(n);
    };
    const subtotal=bounded(BigInt(p.subtotal)-BigInt(p.itemRefund));
    const delivery=bounded(BigInt(p.delivery)-BigInt(p.deliveryRefund));
    const wallet=bounded(BigInt(p.wallet)-BigInt(p.walletRefund));
    const promo=bounded(BigInt(p.promo)-BigInt(p.promoRefund));
    const refunded=bounded(BigInt(p.refunded)+BigInt(p.promoRefund));
    const total=bounded(BigInt(p.total)-BigInt(p.itemRefund)-BigInt(p.deliveryRefund)+BigInt(p.walletRefund)+BigInt(p.promoRefund));
    statements.push(
      // A zero-cash, zero-promo-offset payment can still change wallet and
      // merchandise. Lock and bind every remaining aggregate, not just cash.
      database.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(current.orderId),
      database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=?
        AND COALESCE(current_subtotal_paisa,item_subtotal_paisa)=?
        AND COALESCE(current_delivery_paisa,delivery_charge_paisa)=?
        AND COALESCE(current_wallet_paisa,wallet_credit_paisa)=?
        AND (CASE WHEN current_discount_paisa IS NULL THEN promo_discount_paisa ELSE current_promo_discount_paisa END)=?
        AND COALESCE(current_total_paisa,grand_total_paisa)=? AND refunded_promo_discount_paisa=?)
        THEN 1 ELSE json_extract('stale-promo-aggregate','$') END`)
        .bind(current.orderId,p.subtotal,p.delivery,p.wallet,p.promo,p.total,p.refunded),
      database.prepare(`UPDATE orders SET current_subtotal_paisa=?,current_delivery_paisa=?,current_wallet_paisa=?,
        current_discount_paisa=?,current_promo_discount_paisa=?,refunded_promo_discount_paisa=?,current_total_paisa=?
        WHERE id=? AND COALESCE(current_total_paisa,grand_total_paisa)=? AND refunded_promo_discount_paisa=?
        AND EXISTS(SELECT 1 FROM refunds WHERE id=? AND status='paid' AND operation_request_id=?)`)
        .bind(subtotal,delivery,wallet,promo,promo,refunded,total,current.orderId,p.total,p.refunded,current.refundId,options.requestId),
      database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=? AND current_total_paisa=?
        AND refunded_promo_discount_paisa=?) THEN 1 ELSE json_extract('stale-promo-refund','$') END`)
        .bind(current.orderId,total,refunded),
      database.prepare(`UPDATE order_items SET current_promo_discount_paisa=promo_discount_paisa-refunded_promo_discount_paisa-?,
        refunded_promo_discount_paisa=refunded_promo_discount_paisa+? WHERE id=?
        AND EXISTS(SELECT 1 FROM refunds WHERE id=? AND status='paid' AND operation_request_id=?)`)
        .bind(p.promoRefund,p.promoRefund,current.orderItemId,current.refundId,options.requestId),
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
    // Physical handling already performs each inspected restock and replacement stock movement once.
  }
  if (
    refundTo === 'paid' &&
    current.refundId &&
    !current.commercialModel &&
    current.sellerRefundLiabilityPaisa
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
          -current.sellerRefundLiabilityPaisa,
          options.now,
          `Seller liability for paid refund ${current.refundId}`,
          options.now,
          current.refundId,
          options.requestId,
        ),
      database
        .prepare(
          `UPDATE orders SET payment_status = CASE
            WHEN CASE WHEN promo_discount_paisa>0 THEN (SELECT COALESCE(SUM(item_amount_paisa),0) FROM refunds WHERE order_id=orders.id AND status='paid') >= item_subtotal_paisa-COALESCE((SELECT SUM(item_removed_paisa) FROM order_cancellation_events WHERE order_id=orders.id),0) AND (SELECT COALESCE(SUM(delivery_amount_paisa),0) FROM refunds WHERE order_id=orders.id AND status='paid')+${lawfulServiceFeeRefundTotalSql()} >= delivery_charge_paisa+buyer_platform_fee_paisa-COALESCE((SELECT SUM(json_extract(previous_json,'$.delivery')-json_extract(next_json,'$.delivery')) FROM order_cancellation_events WHERE order_id=orders.id),0) ELSE (SELECT COALESCE(SUM(amount_paisa),0) FROM refunds WHERE order_id=orders.id AND status='paid')+${lawfulServiceFeeRefundTotalSql()} >= ${payableOrderTotalSql()}+COALESCE(current_wallet_paisa,wallet_credit_paisa)+COALESCE(current_discount_paisa,referral_discount_paisa) END THEN 'refunded'
            ELSE 'part_refunded' END, updated_at = ? WHERE id = ?`,
        )
        .bind(options.now, current.orderId),
    );
  } else if (refundTo === 'paid') {
    statements.push(
      database
        .prepare(
          `UPDATE orders SET payment_status = CASE
            WHEN CASE WHEN promo_discount_paisa>0 THEN (SELECT COALESCE(SUM(item_amount_paisa),0) FROM refunds WHERE order_id=orders.id AND status='paid') >= item_subtotal_paisa-COALESCE((SELECT SUM(item_removed_paisa) FROM order_cancellation_events WHERE order_id=orders.id),0) AND (SELECT COALESCE(SUM(delivery_amount_paisa),0) FROM refunds WHERE order_id=orders.id AND status='paid')+${lawfulServiceFeeRefundTotalSql()} >= delivery_charge_paisa+buyer_platform_fee_paisa-COALESCE((SELECT SUM(json_extract(previous_json,'$.delivery')-json_extract(next_json,'$.delivery')) FROM order_cancellation_events WHERE order_id=orders.id),0) ELSE (SELECT COALESCE(SUM(amount_paisa),0) FROM refunds WHERE order_id=orders.id AND status='paid')+${lawfulServiceFeeRefundTotalSql()} >= ${payableOrderTotalSql()}+COALESCE(current_wallet_paisa,wallet_credit_paisa)+COALESCE(current_discount_paisa,referral_discount_paisa) END THEN 'refunded'
            ELSE 'part_refunded' END, updated_at = ? WHERE id = ?`,
        )
        .bind(options.now, current.orderId),
    );
  }
  if (refundTo === 'paid' && current.refundId && current.commercialModel==='managed_sale_linked_percentage_v1') {
    if(!current.entitlementId)throw new ReturnConflictError('Managed refund entitlement requires reconciliation.');
    statements.push(...await buildManagedRefundAdjustmentStatements(database, {
      entitlementId:current.entitlementId,refundId:current.refundId,
      refundedEligibleBasePaisa:current.commissionBaseRefundedPaisa ?? 0,actorId:options.actorId,
      reasonCode:'completed_customer_refund',requestId:options.requestId+':managed-refund',now:options.now,
      completedRefundRequestId:options.requestId,
    }));
    statements.push(...managedRefundResponsibilityStatements(database,{entitlementId:current.entitlementId,refundId:current.refundId,actorId:options.actorId,requestId:options.requestId+':managed-responsibility',now:options.now,completedRefundRequestId:options.requestId}));
  }
  if (refundTo === 'paid' && current.refundId) {
    statements.push(
      database
        .prepare(
          `UPDATE refunds AS current_refund
           SET commission_reversal_paisa = CASE
             WHEN current_refund.commission_base_refunded_paisa=0 THEN 0
             WHEN (SELECT COALESCE(commission_base_paisa,
                    line_total_paisa - seller_discount_paisa)
                   FROM order_items WHERE id = ?) = 0 THEN 0
             ELSE FLOOR(
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
              AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=order_items.id)
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
    ...(options.action==='close_paid_refund'?paymentGuard(database,refundBankReturnSettlementSql('?'),[current.refundId]):[]),
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
  statements.push(
    ...(resolvedOutcome?[database.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM return_handling WHERE case_id=? AND revision=? AND inspected_quantity+waived_quantity>=?) THEN 1 ELSE json_extract('stale-return-physical-source','$') END`).bind(options.returnRequestId,handling?.revision??-1,current.quantity)]:[]),
    ...(resolvedOutcome==='replacement'?[database.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM return_replacement_shipments WHERE case_id=? AND state='delivered' AND quantity=? AND carrier_reference=?) THEN 1 ELSE json_extract('replacement-delivery-unconfirmed','$') END").bind(options.returnRequestId,current.quantity,reference)]:[]),
  );
  const mutationGuard=crypto.randomUUID();
  statements.push(database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM return_requests WHERE id=? AND status=? AND operation_request_id=?) THEN 1 ELSE 0 END`).bind(mutationGuard,options.returnRequestId,toStatus,options.requestId),database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(mutationGuard));
  if(financial){
    const guardId=crypto.randomUUID(),state=options.action==='start_refund'?'processing':options.action==='complete_refund'?'paid':'failed';
    statements.push(database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM outgoing_payment_packets p JOIN refund_obligations o ON o.id=p.obligation_id JOIN refunds r ON r.id=o.source_id WHERE p.id=? AND o.source_kind='return_refund' AND r.id=? AND p.state=? AND p.amount_paisa=r.amount_paisa-r.wallet_credit_paisa-r.referral_discount_paisa-r.promo_discount_paisa AND (CASE WHEN ?='processing' THEN p.started_by ELSE p.recorded_by END)=? AND (?<>'paid' OR p.amount_paisa=0 OR p.bank_at IS NOT NULL AND p.transaction_identity_hash IS NOT NULL AND length(p.evidence_reference)>=8)) THEN 1 ELSE 0 END`).bind(guardId,execution!.packetId,current.refundId,state,state,options.actorId,state),database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId));
  }
  return statements;
}

/** Legacy physical operation entry point. Money can only be recorded by the evidenced execution protocol. */
export async function advanceReturnAsAdmin(database:D1Database,options:Parameters<typeof prepareReturnOperationStatements>[1]):Promise<void>{
 const statements=await prepareReturnOperationStatements(database,options);
 if(statements.length)try{await database.batch(statements);}catch(error){
  if(options.action==='close_paid_refund'&&!await database.prepare('SELECT 1 WHERE '+refundBankReturnSettlementSql('(SELECT id FROM refunds WHERE return_request_id=?)')).bind(options.returnRequestId).first())throw new ReturnConflictError('The current returned-credit or continuing-refund settlement changed. Refresh this case before closing it.');
  throw error;
 }
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
  customerId: string | null;
  uploadedByType: string;
  sellerId: string;
} | null> {
  return (
    (await database
      .prepare(
        `SELECT return_evidence.object_key AS objectKey,
          return_evidence.original_name AS originalName,
          return_evidence.mime_type AS mimeType,
          orders.order_number AS orderNumber,
          orders.receipt_token_hash AS receiptTokenHash, orders.customer_id AS customerId,
          return_evidence.uploaded_by_type AS uploadedByType, order_items.seller_id AS sellerId
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
        customerId: string | null;
        uploadedByType: string;
        sellerId: string;
      }>()) ?? null
  );
}
