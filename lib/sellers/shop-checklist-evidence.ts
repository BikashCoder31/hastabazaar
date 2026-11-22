import type { SellerDocumentKind } from './application';
import { requiredIdentityChecklistDocumentSql } from './protected-change-policy';

export const documentExpiryWindowMs = 14 * 86_400_000;
export const checklistRequestTemplate = 'business.seller.checklist_request';
export const documentExpiryTemplate = 'business.seller.document.expiring';
export const checklistRequestAction = 'seller.checklist.requested';

export const checklistDocumentLabels: Record<SellerDocumentKind, string> = {
  representative_identity: 'Citizenship or government ID',
  pan_certificate: 'PAN certificate',
  business_registration: 'Business registration certificate',
  vat_certificate: 'VAT certificate',
  bank_verification: 'Bank document',
};

export const checklistDate = (value: number) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' }).format(value);

export const currentDocument = (column = '1=1') => `NOT EXISTS(SELECT 1 FROM seller_documents newer
  WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind AND ${column}
    AND (newer.uploaded_at>d.uploaded_at OR (newer.uploaded_at=d.uploaded_at AND newer.id>d.id)))`;

const verifiedDocument = "d.status='verified' AND d.reviewed_by IS NOT NULL AND d.reviewed_at IS NOT NULL";
export const nearExpiryPredicate = `${verifiedDocument}
  AND d.valid_until>? AND d.valid_until<=?
  AND (
    (d.kind IN ('representative_identity','pan_certificate','business_registration')
     AND ${currentDocument("newer.status='verified'")}
     AND ${requiredIdentityChecklistDocumentSql()})
    OR (d.kind='bank_verification' AND EXISTS(SELECT 1 FROM seller_beneficiary_versions b
      JOIN seller_protected_revisions r ON r.seller_id=b.seller_id
      WHERE b.document_id=d.id AND b.seller_id=s.id AND SUBSTR(s.payout_account_reference,1,12)='BENEFICIARY:'
        AND SUBSTR(s.payout_account_reference,13)=b.id
        AND b.verified_by IS NOT NULL AND HEX(b.verified_by)<>HEX(s.user_id) AND b.identity_revision=r.identity_revision))
  )`;

export type ChecklistDocument = {
  id: string;
  kind: SellerDocumentKind;
  status: string;
  validUntil: number | null;
  reviewedAt: number | null;
  reviewAction: string | null;
  caseId: string | null;
  currentSubmission: number;
  qualifiedExpiry: number;
};

export async function readChecklistDocuments(db: D1Database, sellerId: string, now: number) {
  return (await db.prepare(`SELECT d.id,d.kind,d.status,d.valid_until AS validUntil,
    CASE WHEN ${verifiedDocument} THEN d.reviewed_at END AS reviewedAt,
    log.action AS reviewAction,
    (SELECT r.id FROM seller_document_change_requests r WHERE r.seller_id=s.id AND r.document_id=d.id
      AND r.status IN ('submitted','approved') ORDER BY r.requested_at DESC,r.id DESC LIMIT 1) AS caseId,
    CASE WHEN ${currentDocument()} THEN 1 ELSE 0 END AS currentSubmission,
    CASE WHEN ${nearExpiryPredicate} THEN 1 ELSE 0 END AS qualifiedExpiry
    FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id
    LEFT JOIN audit_logs log ON log.id=d.review_request_id AND log.subject_type='seller_document'
    WHERE d.seller_id=? AND (${currentDocument()} OR (${verifiedDocument} AND ${currentDocument("newer.status='verified'")}))
    ORDER BY d.uploaded_at DESC,d.id DESC`).bind(now, now + documentExpiryWindowMs, sellerId).all<ChecklistDocument>()).results;
}

export type ChecklistNotice = {
  relatedId: string;
  relatedType: string;
  subject: string;
  body: string;
  at: number;
  emailStatus: string | null;
  inAppSeen: number;
  template: string;
};
