import {readLegacyProtectedTransition,legacyTransitionProjectionProof} from '../sellers/legacy-protected-transition';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import type { Permission } from '../marketplace/permissions';
import { commandReceipt, type CommandContext } from './contracts';
import { calculateServiceDueAt, CONTINUOUS_CALENDAR_VERSION } from './service-clock';

type SourceType = 'team_governance'|'system_incident'|'recovery_claim' | 'recovery_review' | 'recovery_contact' | 'return_request' | 'complaint' | 'cancellation_review' | 'order_response' | 'payment_claim' | 'payment_exception' | 'product_priority' | 'commission_terms' | 'company_account' | 'seller_application' | 'seller_document' | 'document_change' | 'product_review' | 'product_intake_help' | 'product_intake_review' | 'protected_change' | 'public_profile' | 'public_profile_correction';
interface Source {deadlineStartedAt?:number;recordTitle?:string|null;allowedStaffIds?:string[];assigneeOnlyId?:string|null;orderId?:string;dueAt?:number;reviewHours?:number;initialReviewerId?:string|null;priority?:boolean;backupId?:string|null; alternativePermission?:Permission;conflictIds?:string[];hasDeadline?:boolean;sellerId?:string;sellerName?:string;nextUpdateAt?:number|null; revision: string; ownerId: string; startedAt: number; status: string; permission: Permission; reserved: boolean; predicate: string; values: unknown[]; hasHolds?:number;triagedAt?:number|null;needsAction?:boolean;nextActor?:string }
export class ReviewTaskConflict extends Error {}

/** Internal SQL projection shared with notification routing; use the actual retained product-review source revision. */
export function currentProductReviewOwnerSql(productIdExpression:string){
 if(!/^(?:\?|[a-z_]+\.[a-z_]+)$/.test(productIdExpression))throw new Error('Use a code-owned product reference expression.');
 return `SELECT t.owner_id FROM review_tasks t WHERE t.source_type='product_review' AND t.source_id=${productIdExpression} AND t.source_revision=(SELECT a.id FROM audit_logs a WHERE a.subject_type='product' AND a.subject_id=t.source_id AND a.action IN ('product.submitted','product.resubmitted') ORDER BY a.created_at DESC,a.id DESC LIMIT 1) ORDER BY t.started_at DESC,t.id DESC LIMIT 1`;
}

