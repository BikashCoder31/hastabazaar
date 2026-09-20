import type {
  BusinessSettingKey,
  BusinessSettingValue,
  ManagedMakerCommercialModel,
} from './types';

export type CapabilityReadiness = 'implemented' | 'in_development' | 'live_blocked';

export type ManagedMakerCapability = Readonly<{
  code: ManagedMakerCommercialModel;
  label: string;
  readiness: CapabilityReadiness;
  milestone: string;
  description: string;
  selectableForLiveActivation: boolean;
}>;

export const managedMakerCapabilities: readonly ManagedMakerCapability[] =
  Object.freeze([
    Object.freeze({
      code: 'managed_sale_linked_percentage_v1',
      label: 'Sale-linked percentage settlement',
      readiness: 'in_development',
      milestone: 'Milestone 2 demonstration',
      description:
        '9% platform retention and the reconciled 91% maker entitlement become earned only after delivered-and-paid conditions.',
      selectableForLiveActivation: false,
    }),
    Object.freeze({
      code: 'managed_fixed_supplier_price_v1',
      label: 'Fixed supplier-price purchasing',
      readiness: 'in_development',
      milestone: 'Milestone 3 verification',
      description:
        'The accepted supplier amount becomes owed at documented supply acceptance without an automatic percentage deduction.',
      selectableForLiveActivation: false,
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
>(key: K, value: BusinessSettingValue<K>): void {
  if (
    key === 'managed_maker_active_model' &&
    value !== null &&
    !managedMakerModelIsLiveSelectable(value as ManagedMakerCommercialModel)
  ) {
    throw new RangeError(
      'The selected Managed Maker commercial model is not implemented and tested for live activation.',
    );
  }
  if (
    key === 'managed_maker_program_mode' &&
    value === 'activation_enabled' &&
    !managedMakerCapabilities.some(
      (capability) => capability.selectableForLiveActivation,
    )
  ) {
    throw new RangeError(
      'Managed Maker activation is not implemented and tested for live use.',
    );
  }
}
