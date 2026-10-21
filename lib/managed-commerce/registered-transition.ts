import type { RuntimeEnvironment } from '@/lib/staging/environment';
import { assertSimulationAllowed, SIMULATED_RECORD_LABEL } from '@/lib/staging/environment';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { digestFormRequest, formRequestReplay, FormRequestConflictError } from '@/lib/forms/submission';
import { decisionFormReplay } from './form-replay';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { getRegisteredSellerTerms, prepareSellerCommissionAcceptance } from '@/lib/db/repositories/marketplace-settings';
import { makerMutationGuards, getManagedMakerAuthority } from './maker-authority';
import type { SellerApplicationDocument } from '@/lib/sellers/application';
import { isPendingPayoutReference } from '../sellers/onboarding';

export class RouteTransitionError extends Error {}
type TransitionForm = {requestId:string;versionId:string;answers:FormAnswerSnapshot;digest?:string};
export interface RegisteredTransitionInput {
  sellerId:string;actorId:string;legalName:string;registrationAuthority:string;registrationNumber:string;
  taxMode:'PAN'|'VAT'|'BOTH';taxRegistrationNumber:string;evidenceReferences:readonly string[];
  agreementVersion:string;agreementLanguage:'en'|'ne';agreementAcceptedAt:number;registeredTermsContext?:string;
  requestId:string;now:number;environment:RuntimeEnvironment;form?:TransitionForm;documents?:readonly SellerApplicationDocument[];payoutAccountReference?:string;
}
interface Evidence {id:string;kind:string;objectKey:string;uploadedAt:number;sizeBytes:number}
interface TermsSnapshot {schema:1;context:string;agreementVersion:string;commissionSettingVersionId:string|null;commissionBps:number;
  document:Awaited<ReturnType<typeof getRegisteredSellerTerms>>['document'];language:'en';acceptedAt:number;acceptedBy:string;evidence:Evidence[];payoutAccountReference:string;settlementTermsReference:string}
interface TransitionRow {
  id:string;sellerId:string;requestedBy:string;reviewedBy:string|null;status:string;version:number;legalName:string;
  registrationAuthority:string;registrationNumber:string;taxMode:'PAN'|'VAT'|'BOTH';taxRegistrationNumber:string;
  agreementVersion:string;agreementAcceptedAt:number;agreementLanguage:string;effectiveAt:number|null;snapshotJson:string|null;
}
const selectRow = `SELECT id,seller_id AS sellerId,requested_by AS requestedBy,reviewed_by AS reviewedBy,status,version,
  legal_name AS legalName,registration_authority AS registrationAuthority,registration_number AS registrationNumber,
  tax_mode AS taxMode,tax_registration_number AS taxRegistrationNumber,agreement_version AS agreementVersion,
  agreement_accepted_at AS agreementAcceptedAt,agreement_language AS agreementLanguage,effective_at AS effectiveAt,
  registered_terms_snapshot_json AS snapshotJson FROM seller_route_transition_applications`;
