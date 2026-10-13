import { companyDetails } from '../content/company-details';
import { defaultProductWatermarkPolicy, validateProductWatermarkPolicy } from '../products/watermark-policy';
import {
  businessSettingKeys,
  type BusinessSettingDefinition,
  type BusinessSettingKey,
  type BusinessSettingValue,
  type BusinessWeekday,
  type ManagedMakerCommercialModel,
  type ManagedMakerProgramMode,
  type ManagedMakerCompanyAccount,
  type OfficialSocialLinks,
  type FirstPartyAnalyticsPolicy,
  type RiderFinancePolicy,
  type RecentlyViewedPolicy,
} from './types';
import {
  INITIAL_HOMEPAGE_HERO_SLIDES,
  validateHomepageHeroDraft,
} from '../homepage/hero-slides';
import {
  INITIAL_HOMEPAGE_OCCASION_SLIDES,
  validateHomepageOccasionDraft,
} from '../homepage/occasion-slides';

function integerInRange(
  label: string,
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new RangeError(
      `${label} must be a safe integer from ${minimum.toLocaleString('en-US')} through ${maximum.toLocaleString('en-US')}.`,
    );
  }
  return Number(value);
}

function basisPoints(label: string, value: unknown): number {
  return integerInRange(label, value, 0, 10_000);
}

function oneOf<T extends string>(
  label: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new RangeError(`${label} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function codeList(label: string, value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a list.`);
  const normalized = value.map((entry) => {
    if (
      typeof entry !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(entry)
    ) {
      throw new RangeError(`${label} contains an invalid code.`);
    }
    return entry;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new RangeError(`${label} cannot contain duplicate codes.`);
  }
  return Object.freeze(normalized);
}

function displayTextList(label: string, value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new TypeError(`${label} must be a list of at most 100 items.`);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string')
      throw new RangeError(`${label} contains an invalid value.`);
    const normalized = entry.trim().replace(/\s+/g, ' ');
    if (
      !normalized ||
      normalized.length > 80 ||
      normalized.includes('<') ||
      normalized.includes('>') ||
      /\p{Cc}/u.test(normalized)
    )
      throw new RangeError(`${label} contains an invalid value.`);
    const key = normalized.toLocaleLowerCase('en');
    if (seen.has(key))
      throw new RangeError(`${label} cannot contain duplicate values.`);
    seen.add(key);
    result.push(normalized);
  }
  return Object.freeze(result);
}

const socialLinkHosts = {
  linkedin: new Set(['linkedin.com', 'www.linkedin.com']),
  x: new Set(['x.com', 'www.x.com']),
  tiktok: new Set(['tiktok.com', 'www.tiktok.com']),
  instagram: new Set(['instagram.com', 'www.instagram.com']),
  facebook: new Set(['facebook.com', 'www.facebook.com']),
  youtube: new Set(['youtube.com', 'www.youtube.com']),
} as const;

function officialSocialLinks(value: unknown): OfficialSocialLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Official social links must be an object.');
  }
  const candidate = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [platform, hosts] of Object.entries(socialLinkHosts)) {
    const raw = candidate[platform];
    if (typeof raw !== 'string') {
      throw new TypeError(`${platform} must be an HTTPS URL.`);
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new RangeError(`${platform} must be a valid HTTPS URL.`);
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      !hosts.has(parsed.hostname.toLowerCase())
    ) {
      throw new RangeError(`${platform} must use its approved HTTPS host.`);
    }
    result[platform] = parsed.toString().replace(/\/$/, '');
  }
  if (Object.keys(candidate).some((key) => !(key in socialLinkHosts))) {
    throw new RangeError('Official social links contain an unknown platform.');
  }
  return Object.freeze(result) as OfficialSocialLinks;
}

