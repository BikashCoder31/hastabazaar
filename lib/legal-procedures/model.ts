import type { companyDetails } from '../content/company-details';

export const LEGAL_SECTIONS = [
  ['launch', 'Company and operational readiness'],
  ['responsibility', 'Responsibilities and contacts'],
  ['evidence', 'Records and evidence'],
  ['complaints', 'Customer complaints'],
  ['refunds', 'Refunds and settlement controls'],
  ['penalties', 'Proposed delay assessments'],
  ['incidents', 'Incident response'],
  ['legal-notices', 'Legal notices and regulator requests'],
  ['retention', 'Legal holds and retention'],
  ['recalls', 'Product safety and recalls'],
  ['data-incidents', 'Data incidents'],
  ['providers', 'Suppliers, carriers and insurance'],
  ['changes', 'Document changes and review'],
  ['incident-record', 'Incident record checklist'],
] as const;

export type LegalSection = { id: string; body: string };
export type LegalCompany = typeof companyDetails;
export type LegalDraftActor = { id: string; authSubject: string; displayName: string };
export type LegalDraftInput = {
  expectedRevision: number; expectedSha256: string; sections: LegalSection[];
  reason: string; requestId: string;
};
export type LegalDraftSnapshot = {
  schemaVersion: 1; id: string; revision: number; status: 'draft';
  approvedAt: null; effectiveAt: null; company: LegalCompany; sections: LegalSection[];
  sha256: string; actorId: string | null; actorName: string; savedAt: number; reason: string;
  previousRevision: number | null; previousSha256: string | null;
};
export type LegalHistoryEntry = Pick<LegalDraftSnapshot,
  'id' | 'revision' | 'actorName' | 'savedAt' | 'reason' | 'sha256'>;
export type LegalDraftWorkspace = {
  current: LegalDraftSnapshot; history: LegalHistoryEntry[]; nextBeforeRevision: number | null;
  legacy: { markdown: string; sha256: string };
};

export class LegalDraftValidationError extends Error {}
export class LegalDraftConflictError extends Error {}
export class LegalDraftStoreError extends Error {}
export class LegalDraftAccessError extends Error {
  constructor(message = 'Current Super Admin access is required.', readonly status: 401 | 403 = 403) { super(message); }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LegalDraftValidationError('A draft object is required.');
  return value as Record<string, unknown>;
}
export function exactFields(value: Record<string, unknown>, fields: readonly string[]) {
  if (Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key)))
    throw new LegalDraftValidationError('The draft contains missing or unsupported fields.');
}
export function normalizeLegalSections(value: unknown): LegalSection[] {
  if (!Array.isArray(value) || value.length !== LEGAL_SECTIONS.length)
    throw new LegalDraftValidationError('All procedure sections are required.');
  let total = 0;
  return value.map((entry, index) => {
    const section = record(entry); exactFields(section, ['id', 'body']);
    if (section.id !== LEGAL_SECTIONS[index][0] || typeof section.body !== 'string')
      throw new LegalDraftValidationError('Procedure section IDs and order cannot change.');
    const body = section.body.replace(/\r\n?/g, '\n').trim();
    total += body.length;
    if (!body || body.length > 12_000 || total > 60_000 || Array.from(body).some(character => {
      const code = character.charCodeAt(0); return code < 32 && ![9, 10, 13].includes(code);
    }))
      throw new LegalDraftValidationError('Each section needs 1–12,000 characters; the complete draft may contain up to 60,000.');
    return { id: section.id as string, body };
  });
}
export function validateLegalDraftInput(value: unknown): LegalDraftInput {
  const body = record(value);
  exactFields(body, ['expectedRevision', 'expectedSha256', 'sections', 'reason', 'requestId']);
  if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || Number(body.expectedRevision) > 999_999 ||
      typeof body.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedSha256) ||
      typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId) ||
      typeof body.reason !== 'string' || body.reason.trim().length < 8 || body.reason.trim().length > 500)
    throw new LegalDraftValidationError('A current draft, valid request reference and reason of 8–500 characters are required.');
  return { expectedRevision: Number(body.expectedRevision), expectedSha256: body.expectedSha256,
    requestId: body.requestId.toLowerCase(), reason: body.reason.trim(), sections: normalizeLegalSections(body.sections) };
}
export async function legalDigest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function legalSnapshotHash(snapshot: Omit<LegalDraftSnapshot, 'sha256'> | LegalDraftSnapshot) {
  const { sha256: _fingerprint, ...immutableSnapshot } = snapshot as LegalDraftSnapshot;
  return legalDigest(JSON.stringify(immutableSnapshot));
}
export const legalRevisionId = (revision: number) => `internal-legal-draft:${revision}`;

export async function validateStoredLegalDraft(value: unknown): Promise<LegalDraftSnapshot> {
  try {
    const row = record(value);
    exactFields(row, ['schemaVersion', 'id', 'revision', 'status', 'approvedAt', 'effectiveAt', 'company', 'sections',
      'sha256', 'actorId', 'actorName', 'savedAt', 'reason', 'previousRevision', 'previousSha256']);
    if (row.schemaVersion !== 1 || row.status !== 'draft' || row.approvedAt !== null || row.effectiveAt !== null ||
      !Number.isSafeInteger(row.revision) || Number(row.revision) < 0 || Number(row.revision) > 1_000_000 ||
      row.id !== legalRevisionId(Number(row.revision)) || !Number.isSafeInteger(row.savedAt) || Number(row.savedAt) < 0 ||
      typeof row.actorName !== 'string' || !row.actorName || row.actorName.length > 200 ||
      typeof row.reason !== 'string' || row.reason.length < 8 || row.reason.length > 500 ||
      (row.revision === 0 ? row.actorId !== null || row.previousRevision !== null || row.previousSha256 !== null :
        typeof row.actorId !== 'string' || !row.actorId || row.previousRevision !== Number(row.revision) - 1 ||
          typeof row.previousSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.previousSha256))) throw new Error('Metadata');
    const company = record(row.company);
    exactFields(company, ['entityReference', 'legalName', 'nepaliName', 'brandName', 'registrationNumber',
      'registeringAuthority', 'incorporationDate', 'registeredOffice', 'supportEmail', 'pan']);
    if (Object.values(company).some(v => typeof v !== 'string' || v.length > 1000)) throw new Error('Company');
    const sections = normalizeLegalSections(row.sections);
    if (JSON.stringify(sections) !== JSON.stringify(row.sections) ||
      await legalSnapshotHash(row as LegalDraftSnapshot) !== row.sha256) throw new Error('Fingerprint');
    return row as LegalDraftSnapshot;
  } catch { throw new LegalDraftStoreError('Stored legal draft is unavailable or its fingerprint is invalid.'); }
}