function required(label:string,value:string,min=2,max=191) {
  const text=typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
  if(text.length<min||text.length>max||/[<>\p{Cc}]/u.test(text))throw new RangeError(`${label} must contain ${min}–${max} safe characters.`);
  return text;
}
function guard(db:D1Database,sql:string,values:unknown[]) {
  const id=crypto.randomUUID();
  return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${sql} THEN 1 ELSE 0 END`).bind(id,...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}
function activeMakerGuards(db:D1Database,input:{sellerId:string;actorId:string;now:number}) {
  return [...makerMutationGuards(db,input),...guard(db,`EXISTS(SELECT 1 FROM seller_participation_profiles WHERE seller_id=? AND application_stage='active' AND participation_route='managed_maker')`,[input.sellerId])];
}
async function owner(db:D1Database,sellerId:string,actorId:string,now:number,allowRegistered=false) {
  if(!await db.prepare(`SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
    JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.id=? AND u.id=? AND u.status='active'
      AND (p.participation_route='managed_maker' OR (?=1 AND p.participation_route='registered_seller'))
      AND NOT EXISTS(SELECT 1 FROM seller_restrictions r WHERE r.seller_id=s.id AND
        (r.mode='disabled' OR (r.mode='suspended' AND r.suspended_until>?)))`).bind(sellerId,actorId,allowRegistered?1:0,now).first())
    throw new RouteTransitionError('Only the active, unrestricted maker account holder may use this transition.');
}
async function evidence(db:D1Database,sellerId:string,references:readonly string[],taxMode:string,now:number,uploads:readonly SellerApplicationDocument[] = []) {
  if(!Array.isArray(references)||references.length<3||references.length>4||new Set(references).size!==references.length)
    throw new RouteTransitionError('Provide private company registration, tax certificates and receiving-account evidence.');
  const kinds=['bank_verification',...(taxMode==='PAN'?['business_registration','pan_certificate']:taxMode==='VAT'?['business_registration','vat_certificate']:['business_registration','pan_certificate','vat_certificate'])];
  const documents:Evidence[]=[];
  for(const reference of references) {
    const upload=uploads.find(document=>document.id===reference);
    const row=upload ? {id:upload.id,kind:upload.kind,objectKey:upload.objectKey,uploadedAt:now,sizeBytes:upload.sizeBytes} : await db.prepare(`SELECT id,kind,object_key AS objectKey,uploaded_at AS uploadedAt,size_bytes AS sizeBytes
      FROM seller_documents WHERE id=? AND seller_id=? AND status IN ('pending','verified') AND uploaded_at<=?`).bind(required('Private document ID',reference,1),sellerId,now).first<Evidence>();
    if(!row||!row.objectKey.startsWith(`private/seller-documents/${sellerId}/`)||!kinds.includes(row.kind))
      throw new RouteTransitionError('Required private registration, tax or receiving-account evidence is missing, rejected or belongs to another maker.');
    if (row.kind==='pan_certificate' && !upload && !row.objectKey.startsWith(`private/seller-documents/${sellerId}/transition-`))
      throw new RouteTransitionError('Upload a business PAN certificate for this transition. A retained personal PAN certificate cannot prove business registration.');
    documents.push(row);
  }
  if(kinds.some(kind=>documents.filter(document=>document.kind===kind).length!==1)||documents.length!==kinds.length)
    throw new RouteTransitionError('Provide exactly one private certificate of each required kind.');
  return documents.toSorted((a,b)=>a.kind.localeCompare(b.kind));
}
function evidenceGuards(db:D1Database,sellerId:string,documents:readonly Evidence[],verified=false) {
  return documents.flatMap(document=>guard(db,`EXISTS(SELECT 1 FROM seller_documents WHERE id=? AND seller_id=? AND kind=?
    AND object_key=? AND uploaded_at=? AND size_bytes=? AND ${verified?"status='verified'":"status IN ('pending','verified')"})`,
    [document.id,sellerId,document.kind,document.objectKey,document.uploadedAt,document.sizeBytes]));
}
function termsGuard(db:D1Database,snapshot:TermsSnapshot,now:number) {
  return guard(db,`COALESCE((SELECT id FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps'
    AND status='published' AND effective_from<=? AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=?`,
    [now,now,snapshot.commissionSettingVersionId??'']);
}
async function validatedSnapshot(db:D1Database,input:RegisteredTransitionInput):Promise<TermsSnapshot> {
  if (isPendingPayoutReference(input.payoutAccountReference??'')) throw new RouteTransitionError('A reviewed receiving-account reference is required.');
  if(!['PAN','VAT','BOTH'].includes(input.taxMode))throw new RangeError('Select PAN, VAT, or both.');
  const terms=await getRegisteredSellerTerms(db,input.now);
  if(input.registeredTermsContext!==terms.context||input.agreementVersion!==terms.agreementVersion||input.agreementLanguage!=='en'||input.agreementAcceptedAt!==input.now)
    throw new RouteTransitionError('Review and explicitly accept the current English Registered Seller agreement and commission terms.');
  return {schema:1,context:terms.context,agreementVersion:terms.agreementVersion,commissionSettingVersionId:terms.versionId,commissionBps:terms.basisPoints,
    document:terms.document,language:'en',acceptedAt:input.now,acceptedBy:input.actorId,payoutAccountReference:required('Receiving-account reference',input.payoutAccountReference??'',4,200),
    settlementTermsReference:`registered-seller-agreement:${terms.context}`,evidence:await evidence(db,input.sellerId,input.evidenceReferences,input.taxMode,input.now,input.documents)};
}
export async function validateRegisteredTransitionInput(db:D1Database,input:RegisteredTransitionInput) {
  assertSimulationAllowed(input.environment);
  if(!Number.isSafeInteger(input.now)||input.now<1)throw new RangeError('Choose a valid transition submission time.');
  const authority=await getManagedMakerAuthority(db,input.actorId,input.now);
  if(authority.sellerId!==input.sellerId||authority.stage!=='active')throw new RouteTransitionError('Only an active Managed Maker may submit this transition.');
  required('Legal name',input.legalName);required('Registration authority',input.registrationAuthority);required('Registration number',input.registrationNumber);required('Tax registration number',input.taxRegistrationNumber);
  return validatedSnapshot(db,input);
}
function snapshot(row:TransitionRow):TermsSnapshot {
  try {
    const value=JSON.parse(row.snapshotJson??'null') as TermsSnapshot|null;
    if(!value||value.schema!==1||value.acceptedBy!==row.requestedBy||value.acceptedAt!==row.agreementAcceptedAt||value.agreementVersion!==row.agreementVersion||
      value.language!==row.agreementLanguage||!Array.isArray(value.evidence)||!value.context||
      required('Receiving-account reference',value.payoutAccountReference,4,200)!==value.payoutAccountReference||value.settlementTermsReference!==`registered-seller-agreement:${value.context}`)throw new Error();
    return value;
  } catch {throw new RouteTransitionError('The original registration documents and accepted seller terms need renewed review.');}
}
function digestInput(input:RegisteredTransitionInput,applicationId?:string,expectedVersion?:number) {
  if(input.form?.digest)return Promise.resolve(input.form.digest);
  return digestFormRequest({sellerId:input.sellerId,legalName:input.legalName,registrationAuthority:input.registrationAuthority,registrationNumber:input.registrationNumber,
    taxMode:input.taxMode,taxRegistrationNumber:input.taxRegistrationNumber,evidenceReferences:input.evidenceReferences,agreementVersion:input.agreementVersion,
    agreementLanguage:input.agreementLanguage,registeredTermsContext:input.registeredTermsContext,payoutAccountReference:input.payoutAccountReference,applicationId,expectedVersion,
    versionId:input.form?.versionId??null,answers:input.form?.answers??null});
}
async function replaySubmission(db:D1Database,input:RegisteredTransitionInput,digest:string,action:string) {
  await owner(db,input.sellerId,input.actorId,input.now,true);
  if(input.form) {
    const id=await formRequestReplay(db,{formId:'seller.managed-transition-request',requestId:input.requestId,actorId:input.actorId,action,digest});
    if(id&&!await db.prepare('SELECT 1 FROM seller_route_transition_applications WHERE id=? AND seller_id=? AND requested_by=?').bind(id,input.sellerId,input.actorId).first())throw new FormRequestConflictError('The transition parent changed.');
    return id;
  }
  const row=await db.prepare(`SELECT actor_id AS actorId,subject_id AS subjectId,action,next_json AS json FROM audit_logs WHERE request_id=?`).bind(input.requestId).first<{actorId:string;subjectId:string;action:string;json:string}>();
  if(!row)return null;
  if(row.actorId!==input.actorId||row.action!==action||JSON.parse(row.json).catalogDigest!==digest||
    !await db.prepare('SELECT 1 FROM seller_route_transition_applications WHERE id=? AND seller_id=? AND requested_by=?').bind(row.subjectId,input.sellerId,input.actorId).first())throw new FormRequestConflictError('Request reference already records different transition content.');
  return row.subjectId;
}
async function submit(db:D1Database,input:RegisteredTransitionInput,correction?:{applicationId:string;expectedVersion:number}) {
  assertSimulationAllowed(input.environment);required('Request ID',input.requestId,1);
  const action=correction?'seller.route_transition.resubmitted':'seller.route_transition.requested';
  const digest=await digestInput(input,correction?.applicationId,correction?.expectedVersion);
  const previous=await replaySubmission(db,input,digest,action);if(previous)return previous;
  const accepted=await validateRegisteredTransitionInput(db,input);
  const values=[required('Legal name',input.legalName),required('Registration authority',input.registrationAuthority),required('Registration number',input.registrationNumber),input.taxMode,
    required('Tax registration number',input.taxRegistrationNumber),JSON.stringify(accepted.evidence.map(item=>item.id)),accepted.agreementVersion,accepted.language,accepted.acceptedAt,JSON.stringify(accepted)];
  const id=correction?.applicationId??crypto.randomUUID();
  const statements:D1PreparedStatement[]=[...activeMakerGuards(db,input)];
  if(input.documents?.some(document=>!accepted.evidence.some(item=>item.id===document.id)))throw new RouteTransitionError('Unexpected registration document upload.');
  for(const document of input.documents??[])statements.push(db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
    VALUES(?,?,?,?,?,?,?,'pending',?)`).bind(document.id,input.sellerId,document.kind,document.objectKey,document.originalName,document.mimeType,document.sizeBytes,input.now));
  statements.push(...evidenceGuards(db,input.sellerId,accepted.evidence),...termsGuard(db,accepted,input.now));
  if(correction) {
    if(!Number.isSafeInteger(correction.expectedVersion)||correction.expectedVersion<1)throw new RouteTransitionError('Reload the transition before correcting it.');
    statements.push(...guard(db,`EXISTS(SELECT 1 FROM seller_route_transition_applications WHERE id=? AND seller_id=? AND requested_by=? AND status='changes_requested' AND version=?)`,[id,input.sellerId,input.actorId,correction.expectedVersion]),
      db.prepare(`UPDATE seller_route_transition_applications SET legal_name=?,registration_authority=?,registration_number=?,tax_mode=?,tax_registration_number=?,
        evidence_references_json=?,agreement_version=?,agreement_language=?,agreement_accepted_at=?,registered_terms_snapshot_json=?,status='submitted',reviewed_by=NULL,
        review_reason=NULL,effective_at=NULL,decision_request_id=NULL,version=version+1,updated_at=? WHERE id=? AND status='changes_requested' AND version=?`)
        .bind(...values,input.now,id,correction.expectedVersion));
  } else statements.push(db.prepare(`INSERT INTO seller_route_transition_applications(id,seller_id,from_route,to_route,status,legal_name,registration_authority,registration_number,
    tax_mode,tax_registration_number,evidence_references_json,agreement_version,agreement_language,agreement_accepted_at,registered_terms_snapshot_json,requested_by,request_id,version,created_at,updated_at)
    VALUES (?,?,'managed_maker','registered_seller','submitted',?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).bind(id,input.sellerId,...values,input.actorId,input.requestId,input.now,input.now));
  statements.push(db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
    VALUES (?,?,?,'seller_route_transition',?,'Simulated registered-seller evidence and terms submitted',?,?,?)`)
    .bind(crypto.randomUUID(),input.actorId,action,id,JSON.stringify({catalogDigest:digest,registeredTerms:accepted,
      legalName:input.legalName,registrationAuthority:input.registrationAuthority,registrationNumber:input.registrationNumber,taxMode:input.taxMode,
      taxRegistrationNumber:input.taxRegistrationNumber,simulationLabel:SIMULATED_RECORD_LABEL}),input.requestId,input.now));
  if(input.form)statements.push(buildFormAnswerInsert(db,{formId:'seller.managed-transition-request',requestId:input.requestId,versionId:input.form.versionId,subjectType:'seller_route_transition',subjectId:id,actorId:input.actorId,answers:input.form.answers,now:input.now}));
  try {await db.batch(statements);}catch(error){const prior=await replaySubmission(db,input,digest,action);if(prior)return prior;throw error;}
  return id;
}
export async function submitRegisteredSellerTransition(db:D1Database,input:RegisteredTransitionInput):Promise<string>{return submit(db,input);}
export async function resubmitRegisteredSellerTransition(db:D1Database,input:RegisteredTransitionInput & {applicationId:string;expectedVersion:number}):Promise<string>{return submit(db,input,input);}

