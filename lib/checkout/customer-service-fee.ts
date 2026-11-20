import type { FeeWaiverCampaign } from '../marketplace/fee-waivers';
import {
  PLATFORM_SERVICE_FEE_RULE,
  parseServiceFeeSnapshot,
  validatePlatformServiceFee,
  type CustomerServiceFeeSnapshot,
  type PlatformServiceFeePolicy,
} from './platform-service-fee';

/** The caller selects the effective campaign; saved attribution owns that revision. */
export function customerServiceFeeSnapshot(
  policy: PlatformServiceFeePolicy,
  versionId: string | null,
  campaign: FeeWaiverCampaign | null,
): CustomerServiceFeeSnapshot {
  const p = validatePlatformServiceFee(policy);
  const standardPaisa = p.enabled ? p.amountPaisa : 0;
  const attribution = standardPaisa > 0 && campaign
    ? Object.freeze({ id: campaign.id, revision: campaign.revision, name: campaign.name })
    : null;
  const waivedPaisa = attribution ? standardPaisa : 0;
  const snapshot: CustomerServiceFeeSnapshot = {
    ...p,
    chargedPaisa: standardPaisa - waivedPaisa,
    versionId,
    rule: PLATFORM_SERVICE_FEE_RULE,
    schemaVersion: 2,
    standardPaisa,
    waivedPaisa,
    campaign: attribution,
  };
  parseServiceFeeSnapshot(snapshot);
  return Object.freeze(snapshot);
}