/** Whitelisted source adapters prevent client-chosen permissions, clocks or completion. */
async function source(db: D1Database, type: SourceType, id: string, now=Date.now()): Promise<Source> {
  if(type==='team_governance')return (await import('../operations/team-governance-tasks')).teamReviewSource(db,id,now);
  if(type==='system_incident')return (await import('../operations/incident-review')).incidentReviewSource(db,id,now);
  if(type==='recovery_claim')return (await import('../payments/recovery-repayments')).recoveryRepaymentReviewSource(db,id);
  if(type==='recovery_review')return (await import('../payments/recovery-followup')).recoveryReviewSource(db,id);
  if(type==='recovery_contact')return (await import('../payments/recovery-followup')).recoveryContactReviewSource(db,id,now);
  if(type==='return_request'||type==='complaint'){
    const returned=type==='return_request';
    const row=await db.prepare(returned?`SELECT r.id,i.order_id AS orderId,r.status,h.revision,r.requested_at AS startedAt,h.first_due_at AS dueAt,h.first_action_at AS triagedAt,h.next_update_at AS nextUpdateAt,h.owner_id AS initialReviewerId,h.backup_id AS backupId,h.waiting_for AS waitingFor,COALESCE(o.customer_id,'') AS ownerId,o.order_number AS sellerName,0 AS priority FROM return_requests r JOIN return_handling h ON h.case_id=r.id JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id WHERE r.id=?`:`SELECT c.id,c.order_id AS orderId,c.status,c.followup_revision AS revision,c.created_at AS startedAt,c.first_due_at AS dueAt,c.first_action_at AS triagedAt,c.next_update_at AS nextUpdateAt,c.assigned_to AS initialReviewerId,c.backup_id AS backupId,c.waiting_for AS waitingFor,COALESCE(o.customer_id,'') AS ownerId,o.order_number AS sellerName,CASE WHEN c.priority='urgent' THEN 1 ELSE 0 END AS priority FROM complaints c JOIN orders o ON o.id=c.order_id WHERE c.id=?`).bind(id).first<{id:string;orderId:string;status:string;revision:number;startedAt:number;dueAt:number;triagedAt:number|null;nextUpdateAt:number|null;initialReviewerId:string|null;backupId:string|null;waitingFor:string;ownerId:string;sellerName:string;priority:number}>();
    if(!row)throw new ReviewTaskConflict('The original aftercare source needs reconciliation.');
    const conflicts=(await db.prepare('SELECT DISTINCT s.user_id AS id FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=?').bind(row.orderId).all<{id:string}>()).results.map(value=>value.id);
    const parties=`NOT EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=? ${conflicts.length?'AND s.user_id NOT IN('+conflicts.map(()=>'?').join(',')+')':''})`;
    return {...row,priority:Boolean(row.priority),revision:row.id,conflictIds:conflicts,hasDeadline:row.triagedAt===null,reviewHours:24,permission:'support.manage',alternativePermission:returned?'order.manage':undefined,reserved:false,needsAction:!['resolved','closed','rejected'].includes(row.status),nextActor:row.waitingFor==='customer'?'Customer':row.waitingFor==='seller'?'You':row.waitingFor==='carrier'?'Carrier':'Hastabazaar',predicate:(returned?`EXISTS(SELECT 1 FROM return_handling h JOIN return_requests r ON r.id=h.case_id JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id WHERE r.id=? AND h.revision=? AND r.status=? AND COALESCE(o.customer_id,'')=?)`:`EXISTS(SELECT 1 FROM complaints c JOIN orders o ON o.id=c.order_id WHERE c.id=? AND c.followup_revision=? AND c.status=? AND COALESCE(o.customer_id,'')=?)`)+' AND '+parties,values:[id,row.revision,row.status,row.ownerId,row.orderId,...conflicts]};
  }
  if(type==='cancellation_review'){
    const row=await db.prepare("SELECT r.id,r.order_id AS orderId,r.revision,r.status,r.created_at AS startedAt,r.first_action_at AS triagedAt,r.first_due_at AS dueAt,r.next_update_at AS nextUpdateAt,r.owner_id AS initialReviewerId,r.backup_id AS backupId,COALESCE(o.customer_id,'') AS ownerId,o.order_number AS sellerName,o.status AS orderStatus FROM order_cancellation_reviews r JOIN orders o ON o.id=r.order_id WHERE r.id=?").bind(id).first<{id:string;orderId:string;revision:number;status:string;startedAt:number;triagedAt:number|null;dueAt:number;nextUpdateAt:number|null;initialReviewerId:string|null;backupId:string|null;ownerId:string;sellerName:string;orderStatus:string}>();
    if(!row)throw new ReviewTaskConflict('The cancellation source is unavailable.');
    const conflicts=(await db.prepare('SELECT DISTINCT s.user_id AS id FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id WHERE i.order_id=?').bind(row.orderId).all<{id:string}>()).results.map(r=>r.id);
    return {...row,revision:row.id,conflictIds:conflicts,hasDeadline:row.triagedAt===null,reviewHours:2,permission:'order.manage',reserved:false,needsAction:row.status==='pending'&&row.orderStatus!=='cancelled',nextActor:'Operations',predicate:"EXISTS(SELECT 1 FROM order_cancellation_reviews r JOIN orders o ON o.id=r.order_id WHERE r.id=? AND r.revision=? AND r.status=? AND COALESCE(o.customer_id,'')=?)",values:[id,row.revision,row.status,row.ownerId]};
  }
  if(type==='order_response'){
    const row=await db.prepare('SELECT c.id,c.revision,c.state AS status,c.created_at AS startedAt,c.first_action_at AS triagedAt,c.first_due_at AS firstDueAt,c.next_update_at AS nextUpdateAt,c.owner_id AS initialReviewerId,c.backup_id AS backupId,p.operator_mode AS mode,p.seller_id AS sellerId,o.customer_id AS ownerId,o.order_number AS sellerName,s.user_id AS sellerOwner FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id JOIN orders o ON o.id=p.order_id JOIN seller_profiles s ON s.id=p.seller_id WHERE c.id=?').bind(id).first<{id:string;revision:number;status:string;startedAt:number;triagedAt:number|null;firstDueAt:number;nextUpdateAt:number|null;initialReviewerId:string|null;backupId:string|null;mode:string;sellerId:string;ownerId:string;sellerName:string;sellerOwner:string}>();if(!row)throw new ReviewTaskConflict('This order follow-up is unavailable.');
    return {...row,conflictIds:[row.sellerOwner],dueAt:row.firstDueAt,revision:row.id,hasDeadline:row.triagedAt===null,reviewHours:Math.max(0,(row.firstDueAt-row.startedAt)/3600000),permission:'order.manage',reserved:row.mode==='company',needsAction:row.status!=='resolved',nextActor:'Operations',predicate:'EXISTS(SELECT 1 FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id JOIN orders o ON o.id=p.order_id JOIN seller_profiles s ON s.id=p.seller_id WHERE c.id=? AND c.revision=? AND c.state=? AND s.user_id=? AND o.customer_id=?)',values:[id,row.revision,row.status,row.sellerOwner,row.ownerId]};
  }
  if(type==='payment_claim'){
    const row=await db.prepare(`SELECT c.id,c.revision,c.current_state AS status,c.customer_id AS ownerId,c.first_submitted_at AS startedAt,o.order_number AS sellerName,w.paid_at AS paidAt,w.closed_at AS closedAt,w.cutoff_at AS cutoffAt,${checkoutCommitClock(db)} AS now,(SELECT MIN(e.occurred_at) FROM manual_payment_claim_events e WHERE e.claim_id=c.id AND e.state IN ('needs_information','rejected','matched')) AS triagedAt,(SELECT MAX(e.occurred_at)+86400000 FROM manual_payment_claim_events e WHERE e.claim_id=c.id AND e.state='needs_information') AS nextUpdateAt FROM manual_payment_claims c JOIN orders o ON o.id=c.order_id JOIN manual_payment_cutoffs w ON w.order_id=c.order_id WHERE c.id=?`).bind(id).first<{id:string;revision:number;status:string;ownerId:string;startedAt:number;sellerName:string;paidAt:number|null;closedAt:number|null;cutoffAt:number;now:number;triagedAt:number|null;nextUpdateAt:number|null}>();
    if(!row)throw new ReviewTaskConflict('The retained payment claim is unavailable.');
    return {...row,revision:row.id,reviewHours:4,hasDeadline:row.triagedAt===null,permission:'payment.receipt.verify',reserved:false,needsAction:row.paidAt===null&&row.closedAt===null&&row.now<row.cutoffAt&&['submitted','clarified','needs_information'].includes(row.status),nextActor:row.status==='needs_information'?'Customer':'Finance',predicate:'EXISTS(SELECT 1 FROM manual_payment_claims WHERE id=? AND revision=? AND current_state=?)',values:[id,row.revision,row.status]};
  }
  if(type==='payment_exception'){
    const row=await db.prepare("SELECT e.id,e.revision,e.state AS status,e.kind,e.created_at AS startedAt,e.triaged_at AS triagedAt,e.next_update_at AS nextUpdateAt,e.owner_id AS initialReviewerId,e.backup_id AS backupId,e.receipt_id AS receiptId,COALESCE(o.customer_id,'') AS ownerId,COALESCE(o.order_number,'Company receipt') AS sellerName FROM manual_payment_exceptions e LEFT JOIN orders o ON o.id=e.order_id WHERE e.id=?").bind(id).first<{id:string;revision:number;status:string;kind:string;startedAt:number;triagedAt:number|null;nextUpdateAt:number;initialReviewerId:string|null;backupId:string|null;receiptId:string|null;ownerId:string;sellerName:string}>();
    if(!row)throw new ReviewTaskConflict('The retained payment exception is unavailable.');
    const conflicts=row.receiptId?(await db.prepare('SELECT user_id AS id FROM company_receipt_conflicts WHERE receipt_id=?').bind(row.receiptId).all<{id:string}>()).results.map(r=>r.id):[];
    conflicts.push(...(await db.prepare('SELECT DISTINCT s.user_id AS id FROM manual_payment_exceptions e JOIN order_items i ON i.order_id=e.order_id JOIN seller_profiles s ON s.id=i.seller_id WHERE e.id=?').bind(id).all<{id:string}>()).results.map(r=>r.id));
    return {...row,revision:row.id,hasDeadline:row.triagedAt===null,conflictIds:conflicts,permission:row.kind==='fulfillment_release'?'order.manage':'payment.receipt.verify',reserved:false,needsAction:row.status!=='resolved',nextActor:row.kind==='fulfillment_release'?'Operations':'Finance',predicate:'EXISTS(SELECT 1 FROM manual_payment_exceptions WHERE id=? AND revision=? AND state=?)',values:[id,row.revision,row.status]};
  }
  if(type==='product_priority'){
    const row=await db.prepare(`SELECT c.id,c.revision,c.state AS status,c.created_at AS startedAt,c.triaged_at AS triagedAt,
      c.next_update_at AS nextUpdateAt,c.backup_id AS backupId,p.id AS productId,p.seller_id AS sellerId,p.name_en AS recordTitle,
      s.user_id AS ownerId,s.trading_name AS sellerName,d.owner_id AS retainedOwnerId
      FROM product_priority_cases c JOIN products p ON p.id=c.product_id JOIN seller_profiles s ON s.id=p.seller_id
      LEFT JOIN product_publication_links l ON l.product_id=p.id LEFT JOIN product_intake_drafts d ON d.id=l.draft_id WHERE c.id=?`).bind(id)
      .first<{id:string;revision:number;status:string;startedAt:number;triagedAt:number|null;nextUpdateAt:number|null;backupId:string|null;productId:string;sellerId:string;recordTitle:string;ownerId:string;sellerName:string;retainedOwnerId:string|null}>();
    if(!row)throw new ReviewTaskConflict('The retained priority product concern is unavailable.');
    return {...row,conflictIds:row.retainedOwnerId?[row.retainedOwnerId]:[],revision:row.id,priority:true,hasDeadline:false,permission:'product.review',reserved:false,
      needsAction:row.status!=='resolved',nextActor:row.status==='waiting_seller'?'You':'Hastabazaar',
      predicate:`EXISTS(SELECT 1 FROM product_priority_cases c JOIN products p ON p.id=c.product_id JOIN seller_profiles s ON s.id=p.seller_id
        LEFT JOIN product_publication_links l ON l.product_id=p.id LEFT JOIN product_intake_drafts d ON d.id=l.draft_id
        WHERE c.id=? AND c.revision=? AND c.state=? AND p.id=? AND p.seller_id=? AND s.user_id=? AND COALESCE(d.owner_id,'')=?)`,
      values:[id,row.revision,row.status,row.productId,row.sellerId,row.ownerId,row.retainedOwnerId??'']};
  }
  if(type==='product_intake_help'||type==='product_intake_review'){
    const review=type==='product_intake_review',row=await db.prepare("SELECT c.id,c.revision AS caseRevision,c.state AS status,c.first_requested_at AS requestedAt,c.first_complete_at AS completeAt,c.triaged_at AS triagedAt,c.first_reviewed_at AS reviewedAt,d.owner_id AS ownerId,d.seller_id AS sellerId,s.user_id AS currentOwnerId,COALESCE((SELECT NULLIF(display_name,'') FROM seller_public_profile_states WHERE seller_id=s.id),NULLIF(s.trading_name,''),'Seller') AS sellerName,COALESCE(NULLIF(json_extract(v.snapshot_json,'$.answers.nameEn'),''),json_extract(v.snapshot_json,'$.answers.nameNe')) AS recordTitle,EXISTS(SELECT 1 FROM product_publication_candidates p JOIN product_publication_decisions decision ON decision.version_id=p.id WHERE p.case_id=c.id AND p.workspace_version_id=c.version_id AND decision.action IN ('approve_only','approve_and_publish')) AS hasApproval FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id JOIN seller_profiles s ON s.id=d.seller_id JOIN product_intake_workspace_versions v ON v.id=c.version_id AND v.draft_id=d.id WHERE c.id=?").bind(id).first<{id:string;caseRevision:number;status:string;requestedAt:number;completeAt:number|null;triagedAt:number|null;reviewedAt:number|null;ownerId:string;sellerId:string;currentOwnerId:string;sellerName:string;recordTitle:string|null;hasApproval:number}>();
    if(!row||review&&row.completeAt===null)throw new ReviewTaskConflict('The exact product assistance/review source is unavailable.');
    const publishing=review&&row.status==='ready_for_decision';
    return {...row,conflictIds:[row.currentOwnerId],revision:row.id,startedAt:review?row.completeAt!:row.requestedAt,triagedAt:review?row.reviewedAt:row.triagedAt,hasDeadline:!(publishing||review&&row.reviewedAt!==null),permission:publishing?'product.publish':review?'product.review':'support.manage',alternativePermission:review?(row.status==='resolved'&&row.hasApproval?'product.publish':undefined):'product.review',reserved:false,needsAction:row.status!=='resolved'&&(review?row.completeAt!==null:row.completeAt===null||row.triagedAt===null),nextActor:row.status==='waiting_seller'?'You':publishing?'Permitted publisher':'Hastabazaar',predicate:'EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id JOIN seller_profiles s ON s.id=d.seller_id WHERE c.id=? AND c.revision=? AND c.state=? AND d.owner_id=? AND s.user_id=?)',values:[row.id,row.caseRevision,row.status,row.ownerId,row.currentOwnerId]};

  }
  if(type==='commission_terms'){
    const row=await(await import('../commission/terms-followup')).getFeeTermsCase(db,id,Date.now());if(!row)throw new ReviewTaskConflict('The exact fee follow-up source is unavailable.');
    return {revision:row.id,ownerId:row.ownerId,sellerId:row.sellerId,sellerName:row.sellerName,startedAt:row.createdAt,status:row.state==='replaced'?'superseded':row.state,permission:'seller.application.review',reserved:true,hasDeadline:false,needsAction:row.state==='open'||row.state==='unavailable',nextActor:row.overdue.length?'Hastabazaar':'You',nextUpdateAt:row.actions[0]?.dueAt??null,predicate:'EXISTS(SELECT 1 FROM commission_terms_cases WHERE id=? AND revision=?)',values:[row.id,row.revision]};
  }
  if(type==='company_account'){
    const row=await db.prepare('SELECT v.id,v.status,v.revision,v.submitted_at AS startedAt,v.verified_at AS triagedAt,v.conflicts_json AS conflicts,a.latest_version_id AS latest FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id WHERE v.id=?').bind(id).first<{id:string;status:string;revision:number;startedAt:number;triagedAt:number|null;conflicts:string;latest:string}>();
    if(!row||row.startedAt===null)throw new ReviewTaskConflict('The submitted company account review is unavailable.');
    return {revision:row.id,ownerId:'',startedAt:row.startedAt,status:row.latest===row.id?row.status:'superseded',permission:'business_settings.manage',reserved:true,hasDeadline:false,conflictIds:JSON.parse(row.conflicts) as string[],triagedAt:row.triagedAt,sellerName:'Hastabazaar company account',needsAction:row.latest===row.id&&row.status==='awaiting_verification',nextActor:'Eligible Super Admin',predicate:'EXISTS(SELECT 1 FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id WHERE v.id=? AND v.revision=? AND v.status=? AND a.latest_version_id=?)',values:[row.id,row.revision,row.status,row.latest]};
  }
  if(type==='seller_application'){
    const row=await db.prepare("SELECT s.status,s.created_at AS startedAt,s.id AS sellerId,(SELECT display_name FROM seller_public_profile_states WHERE seller_id=s.id) AS sellerName,s.user_id AS ownerId,COALESCE(p.application_stage,s.status) AS stage FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=?").bind(id).first<{sellerId:string;status:string;startedAt:number;ownerId:string;stage:string}>();
    if(!row)throw new ReviewTaskConflict('Application review source is unavailable.');
    return {...row,status:row.stage,revision:id,hasDeadline:false,permission:'seller.application.review',reserved:false,needsAction:['submitted','under_review','changes_requested','needs_changes'].includes(row.stage),nextActor:['changes_requested','needs_changes'].includes(row.stage)?'You':'Hastabazaar',
      predicate:"EXISTS(SELECT 1 FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=? AND s.user_id=? AND COALESCE(p.application_stage,s.status)=?)",values:[id,row.ownerId,row.stage]};
  }
  if(type==='seller_document'){
    const row=await db.prepare(`SELECT d.status,d.uploaded_at AS startedAt,d.reviewed_at AS triagedAt,s.id AS sellerId,(SELECT display_name FROM seller_public_profile_states WHERE seller_id=s.id) AS sellerName,s.user_id AS ownerId,d.review_request_id AS reviewId,
      (SELECT action FROM audit_logs WHERE id=d.review_request_id) AS lastAction,
      EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind AND (newer.uploaded_at>d.uploaded_at OR newer.uploaded_at=d.uploaded_at AND newer.id>d.id))
      OR d.protected_change_id IS NOT NULL OR EXISTS(SELECT 1 FROM seller_document_change_requests r WHERE r.replacement_document_id=d.id) AS superseded
      FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id WHERE d.id=? AND d.kind IN ('representative_identity','pan_certificate')`).bind(id).first<{sellerId:string;status:string;startedAt:number;triagedAt:number|null;ownerId:string;reviewId:string|null;lastAction:string|null;superseded:number}>();
    if(!row)throw new ReviewTaskConflict('Exact document review source is unavailable.');
    return {...row,status:row.superseded?'superseded':row.status,revision:id,hasDeadline:false,permission:'seller.application.review',reserved:true,needsAction:!row.superseded&&row.status==='pending',nextActor:row.lastAction==='seller.document.correction_requested'?'You':'Hastabazaar',
      predicate:"EXISTS(SELECT 1 FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id WHERE d.id=? AND d.status=? AND s.user_id=? AND COALESCE(d.review_request_id,'')=COALESCE(?,''))",values:[id,row.status,row.ownerId,row.reviewId]};
  }
  if(type==='public_profile'||type==='public_profile_correction'){
    const correction=type==='public_profile_correction';
    const row=await db.prepare(correction?`SELECT c.id,c.version,c.status,c.requested_at AS startedAt,s.id AS sellerId,(SELECT display_name FROM seller_public_profile_states WHERE seller_id=s.id) AS sellerName,s.user_id AS ownerId,c.reviewed_at AS triagedAt,c.next_update_at AS nextUpdateAt
      FROM seller_public_profile_corrections c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?`:
      `SELECT c.id,c.version,c.status,c.first_submitted_at AS startedAt,s.id AS sellerId,(SELECT display_name FROM seller_public_profile_states WHERE seller_id=s.id) AS sellerName,s.user_id AS ownerId,
       (SELECT MIN(reviewed_at) FROM seller_public_profile_revisions WHERE case_id=c.case_id) AS triagedAt
       FROM seller_public_profile_revisions c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.case_id=? AND c.kind='normal' ORDER BY c.sequence DESC LIMIT 1`)
      .bind(id).first<{id:string;version:number;status:string;startedAt:number;ownerId:string;triagedAt:number|null}>();
    if(!row)throw new ReviewTaskConflict('Public profile review source is unavailable.');
    return{...row,revision:id,permission:'seller.application.review',reserved:false,
      needsAction:(correction?['requested','clarification','authorized']:['submitted','approved','changes_requested','needs_rebase']).includes(row.status),
      nextActor:['clarification','authorized','changes_requested','needs_rebase'].includes(row.status)?'You':'Hastabazaar',
      predicate:`EXISTS(SELECT 1 FROM ${correction?'seller_public_profile_corrections':'seller_public_profile_revisions'} c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=? AND c.version=? AND c.status=? AND s.user_id=?)`,values:[row.id,row.version,row.status,row.ownerId]};
  }
  if(type==='protected_change') {
    const row=await db.prepare(`SELECT c.id,c.status,c.version,c.active_permission_id AS permissionId,(SELECT action FROM seller_protected_change_events WHERE case_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) AS lastAction,c.requested_at AS startedAt,s.id AS sellerId,(SELECT display_name FROM seller_public_profile_states WHERE seller_id=s.id) AS sellerName,s.user_id AS ownerId,
      EXISTS(SELECT 1 FROM seller_capability_holds h WHERE h.case_id=c.id AND h.released_at IS NULL) AS hasHolds,
      COALESCE((SELECT MIN(e.created_at) FROM seller_protected_change_events e WHERE e.case_id=c.id AND e.action IN ('permit','reject','clarify','verified','identity_verified','evidence_only_classified','holds_released','holds_retained')),c.reviewed_at) AS triagedAt
      FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=?`).bind(id)
      .first<{id:string;status:string;version:number;startedAt:number;ownerId:string;hasHolds:number;triagedAt:number|null;permissionId:string|null;lastAction:string|null}>();
    if(!row)throw new ReviewTaskConflict('Protected review source is unavailable.');
    const transition=await readLegacyProtectedTransition(db,id),projection=legacyTransitionProjectionProof(id,transition);
    return {...row,...(transition?{dueAt:transition.commitment.dueAt,deadlineStartedAt:transition.commitment.deadlineStartedAt}:{}),revision:transition?.commitment.sourceRevision??row.id,permission:'seller.application.review',reserved:true,nextActor:row.status==='open'&&(row.permissionId||row.lastAction==='clarify')?'You':'Hastabazaar',
      predicate:'EXISTS(SELECT 1 FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=? AND c.status=? AND s.user_id=? AND c.version=?) AND '+projection.predicate,values:[id,row.status,row.ownerId,row.version,...projection.values]};
  }
  if (type === 'document_change') {
    const row = await db.prepare(`SELECT r.id,r.status,r.requested_at AS startedAt,s.id AS sellerId,(SELECT display_name FROM seller_public_profile_states WHERE seller_id=s.id) AS sellerName,s.user_id AS ownerId,COALESCE(c.version,-1) AS caseVersion,
      EXISTS(SELECT 1 FROM seller_capability_holds h WHERE h.case_id=c.id AND h.released_at IS NULL) AS hasHolds,
      COALESCE((SELECT MIN(e.created_at) FROM seller_protected_change_events e WHERE e.case_id=c.id AND e.action IN ('permit','reject','clarify','verified','identity_verified','evidence_only_classified','holds_released','holds_retained')),r.reviewed_at) AS triagedAt,
      (SELECT status FROM seller_documents WHERE id=r.replacement_document_id) AS replacementStatus
      FROM seller_document_change_requests r JOIN seller_profiles s ON s.id=r.seller_id LEFT JOIN seller_protected_change_cases c ON c.source_request_id=r.id WHERE r.id=?`).bind(id)
      .first<{ id: string; status: string; startedAt: number; ownerId: string;caseVersion:number;hasHolds:number;triagedAt:number|null;replacementStatus:string|null }>();
    if (!row) throw new ReviewTaskConflict('Review source is unavailable.');
    const transition=await readLegacyProtectedTransition(db,id),projection=legacyTransitionProjectionProof(id,transition);
    const hasDeadline=transition?true:Boolean(await db.prepare("SELECT 1 FROM review_tasks WHERE source_type='document_change' AND source_id=? AND source_revision=?").bind(id,id).first())||row.caseVersion>=0;
    return { ...row,hasDeadline,...(transition?{dueAt:transition.commitment.dueAt,deadlineStartedAt:transition.commitment.deadlineStartedAt}:{}),status:row.status==='completed'&&row.replacementStatus==='pending'?'replacement_awaiting_verification':row.status, revision:transition?.commitment.sourceRevision??row.id, permission: 'seller.application.review', reserved: true,needsAction:row.status==='approved'||awaiting(row.status)||row.replacementStatus==='pending'||Boolean(row.hasHolds),nextActor:row.status==='approved'&&(!transition||Boolean(await db.prepare('SELECT 1 FROM seller_protected_change_cases WHERE id=? AND active_permission_id IS NOT NULL').bind(id).first()))?'You':'Hastabazaar',
      predicate: 'EXISTS(SELECT 1 FROM seller_document_change_requests r JOIN seller_profiles s ON s.id=r.seller_id LEFT JOIN seller_protected_change_cases c ON c.source_request_id=r.id WHERE r.id=? AND r.status=? AND s.user_id=? AND COALESCE(c.version,-1)=?) AND '+projection.predicate, values: [id, row.status, row.ownerId,row.caseVersion,...projection.values] };
  }
  if (type === 'product_review') {
    const row = await db.prepare(`SELECT (SELECT a.id FROM audit_logs a WHERE a.subject_type='product' AND a.subject_id=p.id AND a.action IN ('product.submitted','product.resubmitted') ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS revision,
      p.name_en AS recordTitle,p.status,(SELECT MIN(a.created_at) FROM audit_logs a WHERE a.subject_type='product' AND a.subject_id=p.id AND a.action='product.submitted') AS startedAt,s.id AS sellerId,(SELECT display_name FROM seller_public_profile_states WHERE seller_id=s.id) AS sellerName,s.user_id AS ownerId
      FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?`).bind(id)
      .first<{ revision: string | null; status: string; startedAt: number; ownerId: string;recordTitle:string }>();
    if (!row?.revision) throw new ReviewTaskConflict('A submitted product review is required.');
    return { ...row, revision: row.revision, permission: 'product.review', reserved: false,needsAction:['submitted','under_review','needs_changes','approved'].includes(row.status),nextActor:row.status==='needs_changes'?'You':'Hastabazaar',
      predicate: "EXISTS(SELECT 1 FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND p.status=? AND s.user_id=? AND (SELECT a.id FROM audit_logs a WHERE a.subject_type='product' AND a.subject_id=p.id AND a.action IN ('product.submitted','product.resubmitted') ORDER BY a.created_at DESC,a.id DESC LIMIT 1)=?)", values: [id, row.status, row.ownerId, row.revision] };
  }
  throw new ReviewTaskConflict('Unsupported review source.');
}