export async function reviewRouteTransition(db:D1Database,input:{applicationId:string;actorId:string;action:'approve'|'reject'|'request_changes';reason:string;effectiveAt?:number;requestId:string;now:number;environment:RuntimeEnvironment;form?:TransitionForm}):Promise<void> {
  assertSimulationAllowed(input.environment);
  if(!['approve','reject','request_changes'].includes(input.action))throw new RangeError('Choose a supported transition decision.');
  const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',RouteTransitionError,'super_admin');
  const status=input.action==='approve'?'scheduled':input.action==='reject'?'rejected':'changes_requested';
  const digest=await digestFormRequest({applicationId:input.applicationId,action:input.action,reason:input.reason,effectiveAt:input.effectiveAt,versionId:input.form?.versionId??null,answers:input.form?.answers??null});
  if(input.form&&await decisionFormReplay(db,{formId:'staff.managed-transition-decision',requestId:input.requestId,actorId:input.actorId,action:`seller_route_transition.${status}`,subjectType:'seller_route_transition',subjectId:input.applicationId,versionId:input.form.versionId,digest}))return;
  const row=await db.prepare(`${selectRow} WHERE id=?`).bind(input.applicationId).first<TransitionRow>();
  if(!row)throw new RouteTransitionError('Transition not found.');
  if(row.requestedBy===input.actorId)throw new RouteTransitionError('A different active Super Admin must review this transition.');
  if(!input.form){const prior=await db.prepare('SELECT next_json AS json,actor_id AS actorId FROM audit_logs WHERE request_id=? AND subject_id=? AND action=?').bind(input.requestId,row.id,`seller_route_transition.${status}`).first<{json:string;actorId:string}>();
    if(prior){if(prior.actorId===input.actorId&&JSON.parse(prior.json).catalogDigest===digest)return;throw new FormRequestConflictError('The recorded transition decision differs.');}}
  if(row.status!=='submitted')throw new RouteTransitionError('Only a current submitted transition can be reviewed.');
  const reason=required('Review reason',input.reason,10,1000);const effectiveAt=input.action==='approve'?input.effectiveAt:null;
  if(input.action==='approve'&&(!Number.isSafeInteger(effectiveAt)||Number(effectiveAt)<input.now))throw new RouteTransitionError('Approved transitions require a future or current effective time.');
  const statements:D1PreparedStatement[]=[...authority.statements,...guard(db,`EXISTS(SELECT 1 FROM seller_route_transition_applications WHERE id=? AND version=? AND status='submitted' AND requested_by<>?)`,[row.id,row.version,input.actorId])];
  if(input.action==='approve') {
    const original=snapshot(row);const terms=await getRegisteredSellerTerms(db,input.now);
    if(terms.context!==original.context)throw new RouteTransitionError('Seller terms changed. Request corrections and ask the maker to accept the current terms.');
    const current=await evidence(db,row.sellerId,original.evidence.map(item=>item.id),row.taxMode,input.now);
    if(JSON.stringify(current)!==JSON.stringify(original.evidence))throw new RouteTransitionError('Private evidence changed. Request corrections before approval.');
    statements.push(...activeMakerGuards(db,{sellerId:row.sellerId,actorId:row.requestedBy,now:input.now}),...evidenceGuards(db,row.sellerId,original.evidence),...termsGuard(db,original,input.now));
    for(const document of original.evidence)statements.push(db.prepare(`UPDATE seller_documents SET status='verified',reviewed_at=?,reviewed_by=? WHERE id=? AND seller_id=?`).bind(input.now,input.actorId,document.id,row.sellerId));
  }
  statements.push(db.prepare(`UPDATE seller_route_transition_applications SET status=?,reviewed_by=?,review_reason=?,effective_at=?,decision_request_id=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status='submitted'`)
    .bind(status,input.actorId,reason,effectiveAt,input.requestId,input.now,row.id,row.version),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES (?,?,?,'seller_route_transition',?,?,?,?,?)`)
      .bind(crypto.randomUUID(),input.actorId,`seller_route_transition.${status}`,row.id,reason,JSON.stringify({status,effectiveAt,catalogDigest:digest,simulationLabel:SIMULATED_RECORD_LABEL}),input.requestId,input.now));
  if(input.form)statements.push(buildFormAnswerInsert(db,{formId:'staff.managed-transition-decision',requestId:input.requestId,versionId:input.form.versionId,subjectType:'seller_route_transition',subjectId:row.id,actorId:input.actorId,answers:input.form.answers,now:input.now}));
  await db.batch(statements);
}

type ApplyInvocation={actorId:string;reason:string;requestId:string;digest:string;form:TransitionForm};
async function invocationStatements(db:D1Database,row:TransitionRow,now:number,status:string,invocation?:ApplyInvocation) {
  if(!invocation)return [];
  const authority=await staffMutationGuard(db,invocation.actorId,'seller.application.review',RouteTransitionError,'super_admin');
  return [...authority.statements,...guard(db,`EXISTS(SELECT 1 FROM form_config_versions WHERE id=? AND form_id='staff.managed-transition-decision'
    AND status='published' AND id=(SELECT id FROM form_config_versions WHERE form_id='staff.managed-transition-decision' AND status='published' ORDER BY version DESC LIMIT 1))`,[invocation.form.versionId]),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
      VALUES (?,?,'seller_route_transition.apply_requested','seller_route_transition',?,?,?,?,?)`)
      .bind(crypto.randomUUID(),invocation.actorId,row.id,invocation.reason,JSON.stringify({catalogDigest:invocation.digest,status,simulationLabel:SIMULATED_RECORD_LABEL}),invocation.requestId,now),
    buildFormAnswerInsert(db,{formId:'staff.managed-transition-decision',requestId:invocation.requestId,versionId:invocation.form.versionId,subjectType:'seller_route_transition',subjectId:row.id,actorId:invocation.actorId,answers:invocation.form.answers,now})];
}
async function applyOne(db:D1Database,row:TransitionRow,now:number,invocation?:ApplyInvocation) {
  const original=snapshot(row);const terms=await getRegisteredSellerTerms(db,now);
  if(terms.context!==original.context)throw new RouteTransitionError('Seller commission terms changed. The maker must renew acceptance before this transition can apply.');
  await owner(db,row.sellerId,row.requestedBy,now);
  const current=await evidence(db,row.sellerId,original.evidence.map(item=>item.id),row.taxMode,now);
  if(JSON.stringify(current)!==JSON.stringify(original.evidence))throw new RouteTransitionError('Registration or tax evidence changed. Renew the private evidence review.');
  if(!row.reviewedBy)throw new RouteTransitionError('An independent Super Admin must review this transition.');
  const reviewer=await staffMutationGuard(db,row.reviewedBy,'seller.application.review',RouteTransitionError,'super_admin');
  const requestId=`route-transition-apply:${row.id}`;
  const acceptance=await prepareSellerCommissionAcceptance(db,{sellerId:row.sellerId,actorId:row.requestedBy,context:original.context,requestId,
    now,language:'en',mode:'managed_transition',transitionId:row.id,acceptedAt:original.acceptedAt});
  await db.batch([...reviewer.statements,...activeMakerGuards(db,{sellerId:row.sellerId,actorId:row.requestedBy,now}),
    ...evidenceGuards(db,row.sellerId,original.evidence,true),...termsGuard(db,original,now),
    ...guard(db,`EXISTS(SELECT 1 FROM seller_route_transition_applications WHERE id=? AND version=? AND status='scheduled' AND effective_at<=?
      AND reviewed_by=? AND requested_by<>reviewed_by AND registered_terms_snapshot_json=?)`,[row.id,row.version,now,row.reviewedBy,row.snapshotJson]),
    db.prepare(`UPDATE seller_route_transition_applications SET status='applied',applied_at=?,version=version+1,updated_at=? WHERE id=? AND status='scheduled' AND version=?`).bind(now,now,row.id,row.version),
    db.prepare(`UPDATE seller_profiles SET legal_name=?,registration_authority=?,registration_number=?,tax_mode=?,tax_registration_number=?,
      seller_agreement_version=?,seller_agreement_accepted_at=?,payout_account_reference=?,settlement_terms_reference=?,status='approved',approved_at=COALESCE(approved_at,?),updated_at=? WHERE id=?`)
      .bind(row.legalName,row.registrationAuthority,row.registrationNumber,row.taxMode,row.taxRegistrationNumber,original.agreementVersion,original.acceptedAt,original.payoutAccountReference,original.settlementTermsReference,now,now,row.sellerId),
    db.prepare(`UPDATE seller_participation_profiles SET participation_route='registered_seller',application_stage='active',tax_status=?,commercial_model=NULL,version=version+1,updated_at=? WHERE seller_id=? AND participation_route='managed_maker'`)
      .bind(row.taxMode==='PAN'?'business_pan_only':'vat_registered',now,row.sellerId),...acceptance.statements,
    db.prepare(`INSERT OR IGNORE INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES (?,'seller',?,?)`).bind(row.requestedBy,row.reviewedBy,now),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at)
      VALUES (?,NULL,'seller_route_transition.applied','seller',?,'Reviewed simulated transition became effective',?,?,?,?)`)
      .bind(crypto.randomUUID(),row.sellerId,JSON.stringify({participationRoute:'managed_maker'}),JSON.stringify({participationRoute:'registered_seller',effectiveAt:row.effectiveAt,
        acceptedAt:original.acceptedAt,commissionSettingVersionId:original.commissionSettingVersionId,commissionBps:original.commissionBps,simulationLabel:SIMULATED_RECORD_LABEL}),requestId,now),
    ...await invocationStatements(db,row,now,'applied',invocation)]);
}
export async function applyDueRouteTransitions(db:D1Database,now:number,environment:RuntimeEnvironment,applicationId?:string,invocation?:ApplyInvocation):Promise<number> {
  assertSimulationAllowed(environment);if(!Number.isSafeInteger(now)||now<0)throw new RangeError('Choose a valid transition processing time.');
  const due=await db.prepare(`${selectRow} WHERE status='scheduled' AND effective_at<=? ${applicationId?'AND id=?':''} ORDER BY effective_at,id LIMIT 100`).bind(now,...(applicationId?[applicationId]:[])).all<TransitionRow>();
  let applied=0;
  for(const row of due.results) {
    try {await applyOne(db,row,now,invocation);applied++;}
    catch(error) {
      if(!await db.prepare("SELECT 1 FROM seller_route_transition_applications WHERE id=? AND status='scheduled' AND version=?").bind(row.id,row.version).first())continue;
      const reason=error instanceof RouteTransitionError?error.message:'Transition requirements changed during processing. Review private documents, current terms and account access, then resubmit.';
      await db.batch([...guard(db,`EXISTS(SELECT 1 FROM seller_route_transition_applications WHERE id=? AND status='scheduled' AND version=?)`,[row.id,row.version]),
        db.prepare("UPDATE seller_route_transition_applications SET status='changes_requested',review_reason=?,version=version+1,updated_at=? WHERE id=? AND status='scheduled' AND version=?").bind(reason,now,row.id,row.version),
        db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
          VALUES (?,NULL,'seller_route_transition.review_required','seller_route_transition',?,?,?,?,?)`)
          .bind(crypto.randomUUID(),row.id,reason,JSON.stringify({status:'changes_requested',simulationLabel:SIMULATED_RECORD_LABEL}),`route-transition-review-required:${row.id}:${row.version}`,now),
        ...await invocationStatements(db,row,now,'changes_requested',invocation)]);
    }
  }
  return applied;
}

