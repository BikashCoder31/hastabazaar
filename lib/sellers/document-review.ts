import {registrationEvidenceKinds} from './document-policy';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import type { SellerApplicationDocument, SellerDocumentKind } from './application';
import { commandReceipt } from '../workflows/contracts';
import {nativeCommandProvenance} from '../operations/native-form-health';
import { documentChangeTaskInsert } from '../workflows/review-tasks';
import { operationalBusinessNotificationStatements } from '../operations/business-notifications';
import { documentProtectedCaseStatements } from './protected-change-policy';
import {protectedChangeEvent} from './protected-change-events';

export class SellerDocumentReviewError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

type DocumentCommand = { actorId: string; actorAuthSubject?:string|null;now: number; commandId?: string };
/** This invocation did not enter a write batch; prior unknowns stay unknown. */
export class DocumentDecisionBeforeWriteError extends SellerDocumentReviewError{}
class DocumentReviewerAccessError extends SellerDocumentReviewError{
 constructor(message:string){super(message,403);}
}
async function documentReviewerAuthority(db:D1Database,input:{actorId:string;actorAuthSubject?:string|null}){
 const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',DocumentReviewerAccessError,'super_admin');
 const row=await db.prepare('SELECT id,auth_subject AS authSubject FROM users WHERE id=?').bind(input.actorId).first<{id:string;authSubject:string|null}>();
 if(!row||row.id!==input.actorId||(input.actorAuthSubject!==undefined&&row.authSubject!==input.actorAuthSubject))
  throw new DocumentReviewerAccessError('The authenticated reviewer changed. Reopen the current workspace.');
 const id=crypto.randomUUID();
 authority.statements.push(db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
  SELECT 1 FROM users WHERE HEX(id)=HEX(?) AND ${row.authSubject===null?'auth_subject IS NULL':'HEX(auth_subject)=HEX(?)'}) THEN 1 ELSE 0 END`)
  .bind(id,input.actorId,...(row.authSubject===null?[]:[row.authSubject])),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id));
 return{...authority,authSubject:row.authSubject};
}
function documentAdminProof(input:DocumentCommand,requestId:string,action:'review'|'permission',sourceId:string,decision:string,payload:unknown){
 // Direct historical/native callers may have no authenticated subject. It is
 // never manufactured from their actor ID or adopted by the new API reader.
 return typeof input.actorAuthSubject==='string'?{version:1,actorId:input.actorId,actorAuthSubject:input.actorAuthSubject,requestId,action,sourceId,decision,payload}:null;
}

/** Original immutable history, independent of later document/permission state. */
export async function readDocumentAdminOutcome(db:D1Database,input:{actorId:string;actorAuthSubject:string;commandId:string;action:'review'|'permission';sourceId:string;now:number}){
 const authority=await documentReviewerAuthority(db,input);
 const actions=input.action==='review'?['seller.document.verified','seller.document.correction_requested','seller.document.rejected']:['seller.document.change_reviewed'];
 const subjectType=input.action==='review'?'seller_document':'seller_document_change_request';
 const row=await db.prepare(`SELECT id,actor_id AS actorId,subject_id AS sourceId,request_id AS requestId,next_json AS nextJson
  FROM audit_logs WHERE actor_id=? AND subject_type=? AND subject_id=? AND request_id=? AND action IN (${actions.map(()=>'?').join(',')}) LIMIT 1`)
  .bind(input.actorId,subjectType,input.sourceId,input.commandId,...actions).first<{id:string;actorId:string;sourceId:string;requestId:string;nextJson:string}>();
 await documentReviewerAuthority(db,input);
 if(!row||row.actorId!==input.actorId||row.sourceId!==input.sourceId||row.requestId!==input.commandId)return null;
 let proof:Record<string,unknown>|undefined;
 try{proof=(JSON.parse(row.nextJson) as {commandProof?:Record<string,unknown>}).commandProof;}catch{return null;}
 if(!proof||proof.version!==1||proof.actorId!==input.actorId||proof.requestId!==input.commandId||proof.action!==input.action||proof.sourceId!==input.sourceId||
  typeof proof.actorAuthSubject!=='string'||!proof.payload||typeof proof.payload!=='object'||Array.isArray(proof.payload))return null;
 if(proof.actorAuthSubject!==input.actorAuthSubject)throw new DocumentReviewerAccessError('The original reviewer identity does not match this session.');
 const payload=proof.payload as Record<string,unknown>,allowed=input.action==='review'?['verify','request_correction','reject']:['approve','reject'];
 if(typeof proof.decision!=='string'||!allowed.includes(proof.decision)||payload.decision!==proof.decision)return null;
 let receipt;
 try{receipt=await commandReceipt(db,{actorId:input.actorId,requestId:input.commandId,expectedRevision:input.sourceId,now:input.now},
  {action:'seller.document.command.'+input.action,subjectType:'seller_document_workflow',subjectId:input.sourceId},payload);}
 catch(error){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')return null;throw error;}
 if(!receipt.replayed||typeof receipt.result!=='string'||receipt.result!==input.sourceId)return null;
 const current=await db.prepare(`SELECT 1 FROM audit_logs e WHERE HEX(e.id)=HEX(?) AND HEX(e.actor_id)=HEX(?)
  AND HEX(e.subject_id)=HEX(?) AND HEX(e.request_id)=HEX(?) AND HEX(e.next_json)=HEX(?)
  AND EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE HEX(u.id)=HEX(?)
   AND HEX(u.auth_subject)=HEX(?) AND HEX(u.status)=HEX('active') AND HEX(r.role)=HEX('super_admin'))`)
  .bind(row.id,input.actorId,input.sourceId,input.commandId,row.nextJson,input.actorId,authority.authSubject).first();
 if(!current){await documentReviewerAuthority(db,input);return null;}
 return{ok:true as const,recorded:true as const,requestId:input.commandId,actorId:input.actorId,action:input.action,sourceId:input.sourceId,id:receipt.result,decision:proof.decision,historical:true as const};
}
async function ownerAccess(db: D1Database, sellerId: string, actorId: string) {
  if (!await db.prepare(`SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND u.id=? AND u.status='active'
    AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))`).bind(sellerId, actorId).first())
    throw new SellerDocumentReviewError('Current access to your own registration is required.', 403);
}
async function documentCommand(db: D1Database, input: DocumentCommand, action: string, subjectId: string, payload: unknown) {
  const context = { actorId: input.actorId, requestId: input.commandId ?? crypto.randomUUID(), expectedRevision: subjectId, now: input.now };
  const source = { action: `seller.document.command.${action}`, subjectType: 'seller_document_workflow', subjectId };
  const provenance=await nativeCommandProvenance(db,source.action,context.expectedRevision);
  const read = async () => {
    try {return await commandReceipt(db,context,source,payload,provenance);}
    catch(error) {if(error instanceof Error && error.message==='Request reference was already used for different command content.')
      throw new SellerDocumentReviewError('This request reference belongs to different saved content. Review the recorded result before submitting new changes.');throw error;}
  };
  const receipt = await read();
  return { receipt, requestId:context.requestId,async commit(statements: D1PreparedStatement[], result: string) {
    if (receipt.replayed) return receipt.result as string;
    try { await db.batch([...statements, receipt.insert(result)]); }
    catch (error) { const recovered = await read(); if (recovered.replayed) return recovered.result as string;
      let detail:unknown=error;for(let depth=0;depth<4&&detail instanceof Error;depth++,detail=detail.cause)
        if(/(?:CHECK|CONSTRAINT).*valid/i.test(detail.message))throw new SellerDocumentReviewError('This evidence, permission or account changed. Refresh the current record and review it before retrying; keep your note.');
      throw error; }
    return result;
  } };
}

/** Move current evidence only after verification, retaining original agreement acceptance facts. */
async function replacementCurrentRecordStatements(db: D1Database, sellerId: string, documentId: string, now: number) {
  const document=await db.prepare(`SELECT id,kind,object_key AS objectKey,original_name AS originalName,mime_type AS mimeType,size_bytes AS sizeBytes
    FROM seller_documents WHERE id=? AND seller_id=?`).bind(documentId,sellerId).first<SellerApplicationDocument>();
  if(!document) throw new SellerDocumentReviewError('Replacement evidence is unavailable.');
  const statements:D1PreparedStatement[]=[];
  const intake=await db.prepare('SELECT version,documents_json AS documents,answers_json AS answers FROM seller_registration_intakes WHERE seller_id=?')
    .bind(sellerId).first<{version:number;documents:string;answers:string}>();
  if(intake) {
    const documents=JSON.parse(intake.documents) as Record<string,SellerApplicationDocument>;
    const answers=JSON.parse(intake.answers) as Record<string,string[]>;
    const field=Object.entries(documents).find(([,value])=>value.kind===document.kind)?.[0]
      ?? (document.kind==='representative_identity'?'representativeIdentity':document.kind==='business_registration'?'businessRegistration':document.kind==='vat_certificate'?'vatCertificate':answers.hasBusinessTaxRegistration?.[0]==='yes'?'panCertificate':'personalPanCertificate');
    documents[field]=document;
    const guard=crypto.randomUUID();
    statements.push(db.prepare('UPDATE seller_registration_intakes SET version=version+1,documents_json=?,updated_at=? WHERE seller_id=? AND version=?')
      .bind(JSON.stringify(documents),now,sellerId,intake.version),
      db.prepare('INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN changes()=1 THEN 1 ELSE 0 END').bind(guard),
      db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard));
  }
  if(document.kind==='representative_identity') {
    const current=await db.prepare('SELECT id,identity_document_id AS documentId FROM managed_maker_application_details WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(sellerId).first<{id:string;documentId:string}>();
    if(current&&current.documentId!==documentId) {
      const guard=crypto.randomUUID();
      statements.push(db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN
        (SELECT id FROM managed_maker_application_details WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 1)=? THEN 1 ELSE 0 END`).bind(guard,sellerId,current.id),
        db.prepare(`INSERT INTO managed_maker_application_details(id,seller_id,government_id_type,government_id_description,personal_pan,identity_document_id,
          agreement_version,agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,created_at,agreement_language,agreement_form_version_id)
          SELECT ?,seller_id,government_id_type,government_id_description,personal_pan,?,agreement_version,agreement_accepted_at,agreement_accepted_by,
            agreement_snapshot_json,?,agreement_language,agreement_form_version_id FROM managed_maker_application_details WHERE id=?`)
          .bind(crypto.randomUUID(),documentId,now,current.id),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard));
    }
  }
  return statements;
}