function awaiting(status: string) { return ['submitted', 'pending', 'under_review','open','replacement_awaiting_verification'].includes(status); }
function needsReview(current:Source){return current.needsAction??(awaiting(current.status)||Boolean(current.hasHolds));}

/** Internal scheduled projection: the original task/source remains authoritative. */
export async function reviewTaskReminderSource(db:D1Database,taskId:string,now=Date.now()){
 const row=await db.prepare(`SELECT ${columns} FROM review_tasks WHERE id=?`).bind(taskId).first<TaskRow>();if(!row)return null;
 const current=await source(db,row.sourceType,row.sourceId,now);
 let ownerId=current.initialReviewerId??row.ownerId;
 if(ownerId)try{await authority(db,ownerId,current);}catch(error){if(!(error instanceof ReviewTaskConflict))throw error;ownerId=null;}
 return {task:row,current,ownerId,needsAction:current.revision===row.sourceRevision&&needsReview(current),hasDeadline:current.hasDeadline!==false&&Boolean(row.hasDeadline)};
}
export async function reviewTaskReminderRecipientAllowed(db:D1Database,taskId:string,userId:string,now=Date.now()){
 const row=await reviewTaskReminderSource(db,taskId,now);if(!row?.needsAction)return false;
 try{await authority(db,userId,row.current);return true;}catch(error){if(error instanceof ReviewTaskConflict)return false;throw error;}
}
function guard(db: D1Database, predicate: string, values: unknown[]) {
  const id = crypto.randomUUID();
  return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id, ...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}

