import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {ensureReviewTask,listReviewTasks} from '../workflows/review-tasks';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {ManualPaymentError} from './manual-receipts';

class FinanceAccessError extends ManualPaymentError{constructor(message:string){super(message,403);}}
export interface IncomingParcelFocus{parcelId:string;remittanceId?:string;}

/** Pending rider reports from the same COD records as the manual workspace. */
export async function readRiderCashToCount(db:D1Database,actorId:string){
 const authority=await staffMutationGuard(db,actorId,'payment.receipt.verify',FinanceAccessError,'super_admin');
 const rows=(await db.prepare(`SELECT c.id,c.shipping_job_id AS jobId,c.rider_user_id AS riderId,
   c.amount_paisa AS amountPaisa,c.created_at AS createdAt,o.id AS orderId,o.order_number AS orderNumber
   FROM parcel_cash_records c JOIN shipping_parcels p ON p.shipping_job_id=c.shipping_job_id
   JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id
   WHERE c.kind='remittance' AND c.status='pending' AND c.rider_user_id IS NOT NULL
     AND o.payment_mode='cod' AND p.collected_paisa>0
   ORDER BY c.created_at,c.id`).all<{id:string;jobId:string;riderId:string;amountPaisa:number;createdAt:number;orderId:string;orderNumber:string}>()).results;
 await db.batch(authority.statements);
 return rows;
}

export async function readCourierCashDue(db: D1Database, actorId: string) {
  await staffMutationGuard(db, actorId, 'payment.receipt.verify', FinanceAccessError, 'super_admin');
  const { results } = await db.prepare(`SELECT j.id AS jobId, o.id AS orderId,
    o.order_number AS orderNumber, p.courier_name AS courierName,
    b.remaining_paisa AS amountPaisa, j.updated_at AS updatedAt
    FROM cod_reconciliation_balances b
    JOIN shipping_parcels p ON p.shipping_job_id = b.shipping_job_id
    JOIN shipping_jobs j ON j.id = p.shipping_job_id
    JOIN orders o ON o.id = j.order_id
    WHERE o.payment_mode = 'cod' AND p.method = 'courier' AND b.remaining_paisa > 0
    ORDER BY j.updated_at, j.id`).all<{
      jobId: string; orderId: string; orderNumber: string; courierName: string | null;
      amountPaisa: number; updatedAt: number;
    }>();
  return results;
}

async function readManualWorkspaceReceipts(db: D1Database) {
 // Sum physical receipt rows directly. MariaDB can merge the backing views and
 // move their aggregate expressions under another SUM.
 return (await db.prepare(`SELECT r.id,r.kind,r.account_version_id AS accountVersionId,
   r.transaction_identity AS transactionIdentity,r.bank_at AS bankAt,r.confirmed_at AS confirmedAt,
   r.amount_minor AS amountMinor,r.currency,r.payer_reference AS payerReference,
   r.evidence_reference AS evidenceReference,r.status,c.revision,
   COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0) AS reversedMinor,
   EXISTS(SELECT 1 FROM manual_payment_exceptions e
     WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved') AS reversalHold,
   r.amount_minor
     - COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
     - COALESCE((SELECT SUM(used.amount_minor) FROM manual_receipt_uses used
         WHERE used.receipt_id=r.id AND used.state<>'released'),0)
     + COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss
         JOIN manual_receipt_uses used ON used.id=loss.receipt_use_id AND used.state<>'released'
         JOIN seller_recovery_receipt_reversal_reviews review ON review.id=loss.review_id AND review.state='completed'
         WHERE used.receipt_id=r.id),0)
     + COALESCE((SELECT SUM(satisfaction.amount_paisa) FROM receipt_return_bank_satisfactions satisfaction
         JOIN manual_receipt_uses used ON used.id=satisfaction.receipt_use_id AND used.state<>'released'
         JOIN seller_recovery_receipt_reversal_reviews review ON review.id=satisfaction.review_id AND review.state='completed'
         WHERE used.receipt_id=r.id),0)
     - COALESCE((SELECT SUM(allocation.amount_paisa) FROM seller_recovery_allocations allocation
         WHERE allocation.receipt_id=r.id),0)
     + COALESCE((SELECT SUM(part.amount_paisa) FROM seller_recovery_receipt_reversal_parts part
         JOIN seller_recovery_allocations allocation ON allocation.id=part.allocation_id AND allocation.case_id=part.case_id
         JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id AND review.state='completed'
         WHERE allocation.receipt_id=r.id),0) AS unallocatedMinor
   FROM company_money_receipts r JOIN company_receipt_controls c ON c.receipt_id=r.id
   ORDER BY r.confirmed_at DESC,r.id LIMIT 100`).all<{id:string;kind:string;accountVersionId:string|null;transactionIdentity:string;bankAt:number;confirmedAt:number;amountMinor:number;currency:string;payerReference:string;evidenceReference:string;status:string;revision:number;unallocatedMinor:number;reversedMinor:number;reversalHold:number}>()).results;
}

