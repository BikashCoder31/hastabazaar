import {ProtectedAdminBeforeWriteError,protectedAdminCasePreflight} from './protected-admin-recovery';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {getEffectiveBusinessSetting} from '../db/repositories/business-settings';
import {getCommissionSetting} from '../db/repositories/marketplace-settings';
import {getSellerCommissionTerms,getCommissionCheckoutAcceptance,commissionCheckoutGuards} from '../db/repositories/commission-rates';
import {getAcceptedManagedTerms,acceptedManagedTermsGuards} from '../managed-commerce/accepted-terms';
import {publicProductEligibility} from '../products/eligibility';
import {ProtectedChangeError,protectedGuard,verifiedIdentitySql,type ProtectedCapability} from './protected-change-policy';
import {protectedOwner,protectedOwnerGuards,protectedCommand,protectedChangeEvent,protectedChangeNotice} from './protected-change-requests';
type Command={actorId:string;actorAuthSubject?:string|null;requestId:string;now:number};
function explanation(reason:string,reference:string){const text=reason.trim(),evidence=reference.trim();if(text.length<10||text.length>1000||evidence.length<4||evidence.length>191)
  throw new ProtectedChangeError('Record an evidence reference and a reason with the next action.',400);return{reason:text,reference:evidence};}
async function source(db:D1Database,id:string){const row=await db.prepare(`SELECT c.seller_id AS sellerId,c.source_request_id AS sourceRequestId,c.kind,c.status,
  COALESCE(p.participation_route,'registered_seller') AS route FROM seller_protected_change_cases c LEFT JOIN seller_participation_profiles p ON p.seller_id=c.seller_id WHERE c.id=?`)
  .bind(id).first<{sellerId:string;sourceRequestId:string|null;kind:string;status:string;route:string}>();if(!row)throw new ProtectedChangeError('Protected change not found.',404);return row;}
/** Current private bank facts must have an actual ownership decision tied to current identity. */
function currentBankSql(now:number){return `EXISTS(SELECT 1 FROM seller_profiles bank_seller JOIN seller_protected_revisions bank_revision ON bank_revision.seller_id=bank_seller.id
  JOIN seller_beneficiary_versions bank_version ON bank_seller.payout_account_reference='BENEFICIARY:'||bank_version.id AND bank_version.seller_id=bank_seller.id
  JOIN seller_documents bank_document ON bank_document.id=bank_version.document_id AND bank_document.seller_id=bank_seller.id
  WHERE bank_seller.id=? AND bank_version.identity_revision=bank_revision.identity_revision AND bank_version.verified_by IS NOT NULL AND bank_version.verified_at<=${now}
    AND bank_document.kind='bank_verification' AND bank_document.status='verified' AND (bank_document.valid_until IS NULL OR bank_document.valid_until>${now}))`;}