/** Append after the new request insert in its owning transaction; never reset this clock on replies. */
export function documentChangeTaskInsert(db: D1Database, requestId: string, now: number) {
  const dueAt = calculateServiceDueAt({ startedAt: now, amount: 1, unit: 'service_day', calendarVersion: CONTINUOUS_CALENDAR_VERSION });
  return db.prepare(`INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
    SELECT ?,'document_change',r.id,r.id,r.requested_at,?,?,? FROM seller_document_change_requests r
    WHERE r.id=? AND r.status='submitted' AND r.requested_at=?`)
    .bind(crypto.randomUUID(), dueAt, CONTINUOUS_CALENDAR_VERSION, now, requestId, now);
}
/** One normal task per retained case; replacement revisions do not restart its clock. */
export function publicProfileTaskInsert(db:D1Database,caseId:string,startedAt:number,now:number,correction=false,ownerId:string|null=null){
 const dueAt=correction?startedAt:calculateServiceDueAt({startedAt,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION});
 return db.prepare(`INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,owner_id,has_deadline) VALUES(?,?,?,?,?,?,?,?,?,?)`)
  .bind(crypto.randomUUID(),correction?'public_profile_correction':'public_profile',caseId,caseId,startedAt,dueAt,correction?'no-agreed-deadline-v1':CONTINUOUS_CALENDAR_VERSION,now,ownerId,correction?0:1);
}