const deliveredCourierParcels = `
  FROM cod_reconciliation_balances b
  JOIN shipping_parcels p ON p.shipping_job_id=b.shipping_job_id
  JOIN shipping_jobs j ON j.id=p.shipping_job_id
  JOIN orders o ON o.id=j.order_id
  WHERE o.payment_mode='cod' AND p.method='courier' AND p.rider_user_id IS NULL
    AND j.direction='outbound' AND p.collected_paisa>0
    AND (p.delivered_at IS NOT NULL OR j.status='delivered')`;

type CourierCashTotals = {
  delivered: number;
  collectedPaisa: number;
  matchedBankPaisa: number;
  matchedBankReceipts: number;
  outstanding: number;
  remainingPaisa: number;
  oldestDeliveredAt: number | null;
};

type CourierCashParcel = {
  id: string;
  orderId: string;
  orderNumber: string;
  version: number;
  courierName: string | null;
  sellerName: string;
  deliveredAt: number | null;
  collectedPaisa: number;
  approvedDeductionsPaisa: number;
  actualCashPaisa: number;
  remainingPaisa: number;
  correctionHeld: number;
  personalInterest: number;
};

type CourierCashDifference = {
  id: string;
  kind: 'cod_remittance' | 'receipt_reversal' | 'unallocated_credit';
  orderNumber: string | null;
  receiptReference: string | null;
  remainingPaisa: number | null;
  createdAt: number;
  total: number;
};

