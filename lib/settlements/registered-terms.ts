import { getEffectiveBusinessSetting } from '../db/repositories/business-settings';

export interface RegisteredSettlementTerms {
  schemaVersion: 1;
  deliveryHoldDays: number;
  holdSettingVersionId: string | null;
  reserveBps: number;
  reserveSettingVersionId: string | null;
  reserveAppliesForDays: number;
  reserveReleaseAfterDays: number;
}

/** Prospective evidence only. This must never be used to reprice an old ledger entry. */
export async function getRegisteredSettlementTerms(
  database: D1Database,
  now: number,
): Promise<RegisteredSettlementTerms> {
  const [hold, reserve] = await Promise.all([
    getEffectiveBusinessSetting(database, 'seller_delivery_hold_days', now),
    getEffectiveBusinessSetting(database, 'new_seller_reserve_bps', now),
  ]);
  if (reserve.value !== 0)
    throw new Error(
      'A nonzero seller reserve requires an approved reserve agreement and release policy before new orders can use it.',
    );
  return {
    schemaVersion: 1,
    deliveryHoldDays: hold.value,
    holdSettingVersionId: hold.versionId,
    reserveBps: reserve.value,
    reserveSettingVersionId: reserve.versionId,
    reserveAppliesForDays: 0,
    reserveReleaseAfterDays: 0,
  };
}