/** Internal producer; does not accept an audience, permission or deadline from a browser. */
export async function ensureReviewTask(db: D1Database, input: { sourceType: SourceType; sourceId: string; now: number }): Promise<string> {
  const current = await source(db, input.sourceType, input.sourceId,input.now);
  const existing = await db.prepare('SELECT id FROM review_tasks WHERE source_type=? AND source_id=? AND source_revision=?')
    .bind(input.sourceType, input.sourceId, current.revision).first<{ id: string }>();
  if (existing) return existing.id;
  if (!needsReview(current)) throw new ReviewTaskConflict('This source no longer needs review.');
  const id = crypto.randomUUID();
  const hasDeadline=current.hasDeadline!==false,dueAt=hasDeadline?current.dueAt??calculateServiceDueAt({ startedAt: current.startedAt, amount: current.reviewHours??24, unit: 'staffed_hour', calendarVersion: CONTINUOUS_CALENDAR_VERSION }):current.startedAt;
  let initialOwner:string|null=null;let ownerGuards:D1PreparedStatement[]=[];if(current.initialReviewerId){try{ownerGuards=(await authority(db,current.initialReviewerId,current)).statements;initialOwner=current.initialReviewerId;}catch(error){if(!(error instanceof ReviewTaskConflict))throw error;}}
  await db.batch([...ownerGuards,...guard(db, current.predicate, current.values), db.prepare(`INSERT OR IGNORE INTO review_tasks
    (id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, input.sourceType, input.sourceId, current.revision, current.startedAt, dueAt, hasDeadline?CONTINUOUS_CALENDAR_VERSION:'no-agreed-deadline-v1', input.now,hasDeadline?1:0,initialOwner)]);
  const saved = await db.prepare('SELECT id FROM review_tasks WHERE source_type=? AND source_id=? AND source_revision=?')
    .bind(input.sourceType, input.sourceId, current.revision).first<{ id: string }>();
  if (!saved) throw new ReviewTaskConflict('Review task was not saved.');
  return saved.id;
}

type TaskRow = { hasDeadline:number;id: string; sourceType: SourceType; sourceId: string; sourceRevision: string; startedAt: number; dueAt: number; calendarVersion: string; ownerId: string | null; revision: number };
const columns = 'id,source_type AS sourceType,source_id AS sourceId,source_revision AS sourceRevision,started_at AS startedAt,due_at AS dueAt,calendar_version AS calendarVersion,owner_id AS ownerId,revision,has_deadline AS hasDeadline';

/** Server-only proof for a minimal projection of an original task's current authorized history. */
export async function reviewTaskReadProof(db:D1Database,actorId:string,taskId:string){
 const task=await db.prepare(`SELECT ${columns} FROM review_tasks WHERE id=?`).bind(taskId).first<TaskRow>();
 if(!task)throw new ReviewTaskConflict('The original review task is unavailable.');
 const current=await source(db,task.sourceType,task.sourceId),reader=await authority(db,actorId,current);
 return {task,status:reviewTaskStatus(current,task.sourceRevision),sourceStatus:current.status,ownerId:['return_request','complaint','system_incident'].includes(task.sourceType)?current.initialReviewerId??null:task.ownerId,statements:[...reader.statements,...guard(db,current.predicate,current.values),...guard(db,'EXISTS(SELECT 1 FROM review_tasks WHERE id=? AND source_type=? AND source_id=? AND source_revision=? AND revision=?)',[task.id,task.sourceType,task.sourceId,task.sourceRevision,task.revision])]};
}
async function authority(db: D1Database, actorId: string, current: Source,asCandidate=false) {
  if (actorId === current.ownerId||current.conflictIds?.includes(actorId)) throw new ReviewTaskConflict('A personally conflicted actor cannot review this source.');
  const scoped=!!current.assigneeOnlyId&&current.assigneeOnlyId!==actorId||!asCandidate&&current.allowedStaffIds!==undefined&&!current.allowedStaffIds.includes(actorId),reserved=current.reserved||scoped;
  try{return await staffMutationGuard(db, actorId, current.permission, ReviewTaskConflict, reserved ? 'super_admin' : undefined);}catch(error){if(!(error instanceof ReviewTaskConflict)||!current.alternativePermission)throw error;return staffMutationGuard(db,actorId,current.alternativePermission,ReviewTaskConflict,reserved?'super_admin':undefined);}
}

/** Ordered roster input is supplied by trusted coverage records, never client role claims. */
export async function selectReviewOwner(db: D1Database, input: { sourceType: SourceType; sourceId: string }, candidates: readonly { userId: string; available: boolean }[]): Promise<string | null> {
  const current = await source(db, input.sourceType, input.sourceId);
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.userId)) continue;
    seen.add(candidate.userId);
    if (!candidate.available) continue;
    try { await authority(db, candidate.userId, current); return candidate.userId; }
    catch (error) { if (!(error instanceof ReviewTaskConflict)) throw error; }
  }
  return null;
}

function reviewTaskStatus(current:Source,revision:string){
  if(current.revision!==revision||current.status==='superseded')return 'no_longer_needed';
  if(needsReview(current))return current.nextActor==='Customer'?'waiting_on_customer':current.nextActor==='You'?'waiting_on_seller':'awaiting_review';
  return current.status==='draft'?'not_submitted':'completed';
}

export async function listReviewTasks(db: D1Database, actorId: string, sellerId?:string,options:{limit?:number;reference?:string;fromAt?:number;beforeAt?:number}={}) {
  const reader=await staffMutationGuard(db,actorId,'account.self.manage',ReviewTaskConflict);
  const permissions=new Map<string,D1PreparedStatement[]>(),sourceGuards:D1PreparedStatement[]=[];
  if(options.limit!==undefined&&(!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>1000))throw new ReviewTaskConflict('Choose a bounded review-task source scan.');
  const scope:string[]=[],queryValues:(string|number)[]=[];
  if(options.reference){scope.push('id=?');queryValues.push(options.reference);}
  if(options.fromAt!==undefined){scope.push('started_at>=?');queryValues.push(options.fromAt);}
  if(options.beforeAt!==undefined){scope.push('started_at<?');queryValues.push(options.beforeAt);}
  const query=db.prepare(`SELECT ${columns} FROM review_tasks${scope.length?' WHERE '+scope.join(' AND '):''} ORDER BY due_at,id${options.limit?' LIMIT ?':''}`);
  if(options.limit)queryValues.push(options.limit);
  const rows = (await (queryValues.length?query.bind(...queryValues):query).all<TaskRow>()).results;
  const visible = [];
  for (const row of rows) {
    const current = await source(db, row.sourceType, row.sourceId);
    if(sellerId && current.sellerId!==sellerId)continue;
    let allowed:Awaited<ReturnType<typeof authority>>;
    try { allowed=await authority(db, actorId, current); } catch (error) { if (error instanceof ReviewTaskConflict) continue; throw error; }
    const proofKey=current.permission+':'+(current.alternativePermission??'')+':'+allowed.role;
    if(!permissions.has(proofKey))permissions.set(proofKey,allowed.statements);
    sourceGuards.push(...guard(db,current.predicate,current.values));
    const status = reviewTaskStatus(current,row.sourceRevision);
    let ownerId = ['return_request','complaint','system_incident'].includes(row.sourceType)?current.initialReviewerId??null:row.ownerId;
    if (ownerId) try { await authority(db, ownerId, current); } catch (error) { if (error instanceof ReviewTaskConflict) ownerId = null; else throw error; }
    const fixedAssignment:{assignmentLocked?:boolean}=current.assigneeOnlyId?{assignmentLocked:true}:{};
    const display:{recordTitle?:string}=typeof current.recordTitle==='string'&&current.recordTitle.trim()?{recordTitle:current.recordTitle.trim()}:{};
    visible.push({ ...row,...fixedAssignment,...display,orderId:current.orderId??null,priority:current.priority??false,backupId:current.backupId??null,ownerId,dueAt:current.hasDeadline===false?null:row.hasDeadline?row.dueAt:null,status,sourceStatus:current.status,triagedAt:current.triagedAt??null,nextActor:(row.sourceType.startsWith('product_intake_')||row.sourceType==='product_priority')&&current.nextActor==='You'?'Seller':current.nextActor??'Hastabazaar',sellerId:current.sellerId??null,sellerName:current.sellerName??null,nextUpdateAt:current.nextUpdateAt??null });
  }
  await db.batch([...reader.statements,...[...permissions.values()].flat(),...sourceGuards]);
  return visible;
}

/** Seller-safe projection of the same source-backed tasks; no private reviewer notes or identities. */
export async function listSellerReviewTasks(db: D1Database, actorId: string) {
  if (!await db.prepare("SELECT 1 FROM users u WHERE u.id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))").bind(actorId).first())
    throw new ReviewTaskConflict('Current account access is required.');
  const rows = (await db.prepare(`SELECT t.id,t.source_type AS sourceType,t.source_id AS sourceId,
    t.source_revision AS sourceRevision,t.started_at AS startedAt,t.due_at AS dueAt,t.has_deadline AS hasDeadline
    FROM review_tasks t WHERE
    (t.source_type='seller_application' AND EXISTS(SELECT 1 FROM seller_profiles s WHERE s.id=t.source_id AND s.user_id=?))
    OR (t.source_type='seller_document' AND EXISTS(SELECT 1 FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id WHERE d.id=t.source_id AND s.user_id=?))
    OR (t.source_type='document_change' AND EXISTS(SELECT 1 FROM seller_document_change_requests r
      JOIN seller_profiles s ON s.id=r.seller_id WHERE r.id=t.source_id AND s.user_id=?))
    OR (t.source_type='product_review' AND EXISTS(SELECT 1 FROM products p JOIN seller_profiles s ON s.id=p.seller_id
      WHERE p.id=t.source_id AND s.user_id=?))
    OR (t.source_type='protected_change' AND EXISTS(SELECT 1 FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id
      WHERE c.id=t.source_id AND s.user_id=?))
    OR (t.source_type='public_profile' AND EXISTS(SELECT 1 FROM seller_public_profile_revisions c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.case_id=t.source_id AND s.user_id=?))
    OR (t.source_type='public_profile_correction' AND EXISTS(SELECT 1 FROM seller_public_profile_corrections c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=t.source_id AND s.user_id=?))
    OR (t.source_type='commission_terms' AND EXISTS(SELECT 1 FROM commission_terms_cases c JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=t.source_id AND s.user_id=?))
    OR (t.source_type='product_priority' AND EXISTS(SELECT 1 FROM product_priority_cases c JOIN products p ON p.id=c.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE c.id=t.source_id AND s.user_id=?))
    OR (t.source_type IN ('product_intake_help','product_intake_review') AND EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id WHERE c.id=t.source_id AND d.owner_id=?)) ORDER BY t.due_at,t.id`)
    .bind(actorId,actorId,actorId,actorId,actorId,actorId,actorId,actorId,actorId,actorId).all<Pick<TaskRow, 'hasDeadline'| 'id'|'sourceType'|'sourceId'|'sourceRevision'|'startedAt'|'dueAt'>>()).results;
  const visible = [];
  for (const row of rows) {
    const current = await source(db, row.sourceType, row.sourceId);
    if (current.ownerId !== actorId) continue;
    const status = reviewTaskStatus(current,row.sourceRevision);
    const {hasDeadline,...publicRow}=row;
    visible.push({ ...publicRow,priority:current.priority??false,nextUpdateAt:current.nextUpdateAt??null,dueAt:current.hasDeadline===false?null:hasDeadline?row.dueAt:null,status,sourceStatus:current.status,triagedAt:current.triagedAt??null,
      title: row.sourceType==='product_priority'?'Priority product concern':row.sourceType==='product_intake_help'?'Product assistance':row.sourceType==='product_intake_review'?'Product candidate review':row.sourceType==='commission_terms'?'Selling fee acceptance':row.sourceType==='seller_application'?'Application review':row.sourceType==='seller_document'?'Identity or PAN review':row.sourceType.startsWith('public_profile')?'Public profile review':row.sourceType === 'document_change' ? 'Document change permission' : row.sourceType==='protected_change'?'Protected identity or bank review':'Product review',
      nextActor: ['awaiting_review','waiting_on_seller'].includes(status) ? current.nextActor??'Hastabazaar' : 'See the recorded outcome',
      href: row.sourceType==='product_priority'?`/seller/products/concerns/${encodeURIComponent(row.sourceId)}`:row.sourceType.startsWith('product_intake_')?`/seller/products/intakes/${encodeURIComponent(row.sourceId)}`:row.sourceType==='commission_terms'?'/seller#selling-fee-terms':['seller_application','seller_document'].includes(row.sourceType)?'/seller/registration':row.sourceType.startsWith('public_profile')?'/seller/profile':row.sourceType === 'document_change' ? `/seller/registration#request-${encodeURIComponent(row.sourceId)}` : row.sourceType==='protected_change'?`/seller/requests/changes/${encodeURIComponent(row.sourceId)}`:`/seller/products/${encodeURIComponent(row.sourceId)}/edit` });
  }
  return visible;
}

export type SellerReviewTask = Awaited<ReturnType<typeof listSellerReviewTasks>>[number];

async function nativeReviewOwnerStatements(db:D1Database,row:TaskRow,context:{actorId:string|null;requestId:string;now:number},ownerId:string|null){
 if(row.sourceType==='system_incident'){const domain=await import('../operations/incident-review');if(context.actorId===null)throw new ReviewTaskConflict('Use the actual incident coverage preparation.');return domain.prepareIncidentOwnerChangeStatements(db,{...context,actorId:context.actorId,expectedRevision:null},{incidentId:row.sourceId,ownerId,reason:'Shared review responsibility changed through its original guarded task'},{notify:false});}
 return [...(row.sourceType==='return_request'?[db.prepare('UPDATE return_handling SET owner_id=?,revision=revision+1 WHERE case_id=?').bind(ownerId,row.sourceId)]:[]),
 ...(row.sourceType==='complaint'?[db.prepare('UPDATE complaints SET assigned_to=?,followup_revision=followup_revision+1 WHERE id=?').bind(ownerId,row.sourceId)]:[]),
 ...(row.sourceType==='cancellation_review'?[db.prepare('UPDATE order_cancellation_reviews SET owner_id=?,revision=revision+1 WHERE id=?').bind(ownerId,row.sourceId),db.prepare("UPDATE order_fulfillment_holds SET owner_id=?,revision=revision+1 WHERE source_type='cancellation_review' AND source_id=? AND ended_at IS NULL").bind(ownerId,row.sourceId)]:[]),
 ...(row.sourceType==='order_response'?[db.prepare('UPDATE order_response_cases SET owner_id=?,revision=revision+1 WHERE id=?').bind(ownerId,row.sourceId)]:[]),
 ...(row.sourceType==='payment_exception'?[db.prepare('UPDATE manual_payment_exceptions SET owner_id=?,revision=revision+1,updated_at=? WHERE id=?').bind(ownerId,context.now,row.sourceId),...(context.actorId?[db.prepare('INSERT INTO manual_payment_exception_events(id,exception_id,revision,actor_id,owner_id,backup_id,state,note,next_update_at,created_at) SELECT ?,id,revision,?,owner_id,backup_id,state,?,next_update_at,? FROM manual_payment_exceptions WHERE id=?').bind(crypto.randomUUID(),context.actorId,'Shared task responsibility changed; original task receipt retains the reason',context.now,row.sourceId)]:[])]:[])];
}
export async function assignReviewTask(db:D1Database,context:CommandContext,input:{taskId:string;ownerId:string|null;reason:string}):Promise<void>{
 if(typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.length>1000)throw new ReviewTaskConflict('Explain the assignment in 10 to 1000 characters.');
 const row=await db.prepare(`SELECT ${columns} FROM review_tasks WHERE id=?`).bind(input.taskId).first<TaskRow>();if(!row)throw new ReviewTaskConflict('Review task is unavailable.');
 if(row.sourceType==='product_priority')throw new ReviewTaskConflict('Use the priority case to confirm owner, backup and the next update together.');
 const current=await source(db,row.sourceType,row.sourceId,context.now);if(current.assigneeOnlyId&&input.ownerId!==current.assigneeOnlyId)throw new ReviewTaskConflict('A version-specific personal acknowledgment remains with its exact assigned reader.');
 const actor=await authority(db,context.actorId,current),assignee=input.ownerId?await authority(db,input.ownerId,current,row.sourceType!=='team_governance'):null;
 const identity={action:'review_task.assigned',subjectType:'review_task',subjectId:row.id},receipt=await commandReceipt(db,context,identity,input);if(receipt.replayed)return;
 if(context.expectedRevision!==String(row.revision)||current.revision!==row.sourceRevision||!needsReview(current))throw new ReviewTaskConflict('Review source or assignment changed; refresh the task.');
 const {teamUserAvailable,teamAvailabilityGuards}=await import('../operations/team-governance'),availability:D1PreparedStatement[]=[];
 for(const id of [...(actor.role!=='super_admin'?[context.actorId]:[]),...(input.ownerId?[input.ownerId]:[])]){if(!await teamUserAvailable(db,id,context.now))throw new ReviewTaskConflict('The selected responder is currently unavailable.');availability.push(...teamAvailabilityGuards(db,id));}
 const previousOwnerId=current.initialReviewerId??row.ownerId,changed=previousOwnerId!==input.ownerId,assignment={taskId:row.id,revision:row.revision+(changed?1:0),ownerId:input.ownerId,previousOwnerId,sourceRevision:row.sourceRevision},result={...assignment,sourceType:row.sourceType,sourceId:row.sourceId,reason:input.reason.trim()},helper=await import('../operations/review-task-assignment-notices'),key=await helper.reviewAssignmentKey(context.actorId,context.requestId,row.id);
 const statements=[...actor.statements,...(assignee?.statements??[]),...availability,...guard(db,current.predicate,current.values),...guard(db,"EXISTS(SELECT 1 FROM review_tasks WHERE id=? AND revision=? AND source_revision=? AND COALESCE(owner_id,'')=?)",[row.id,row.revision,row.sourceRevision,row.ownerId??'']),
 ...(changed?await nativeReviewOwnerStatements(db,row,context,input.ownerId):[]),...(changed?[db.prepare('UPDATE review_tasks SET owner_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(input.ownerId,context.now,row.id,row.revision)]:[]),receipt.insert(result),...(changed?await helper.reviewTaskAssignmentNoticeStatements(db,{key,actorId:context.actorId,now:context.now,assignment}):[])];
 try{await db.batch(statements);}catch(error){const replay=await commandReceipt(db,context,identity,input);if(replay.replayed)return;throw error;}
}

export interface ReviewCoverageInput{taskId:string;formerOwnerId:string;now:number;requestId?:string;expectedSource?:{sourceType:string;sourceId:string;sourceRevision:string;startedAt:number;dueAt:number;calendarVersion:string};}
/** Internal maintenance only: no claimed staff role, permission, owner or clock is accepted from a request. */
export async function reconcileReviewTaskCoverage(db:D1Database,input:ReviewCoverageInput):Promise<{state:'settled'|'gap'|'stale';ownerId:string|null;changed:boolean}>{
 const row=await db.prepare(`SELECT ${columns} FROM review_tasks WHERE id=?`).bind(input.taskId).first<TaskRow>();if(!row)return{state:'stale',ownerId:null,changed:false};
 const expected=input.expectedSource;if(expected&&(['sourceType','sourceId','sourceRevision','startedAt','dueAt','calendarVersion']as const).some(key=>row[key]!==expected[key]))return{state:'stale',ownerId:row.ownerId,changed:false};
 const current=await source(db,row.sourceType,row.sourceId,input.now);if(current.revision!==row.sourceRevision||!needsReview(current))return{state:'stale',ownerId:null,changed:false};
 const {readTeamDutyCoverage,teamDutyCatalogue,teamUserAvailable,teamAvailabilityGuards}=await import('../operations/team-governance');
 // Company receiving-account decisions use the reserved bank roster; native authority/conflicts remain source-specific.
 const routingDuties=teamDutyCatalogue.filter(d=>row.sourceType==='company_account'?d.id==='identity_bank':d.permission===current.permission||d.permission===current.alternativePermission);
 const candidate=async(id:string|null)=>{if(!id||!await teamUserAvailable(db,id,input.now))return null;try{return await authority(db,id,current,row.sourceType!=='team_governance');}catch(error){if(error instanceof ReviewTaskConflict)return null;throw error;}};
 const nativeOwner=current.initialReviewerId??row.ownerId,existing=await candidate(nativeOwner);
 let handoffOwner:string|null=null;const handoffGuards:D1PreparedStatement[]=[];
 if(!current.assigneeOnlyId&&nativeOwner)for(const duty of routingDuties){
  const coverage=await readTeamDutyCoverage(db,duty.id,{now:input.now}),handoff=coverage.activeHandoff;
  if(handoff?.fromUserId===nativeOwner&&coverage.activeOwnerId===handoff.userId&&(row.sourceType!=='product_priority'||current.backupId===handoff.userId)&&await candidate(handoff.userId)){handoffOwner=handoff.userId;handoffGuards.push(...coverage.guards);break;}
 }
 if(existing&&row.ownerId===nativeOwner&&!handoffOwner){await db.batch([...existing.statements,...teamAvailabilityGuards(db,nativeOwner!),...guard(db,current.predicate,current.values),...guard(db,'EXISTS(SELECT 1 FROM review_tasks WHERE id=? AND revision=? AND owner_id=?)',[row.id,row.revision,nativeOwner])]);return{state:'settled',ownerId:nativeOwner,changed:false};}
 const coverageGuards:D1PreparedStatement[]=[];
 let ownerId:string|null=existing?nativeOwner:null,selected=existing,native:D1PreparedStatement[]=[],nativeChanged=false;
 if(handoffOwner){ownerId=handoffOwner;selected=await candidate(handoffOwner);coverageGuards.push(...handoffGuards);}
 const requestId=input.requestId??'review-coverage:'+await(await import('../operations/review-task-assignment-notices')).reviewAssignmentKey(null,String(row.revision),row.id);
 if(row.sourceType==='system_incident'){
  const prepared=await(await import('../operations/incident-review')).prepareIncidentCoverageChangeStatements(db,{incidentId:row.sourceId,now:input.now,requestId});if(prepared.state==='stale')return{state:'stale',ownerId:null,changed:false};ownerId=prepared.ownerId;native=prepared.statements;nativeChanged=prepared.changed;selected=ownerId?await candidate(ownerId):null;if(ownerId&&!selected)throw new ReviewTaskConflict('Incident coverage source changed during preparation.');
 }else if(current.assigneeOnlyId){ownerId=await candidate(current.assigneeOnlyId)?current.assigneeOnlyId:null;selected=ownerId?await candidate(ownerId):null;
 }else if(!ownerId){
  const ids=current.backupId?[current.backupId]:[];
  // Priority concerns retain their native named backup and promise; ordinary roster assignment cannot bypass that domain contract.
  if(row.sourceType!=='product_priority')for(const duty of routingDuties){const coverage=await readTeamDutyCoverage(db,duty.id,{now:input.now});coverageGuards.push(...coverage.guards);ids.push(...coverage.candidates.filter(c=>c.available&&c.eligible).map(c=>c.userId));}
  for(const id of new Set(ids)){const allowed=await candidate(id);if(allowed){ownerId=id;selected=allowed;break;}}
 }
 if(row.sourceType!=='system_incident'){native=await nativeReviewOwnerStatements(db,row,{actorId:null,requestId,now:input.now},ownerId);nativeChanged=(native.length>0||row.sourceType==='product_priority')&&current.initialReviewerId!==undefined&&current.initialReviewerId!==ownerId;}
 if(row.ownerId===ownerId&&!nativeChanged){await db.batch([...coverageGuards,...(selected?.statements??[]),...(ownerId?teamAvailabilityGuards(db,ownerId):[]),...guard(db,current.predicate,current.values),...guard(db,"EXISTS(SELECT 1 FROM review_tasks WHERE id=? AND revision=? AND source_revision=? AND COALESCE(owner_id,'')=?)",[row.id,row.revision,row.sourceRevision,row.ownerId??''])]);return{state:ownerId?'settled':'gap',ownerId,changed:false};}
 const priority=row.sourceType==='product_priority'?await db.prepare('SELECT id,product_id productId,revision,state,backup_id backupId,backup_unavailable_reason backupUnavailableReason,next_update_at nextUpdateAt,triaged_at triagedAt,last_event_id lastHumanEventId FROM product_priority_cases WHERE id=?').bind(row.sourceId).first<{id:string;productId:string;revision:number;state:string;backupId:string|null;backupUnavailableReason:string;nextUpdateAt:number|null;triagedAt:number|null;lastHumanEventId:string}>():null;
 const nativePriority=priority?{...priority,previousRevision:priority.revision,revision:priority.revision+1,backupId:priority.backupId===ownerId||ownerId===null?null:priority.backupId,backupUnavailableReason:priority.backupId===ownerId||ownerId===null?'Current coverage needs a separate eligible backup':priority.backupUnavailableReason}:null;
 const assignment={taskId:row.id,revision:row.revision+1,ownerId,previousOwnerId:row.ownerId??input.formerOwnerId,sourceRevision:row.sourceRevision},result={...assignment,sourceType:row.sourceType,sourceId:row.sourceId,reason:'Automatic responsibility reconciliation after current access or availability changed',system:true,...(nativePriority?{nativePriority}:{})},notice=await import('../operations/review-task-assignment-notices'),key=await notice.reviewAssignmentKey(null,requestId+':'+row.revision,row.id);
 const prior=await db.prepare("SELECT command_result_json result FROM audit_logs WHERE command_key=? AND action='review_task.coverage_rerouted'").bind(key).first<{result:string}>();if(prior){const saved=JSON.parse(prior.result)as{ownerId:string|null;sourceRevision:string};if(saved.ownerId===row.ownerId&&saved.sourceRevision===row.sourceRevision)return{state:row.ownerId?'settled':'gap',ownerId:row.ownerId,changed:false};throw new ReviewTaskConflict('The recorded reconciliation does not match committed ownership.');}
 const receipt=db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at,command_key,command_digest,command_result_json) VALUES(?,NULL,'review_task.coverage_rerouted','review_task',?,?,?,?,?,?)").bind(crypto.randomUUID(),row.id,requestId,input.now,key,key,JSON.stringify(result));
 await db.batch([...coverageGuards,...(selected?.statements??[]),...(ownerId?teamAvailabilityGuards(db,ownerId):[]),...guard(db,current.predicate,current.values),...guard(db,"EXISTS(SELECT 1 FROM review_tasks WHERE id=? AND revision=? AND source_revision=? AND COALESCE(owner_id,'')=?)",[row.id,row.revision,row.sourceRevision,row.ownerId??'']),...native,db.prepare('UPDATE review_tasks SET owner_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(ownerId,input.now,row.id,row.revision),receipt,...(nativePriority?[db.prepare('UPDATE product_priority_cases SET backup_id=?,backup_unavailable_reason=?,revision=?,updated_at=? WHERE id=? AND revision=?').bind(nativePriority.backupId,nativePriority.backupUnavailableReason,nativePriority.revision,input.now,row.sourceId,nativePriority.previousRevision)]:[]),...await notice.reviewTaskAssignmentNoticeStatements(db,{key,actorId:null,now:input.now,assignment})]);
 return{state:ownerId?'settled':'gap',ownerId,changed:true};
}
/** Read through native authority; maintenance never impersonates a financial actor. */
export async function reviewTaskAssignmentHistory(db:D1Database,actorId:string,taskId:string){const row=await db.prepare(`SELECT ${columns} FROM review_tasks WHERE id=?`).bind(taskId).first<TaskRow>();if(!row)throw new ReviewTaskConflict('Review task is unavailable.');const current=await source(db,row.sourceType,row.sourceId);const allowed=await authority(db,actorId,current);const result=await db.prepare("SELECT id,actor_id actorId,action,command_result_json resultJson,created_at occurredAt FROM audit_logs WHERE subject_type='review_task' AND subject_id=? AND action IN('review_task.assigned','review_task.coverage_rerouted') ORDER BY created_at,id LIMIT 100").bind(taskId).all<{id:string;actorId:string|null;action:string;resultJson:string;occurredAt:number}>();await db.batch([...allowed.statements,...guard(db,current.predicate,current.values)]);return result.results.map(event=>{const result=JSON.parse(event.resultJson)as{ownerId?:string|null;previousOwnerId?:string|null;reason?:string;system?:boolean};return{id:event.id,actorId:event.actorId,system:event.actorId===null,action:event.action,ownerId:result.ownerId??null,previousOwnerId:result.previousOwnerId??null,reason:result.reason??'Assignment changed',occurredAt:event.occurredAt};});}
