import type { SellerDocumentKind } from './application';

export type PayoutFixDeadline = 'first_payout' | 'approval';

export const payoutFixDocumentNames: Record<SellerDocumentKind, { en: string; ne: string }> = {
  bank_verification: { en: 'bank document', ne: 'बैंक कागजात' },
  business_registration: { en: 'business registration', ne: 'व्यवसाय दर्ता' },
  pan_certificate: { en: 'PAN document', ne: 'प्यान कागजात' },
  representative_identity: { en: 'government ID', ne: 'सरकारी परिचयपत्र' },
  vat_certificate: { en: 'VAT document', ne: 'भ्याट कागजात' },
};

export interface SellerPayoutFix {
  id: string;
  sellerId: string;
  sellerName: string;
  kind: SellerDocumentKind;
  label: string;
  note: string;
  documentId: string;
  protectedCaseId: string | null;
  waitingFor: 'seller' | 'staff';
  sellerHref: string;
  staffHref: string;
  decidedAt: number;
  decidedBy: string | null;
}

const payoutFixOpened = 'seller.document.payout_fix_opened';
const payoutFixJoin = `FROM seller_documents payout_fix_source
  JOIN audit_logs payout_fix_event ON payout_fix_event.subject_id=payout_fix_source.id
    AND payout_fix_event.subject_type='seller_document' AND payout_fix_event.action='${payoutFixOpened}'
  JOIN seller_profiles payout_fix_seller ON payout_fix_seller.id=payout_fix_source.seller_id
  LEFT JOIN seller_participation_profiles payout_fix_route ON payout_fix_route.seller_id=payout_fix_seller.id`;
const openPayoutFix = `payout_fix_seller.status='approved'
  AND COALESCE(payout_fix_route.participation_route,'registered_seller')='registered_seller'
  AND NOT EXISTS(SELECT 1 FROM seller_documents verified_fix
    WHERE verified_fix.seller_id=payout_fix_source.seller_id AND verified_fix.kind=payout_fix_source.kind
      AND verified_fix.status='verified' AND verified_fix.reviewed_at>=payout_fix_event.created_at
      AND (verified_fix.reviewed_by IS NULL OR verified_fix.reviewed_by<>payout_fix_seller.user_id)
      AND (verified_fix.id=payout_fix_source.id OR verified_fix.uploaded_at>payout_fix_source.uploaded_at
        OR (verified_fix.uploaded_at=payout_fix_source.uploaded_at AND verified_fix.id>payout_fix_source.id)))`;

/** The immutable opening decision, plus the existing evidence history, is the payout hold source. */
export function sellerPayoutFixOpenSql(sellerExpression: string, fixEventExpression?: string) {
  return `EXISTS(SELECT 1 ${payoutFixJoin}
    WHERE payout_fix_source.seller_id=${sellerExpression} AND ${openPayoutFix}
    ${fixEventExpression ? `AND payout_fix_event.id=${fixEventExpression}` : ''})`;
}

type PayoutFixRow = Omit<SellerPayoutFix, 'waitingFor' | 'sellerHref' | 'staffHref' | 'label'> & { awaitingReview: number };
async function readPayoutFixes(db: D1Database, sellerId?: string, excludedOwnerId?: string): Promise<SellerPayoutFix[]> {
  const result = await db.prepare(`SELECT payout_fix_event.id,
    payout_fix_seller.id AS sellerId, payout_fix_seller.trading_name AS sellerName, document.kind,
    COALESCE(review.reason,payout_fix_event.reason) AS note, document.id AS documentId,
    (SELECT bank_change.id FROM seller_protected_change_cases bank_change
      WHERE bank_change.seller_id=document.seller_id AND bank_change.replacement_document_id=document.id
      ORDER BY bank_change.updated_at DESC,bank_change.id DESC LIMIT 1) AS protectedCaseId,
    CASE WHEN document.id<>payout_fix_source.id AND document.status='pending'
      AND (review.action IS NULL OR review.action NOT IN ('seller.document.correction_requested','seller.document.rejected'))
      THEN 1 ELSE 0 END AS awaitingReview,
    payout_fix_event.created_at AS decidedAt, payout_fix_event.actor_id AS decidedBy
    ${payoutFixJoin}
    JOIN seller_documents document ON document.id=(SELECT latest.id FROM seller_documents latest
      WHERE latest.seller_id=payout_fix_source.seller_id AND latest.kind=payout_fix_source.kind
      ORDER BY latest.uploaded_at DESC,latest.id DESC LIMIT 1)
    LEFT JOIN audit_logs review ON review.id=document.review_request_id
      AND review.action IN ('seller.document.correction_requested','seller.document.rejected')
    WHERE ${openPayoutFix} ${sellerId === undefined ? '' : 'AND payout_fix_seller.id=?'}
      ${excludedOwnerId === undefined ? '' : 'AND payout_fix_seller.user_id<>?'}
    ORDER BY payout_fix_event.created_at,payout_fix_event.id`)
    .bind(...(sellerId === undefined ? [] : [sellerId]),...(excludedOwnerId === undefined ? [] : [excludedOwnerId])).all<PayoutFixRow>();
  return result.results.map(({ awaitingReview, ...row }) => ({
    ...row,
    label: payoutFixDocumentNames[row.kind].en,
    waitingFor: awaitingReview ? 'staff' : 'seller',
    sellerHref: row.kind === 'bank_verification' ? '/seller/finance#seller-bank-evidence' : '/seller/registration#document-' + encodeURIComponent(row.documentId),
    staffHref: row.kind === 'bank_verification' ? '/admin/sellers/' + encodeURIComponent(row.sellerId) + '#seller-bank' : '/admin/seller-documents/' + encodeURIComponent(row.documentId) + '/review',
  }));
}