function firstPartyAnalyticsPolicy(value: unknown): FirstPartyAnalyticsPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('First-party analytics policy must be an object.');
  }
  const candidate = value as Record<string, unknown>;
  const expected = new Set([
    'enabled',
    'retentionDays',
    'excludedEmailDomains',
    'excludedPathPrefixes',
  ]);
  if (Object.keys(candidate).some((key) => !expected.has(key))) {
    throw new RangeError(
      'First-party analytics policy contains an unknown field.',
    );
  }
  if (typeof candidate.enabled !== 'boolean') {
    throw new TypeError('Analytics enabled must be true or false.');
  }
  const retentionDays = integerInRange(
    'Analytics retention days',
    candidate.retentionDays,
    1,
    365,
  );
  if (
    !Array.isArray(candidate.excludedEmailDomains) ||
    candidate.excludedEmailDomains.length > 50
  ) {
    throw new TypeError(
      'Excluded email domains must be a list of at most 50 domains.',
    );
  }
  const excludedEmailDomains = candidate.excludedEmailDomains.map((entry) => {
    if (typeof entry !== 'string')
      throw new TypeError('Excluded email domains must be text.');
    const domain = entry.trim().toLowerCase();
    if (
      !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain) ||
      !domain.includes('.')
    ) {
      throw new RangeError('Excluded email domains contain an invalid domain.');
    }
    return domain;
  });
  if (new Set(excludedEmailDomains).size !== excludedEmailDomains.length) {
    throw new RangeError('Excluded email domains cannot contain duplicates.');
  }
  if (
    !Array.isArray(candidate.excludedPathPrefixes) ||
    candidate.excludedPathPrefixes.length > 50
  ) {
    throw new TypeError(
      'Excluded path prefixes must be a list of at most 50 paths.',
    );
  }
  const excludedPathPrefixes = candidate.excludedPathPrefixes.map((entry) => {
    if (
      typeof entry !== 'string' ||
      !/^\/[a-z0-9/_-]*$/i.test(entry) ||
      entry.length > 100 ||
      entry.includes('//')
    ) {
      throw new RangeError('Excluded path prefixes contain an invalid path.');
    }
    return entry.length > 1 ? entry.replace(/\/$/, '') : entry;
  });
  if (new Set(excludedPathPrefixes).size !== excludedPathPrefixes.length) {
    throw new RangeError('Excluded path prefixes cannot contain duplicates.');
  }
  return Object.freeze({
    enabled: candidate.enabled,
    retentionDays,
    excludedEmailDomains: Object.freeze(excludedEmailDomains),
    excludedPathPrefixes: Object.freeze(excludedPathPrefixes),
  });
}

function recentlyViewedPolicy(value: unknown): RecentlyViewedPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Recently Viewed policy must be an object.');
  }
  const candidate = value as Record<string, unknown>;
  const expected = new Set(['maxItems', 'retentionDays']);
  if (Object.keys(candidate).some((key) => !expected.has(key))) {
    throw new RangeError('Recently Viewed policy contains an unknown field.');
  }
  return Object.freeze({
    maxItems: integerInRange(
      'Recently Viewed item limit',
      candidate.maxItems,
      1,
      24,
    ),
    retentionDays: integerInRange(
      'Recently Viewed retention days',
      candidate.retentionDays,
      1,
      365,
    ),
  });
}

function riderFinancePolicy(value: unknown): RiderFinancePolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Rider finance policy must be an object.');
  }
  const candidate = value as Record<string, unknown>;
  const expected = new Set([
    'cashExposureLimitPaisa',
    'operatingWeekdays',
    'holidayDates',
    'remittanceCutoffLocalTime',
    'completedTripPaisa',
    'failedTripPaisa',
    'returnTripPaisa',
    'receivingAccountLabel',
  ]);
  if (Object.keys(candidate).some((key) => !expected.has(key))) {
    throw new RangeError('Rider finance policy contains an unknown field.');
  }
  const limit = candidate.cashExposureLimitPaisa;
  if (limit !== null && (!Number.isSafeInteger(limit) || Number(limit) < 1)) {
    throw new RangeError(
      'Rider cash exposure limit must be null or positive paisa.',
    );
  }
  if (!Array.isArray(candidate.operatingWeekdays)) {
    throw new TypeError('Rider operating weekdays must be a list.');
  }
  const operatingWeekdays = candidate.operatingWeekdays.map((day) =>
    oneOf('Rider operating weekday', day, weekdays),
  );
  if (new Set(operatingWeekdays).size !== operatingWeekdays.length) {
    throw new RangeError('Rider operating weekdays cannot contain duplicates.');
  }
  if (
    !Array.isArray(candidate.holidayDates) ||
    candidate.holidayDates.length > 100
  ) {
    throw new TypeError('Rider holidays must be a list of at most 100 dates.');
  }
  const holidayDates = candidate.holidayDates.map((date) => {
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    ) {
      throw new RangeError('Rider holidays must use valid YYYY-MM-DD dates.');
    }
    return date;
  });
  if (new Set(holidayDates).size !== holidayDates.length) {
    throw new RangeError('Rider holidays cannot contain duplicates.');
  }
  if (
    typeof candidate.remittanceCutoffLocalTime !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate.remittanceCutoffLocalTime)
  ) {
    throw new RangeError(
      'Rider remittance cutoff must use 24-hour HH:mm format.',
    );
  }
  const receivingAccountLabel =
    typeof candidate.receivingAccountLabel === 'string'
      ? candidate.receivingAccountLabel.trim()
      : '';
  if (
    receivingAccountLabel.length < 8 ||
    receivingAccountLabel.length > 120 ||
    /[<>]/.test(receivingAccountLabel)
  ) {
    throw new RangeError(
      'Receiving account label must be 8–120 safe characters.',
    );
  }
  return Object.freeze({
    cashExposureLimitPaisa: limit === null ? null : Number(limit),
    operatingWeekdays: Object.freeze(operatingWeekdays),
    holidayDates: Object.freeze(holidayDates),
    remittanceCutoffLocalTime: candidate.remittanceCutoffLocalTime,
    completedTripPaisa: integerInRange(
      'Completed trip rate',
      candidate.completedTripPaisa,
      0,
      100_000_000,
    ),
    failedTripPaisa: integerInRange(
      'Failed trip rate',
      candidate.failedTripPaisa,
      0,
      100_000_000,
    ),
    returnTripPaisa: integerInRange(
      'Return trip rate',
      candidate.returnTripPaisa,
      0,
      100_000_000,
    ),
    receivingAccountLabel,
  });
}

