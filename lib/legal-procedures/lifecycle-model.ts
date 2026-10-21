import { isGregorianDate } from '../dates/nepal-calendar';
import { exactFields, legalDigest, LegalDraftStoreError, LegalDraftValidationError,
  validateStoredLegalDraft, type LegalDraftSnapshot } from './model';

export type LegalOperation = 'approve' | 'activate' | 'withdraw';
export type LegalControlInput = {
  operation: LegalOperation; expectedSequence: number; expectedSha256: string;
  revision: number; documentSha256: string; approvalSequence: number | null;
  effectiveFrom: string | null; confirmed: true; reason: string; requestId: string;
};
export type LegalControlEvent = {
  schemaVersion: 1; id: string; sequence: number; operation: LegalOperation;
  document: LegalDraftSnapshot; approvalSequence: number | null; effectiveAt: number | null;
  actorId: string; actorName: string; occurredAt: number; reason: string; requestId: string;
  requestFingerprint: string; previousSha256: string | null; sha256: string;
};
export type LegalControlHistory = Omit<LegalControlEvent, 'document'> & { document: { revision: number; sha256: string } };
export type LegalControlWorkspace = {
  sequence: number; sha256: string; latest: LegalControlEvent | null; approval: LegalControlEvent | null;
  active: LegalControlEvent | null; scheduled: LegalControlEvent | null;
  history: LegalControlHistory[]; nextBeforeSequence: number | null;
};
export const emptyLegalControl = (): LegalControlWorkspace => ({ sequence: 0, sha256: '0'.repeat(64),
  latest: null, approval: null, active: null, scheduled: null, history: [], nextBeforeSequence: null });
export const legalControlId = (sequence: number) => `internal-legal-control:${sequence}`;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sequence = (value: unknown, minimum = 1) => Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= 1_000_000;
export const legalControlTime = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 253402280999999;

export function legalEffectiveTime(value: string | null, now: number): number {
  if (value === null) return now;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || !isGregorianDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59)
    throw new LegalDraftValidationError('Enter a valid Nepal date and time.');
  const result = Date.parse(value + ':00+05:45');
  if (!legalControlTime(result) || result < now)
    throw new LegalDraftValidationError('The effective date and time cannot be in the past or backdated. Choose a future Nepal time or activate now.');
  return result;
}
export function validateLegalControlInput(value: unknown): LegalControlInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LegalDraftValidationError('An approval or activation request is required.');
  const row = value as Record<string, unknown>;
  exactFields(row, ['operation', 'expectedSequence', 'expectedSha256', 'revision', 'documentSha256',
    'approvalSequence', 'effectiveFrom', 'confirmed', 'reason', 'requestId']);
  if (row.effectiveFrom !== null && (typeof row.effectiveFrom !== 'string' || row.effectiveFrom.length > 16))
    throw new LegalDraftValidationError('Enter a valid Nepal date and time.');
  if (!['approve', 'activate', 'withdraw'].includes(String(row.operation)) || !sequence(row.expectedSequence, 0) ||
    !hash(row.expectedSha256) || !sequence(row.revision) || !hash(row.documentSha256) ||
    (row.operation === 'activate' ? !sequence(row.approvalSequence) : row.approvalSequence !== null) ||
    (row.operation !== 'activate' && row.effectiveFrom !== null) ||
    typeof row.reason !== 'string' || row.reason.trim().length < 8 || row.reason.trim().length > 500 ||
    typeof row.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.requestId))
    throw new LegalDraftValidationError('Select a saved version, current approval state, valid request reference and a reason of 8–500 characters.');
  if (row.confirmed !== true) throw new LegalDraftValidationError('Confirm that you reviewed this exact version and the selected action.');
  return { ...row, reason: row.reason.trim(), requestId: row.requestId.toLowerCase() } as LegalControlInput;
}
export async function legalControlHash(event: Omit<LegalControlEvent, 'sha256'> | LegalControlEvent) {
  const { sha256: _hash, ...body } = event as LegalControlEvent;
  return legalDigest(JSON.stringify(body));
}
export async function validateLegalControlEvent(value: unknown): Promise<LegalControlEvent> {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Event');
    const row = value as Record<string, unknown>;
    exactFields(row, ['schemaVersion', 'id', 'sequence', 'operation', 'document', 'approvalSequence', 'effectiveAt',
      'actorId', 'actorName', 'occurredAt', 'reason', 'requestId', 'requestFingerprint', 'previousSha256', 'sha256']);
    if (row.schemaVersion !== 1 || !sequence(row.sequence) || row.id !== legalControlId(Number(row.sequence)) ||
      !['approve', 'activate', 'withdraw'].includes(String(row.operation)) || !legalControlTime(row.occurredAt) ||
      typeof row.actorId !== 'string' || !row.actorId || row.actorId.length > 200 ||
      typeof row.actorName !== 'string' || !row.actorName || row.actorName.length > 200 ||
      typeof row.reason !== 'string' || row.reason.length < 8 || row.reason.length > 500 ||
      typeof row.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(row.requestId) || !hash(row.requestFingerprint) || !hash(row.sha256) ||
      (row.sequence === 1 ? row.previousSha256 !== null : !hash(row.previousSha256))) throw new Error('Metadata');
    if (row.operation === 'approve' ? row.effectiveAt !== null || row.approvalSequence !== null :
      !legalControlTime(row.effectiveAt) || Number(row.effectiveAt) < Number(row.occurredAt) ||
      (row.operation === 'activate' ? !sequence(row.approvalSequence) || Number(row.approvalSequence) >= Number(row.sequence) :
        row.approvalSequence !== null || row.effectiveAt !== row.occurredAt)) throw new Error('State');
    const document = await validateStoredLegalDraft(row.document);
    if (document.revision < 1 || document.savedAt > Number(row.occurredAt) ||
      await legalControlHash(row as LegalControlEvent) !== row.sha256) throw new Error('Snapshot');
    return row as LegalControlEvent;
  } catch { throw new LegalDraftStoreError('Stored procedure approval or activation is unavailable or its fingerprint is invalid.'); }
}
