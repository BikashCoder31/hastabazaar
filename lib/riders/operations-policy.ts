import type {
  BusinessWeekday,
  RiderFinancePolicy,
} from '../configuration/types';
import { getEffectiveBusinessSetting } from '../db/repositories/business-settings';

export type { RiderFinancePolicy } from '../configuration/types';

export type RiderTripOutcome = 'completed' | 'failed' | 'return';

const weekdayByUtcDay: readonly BusinessWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const kathmanduOffsetMilliseconds = (5 * 60 + 45) * 60_000;

function safePaisa(label: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe paisa amount.`);
  }
  return value;
}

export function normalizeOperationalCode(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function calculateRiderCashExposure(input: {
  heldPaisa: number;
  assignedUncollectedPaisa: number;
  proposedCodPaisa: number;
  limitPaisa: number;
}) {
  const heldPaisa = safePaisa('Held cash', input.heldPaisa);
  const assignedUncollectedPaisa = safePaisa(
    'Assigned COD exposure',
    input.assignedUncollectedPaisa,
  );
  const proposedCodPaisa = safePaisa(
    'Proposed COD exposure',
    input.proposedCodPaisa,
  );
  const limitPaisa = safePaisa('Cash exposure limit', input.limitPaisa);
  const total =
    BigInt(heldPaisa) +
    BigInt(assignedUncollectedPaisa) +
    BigInt(proposedCodPaisa);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      'Combined rider cash exposure exceeds the supported range.',
    );
  }
  const totalPaisa = Number(total);
  return Object.freeze({
    heldPaisa,
    assignedUncollectedPaisa,
    proposedCodPaisa,
    totalPaisa,
    limitPaisa,
    permitted: totalPaisa <= limitPaisa,
  });
}

export function evaluateOpenBoxEligibility(input: {
  productCodes: readonly string[];
  serviceAreaCode: string;
  configuredProductCodes: readonly string[];
  configuredServiceAreaCodes: readonly string[];
  riderEligible: boolean;
}) {
  const productCodes = new Set(
    input.productCodes.map(normalizeOperationalCode),
  );
  const productEligible = input.configuredProductCodes
    .map(normalizeOperationalCode)
    .some((code) => productCodes.has(code));
  const serviceAreaEligible = input.configuredServiceAreaCodes
    .map(normalizeOperationalCode)
    .includes(normalizeOperationalCode(input.serviceAreaCode));
  const assignmentBlocked =
    productEligible && serviceAreaEligible && !input.riderEligible;
  const required =
    productEligible && serviceAreaEligible && input.riderEligible;
  const reason = required
    ? 'eligible'
    : assignmentBlocked
      ? 'rider_not_trained'
      : !productEligible
        ? 'product_not_configured'
        : 'service_area_not_configured';
  return Object.freeze({
    productEligible,
    serviceAreaEligible,
    riderEligible: input.riderEligible,
    required,
    assignmentBlocked,
    reason,
  });
}

function kathmanduDateParts(timestamp: number) {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new RangeError('Collection time must be a valid timestamp.');
  }
  const date = new Date(timestamp + kathmanduOffsetMilliseconds);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function dateCode(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addKathmanduBusinessDays(
  collectedAt: number,
  businessDays: number,
  policy: RiderFinancePolicy,
): number {
  if (
    !Number.isSafeInteger(businessDays) ||
    businessDays < 0 ||
    businessDays > 30
  ) {
    throw new RangeError('Remittance period must be 0–30 business days.');
  }
  if (!policy.operatingWeekdays.length) {
    throw new RangeError(
      'Configure at least one rider-finance operating weekday.',
    );
  }
  const parts = kathmanduDateParts(collectedAt);
  let localMidnight = Date.UTC(parts.year, parts.month, parts.day);
  let remaining = businessDays;
  while (remaining > 0) {
    localMidnight += 86_400_000;
    const current = new Date(localMidnight);
    const code = dateCode(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
    );
    const weekday = weekdayByUtcDay[current.getUTCDay()];
    if (
      policy.operatingWeekdays.includes(weekday) &&
      !policy.holidayDates.includes(code)
    ) {
      remaining -= 1;
    }
  }
  const [hours, minutes] = policy.remittanceCutoffLocalTime
    .split(':')
    .map(Number);
  return (
    localMidnight +
    (hours * 60 + minutes) * 60_000 -
    kathmanduOffsetMilliseconds
  );
}

export function riderCompensationForOutcome(
  policy: RiderFinancePolicy,
  outcome: RiderTripOutcome,
): number {
  if (outcome === 'completed') return policy.completedTripPaisa;
  if (outcome === 'failed') return policy.failedTripPaisa;
  return policy.returnTripPaisa;
}

export type RiderAssignmentPolicySnapshot = Readonly<{
  finance: Readonly<{
    settingVersionId: string;
    settingVersion: number;
    value: RiderFinancePolicy;
    exposure: ReturnType<typeof calculateRiderCashExposure>;
    hasOverdueRemittance: boolean;
  }>;
  openBox: Readonly<{
    productSettingVersionId: string | null;
    serviceAreaSettingVersionId: string | null;
    configuredProductCodes: readonly string[];
    configuredServiceAreaCodes: readonly string[];
    productCodes: readonly string[];
    serviceAreaCode: string;
    productEligible: boolean;
    serviceAreaEligible: boolean;
    riderEligible: boolean;
    required: boolean;
    assignmentBlocked: boolean;
    reason: string;
    customerRightsNotice: string;
  }>;
}>;

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function buildRiderAssignmentPolicySnapshot(
  database: D1Database,
  input: {
    jobId: string;
    riderId: string;
    sellerId: string;
    proposedCodPaisa: number;
    now: number;
  },
): Promise<RiderAssignmentPolicySnapshot> {
  const [
    financeSetting,
    categorySetting,
    areaSetting,
    order,
    products,
    rider,
    position,
    overdue,
  ] = await Promise.all([
    getEffectiveBusinessSetting(database, 'rider_finance_policy', input.now),
    getEffectiveBusinessSetting(database, 'open_box_category_codes', input.now),
    getEffectiveBusinessSetting(
      database,
      'open_box_service_area_codes',
      input.now,
    ),
    database
      .prepare(
        'SELECT shipping_address_json AS addressJson FROM orders o JOIN shipping_jobs j ON j.order_id=o.id WHERE j.id=?',
      )
      .bind(input.jobId)
      .first<{ addressJson: string }>(),
    database
      .prepare(`SELECT c.slug AS categoryCode,p.materials_json AS materialsJson,p.materials
          FROM order_items i JOIN products p ON p.id=i.product_id JOIN categories c ON c.id=p.category_id
          JOIN shipping_jobs j ON j.order_id=i.order_id
          WHERE j.id=? AND i.seller_id=? AND i.fulfillment_status<>'cancelled'`)
      .bind(input.jobId, input.sellerId)
      .all<{
        categoryCode: string;
        materialsJson: string | null;
        materials: string | null;
      }>(),
    database
      .prepare(
        'SELECT open_box_eligible AS openBoxEligible FROM rider_profiles WHERE user_id=?',
      )
      .bind(input.riderId)
      .first<{ openBoxEligible: number }>(),
    database
      .prepare(`SELECT
          COALESCE(SUM(CASE WHEN p.method='own_rider' AND p.rider_user_id=? THEN p.collected_paisa-p.remitted_paisa ELSE 0 END),0) AS heldPaisa,
          COALESCE(SUM(CASE WHEN p.method='own_rider' AND p.rider_user_id=? AND j.id<>? AND j.status NOT IN ('delivered','returned','cancelled') THEN p.cod_due_paisa-p.collected_paisa ELSE 0 END),0) AS assignedPaisa
          FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id`)
      .bind(input.riderId, input.riderId, input.jobId)
      .first<{ heldPaisa: number; assignedPaisa: number }>(),
    database
      .prepare(`SELECT 1 AS overdue FROM rider_cash_obligations o
          WHERE o.rider_user_id=? AND o.due_at<? AND o.amount_paisa>
          COALESCE((SELECT SUM(a.amount_paisa) FROM rider_remittance_allocations a WHERE a.obligation_id=o.id),0)
          LIMIT 1`)
      .bind(input.riderId, input.now)
      .first<{ overdue: number }>(),
  ]);
  if (
    !financeSetting.versionId ||
    financeSetting.value.cashExposureLimitPaisa === null
  ) {
    throw new RangeError(
      'Publish a controlled rider cash exposure and finance policy before assigning an own-rider COD parcel.',
    );
  }
  if (!financeSetting.value.operatingWeekdays.length) {
    throw new RangeError(
      'Configure rider-finance operating weekdays before assignment.',
    );
  }
  if (!order || !rider)
    throw new RangeError('The rider or parcel policy context is unavailable.');
  let address: Record<string, unknown> = {};
  try {
    address = JSON.parse(order.addressJson) as Record<string, unknown>;
  } catch {
    throw new RangeError('The parcel delivery area cannot be evaluated.');
  }
  const serviceAreaCode = normalizeOperationalCode(
    typeof address.district === 'string' ? address.district : '',
  );
  const productCodes = new Set<string>();
  for (const product of products.results) {
    productCodes.add(normalizeOperationalCode(product.categoryCode));
    for (const material of parseStringArray(product.materialsJson)) {
      productCodes.add(normalizeOperationalCode(material));
    }
    if (!product.materialsJson && product.materials) {
      for (const material of product.materials.split(',')) {
        const code = normalizeOperationalCode(material);
        if (code) productCodes.add(code);
      }
    }
  }
  const openBox = evaluateOpenBoxEligibility({
    productCodes: [...productCodes],
    serviceAreaCode,
    configuredProductCodes: categorySetting.value,
    configuredServiceAreaCodes: areaSetting.value,
    riderEligible: rider.openBoxEligible === 1,
  });
  const exposure = calculateRiderCashExposure({
    heldPaisa: Number(position?.heldPaisa ?? 0),
    assignedUncollectedPaisa: Number(position?.assignedPaisa ?? 0),
    proposedCodPaisa: input.proposedCodPaisa,
    limitPaisa: financeSetting.value.cashExposureLimitPaisa,
  });
  return Object.freeze({
    finance: Object.freeze({
      settingVersionId: financeSetting.versionId,
      settingVersion: financeSetting.version ?? 0,
      value: financeSetting.value,
      exposure,
      hasOverdueRemittance: Boolean(overdue),
    }),
    openBox: Object.freeze({
      productSettingVersionId: categorySetting.versionId,
      serviceAreaSettingVersionId: areaSetting.versionId,
      configuredProductCodes: categorySetting.value,
      configuredServiceAreaCodes: areaSetting.value,
      productCodes: Object.freeze([...productCodes]),
      serviceAreaCode,
      ...openBox,
      customerRightsNotice:
        'The recorded doorstep inspection covers only what was actually checked. Acceptance, OTP, or an intact inner seal does not waive a later valid wrong-item, damage, defect, description, or statutory claim.',
    }),
  });
}

export async function effectiveRiderFinancePolicy(
  database: D1Database,
  now: number,
) {
  const setting = await getEffectiveBusinessSetting(
    database,
    'rider_finance_policy',
    now,
  );
  if (!setting.versionId) {
    throw new RangeError('Rider finance policy has not been published.');
  }
  return setting;
}

export async function riderFinanceDashboard(
  database: D1Database,
  riderId: string,
  now = Date.now(),
) {
  const [setting, position, obligations, compensation, pending] =
    await Promise.all([
    getEffectiveBusinessSetting(database, 'rider_finance_policy', now),
    database
      .prepare(`SELECT
        COALESCE(SUM(CASE WHEN p.method='own_rider' AND p.rider_user_id=? THEN p.collected_paisa-p.remitted_paisa ELSE 0 END),0) AS heldPaisa,
        COALESCE(SUM(CASE WHEN p.method='own_rider' AND p.rider_user_id=? AND j.status NOT IN ('delivered','returned','cancelled') THEN p.cod_due_paisa-p.collected_paisa ELSE 0 END),0) AS assignedPaisa
        FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id`)
      .bind(riderId, riderId)
      .first<{ heldPaisa: number; assignedPaisa: number }>(),
    database
      .prepare(`SELECT o.id,o.shipping_job_id AS jobId,ord.order_number AS orderNumber,o.amount_paisa AS amountPaisa,o.due_at AS dueAt,
        o.amount_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM rider_remittance_allocations a WHERE a.obligation_id=o.id),0) AS outstandingPaisa
        FROM rider_cash_obligations o JOIN shipping_jobs j ON j.id=o.shipping_job_id JOIN orders ord ON ord.id=j.order_id WHERE o.rider_user_id=? AND o.amount_paisa>
        COALESCE((SELECT SUM(a.amount_paisa) FROM rider_remittance_allocations a WHERE a.obligation_id=o.id),0)
        ORDER BY o.due_at,o.created_at,o.id`)
      .bind(riderId)
      .all<{
        id: string;
        jobId: string;
        orderNumber: string;
        amountPaisa: number;
        dueAt: number;
        outstandingPaisa: number;
      }>(),
    database
      .prepare(`SELECT COALESCE(SUM(CASE WHEN status IN ('earned','held') THEN amount_paisa ELSE 0 END),0) AS earnedPaisa
        FROM rider_compensation_entries WHERE rider_user_id=?`)
      .bind(riderId)
      .first<{ earnedPaisa: number }>(),
    database
      .prepare(
        "SELECT shipping_job_id AS jobId,SUM(amount_paisa) AS pendingPaisa FROM parcel_cash_records WHERE rider_user_id=? AND kind='remittance' AND status='pending' GROUP BY shipping_job_id",
      )
      .bind(riderId)
      .all<{ jobId: string; pendingPaisa: number }>(),
  ]);
  const heldPaisa = Number(position?.heldPaisa ?? 0);
  const assignedUncollectedPaisa = Number(position?.assignedPaisa ?? 0);
  const remittanceByJob = new Map<
    string,
    { jobId: string; orderNumber: string; outstandingPaisa: number }
  >();
  for (const obligation of obligations.results) {
    const current = remittanceByJob.get(obligation.jobId);
    remittanceByJob.set(obligation.jobId, {
      jobId: obligation.jobId,
      orderNumber: obligation.orderNumber,
      outstandingPaisa:
        Number(current?.outstandingPaisa ?? 0) +
        Number(obligation.outstandingPaisa),
    });
  }
  for (const entry of pending.results) {
    const current = remittanceByJob.get(entry.jobId);
    if (!current) continue;
    remittanceByJob.set(entry.jobId, {
      ...current,
      outstandingPaisa: Math.max(
        0,
        current.outstandingPaisa - Number(entry.pendingPaisa),
      ),
    });
  }
  return Object.freeze({
    heldPaisa,
    assignedUncollectedPaisa,
    totalExposurePaisa: heldPaisa + assignedUncollectedPaisa,
    limitPaisa: setting.value.cashExposureLimitPaisa,
    policyConfigured:
      setting.source === 'persisted' &&
      setting.value.cashExposureLimitPaisa !== null,
    receivingAccountLabel: setting.value.receivingAccountLabel,
    obligations: Object.freeze(
      obligations.results.map((obligation) =>
        Object.freeze({
          ...obligation,
          overdue: obligation.dueAt < now && obligation.outstandingPaisa > 0,
        }),
      ),
    ),
    remittanceJobs: Object.freeze(
      [...remittanceByJob.values()]
        .filter((entry) => entry.outstandingPaisa > 0)
        .map((entry) => Object.freeze(entry)),
    ),
    hasOverdueRemittance: obligations.results.some(
      (obligation) => obligation.dueAt < now && obligation.outstandingPaisa > 0,
    ),
    simulatedCompensationEarnedPaisa: Number(compensation?.earnedPaisa ?? 0),
  });
}
