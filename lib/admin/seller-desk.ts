import { listReviewTasks } from '../workflows/review-tasks';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { getSellerChecklist } from '../sellers/shop-checklist';
import { getSellerReadiness } from '../sellers/readiness';
import { listSellerPayoutFixes, payoutFixDocumentNames } from '../sellers/payout-fixes';
import { reviewDueAt, type NativeReviewTask, type ReviewQueueTask } from './review-queue-view';
import { readPayoutRequestFinanceScope } from './finance-work-items';
import { marketplaceSummaryRange } from './marketplace-period';

const families = {
  product_review: ['products', 'Product review'],
  product_intake_review: ['products', 'Product review'],
  product_intake_help: ['questions', 'Product help request'],
  seller_application: ['applications', 'New application'],
  seller_document: ['documents', 'Document review'],
  protected_change: ['documents', 'Protected change'],
  document_change: ['documents', 'Document change'],
  public_profile_correction: ['documents', 'Shop profile correction'],
  payout_request: ['payouts', 'Payout request'],
  payout_candidate: ['payouts', 'Payout approval'],
} as const;
type Source = keyof typeof families;
const nativeFamilies = Object.keys(families).filter((key): key is Extract<NativeReviewTask['sourceType'],Source> =>
  key !== 'payout_request' && key !== 'payout_candidate');

export interface SellerDeskItem {
  id: string;
  sourceType: Source;
  sourceId: string;
  group: typeof families[Source][0];
  kind: string;
  title: string;
  sellerId: string;
  sellerName: string;
  startedAt: number;
  dueAt: number | null;
  runAt: number | null;
  href: string;
  sourceStatus: string;
}

export function sellerDeskTaskKey(task: ReviewQueueTask) {
  if (!Object.hasOwn(families, task.sourceType) || task.status !== 'awaiting_review') return null;
  if (task.sourceType === 'payout_candidate' && ('finance' in task && task.finance.origin.model !== 'registered'
      || !['prepared', 'scheduled'].includes(task.sourceStatus))) return null;
  return task.sourceType + ':' + task.sourceId;
}

type ItemFacts = Pick<SellerDeskItem,'sellerId'|'sellerName'|'sourceStatus'|'startedAt'|'dueAt'|'href'> &
  Partial<Pick<SellerDeskItem,'runAt'|'kind'|'title'>>;
function item(sourceType: Source, sourceId: string, facts: ItemFacts): SellerDeskItem {
  const [group, label] = families[sourceType];
  return { id: sourceType + ':' + sourceId, sourceType, sourceId, group, kind: label, title: label, runAt: null, ...facts };
}

function fullReview(task: NativeReviewTask) {
  const id = encodeURIComponent(task.sourceId);
  switch (task.sourceType) {
    case 'product_review': return '/admin/products/' + id;
    case 'product_intake_review': return '/admin/products/publications/' + id;
    case 'product_intake_help': return '/admin/products/intakes/' + id;
    case 'seller_document': return '/admin/seller-documents/' + id + '/review';
    case 'document_change': return '/admin/seller-document-change-requests/' + id;
    case 'protected_change': return '/admin/seller-protected-changes/' + id;
    case 'public_profile_correction': return '/admin/seller-profile-corrections/' + id;
    default: return '/admin/sellers/' + encodeURIComponent(task.sellerId!) + '#seller-decision';
  }
}

