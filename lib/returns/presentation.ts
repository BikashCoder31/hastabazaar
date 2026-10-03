import type { ReturnPolicySnapshot } from './validation';

const staleImportedStandardReturns = /Returns or exchanges are accepted within 10 days of delivery under the standard Hastabazaar return policy\./gi;

export function currentProductReturnConditions(conditions: string | null): string | null {
  return conditions?.replace(staleImportedStandardReturns, '').trim() || null;
}

export function productReturnDisclosure(
  eligible: boolean,
  conditions: string | null,
  policy: ReturnPolicySnapshot,
) {
  return {
    eligibility: eligible && policy.changeOfMindEnabled
      ? `Change-of-mind returns: request within ${policy.generalRequestWindowDays} days after delivery, subject to the conditions below. For goods supplied sealed, request within ${policy.sealedGoodsWindowDays} days if the original seal remains intact.`
      : 'Not eligible for change-of-mind returns.',
    conditions: currentProductReturnConditions(conditions) || (
      !eligible
        ? 'This item is excluded from change-of-mind returns. No additional item-specific return conditions are provided; problem-item protections below still apply.'
        : !policy.changeOfMindEnabled
          ? 'Change-of-mind returns are unavailable under the current marketplace policy. Problem-item protections below still apply.'
          : 'No additional item-specific return conditions are provided. Marketplace return conditions and review apply.'
    ),
    protection: `Wrong, damaged, defective, counterfeit, materially misdescribed or unreasonably late goods can still be reviewed, even if change-of-mind returns are excluded. Report visible damage within ${policy.deliveryDamageEvidenceWindowHours} hours where possible; later reports receive manual review and photos are optional.`,
  };
}
