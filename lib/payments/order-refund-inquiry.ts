import { SERVICE_FEE_REFUND_ACTION } from '../db/repositories/platform-service-fee-refunds';
import { orderActualCashSql } from './refund-obligations';
import { bankSatisfiedReceiptReturnSql } from './receipt-return-bank-satisfaction';
import { pendingCodCollectionSql, postedCodCollectionSql } from './refund-cod-proof';

export type OrderRefundViewer =
  | { kind: 'account'; customerId: string }
  | { kind: 'guest'; receiptTokenHash: string };

export type OrderRefundInquiry =
  | { state: 'no_cash_refund' | 'settled'; amountPaisa: 0 }
  | { state: 'owed'; amountPaisa: number }
  | { state: 'needs_reconciliation'; amountPaisa: null };

const reconciliation = { state: 'needs_reconciliation', amountPaisa: null } as const;
const zero = { state: 'no_cash_refund', amountPaisa: 0 } as const;

type RefundSource = {
  obligationId: string | null;
  kind: 'return_refund' | 'cancellation' | 'service_fee';
  status: string;
  cash: number;
  sellerId: string | null;
  cancellationSnapshot: unknown;
  settlementVerified: number;
  obligationMismatch: number;
};

type ParcelCollection = {
  id: string;
  sellerId: string;
  due: number | null;
  counted: number | null;
  posted: number;
  delivered: number;
  pending: number;
};

type BankReturn = {
  obligationId: string;
  originalProof: number;
  amount: number;
  retryId: string | null;
  requiredRetryId: string | null;
  retryProof: number;
  completed: number;
  directlyReturned: number;
  fullySettled: number;
};

// Keep indexed comparisons while matching opaque identifiers byte for byte in MariaDB.
function exactKey(left: string, right: string) {
  return `(${left}=${right} AND HEX(${left})=HEX(${right}))`;
}

function verifiedBankPacket(obligation: string, expectedCash: string) {
  return `EXISTS(SELECT 1 FROM outgoing_payment_packets packet
    JOIN company_outgoing_bank_identities bank ON ${exactKey('bank.packet_id', 'packet.id')} AND bank.packet_kind='refund'
    JOIN refund_destination_versions destination ON ${exactKey('destination.id', 'packet.destination_version_id')}
      AND ${exactKey('destination.obligation_id', 'packet.obligation_id')} AND destination.status='verified'
    WHERE ${exactKey('packet.obligation_id', `${obligation}.id`)} AND packet.state='paid' AND packet.currency='NPR'
      AND packet.amount_paisa>0 AND packet.amount_paisa=(${expectedCash})
      AND ${exactKey('bank.identity_hash', 'packet.transaction_identity_hash')}
      AND ${exactKey('bank.account_version_id', 'packet.account_version_id')}
      AND bank.amount_paisa=packet.amount_paisa AND bank.bank_at=packet.bank_at
      AND ${exactKey('bank.transaction_identity', 'packet.transaction_identity')})`;
}

function paisa(value: unknown): number | null {
  const amount = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function readList<T>(value: unknown, count: number | string): T[] {
  const rows = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(rows) || paisa(count) !== rows.length) throw new TypeError('Refund inquiry records require reconciliation.');
  return rows;
}

function checkCodCollection(parcel: ParcelCollection): number | null {
  const amount = paisa(parcel.counted);
  const posted = paisa(parcel.posted);
  const due = paisa(parcel.due);
  if (amount === null || due === null || amount !== posted || amount > due || Number(parcel.pending)) return null;
  if (Number(parcel.delivered) && amount === 0 && due > 0) return null;
  return amount;
}

function cancellationPortions(source: RefundSource, parcels: readonly ParcelCollection[]): Map<string, number> | null {
  const raw = source.cancellationSnapshot;
  const snapshot = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
    selectedSellerIds?: string[];
    retainedParcels?: { sellerId: string; amount: number }[];
    parcels?: { id: string; sellerId: string; collected: number }[];
  } | null;
  if (!snapshot || !Array.isArray(snapshot.selectedSellerIds) || !Array.isArray(snapshot.retainedParcels) || !Array.isArray(snapshot.parcels)) return null;

  const portions = new Map<string, number>();
  let total = 0;
  for (const saved of snapshot.parcels) {
    const collected = paisa(saved.collected);
    if (collected === null) return null;
    if (!collected) continue;
    const current = parcels.find(parcel => parcel.id === saved.id && parcel.sellerId === saved.sellerId);
    const verified = current ? checkCodCollection(current) : null;
    if (verified === null || verified < collected) return null;
    const retained = snapshot.retainedParcels.find(parcel => parcel.sellerId === saved.sellerId);
    const retainedAmount = retained ? paisa(retained.amount) : collected;
    if (retainedAmount === null) return null;
    const amount = snapshot.selectedSellerIds.includes(saved.sellerId) ? collected : Math.max(0, collected - retainedAmount);
    portions.set(saved.sellerId, (portions.get(saved.sellerId) ?? 0) + amount);
    total += amount;
  }
  return total === paisa(source.cash) ? portions : null;
}