const weekdays: readonly BusinessWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const managedModels: readonly ManagedMakerCommercialModel[] = [
  'managed_sale_linked_percentage_v1',
  'managed_fixed_supplier_price_v1',
];

const programModes: readonly ManagedMakerProgramMode[] = [
  'applications_only',
  'activation_enabled',
];

function companyAccount(value: unknown): ManagedMakerCompanyAccount {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Company account must be an object.');
  const data = value as Record<string, unknown>;
  const limits = { entityReference: 191, storeName: 160, contactEmail: 254, contactPhone: 20, returnAddress: 500 };
  if (Object.keys(data).some(key => !(key in limits))) throw new Error('Unsupported company account field; legal identity and PAN are read-only.');
  for (const [key, max] of Object.entries(limits)) {
    if (typeof data[key] !== 'string' || String(data[key]).length > max || (key !== 'contactPhone' && !String(data[key]).trim())) throw new Error(`Company account ${key} is required and must fit its limit.`);
  }
  if (data.entityReference !== companyDetails.entityReference) throw new Error('Company entity reference is stable and read-only.');
  if (!/^\S+@\S+\.\S+$/.test(String(data.contactEmail).trim())) throw new Error('Enter a valid company contact email.');
  if (typeof data.contactPhone === 'string' && data.contactPhone && !/^\+?\d{7,15}$/.test(data.contactPhone.trim())) throw new Error('Enter a valid company contact phone.');
  return { entityReference: companyDetails.entityReference, storeName: String(data.storeName).trim(), contactEmail: String(data.contactEmail).trim().toLowerCase(),
    contactPhone: String(data.contactPhone).trim(), returnAddress: String(data.returnAddress).trim() };
}

