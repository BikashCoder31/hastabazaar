import {protectedAdminCasePreflight} from './protected-admin-recovery';
import type {SellerApplicationDocument} from './application';
import {governmentIdTypes} from './managed-identity';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {ProtectedChangeError,protectedGuard,protectedCaseHoldStatements} from './protected-change-policy';
import {currentProtectedPermission,protectedCommand,protectedOwner,protectedOwnerGuards,protectedChangeEvent,protectedChangeNotice,protectedIdentityFields} from './protected-change-requests';

type Command={actorId:string;actorAuthSubject?:string|null;requestId:string;now:number};
const profileColumns={legalName:'legal_name',representativeName:'representative_name',taxRegistrationNumber:'tax_registration_number',registrationAuthority:'registration_authority',registrationNumber:'registration_number'} as const;
const proofKinds=['representative_identity','pan_certificate','business_registration'] as const;
/** Private caller must already establish owner or Super Admin access. */
export async function currentProtectedIdentity(db:D1Database,sellerId:string):Promise<Record<string,string>>{
  const profile=await db.prepare(`SELECT legal_name AS legalName,COALESCE(representative_name,'') AS representativeName,COALESCE(tax_registration_number,'') AS taxRegistrationNumber,
    COALESCE(registration_authority,'') AS registrationAuthority,COALESCE(registration_number,'') AS registrationNumber,applicant_type AS applicantType,tax_mode AS taxMode FROM seller_profiles WHERE id=?`)
    .bind(sellerId).first<Record<string,string>>();if(!profile)throw new ProtectedChangeError('Identity record not found.',404);
  const managed=await db.prepare(`SELECT government_id_type AS governmentIdType,government_id_description AS governmentIdDescription,COALESCE(personal_pan,'') AS personalPan
    FROM managed_maker_application_details WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 1`).bind(sellerId).first<Record<string,string>>();
  const intake=await db.prepare('SELECT answers_json AS answers FROM seller_registration_intakes WHERE seller_id=?').bind(sellerId).first<{answers:string}>();
  const declared:Record<string,string>={};
  if(intake){
    const answers=JSON.parse(intake.answers)as Record<string,unknown>;
    for(const key of ['governmentIdType','governmentIdDescription','personalPan']){
      const values=answers[key];if(values===undefined)continue;
      if(!Array.isArray(values)||values.some(value=>typeof value!=='string'))throw new ProtectedChangeError('The recorded identity source needs reconciliation before another change.');
      if(typeof values[0]==='string')declared[key]=values[0];
    }
  }
  const saved=await db.prepare('SELECT facts_json AS facts FROM seller_identity_fact_versions WHERE seller_id=? ORDER BY identity_revision DESC LIMIT 1')
    .bind(sellerId).first<{facts:string}>();
  return{governmentIdType:'',governmentIdDescription:'',personalPan:'',...declared,...managed,...(saved?JSON.parse(saved.facts) as Record<string,string>:{}),...profile};
}
export function requiredIdentityProofs(facts:Record<string,string>,values:Record<string,string>,scope:readonly string[]){
  const kinds=new Set(scope.filter(kind=>(proofKinds as readonly string[]).includes(kind)));
  const changed=(fields:readonly string[])=>fields.some(field=>values[field]!==undefined&&values[field]!==facts[field]);
  if(changed(['representativeName','governmentIdType','governmentIdDescription'])||facts.applicantType==='individual'&&changed(['legalName']))kinds.add('representative_identity');
  if(changed(['personalPan','taxRegistrationNumber'])||facts.taxMode!=='NONE'&&changed(['legalName']))kinds.add('pan_certificate');
  if(changed(['registrationAuthority','registrationNumber'])||facts.applicantType==='company'&&changed(['legalName']))kinds.add('business_registration');
  return [...kinds];
}
function normalizeValues(values:Record<string,string>,scope:readonly string[]){
  if(!values||typeof values!=='object'||Array.isArray(values))throw new ProtectedChangeError('Provide the permitted protected facts.',400);
  const result:Record<string,string>={};
  for(const [key,value] of Object.entries(values)){
    if(!scope.includes(key)||!(protectedIdentityFields as readonly string[]).includes(key)||(proofKinds as readonly string[]).includes(key)||typeof value!=='string')
      throw new ProtectedChangeError('Only the exact permitted facts may change. Ownership or entity transfer requires separate onboarding.',400);
    const clean=value.trim();if(clean.length>200||!['personalPan','governmentIdDescription'].includes(key)&&clean.length<2)
      throw new ProtectedChangeError('Enter a valid protected value of at most 200 characters.',400);
    if(['personalPan','taxRegistrationNumber'].includes(key)&&clean&&!/^\d{9}$/.test(clean))throw new ProtectedChangeError('PAN must contain exactly nine digits.',400);
    if(key==='governmentIdType'&&!(governmentIdTypes as readonly string[]).includes(clean))throw new ProtectedChangeError('Choose a recognized government identity type.',400);
    result[key]=clean;
  }return result;
}
type IdentitySubmission={sellerId:string;caseId:string;permissionId:string;actorId:string;values:Record<string,string>;documents:readonly SellerApplicationDocument[]};
export async function inspectProtectedIdentitySubmission(db:D1Database,input:IdentitySubmission){
  const permission=await currentProtectedPermission(db,input.sellerId,input.caseId,input.permissionId,input.actorId);
  if(permission.kind!=='identity')throw new ProtectedChangeError('Use the bank ownership review for bank changes.',400);
  const scope=JSON.parse(permission.scope) as string[],values=normalizeValues(input.values,scope),before=await currentProtectedIdentity(db,input.sellerId);
  const effective={...before,...values};if(effective.governmentIdType==='other_government_id'&&effective.governmentIdDescription.length<3)
    throw new ProtectedChangeError('Describe the government document and issuing authority.',400);
  if(Object.keys(values).some(key=>['governmentIdType','governmentIdDescription'].includes(key))&&!(governmentIdTypes as readonly string[]).includes(effective.governmentIdType))
    throw new ProtectedChangeError('The permitted scope must include a valid government identity type with its description.',400);
  if(before.taxMode==='NONE'&&['taxRegistrationNumber','registrationAuthority','registrationNumber'].some(key=>values[key]!==undefined&&values[key]!==before[key]))
    throw new ProtectedChangeError('Business registration and commercial-route changes need their separate onboarding review. Use personal PAN for an individual identity correction.',400);
  const required=requiredIdentityProofs(before,values,scope),provided=input.documents.map(document=>document.kind);
  if(!required.length||provided.length!==required.length||new Set(provided).size!==provided.length||required.some(kind=>!provided.includes(kind as SellerApplicationDocument['kind'])))
    throw new ProtectedChangeError(`Supply the exact supporting evidence: ${required.join(', ')||'request a material fact or evidence change first'}.`,400);
  for(const document of input.documents)if(!/^[A-Za-z0-9_-]{1,160}$/.test(document.id)||document.objectKey!==`private/seller-documents/${input.sellerId}/${document.id}`
    ||!['image/png','image/jpeg','application/pdf'].includes(document.mimeType)||!Number.isSafeInteger(document.sizeBytes)||document.sizeBytes<1||document.sizeBytes>5*1024*1024
    ||!document.originalName.trim()||document.originalName.length>180)throw new ProtectedChangeError('Use valid private identity evidence.',400);
  return{permission,values,before};
}
export async function submitProtectedIdentityChange(db:D1Database,input:Command&IdentitySubmission){
  await protectedOwner(db,input.sellerId,input.actorId);
  const command=await protectedCommand(db,input,'identity_submitted',input.caseId,input.permissionId,{sellerId:input.sellerId,values:input.values,documents:input.documents});
  if(command.receipt.replayed)return;
  const {permission,values,before}=await inspectProtectedIdentitySubmission(db,input);
  const authority=await staffMutationGuard(db,permission.reviewedBy,'seller.application.review',ProtectedChangeError,'super_admin'),eventId=crypto.randomUUID();
  const material=Object.entries(values).some(([key,value])=>value!==before[key]);
  const proposal={values,before,documents:input.documents.map(document=>document.id),identityRevision:permission.identityRevision,bankRevision:permission.bankRevision};
  await command.commit([...protectedOwnerGuards(db,input.sellerId,input.actorId),...authority.statements,
    ...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_protected_change_permissions p JOIN seller_protected_change_cases c ON c.id=p.case_id
      JOIN seller_protected_revisions v ON v.seller_id=c.seller_id WHERE p.id=? AND c.id=? AND c.seller_id=? AND c.status='open' AND c.version=? AND c.active_permission_id=p.id
        AND p.used_at IS NULL AND p.reviewed_by=? AND v.identity_revision=p.identity_revision AND v.bank_revision=p.bank_revision)`,[input.permissionId,input.caseId,input.sellerId,permission.version,permission.reviewedBy]),
    ...input.documents.flatMap(document=>[...protectedGuard(db,`NOT EXISTS(SELECT 1 FROM seller_documents WHERE seller_id=? AND kind=? AND uploaded_at>=?)`,[input.sellerId,document.kind,input.now]),
      db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,protected_change_id) VALUES(?,?,?,?,?,?,?,'pending',?,?)`)
        .bind(document.id,input.sellerId,document.kind,document.objectKey,document.originalName,document.mimeType,document.sizeBytes,input.now,input.caseId)]),
    db.prepare('UPDATE seller_protected_change_permissions SET used_document_id=?,used_at=? WHERE id=?').bind(input.documents[0].id,input.now,input.permissionId),
    db.prepare(`UPDATE seller_protected_change_cases SET proposed_json=?,replacement_document_id=?,classification=CASE WHEN ?=1 THEN 'material' ELSE classification END,active_permission_id=NULL,version=version+1,operation_request_id=?,updated_at=? WHERE id=?`)
      .bind(JSON.stringify(proposal),input.documents[0].id,material?1:0,eventId,input.now,input.caseId),
    ...(permission.sourceRequestId?[db.prepare("UPDATE seller_document_change_requests SET status='completed',replacement_document_id=?,active_permission_id=NULL WHERE id=?")
      .bind(input.documents[0].id,permission.sourceRequestId)]:[]),
    ...(material?protectedCaseHoldStatements(db,input.caseId,input.now):[]),
    protectedChangeEvent(db,input,input.caseId,'identity_submitted','Permitted facts and evidence submitted for verification',proposal),
    ...await protectedChangeNotice(db,input.caseId,permission.sourceRequestId,eventId,input),
  ],input.caseId);
}

