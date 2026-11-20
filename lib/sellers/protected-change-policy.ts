import {legacyProtectedRequestGapSql} from './legacy-protected-state';
import { commandReceipt } from '../workflows/contracts';
import {nativeCommandProvenance} from '../operations/native-form-health';
import {protectedAdminAuthority,protectedAdminProof,protectedAdminCasePreflight} from './protected-admin-recovery';
import {protectedChangeEvent,protectedChangeNotice} from './protected-change-events';
import {recoveryPayoutReadySql} from '../payments/recovery-payout-policy';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';

export class ProtectedChangeError extends Error {constructor(message:string,readonly status=409){super(message);}}
export type ProtectedCapability='new_orders'|'payouts';
export function verifiedIdentitySql(sellerExpression:string,now:number) {
  if(!Number.isSafeInteger(now)||now<0)throw new Error('Invalid identity evidence lookup.');
  return identityEvidenceAtSql(sellerExpression,String(now));
}
export function verifiedIdentityAtCommitSql(db:D1Database,sellerExpression:string){return identityEvidenceAtSql(sellerExpression,checkoutCommitClock(db));}
function identityEvidenceAtSql(sellerExpression:string,now:string){
  if(!/^(?:\?|[a-z_]+\.[a-z_]+)$/.test(sellerExpression))throw new Error('Invalid identity evidence lookup.');
  const proof=(kind:string)=>`EXISTS(SELECT 1 FROM seller_documents proof WHERE proof.seller_id=identity_seller.id AND ${kind}
    AND proof.status='verified' AND proof.reviewed_by IS NOT NULL AND proof.reviewed_at IS NOT NULL AND (proof.valid_until IS NULL OR proof.valid_until>${now})
    AND NOT EXISTS(SELECT 1 FROM seller_documents later WHERE later.seller_id=proof.seller_id AND later.kind=proof.kind AND later.status='verified'
      AND (later.uploaded_at>proof.uploaded_at OR later.uploaded_at=proof.uploaded_at AND later.id>proof.id)))`;
  return `EXISTS(SELECT 1 FROM seller_profiles identity_seller WHERE identity_seller.id=${sellerExpression} AND trim(identity_seller.legal_name)<>''
    AND ${proof("proof.kind IN ('representative_identity','pan_certificate')")}
    AND (identity_seller.tax_mode='NONE' OR ${proof("proof.kind='pan_certificate'")})
    AND (identity_seller.applicant_type='individual' OR identity_seller.applicant_type='company' AND ${proof("proof.kind='business_registration'")}))`;
}
export function noProtectedHoldSql(sellerExpression:string,capability:ProtectedCapability) {
  if(!/^(?:\?|[a-z_]+\.[a-z_]+)$/.test(sellerExpression))throw new Error('Invalid protected capability source.');
  return `NOT EXISTS(SELECT 1 FROM seller_profiles protected_owner WHERE protected_owner.id=${sellerExpression} AND (
    EXISTS(SELECT 1 FROM seller_capability_holds protected_hold WHERE protected_hold.seller_id=protected_owner.id AND protected_hold.capability='${capability}' AND protected_hold.released_at IS NULL)
    OR ${legacyProtectedRequestGapSql('protected_owner.id',capability==='new_orders')}))`;
}
/** Internal recovery uses accepted terms and the same verified legal identity, not a payout beneficiary. */
export function noRecoveryIdentityHoldSql(sellerExpression:string) {
  if(!/^(?:\?|[a-z_]+\.[a-z_]+)$/.test(sellerExpression))throw new Error('Invalid recovery identity source.');
  return `NOT EXISTS(SELECT 1 FROM seller_profiles recovery_owner WHERE recovery_owner.id=${sellerExpression} AND (
    EXISTS(SELECT 1 FROM seller_capability_holds recovery_hold LEFT JOIN seller_protected_change_cases recovery_change ON recovery_change.id=recovery_hold.case_id AND recovery_change.seller_id=recovery_hold.seller_id
    WHERE recovery_hold.seller_id=recovery_owner.id AND recovery_hold.released_at IS NULL AND (recovery_change.id IS NULL OR recovery_change.kind<>'bank' OR recovery_change.classification<>'bank'))
    OR ${legacyProtectedRequestGapSql('recovery_owner.id',true)}))`;
}
export function protectedGuard(db:D1Database,predicate:string,values:unknown[]) {
  const id=crypto.randomUUID();return[db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}
export function protectedPayoutGuards(db:D1Database,sellerId:string,actorId:string,payout?:{id?:string;model:'registered'|'managed'|'fixed';recordKind?:'live'}) {
  // Keep the same predicates atomic while avoiding native D1's expression
  // depth limit when recovery readiness expands its retained source proofs.
  const recovery=recoveryPayoutReadySql('?',payout?.model??'registered',payout?.recordKind);
  return [...protectedGuard(db,noProtectedHoldSql('?','payouts'),[sellerId]),
    ...protectedGuard(db,'EXISTS(SELECT 1 FROM seller_profiles source_seller WHERE source_seller.id=? AND source_seller.user_id<>?)',[sellerId,actorId]),
    ...protectedGuard(db,recovery,Array.from({length:(recovery.match(/\?/g)??[]).length},()=>sellerId)),
    ...(payout?.id?protectedGuard(db,'NOT EXISTS(SELECT 1 FROM seller_payout_review_blocks WHERE payout_model=? AND payout_id=?)',[payout.model,payout.id]):[])];
}
/** Append in the source submission transaction. Existing packets retain their original facts and reservations. */
export function protectedCaseHoldStatements(db:D1Database,caseId:string,now:number) {
  const statements:D1PreparedStatement[]=[];
  for(const capability of ['new_orders','payouts'] as const)statements.push(db.prepare(`INSERT INTO seller_capability_holds(id,case_id,seller_id,capability,reason,created_at)
    SELECT ?,c.id,c.seller_id,?,c.reason,? FROM seller_protected_change_cases c WHERE c.id=?
      AND NOT(c.kind='identity' AND c.classification='identity_evidence_only')
      ${capability==='new_orders'?"AND (c.kind='identity' OR c.invalid_current=1 AND EXISTS(SELECT 1 FROM seller_participation_profiles route WHERE route.seller_id=c.seller_id AND route.participation_route='managed_maker'))":''}
      AND NOT EXISTS(SELECT 1 FROM seller_capability_holds h WHERE h.case_id=c.id AND h.capability=? AND h.released_at IS NULL)`)
    .bind(crypto.randomUUID(),capability,now,caseId,capability));
  for(const [table,model] of [['payouts','registered'],['managed_payouts','managed']] as const)statements.push(db.prepare(`INSERT OR IGNORE INTO seller_payout_review_blocks
    (payout_model,payout_id,case_id,disposition,original_status,original_destination,original_amount_paisa,created_at)
    SELECT ?,p.id,c.id,CASE WHEN p.status IN ('processing','failed') THEN 'reconcile' ELSE 'reprepare' END,p.status,p.destination_reference,p.amount_paisa,?
    FROM ${table} p JOIN seller_protected_change_cases c ON c.seller_id=p.seller_id
    WHERE c.id=? AND p.status IN ('prepared','scheduled','approved','processing','failed')`).bind(model,now,caseId));
  statements.push(db.prepare(`INSERT OR IGNORE INTO seller_payout_review_blocks
    (payout_model,payout_id,case_id,disposition,original_status,original_destination,original_amount_paisa,created_at)
    SELECT 'fixed',p.id,c.id,CASE WHEN p.status='failed' OR EXISTS(SELECT 1 FROM payout_transfer_packets execution WHERE execution.supplier_payment_id=p.id AND execution.state IN('processing','uncertain')) THEN 'reconcile' ELSE 'reprepare' END,p.status,p.destination_reference,p.amount_paisa,?
    FROM managed_supplier_payments p JOIN managed_supplier_obligations o ON o.id=p.obligation_id JOIN seller_protected_change_cases c ON c.seller_id=o.seller_id
    WHERE c.id=? AND p.status IN ('prepared','approved','failed')`).bind(now,caseId));
  return statements;
}
export function documentProtectedCaseStatements(db:D1Database,requestId:string,now:number) {
  return [db.prepare(`INSERT INTO seller_protected_change_cases(id,seller_id,kind,classification,source_request_id,source_document_id,
    original_identity_revision,original_bank_reference,scope_json,requested_by,reason,requested_at,updated_at,operation_request_id)
    SELECT r.id,r.seller_id,CASE WHEN d.kind='bank_verification' THEN 'bank' ELSE 'identity' END,
      CASE WHEN d.kind='bank_verification' THEN 'bank' ELSE 'unclassified' END,r.id,d.id,v.identity_revision,s.payout_account_reference,
      json_array(d.kind),r.requested_by,r.reason,r.requested_at,?,r.operation_request_id
    FROM seller_document_change_requests r JOIN seller_documents d ON d.id=r.document_id JOIN seller_profiles s ON s.id=r.seller_id
      JOIN seller_protected_revisions v ON v.seller_id=s.id WHERE r.id=?`).bind(now,requestId),...protectedCaseHoldStatements(db,requestId,now)];
}
export async function protectedCapabilityState(db:D1Database,sellerId:string) {
  const rows=(await db.prepare(`SELECT h.id,h.case_id AS caseId,h.capability,h.reason,h.created_at AS startedAt,
    c.kind,c.classification,c.status,c.version,c.operation_request_id AS operationId FROM seller_capability_holds h
    JOIN seller_protected_change_cases c ON c.id=h.case_id WHERE h.seller_id=? AND h.released_at IS NULL ORDER BY h.created_at,h.id`)
    .bind(sellerId).all<{id:string;caseId:string;capability:ProtectedCapability;reason:string;startedAt:number;kind:string;classification:string;status:string;version:number;operationId:string}>()).results;
  const legacy=await db.prepare(`SELECT CASE WHEN ${legacyProtectedRequestGapSql('legacy_owner.id',true)} THEN 1 ELSE 0 END AS identityGap,CASE WHEN ${legacyProtectedRequestGapSql('legacy_owner.id')} THEN 1 ELSE 0 END AS anyGap FROM seller_profiles legacy_owner WHERE legacy_owner.id=?`).bind(sellerId).first<{identityGap:number;anyGap:number}>();
  return {holds:rows,legacyUnlinked:Number(legacy?.anyGap??0)>0,newOrdersHeld:rows.some(row=>row.capability==='new_orders')||Number(legacy?.identityGap??0)>0,payoutsHeld:rows.some(row=>row.capability==='payouts')||Number(legacy?.anyGap??0)>0};
}
/** A human evidence decision, never inferred from matching text or a seller-selected label. */
export async function classifyIdentityEvidenceOnly(db:D1Database,input:{caseId:string;actorId:string;actorAuthSubject?:string|null;expectedVersion:number;currentEvidenceValid:boolean;factsUnchanged:boolean;evidenceReference:string;reason:string;requestId:string;now:number}) {
  if(!input.currentEvidenceValid||!input.factsUnchanged||input.evidenceReference.trim().length<4||input.reason.trim().length<8)
    throw new ProtectedChangeError('Inspect current evidence and record unchanged facts, continuing validity and the review reference.',400);
  const authority=await protectedAdminAuthority(db,input);
  const receipt=await commandReceipt(db,{actorId:input.actorId,requestId:input.requestId,expectedRevision:String(input.expectedVersion),now:input.now},
    {action:'seller.protected_change.evidence_only',subjectType:'seller_protected_change',subjectId:input.caseId},
    {currentEvidenceValid:input.currentEvidenceValid,factsUnchanged:input.factsUnchanged,evidenceReference:input.evidenceReference.trim(),reason:input.reason.trim()},
    await nativeCommandProvenance(db,'seller.protected_change.evidence_only',String(input.expectedVersion)));
  if(receipt.replayed)return;
  await protectedAdminCasePreflight(db,input);
  const source=await db.prepare('SELECT source_request_id AS sourceRequestId FROM seller_protected_change_cases WHERE id=?').bind(input.caseId).first<{sourceRequestId:string|null}>();
  if(!source)throw new ProtectedChangeError('Protected change not found.',404);
  await db.batch([...authority.statements,...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id
    JOIN users u ON u.id=s.user_id JOIN seller_protected_revisions v ON v.seller_id=c.seller_id JOIN seller_documents d ON d.id=c.source_document_id
    WHERE c.id=? AND c.kind='identity' AND c.status='open' AND c.version=? AND c.invalid_current=0 AND c.proposed_json IS NULL
      AND s.user_id<>? AND u.status='active' AND v.identity_revision=c.original_identity_revision AND d.status='verified' AND ${verifiedIdentitySql('s.id',input.now)}
      AND d.reviewed_by IS NOT NULL AND d.reviewed_at IS NOT NULL AND (d.valid_until IS NULL OR d.valid_until>?)
      AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind AND newer.status='verified'
        AND (newer.uploaded_at>d.uploaded_at OR (newer.uploaded_at=d.uploaded_at AND newer.id>d.id))))`,[input.caseId,input.expectedVersion,input.actorId,input.now]),
    db.prepare(`UPDATE seller_protected_change_cases SET classification='identity_evidence_only',version=version+1,reviewed_by=?,reviewed_at=?,review_reason=?,evidence_reference=?,operation_request_id=?,updated_at=? WHERE id=?`)
      .bind(input.actorId,input.now,input.reason.trim(),input.evidenceReference.trim(),input.requestId,input.now,input.caseId),
    db.prepare(`UPDATE seller_capability_holds SET released_at=?,released_by=?,release_reason=?,release_request_id=? WHERE case_id=? AND released_at IS NULL`)
      .bind(input.now,input.actorId,input.reason.trim(),input.requestId,input.caseId),
    protectedChangeEvent(db,input,input.caseId,'evidence_only_classified',input.reason.trim(),{currentEvidenceValid:true,factsUnchanged:true,evidenceReference:input.evidenceReference.trim()}),
    ...await protectedChangeNotice(db,input.caseId,source.sourceRequestId,input.requestId,input),
    ...protectedAdminProof(db,input,{action:'seller.protected_change.evidence_only',subjectType:'seller_protected_change',subjectId:input.caseId},String(input.expectedVersion),
      {currentEvidenceValid:input.currentEvidenceValid,factsUnchanged:input.factsUnchanged,evidenceReference:input.evidenceReference.trim(),reason:input.reason.trim()},
      {caseId:input.caseId,classification:'identity_evidence_only'},input.caseId),receipt.insert({caseId:input.caseId,classification:'identity_evidence_only'})]);
}
