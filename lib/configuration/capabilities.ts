import type {
  BusinessSettingKey,
  BusinessSettingValue,
  ManagedMakerCommercialModel,
} from './types';
import { assertHomepageHeroPublicationReady } from '../homepage/hero-slides';
import { assertHomepageOccasionPublicationReady } from '../homepage/occasion-slides';

export type CapabilityReadiness =
  | 'implemented'
  | 'in_development'
  | 'live_blocked';

export type ManagedMakerCapability = Readonly<{
  code: ManagedMakerCommercialModel;
  label: string;
  readiness: CapabilityReadiness;
  milestone: string;
  description: string;
  selectableForLiveActivation: boolean;
  selectableForStagingSimulation: boolean;
}>;

export const managedMakerCapabilities: readonly ManagedMakerCapability[] =
  Object.freeze([
    Object.freeze({
      code: 'managed_sale_linked_percentage_v1',
      label: 'Sale-linked percentage settlement',
      readiness: 'implemented',
      milestone: 'Evidence-based live activation',
      description:
        'The configured platform share and the reconciled maker entitlement become earned only after delivered-and-paid conditions.',
      selectableForLiveActivation: true,
      selectableForStagingSimulation: true,
    }),
    Object.freeze({
      code: 'managed_fixed_supplier_price_v1',
      label: 'Fixed supplier-price purchasing',
      readiness: 'implemented',
      milestone: 'Milestone 3 verification',
      description:
        'The accepted supplier amount becomes owed at documented supply acceptance without an automatic percentage deduction.',
      selectableForLiveActivation: false,
      selectableForStagingSimulation: true,
    }),
  ]);

export function managedMakerModelIsLiveSelectable(
  code: ManagedMakerCommercialModel,
): boolean {
  return (
    managedMakerCapabilities.find((capability) => capability.code === code)
      ?.selectableForLiveActivation === true
  );
}

export function assertBusinessSettingPublicationReady<
  K extends BusinessSettingKey,
>(
  key: K,
  value: BusinessSettingValue<K>,
  context: { simulationAllowed?: boolean } = {},
): void {
  const blocked = businessSettingPublicationLimitation(key, value);
  if (blocked) throw new RangeError(blocked);
  if (
    key === 'managed_maker_active_model' &&
    value !== null &&
    !managedMakerModelIsLiveSelectable(value as ManagedMakerCommercialModel) &&
    !(
      context.simulationAllowed &&
      managedMakerCapabilities.some(
        (capability) =>
          capability.code === value &&
          capability.selectableForStagingSimulation,
      )
    )
  ) {
    throw new RangeError(
      'The selected Managed Maker commercial model is not implemented and tested for live activation.',
    );
  }
  if (
    key === 'managed_maker_program_mode' &&
    value === 'activation_enabled' &&
    !managedMakerCapabilities.some(
      (capability) =>
        capability.selectableForLiveActivation ||
        (context.simulationAllowed &&
          capability.selectableForStagingSimulation),
    )
  ) {
    throw new RangeError(
      'Managed Maker activation is not implemented and tested for live use.',
    );
  }
  if (key === 'rider_finance_policy') {
    const policy = value as BusinessSettingValue<'rider_finance_policy'>;
    if (
      policy.cashExposureLimitPaisa === null ||
      !policy.operatingWeekdays.length ||
      policy.receivingAccountLabel === 'Not configured for assignment'
    ) {
      throw new RangeError(
        'Rider finance publication requires a positive cash exposure limit, at least one operating weekday, and an approved receiving-account label.',
      );
    }
  }
  if (key === 'homepage_hero_slides') {
    assertHomepageHeroPublicationReady(
      value as BusinessSettingValue<'homepage_hero_slides'>,
    );
  }
  if (key === 'homepage_occasion_slides') {
    assertHomepageOccasionPublicationReady(
      value as BusinessSettingValue<'homepage_occasion_slides'>,
    );
  }
}

export function businessSettingPublicationLimitation(key: BusinessSettingKey, value: unknown): string | null {
  if (['payout_processing_weekday', 'payout_cutoff_local_time', 'payout_timezone'].includes(key))
    return 'Scheduled payout execution is not implemented. This calendar setting cannot be published; existing values and manual payout records remain available.';
  if (key === 'platform_payout_minimum_paisa' && value !== 0)
    return 'A configurable payout minimum is not implemented. Keep the approved positive eligible balance rule (zero minimum).';
  if (key === 'new_seller_reserve_bps' && value !== 0)
    return 'A nonzero seller reserve requires an approved reserve agreement and release policy. Publication is unavailable until that workflow is implemented.';
  return null;
}
