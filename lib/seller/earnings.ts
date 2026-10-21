import { getSellerCommissionTerms } from '../db/repositories/commission-rates';
import {
  getSellerFinanceSummary,
  type SellerFinanceSummary,
} from '../db/repositories/payouts';
import type { SellerCommissionTerms } from '../commission/rates';
import { getAcceptedManagedTerms } from '../managed-commerce/accepted-terms';
import { CommissionRateUnavailableError, getEffectiveBusinessSetting } from '../db/repositories/business-settings';
import { getCommissionSetting, sellerAcceptedCommissionVersion } from '../db/repositories/marketplace-settings';
import {
  getManagedFinanceSummary,
  type ManagedFinanceSummary,
} from '../managed-commerce/payout-operations';

export interface SellerEarnings {
  registered: SellerFinanceSummary;
  /** Original checkout evidence, before cancellations/refunds. Never a cash balance. */
  marketplaceFees: { originalStandardPaisa: number; originalWaivedPaisa: number; originalNetPaisa: number };
  commission: SellerCommissionTerms | null;
  commissionAccepted?: boolean;
  offeredCommissionBps?: number;
  currentRateUnavailable?: boolean;
  participationRoute: string | null;
  hasRegisteredRecords: boolean;
  managed: {
    summary: ManagedFinanceSummary;
    retentionBps: number | null;
    offeredRetentionBps?: number | null;
    commercialModel: string | null;
  } | null;
}

function unavailableRate(error: unknown): null {
  if (!(error instanceof CommissionRateUnavailableError)) throw error;
  return null;
}

/** Read-only presentation of the two existing ledgers. Never accrues or releases money. */
export async function getSellerEarnings(
  database: D1Database,
  sellerId: string,
  now = Date.now(),
): Promise<SellerEarnings> {
  const [registered, commission, baseCommission, participation, marketplaceFees] = await Promise.all([
    getSellerFinanceSummary(database, sellerId, now),
    getSellerCommissionTerms(database, sellerId, now).catch(unavailableRate),
    getCommissionSetting(database, now).catch(unavailableRate),
    database
      .prepare(`SELECT p.participation_route AS route, p.commercial_model AS model,
      EXISTS(SELECT 1 FROM managed_entitlements WHERE seller_id=s.id) AS hasManagedRecords,
      EXISTS(SELECT 1 FROM seller_ledger_entries l WHERE l.seller_id=s.id
        AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=l.order_item_id)
        AND NOT EXISTS(SELECT 1 FROM order_items i WHERE i.id=l.order_item_id AND i.commission_rule_version LIKE 'managed-%'))
        OR EXISTS(SELECT 1 FROM payouts WHERE seller_id=s.id)
        OR EXISTS(SELECT 1 FROM payout_requests WHERE seller_id=s.id) AS hasRegisteredRecords
      FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=?`)
      .bind(sellerId)
      .first<{
        route: string | null;
        model: string | null;
        hasManagedRecords: number;
        hasRegisteredRecords: number;
      }>(),
    database.prepare(`SELECT COALESCE(SUM(COALESCE(f.standard_paisa,i.commission_paisa)),0) AS originalStandardPaisa,
      COALESCE(SUM(COALESCE(f.waived_paisa,0)),0) AS originalWaivedPaisa,
      COALESCE(SUM(COALESCE(f.net_paisa,i.commission_paisa)),0) AS originalNetPaisa
      FROM order_items i LEFT JOIN order_item_marketplace_fees f ON f.order_item_id=i.id
      WHERE i.seller_id=? AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots m WHERE m.order_item_id=i.id)
        AND COALESCE(i.commission_rule_version,'') NOT LIKE 'managed-%'`)
      .bind(sellerId).first<SellerEarnings['marketplaceFees']>(),
  ]);
  const hasManaged =
    participation?.route === 'managed_maker' ||
    Boolean(participation?.hasManagedRecords);
  const [managedSummary, accepted, offered] = hasManaged
    ? await Promise.all([
        getManagedFinanceSummary(database, sellerId, now),
        participation?.model === 'managed_sale_linked_percentage_v1'
          ? getAcceptedManagedTerms(database, sellerId, now).catch(unavailableRate)
          : Promise.resolve(null),
        participation?.route === 'managed_maker' && participation.model === 'managed_sale_linked_percentage_v1'
          ? getEffectiveBusinessSetting(database, 'managed_sale_linked_platform_retention_bps', now).catch(unavailableRate)
          : Promise.resolve(null),
      ])
    : [null, null, null];
  const commissionAccepted = baseCommission ? await sellerAcceptedCommissionVersion(database, sellerId, baseCommission.versionId) : false;
  return {
    registered,
    marketplaceFees: {
      originalStandardPaisa: Number(marketplaceFees?.originalStandardPaisa ?? 0),
      originalWaivedPaisa: Number(marketplaceFees?.originalWaivedPaisa ?? 0),
      originalNetPaisa: Number(marketplaceFees?.originalNetPaisa ?? 0),
    },
    commission,
    commissionAccepted,
    offeredCommissionBps: baseCommission?.basisPoints,
    currentRateUnavailable: baseCommission === null,
    participationRoute: participation?.route ?? null,
    hasRegisteredRecords: Boolean(participation?.hasRegisteredRecords),
    managed: managedSummary
      ? {
          summary: managedSummary,
          retentionBps: accepted?.retentionBps ?? null,
          offeredRetentionBps: offered?.value ?? null,
          commercialModel: participation?.model ?? null,
        }
      : null,
  };
}
