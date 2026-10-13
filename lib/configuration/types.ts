import type { ProductWatermarkPolicy } from '../products/watermark-policy';
import type { HomepageHeroSlides } from '../homepage/hero-slides';
import type { HomepageOccasionSlides } from '../homepage/occasion-slides';

export const businessSettingKeys = [
  'independent_seller_commission_bps',
  'managed_sale_linked_platform_retention_bps',
  'managed_maker_program_mode',
  'managed_maker_active_model',
  'managed_maker_company_account',
  'payout_processing_weekday',
  'payout_cutoff_local_time',
  'payout_timezone',
  'seller_delivery_hold_days',
  'platform_payout_minimum_paisa',
  'new_seller_reserve_bps',
  'rider_remittance_business_days',
  'rider_finance_policy',
  'open_box_category_codes',
  'open_box_service_area_codes',
  'managed_adjustment_reason_codes',
  'product_material_suggestions',
  'official_social_links',
  'product_photo_watermark',
  'first_party_analytics_policy',
  'recently_viewed_policy',
  'homepage_hero_slides',
  'homepage_occasion_slides',
] as const;

export type BusinessSettingKey = (typeof businessSettingKeys)[number];

export type ManagedMakerProgramMode =
  | 'applications_only'
  | 'activation_enabled';

export type ManagedMakerCommercialModel =
  | 'managed_sale_linked_percentage_v1'
  | 'managed_fixed_supplier_price_v1';

export type BusinessWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type OfficialSocialLinks = Readonly<{
  linkedin: string;
  x: string;
  tiktok: string;
  instagram: string;
  facebook: string;
  youtube: string;
}>;

export type FirstPartyAnalyticsPolicy = Readonly<{
  enabled: boolean;
  retentionDays: number;
  excludedEmailDomains: readonly string[];
  excludedPathPrefixes: readonly string[];
}>;

export type RecentlyViewedPolicy = Readonly<{
  maxItems: number;
  retentionDays: number;
}>;

export type RiderFinancePolicy = Readonly<{
  cashExposureLimitPaisa: number | null;
  operatingWeekdays: readonly BusinessWeekday[];
  holidayDates: readonly string[];
  remittanceCutoffLocalTime: string;
  completedTripPaisa: number;
  failedTripPaisa: number;
  returnTripPaisa: number;
  receivingAccountLabel: string;
}>;

export type ManagedMakerCompanyAccount = Readonly<{
  entityReference: string; storeName: string; contactEmail: string; contactPhone: string; returnAddress: string;
}>;

export type BusinessSettingValues = Readonly<{
  independent_seller_commission_bps: number;
  managed_sale_linked_platform_retention_bps: number;
  managed_maker_program_mode: ManagedMakerProgramMode;
  managed_maker_active_model: ManagedMakerCommercialModel | null;
  managed_maker_company_account: ManagedMakerCompanyAccount;
  payout_processing_weekday: BusinessWeekday;
  payout_cutoff_local_time: string;
  payout_timezone: 'Asia/Kathmandu';
  seller_delivery_hold_days: number;
  platform_payout_minimum_paisa: number;
  new_seller_reserve_bps: number;
  rider_remittance_business_days: number;
  rider_finance_policy: RiderFinancePolicy;
  open_box_category_codes: readonly string[];
  open_box_service_area_codes: readonly string[];
  managed_adjustment_reason_codes: readonly string[];
  product_material_suggestions: readonly string[];
  official_social_links: OfficialSocialLinks;
  product_photo_watermark: ProductWatermarkPolicy;
  first_party_analytics_policy: FirstPartyAnalyticsPolicy;
  recently_viewed_policy: RecentlyViewedPolicy;
  homepage_hero_slides: HomepageHeroSlides;
  homepage_occasion_slides: HomepageOccasionSlides;
}>;

export type BusinessSettingValue<K extends BusinessSettingKey> =
  BusinessSettingValues[K];

export type BusinessSettingChangeControl = 'simple' | 'controlled';
export type BusinessSettingSensitivity =
  | 'public_content'
  | 'operational'
  | 'financial'
  | 'contractual';
export type BusinessSettingEffectiveMode = 'immediate' | 'effective_dated';

export type BusinessSettingDefinition<
  K extends BusinessSettingKey = BusinessSettingKey,
> = Readonly<{
  key: K;
  label: string;
  description: string;
  defaultValue: BusinessSettingValue<K>;
  sensitivity: BusinessSettingSensitivity;
  changeControl: BusinessSettingChangeControl;
  effectiveMode: BusinessSettingEffectiveMode;
  snapshotOnTransaction: boolean;
  affectedSurfaces: readonly string[];
  requiredCapability: string | null;
  validate: (value: unknown) => BusinessSettingValue<K>;
}>;