async function nativeItems(db: D1Database, actorId: string) {
  const tasks = await listReviewTasks(db, actorId, undefined, { sourceTypes: nativeFamilies });
  const open = tasks.filter(task => task.sellerId && sellerDeskTaskKey(task));
  const reviews = new Set(open.filter(task => task.sourceType === 'product_intake_review').map(task => task.sourceId));
  const protectedIds = new Set(open.filter(task => task.sourceType === 'protected_change').map(task => task.sourceId));
  const actionableDocumentRequests = new Set(open.filter(task => task.sourceType === 'document_change').map(task => task.sourceId));
  const aliases: Record<string,string> = {};
  const rows: SellerDeskItem[] = [];
  for (const task of open) {
    const key = task.sourceType + ':' + task.sourceId;
    if (task.sourceType === 'product_intake_help' && reviews.has(task.sourceId)) {
      aliases[key] = 'product_intake_review:' + task.sourceId;
      continue;
    }
    if (task.sourceType === 'product_review') {
      const link = await db.prepare(`SELECT c.id FROM product_publication_links l JOIN product_intake_cases c ON c.draft_id=l.draft_id
        WHERE l.product_id=? ORDER BY c.cycle_number DESC LIMIT 1`).bind(task.sourceId).first<{id:string}>();
      if (link) {
        if (reviews.has(link.id)) aliases[key] = 'product_intake_review:' + link.id;
        continue;
      }
    }
    if (task.sourceType === 'protected_change') {
      const linked = await db.prepare('SELECT source_request_id AS requestId,kind FROM seller_protected_change_cases WHERE id=?')
        .bind(task.sourceId).first<{requestId:string|null;kind:string}>();
      if (linked?.requestId && linked.kind !== 'bank' && actionableDocumentRequests.has(linked.requestId)) {
        aliases[key] = 'document_change:' + linked.requestId;
        continue;
      }
    }
    if (task.sourceType === 'document_change') {
      const protectedCase = await db.prepare('SELECT id,kind FROM seller_protected_change_cases WHERE source_request_id=?')
        .bind(task.sourceId).first<{id:string;kind:string}>();
      if (protectedCase?.kind === 'bank' && protectedIds.has(protectedCase.id)) {
        aliases[key] = 'protected_change:' + protectedCase.id;
        continue;
      }
    }
    const sellerId = task.sellerId!;
    const sellerName = task.sellerName || (await db.prepare('SELECT trading_name AS name FROM seller_profiles WHERE id=?')
      .bind(sellerId).first<{name:string}>())?.name || 'Seller';
    const sourceType = task.sourceType as Source;
    const row = item(sourceType, task.sourceId, {
      sellerId, sellerName, startedAt: task.startedAt, dueAt: reviewDueAt(task), sourceStatus: task.sourceStatus,
      href: fullReview(task), title: task.recordTitle || (sourceType === 'seller_application' ? sellerName : families[sourceType][1]),
    });
    if (sourceType === 'product_intake_review' || sourceType === 'product_review') {
      const revision = sourceType === 'product_review'
        ? await db.prepare("SELECT 1 FROM audit_logs WHERE id=? AND action='product.resubmitted'").bind(task.sourceRevision).first()
        : await db.prepare("SELECT 1 FROM product_intake_events WHERE case_id=? AND (kind='publication.changes_requested' OR (kind='triaged' AND json_extract(detail_json,'$.outcome')='needs_information')) LIMIT 1").bind(task.sourceId).first();
      if (revision) row.kind = 'Sent back after fix';
    }
    rows.push(row);
  }
  return {rows, aliases};
}

/** Standard unverified corrections may concern registration or VAT evidence with no separate review task. */
async function correctedDocuments(db: D1Database, actorId: string) {
  const documents = await db.prepare(`SELECT d.id,d.kind,d.uploaded_at AS startedAt,s.id AS sellerId,s.trading_name AS sellerName
    FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id
    JOIN audit_logs a ON a.id=d.review_request_id AND a.subject_id=d.id AND a.actor_id=s.user_id
    JOIN users u ON u.id=s.user_id AND u.status='active'
    WHERE a.action='seller.document.correction_submitted' AND a.subject_type='seller_document'
      AND d.status='pending' AND s.user_id<>? AND s.status NOT IN ('rejected','suspended') AND d.protected_change_id IS NULL
      AND d.kind IN ('representative_identity','pan_certificate','business_registration','vat_certificate')
      AND NOT EXISTS (SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind
        AND (newer.uploaded_at>d.uploaded_at OR (newer.uploaded_at=d.uploaded_at AND newer.id>d.id)))`)
    .bind(actorId).all<{id:string;kind:keyof typeof payoutFixDocumentNames;startedAt:number;sellerId:string;sellerName:string}>();
  return documents.results.map(doc => item('seller_document',doc.id,{sellerId:doc.sellerId,sellerName:doc.sellerName,
    startedAt:doc.startedAt,dueAt:null,sourceStatus:'pending',kind:'Re-uploaded document',
    title:'Recheck ' + payoutFixDocumentNames[doc.kind].en,href:'/admin/seller-documents/' + encodeURIComponent(doc.id) + '/review'}));
}

async function payoutItems(db: D1Database, actorId: string) {
  const rows: SellerDeskItem[] = [];
  const requests = await db.prepare("SELECT id FROM payout_requests WHERE status='submitted'").all<{id:string}>();
  for (const {id} of requests.results) {
    const request = await readPayoutRequestFinanceScope(db, actorId, id);
    if (request?.status !== 'submitted') continue;
    rows.push(item('payout_request', id, { sellerId: request.sellerId, sellerName: request.tradingName,
      startedAt: request.createdAt, dueAt: request.firstFinanceDueAt, sourceStatus: request.status,
      title: 'Review payout request', href: '/admin/payouts?request=' + encodeURIComponent(id) }));
  }
  const prepared = await db.prepare(`SELECT p.id,p.payout_number AS number,p.status AS sourceStatus,p.created_at AS startedAt,
      p.scheduled_for AS runAt,p.seller_id AS sellerId,s.trading_name AS sellerName
    FROM payouts p JOIN seller_profiles s ON s.id=p.seller_id
    WHERE p.status IN ('prepared','scheduled') AND s.user_id<>? AND NOT EXISTS (
      SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id AND t.state NOT IN ('failed','void'))`)
    .bind(actorId).all<{id:string;number:string;sourceStatus:string;startedAt:number;runAt:number;sellerId:string;sellerName:string}>();
  for (const p of prepared.results) rows.push(item('payout_candidate', p.id, {sellerId:p.sellerId, sellerName:p.sellerName,
    startedAt:p.startedAt, runAt:p.runAt, dueAt:null, sourceStatus:p.sourceStatus,
    title:'Approve payout ' + p.number, href:'/admin/payouts/' + encodeURIComponent(p.id)}));
  return rows;
}

