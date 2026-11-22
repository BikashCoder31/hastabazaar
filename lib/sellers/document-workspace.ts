import {withNativeFormLoad} from '../operations/native-form-health';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { SellerDocumentReviewError } from './document-review';
import {currentProtectedIdentity} from './protected-identity-change';

export interface DocumentEvidence {
  id:string;kind:string;originalName:string;status:string;uploadedAt:number;reviewedAt:number|null;reviewer:string|null;
  reviewId:string|null;currentSubmission:number;currentEvidence:number;reviewReason:string|null;reviewAction:string|null;
}
export interface DocumentChangeCase {
  id:string;documentId:string;replacementId:string|null;reason:string;status:string;requestedAt:number;
  reviewedAt:number|null;reviewReason:string|null;dueAt:number|null;owner:string|null;operationId:string|null;protectedCaseId:string|null;
}
export async function usableReplacementPermissions(db:D1Database,sellerId:string,userId:string) {
  return (await db.prepare(`SELECT p.id,p.request_id AS requestId,p.document_id AS documentId,d.kind,p.reason FROM seller_document_replacement_permissions p
    JOIN seller_document_change_requests r ON r.id=p.request_id JOIN seller_documents d ON d.id=p.document_id AND d.seller_id=r.seller_id
    JOIN seller_profiles s ON s.id=r.seller_id JOIN users u ON u.id=s.user_id JOIN users reviewer ON reviewer.id=p.reviewed_by
    WHERE r.seller_id=? AND s.user_id=? AND r.requested_by=u.id AND u.status='active' AND r.status='approved' AND p.id=r.active_permission_id AND p.used_document_id IS NULL
      AND p.reviewed_by<>u.id AND reviewer.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=reviewer.id AND role='super_admin')
      AND COALESCE(d.review_request_id,'')=COALESCE(p.expected_review_id,'')
      AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind AND newer.status<>'rejected'
        AND (newer.uploaded_at>d.uploaded_at OR newer.uploaded_at=d.uploaded_at AND newer.id>d.id))`)
    .bind(sellerId,userId).all<{id:string;requestId:string;documentId:string;kind:string;reason:string}>()).results;
}
/** Private source projection: no object keys, bank values, command payloads or internal staff notes. */
async function sellerDocumentWorkspaceSource(db:D1Database,sellerId:string,actorId:string,audience:'seller'|'staff') {
  const seller=await db.prepare(`SELECT s.user_id AS userId,s.legal_name AS legalName,s.representative_name AS representativeName,
    s.tax_registration_number AS taxNumber,s.application_reference AS reference,s.trading_name AS tradingName FROM seller_profiles s WHERE s.id=?`)
    .bind(sellerId).first<{userId:string;legalName:string;representativeName:string|null;taxNumber:string|null;reference:string;tradingName:string}>();
  if(!seller) throw new SellerDocumentReviewError('Registration not found.',404);
  if(audience==='staff') await staffMutationGuard(db,actorId,'seller.application.review',SellerDocumentReviewError,'super_admin');
  else if(seller.userId!==actorId || !await db.prepare("SELECT 1 FROM users u WHERE u.id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))").bind(actorId).first())
    throw new SellerDocumentReviewError('Private registration access is unavailable.',403);
  const [documents,requests,permissions,identity,history]=await Promise.all([
    db.prepare(`SELECT d.id,d.kind,d.original_name AS originalName,d.status,d.uploaded_at AS uploadedAt,d.reviewed_at AS reviewedAt,u.display_name AS reviewer,d.review_request_id AS reviewId,
      NOT EXISTS(SELECT 1 FROM seller_documents n WHERE n.seller_id=d.seller_id AND n.kind=d.kind AND (n.uploaded_at>d.uploaded_at OR n.uploaded_at=d.uploaded_at AND n.id>d.id)) AS currentSubmission,
      CASE WHEN d.status='verified' AND NOT EXISTS(SELECT 1 FROM seller_documents n WHERE n.seller_id=d.seller_id AND n.kind=d.kind AND n.status='verified' AND (n.uploaded_at>d.uploaded_at OR n.uploaded_at=d.uploaded_at AND n.id>d.id)) THEN 1 ELSE 0 END AS currentEvidence,
      a.reason AS reviewReason,a.action AS reviewAction FROM seller_documents d LEFT JOIN users u ON u.id=d.reviewed_by LEFT JOIN audit_logs a ON a.id=d.review_request_id
      WHERE d.seller_id=? ORDER BY d.uploaded_at DESC,d.id DESC`).bind(sellerId).all<DocumentEvidence>(),
    db.prepare(`SELECT r.id,r.document_id AS documentId,r.replacement_document_id AS replacementId,r.reason,r.status,r.requested_at AS requestedAt,
      r.reviewed_at AS reviewedAt,r.review_reason AS reviewReason,r.operation_request_id AS operationId,t.due_at AS dueAt,u.display_name AS owner,c.id AS protectedCaseId
      FROM seller_document_change_requests r LEFT JOIN review_tasks t ON t.source_type='document_change' AND t.source_id=r.id AND t.source_revision=r.id
      LEFT JOIN users u ON u.id=t.owner_id AND u.status='active' LEFT JOIN seller_protected_change_cases c ON c.source_request_id=r.id
      WHERE r.seller_id=? ORDER BY r.requested_at DESC,r.id DESC`).bind(sellerId).all<DocumentChangeCase>(),
    usableReplacementPermissions(db,sellerId,seller.userId),
    currentProtectedIdentity(db,sellerId).then(facts=>facts.governmentIdType||facts.personalPan?
      {type:facts.governmentIdType,number:facts.governmentIdDescription,pan:facts.personalPan||null}:null),
    db.prepare(`SELECT a.id,a.action,a.reason,a.created_at AS createdAt,u.display_name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
      WHERE a.action IN ('seller.document.verified','seller.document.rejected','seller.document.correction_requested','seller.document.correction_submitted','seller.document.change_requested','seller.document.change_reviewed','seller.document.replacement_submitted')
      AND ((a.subject_type='seller_document' AND a.subject_id IN (SELECT id FROM seller_documents WHERE seller_id=?))
        OR (a.subject_type='seller_document_change_request' AND a.subject_id IN (SELECT id FROM seller_document_change_requests WHERE seller_id=?)))
      ORDER BY a.created_at DESC,a.id DESC`).bind(sellerId,sellerId).all<{id:string;action:string;reason:string;createdAt:number;actor:string|null}>(),
  ]);
  const revisions=await db.prepare('SELECT identity_revision AS identityRevision,bank_revision AS bankRevision FROM seller_protected_revisions WHERE seller_id=?')
    .bind(sellerId).first<{identityRevision:number;bankRevision:number}>();
  const protectedCases=(await db.prepare(`SELECT id,kind,status,reason,EXISTS(SELECT 1 FROM seller_capability_holds h WHERE h.case_id=c.id AND h.released_at IS NULL) AS held
    FROM seller_protected_change_cases c WHERE c.seller_id=? AND c.source_request_id IS NULL ORDER BY c.requested_at DESC,c.id DESC`).bind(sellerId)
    .all<{id:string;kind:string;status:string;reason:string;held:number}>()).results;
  return {seller,documents:documents.results,requests:requests.results,permissions,identity,history:history.results,revisions,protectedCases,audience};
}
export type SellerDocumentWorkspace = Awaited<ReturnType<typeof sellerDocumentWorkspace>>;

export {documentChangeState} from './document-display-state';

export async function sellerDocumentWorkspace(db:D1Database,sellerId:string,actorId:string,audience:'seller'|'staff'){
 return withNativeFormLoad(db,audience==='seller'?['seller.document-change-request','seller.document-correction-upload','seller.document-replacement-upload','seller.protected-change-request']:['staff.seller-document-review','staff.seller-document-change-permission'],()=>sellerDocumentWorkspaceSource(db,sellerId,actorId,audience));
}
