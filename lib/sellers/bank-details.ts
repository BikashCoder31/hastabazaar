import { digestFormRequest } from '@/lib/forms/submission';
import {currentBankReadiness} from './bank-readiness';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { isPendingPayoutReference, PENDING_PAYOUT_PREFIX } from './onboarding';
import type { SellerApplicationDocument } from './application';
import { commandReceipt } from '../workflows/contracts';
import {protectedAdminAuthority,protectedAdminProof,ProtectedAdminBeforeWriteError} from './protected-admin-recovery';
import { protectedCaseHoldStatements, protectedGuard, verifiedIdentitySql } from './protected-change-policy';
import { calculateServiceDueAt, CONTINUOUS_CALENDAR_VERSION } from '../workflows/service-clock';
import { operationalBusinessNotificationStatements } from '../operations/business-notifications';
import { currentProtectedPermission,protectedOwnerGuards,protectedChangeEvent,protectedChangeNotice } from './protected-change-requests';

export class SellerBankError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
export type BankDetails = { payoutBeneficiary: string; bankName: string; bankBranch: string; bankAccountNumber: string };
export function parseBankDetails(raw: Record<string, unknown>): BankDetails {
  const result = {} as BankDetails;
  for (const key of ['payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber'] as const) {
    const value = raw[key];
    if (typeof value !== 'string' || value.trim().length < 3 || value.length > 160 || /[\p{Cc}<>]/u.test(value))
      throw new SellerBankError('Enter the beneficiary, bank, branch and account number.', 400);
    result[key] = value.trim();
  }
  if (!/^[A-Za-z0-9 -]{4,40}$/.test(result.bankAccountNumber)) throw new SellerBankError('Enter a valid bank account number (4–40 characters).', 400);
  return result;
}
export async function sellerBankState(db: D1Database, sellerId: string,caseId?:string,now=Date.now()) {
  const row = await db.prepare(`SELECT s.user_id AS ownerId,s.payout_account_reference AS reference,v.identity_revision AS identityRevision,v.bank_revision AS bankRevision
    FROM seller_profiles s JOIN seller_protected_revisions v ON v.seller_id=s.id WHERE s.id=?`).bind(sellerId).first<{ownerId:string; reference: string | null;identityRevision:number;bankRevision:number }>();
  if (!row) throw new SellerBankError('Seller application not found.', 404);
  const change=await db.prepare(`SELECT id,status,version,proposed_json AS proposedJson,replacement_document_id AS documentId,source_document_id AS originalDocumentId,
    source_request_id AS sourceRequestId,original_bank_reference AS originalReference,active_permission_id AS permissionId FROM seller_protected_change_cases
    WHERE seller_id=? AND kind='bank' ${caseId?'AND id=?':"AND status<>'closed'"} ORDER BY requested_at DESC,id DESC LIMIT 1`).bind(sellerId,...(caseId?[caseId]:[]))
    .first<{id:string;status:string;version:number;proposedJson:string|null;documentId:string|null;originalDocumentId:string|null;sourceRequestId:string|null;originalReference:string|null;permissionId:string|null}>();
  if(caseId&&!change)throw new SellerBankError('Bank change not found.',404);
  const readiness=await currentBankReadiness(db,sellerId,row.reference,row.identityRevision,row.ownerId,now);
  return { status:readiness.status,
    revision: await digestFormRequest({sellerId,...row,caseId:change?.id??null,caseVersion:change?.version??null}), reference: row.reference,change,
    identityRevision:row.identityRevision,bankRevision:row.bankRevision };
}
/** Full details have their own current-authority check and access receipt; normal queues use references. */
export async function privateBankWorkspace(db:D1Database,sellerId:string,actorId:string,audience:'staff'|'owner',now:number,caseId?:string) {
  const authority=audience==='staff'?await staffMutationGuard(db,actorId,'seller.application.review',SellerBankError,'super_admin'):null;
  const ownerPredicate="EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND u.id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller')))";
  if(audience==='owner'&&!await db.prepare(`SELECT 1 WHERE ${ownerPredicate}`).bind(sellerId,actorId).first())throw new SellerBankError('Your current seller access is required.',403);
  const state=await sellerBankState(db,sellerId,caseId);
  const current=await db.prepare(`SELECT id,details_json AS detailsJson,document_id AS documentId,identity_revision AS identityRevision,verified_by AS verifiedBy,verified_at AS verifiedAt
    FROM seller_beneficiary_versions WHERE seller_id=? AND id=?`).bind(sellerId,state.reference?.startsWith('BENEFICIARY:')?state.reference.slice('BENEFICIARY:'.length):'')
    .first<{id:string;detailsJson:string;documentId:string;identityRevision:number;verifiedBy:string;verifiedAt:number}>();
  const proposed=state.change?.proposedJson?JSON.parse(state.change.proposedJson) as {details:BankDetails;documentId:string}:null;
  await db.batch([...(authority?.statements??protectedGuard(db,ownerPredicate,[sellerId,actorId])),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES(?,?,'seller.bank_details.viewed','seller',?,'Private beneficiary comparison opened',?,?)`)
      .bind(crypto.randomUUID(),actorId,sellerId,JSON.stringify({audience,caseId:state.change?.id??null,beneficiaryVersionId:current?.id??null}),now)]);
  return {...state,current:current?{...current,details:parseBankDetails(JSON.parse(current.detailsJson) as Record<string,unknown>)}:null,
    proposed:proposed?{details:parseBankDetails(proposed.details),documentId:proposed.documentId}:null};
}
async function bankCommand(db:D1Database,input:{actorId:string;actorAuthSubject?:string|null;commandId?:string;revision:string;now:number;sellerId:string},action:string,payload:unknown){
  const context={actorId:input.actorId,requestId:input.commandId??crypto.randomUUID(),expectedRevision:input.revision,now:input.now};
  const source={action:`seller.bank.command.${action}`,subjectType:'seller_bank',subjectId:input.sellerId};
  const authority=action==='verify'?await protectedAdminAuthority(db,input):null;
  const read=async()=>{try{return await commandReceipt(db,context,source,payload);}catch(error){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')throw new SellerBankError('This request reference belongs to different saved bank details. Review the original result before submitting new changes.');throw error;}};
  const receipt=await read();
  return {receipt,async commit(statements:D1PreparedStatement[],result:unknown,caseId?:string){if(receipt.replayed)return;
    try{await db.batch([...(authority?.statements??[]),...statements,...(caseId?protectedAdminProof(db,{...input,requestId:context.requestId},source,input.revision,payload,result,caseId):[]),receipt.insert(result)]);}
    catch(error){if((await read()).replayed)return;let detail:unknown=error;
      for(let depth=0;depth<4&&detail instanceof Error;depth++,detail=detail.cause)if(/(?:CHECK|CONSTRAINT).*valid/i.test(detail.message))
        throw new SellerBankError('Bank evidence, identity, authority or the saved revision changed. Keep your entries and review the current record.');throw error;}}};
}
export async function submitSellerBankDetails(db: D1Database, input: { sellerId: string; actorId: string; revision: string;
  details: BankDetails; document: SellerApplicationDocument; now: number;commandId?:string;changeRequestId?:string;permissionId?:string }) {
  if(!await db.prepare(`SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND u.status='active'
    AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))`).bind(input.sellerId,input.actorId).first())throw new SellerBankError('Your current seller access is required.',403);
  const details = parseBankDetails(input.details),doc=input.document;
  if (doc.kind !== 'bank_verification' || !/^[A-Za-z0-9_-]{1,160}$/.test(doc.id) || doc.objectKey!==`private/seller-documents/${input.sellerId}/${doc.id}`
    || !['application/pdf','image/jpeg','image/png'].includes(doc.mimeType)||!Number.isSafeInteger(doc.sizeBytes)||doc.sizeBytes<1||doc.sizeBytes>5*1024*1024)
    throw new SellerBankError('Private bank evidence is required.', 400);
  const command=await bankCommand(db,input,'submit',{details,document:doc,changeRequestId:input.changeRequestId??null,permissionId:input.permissionId??null});if(command.receipt.replayed)return;
  const current = await sellerBankState(db, input.sellerId,input.changeRequestId);
  if (current.revision !== input.revision) throw new SellerBankError('Bank details changed. Reload before submitting again.');
  if(!['missing','pending'].includes(current.status)||input.changeRequestId||input.permissionId){
    if(!input.changeRequestId||!input.permissionId||current.change?.id!==input.changeRequestId)throw new SellerBankError('Request current scoped permission to replace this reviewed payout account.');
    const permission=await currentProtectedPermission(db,input.sellerId,input.changeRequestId,input.permissionId,input.actorId);
    if(permission.kind!=='bank')throw new SellerBankError('This permission is not for a bank replacement.');
    const authority=await staffMutationGuard(db,permission.reviewedBy,'seller.application.review',SellerBankError,'super_admin');
    const old=await db.prepare('SELECT details_json AS json FROM seller_beneficiary_versions WHERE seller_id=? AND id=?')
      .bind(input.sellerId,current.reference?.startsWith('BENEFICIARY:')?current.reference.slice('BENEFICIARY:'.length):'').first<{json:string}>();
    const oldDetails=old?parseBankDetails(JSON.parse(old.json) as Record<string,unknown>):null,scope=JSON.parse(permission.scope) as string[];
    if(!scope.includes('bank_verification')||Object.keys(details).some(key=>oldDetails?.[key as keyof BankDetails]!==details[key as keyof BankDetails]&&!scope.includes(key)))
      throw new SellerBankError('These proposed fields exceed the exact permitted bank scope. Ask for the required scope review.');
    const eventId=crypto.randomUUID(),caseId=input.changeRequestId,context={actorId:input.actorId,requestId:input.commandId??eventId,now:input.now};
    await command.commit([...authority.statements,...protectedOwnerGuards(db,input.sellerId,input.actorId),
      ...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_protected_change_permissions p JOIN seller_protected_change_cases c ON c.id=p.case_id
        JOIN seller_profiles s ON s.id=c.seller_id JOIN seller_protected_revisions v ON v.seller_id=s.id
        WHERE p.id=? AND c.id=? AND c.seller_id=? AND c.version=? AND c.status='open' AND c.active_permission_id=p.id AND p.used_at IS NULL
          AND v.identity_revision=p.identity_revision AND v.bank_revision=p.bank_revision AND p.reviewed_by<>s.user_id
          AND COALESCE(s.payout_account_reference,'')=COALESCE(?,''))`,[permission.id,caseId,input.sellerId,permission.version,current.reference]),
      db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
        VALUES(?,?,'bank_verification',?,?,?,?,'pending',?)`).bind(doc.id,input.sellerId,doc.objectKey,doc.originalName,doc.mimeType,doc.sizeBytes,input.now),
      db.prepare('UPDATE seller_protected_change_permissions SET used_document_id=?,used_at=? WHERE id=? AND used_at IS NULL').bind(doc.id,input.now,permission.id),
      db.prepare(`UPDATE seller_protected_change_cases SET proposed_json=?,replacement_document_id=?,active_permission_id=NULL,version=version+1,operation_request_id=?,updated_at=? WHERE id=?`)
        .bind(JSON.stringify({details,documentId:doc.id}),doc.id,eventId,input.now,caseId),
      ...(permission.sourceRequestId?[db.prepare("UPDATE seller_document_change_requests SET status='completed',replacement_document_id=?,active_permission_id=NULL WHERE id=?")
        .bind(doc.id,permission.sourceRequestId)]:[]),
      protectedChangeEvent(db,context,caseId,'replacement_submitted','Scoped private bank replacement submitted',{permissionId:permission.id,documentId:doc.id,details}),
      ...await protectedChangeNotice(db,caseId,permission.sourceRequestId,eventId,context),
    ],{caseId,documentId:doc.id});return;
  }
  const reference = PENDING_PAYOUT_PREFIX + JSON.stringify({ ...details, documentId: doc.id });
  const caseId=current.change?.id??crypto.randomUUID(),eventId=crypto.randomUUID();
  await command.commit([
    ...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND u.status='active'
      AND s.status NOT IN ('rejected','suspended') AND COALESCE(s.payout_account_reference,'')=COALESCE(?,'')
      AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller')))
      AND NOT EXISTS(SELECT 1 FROM seller_documents WHERE seller_id=? AND kind='bank_verification' AND status='verified')`,[input.sellerId,input.actorId,current.reference,input.sellerId]),
    db.prepare(`UPDATE seller_profiles SET payout_account_reference=?,updated_at=? WHERE id=? AND user_id=? AND status NOT IN ('rejected','suspended')
      AND ((payout_account_reference IS NULL AND ? IS NULL) OR payout_account_reference=?)
      AND EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')`)
      .bind(reference, input.now, input.sellerId, input.actorId, current.reference, current.reference, input.actorId),
    ...protectedGuard(db, 'EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id=? AND payout_account_reference=?)', [input.sellerId, input.actorId, reference]),
    db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES (?,?,'bank_verification',?,?,?,?,'pending',?)`)
      .bind(doc.id, input.sellerId, doc.objectKey, doc.originalName, doc.mimeType, doc.sizeBytes, input.now),
    ...(current.change?[
      ...protectedGuard(db,'EXISTS(SELECT 1 FROM seller_protected_change_cases WHERE id=? AND seller_id=? AND version=? AND status IN (\'open\',\'rejected\'))',[caseId,input.sellerId,current.change.version]),
      db.prepare("UPDATE seller_protected_change_cases SET status='open',proposed_json=?,replacement_document_id=?,version=version+1,operation_request_id=?,updated_at=? WHERE id=?")
        .bind(JSON.stringify({details,documentId:doc.id}),doc.id,eventId,input.now,caseId),
    ]:[db.prepare(`INSERT INTO seller_protected_change_cases(id,seller_id,kind,classification,original_identity_revision,original_bank_reference,scope_json,proposed_json,replacement_document_id,requested_by,reason,requested_at,updated_at,operation_request_id)
      VALUES(?,?,'bank','bank',?,?,?, ?,?,?,'Initial receiving account evidence submitted for review',?,?,?)`)
      .bind(caseId,input.sellerId,current.identityRevision,current.reference,JSON.stringify(['payoutBeneficiary','bankName','bankBranch','bankAccountNumber','bank_verification']),JSON.stringify({details,documentId:doc.id}),doc.id,input.actorId,input.now,input.now,eventId),
      db.prepare(`INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at) VALUES(?,'protected_change',?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(),caseId,caseId,input.now,calculateServiceDueAt({startedAt:input.now,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION}),CONTINUOUS_CALENDAR_VERSION,input.now)]),
    ...protectedCaseHoldStatements(db,caseId,input.now),
    protectedChangeEvent(db,{actorId:input.actorId,requestId:input.commandId??eventId,now:input.now},caseId,'replacement_submitted','Initial or corrected private bank evidence submitted',{documentId:doc.id,details}),
    ...await operationalBusinessNotificationStatements(db,{kind:'seller.protected_change',sourceId:caseId,eventId,actorId:input.actorId,now:input.now,status:'bank_review_submitted'}),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES (?,?,'seller.bank_details.submitted','seller',?,'Private bank details submitted for independent review',?,?)`)
      .bind(crypto.randomUUID(), input.actorId, input.sellerId, JSON.stringify({ documentId: doc.id }), input.now),
  ],{caseId,documentId:doc.id});
}
export async function reviewSellerBankDetails(db: D1Database, input: { sellerId: string; actorId: string; revision: string; reference: string; reason: string; now: number;
  actorAuthSubject?:string|null;commandId?:string;ownershipBasis?:'same_person'|'same_legal_entity';identityEvidenceConfirmed?:boolean;releaseBankHold?:boolean;changeRequestId?:string }) {
  const authority = await staffMutationGuard(db, input.actorId, 'seller.application.review', SellerBankError, 'super_admin');
  if(!input.identityEvidenceConfirmed||!['same_person','same_legal_entity'].includes(input.ownershipBasis??'')||input.releaseBankHold===undefined)
    throw new SellerBankError('Inspect actual identity and beneficiary ownership, select the same legal owner, and record the bank hold disposition.',400);
  const reference = input.reference.trim(),reason=input.reason.trim();
  if (reference.length < 4 || reference.length > 200 || isPendingPayoutReference(reference) || reason.length < 8 || reason.length > 1000)
    throw new SellerBankError('Record an independent verification reference and a review reason.', 400);
  const command=await bankCommand(db,input,'verify',{reference,reason,ownershipBasis:input.ownershipBasis,identityEvidenceConfirmed:true,releaseBankHold:input.releaseBankHold,changeRequestId:input.changeRequestId??null});
  if(command.receipt.replayed)return;
  const current = await sellerBankState(db, input.sellerId,input.changeRequestId);
  if (current.revision !== input.revision || !current.change?.proposedJson || current.change.status!=='open') throw new ProtectedAdminBeforeWriteError('Pending bank evidence changed or needs resubmission. Inspect the current evidence before reviewing.');
  const proposal=JSON.parse(current.change.proposedJson) as {details:BankDetails;documentId:string};const details=parseBankDetails(proposal.details);
  const correction = await db.prepare(`SELECT 1 FROM seller_documents d JOIN audit_logs review ON review.id=d.review_request_id
    WHERE d.id=? AND d.seller_id=? AND review.action='seller.document.correction_requested'`)
    .bind(proposal.documentId,input.sellerId).first();
  if (correction) throw new ProtectedAdminBeforeWriteError('The seller still needs to upload the requested bank document.');
  const versionId=crypto.randomUUID(),destination=`BENEFICIARY:${versionId}`,eventId=crypto.randomUUID();
  await command.commit([
    ...authority.statements,
    ...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id JOIN seller_protected_revisions v ON v.seller_id=s.id
      WHERE s.id=? AND s.user_id<>? AND u.status='active' AND v.identity_revision=? AND v.bank_revision=?
      AND s.status NOT IN ('rejected','suspended') AND COALESCE(s.payout_account_reference,'')=COALESCE(?,'')
      AND ((s.applicant_type='individual' AND ?='same_person') OR (s.applicant_type='company' AND ?='same_legal_entity')))
      AND ${verifiedIdentitySql('?',input.now)}
      AND NOT EXISTS(SELECT 1 FROM seller_capability_holds h JOIN seller_protected_change_cases c ON c.id=h.case_id
        WHERE h.seller_id=? AND h.released_at IS NULL AND c.kind='identity' AND c.status<>'verified' AND c.classification<>'identity_evidence_only')
      AND EXISTS(SELECT 1 FROM seller_protected_change_cases WHERE id=? AND version=? AND replacement_document_id=? AND status='open')
      AND EXISTS(SELECT 1 FROM seller_documents d WHERE d.id=? AND d.seller_id=? AND d.kind='bank_verification' AND d.status='pending'
        AND NOT EXISTS(SELECT 1 FROM audit_logs review WHERE review.id=d.review_request_id AND review.action='seller.document.correction_requested'))`,
      [input.sellerId,input.actorId,current.identityRevision,current.bankRevision,current.reference,input.ownershipBasis,input.ownershipBasis,input.sellerId,input.sellerId,current.change.id,current.change.version,proposal.documentId,proposal.documentId,input.sellerId]),
    db.prepare(`INSERT INTO seller_beneficiary_versions(id,seller_id,case_id,document_id,details_json,identity_revision,ownership_basis,verification_reference,review_reason,verified_by,verified_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(versionId,input.sellerId,current.change.id,proposal.documentId,JSON.stringify(details),current.identityRevision,input.ownershipBasis,reference,reason,input.actorId,input.now),
    db.prepare(`UPDATE seller_profiles SET payout_account_reference=?,updated_at=? WHERE id=? AND payout_account_reference=? AND status NOT IN ('rejected','suspended')`)
      .bind(destination, input.now, input.sellerId, current.reference),
    db.prepare(`UPDATE seller_participation_profiles SET payout_beneficiary_reference=?,version=version+1,updated_at=? WHERE seller_id=?
      AND payout_beneficiary_reference IS NOT NULL AND instr(payout_beneficiary_reference,'PENDING VERIFICATION:')<>1`)
      .bind(destination,input.now,input.sellerId),
    db.prepare(`UPDATE seller_documents SET status='verified',reviewed_at=?,reviewed_by=?,review_request_id=? WHERE id=? AND seller_id=? AND status='pending'`)
      .bind(input.now, input.actorId,eventId,proposal.documentId,input.sellerId),
    db.prepare("UPDATE seller_protected_change_cases SET status='verified',version=version+1,reviewed_by=?,reviewed_at=?,review_reason=?,evidence_reference=?,operation_request_id=?,updated_at=? WHERE id=?")
      .bind(input.actorId,input.now,reason,reference,eventId,input.now,current.change.id),
    ...(input.releaseBankHold?[db.prepare(`UPDATE seller_capability_holds SET released_at=?,released_by=?,release_reason=?,release_request_id=?
      WHERE case_id=? AND capability='payouts' AND released_at IS NULL`).bind(input.now,input.actorId,reason,eventId,current.change.id)]:[]),
    protectedChangeEvent(db,{actorId:input.actorId,requestId:input.commandId??eventId,now:input.now},current.change.id,'verified',reason,
      {beneficiaryVersionId:versionId,documentId:proposal.documentId,identityRevision:current.identityRevision,bankHoldReleased:input.releaseBankHold,verificationReference:reference}),
    ...await protectedChangeNotice(db,current.change.id,current.change.sourceRequestId,eventId,{actorId:input.actorId,requestId:input.commandId??eventId,now:input.now}),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at) VALUES (?,?,'seller.bank_details.verified','seller',?,?,?,?)`)
      .bind(crypto.randomUUID(), input.actorId, input.sellerId,reason,JSON.stringify({documentId:proposal.documentId,beneficiaryVersionId:versionId,caseId:current.change.id,bankHoldReleased:input.releaseBankHold}),input.now),
  ],{caseId:current.change.id,beneficiaryVersionId:versionId},current.change.id);
}