/** Guard direct registration changes in the same transaction as the write. */
export function verifiedDocumentChangeGuards(db: D1Database, sellerId: string, kinds: readonly SellerDocumentKind[] = [...registrationEvidenceKinds,'bank_verification']): D1PreparedStatement[] {
  if (!kinds.length) return [];
  const id = crypto.randomUUID();
  return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN NOT EXISTS(
    SELECT 1 FROM seller_documents WHERE seller_id=? AND status='verified'
      AND kind IN (${kinds.map(() => '?').join(',')})) THEN 1 ELSE 0 END`).bind(id,sellerId,...kinds),
  db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}

export async function requestDocumentChange(db:D1Database,input:{sellerId:string;documentId:string;reason:string} & DocumentCommand) {
  const reason=input.reason.trim();
  if (reason.length<10 || reason.length>1000) throw new SellerDocumentReviewError('Explain the requested change in 10–1000 characters.',400);
  await ownerAccess(db, input.sellerId, input.actorId);
  const command = await documentCommand(db, input, 'request', input.documentId, {sellerId:input.sellerId,reason});
  if (command.receipt.replayed) return command.receipt.result as string;
  const guard=crypto.randomUUID(); const requestId=crypto.randomUUID(); const eventId=crypto.randomUUID();
  return command.commit([
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id JOIN users u ON u.id=s.user_id
      WHERE d.id=? AND d.seller_id=? AND d.status='verified' AND d.kind IN ('representative_identity','pan_certificate','business_registration','vat_certificate','bank_verification')
      AND s.user_id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))
      AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind AND newer.status<>'rejected'
        AND (newer.uploaded_at>d.uploaded_at OR (newer.uploaded_at=d.uploaded_at AND newer.id>d.id)))
      AND NOT EXISTS(SELECT 1 FROM seller_document_change_requests r
        WHERE r.document_id=d.id AND r.status IN ('submitted','approved'))) THEN 1 ELSE 0 END`).bind(guard,input.documentId,input.sellerId,input.actorId),
    db.prepare(`INSERT INTO seller_document_change_requests(id,seller_id,document_id,requested_by,reason,status,requested_at,operation_request_id)
      VALUES (?,?,?,?,?,'submitted',?,?)`).bind(requestId,input.sellerId,input.documentId,input.actorId,reason,input.now,eventId),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES (?,?,'seller.document.change_requested','seller_document',?,?,?,?)`).bind(crypto.randomUUID(),input.actorId,input.documentId,reason,JSON.stringify({sellerId:input.sellerId,requestId}),input.now),
    documentChangeTaskInsert(db, requestId, input.now),
    ...documentProtectedCaseStatements(db,requestId,input.now),
    protectedChangeEvent(db,{actorId:input.actorId,requestId:input.commandId??eventId,now:input.now},requestId,'requested',reason,{documentId:input.documentId}),
    ...await operationalBusinessNotificationStatements(db,{kind:'seller.document.change',sourceId:requestId,eventId,actorId:input.actorId,now:input.now}),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
  ], requestId);
}

export async function reviewDocumentChange(db:D1Database,input:{requestId:string;decision:'approve'|'reject';reason:string;expectedOperationId?:string|null} & DocumentCommand) {
  const reason=input.reason.trim();
  if (reason.length<8 || reason.length>1000 || !['approve','reject'].includes(input.decision)) throw new DocumentDecisionBeforeWriteError('Record a valid review decision and reason.',400);
  const authority=await documentReviewerAuthority(db,input);
  const payload={decision:input.decision,reason,expectedOperationId:input.expectedOperationId??null};
  const command = await documentCommand(db,input,'permission',input.requestId,payload);
  const proof=documentAdminProof(input,command.requestId,'permission',input.requestId,input.decision,payload);
  if(command.receipt.replayed) return command.receipt.result as string;
  const current=await db.prepare('SELECT status,operation_request_id AS operationId FROM seller_document_change_requests WHERE id=?').bind(input.requestId).first<{status:string;operationId:string|null}>();
  if(!current)throw new DocumentDecisionBeforeWriteError('Document request not found.',404);
  const protectedCase=await db.prepare('SELECT kind FROM seller_protected_change_cases WHERE source_request_id=?').bind(input.requestId).first<{kind:string}>();
  if(!protectedCase)
    throw new DocumentDecisionBeforeWriteError('This historical request needs protected-change reconciliation before a new decision.');
  if(protectedCase.kind==='bank')throw new DocumentDecisionBeforeWriteError('Review this protected bank case to issue its exact bank permission and verify the complete beneficiary evidence.');
  const expectedOperationId=input.expectedOperationId===undefined?current.operationId:input.expectedOperationId;
  if(!['submitted','approved'].includes(current.status)||(current.operationId??'')!==(expectedOperationId??''))
    throw new DocumentDecisionBeforeWriteError('This replacement request changed. Review its current source before a new decision.');
  const guard=crypto.randomUUID(); const status=input.decision==='approve' ? 'approved' : 'rejected'; const eventId=crypto.randomUUID();
  const grantId=current.status==='submitted'?input.requestId:eventId;
  return command.commit([
    ...authority.statements,
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM seller_document_change_requests r JOIN seller_documents d ON d.id=r.document_id AND d.seller_id=r.seller_id
      JOIN seller_profiles s ON s.id=r.seller_id JOIN users u ON u.id=s.user_id
      WHERE r.id=? AND r.status IN ('submitted','approved') AND COALESCE(r.operation_request_id,'')=COALESCE(?,'') AND r.requested_by=s.user_id AND s.user_id<>? AND u.status='active' AND d.status='verified'
      AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind AND newer.status<>'rejected'
        AND (newer.uploaded_at>d.uploaded_at OR (newer.uploaded_at=d.uploaded_at AND newer.id>d.id)))
      ) THEN 1 ELSE 0 END`).bind(guard,input.requestId,expectedOperationId,input.actorId),
    db.prepare(`UPDATE seller_document_change_requests SET status=?,reviewed_by=?,reviewed_at=?,review_reason=?,operation_request_id=?,active_permission_id=? WHERE id=? AND status IN ('submitted','approved')`)
      .bind(status,input.actorId,input.now,reason,eventId,input.decision==='approve'?grantId:null,input.requestId),
    ...(input.decision==='approve' ? [db.prepare(`INSERT INTO seller_document_replacement_permissions
      (id,request_id,document_id,expected_review_id,reviewed_by,reviewed_at,reason)
      SELECT ?,r.id,d.id,d.review_request_id,?,?,? FROM seller_document_change_requests r JOIN seller_documents d ON d.id=r.document_id WHERE r.id=?`)
      .bind(grantId,input.actorId,input.now,reason,input.requestId)] : []),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at,request_id)
      VALUES (?,?,'seller.document.change_reviewed','seller_document_change_request',?,?,?,?,?)`)
      .bind(crypto.randomUUID(),input.actorId,input.requestId,reason,JSON.stringify({status,...(proof?{commandProof:proof}:{})}),input.now,command.requestId),
    db.prepare(`UPDATE seller_protected_change_cases SET status=?,version=version+1,reviewed_by=?,reviewed_at=?,review_reason=?,operation_request_id=?,updated_at=? WHERE source_request_id=?`)
      .bind(input.decision==='approve'?'open':'rejected',input.actorId,input.now,reason,eventId,input.now,input.requestId),
    protectedChangeEvent(db,{actorId:input.actorId,requestId:input.commandId??eventId,now:input.now},input.requestId,input.decision==='approve'?'permit':'reject',reason,{permissionId:input.decision==='approve'?grantId:null}),
    ...await operationalBusinessNotificationStatements(db,{kind:'seller.document.change',sourceId:input.requestId,eventId,actorId:input.actorId,now:input.now}),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
  ], input.requestId);
}

export async function verifySellerDocument(db: D1Database, input: { sellerId: string; documentId: string; reason: string; expectedReviewId?: string | null } & DocumentCommand) {
  return reviewSellerDocument(db, {...input,decision:'verify'});
}

export async function reviewSellerDocument(db: D1Database, input: { sellerId: string; documentId: string; reason: string;
  decision: 'verify'|'request_correction'|'reject'; expectedReviewId?: string | null } & DocumentCommand) {
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 1000 || !['verify','request_correction','reject'].includes(input.decision)) throw new DocumentDecisionBeforeWriteError('Enter a valid decision and a seller-visible reason of 8–1000 characters.', 400);
  const authority = await documentReviewerAuthority(db,input);
  const payload={sellerId:input.sellerId,decision:input.decision,reason,expectedReviewId:input.expectedReviewId??null};
  const command = await documentCommand(db,input,'review',input.documentId,payload);
  const proof=documentAdminProof(input,command.requestId,'review',input.documentId,input.decision,payload);
  if(command.receipt.replayed) return command.receipt.result as string;
  const current=await db.prepare('SELECT review_request_id AS reviewId,status FROM seller_documents WHERE id=? AND seller_id=?').bind(input.documentId,input.sellerId).first<{reviewId:string|null;status:string}>();
  if(!current) throw new DocumentDecisionBeforeWriteError('Document not found.',404);
  const expectedReviewId=input.expectedReviewId===undefined?current.reviewId:input.expectedReviewId;
  if(current.status!=='pending'||(current.reviewId??'')!==(expectedReviewId??''))
    throw new DocumentDecisionBeforeWriteError('This evidence changed. Review its current source before a new decision.');
  const linked=await db.prepare('SELECT id FROM seller_document_change_requests WHERE replacement_document_id=? AND seller_id=?').bind(input.documentId,input.sellerId).first<{id:string}>();
  if(linked&&!await db.prepare('SELECT 1 FROM seller_protected_change_cases WHERE source_request_id=?').bind(linked.id).first())
    throw new DocumentDecisionBeforeWriteError('This historical request needs protected-change reconciliation before replacement verification.');
  const status=input.decision==='verify'?'verified':input.decision==='reject'?'rejected':'pending';
  const action=input.decision==='verify'?'verified':input.decision==='reject'?'rejected':'correction_requested';
  const guard = crypto.randomUUID(); const eventId=crypto.randomUUID();
  const consequences:D1PreparedStatement[]=[];
  if(linked) {
    consequences.push(db.prepare("UPDATE seller_document_change_requests SET status=?,operation_request_id=?,active_permission_id=? WHERE id=? AND replacement_document_id=?")
      .bind(input.decision==='request_correction'?'approved':input.decision==='reject'?'rejected':'completed',eventId,input.decision==='request_correction'?eventId:null,linked.id,input.documentId));
    if(input.decision==='request_correction') consequences.push(db.prepare(`INSERT INTO seller_document_replacement_permissions
      (id,request_id,document_id,expected_review_id,reviewed_by,reviewed_at,reason) VALUES(?,?,?,?,?,?,?)`)
      .bind(eventId,linked.id,input.documentId,eventId,input.actorId,input.now,reason));
    consequences.push(db.prepare(`UPDATE seller_protected_change_cases SET status=?,replacement_document_id=?,version=version+1,reviewed_by=?,reviewed_at=?,review_reason=?,operation_request_id=?,updated_at=? WHERE source_request_id=?`)
      .bind(input.decision==='verify'?'verified':input.decision==='reject'?'rejected':'open',input.documentId,input.actorId,input.now,reason,eventId,input.now,linked.id),
      protectedChangeEvent(db,{actorId:input.actorId,requestId:input.commandId??eventId,now:input.now},linked.id,`document_${action}`,reason,{documentId:input.documentId,holdsRetained:true}));
  }
  if(input.decision==='verify') consequences.push(...await replacementCurrentRecordStatements(db,input.sellerId,input.documentId,input.now));
  return command.commit([
    ...authority.statements,
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id JOIN users u ON u.id=s.user_id
      WHERE d.id=? AND d.seller_id=? AND d.kind IN ('representative_identity','pan_certificate','business_registration','vat_certificate') AND d.protected_change_id IS NULL
      AND d.status='pending' AND COALESCE(d.review_request_id,'')=COALESCE(?,'') AND s.user_id<>? AND u.status='active' AND s.status NOT IN ('rejected','suspended')
      AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind
        AND (newer.uploaded_at>d.uploaded_at OR (newer.uploaded_at=d.uploaded_at AND newer.id>d.id)))
      ) THEN 1 ELSE 0 END`).bind(guard,input.documentId,input.sellerId,expectedReviewId,input.actorId),
    db.prepare(`UPDATE seller_documents SET status=?,reviewed_at=?,reviewed_by=?,review_request_id=? WHERE id=? AND seller_id=? AND status='pending'`)
      .bind(status,input.now,input.actorId,eventId,input.documentId,input.sellerId),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at,request_id)
      VALUES (?,?,?,'seller_document',?,?,?,?,?)`)
      .bind(eventId,input.actorId,`seller.document.${action}`,input.documentId,reason,JSON.stringify({sellerId:input.sellerId,status,...(proof?{commandProof:proof}:{})}),input.now,command.requestId),
    ...consequences,
    ...await operationalBusinessNotificationStatements(db,{kind:linked?'seller.document.change':'seller.document.review',sourceId:linked?.id??input.documentId,eventId,actorId:input.actorId,now:input.now}),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
  ], input.documentId);
}

function validateReplacementDocument(sellerId:string,document:SellerApplicationDocument) {
  if (!(registrationEvidenceKinds as readonly string[]).includes(document.kind)
    || !/^[a-zA-Z0-9_-]{1,160}$/.test(document.id)
    || document.objectKey !== `private/seller-documents/${sellerId}/${document.id}`
    || !['image/jpeg', 'image/png', 'application/pdf'].includes(document.mimeType)
    || !Number.isSafeInteger(document.sizeBytes) || document.sizeBytes < 1 || document.sizeBytes > 5 * 1024 * 1024
    || !document.originalName.trim() || document.originalName.length > 180)
    throw new SellerDocumentReviewError('Upload valid private registration evidence for this request.', 400);
}

/** Consumes permission for exactly one evidence version; verification remains a separate decision. */
export async function submitDocumentReplacement(db: D1Database, input: {
  sellerId: string; requestId: string; permissionId?: string; document: SellerApplicationDocument;
} & DocumentCommand) {
  const document=input.document;validateReplacementDocument(input.sellerId,document);
  await ownerAccess(db,input.sellerId,input.actorId);
  const permissionId=input.permissionId??input.requestId;
  const command = await documentCommand(db,input,'replacement',input.requestId,{sellerId:input.sellerId,permissionId,document});
  if(command.receipt.replayed) return command.receipt.result as string;
  if(!await db.prepare('SELECT 1 FROM seller_protected_change_cases WHERE source_request_id=?').bind(input.requestId).first())
    throw new SellerDocumentReviewError('This historical request needs protected-change reconciliation before replacement upload.');
  const permission = await db.prepare(`SELECT p.reviewed_by AS reviewer FROM seller_document_change_requests r
    JOIN seller_document_replacement_permissions p ON p.request_id=r.id JOIN seller_profiles s ON s.id=r.seller_id
    WHERE r.id=? AND r.seller_id=? AND s.user_id=? AND r.status='approved' AND p.id=? AND p.id=r.active_permission_id AND p.used_document_id IS NULL`)
    .bind(input.requestId,input.sellerId,input.actorId,permissionId).first<{reviewer:string|null}>();
  if (!permission?.reviewer || permission.reviewer === input.actorId)
    throw new SellerDocumentReviewError('Current permission for this exact document replacement is required.');
  const authority = await staffMutationGuard(db, permission.reviewer, 'seller.application.review', SellerDocumentReviewError, 'super_admin');
  const guard = crypto.randomUUID(); const eventId=crypto.randomUUID();
  return command.commit([
    ...authority.statements,
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM seller_document_change_requests r JOIN seller_document_replacement_permissions p ON p.request_id=r.id
      JOIN seller_documents d ON d.id=p.document_id AND d.seller_id=r.seller_id
      JOIN seller_profiles s ON s.id=r.seller_id JOIN users u ON u.id=s.user_id
      WHERE r.id=? AND r.seller_id=? AND r.status='approved' AND p.reviewed_by=? AND p.id=? AND p.id=r.active_permission_id AND p.used_document_id IS NULL
      AND COALESCE(d.review_request_id,'')=COALESCE(p.expected_review_id,'')
      AND r.requested_by=s.user_id AND s.user_id=? AND u.status='active' AND d.kind=?
      AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))
      AND d.uploaded_at<? AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind AND newer.status<>'rejected'
        AND (newer.uploaded_at>d.uploaded_at OR (newer.uploaded_at=d.uploaded_at AND newer.id>d.id)))
      ) THEN 1 ELSE 0 END`).bind(guard,input.requestId,input.sellerId,permission.reviewer,permissionId,input.actorId,document.kind,input.now),
    db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
      VALUES(?,?,?,?,?,?,?,'pending',?)`).bind(document.id, input.sellerId, document.kind, document.objectKey, document.originalName, document.mimeType, document.sizeBytes, input.now),
    db.prepare('UPDATE seller_document_replacement_permissions SET used_document_id=?,used_at=? WHERE id=? AND used_document_id IS NULL').bind(document.id,input.now,permissionId),
    db.prepare("UPDATE seller_document_change_requests SET status='completed',replacement_document_id=?,operation_request_id=?,active_permission_id=NULL WHERE id=? AND status='approved'").bind(document.id,eventId,input.requestId),
    db.prepare("UPDATE seller_protected_change_cases SET status='open',replacement_document_id=?,version=version+1,operation_request_id=?,updated_at=? WHERE source_request_id=?")
      .bind(document.id,eventId,input.now,input.requestId),
    protectedChangeEvent(db,{actorId:input.actorId,requestId:input.commandId??eventId,now:input.now},input.requestId,'replacement_submitted','Permitted document replacement submitted',{documentId:document.id,permissionId}),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES(?,?,'seller.document.replacement_submitted','seller_document_change_request',?,'Permitted replacement submitted for fresh verification',?,?)`)
      .bind(crypto.randomUUID(), input.actorId, input.requestId, JSON.stringify({ sellerId: input.sellerId, documentId: document.id }), input.now),
    ...await operationalBusinessNotificationStatements(db,{kind:'seller.document.change',sourceId:input.requestId,eventId,actorId:input.actorId,now:input.now}),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
  ], document.id);
}