/** Read the order authorization and money evidence in one database snapshot. */
export async function readOrderRefundInquiry(
  db: D1Database, orderNumber: string, viewer: OrderRefundViewer,
): Promise<OrderRefundInquiry | null> {
  if (typeof orderNumber !== 'string' || !orderNumber || orderNumber.length > 191) return null;
  if (viewer.kind === 'guest' && !/^[a-f0-9]{64}$/.test(viewer.receiptTokenHash)) return null;
  if (viewer.kind === 'account' && (!viewer.customerId || viewer.customerId.length > 191)) return null;
  const scope = viewer.kind === 'guest'
    ? 'o.customer_id IS NULL AND HEX(o.receipt_token_hash)=HEX(?)'
    : `HEX(o.customer_id)=HEX(?) AND EXISTS(SELECT 1 FROM users owner
      JOIN user_roles active_role ON ${exactKey('active_role.user_id', 'owner.id')} AND active_role.role='customer'
      WHERE ${exactKey('owner.id', 'o.customer_id')} AND owner.status='active')`;
  const maria = (db as D1Database & { dialect?: string }).dialect === 'mariadb';
  const jsonRows = (expression: string) => `COALESCE(${maria ? 'JSON_ARRAYAGG' : 'json_group_array'}(json_object(${expression})),json_array())`;
  const feeExecutionPacket = maria
    ? `JSON_TYPE(JSON_EXTRACT(audit.next_json,'$.executionPacketId'))='STRING'
      AND TRIM(JSON_VALUE(audit.next_json,'$.executionPacketId'))<>''`
    : `json_type(audit.next_json,'$.executionPacketId')='text'
      AND TRIM(json_extract(audit.next_json,'$.executionPacketId'))<>''`;
  const inexactManualCash = `EXISTS(SELECT 1 FROM manual_payment_windows window_row
    WHERE window_row.order_id=o.id AND HEX(window_row.order_id)<>HEX(o.id))
    OR EXISTS(SELECT 1 FROM manual_payment_allocations allocation
      JOIN manual_receipt_uses used ON used.id=allocation.receipt_use_id
      JOIN company_money_receipts receipt ON receipt.id=allocation.receipt_id
      WHERE allocation.order_id=o.id AND (HEX(allocation.order_id)<>HEX(o.id)
        OR HEX(used.id)<>HEX(allocation.receipt_use_id) OR HEX(receipt.id)<>HEX(allocation.receipt_id)
        OR NOT ${exactKey('used.receipt_id', 'receipt.id')} OR NOT ${exactKey('used.target_id', 'o.id')}))`;
  const directBankReturn = `CASE WHEN EXISTS(SELECT 1 FROM receipt_return_bank_satisfactions satisfied
    JOIN seller_recovery_receipt_reversal_reviews reviewed ON reviewed.id=satisfied.review_id
    WHERE satisfied.obligation_id=retry.id AND reviewed.state='completed'
      AND (HEX(satisfied.obligation_id)<>HEX(retry.id) OR HEX(reviewed.id)<>HEX(satisfied.review_id)
        OR NOT ${exactKey('satisfied.receipt_id', 'retry.receipt_id')}
        OR NOT ${exactKey('satisfied.receipt_use_id', 'retry.receipt_use_id')}
        OR NOT ${exactKey('satisfied.customer_id', 'retry.customer_id')}
        OR NOT ${exactKey('reviewed.receipt_id', 'satisfied.receipt_id')}
        OR NOT ${exactKey('reviewed.reversal_id', 'satisfied.reversal_id')}))
    THEN NULL ELSE ${bankSatisfiedReceiptReturnSql('retry')} END`;

  const record = await db.prepare(`WITH authorized_order AS (
    SELECT o.id, o.customer_id, o.status, o.payment_mode,
      CASE WHEN o.payment_mode='cod' THEN 0 WHEN ${inexactManualCash} THEN NULL ELSE ${orderActualCashSql()} END AS original_cash
    FROM orders o WHERE o.order_number=? AND HEX(o.order_number)=HEX(?) AND (${scope})
  ), original_sources AS (
    SELECT r.id AS source_id,'return_refund' AS source_kind,r.status,oi.seller_id,
      r.amount_paisa-r.wallet_credit_paisa-r.referral_discount_paisa-r.promo_discount_paisa AS cash,
      r.wallet_credit_paisa AS wallet,o.id AS order_id,o.customer_id,NULL AS cancellation_snapshot,
      CASE WHEN HEX(r.order_id)=HEX(o.id) AND r.approved_at IS NOT NULL
        AND (r.is_high_value=0 OR r.high_value_approved_by IS NOT NULL) THEN 1 ELSE 0 END AS approved
    FROM authorized_order o JOIN refunds r ON r.order_id=o.id
    LEFT JOIN return_requests request ON ${exactKey('request.id', 'r.return_request_id')}
    LEFT JOIN order_items oi ON ${exactKey('oi.id', 'request.order_item_id')} AND ${exactKey('oi.order_id', 'o.id')}
    WHERE r.status IN('approved','failed','processing','paid')
    UNION ALL
    SELECT c.id,'cancellation',c.state,NULL,c.cash_paisa,0,o.id,c.customer_id,c.source_snapshot_json,HEX(c.order_id)=HEX(o.id)
    FROM authorized_order o JOIN cancellation_refund_sources c ON c.order_id=o.id
    UNION ALL
    SELECT f.id,'service_fee',f.state,NULL,f.amount_paisa,0,o.id,f.customer_id,NULL,HEX(f.order_id)=HEX(o.id)
    FROM authorized_order o JOIN lawful_fee_refund_authorizations f ON f.order_id=o.id
  ), inspected_sources AS (
    SELECT source.*, obligation.id AS obligation_id,
      CASE WHEN source.approved=1 AND (${exactKey('source.customer_id', 'o.customer_id')} OR source.customer_id IS NULL AND o.customer_id IS NULL)
        AND (obligation.id IS NULL AND source.status NOT IN('processing','paid') OR obligation.id IS NOT NULL
          AND HEX(obligation.source_id)=HEX(source.source_id) AND ${exactKey('obligation.order_id', 'source.order_id')}
          AND ${exactKey('obligation.customer_id', 'o.customer_id')} AND obligation.cash_paisa=source.cash
          AND obligation.wallet_paisa=source.wallet AND obligation.currency='NPR'
          AND ((source.status='paid' AND obligation.state='completed') OR (source.status<>'paid' AND obligation.state<>'completed')))
        THEN 0 ELSE 1 END AS obligation_mismatch,
      CASE WHEN obligation.state='completed' AND ${verifiedBankPacket('obligation', 'source.cash')}
        THEN 1 ELSE 0 END AS settlement_verified
    FROM original_sources source JOIN authorized_order o ON ${exactKey('o.id', 'source.order_id')}
    LEFT JOIN refund_obligations obligation ON obligation.source_kind=source.source_kind AND obligation.source_id=source.source_id
  ), inspected_collections AS (
    SELECT job.id,job.seller_id,parcel.cod_due_paisa AS due,parcel.collected_paisa AS counted,
      CASE WHEN parcel.delivered_at IS NOT NULL OR job.status='delivered' THEN 1 ELSE 0 END AS delivered,
      ${postedCodCollectionSql(db, 'parcel')} AS posted,
      ${pendingCodCollectionSql('parcel')} AS pending
    FROM authorized_order o JOIN shipping_jobs job ON ${exactKey('job.order_id', 'o.id')} AND job.direction='outbound'
    LEFT JOIN shipping_parcels parcel ON ${exactKey('parcel.shipping_job_id', 'job.id')}
    WHERE o.payment_mode='cod' AND EXISTS(SELECT 1 FROM order_items item
      WHERE ${exactKey('item.order_id', 'o.id')} AND ${exactKey('item.seller_id', 'job.seller_id')})
  ), bank_returns AS (
    SELECT source.obligation_id,returned.amount_paisa AS amount,retry.id AS retry_id,disposition.retry_obligation_id AS required_retry_id,
      CASE WHEN source.source_kind='return_refund' AND HEX(returned.obligation_id)=HEX(source.obligation_id)
        AND ${exactKey('packet.obligation_id', 'source.obligation_id')}
        AND packet.state='paid' AND packet.amount_paisa=source.cash AND packet.currency='NPR'
        AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR'
        AND ${exactKey('receipt.payer_user_id', 'source.customer_id')} AND receipt.amount_minor=returned.amount_paisa
        AND ${exactKey('receipt.account_version_id', 'packet.account_version_id')} AND receipt.bank_at>packet.bank_at
        AND (disposition.id IS NULL OR HEX(disposition.reversal_id)=HEX(returned.id))
        THEN 1 ELSE 0 END AS original_proof,
      CASE WHEN retry.id IS NOT NULL AND retry.cash_paisa=returned.amount_paisa
        AND HEX(retry.source_id)=HEX(returned.receipt_id) AND HEX(retry.receipt_id)=HEX(returned.receipt_id)
        AND ${exactKey('retry.customer_id', 'source.customer_id')}
        AND retry.wallet_paisa=0 AND retry.currency='NPR'
        AND EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE ${exactKey('used.id', 'retry.receipt_use_id')} AND used.kind='return'
          AND ${exactKey('used.target_id', 'retry.id')} AND ${exactKey('used.receipt_id', 'returned.receipt_id')}
          AND used.amount_minor=retry.cash_paisa
          AND ((retry.state='completed' AND used.state='returned') OR (retry.state<>'completed' AND used.state='reserved')))
        THEN 1 ELSE 0 END AS retry_proof,
      CASE WHEN retry.state='completed' THEN 1 ELSE 0 END AS completed,
      ${directBankReturn} AS directly_returned,
      CASE WHEN retry.state='completed' AND ${verifiedBankPacket('retry', `retry.cash_paisa-${directBankReturn}`)} THEN 1 ELSE 0 END AS fully_settled
    FROM inspected_sources source JOIN customer_refund_reversals returned ON returned.obligation_id=source.obligation_id
    LEFT JOIN outgoing_payment_packets packet ON ${exactKey('packet.id', 'returned.packet_id')}
    LEFT JOIN company_money_receipts receipt ON ${exactKey('receipt.id', 'returned.receipt_id')}
    LEFT JOIN customer_refund_reversal_dispositions disposition ON disposition.reversal_id=returned.id
    LEFT JOIN refund_obligations retry ON retry.source_kind='receipt_return' AND retry.source_id=returned.receipt_id
      AND retry.receipt_id=returned.receipt_id
  ), source_payload AS (
    SELECT COUNT(*) AS row_count,${jsonRows(`'obligationId',obligation_id,'kind',source_kind,'status',status,'sellerId',seller_id,'cash',cash,
      'cancellationSnapshot',cancellation_snapshot,'settlementVerified',settlement_verified,'obligationMismatch',obligation_mismatch`)} AS records
    FROM inspected_sources
  ), parcel_payload AS (
    SELECT COUNT(*) AS row_count,${jsonRows(`'id',id,'sellerId',seller_id,'due',due,'counted',counted,'posted',posted,'delivered',delivered,'pending',pending`)} AS records
    FROM inspected_collections
  ), return_payload AS (
    SELECT COUNT(*) AS row_count,${jsonRows(`'obligationId',obligation_id,'amount',amount,'retryId',retry_id,'requiredRetryId',required_retry_id,
      'originalProof',original_proof,'retryProof',retry_proof,
      'completed',completed,'directlyReturned',directly_returned,'fullySettled',fully_settled`)} AS records
    FROM bank_returns
  ) SELECT payment_mode AS paymentMode,status,original_cash AS originalCash,
    EXISTS(SELECT 1 FROM audit_logs audit WHERE audit.subject_type='order'
      AND audit.subject_id=authorized_order.id AND HEX(audit.subject_id)=HEX(authorized_order.id)
      AND audit.action='${SERVICE_FEE_REFUND_ACTION}'
      AND CASE WHEN json_valid(audit.next_json) THEN NOT COALESCE(${feeExecutionPacket},0) ELSE 1 END
    ) AS hasHistoricalFeeRefund,
    source_payload.row_count AS sourceCount,source_payload.records AS sources,
    parcel_payload.row_count AS parcelCount,parcel_payload.records AS parcels,
    return_payload.row_count AS bankReturnCount,return_payload.records AS bankReturns
    FROM authorized_order CROSS JOIN source_payload CROSS JOIN parcel_payload CROSS JOIN return_payload`)
    .bind(orderNumber, orderNumber, viewer.kind === 'account' ? viewer.customerId : viewer.receiptTokenHash)
    .first<{ paymentMode: string; status: string; originalCash: number | null; hasHistoricalFeeRefund: number;
      sourceCount: number | string; sources: unknown; parcelCount: number | string; parcels: unknown;
      bankReturnCount: number | string; bankReturns: unknown }>();
  if (!record) return null;
  if (Number(record.hasHistoricalFeeRefund)) return reconciliation;

  try {
    const sources = readList<RefundSource>(record.sources, record.sourceCount).filter(source => paisa(source.cash) !== 0);
    const parcels = readList<ParcelCollection>(record.parcels, record.parcelCount);
    const bankReturns = readList<BankReturn>(record.bankReturns, record.bankReturnCount);
    if (!sources.length) {
      // Money on a cancelled order without a verified customer entitlement still needs review.
      if (record.status === 'cancelled' && (paisa(record.originalCash) !== 0 || parcels.some(parcel => checkCodCollection(parcel) !== 0))) {
        return reconciliation;
      }
      return zero;
    }

    let approved = 0;
    let outstanding = 0;
    const chargedBySeller = new Map<string, number>();
    const chargeSeller = (sellerId: string, amount: number) => chargedBySeller.set(sellerId, (chargedBySeller.get(sellerId) ?? 0) + amount);
    for (const source of sources) {
      const cash = paisa(source.cash);
      if (cash === null || Number(source.obligationMismatch)) return reconciliation;
      if (source.kind === 'return_refund' && !source.sellerId) return reconciliation;
      approved += cash;
      if (record.paymentMode === 'cod') {
        if (source.sellerId) chargeSeller(source.sellerId, cash);
        if (source.kind === 'cancellation') {
          const portions = cancellationPortions(source, parcels);
          if (!portions) return reconciliation;
          for (const [sellerId, amount] of portions) chargeSeller(sellerId, amount);
        }
      }

      const returns = bankReturns.filter(returned => returned.obligationId === source.obligationId);
      if (source.status !== 'paid') {
        if (returns.length) return reconciliation;
        outstanding += cash;
        continue;
      }
      if (!Number(source.settlementVerified)) return reconciliation;
      let returnedTotal = 0;
      for (const returned of returns) {
        const amount = paisa(returned.amount);
        const direct = paisa(returned.directlyReturned);
        if (!Number(returned.originalProof) || amount === null || !amount || direct === null || direct > amount) return reconciliation;
        returnedTotal += amount;
        if ((returned.requiredRetryId && returned.retryId !== returned.requiredRetryId) ||
          (returned.retryId && !Number(returned.retryProof))) return reconciliation;
        const remaining = amount - direct;
        if (Number(returned.completed)) {
          if (remaining > 0 && !Number(returned.fullySettled)) return reconciliation;
        } else {
          if (remaining === 0) return reconciliation;
          outstanding += remaining;
        }
      }
      if (returnedTotal > cash) return reconciliation;
    }
    if (paisa(approved) === null || paisa(outstanding) === null || outstanding > approved) return reconciliation;
    if (record.paymentMode === 'cod') {
      const bySeller = new Map<string, number>();
      let verified = 0;
      for (const parcel of parcels) {
        const collection = checkCodCollection(parcel);
        if (collection === null) {
          if (chargedBySeller.has(parcel.sellerId) || sources.some(source => source.kind === 'service_fee')) return reconciliation;
          continue;
        }
        bySeller.set(parcel.sellerId, (bySeller.get(parcel.sellerId) ?? 0) + collection);
        verified += collection;
      }
      for (const [sellerId, amount] of chargedBySeller) {
        if (amount > (bySeller.get(sellerId) ?? 0)) return reconciliation;
      }
      if (paisa(verified) === null || approved > verified) return reconciliation;
    } else if (approved > (paisa(record.originalCash) ?? 0)) {
      return reconciliation;
    }
    return outstanding ? { state: 'owed', amountPaisa: outstanding } : { state: 'settled', amountPaisa: 0 };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return reconciliation;
    throw error;
  }
}