async function decisionsToday(db: D1Database, actorId: string, now: number) {
  const {start} = marketplaceSummaryRange('today', now);
  const sources = [
    `SELECT COUNT(*) AS n FROM audit_logs WHERE (
      (subject_type='product' AND action IN ('product.changes.requested','product.approved','product.published','product.rejected'))
      OR (subject_type='seller' AND action IN ('seller.application.changes_requested','seller.application.approved','seller.application.approved_for_activation','seller.application.rejected'))
      OR (subject_type='seller_document' AND action IN ('seller.document.verified','seller.document.rejected','seller.document.correction_requested'))
      OR (subject_type='seller_document_change_request' AND action='seller.document.change_reviewed'
        AND NOT EXISTS (SELECT 1 FROM seller_protected_change_events e WHERE e.case_id=audit_logs.subject_id
          AND e.actor_id=audit_logs.actor_id AND e.created_at=audit_logs.created_at AND e.action IN ('permit','reject')))
      OR (subject_type='payout_request' AND action IN ('payout.request.prepared','payout.request.rejected'))
      OR (subject_type='payout' AND action IN ('payout.approve','payout.reject')))`,
    'SELECT COUNT(*) AS n FROM product_publication_decisions WHERE 1=1',
    "SELECT COUNT(*) AS n FROM product_intake_events WHERE (kind='changes_proposed' OR (kind='triaged' AND json_extract(detail_json,'$.outcome')='needs_information'))",
    "SELECT COUNT(*) AS n FROM seller_protected_change_events WHERE action IN ('permit','reject','clarify','verified','identity_verified','bank_revalidated','evidence_only_classified','holds_released','holds_retained')",
    "SELECT COUNT(*) AS n FROM seller_public_profile_events WHERE action IN ('correction_authorized','correction_applied','correction_declined','correction_clarification')",
  ];
  const counts = await Promise.all(sources.map(sql => db.prepare(sql + ' AND actor_id=? AND created_at BETWEEN ? AND ?')
    .bind(actorId,start,now).first<{n:number}>()));
  return counts.reduce((sum, count) => sum + (count?.n ?? 0), 0);
}

export function sortSellerDeskItems(items: SellerDeskItem[]) {
  return items.sort((a,b) => (a.runAt ?? a.startedAt) - (b.runAt ?? b.startedAt) ||
    a.startedAt - b.startedAt || a.id.localeCompare(b.id));
}

export async function readSellerDesk(db: D1Database, actorId: string, now = Date.now()) {
  const authority = await staffMutationGuard(db,actorId,'seller.application.review',Error,'super_admin');
  const [reviews, documents, payouts, fixes, doneToday] = await Promise.all([
    nativeItems(db, actorId), correctedDocuments(db, actorId), payoutItems(db, actorId), listSellerPayoutFixes(db, actorId), decisionsToday(db, actorId, now),
  ]);
  const items = new Map([...reviews.rows, ...documents, ...payouts].map(row => [row.id, row]));
  for (const fix of fixes.filter(fix => fix.waitingFor === 'staff')) {
    const sourceType = fix.protectedCaseId ? 'protected_change' : 'seller_document';
    const sourceId = fix.protectedCaseId ?? fix.documentId;
    const prior = items.get(sourceType + ':' + sourceId);
    const evidence = await db.prepare('SELECT uploaded_at AS at FROM seller_documents WHERE id=? AND seller_id=?')
      .bind(fix.documentId,fix.sellerId).first<{at:number}>();
    if (!evidence) continue;
    const row = item(sourceType, sourceId, { sellerId:fix.sellerId,sellerName:fix.sellerName,
      sourceStatus:prior?.sourceStatus ?? 'pending',startedAt:evidence.at,dueAt:prior?.dueAt ?? null,
      href:fix.protectedCaseId ? '/admin/seller-protected-changes/' + encodeURIComponent(sourceId) : fix.staffHref,
      kind:'Re-uploaded document',title:'Recheck ' + fix.label });
    items.set(row.id,row);
  }
  await db.batch(authority.statements);
  return {items:sortSellerDeskItems([...items.values()]), aliases:reviews.aliases, doneToday};
}

export async function readSellerDeskContext(db: D1Database, actorId: string, selected: SellerDeskItem, now = Date.now()) {
  const authority = await staffMutationGuard(db,actorId,'seller.application.review',Error,'super_admin');
  const seller = await db.prepare('SELECT user_id AS ownerId,district FROM seller_profiles WHERE id=? AND user_id<>?')
    .bind(selected.sellerId,actorId).first<{ownerId:string;district:string}>();
  if (!seller) throw new Error('An independent seller reviewer is required.');
  const readiness = await getSellerReadiness(db,selected.sellerId,now).catch(() => null);
  const checklist = await getSellerChecklist(db,selected.sellerId,{audience:'staff',actorId,ownerId:seller.ownerId,now,readiness});
  await db.batch(authority.statements);
  return { canSell:checklist.canSell, canPay:checklist.canPay, payoutsUntil:checklist.payoutsUntil, district:seller.district,
    publicProductCount:readiness?.publicProductCount ?? null };
}
