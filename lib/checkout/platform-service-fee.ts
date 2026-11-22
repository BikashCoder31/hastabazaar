/** Initial launch policy only. Published Super Admin settings take precedence. */
export const INITIAL_PLATFORM_SERVICE_FEE = Object.freeze({ enabled: true, amountPaisa: 1000 });
export const PLATFORM_SERVICE_FEE_RULE = 'non_refundable_except_law_v1' as const;
export const PLATFORM_SERVICE_FEE_NOTICE = 'Charged once per order. Non-refundable, except where a refund is required by law.';
export type PlatformServiceFeePolicy = Readonly<{ enabled: boolean; amountPaisa: number }>;
export type LegacyPlatformServiceFeeSnapshot = PlatformServiceFeePolicy & Readonly<{
  chargedPaisa: number; versionId: string | null; rule: typeof PLATFORM_SERVICE_FEE_RULE;
}>;
export type CustomerFeeAttribution = Readonly<{ id: string; revision: number; name: string }>;
export type CustomerServiceFeeSnapshot = LegacyPlatformServiceFeeSnapshot & Readonly<{
  schemaVersion: 2;
  standardPaisa: number;
  waivedPaisa: number;
  campaign: CustomerFeeAttribution | null;
}>;
export type PlatformServiceFeeSnapshot = LegacyPlatformServiceFeeSnapshot | CustomerServiceFeeSnapshot;

export function validatePlatformServiceFee(value: unknown): PlatformServiceFeePolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid Platform service fee policy.');
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(k => !['enabled', 'amountPaisa'].includes(k)) || typeof p.enabled !== 'boolean' ||
    typeof p.amountPaisa !== 'number' || !Number.isSafeInteger(p.amountPaisa) || p.amountPaisa < 0 || p.amountPaisa > 100_000)
    throw new RangeError('Platform service fee needs an enable switch and an amount from NPR 0 to NPR 1,000 (up to two decimal places).');
  return Object.freeze({ enabled: p.enabled, amountPaisa: p.amountPaisa });
}

export function serviceFeeSnapshot(policy: PlatformServiceFeePolicy, versionId: string | null): LegacyPlatformServiceFeeSnapshot {
  const p = validatePlatformServiceFee(policy);
  return { ...p, chargedPaisa: p.enabled ? p.amountPaisa : 0, versionId, rule: PLATFORM_SERVICE_FEE_RULE };
}

export function parseServiceFeeSnapshot(value: unknown): PlatformServiceFeeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid saved Platform service fee.');
  const p = value as Record<string, unknown>;
  const customer = p.schemaVersion === 2;
  const fields = ['enabled', 'amountPaisa', 'chargedPaisa', 'versionId', 'rule',
    ...(customer ? ['schemaVersion', 'standardPaisa', 'waivedPaisa', 'campaign'] : [])];
  if (Object.keys(p).length !== fields.length || Object.keys(p).some(k => !fields.includes(k)) ||
    !(p.versionId === null || typeof p.versionId === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(p.versionId)) || p.rule !== PLATFORM_SERVICE_FEE_RULE)
    throw new TypeError('Invalid saved Platform service fee.');
  const snapshot = serviceFeeSnapshot(validatePlatformServiceFee({ enabled: p.enabled, amountPaisa: p.amountPaisa }), p.versionId as string | null);
  if (!customer) {
    if (p.chargedPaisa !== snapshot.chargedPaisa) throw new RangeError('Platform service fee does not match the saved policy.');
    return snapshot;
  }
  let campaign: CustomerFeeAttribution | null = null;
  if (p.campaign !== null) {
    if (!p.campaign || typeof p.campaign !== 'object' || Array.isArray(p.campaign))
      throw new TypeError('Invalid saved customer fee campaign.');
    const c = p.campaign as Record<string, unknown>;
    if (Object.keys(c).length !== 3 || Object.keys(c).some(k => !['id', 'revision', 'name'].includes(k)) ||
      typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(c.id) ||
      typeof c.revision !== 'number' || !Number.isSafeInteger(c.revision) || c.revision < 1 ||
      typeof c.name !== 'string' || !c.name.trim() || c.name.length > 100)
      throw new TypeError('Invalid saved customer fee campaign.');
    campaign = Object.freeze({ id: c.id, revision: c.revision, name: c.name });
  }
  const standardPaisa = snapshot.chargedPaisa;
  const waivedPaisa = campaign ? standardPaisa : 0;
  const chargedPaisa = standardPaisa - waivedPaisa;
  if (campaign && standardPaisa === 0 || p.standardPaisa !== standardPaisa ||
    p.waivedPaisa !== waivedPaisa || p.chargedPaisa !== chargedPaisa)
    throw new RangeError('Customer service fee does not match the saved policy and waiver.');
  return Object.freeze({ ...snapshot, chargedPaisa, schemaVersion: 2, standardPaisa, waivedPaisa, campaign });
}
