import { calculateManagedSaleLinkedRefundAmounts } from '@/lib/managed-makers/settlement';
import { SIMULATED_RECORD_LABEL } from '@/lib/staging/environment';

const dayMs = 86_400_000;
const kathmanduOffsetMs = (5 * 60 + 45) * 60_000;
const weekdayIndex = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 } as const;

export class ManagedSettlementError extends Error {}

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
    s.delivery_hold_days AS holdDays,o.delivered_at AS deliveredAt
    FROM managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id
    JOIN order_items i ON i.id=s.order_item_id JOIN orders o ON o.id=i.order_id
    WHERE o.id=? AND e.status='calculated' AND o.status='delivered' AND o.payment_status='paid'
      AND i.fulfillment_status='delivered'`).bind(options.orderId).all<{id:string;calculatedPaisa:number;holdDays:number;deliveredAt:number|null}>();
  if (!rows.results.length) return 0;
  const statements: D1PreparedStatement[] = [];
  for (const row of rows.results) {
    const earnedAt = row.deliveredAt ?? options.now;
    const holdUntil = earnedAt + Number(row.holdDays) * dayMs;
    statements.push(
      database.prepare(`INSERT OR IGNORE INTO managed_settlement_entries(
        id,entitlement_id,refund_id,type,amount_paisa,base_amount_paisa,metadata_json,reason_code,request_id,created_by,created_at
      ) VALUES (?,?,NULL,'earned',?,NULL,?,'delivered_and_paid',?,?,?)`).bind(
        crypto.randomUUID(),row.id,row.calculatedPaisa,
        JSON.stringify({customerPaymentRequired:true,riderRemittanceRequiredForEntitlement:false}),
        `${options.requestId}:earned:${row.id}`,options.actorId,options.now,
      ),
      database.prepare(`UPDATE managed_entitlements SET status=?,earned_at=?,hold_until=?,eligible_at=?,version=version+1,updated_at=?
        WHERE id=? AND status='calculated'`).bind(
        holdUntil<=options.now?'eligible':'held',earnedAt,holdUntil,holdUntil<=options.now?holdUntil:null,options.now,row.id,
      ),
    );
  }
  statements.push(database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
    VALUES (?,?,'managed_settlement.earned','order',?,'Managed Maker entitlement earned from delivered-and-paid facts; rider remittance remains separate',NULL,?,?,NULL,?)`).bind(
      crypto.randomUUID(),options.actorId,options.orderId,JSON.stringify({count:rows.results.length}),options.requestId,options.now,
  ));
  await database.batch(statements);
  return rows.results.length;
}

export async function releaseManagedEligibility(database:D1Database, now:number):Promise<number> {
  const result = await database.prepare(`UPDATE managed_entitlements SET status='eligible',eligible_at=hold_until,version=version+1,updated_at=?
    WHERE status='held' AND hold_until<=? AND dispute_hold_reason IS NULL`).bind(now,now).run();
  return Number(result.meta.changes ?? 0);
}

