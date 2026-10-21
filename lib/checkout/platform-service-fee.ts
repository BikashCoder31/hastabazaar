/** Initial launch policy only. Published Super Admin settings take precedence. */
export const INITIAL_PLATFORM_SERVICE_FEE = Object.freeze({ enabled: true, amountPaisa: 1000 });
export const PLATFORM_SERVICE_FEE_RULE = 'non_refundable_except_law_v1' as const;
export const PLATFORM_SERVICE_FEE_NOTICE = 'Charged once per order. Non-refundable, except where a refund is required by law.';
export type PlatformServiceFeePolicy = Readonly<{ enabled: boolean; amountPaisa: number }>;
export type PlatformServiceFeeSnapshot = PlatformServiceFeePolicy & Readonly<{
  chargedPaisa: number; versionId: string | null; rule: typeof PLATFORM_SERVICE_FEE_RULE;
}>;

export function validatePlatformServiceFee(value: unknown): PlatformServiceFeePolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid Platform service fee policy.');
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(k => !['enabled', 'amountPaisa'].includes(k)) || typeof p.enabled !== 'boolean' ||
    typeof p.amountPaisa !== 'number' || !Number.isSafeInteger(p.amountPaisa) || p.amountPaisa < 0 || p.amountPaisa > 100_000)
    throw new RangeError('Platform service fee needs an enable switch and an amount from NPR 0 to NPR 1,000 (up to two decimal places).');
  return Object.freeze({ enabled: p.enabled, amountPaisa: p.amountPaisa });
}

export function serviceFeeSnapshot(policy: PlatformServiceFeePolicy, versionId: string | null): PlatformServiceFeeSnapshot {
  const p = validatePlatformServiceFee(policy);
  return { ...p, chargedPaisa: p.enabled ? p.amountPaisa : 0, versionId, rule: PLATFORM_SERVICE_FEE_RULE };
}

export function parseServiceFeeSnapshot(value: unknown): PlatformServiceFeeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid saved Platform service fee.');
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(k => !['enabled', 'amountPaisa', 'chargedPaisa', 'versionId', 'rule'].includes(k)) ||
    !(p.versionId === null || typeof p.versionId === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(p.versionId)) || p.rule !== PLATFORM_SERVICE_FEE_RULE)
    throw new TypeError('Invalid saved Platform service fee.');
  const snapshot = serviceFeeSnapshot(validatePlatformServiceFee({ enabled: p.enabled, amountPaisa: p.amountPaisa }), p.versionId as string | null);
  if (p.chargedPaisa !== snapshot.chargedPaisa) throw new RangeError('Platform service fee does not match the saved policy.');
  return snapshot;
}