export async function verifyProtectedIdentityChange(db:D1Database,input:Command&{caseId:string;expectedVersion:number;expectedIdentityRevision:number;expectedBankRevision:number;sameLegalPersonConfirmed:boolean;evidenceReference:string;reason:string}){
  const reason=input.reason.trim(),reference=input.evidenceReference.trim();
  if(input.sameLegalPersonConfirmed!==true||reason.length<10||reason.length>1000||reference.length<4||reference.length>191)
    throw new ProtectedChangeError('Inspect the evidence and confirm the same legal person or entity with a reason and verification reference.',400);
  const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',ProtectedChangeError,'super_admin');
  const command=await protectedCommand(db,input,'identity_verified',input.caseId,String(input.expectedVersion),{identityRevision:input.expectedIdentityRevision,bankRevision:input.expectedBankRevision,sameLegalPersonConfirmed:true,reason,reference});
  if(command.receipt.replayed)return;
  await protectedAdminCasePreflight(db,input);
  const current=await db.prepare(`SELECT seller_id AS sellerId,source_request_id AS sourceRequestId,proposed_json AS proposal FROM seller_protected_change_cases WHERE id=? AND kind='identity'`)
    .bind(input.caseId).first<{sellerId:string;sourceRequestId:string|null;proposal:string|null}>();if(!current?.proposal)throw new ProtectedChangeError('A complete identity proposal is required.');
  const proposal=JSON.parse(current.proposal) as {values:Record<string,string>;before:Record<string,string>;documents:string[];identityRevision:number;bankRevision:number};
  const facts={...proposal.before,...proposal.values},eventId=crypto.randomUUID(),factId=crypto.randomUUID();
  const profile=Object.entries(profileColumns).filter(([key])=>proposal.values[key]!==undefined);
  const managed=await db.prepare('SELECT id,created_at AS createdAt FROM managed_maker_application_details WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 1')
    .bind(current.sellerId).first<{id:string;createdAt:number}>();
  const intake=await db.prepare('SELECT version,answers_json AS answers,documents_json AS documents FROM seller_registration_intakes WHERE seller_id=?')
    .bind(current.sellerId).first<{version:number;answers:string;documents:string}>();
  if(managed&&managed.createdAt>input.now)throw new ProtectedChangeError('The current identity record is newer than this review. Refresh before deciding.');
  const statement=[...authority.statements,...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id
    JOIN users u ON u.id=s.user_id JOIN seller_protected_revisions v ON v.seller_id=s.id WHERE c.id=? AND c.version=? AND c.status='open' AND c.proposed_json=?
      AND s.user_id<>? AND u.status='active' AND v.identity_revision=? AND v.bank_revision=? AND v.identity_revision=? AND v.bank_revision=?)`,
      [input.caseId,input.expectedVersion,current.proposal,input.actorId,input.expectedIdentityRevision,input.expectedBankRevision,proposal.identityRevision,proposal.bankRevision])];
  statement.push(...protectedGuard(db,`COALESCE((SELECT id FROM managed_maker_application_details WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 1),'')=?`,[current.sellerId,managed?.id??'']));
  if(intake){
    const answers=JSON.parse(intake.answers) as Record<string,string[]>,documents=JSON.parse(intake.documents) as Record<string,SellerApplicationDocument>;
    for(const [key,value] of Object.entries(proposal.values))answers[key]=[value];
    for(const documentId of proposal.documents){
      const document=await db.prepare('SELECT id,kind,object_key AS objectKey,original_name AS originalName,mime_type AS mimeType,size_bytes AS sizeBytes FROM seller_documents WHERE id=? AND seller_id=?')
        .bind(documentId,current.sellerId).first<SellerApplicationDocument>();if(!document)throw new ProtectedChangeError('Replacement evidence is unavailable.');
      const field=Object.entries(documents).find(([,value])=>value.kind===document.kind)?.[0]
        ??(document.kind==='representative_identity'?'representativeIdentity':document.kind==='business_registration'?'businessRegistration':answers.hasBusinessTaxRegistration?.[0]==='yes'?'panCertificate':'personalPanCertificate');
      documents[field]=document;
    }
    statement.push(...protectedGuard(db,'EXISTS(SELECT 1 FROM seller_registration_intakes WHERE seller_id=? AND version=?)',[current.sellerId,intake.version]),
      db.prepare('UPDATE seller_registration_intakes SET version=version+1,answers_json=?,documents_json=?,updated_at=? WHERE seller_id=?')
        .bind(JSON.stringify(answers),JSON.stringify(documents),input.now,current.sellerId));
  }
  for(const documentId of proposal.documents)statement.push(...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_documents d WHERE d.id=? AND d.seller_id=? AND d.protected_change_id=? AND d.status='pending'
    AND (d.valid_until IS NULL OR d.valid_until>?) AND NOT EXISTS(SELECT 1 FROM seller_documents later WHERE later.seller_id=d.seller_id AND later.kind=d.kind AND later.status<>'rejected'
      AND (later.uploaded_at>d.uploaded_at OR later.uploaded_at=d.uploaded_at AND later.id>d.id)))`,[documentId,current.sellerId,input.caseId,input.now]),
    db.prepare("UPDATE seller_documents SET status='verified',reviewed_by=?,reviewed_at=?,review_request_id=? WHERE id=?").bind(input.actorId,input.now,eventId,documentId));
  if(profile.length)statement.push(db.prepare(`UPDATE seller_profiles SET ${profile.map(([,column])=>`${column}=?`).join(',')},updated_at=? WHERE id=?`)
    .bind(...profile.map(([key])=>proposal.values[key]),input.now,current.sellerId));
  if(managed)statement.push(db.prepare(`INSERT INTO managed_maker_application_details(id,seller_id,government_id_type,government_id_description,personal_pan,identity_document_id,
    agreement_version,agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,created_at,agreement_language,agreement_form_version_id)
    SELECT ?,seller_id,?,?,?,COALESCE((SELECT id FROM seller_documents WHERE protected_change_id=? AND kind='representative_identity' AND status='verified'),identity_document_id),
      agreement_version,agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,?,agreement_language,agreement_form_version_id FROM managed_maker_application_details WHERE id=?`)
    .bind(`z-identity-${String(input.expectedIdentityRevision).padStart(20,'0')}-${crypto.randomUUID()}`,facts.governmentIdType,facts.governmentIdDescription,facts.personalPan||null,input.caseId,input.now,managed.id));
  statement.push(db.prepare(`INSERT INTO seller_identity_fact_versions(id,seller_id,case_id,identity_revision,facts_json,verified_by,verified_at,verification_reference,review_reason)
    SELECT ?,seller_id,?,identity_revision,?,?,?,?,? FROM seller_protected_revisions WHERE seller_id=?`)
    .bind(factId,input.caseId,JSON.stringify(facts),input.actorId,input.now,reference,reason,current.sellerId),
    db.prepare(`UPDATE seller_protected_change_cases SET status='verified',version=version+1,reviewed_by=?,reviewed_at=?,review_reason=?,evidence_reference=?,operation_request_id=?,updated_at=? WHERE id=?`)
      .bind(input.actorId,input.now,reason,reference,eventId,input.now,input.caseId),
    protectedChangeEvent(db,input,input.caseId,'identity_verified',reason,{factVersionId:factId,before:proposal.before,after:facts,documents:proposal.documents,verificationReference:reference,holdsRetained:true}),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at) VALUES(?,?,'seller.identity.verified','seller_protected_change',?,?,?,?)`)
      .bind(eventId,input.actorId,input.caseId,reason,JSON.stringify({factVersionId:factId,holdsRetained:true}),input.now),
    ...await protectedChangeNotice(db,input.caseId,current.sourceRequestId,eventId,input));
  await command.commit(statement,input.caseId);
}
