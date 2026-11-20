import originalDocuments from '../content/legal-policy-documents.json';
import { companyDetails } from '../content/company-details';
import { LEGAL_SECTIONS, legalSnapshotHash, legalDigest, legalRevisionId, type LegalDraftSnapshot } from './model';

// The original file remains untouched. Its complete text is retained in history.
export async function legacyLegalProcedure() {
  const markdown = originalDocuments['internal-compliance'];
  return { markdown, sha256: await legalDigest(markdown) };
}

export async function bundledLegalDraft(): Promise<LegalDraftSnapshot> {
  const original = originalDocuments['internal-compliance'].split(/\n## \d+\. [^\n]+\n\n/).slice(1);
  if (original.length !== LEGAL_SECTIONS.length) throw new Error('Internal procedure source is incomplete.');
  const sections = LEGAL_SECTIONS.map(([id], index) => ({ id, body: original[index].trim() }));
  sections[1].body = `Confirm the responsible person for each function before adopting this procedure. No named appointments have been recorded in this draft.\n\nRegistration, legal notices and policy review: founder/director — appointment to be confirmed.\nCustomer complaints and refunds: grievance owner — appointment to be confirmed.\nSeller verification, listings and recalls: marketplace lead — appointment to be confirmed.\nSettlements, tax and reserves: finance owner — appointment to be confirmed.\nAccess, security, privacy and retention: technology/privacy lead — appointment to be confirmed.\nClaims, response deadlines and legal advice: appointed Nepal advocate — appointment to be confirmed.\n\nRecord each appointment, evidence location and review date through the appropriate existing workflow. Assigning a task does not transfer statutory responsibility.`;
  sections[5].body = `This draft does not activate a penalty, deduction or new commercial term. Obtain legal and commercial review before introducing any delay assessment. Keep the accepted agreement and order terms authoritative.\n\nFor a proposed assessment, check the accepted deadline, relevant value base, readiness, carrier failure and excluded cause. Preserve the evidence, allow a response, record the reasoned decision and appeal route, and use the existing authorized workflow. Silence is not proof. Do not compound or duplicate recovery. Retain reduced and reversed assessments.\n\nDraft 3.0 remains available in history, including its earlier proposal. Editing this procedure does not adopt that proposal.`;
  sections[12].body = `Draft 3.1 updates the recorded company disclosure and presents the internal procedure in clearer sections. It remains unapproved and has no effective date.\n\nEach Save draft creates a separate, attributed revision with a reason and a complete snapshot. Earlier saved revisions and the original Draft 3.0 remain read-only. Saving a draft does not publish public policies, approve operations, change commission settings or require anyone to accept an agreement again.\n\nReview proposed changes with the legal, finance, marketplace, support and technology owners before any separate adoption process. No adoption or publication action is provided here. Preserve existing orders, accepted agreements, financial records and policy snapshots. New economic terms must not be applied retroactively.`;
  const company = { ...companyDetails };
  const snapshot: LegalDraftSnapshot = { schemaVersion: 1, id: legalRevisionId(0), revision: 0, status: 'draft', approvedAt: null,
    effectiveAt: null, company, sections, sha256: '', actorId: null,
    actorName: 'Bundled local draft', savedAt: Date.parse('2026-10-18T00:00:00+05:45'),
    reason: 'Refresh shared company details and organize the internal procedure for review.',
    previousRevision: null, previousSha256: null };
  snapshot.sha256 = await legalSnapshotHash(snapshot);
  return snapshot;
}