/** Unverified evidence can be corrected without pretending a protected replacement was approved. */
export async function submitUnverifiedDocumentCorrection(db:D1Database,input:{sellerId:string;documentId:string;document:SellerApplicationDocument}&DocumentCommand) {
  const document=input.document;validateReplacementDocument(input.sellerId,document);await ownerAccess(db,input.sellerId,input.actorId);
  const command=await documentCommand(db,input,'unverified_correction',input.documentId,{sellerId:input.sellerId,document});
  if(command.receipt.replayed)return command.receipt.result as string;
  const guard=crypto.randomUUID(),eventId=crypto.randomUUID();
  return command.commit([
    db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id JOIN users u ON u.id=s.user_id
      WHERE d.id=? AND d.seller_id=? AND d.kind=? AND d.status IN ('pending','rejected') AND d.uploaded_at<?
      AND s.user_id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))
      AND NOT EXISTS(SELECT 1 FROM seller_documents verified WHERE verified.seller_id=d.seller_id AND verified.kind=d.kind AND verified.status='verified')
      AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind
        AND (newer.uploaded_at>d.uploaded_at OR newer.uploaded_at=d.uploaded_at AND newer.id>d.id))) THEN 1 ELSE 0 END`)
      .bind(guard,input.documentId,input.sellerId,document.kind,input.now,input.actorId),
    db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,review_request_id)
      VALUES(?,?,?,?,?,?,?,'pending',?,?)`).bind(document.id,input.sellerId,document.kind,document.objectKey,document.originalName,document.mimeType,document.sizeBytes,input.now,eventId),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES(?,?,'seller.document.correction_submitted','seller_document',?,'Owner supplied a correction to unverified evidence',?,?)`)
      .bind(eventId,input.actorId,document.id,JSON.stringify({sellerId:input.sellerId,previousDocumentId:input.documentId}),input.now),
    ...await operationalBusinessNotificationStatements(db,{kind:'seller.document.review',sourceId:document.id,eventId,actorId:input.actorId,now:input.now}),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
  ],document.id);
}