export async function applyManagedRefundAdjustment(
  database:D1Database,
  options:{entitlementId:string;refundId:string;refundedEligibleBasePaisa:number;actorId:string;reasonCode:string;requestId:string;now:number},
):Promise<void> {
  const duplicate=await database.prepare('SELECT 1 FROM managed_settlement_entries WHERE request_id=?').bind(options.requestId).first();
  if(duplicate)return;
  const row=await database.prepare(`SELECT s.eligible_base_paisa AS eligibleBasePaisa,s.platform_retained_paisa AS retainedPaisa,
    COALESCE((SELECT SUM(base_amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='refund_adjustment'),0) AS refundedBase
    FROM managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE e.id=?`).bind(options.entitlementId).first<{eligibleBasePaisa:number;retainedPaisa:number;refundedBase:number}>();
  if(!row)throw new ManagedSettlementError('Managed entitlement not found.');
  if(row.refundedBase+options.refundedEligibleBasePaisa>row.eligibleBasePaisa)throw new ManagedSettlementError('Refund adjustments cannot exceed the original eligible base.');
  const amounts=calculateManagedSaleLinkedRefundAmounts({originalEligibleBasePaisa:row.eligibleBasePaisa,originalPlatformRetainedPaisa:row.retainedPaisa,refundedEligibleBasePaisa:options.refundedEligibleBasePaisa});
  if(!amounts.makerEntitlementReversalPaisa)return;
  await database.prepare(`INSERT INTO managed_settlement_entries(id,entitlement_id,refund_id,type,amount_paisa,base_amount_paisa,metadata_json,reason_code,request_id,created_by,created_at)
    VALUES (?,?,?,'refund_adjustment',?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(),options.entitlementId,options.refundId,-amounts.makerEntitlementReversalPaisa,
      amounts.refundedEligibleBasePaisa,JSON.stringify(amounts),options.reasonCode,options.requestId,options.actorId,options.now,
    ).run();
}

export interface ManagedFinanceSummary { calculatedPaisa:number; earnedPaisa:number; heldPaisa:number; eligiblePaisa:number; paidPaisa:number; balancePaisa:number; }
export async function getManagedFinanceSummary(database:D1Database,sellerId:string,now=Date.now()):Promise<ManagedFinanceSummary>{
  const row=await database.prepare(`SELECT
    COALESCE(SUM(e.calculated_paisa),0) AS calculatedPaisa,
    COALESCE(SUM(CASE WHEN e.earned_at IS NOT NULL THEN e.calculated_paisa ELSE 0 END),0) AS earnedPaisa,
    COALESCE(SUM(CASE WHEN e.status='held' THEN (SELECT COALESCE(SUM(amount_paisa),0) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id) ELSE 0 END),0) AS heldPaisa,
    COALESCE(SUM(CASE WHEN e.status IN ('eligible','part_paid','paid') AND COALESCE(e.eligible_at,?)<=? THEN (SELECT COALESCE(SUM(amount_paisa),0) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_payouts p ON p.id=pe.payout_id WHERE pe.settlement_entry_id=x.id AND p.status IN ('prepared','approved','processing','paid'))) ELSE 0 END),0) AS eligiblePaisa,
    COALESCE((SELECT SUM(amount_paisa) FROM managed_payouts p WHERE p.seller_id=? AND p.status='paid'),0) AS paidPaisa,
    COALESCE(SUM((SELECT COALESCE(SUM(amount_paisa),0) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id)),0)-COALESCE((SELECT SUM(amount_paisa) FROM managed_payouts p WHERE p.seller_id=? AND p.status='paid'),0) AS balancePaisa
    FROM managed_entitlements e WHERE e.seller_id=?`).bind(now,now,sellerId,sellerId,sellerId).first<ManagedFinanceSummary>();
  return {calculatedPaisa:Number(row?.calculatedPaisa??0),earnedPaisa:Number(row?.earnedPaisa??0),heldPaisa:Number(row?.heldPaisa??0),eligiblePaisa:Number(row?.eligiblePaisa??0),paidPaisa:Number(row?.paidPaisa??0),balancePaisa:Number(row?.balancePaisa??0)};
}

export async function prepareManagedPayout(database:D1Database,options:{sellerId:string;actorId:string;destinationReference:string;requestId:string;now:number;scheduledFor:number}):Promise<string>{
  const existing=await database.prepare('SELECT id FROM managed_payouts WHERE request_id=?').bind(options.requestId).first<{id:string}>();if(existing)return existing.id;
  const entries=await database.prepare(`SELECT x.id,x.amount_paisa AS amountPaisa FROM managed_settlement_entries x
    JOIN managed_entitlements e ON e.id=x.entitlement_id LEFT JOIN managed_payout_entries pe ON pe.settlement_entry_id=x.id
    WHERE e.seller_id=? AND e.status='eligible' AND e.eligible_at<=? AND pe.settlement_entry_id IS NULL ORDER BY x.created_at,x.id`).bind(options.sellerId,options.now).all<{id:string;amountPaisa:number}>();
  const amount=entries.results.reduce((sum,row)=>sum+Number(row.amountPaisa),0);if(amount<=0)throw new ManagedSettlementError('A positive eligible Managed Maker balance is required.');
  const id=crypto.randomUUID(),number=`SIM-MP-${options.now}-${id.slice(0,8).toUpperCase()}`;
  await database.batch([
    database.prepare(`INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,simulation_label,prepared_by,approved_by,scheduled_for,provider_reference,request_id,created_at,updated_at,paid_at)
      VALUES (?,?,?,?,'prepared',?,?,?,NULL,?,NULL,?,?,?,NULL)`).bind(id,options.sellerId,number,amount,options.destinationReference,SIMULATED_RECORD_LABEL,options.actorId,options.scheduledFor,options.requestId,options.now,options.now),
    ...entries.results.map((entry)=>database.prepare('INSERT INTO managed_payout_entries(payout_id,settlement_entry_id) VALUES (?,?)').bind(id,entry.id)),
  ]);return id;
}

export async function transitionManagedPayout(database:D1Database,options:{payoutId:string;actorId:string;action:'approve'|'mark_paid';requestId:string;providerReference?:string;now:number}):Promise<void>{
  const duplicate=await database.prepare('SELECT 1 FROM audit_logs WHERE request_id=?').bind(options.requestId).first();
  if(duplicate)return;
  const row=await database.prepare('SELECT status,prepared_by AS preparedBy FROM managed_payouts WHERE id=?').bind(options.payoutId).first<{status:string;preparedBy:string}>();
  if(!row)throw new ManagedSettlementError('Managed payout not found.');
  if(options.action==='approve'){
    if(row.status!=='prepared'||row.preparedBy===options.actorId)throw new ManagedSettlementError('A different authorized reviewer must approve a prepared payout.');
    await database.batch([
      database.prepare("UPDATE managed_payouts SET status='approved',approved_by=?,updated_at=? WHERE id=? AND status='prepared'").bind(options.actorId,options.now,options.payoutId),
      database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
        VALUES (?,?,'managed_payout.approved','managed_payout',?,'A different authorized reviewer approved the simulated payout',NULL,?,?,NULL,?)`).bind(
        crypto.randomUUID(),options.actorId,options.payoutId,JSON.stringify({status:'approved'}),options.requestId,options.now,
      ),
    ]);return;
  }
  if(row.status!=='approved')throw new ManagedSettlementError('Only an approved payout can be marked paid.');
  const reference=options.providerReference?.trim();if(!reference)throw new ManagedSettlementError('Record a simulated payout reference.');
  await database.batch([
    database.prepare("UPDATE managed_payouts SET status='paid',provider_reference=?,paid_at=?,updated_at=? WHERE id=? AND status='approved'").bind(reference,options.now,options.now,options.payoutId),
    database.prepare(`UPDATE managed_entitlements SET status='paid',paid_at=?,version=version+1,updated_at=? WHERE id IN (
      SELECT DISTINCT x.entitlement_id FROM managed_settlement_entries x JOIN managed_payout_entries pe ON pe.settlement_entry_id=x.id WHERE pe.payout_id=?)`).bind(options.now,options.now,options.payoutId),
    database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
      VALUES (?,?,'managed_payout.paid','managed_payout',?,'Simulated payout completion recorded',NULL,?,?,NULL,?)`).bind(
      crypto.randomUUID(),options.actorId,options.payoutId,JSON.stringify({status:'paid',providerReference:reference}),options.requestId,options.now,
    ),
  ]);
}
