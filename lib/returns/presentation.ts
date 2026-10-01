import type { ReturnPolicySnapshot } from './validation';

export function productReturnDisclosure(
  eligible: boolean,
  conditions: string | null,
  policy: ReturnPolicySnapshot,
) {
  return {
    eligibility: eligible && policy.changeOfMindEnabled
      ? `Change-of-mind returns: request within ${policy.generalRequestWindowDays} days after delivery, subject to the conditions below.`
      : 'Not eligible for change-of-mind returns.',
    conditions: conditions?.trim() || 'No additional item-specific conditions or exclusions are listed. Marketplace eligibility and review apply.',
    protection: `Wrong, damaged, defective, counterfeit, materially misdescribed or unreasonably late goods can still be reviewed, even if change-of-mind returns are excluded. Report visible damage within ${policy.deliveryDamageEvidenceWindowHours} hours where possible; later reports receive manual review and photos are optional.`,
  };
}