/** Read-only courier view. Historical own-rider and unrelated bank credits stay in the original workspace. */
export async function readCourierCashWorkspace(db: D1Database, actorId: string) {
  const authority = await staffMutationGuard(db, actorId, 'payment.receipt.verify', FinanceAccessError);
  const nowStatement = db.prepare(`SELECT ${checkoutCommitClock(db)} AS now`);
  const totalsStatement = db.prepare(`
    WITH courier_parcels AS (
      SELECT j.id,p.delivered_at,b.collected_paisa,b.remaining_paisa ${deliveredCourierParcels}
    ), bank AS (
      SELECT COALESCE(SUM(a.amount_paisa),0) AS matchedBankPaisa,COUNT(DISTINCT r.id) AS matchedBankReceipts
      FROM cod_company_receipt_allocations a
      JOIN company_money_receipts r ON r.id=a.receipt_id AND r.kind='bank_credit' AND r.currency='NPR'
      JOIN parcel_cash_records c ON c.id=a.cash_record_id AND c.status='posted'
      JOIN courier_parcels courier ON courier.id=a.shipping_job_id
    )
    SELECT COUNT(*) AS delivered,COALESCE(SUM(collected_paisa),0) AS collectedPaisa,
      COALESCE(SUM(CASE WHEN remaining_paisa>0 THEN 1 ELSE 0 END),0) AS outstanding,
      COALESCE(SUM(CASE WHEN remaining_paisa>0 THEN remaining_paisa ELSE 0 END),0) AS remainingPaisa,
      MIN(CASE WHEN remaining_paisa>0 THEN delivered_at ELSE NULL END) AS oldestDeliveredAt,
      (SELECT matchedBankPaisa FROM bank) AS matchedBankPaisa,
      (SELECT matchedBankReceipts FROM bank) AS matchedBankReceipts
    FROM courier_parcels`);
  const parcelsStatement = db.prepare(`
    SELECT j.id,j.order_id AS orderId,o.order_number AS orderNumber,p.version,
      p.courier_name AS courierName,(SELECT s.trading_name FROM seller_profiles s WHERE s.id=j.seller_id) AS sellerName,
      p.delivered_at AS deliveredAt,b.collected_paisa AS collectedPaisa,
      b.approved_deductions_paisa AS approvedDeductionsPaisa,b.actual_cash_paisa AS actualCashPaisa,
      b.remaining_paisa AS remainingPaisa,b.correction_held AS correctionHeld,
      CASE WHEN o.customer_id=? OR EXISTS(SELECT 1 FROM seller_profiles s WHERE s.id=j.seller_id AND s.user_id=?)
        THEN 1 ELSE 0 END AS personalInterest
    ${deliveredCourierParcels} AND b.remaining_paisa>0
    ORDER BY CASE WHEN p.delivered_at IS NULL THEN 1 ELSE 0 END,p.delivered_at,j.id LIMIT 100`).bind(actorId, actorId);
  const differencesStatement = db.prepare(`
    WITH courier_parcels AS (SELECT j.id,o.id AS orderId,b.remaining_paisa ${deliveredCourierParcels})
    SELECT e.id,e.kind,e.created_at AS createdAt,o.order_number AS orderNumber,
      r.transaction_identity AS receiptReference,short_payment.remaining_paisa AS remainingPaisa,COUNT(*) OVER () AS total
    FROM manual_payment_exceptions e
    LEFT JOIN orders o ON o.id=e.order_id
    LEFT JOIN company_money_receipts r ON r.id=e.receipt_id
    LEFT JOIN courier_parcels short_payment ON e.kind='cod_remittance' AND e.source_key='cod:'||short_payment.id
    WHERE e.state<>'resolved' AND (
      short_payment.id IS NOT NULL
      OR (e.kind IN ('receipt_reversal','unallocated_credit') AND EXISTS(
        SELECT 1 FROM cod_company_receipt_allocations a JOIN courier_parcels courier ON courier.id=a.shipping_job_id
        WHERE a.receipt_id=e.receipt_id AND (e.order_id IS NULL OR courier.orderId=e.order_id)
      ))
    )
    ORDER BY e.created_at,e.id LIMIT 100`);
  const [clock, totals, parcels, differences, allReceipts, receiptConflicts] = await Promise.all([
    nowStatement.first<{ now: number }>(),
    totalsStatement.first<CourierCashTotals>(),
    parcelsStatement.all<CourierCashParcel>(),
    differencesStatement.all<CourierCashDifference>(),
    authority.role === 'super_admin' ? readManualWorkspaceReceipts(db) : [],
    authority.role === 'super_admin' ? db.prepare(
      'SELECT receipt_id AS id FROM company_receipt_conflicts WHERE user_id=?',
    ).bind(actorId).all<{ id: string }>() : null,
  ]);
  if (!clock || !totals) throw new Error('The courier cash balances could not be read.');

  // Look up costs for the parcels displayed here so the preview includes their original costs.
  const parcelIds = parcels.results.map(parcel => parcel.id);
  const costs = parcelIds.length ? (await db.prepare(`
    SELECT c.id,c.shipping_job_id AS jobId,c.evidence_reference AS evidenceReference,
      c.amount_paisa-COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.courier_cost_id=c.id),0) AS remainingPaisa
    FROM parcel_courier_costs c WHERE c.shipping_job_id IN (${parcelIds.map(() => '?').join(',')})
    ORDER BY c.created_at,c.id`).bind(...parcelIds).all<{
      id: string; jobId: string; evidenceReference: string; remainingPaisa: number;
    }>()).results : [];
  await staffMutationGuard(db, actorId, 'payment.receipt.verify', FinanceAccessError,
    authority.role === 'super_admin' ? 'super_admin' : undefined);
  const blockedReceipts = new Set(receiptConflicts?.results.map(receipt => receipt.id));
  const receipts = allReceipts
    .filter(r => r.kind === 'bank_credit' && r.currency === 'NPR' && r.status === 'verified'
      && !r.reversalHold && r.unallocatedMinor > 0 && !blockedReceipts.has(r.id))
    .map(({ id, transactionIdentity, bankAt, amountMinor, unallocatedMinor, revision }) =>
      ({ id, transactionIdentity, bankAt, amountMinor, unallocatedMinor, revision }));
  return { now: Number(clock.now), totals, parcels: parcels.results, differences: differences.results, costs, receipts };
}