export function readSellerPayoutFixes(db: D1Database, sellerId: string) {
  return readPayoutFixes(db, sellerId);
}

export function listSellerPayoutFixes(db: D1Database, excludedOwnerId?: string) {
  return readPayoutFixes(db, undefined, excludedOwnerId);
}

export interface ApplicationDocumentProblem {
  documentId: string;
  kind: SellerDocumentKind;
  reviewId: string;
  neededBefore: PayoutFixDeadline;
  note: string;
}

const problemDeadlineSql = (db: D1Database, alias = 'problem_review') => {
  const jsonValue = (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'JSON_VALUE' : 'json_extract';
  return `${jsonValue}(${alias}.next_json,'$.neededBefore')`;
};

const documentProblemsSql = (db: D1Database) => `FROM seller_documents problem_document
  JOIN audit_logs problem_review ON problem_review.id=problem_document.review_request_id
  WHERE problem_document.seller_id=? AND problem_document.status IN ('pending','rejected')
    AND problem_review.action IN ('seller.document.correction_requested','seller.document.rejected')
    AND ${problemDeadlineSql(db)} IN ('first_payout','approval')
    AND NOT EXISTS(SELECT 1 FROM seller_documents newer_problem
      JOIN audit_logs newer_review ON newer_review.id=newer_problem.review_request_id
      WHERE newer_problem.seller_id=problem_document.seller_id AND newer_problem.kind=problem_document.kind
        AND (newer_problem.uploaded_at>problem_document.uploaded_at OR
          (newer_problem.uploaded_at=problem_document.uploaded_at AND newer_problem.id>problem_document.id))
        AND newer_review.action IN ('seller.document.correction_requested','seller.document.rejected')
        AND ${problemDeadlineSql(db,'newer_review')} IN ('first_payout','approval'))
    AND NOT EXISTS(SELECT 1 FROM seller_documents verified_problem
      WHERE verified_problem.seller_id=problem_document.seller_id AND verified_problem.kind=problem_document.kind
        AND verified_problem.status='verified' AND verified_problem.reviewed_at>=problem_review.created_at
        AND (verified_problem.uploaded_at>problem_document.uploaded_at OR
          (verified_problem.uploaded_at=problem_document.uploaded_at AND verified_problem.id>problem_document.id)))`;

export async function readApplicationDocumentProblems(db: D1Database, sellerId: string) {
  return (await db.prepare(`SELECT problem_document.id AS documentId,problem_document.kind,
    problem_review.id AS reviewId,${problemDeadlineSql(db)} AS neededBefore,problem_review.reason AS note
    ${documentProblemsSql(db)} ORDER BY problem_document.kind`).bind(sellerId).all<ApplicationDocumentProblem>()).results;
}

/** Pin the count and recorded review revisions to this approving transaction. */
export function applicationDocumentProblemsGuard(
  db: D1Database, sellerId: string, problems: readonly ApplicationDocumentProblem[],
) {
  const guardId = crypto.randomUUID();
  const documentProblems = documentProblemsSql(db);
  const reviewed = problems.length ? `AND (SELECT COUNT(*) ${documentProblems}
    AND problem_review.id IN (${problems.map(() => '?').join(',')}))=?` : '';
  return [
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN
      (SELECT COUNT(*) ${documentProblems})=? ${reviewed} THEN 1 ELSE 0 END`)
      .bind(guardId,sellerId,problems.length,...(problems.length ? [sellerId,...problems.map(problem => problem.reviewId),problems.length] : [])),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),
  ];
}

export function openApplicationPayoutFix(
  db: D1Database, input: { sellerId: string; actorId: string; requestId: string; now: number; problem: ApplicationDocumentProblem },
) {
  return db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
    VALUES(?,?,'${payoutFixOpened}','seller_document',?,?,?,?,?)`)
    .bind(crypto.randomUUID(),input.actorId,input.problem.documentId,input.problem.note,
      JSON.stringify({ sellerId:input.sellerId,neededBefore:'first_payout',reviewId:input.problem.reviewId }),
      input.requestId,input.now);
}