const definitions = [
  { key: 'managed_maker_company_account', label: 'Company selling account',
    description: 'Super Admin controls the operational store, contact and return destination. Individual makers keep their own identity and login. Company legal identity and PAN come from the canonical company record.',
    defaultValue: Object.freeze({ entityReference: companyDetails.entityReference, storeName: companyDetails.brandName,
      contactEmail: companyDetails.supportEmail, contactPhone: '', returnAddress: companyDetails.registeredOffice }),
    sensitivity: 'operational', changeControl: 'controlled', effectiveMode: 'effective_dated', snapshotOnTransaction: true,
    affectedSurfaces: ['maker_onboarding', 'admin_review', 'managed_makers'], requiredCapability: null, validate: companyAccount,
  },
  {
    key: 'product_photo_watermark',
    label: 'Product photo watermark',
    description: 'Adds a subtle HastaBazaar wordmark to customer photo copies. Private originals are preserved. Changes also apply to existing uploaded product photos.',
    defaultValue: defaultProductWatermarkPolicy,
    sensitivity: 'public_content',
    changeControl: 'simple',
    effectiveMode: 'immediate',
    snapshotOnTransaction: false,
    affectedSurfaces: ['product_photos', 'seller_preview'],
    requiredCapability: null,
    validate: validateProductWatermarkPolicy,
  },
  {
    key: 'independent_seller_commission_bps',
    label: 'Independent seller commission',
    description: 'Commission retained from an independent seller transaction.',
    defaultValue: 900,
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: true,
    affectedSurfaces: ['seller', 'orders', 'settlements'],
    requiredCapability: 'independent_seller_commission_v1',
    validate: (value: unknown) =>
      basisPoints('Independent seller commission', value),
  },
  {
    key: 'managed_sale_linked_platform_retention_bps',
    label: 'Managed Maker sale-linked platform retention',
    description:
      'Platform-retained share; maker entitlement is the reconciled remainder.',
    defaultValue: 900,
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: true,
    affectedSurfaces: ['managed_makers', 'orders', 'settlements'],
    requiredCapability: 'managed_sale_linked_percentage_v1',
    validate: (value: unknown) =>
      basisPoints('Managed Maker platform retention', value),
  },
  {
    key: 'managed_maker_program_mode',
    label: 'Managed Maker program mode',
    description:
      'Accept applications without implying that live selling is available.',
    defaultValue: 'applications_only',
    sensitivity: 'contractual',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: false,
    affectedSurfaces: ['maker_onboarding', 'admin_review', 'catalogue'],
    requiredCapability: 'managed_maker_activation_v1',
    validate: (value: unknown) =>
      oneOf('Managed Maker program mode', value, programModes),
  },
  {
    key: 'managed_maker_active_model',
    label: 'Managed Maker active commercial model',
    description:
      'Selects one implemented model; null keeps live commercial activation disabled.',
    defaultValue: null,
    sensitivity: 'contractual',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: true,
    affectedSurfaces: ['managed_makers', 'products', 'orders', 'settlements'],
    requiredCapability: 'managed_maker_models_v1',
    validate: (value: unknown) =>
      value === null
        ? null
        : oneOf('Managed Maker commercial model', value, managedModels),
  },
  {
    key: 'payout_processing_weekday',
    label: 'Payout processing weekday',
    description: 'Weekday on which an eligible payout batch is initiated.',
    defaultValue: 'wednesday',
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: false,
    affectedSurfaces: ['seller', 'maker', 'settlements'],
    requiredCapability: 'scheduled_payouts_v1',
    validate: (value: unknown) => oneOf('Payout weekday', value, weekdays),
  },
  {
    key: 'payout_cutoff_local_time',
    label: 'Payout processing cutoff',
    description: 'Local-time cutoff for inclusion in the next payout batch.',
    defaultValue: '17:00',
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: false,
    affectedSurfaces: ['seller', 'maker', 'settlements'],
    requiredCapability: 'scheduled_payouts_v1',
    validate: (value: unknown) => {
      if (
        typeof value !== 'string' ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
      ) {
        throw new RangeError('Payout cutoff must use 24-hour HH:mm format.');
      }
      return value;
    },
  },
  {
    key: 'payout_timezone',
    label: 'Payout timezone',
    description:
      'Timezone used for payout schedules and displayed eligibility dates.',
    defaultValue: 'Asia/Kathmandu',
    sensitivity: 'operational',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: false,
    affectedSurfaces: ['seller', 'maker', 'settlements'],
    requiredCapability: 'scheduled_payouts_v1',
    validate: (value: unknown) =>
      oneOf('Payout timezone', value, ['Asia/Kathmandu'] as const),
  },
  {
    key: 'seller_delivery_hold_days',
    label: 'Delivery hold before payout eligibility',
    description:
      'Initial eligibility period; it is not a universal return-right cutoff.',
    defaultValue: 7,
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: true,
    affectedSurfaces: ['seller', 'maker', 'settlements'],
    requiredCapability: 'scheduled_payouts_v1',
    validate: (value: unknown) =>
      integerInRange('Delivery hold days', value, 0, 365),
  },
  {
    key: 'platform_payout_minimum_paisa',
    label: 'Platform payout minimum',
    description:
      'Zero means positive eligible balances are payable where the channel permits.',
    defaultValue: 0,
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: false,
    affectedSurfaces: ['seller', 'maker', 'settlements'],
    requiredCapability: 'scheduled_payouts_v1',
    validate: (value: unknown) =>
      integerInRange('Payout minimum paisa', value, 0, Number.MAX_SAFE_INTEGER),
  },
  {
    key: 'new_seller_reserve_bps',
    label: 'New seller reserve',
    description:
      'Disabled at zero; non-zero use requires an approved reserve policy.',
    defaultValue: 0,
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: true,
    affectedSurfaces: ['seller', 'settlements'],
    requiredCapability: 'seller_reserve_v1',
    validate: (value: unknown) => basisPoints('New seller reserve', value),
  },
  {
    key: 'rider_remittance_business_days',
    label: 'Rider remittance period',
    description:
      'Business days from collection to the expected remittance date.',
    defaultValue: 1,
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: true,
    affectedSurfaces: ['rider', 'finance', 'assignments'],
    requiredCapability: 'rider_cash_reconciliation_v1',
    validate: (value: unknown) =>
      integerInRange('Remittance business days', value, 0, 30),
  },
  {
    key: 'rider_finance_policy',
    label: 'Rider cash exposure, calendar and simulated trip rates',
    description:
      'Controlled rider cash limit, operating calendar, remittance cutoff, receiving label and separate simulated trip compensation.',
    defaultValue: Object.freeze({
      cashExposureLimitPaisa: null,
      operatingWeekdays: Object.freeze([]),
      holidayDates: Object.freeze([]),
      remittanceCutoffLocalTime: '17:00',
      completedTripPaisa: 0,
      failedTripPaisa: 0,
      returnTripPaisa: 0,
      receivingAccountLabel: 'Not configured for assignment',
    }),
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: true,
    affectedSurfaces: ['rider', 'finance', 'assignments', 'remittance'],
    requiredCapability: 'rider_cash_reconciliation_v1',
    validate: riderFinancePolicy,
  },
  {
    key: 'open_box_category_codes',
    label: 'Open-box product categories',
    description: 'Approved categories; staging starts with clay products.',
    defaultValue: Object.freeze(['clay']),
    sensitivity: 'operational',
    changeControl: 'simple',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: true,
    affectedSurfaces: ['catalogue', 'checkout', 'rider', 'returns'],
    requiredCapability: 'open_box_delivery_v1',
    validate: (value: unknown) => codeList('Open-box categories', value),
  },
  {
    key: 'open_box_service_area_codes',
    label: 'Open-box service-area district codes',
    description:
      'Normalized district codes where trained rider inspection is available; assignments snapshot the value.',
    defaultValue: Object.freeze([]),
    sensitivity: 'operational',
    changeControl: 'simple',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: true,
    affectedSurfaces: ['checkout', 'rider', 'returns'],
    requiredCapability: 'open_box_delivery_v1',
    validate: (value: unknown) => codeList('Open-box service areas', value),
  },
  {
    key: 'managed_adjustment_reason_codes',
    label: 'Managed Maker adjustment reasons',
    description:
      'Approved reason codes for linked, reviewable settlement adjustments.',
    defaultValue: Object.freeze(['refund', 'dispute', 'accepted_defect']),
    sensitivity: 'financial',
    changeControl: 'controlled',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: false,
    affectedSurfaces: ['managed_makers', 'returns', 'settlements'],
    requiredCapability: 'managed_adjustments_v1',
    validate: (value: unknown) => codeList('Managed adjustment reasons', value),
  },
  {
    key: 'product_material_suggestions',
    label: 'Product material suggestions',
    description:
      'Searchable optional material suggestions. Sellers may add another accurate material.',
    defaultValue: Object.freeze([
      'clay',
      'cotton',
      'jute',
      'wood',
      'bamboo',
      'wool',
      'metal',
      'glass',
      'paper',
      'Wooden beads',
    ]),
    sensitivity: 'public_content',
    changeControl: 'simple',
    effectiveMode: 'immediate',
    snapshotOnTransaction: false,
    affectedSurfaces: [
      'seller_product_editor',
      'managed_maker_product_drafts',
      'catalogue',
    ],
    requiredCapability: null,
    validate: (value: unknown) =>
      displayTextList('Product material suggestions', value),
  },
  {
    key: 'official_social_links',
    label: 'Official Hastabazaar social links',
    description:
      'Validated public links managed centrally without a code deployment.',
    defaultValue: Object.freeze({
      linkedin: 'https://linkedin.com/company/hastabazaar',
      x: 'https://x.com/Hastabazaar',
      tiktok: 'https://tiktok.com/@hastabazaar',
      instagram: 'https://instagram.com/hastabazaar',
      facebook: 'https://www.facebook.com/hastabazaar',
      youtube: 'https://www.youtube.com/@hastabazaar',
    }),
    sensitivity: 'public_content',
    changeControl: 'simple',
    effectiveMode: 'immediate',
    snapshotOnTransaction: false,
    affectedSurfaces: ['public_footer', 'public_content'],
    requiredCapability: null,
    validate: officialSocialLinks,
  },
  {
    key: 'first_party_analytics_policy',
    label: 'First-party analytics policy',
    description:
      'Controls privacy-limited browser-session estimates and retention. It never enables advertising, cross-site tracking, session replay, or checkout-detail capture.',
    defaultValue: Object.freeze({
      enabled: false,
      retentionDays: 90,
      excludedEmailDomains: Object.freeze([
        'local.hastabazaar.test',
        'example.test',
      ]),
      excludedPathPrefixes: Object.freeze([
        '/orders',
        '/account',
        '/documents',
        '/admin',
        '/seller',
        '/rider',
        '/local-testing',
        '/api',
      ]),
    }),
    sensitivity: 'operational',
    changeControl: 'simple',
    effectiveMode: 'immediate',
    snapshotOnTransaction: false,
    affectedSurfaces: [
      'public_storefront',
      'admin_analytics',
      'privacy_operations',
    ],
    requiredCapability: 'first_party_analytics_v1',
    validate: firstPartyAnalyticsPolicy,
  },
  {
    key: 'recently_viewed_policy',
    label: 'Recently Viewed history',
    description:
      'Controls the bounded customer convenience list. Guest history remains browser-local and is never merged into an account.',
    defaultValue: Object.freeze({ maxItems: 12, retentionDays: 90 }),
    sensitivity: 'operational',
    changeControl: 'simple',
    effectiveMode: 'immediate',
    snapshotOnTransaction: false,
    affectedSurfaces: [
      'product_detail',
      'customer_history',
      'guest_browser_storage',
    ],
    requiredCapability: 'recently_viewed_v1',
    validate: recentlyViewedPolicy,
  },
  {
    key: 'homepage_hero_slides',
    label: 'Homepage hero slides',
    description:
      'Versioned public hero content, order, actions, and media references.',
    defaultValue: INITIAL_HOMEPAGE_HERO_SLIDES,
    sensitivity: 'public_content',
    changeControl: 'simple',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: false,
    affectedSurfaces: ['public_homepage', 'admin_homepage'],
    requiredCapability: 'homepage_hero_carousel_v1',
    validate: validateHomepageHeroDraft,
  },
  {
    key: 'homepage_occasion_slides',
    label: 'Homepage gifting slides',
    description:
      'Versioned gifting stories and two safe internal action cards per slide.',
    defaultValue: INITIAL_HOMEPAGE_OCCASION_SLIDES,
    sensitivity: 'public_content',
    changeControl: 'simple',
    effectiveMode: 'effective_dated',
    snapshotOnTransaction: false,
    affectedSurfaces: ['public_homepage', 'admin_homepage'],
    requiredCapability: 'homepage_occasion_carousel_v1',
    validate: validateHomepageOccasionDraft,
  },
] as const satisfies readonly BusinessSettingDefinition[];

if (definitions.length !== businessSettingKeys.length) {
  throw new Error('Business setting registry and key list are inconsistent.');
}

export const businessSettingDefinitions = definitions;

export function parseBusinessSettingKey(value: unknown): BusinessSettingKey {
  if (
    typeof value !== 'string' ||
    !businessSettingKeys.includes(value as BusinessSettingKey)
  ) {
    throw new Error(`Unknown business setting: ${String(value)}.`);
  }
  return value as BusinessSettingKey;
}

export function getBusinessSettingDefinition<K extends BusinessSettingKey>(
  key: K,
): BusinessSettingDefinition<K> {
  const definition = definitions.find((candidate) => candidate.key === key);
  if (!definition) throw new Error(`Unknown business setting: ${String(key)}.`);
  return definition as unknown as BusinessSettingDefinition<K>;
}

export function validateBusinessSettingValue<K extends BusinessSettingKey>(
  key: K,
  value: unknown,
): BusinessSettingValue<K> {
  return getBusinessSettingDefinition(key).validate(value);
}
