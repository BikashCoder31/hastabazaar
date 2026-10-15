import { calculateManagedSaleLinkedRefundAmounts } from '@/lib/managed-makers/settlement';

const dayMs = 86_400_000;
const kathmanduOffsetMs = (5 * 60 + 45) * 60_000;
const weekdayIndex = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 } as const;

import { ManagedSettlementError } from '../../managed-commerce/settlement-errors';
export { ManagedSettlementError } from '../../managed-commerce/settlement-errors';

export function nextPayoutProcessingAt(input: {
  eligibleAt: number;
  processingWeekday: keyof typeof weekdayIndex;
  cutoffWeekday: keyof typeof weekdayIndex;
  cutoffLocalTime: string;
}): number {
  if (!Number.isSafeInteger(input.eligibleAt) || input.eligibleAt < 0) throw new RangeError('Eligibility time is invalid.');
  const match = /^(\d{2}):(\d{2})$/.exec(input.cutoffLocalTime);
  if (!match) throw new RangeError('Cutoff time must use HH:mm.');
  const local = new Date(input.eligibleAt + kathmanduOffsetMs);
  const processingDay = weekdayIndex[input.processingWeekday];
  const daysToProcessing = (processingDay - local.getUTCDay() + 7) % 7;
  const candidateLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysToProcessing);
  const cutoffDay = weekdayIndex[input.cutoffWeekday];
  const daysBackToCutoff = (processingDay - cutoffDay + 7) % 7;
  const cutoffLocal = candidateLocal - daysBackToCutoff * dayMs + Number(match[1]) * 3_600_000 + Number(match[2]) * 60_000;
  const selectedLocal = input.eligibleAt + kathmanduOffsetMs <= cutoffLocal ? candidateLocal : candidateLocal + 7 * dayMs;
  return selectedLocal - kathmanduOffsetMs;
}

