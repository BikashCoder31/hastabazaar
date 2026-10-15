import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { getManagedFinanceSummary, getManagedPayoutPreview, managedEntitlementNetSql } from './payout-operations';
import { ManagedSettlementError } from './settlement-errors';
import { getManagedSettlementBlockers, managedSettlementReadySql, type ManagedSettlementBlocker } from './settlement-readiness';
import { getAcceptedManagedTerms } from './accepted-terms';

export interface ManagedPaymentRow {
  id: string; number: string; amountPaisa: number; status: string; scheduledFor: number; updatedAt: number;
  destination: string; providerReference: string | null;
}
export interface ManagedFinanceMaker {
  sellerId: string; name: string; stage: string | null; route: string | null; acceptedTermsReady: boolean;
  summary: Awaited<ReturnType<typeof getManagedFinanceSummary>>;
  preview: Awaited<ReturnType<typeof getManagedPayoutPreview>>;
  payments: readonly ManagedPaymentRow[]; paymentCount: number;
  blockers: readonly (ManagedSettlementBlocker & { entitlementId: string })[]; moreBlockers: boolean;
}
export interface ManagedFinanceWorkspace { makers: readonly ManagedFinanceMaker[]; nextCursor: string | null; error?: string }

/** Private, read-only data. Historical managed money remains visible after a PAN transition. */
export async function getManagedFinanceWorkspace(db: D1Database, context: { actorId: string; now: number; after?: string }): Promise<ManagedFinanceWorkspace> {
  await staffMutationGuard(db, context.actorId, 'payout.prepare', ManagedSettlementError, 'super_admin');
  if (context.after !== undefined && (!context.after || context.after.length > 191)) throw new RangeError('Invalid maker payment cursor.');
  const rows = await db.prepare(`SELECT s.id AS sellerId,s.trading_name AS name,p.application_stage AS stage,p.participation_route AS route,
    (SELECT COUNT(*) FROM managed_payouts WHERE seller_id=s.id) AS paymentCount
    FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id
    WHERE (p.participation_route='managed_maker' OR EXISTS(SELECT 1 FROM managed_entitlements WHERE seller_id=s.id))
      AND s.id>? ORDER BY s.id LIMIT 21`).bind(context.after ?? '')
    .all<{ sellerId: string; name: string; stage: string | null; route: string | null; paymentCount: number }>();
  const makers = await Promise.all(rows.results.slice(0,20).map(async row => {
    const [summary, preview, accepted, payments, blocked] = await Promise.all([
      getManagedFinanceSummary(db, row.sellerId, context.now), getManagedPayoutPreview(db, row.sellerId, context.now),
      getAcceptedManagedTerms(db, row.sellerId, context.now),
      db.prepare(`SELECT id,payout_number AS number,amount_paisa AS amountPaisa,status,scheduled_for AS scheduledFor,
        updated_at AS updatedAt,destination_reference AS destination,provider_reference AS providerReference
        FROM managed_payouts WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 50`).bind(row.sellerId).all<ManagedPaymentRow>(),
      db.prepare(`SELECT e.id FROM managed_entitlements e WHERE e.seller_id=? AND (${managedEntitlementNetSql()})<>0
        AND NOT (${managedSettlementReadySql('e', context.now)}) ORDER BY e.id LIMIT 51`).bind(row.sellerId).all<{ id: string }>(),
    ]);
    const blockers = (await Promise.all(blocked.results.slice(0,50).map(async entitlement =>
      (await getManagedSettlementBlockers(db, { sellerId: row.sellerId, entitlementId: entitlement.id, now: context.now }))
        .map(blocker => ({ ...blocker, entitlementId: entitlement.id }))))).flat();
    return { ...row, acceptedTermsReady: Boolean(accepted), summary, preview, payments: payments.results,
      blockers, moreBlockers: blocked.results.length > 50 };
  }));
  return { makers, nextCursor: rows.results.length > 20 ? makers[19].sellerId : null };
}
