export const draftLifetimeMs = 30 * 24 * 60 * 60_000;
export const draftFieldNames = new Set([
  'hasBusinessTaxRegistration', 'applicantType', 'taxStatus', 'legalName', 'tradingName',
  'registrationAuthority', 'registrationNumber', 'taxRegistrationNumber', 'representativeName',
  'phone', 'phoneCountry', 'province', 'district', 'municipality', 'ward', 'locality', 'publicCity',
  'governmentIdType', 'governmentIdDescription', 'personalPan', 'pickupAddress', 'returnAddress',
]);
export const draftFileNames = new Set(['businessRegistration', 'panCertificate', 'vatCertificate',
  'representativeIdentity', 'personalPanCertificate']);
export type DraftAnswers = Record<string, string[]>;
export type DraftFile = { id: string; name: string; type: string; size: number };
export type SellerDraft = { revision: string; attemptId: string; formVersion: number; answers: DraftAnswers;
  files: Record<string, DraftFile>; updatedAt: number; expiresAt: number };
export type DraftSave = { revision: string | null; changeId: string; attemptId: string; formVersion: number;
  answers: DraftAnswers; files: Record<string, string> };
export class SellerDraftError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function isDraftToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}
export function parseDraftAnswers(raw: unknown, customKeys: readonly string[]): DraftAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 100)
    throw new SellerDraftError('Invalid draft fields.');
  const allowed = new Set([...draftFieldNames, ...customKeys.map(key => `custom.${key}`)]);
  const entries = Object.entries(raw);
  for (const [key, values] of entries) {
    if (!allowed.has(key) || !Array.isArray(values) || values.length > 100 ||
      values.some(value => typeof value !== 'string' || value.length > 5000))
      throw new SellerDraftError('Invalid draft field.');
  }
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 64_000) throw new SellerDraftError('Draft answers are too large.', 413);
  return Object.fromEntries(entries) as DraftAnswers;
}