export async function applyReviewedRouteTransition(db:D1Database,input:{applicationId:string;actorId:string;reason:string;requestId:string;now:number;environment:RuntimeEnvironment;form:TransitionForm}) {
  assertSimulationAllowed(input.environment);
  await staffMutationGuard(db,input.actorId,'seller.application.review',RouteTransitionError,'super_admin');
  const reason=required('Review reason',input.reason,10,1000);
  const digest=await digestFormRequest({applicationId:input.applicationId,reason,versionId:input.form.versionId,answers:input.form.answers});
  const action='seller_route_transition.apply_requested';
  if(await decisionFormReplay(db,{formId:'staff.managed-transition-decision',requestId:input.requestId,actorId:input.actorId,action,subjectType:'seller_route_transition',subjectId:input.applicationId,versionId:input.form.versionId,digest}))return;
  const row=await db.prepare(`${selectRow} WHERE id=?`).bind(input.applicationId).first<TransitionRow>();
  if(!row||!['scheduled','applied','changes_requested'].includes(row.status))throw new RouteTransitionError('Only a reviewed transition can be checked for application.');
  const invocation={actorId:input.actorId,reason,requestId:input.requestId,digest,form:input.form};
  if(row.status==='scheduled'&&row.effectiveAt!==null&&row.effectiveAt<=input.now)
    await applyDueRouteTransitions(db,input.now,input.environment,input.applicationId,invocation);
  else await db.batch(await invocationStatements(db,row,input.now,row.status,invocation));
}