export async function accrueManagedEntitlements(
  database: D1Database,
  options: { orderId: string; actorId: string | null; requestId: string; now: number },
): Promise<number> {
  const duplicate = await database.prepare('SELECT 1 FROM audit_logs WHERE request_id=?').bind(options.requestId).first();
  if (duplicate) return 0;
  const rows = await database.prepare(`SELECT e.id,e.calculated_paisa AS calculatedPaisa,
    s.delivery_hold_days AS holdDays,o.delivered_at AS deliveredAt,
    COALESCE((SELECT SUM(r.commission_base_refunded_paisa) FROM refunds r JOIN return_requests c ON c.id=r.return_request_id
      WHERE c.order_item_id=s.order_item_id AND r.status='paid'),0) AS paidRefundBase
    FROM managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id
    JOIN order_items i ON i.id=s.order_item_id JOIN orders o ON o.id=i.order_id
    WHERE o.id=? AND e.status='calculated' AND o.status='delivered'
      AND (o.payment_status='paid' OR (o.payment_status IN ('part_refunded','refunded')
        AND EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=o.id)
        AND NOT EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id
          WHERE j.order_id=o.id AND p.collected_paisa<>p.cod_due_paisa)))
      AND i.fulfillment_status='delivered'`).bind(options.orderId).all<{id:string;calculatedPaisa:number;holdDays:number;deliveredAt:number|null;paidRefundBase:number}>();
  if (!rows.results.length) return 0;
  const statements: D1PreparedStatement[] = [];
  const earnedResultIndices:number[]=[];
  for (const row of rows.results) {
    const earnedAt = row.deliveredAt ?? options.now;
    const holdUntil = earnedAt + Number(row.holdDays) * dayMs;
    earnedResultIndices.push(statements.length+1);
    statements.push(
      // Only the transaction that moves calculated -> earned can add credit.
      database.prepare(`UPDATE managed_entitlements SET status='earned',earned_at=?,hold_until=?,version=version+1,updated_at=?
        WHERE id=? AND status='calculated'
          AND NOT EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=managed_entitlements.id AND x.type='earned')
          AND EXISTS(SELECT 1 FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id
            JOIN orders o ON o.id=i.order_id WHERE s.id=managed_entitlements.snapshot_id
              AND o.status='delivered' AND i.fulfillment_status='delivered'
              AND (o.payment_status='paid' OR (o.payment_status IN ('part_refunded','refunded')
                AND EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=o.id)
                AND NOT EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id
                  WHERE j.order_id=o.id AND p.collected_paisa<>p.cod_due_paisa))))`)
        .bind(earnedAt,holdUntil,options.now,row.id),
      database.prepare(`INSERT INTO managed_settlement_entries(
        id,entitlement_id,refund_id,type,amount_paisa,base_amount_paisa,metadata_json,reason_code,request_id,created_by,created_at
      ) SELECT ?,?,NULL,'earned',?,NULL,?,'delivered_and_paid',?,?,? WHERE changes()=1 AND ?>0`).bind(
        crypto.randomUUID(),row.id,row.calculatedPaisa,
        JSON.stringify({customerPaymentRequired:true,riderRemittanceRequiredForEntitlement:false}),
        `${options.requestId}:earned:${row.id}`,options.actorId,options.now,row.calculatedPaisa,
      ),
    );
    statements.push(database.prepare(`SELECT CASE WHEN
      NOT EXISTS(SELECT 1 FROM managed_settlement_entries WHERE entitlement_id=? AND type='earned' AND request_id=?)
      OR COALESCE((SELECT SUM(r.commission_base_refunded_paisa) FROM refunds r JOIN return_requests c ON c.id=r.return_request_id
        JOIN managed_commercial_snapshots s ON s.order_item_id=c.order_item_id JOIN managed_entitlements e ON e.snapshot_id=s.id
        WHERE e.id=? AND r.status='paid'),0)=?
      THEN 1 ELSE json_extract('stale-managed-refund-accrual','$') END`).bind(
        row.id,`${options.requestId}:earned:${row.id}`,row.id,row.paidRefundBase,
      ));
    // Refunds completed before earning remain paid facts, not debit-only liabilities.
    // Fold their cumulative reversal into the same winning accrual transaction.
    const deferred=await database.prepare(`SELECT r.id,r.commission_base_refunded_paisa AS base
      FROM refunds r JOIN return_requests c ON c.id=r.return_request_id
      JOIN managed_commercial_snapshots s ON s.order_item_id=c.order_item_id
      JOIN managed_entitlements e ON e.snapshot_id=s.id
      WHERE e.id=? AND r.status='paid' AND r.commission_base_refunded_paisa>0 AND s.commercial_model='managed_sale_linked_percentage_v1'
      ORDER BY r.id DESC LIMIT 1`).bind(row.id).first<{id:string;base:number}>();
    if(deferred)statements.push(...await buildManagedRefundAdjustmentStatements(database,{
      entitlementId:row.id,refundId:deferred.id,refundedEligibleBasePaisa:deferred.base,
      actorId:options.actorId,reasonCode:'refund_before_earning',requestId:`${options.requestId}:deferred:${row.id}`,
      now:options.now,earnedRequestId:`${options.requestId}:earned:${row.id}`,
    }));
    statements.push(
      database.prepare(`UPDATE managed_entitlements SET status=?,eligible_at=?,updated_at=?
        WHERE id=? AND status='earned' AND (calculated_paisa=0 OR EXISTS(SELECT 1 FROM managed_settlement_entries x
          WHERE x.entitlement_id=managed_entitlements.id AND x.type='earned' AND x.request_id=?))`).bind(
        holdUntil<=options.now?'eligible':'held',holdUntil<=options.now?holdUntil:null,options.now,row.id,
        `${options.requestId}:earned:${row.id}`,
      ),
    );
  }
  statements.push(database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
    VALUES (?,?,'managed_settlement.earned','order',?,'Managed Maker entitlement earned from delivered-and-paid facts; rider remittance remains separate',NULL,json_object('count',(SELECT COUNT(*) FROM managed_settlement_entries WHERE type='earned' AND request_id IN (${rows.results.map(()=>'?').join(',')}))),?,NULL,?)`).bind(
      crypto.randomUUID(),options.actorId,options.orderId,...rows.results.map(row=>`${options.requestId}:earned:${row.id}`),options.requestId,options.now,
  ));
  const results = await database.batch(statements);
  return earnedResultIndices.reduce((count,index)=>count+Number(results[index]?.meta.changes??0),0);
}


export async function buildManagedRefundAdjustmentStatements(
  database:D1Database,
  options:{entitlementId:string;refundId:string;refundedEligibleBasePaisa:number;actorId:string|null;reasonCode:string;requestId:string;now:number;completedRefundRequestId?:string;earnedRequestId?:string},
):Promise<D1PreparedStatement[]> {
  // Refund identity deduplicates even when an operation is retried with a new ID.
  const duplicate=await database.prepare("SELECT 1 FROM managed_settlement_entries WHERE entitlement_id=? AND refund_id=? AND type='refund_adjustment'")
    .bind(options.entitlementId,options.refundId).first();
  if(duplicate)return [];
  const row=await database.prepare(`SELECT s.eligible_base_paisa AS eligibleBasePaisa,s.platform_retained_paisa AS retainedPaisa,
    COALESCE((SELECT SUM(base_amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='refund_adjustment'),0) AS refundedBase,
    COALESCE((SELECT -SUM(amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='refund_adjustment'),0) AS reversedPaisa,
    COALESCE((SELECT SUM(r.commission_base_refunded_paisa) FROM refunds r
      JOIN return_requests c ON c.id=r.return_request_id
      WHERE c.order_item_id=s.order_item_id AND r.status='paid' AND r.id<>?),0) AS paidRefundBase,
    EXISTS(SELECT 1 FROM refunds WHERE id=? AND status='paid') AS currentRefundPaid
    FROM managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id
    WHERE e.id=? AND s.commercial_model='managed_sale_linked_percentage_v1'`)
    .bind(options.refundId,options.refundId,options.entitlementId).first<{eligibleBasePaisa:number;retainedPaisa:number;refundedBase:number;reversedPaisa:number;paidRefundBase:number;currentRefundPaid:number}>();
  if(!row)throw new ManagedSettlementError('Managed entitlement not found.');
  if(!Number.isSafeInteger(options.refundedEligibleBasePaisa)||options.refundedEligibleBasePaisa<0)
    throw new ManagedSettlementError('Refunded eligible base must be a non-negative safe integer.');
  // Paid refund facts retain base consumed by a zero-money rounding delta.
  const cumulativeBase=row.currentRefundPaid
    ? BigInt(Math.max(row.refundedBase,row.paidRefundBase+options.refundedEligibleBasePaisa))
    : BigInt(Math.max(row.refundedBase,row.paidRefundBase))+BigInt(options.refundedEligibleBasePaisa);
  if(cumulativeBase>BigInt(row.eligibleBasePaisa))throw new ManagedSettlementError('Refund adjustments cannot exceed the original eligible base.');
  const cumulative=calculateManagedSaleLinkedRefundAmounts({originalEligibleBasePaisa:row.eligibleBasePaisa,
    originalPlatformRetainedPaisa:row.retainedPaisa,refundedEligibleBasePaisa:Number(cumulativeBase)});
  const makerReversal=cumulative.makerEntitlementReversalPaisa-row.reversedPaisa;
  // The immutable ledger forbids zero money entries. Carry paid base with no
  // money delta into the next nonzero entry so a full refund has no residue.
  if(!options.refundedEligibleBasePaisa || !makerReversal)return [];
  const guardId=crypto.randomUUID();
  const refundGate=options.completedRefundRequestId
    ? "AND EXISTS(SELECT 1 FROM refunds WHERE id=? AND status='paid' AND operation_request_id=?)" : '';
  const gateBindings=options.completedRefundRequestId?[options.refundId,options.completedRefundRequestId]:[];
  const earnedGate=options.earnedRequestId
    ? "AND EXISTS(SELECT 1 FROM managed_settlement_entries WHERE entitlement_id=? AND type='earned' AND request_id=?)" : '';
  const earnedBindings=options.earnedRequestId?[options.entitlementId,options.earnedRequestId]:[];
  const nonWinningClaim=options.earnedRequestId
    ? "NOT EXISTS(SELECT 1 FROM managed_settlement_entries WHERE entitlement_id=? AND type='earned' AND request_id=?) OR" : '';

  return [
    database.prepare('UPDATE managed_entitlements SET updated_at=updated_at WHERE id=?').bind(options.entitlementId),
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${nonWinningClaim} (
      COALESCE((SELECT SUM(base_amount_paisa) FROM managed_settlement_entries WHERE entitlement_id=? AND type='refund_adjustment'),0)=?
      AND COALESCE((SELECT -SUM(amount_paisa) FROM managed_settlement_entries WHERE entitlement_id=? AND type='refund_adjustment'),0)=?
      AND COALESCE((SELECT SUM(r.commission_base_refunded_paisa) FROM refunds r JOIN return_requests c ON c.id=r.return_request_id
        JOIN managed_commercial_snapshots s ON s.order_item_id=c.order_item_id JOIN managed_entitlements e ON e.snapshot_id=s.id
        WHERE e.id=? AND r.status='paid' AND r.id<>?),0)=?
      AND NOT EXISTS(SELECT 1 FROM managed_settlement_entries WHERE entitlement_id=? AND refund_id=? AND type='refund_adjustment')
       ) THEN 1 ELSE 0 END`).bind(guardId,...earnedBindings,options.entitlementId,row.refundedBase,options.entitlementId,row.reversedPaisa,
        options.entitlementId,options.refundId,row.paidRefundBase,options.entitlementId,options.refundId),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),
    database.prepare(`INSERT INTO managed_settlement_entries(id,entitlement_id,refund_id,type,amount_paisa,base_amount_paisa,metadata_json,reason_code,request_id,created_by,created_at)
      SELECT ?,?,?,'refund_adjustment',?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM managed_entitlements WHERE id=? AND earned_at IS NOT NULL) ${refundGate} ${earnedGate}`).bind(
        crypto.randomUUID(),options.entitlementId,options.refundId,-makerReversal,Number(cumulativeBase)-row.refundedBase,
        JSON.stringify({refundedEligibleBasePaisa:Number(cumulativeBase)-row.refundedBase,
          currentRefundEligibleBasePaisa:options.refundedEligibleBasePaisa,
          carriedRefundEligibleBasePaisa:Number(cumulativeBase)-row.refundedBase-options.refundedEligibleBasePaisa,
          makerEntitlementReversalPaisa:makerReversal,
          platformRetentionReversalPaisa:Number(cumulativeBase)-row.refundedBase-makerReversal}),options.reasonCode,options.requestId,options.actorId,options.now,options.entitlementId,...gateBindings,...earnedBindings),
  ];
}

export async function applyManagedRefundAdjustment(
  database:D1Database,
  options:{entitlementId:string;refundId:string;refundedEligibleBasePaisa:number;actorId:string;reasonCode:string;requestId:string;now:number},
):Promise<void> {
  const statements=await buildManagedRefundAdjustmentStatements(database,options);
  if(statements.length)await database.batch(statements);
}

export { prepareManagedPayout, transitionManagedPayout, cancelManagedPayout, releaseManagedEligibility, getManagedFinanceSummary } from '../../managed-commerce/payout-operations';
export type { ManagedFinanceSummary } from '../../managed-commerce/payout-operations';