async function orderReadinessGuards(db:D1Database,sellerId:string,route:string,now:number){
  if(route==='managed_maker'){
    const [mode,model,terms]=await Promise.all([getEffectiveBusinessSetting(db,'managed_maker_program_mode',now),getEffectiveBusinessSetting(db,'managed_maker_active_model',now),getAcceptedManagedTerms(db,sellerId,now)]);
    if(mode.value!=='activation_enabled'||!model.value||!terms)throw new ProtectedChangeError('Current program, commercial model and accepted terms must be ready before restoring new orders.');
    return [...acceptedManagedTermsGuards(db,terms,now),...protectedGuard(db,'EXISTS(SELECT 1 FROM seller_participation_profiles WHERE seller_id=? AND commercial_model=?)',[sellerId,model.value]),
      ...[mode,model].flatMap(setting=>protectedGuard(db,`COALESCE((SELECT id FROM business_setting_versions WHERE setting_key=? AND status='published' AND effective_from<=?
        AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=?`,[setting.key,now,now,setting.versionId??'']))];
  }
  const setting=await getCommissionSetting(db,now),terms=await getSellerCommissionTerms(db,sellerId,now),acceptance=await getCommissionCheckoutAcceptance(db,sellerId,setting,now);
  if(!acceptance)throw new ProtectedChangeError('Current seller terms need their separate acceptance before new orders can resume.');
  return commissionCheckoutGuards(db,{[sellerId]:terms},setting,{[sellerId]:acceptance},now);
}
export async function withdrawProtectedChange(db:D1Database,input:Command&{caseId:string;expectedVersion:number;reason:string}){
  const current=await source(db,input.caseId);await protectedOwner(db,current.sellerId,input.actorId);
  const reason=explanation(input.reason,'OWNER-WITHDRAWAL').reason;
  const command=await protectedCommand(db,input,'withdrawn',input.caseId,String(input.expectedVersion),{reason});if(command.receipt.replayed)return;
  const eventId=crypto.randomUUID();await command.commit([...protectedOwnerGuards(db,current.sellerId,input.actorId),
    ...protectedGuard(db,"EXISTS(SELECT 1 FROM seller_protected_change_cases WHERE id=? AND version=? AND status IN ('open','rejected'))",[input.caseId,input.expectedVersion]),
    db.prepare("UPDATE seller_protected_change_cases SET status='withdrawn',active_permission_id=NULL,version=version+1,operation_request_id=?,updated_at=? WHERE id=?").bind(eventId,input.now,input.caseId),
    ...(current.sourceRequestId?[db.prepare("UPDATE seller_document_change_requests SET status='rejected',active_permission_id=NULL WHERE id=?").bind(current.sourceRequestId)]:[]),
    protectedChangeEvent(db,input,input.caseId,'withdrawn',reason,{holdsRetained:true}),...await protectedChangeNotice(db,input.caseId,current.sourceRequestId,eventId,input),
  ],input.caseId);
}
export async function disposeProtectedHolds(db:D1Database,input:Command&{caseId:string;expectedVersion:number;expectedIdentityRevision:number;expectedBankRevision:number;
  release:boolean;capabilities:readonly ProtectedCapability[];currentEvidenceValidConfirmed:boolean;bankOwnershipConfirmed:boolean;evidenceReference:string;reason:string}){
  const {reason,reference}=explanation(input.reason,input.evidenceReference),capabilities=[...new Set(input.capabilities)].sort();
  if(typeof input.release!=='boolean'||!capabilities.length||capabilities.length!==input.capabilities.length||capabilities.some(value=>!['new_orders','payouts'].includes(value))
    ||input.release&&input.currentEvidenceValidConfirmed!==true)throw new ProtectedAdminBeforeWriteError('Choose exact hold scopes and explicitly inspect current valid evidence before release.',400);
  const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',ProtectedChangeError,'super_admin');
  const command=await protectedCommand(db,input,'hold_disposition',input.caseId,String(input.expectedVersion),{reason,reference,release:input.release,capabilities,
    currentEvidenceValidConfirmed:input.currentEvidenceValidConfirmed,bankOwnershipConfirmed:input.bankOwnershipConfirmed,identityRevision:input.expectedIdentityRevision,bankRevision:input.expectedBankRevision});
  if(command.receipt.replayed)return;
  await protectedAdminCasePreflight(db,input);
  const current=await source(db,input.caseId),needsBank=capabilities.includes('payouts')||current.route==='managed_maker',eventId=crypto.randomUUID();
  if(input.release&&needsBank&&!input.bankOwnershipConfirmed)throw new ProtectedAdminBeforeWriteError('Inspect the current account ownership before releasing this hold.',400);
  const statements=[...authority.statements,...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id
    JOIN users u ON u.id=s.user_id JOIN seller_protected_revisions v ON v.seller_id=s.id WHERE c.id=? AND c.version=? AND s.user_id<>? AND u.status='active'
      AND v.identity_revision=? AND v.bank_revision=? ${input.release?"AND c.status IN ('verified','rejected','withdrawn','closed') AND (c.kind<>'bank' OR c.invalid_current=0 OR COALESCE(s.payout_account_reference,'')<>COALESCE(c.original_bank_reference,''))":''})`,
    [input.caseId,input.expectedVersion,input.actorId,input.expectedIdentityRevision,input.expectedBankRevision])];
  if(input.release){statements.push(...protectedGuard(db,verifiedIdentitySql('?',input.now),[current.sellerId]));
    if(needsBank)statements.push(...protectedGuard(db,currentBankSql(input.now),[current.sellerId]));
    if(capabilities.includes('new_orders'))statements.push(...await orderReadinessGuards(db,current.sellerId,current.route,input.now));
    for(const capability of capabilities)statements.push(...protectedGuard(db,'EXISTS(SELECT 1 FROM seller_capability_holds WHERE case_id=? AND capability=? AND released_at IS NULL)',[input.caseId,capability]),
      db.prepare('UPDATE seller_capability_holds SET released_at=?,released_by=?,release_reason=?,release_request_id=? WHERE case_id=? AND capability=? AND released_at IS NULL')
        .bind(input.now,input.actorId,reason,input.requestId,input.caseId,capability));
    if(capabilities.includes('new_orders'))statements.push(...protectedGuard(db,`EXISTS(SELECT 1 FROM products restoration_product WHERE restoration_product.seller_id=? AND ${publicProductEligibility('restoration_product',input.now)})`,[current.sellerId]));
  }
  statements.push(db.prepare(`UPDATE seller_protected_change_cases SET version=version+1,reviewed_by=?,reviewed_at=?,review_reason=?,evidence_reference=?,operation_request_id=?,updated_at=? WHERE id=?`)
    .bind(input.actorId,input.now,reason,reference,eventId,input.now,input.caseId),
    db.prepare(`UPDATE review_tasks SET owner_id=?,revision=revision+1,updated_at=? WHERE source_id=? AND source_type IN ('protected_change','document_change')
      AND (owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=review_tasks.owner_id AND u.status='active' AND r.role='super_admin'))`)
      .bind(input.actorId,input.now,input.caseId),
    protectedChangeEvent(db,input,input.caseId,input.release?'holds_released':'holds_retained',reason,{capabilities,verificationReference:reference,identityRevision:input.expectedIdentityRevision,bankRevision:input.expectedBankRevision}),
    ...await protectedChangeNotice(db,input.caseId,current.sourceRequestId,eventId,input));
  await command.commit(statements,{caseId:input.caseId,released:input.release?capabilities:[]});
}

/** Revalidation creates a new reviewed current version; old packet destinations stay unchanged. */
export async function revalidateCurrentBankAfterIdentity(db:D1Database,input:Command&{caseId:string;expectedVersion:number;expectedIdentityRevision:number;expectedBankRevision:number;
  ownershipConfirmed:boolean;ownershipBasis:'same_person'|'same_legal_entity';evidenceReference:string;reason:string}){
  const {reason,reference}=explanation(input.reason,input.evidenceReference);if(!input.ownershipConfirmed||!['same_person','same_legal_entity'].includes(input.ownershipBasis))
    throw new ProtectedChangeError('Inspect actual current beneficiary ownership and identity.',400);
  const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',ProtectedChangeError,'super_admin');
  const command=await protectedCommand(db,input,'bank_revalidated',input.caseId,String(input.expectedVersion),{identityRevision:input.expectedIdentityRevision,bankRevision:input.expectedBankRevision,ownershipConfirmed:true,ownershipBasis:input.ownershipBasis,reason,reference});
  if(command.receipt.replayed)return;
  await protectedAdminCasePreflight(db,input);
  const current=await source(db,input.caseId),eventId=crypto.randomUUID(),id=crypto.randomUUID(),destination=`BENEFICIARY:${id}`;
  await command.commit([...authority.statements,...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id
    JOIN seller_protected_revisions v ON v.seller_id=s.id JOIN users u ON u.id=s.user_id
    JOIN seller_beneficiary_versions old ON s.payout_account_reference='BENEFICIARY:'||old.id AND old.seller_id=s.id JOIN seller_documents d ON d.id=old.document_id
    WHERE c.id=? AND c.kind='identity' AND c.status IN ('verified','rejected','withdrawn','closed') AND c.version=? AND s.user_id<>? AND u.status='active'
      AND v.identity_revision=? AND v.bank_revision=? AND d.seller_id=s.id AND d.kind='bank_verification' AND d.status='verified' AND (d.valid_until IS NULL OR d.valid_until>?)
      AND ((s.applicant_type='individual' AND ?='same_person') OR (s.applicant_type='company' AND ?='same_legal_entity')))
    AND ${verifiedIdentitySql('?',input.now)} AND NOT EXISTS(SELECT 1 FROM seller_protected_change_cases unresolved JOIN seller_capability_holds h ON h.case_id=unresolved.id
      WHERE unresolved.seller_id=? AND unresolved.id<>? AND h.released_at IS NULL AND (unresolved.kind='bank' AND unresolved.invalid_current=1 AND unresolved.status<>'verified' OR unresolved.kind='identity' AND unresolved.status='open' AND unresolved.classification<>'identity_evidence_only'))`,
    [input.caseId,input.expectedVersion,input.actorId,input.expectedIdentityRevision,input.expectedBankRevision,input.now,input.ownershipBasis,input.ownershipBasis,current.sellerId,current.sellerId,input.caseId]),
    db.prepare(`INSERT INTO seller_beneficiary_versions(id,seller_id,case_id,document_id,details_json,identity_revision,ownership_basis,verification_reference,review_reason,verified_by,verified_at)
      SELECT ?,s.id,?,old.document_id,old.details_json,?,?,?,?,?,? FROM seller_profiles s JOIN seller_beneficiary_versions old ON s.payout_account_reference='BENEFICIARY:'||old.id WHERE s.id=?`)
      .bind(id,input.caseId,input.expectedIdentityRevision,input.ownershipBasis,reference,reason,input.actorId,input.now,current.sellerId),
    db.prepare('UPDATE seller_profiles SET payout_account_reference=?,updated_at=? WHERE id=?').bind(destination,input.now,current.sellerId),
    db.prepare(`UPDATE seller_participation_profiles SET payout_beneficiary_reference=?,version=version+1,updated_at=? WHERE seller_id=? AND payout_beneficiary_reference IS NOT NULL AND instr(payout_beneficiary_reference,'PENDING VERIFICATION:')<>1`)
      .bind(destination,input.now,current.sellerId),
    db.prepare('UPDATE seller_protected_change_cases SET version=version+1,operation_request_id=?,updated_at=? WHERE id=?').bind(eventId,input.now,input.caseId),
    protectedChangeEvent(db,input,input.caseId,'bank_revalidated',reason,{beneficiaryVersionId:id,identityRevision:input.expectedIdentityRevision,verificationReference:reference,holdsRetained:true}),
    ...await protectedChangeNotice(db,input.caseId,current.sourceRequestId,eventId,input),
  ],{beneficiaryVersionId:id});
}