export async function getManualPaymentWorkspace(db:D1Database,actorId:string,orderFilter:string|null=null,focus?:IncomingParcelFocus){
 const authority=await staffMutationGuard(db,actorId,'payment.receipt.verify',FinanceAccessError);
 const clock=checkoutCommitClock(db),now=Number((await db.prepare(`SELECT ${clock} AS now`).first<{now:number}>())!.now);
 if(orderFilter!==null&&(orderFilter.length>160||!orderFilter.trim()))throw new ManualPaymentError('Enter an exact order number.',400);
 if(focus&&(typeof focus.parcelId!=='string'||!focus.parcelId||focus.parcelId.length>191||focus.remittanceId!==undefined&&(typeof focus.remittanceId!=='string'||!focus.remittanceId||focus.remittanceId.length>191)))throw new ManualPaymentError('Use an exact original parcel and remittance reference.',400);
 const filter=orderFilter?' AND (o.id=? OR o.order_number=?)':'',values=orderFilter?[orderFilter,orderFilter]:[];
 const orders=(await db.prepare(`SELECT w.order_id AS id,o.order_number AS orderNumber,o.customer_id AS customerId,u.display_name AS customerName,w.revision,w.paid_at AS paidAt,w.closed_at AS closedAt,w.released_at AS releasedAt,w.deadline_at AS deadlineAt,w.cutoff_at AS cutoffAt,b.payable_paisa AS payablePaisa,b.received_paisa AS receivedPaisa,i.account_version_id AS accountVersionId,EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=w.order_id AND e.kind='receipt_reversal' AND e.state<>'resolved') AS reconciliationRequired FROM manual_payment_cutoffs w JOIN orders o ON o.id=w.order_id JOIN users u ON u.id=o.customer_id JOIN manual_payment_balances b ON b.order_id=w.order_id JOIN company_payment_instructions i ON i.order_id=w.order_id WHERE 1=1 ${filter} ORDER BY CASE WHEN w.closed_at IS NULL AND w.released_at IS NULL THEN 0 ELSE 1 END,w.issued_at,w.order_id LIMIT 100`).bind(...values).all<{id:string;orderNumber:string;customerId:string;customerName:string;revision:number;paidAt:number|null;closedAt:number|null;releasedAt:number|null;deadlineAt:number;cutoffAt:number;payablePaisa:number;receivedPaisa:number;accountVersionId:string;reconciliationRequired:number}>()).results;
 const claims=(await db.prepare(`SELECT c.id,c.order_id AS orderId,o.order_number AS orderNumber,u.display_name AS customerName,c.claimed_amount_paisa AS amountPaisa,c.payment_date AS paymentDate,c.bank_reference AS bankReference,c.note,c.evidence_ids_json AS evidenceJson,c.current_state AS state,c.revision,c.first_submitted_at AS submittedAt,w.revision AS windowRevision,w.deadline_at AS deadlineAt,w.cutoff_at AS cutoffAt,w.paid_at AS paidAt,w.closed_at AS closedAt,b.payable_paisa AS payablePaisa,b.received_paisa AS receivedPaisa FROM manual_payment_claims c JOIN orders o ON o.id=c.order_id JOIN users u ON u.id=o.customer_id JOIN manual_payment_cutoffs w ON w.order_id=c.order_id JOIN manual_payment_balances b ON b.order_id=c.order_id WHERE 1=1 ${filter} ORDER BY c.first_submitted_at,c.id LIMIT 100`).bind(...values).all<{id:string;orderId:string;orderNumber:string;customerName:string;amountPaisa:number;paymentDate:string;bankReference:string|null;note:string;evidenceJson:string;state:string;revision:number;submittedAt:number;windowRevision:number;deadlineAt:number;cutoffAt:number;paidAt:number|null;closedAt:number|null;payablePaisa:number;receivedPaisa:number}>()).results;
 const exceptions=(await db.prepare("SELECT e.id,e.order_id AS orderId,e.receipt_id AS receiptId,e.kind,e.state,e.revision,e.reason,e.owner_id AS ownerId,e.backup_id AS backupId,(SELECT x.note FROM manual_payment_exception_events x WHERE x.exception_id=e.id ORDER BY x.revision DESC LIMIT 1) AS lastNote,e.created_at AS createdAt,e.triaged_at AS triagedAt,e.next_update_at AS nextUpdateAt FROM manual_payment_exceptions e WHERE e.state<>'resolved' ORDER BY e.created_at,e.id LIMIT 100").all<{id:string;orderId:string|null;receiptId:string|null;kind:string;state:string;revision:number;reason:string;ownerId:string|null;backupId:string|null;lastNote:string|null;createdAt:number;triagedAt:number|null;nextUpdateAt:number}>()).results;
 for(const claim of claims)if(claim.paidAt===null&&claim.closedAt===null&&now<claim.cutoffAt&&['submitted','clarified','needs_information'].includes(claim.state))await ensureReviewTask(db,{sourceType:'payment_claim',sourceId:claim.id,now});
 for(const entry of exceptions)await ensureReviewTask(db,{sourceType:'payment_exception',sourceId:entry.id,now});
 const receipts=await readManualWorkspaceReceipts(db);
 const reversals=authority.role==='super_admin'?(await db.prepare(`SELECT reversal.id,reversal.receipt_id receiptId,reversal.amount_minor amountPaisa,EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review WHERE review.reversal_id=reversal.id AND review.state='completed') completed FROM company_receipt_reversals reversal WHERE reversal.receipt_id IN(${receipts.map(()=>'?').join(',')||'NULL'}) ORDER BY reversal.bank_at,reversal.id`).bind(...receipts.map(r=>r.id)).all<{id:string;receiptId:string;amountPaisa:number;completed:number}>()).results:[];
 const accounts=(await db.prepare('SELECT v.id,v.number,v.status,v.details_json AS detailsJson,EXISTS(SELECT 1 FROM company_payment_account_current c WHERE c.version_id=v.id) AS enabled FROM company_payment_account_versions v WHERE v.verified_at IS NOT NULL ORDER BY v.created_at DESC LIMIT 100').all<{id:string;number:number;status:string;detailsJson:string;enabled:number}>()).results.map(row=>{const d=JSON.parse(row.detailsJson) as {holder:string;bank:string;accountNumber:string;currency:string};return {id:row.id,number:row.number,status:row.status,enabled:Boolean(row.enabled),holder:d.holder,bank:d.bank,lastFour:d.accountNumber.slice(-4),currency:d.currency};});
 const codPrivacy=" AND (?=1 OR (COALESCE(p.method,'')<>'own_rider' AND p.rider_user_id IS NULL))",codValues=[...values,authority.role==='super_admin'?1:0];
 const codParcels=(await db.prepare(`SELECT j.id,j.order_id AS orderId,o.order_number AS orderNumber,p.version,p.method,b.cod_due_paisa AS codDuePaisa,b.collected_paisa AS collectedPaisa,b.reported_remittance_paisa AS reportedRemittancePaisa,b.actual_cash_paisa AS actualCashPaisa,b.approved_deductions_paisa AS approvedDeductionsPaisa,b.remaining_paisa AS remainingPaisa,b.correction_held AS correctionHeld FROM cod_reconciliation_balances b JOIN shipping_parcels p ON p.shipping_job_id=b.shipping_job_id JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE o.payment_mode='cod' AND p.collected_paisa>0 ${filter} ${codPrivacy} ${focus?"AND j.id=?":""} ORDER BY CASE WHEN b.remaining_paisa>0 OR b.correction_held=1 THEN 0 ELSE 1 END,j.created_at,j.id LIMIT 100`).bind(...codValues,...focus?[focus.parcelId]:[]).all<{id:string;orderId:string;orderNumber:string;version:number;method:string|null;codDuePaisa:number;collectedPaisa:number;reportedRemittancePaisa:number;actualCashPaisa:number;approvedDeductionsPaisa:number;remainingPaisa:number;correctionHeld:number}>()).results;
 const codCosts=(await db.prepare(`SELECT c.id,c.shipping_job_id AS jobId,c.amount_paisa AS amountPaisa,c.evidence_reference AS evidenceReference,c.note,c.amount_paisa-COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.courier_cost_id=c.id),0) AS remainingPaisa FROM parcel_courier_costs c JOIN shipping_parcels p ON p.shipping_job_id=c.shipping_job_id JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE o.payment_mode='cod' ${filter} ${codPrivacy} ${focus?"AND j.id=?":""} ORDER BY c.created_at DESC,c.id LIMIT 300`).bind(...codValues,...focus?[focus.parcelId]:[]).all<{id:string;jobId:string;amountPaisa:number;evidenceReference:string;note:string;remainingPaisa:number}>()).results;
 const codClaims=(await db.prepare(`SELECT c.id,c.shipping_job_id AS jobId,c.status,c.amount_paisa AS amountPaisa,c.evidence_reference AS evidenceReference FROM parcel_cash_records c JOIN shipping_parcels p ON p.shipping_job_id=c.shipping_job_id JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE c.kind='remittance' AND c.status IN('pending','posted') ${filter} ${codPrivacy} ${focus?"AND j.id=?":""} ${focus?.remittanceId?"AND c.id=?":""} ORDER BY c.created_at DESC,c.id LIMIT 300`).bind(...codValues,...focus?[focus.parcelId]:[],...focus?.remittanceId?[focus.remittanceId]:[]).all<{id:string;jobId:string;status:string;amountPaisa:number;evidenceReference:string}>()).results;
 const candidates=(await db.prepare("SELECT DISTINCT u.id,u.display_name AS name FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role IN('admin','super_admin') ORDER BY u.display_name,u.id LIMIT 100").all<{id:string;name:string}>()).results;
 const reviewers=(await Promise.all(candidates.map(async candidate=>{const grants=await Promise.allSettled([staffMutationGuard(db,candidate.id,'payment.receipt.verify',FinanceAccessError),staffMutationGuard(db,candidate.id,'order.manage',FinanceAccessError)]);return {...candidate,finance:grants[0].status==='fulfilled',orders:grants[1].status==='fulfilled'};}))).filter(r=>r.finance||r.orders);
 const tasks=(await listReviewTasks(db,actorId)).filter(task=>['payment_claim','payment_exception'].includes(task.sourceType));
 await staffMutationGuard(db,actorId,'payment.receipt.verify',FinanceAccessError,authority.role==='super_admin'?'super_admin':undefined);
 if(focus&&(!codParcels.some(row=>row.id===focus.parcelId)||focus.remittanceId&&!codClaims.some(row=>row.id===focus.remittanceId&&row.jobId===focus.parcelId)))throw new ManualPaymentError('The original collected parcel or remittance is unavailable in this view.',404);
 return {focus:focus??null,now,orders,reviewers,codParcels,codCosts,codClaims,claims:claims.map(({evidenceJson,...claim})=>({...claim,evidenceIds:JSON.parse(evidenceJson) as string[]})),receipts:receipts.map(r=>({...r,reversals:reversals.filter(v=>v.receiptId===r.id).map(({receiptId:_receiptId,...v})=>({...v,completed:Boolean(v.completed)})),unallocatedMinor:Math.max(0,r.unallocatedMinor),unresolvedExposureMinor:Math.max(0,-r.unallocatedMinor)})),accounts,exceptions,tasks};
}
