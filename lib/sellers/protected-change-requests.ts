import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { commandReceipt } from '../workflows/contracts';
import {nativeCommandProvenance} from '../operations/native-form-health';
import { calculateServiceDueAt,CONTINUOUS_CALENDAR_VERSION } from '../workflows/service-clock';
import {protectedChangeEvent,protectedChangeNotice} from './protected-change-events';
export {protectedChangeEvent,protectedChangeNotice} from './protected-change-events';
import { ProtectedChangeError,protectedCaseHoldStatements,protectedGuard } from './protected-change-policy';
import {protectedAdminAuthority,protectedAdminProof,protectedAdminCasePreflight,type ProtectedAdminActor} from './protected-admin-recovery';

export const protectedBankFields=['payoutBeneficiary','bankName','bankBranch','bankAccountNumber','bank_verification'] as const;
export const protectedIdentityFields=['legalName','representativeName','taxRegistrationNumber','personalPan','governmentIdType','governmentIdDescription','registrationAuthority','registrationNumber','representative_identity','pan_certificate','business_registration'] as const;
type Command=ProtectedAdminActor&{requestId:string;now:number};
const ownerSql="EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller')))";
export async function protectedOwner(db:D1Database,sellerId:string,actorId:string){if(!await db.prepare(`SELECT 1 WHERE ${ownerSql}`).bind(sellerId,actorId).first())throw new ProtectedChangeError('Your current seller access is required.',403);}
export function protectedOwnerGuards(db:D1Database,sellerId:string,actorId:string){return protectedGuard(db,ownerSql,[sellerId,actorId]);}
export async function protectedCommand(db:D1Database,input:Command,action:string,subjectId:string,revision:string,payload:unknown){
  const admin=['permission','identity_verified','hold_disposition','bank_revalidated','packet_retired'].includes(action);
  const authority=admin?await protectedAdminAuthority(db,input):null;
  const provenance=await nativeCommandProvenance(db,`seller.protected_change.${action}`,revision);
  const read=async()=>{try{return await commandReceipt(db,{...input,expectedRevision:revision},{action:`seller.protected_change.${action}`,subjectType:'seller_protected_change',subjectId},payload,provenance);}
    catch(error){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')throw new ProtectedChangeError('This reference belongs to different saved changes. Review the original result before submitting a new request.');throw error;}};
  const receipt=await read();return{receipt,async commit(statements:D1PreparedStatement[],result:unknown){if(receipt.replayed)return receipt.result;
    try{await db.batch([...(authority?.statements??[]),...statements,...protectedAdminProof(db,input,{action:`seller.protected_change.${action}`,subjectType:'seller_protected_change',subjectId},revision,payload,result,subjectId),receipt.insert(result)]);return result;}catch(error){const recovered=await read();if(recovered.replayed)return recovered.result;
      let detail:unknown=error;for(let depth=0;depth<4&&detail instanceof Error;depth++,detail=detail.cause)if(/(?:CHECK|CONSTRAINT).*valid/i.test(detail.message))
        throw new ProtectedChangeError('The protected scope, current evidence, permission or account changed. Keep your entries and review the current record.');throw error;}}};
}
function reasonText(reason:string){const value=reason.trim();if(value.length<10||value.length>1000)throw new ProtectedChangeError('Explain this protected change in 10–1000 characters.',400);return value;}
export async function requestProtectedChange(db:D1Database,input:Command&{sellerId:string;kind:'bank'|'identity';fields:readonly string[];reason:string;expectedIdentityRevision:number;expectedBankRevision:number;currentUnusable?:boolean}){
  await protectedOwner(db,input.sellerId,input.actorId);const reason=reasonText(input.reason);
  const allowed=input.kind==='bank'?protectedBankFields:input.kind==='identity'?protectedIdentityFields:[];
  const fields=[...new Set(input.fields)].sort();if(!fields.length||fields.length!==input.fields.length||fields.some(field=>!(allowed as readonly string[]).includes(field)))
    throw new ProtectedChangeError('Choose exact protected fields. Ownership or legal-entity transfer requires a separate authorized onboarding process.',400);
  const command=await protectedCommand(db,input,'requested',input.sellerId,`${input.expectedIdentityRevision}:${input.expectedBankRevision}`,{kind:input.kind,fields,reason,currentUnusable:input.currentUnusable??false});
  if(command.receipt.replayed)return String(command.receipt.result);
  const current=await db.prepare(`SELECT s.payout_account_reference AS reference,(SELECT id FROM seller_documents WHERE seller_id=s.id AND status='verified'
    AND ${input.kind==='bank'?"kind='bank_verification'":"kind IN ('representative_identity','pan_certificate')"} ORDER BY uploaded_at DESC,id DESC LIMIT 1) AS documentId FROM seller_profiles s WHERE s.id=?`)
    .bind(input.sellerId).first<{reference:string|null;documentId:string|null}>();
  if(!current||input.kind==='identity'&&!current.documentId||input.kind==='bank'&&(!current.reference||current.reference.startsWith('PENDING VERIFICATION:')))
    throw new ProtectedChangeError('Use initial registration or bank intake for evidence that has not yet been reviewed.',400);
  const id=crypto.randomUUID(),eventId=crypto.randomUUID();
  return String(await command.commit([...protectedOwnerGuards(db,input.sellerId,input.actorId),
    ...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_protected_revisions WHERE seller_id=? AND identity_revision=? AND bank_revision=?)
      AND NOT EXISTS(SELECT 1 FROM seller_protected_change_cases c WHERE c.seller_id=? AND c.kind=? AND c.scope_json=? AND
        (c.status='open' OR EXISTS(SELECT 1 FROM seller_capability_holds h WHERE h.case_id=c.id AND h.released_at IS NULL)))`,
      [input.sellerId,input.expectedIdentityRevision,input.expectedBankRevision,input.sellerId,input.kind,JSON.stringify(fields)]),
    db.prepare(`INSERT INTO seller_protected_change_cases(id,seller_id,kind,classification,source_document_id,original_identity_revision,original_bank_reference,scope_json,
      invalid_current,requested_by,reason,requested_at,updated_at,operation_request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,input.sellerId,input.kind,input.kind==='bank'?'bank':'unclassified',current.documentId,input.expectedIdentityRevision,current.reference,JSON.stringify(fields),input.currentUnusable?1:0,input.actorId,reason,input.now,input.now,eventId),
    ...protectedCaseHoldStatements(db,id,input.now),
    db.prepare(`INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at) VALUES(?,'protected_change',?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),id,id,input.now,calculateServiceDueAt({startedAt:input.now,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION}),CONTINUOUS_CALENDAR_VERSION,input.now),
    protectedChangeEvent(db,input,id,'requested',reason,{fields,currentUnusable:input.currentUnusable??false}),
    ...await protectedChangeNotice(db,id,null,eventId,input),
  ],id));
}

export async function reviewProtectedChangePermission(db:D1Database,input:Command&{caseId:string;expectedVersion:number;expectedIdentityRevision:number;expectedBankRevision:number;decision:'permit'|'clarify'|'reject';reason:string}){
  const reason=reasonText(input.reason);if(!['permit','clarify','reject'].includes(input.decision))throw new ProtectedChangeError('Choose a valid scope decision.',400);
  const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',ProtectedChangeError,'super_admin');
  const command=await protectedCommand(db,input,'permission',input.caseId,String(input.expectedVersion),{decision:input.decision,reason,expectedIdentityRevision:input.expectedIdentityRevision,expectedBankRevision:input.expectedBankRevision});
  if(command.receipt.replayed)return command.receipt.result as string|null;
  await protectedAdminCasePreflight(db,input);
  const current=await db.prepare('SELECT seller_id AS sellerId,source_request_id AS sourceRequestId,scope_json AS scope FROM seller_protected_change_cases WHERE id=?')
    .bind(input.caseId).first<{sellerId:string;sourceRequestId:string|null;scope:string}>();if(!current)throw new ProtectedChangeError('Protected change not found.',404);
  const permissionId=input.decision==='permit'?crypto.randomUUID():null,eventId=crypto.randomUUID();
  return await command.commit([...authority.statements,...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id
    JOIN users u ON u.id=s.user_id JOIN seller_protected_revisions v ON v.seller_id=s.id WHERE c.id=? AND c.version=?
      AND (c.status='open' OR c.status IN ('rejected','withdrawn','closed') AND EXISTS(SELECT 1 FROM seller_capability_holds h WHERE h.case_id=c.id AND h.released_at IS NULL))
      AND s.user_id<>? AND u.status='active' AND v.identity_revision=? AND v.bank_revision=?)`,[input.caseId,input.expectedVersion,input.actorId,input.expectedIdentityRevision,input.expectedBankRevision]),
    ...(permissionId?[db.prepare(`INSERT INTO seller_protected_change_permissions(id,case_id,scope_json,identity_revision,bank_revision,reviewed_by,reviewed_at,reason) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(permissionId,input.caseId,current.scope,input.expectedIdentityRevision,input.expectedBankRevision,input.actorId,input.now,reason)]:[]),
    db.prepare(`UPDATE seller_protected_change_cases SET status=?,active_permission_id=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,operation_request_id=?,updated_at=? WHERE id=?`)
      .bind(input.decision==='reject'?'rejected':'open',permissionId,input.actorId,input.now,reason,eventId,input.now,input.caseId),
    ...(current.sourceRequestId?[db.prepare('UPDATE seller_document_change_requests SET status=?,active_permission_id=NULL,reviewed_by=?,reviewed_at=?,review_reason=? WHERE id=?')
      .bind(input.decision==='reject'?'rejected':input.decision==='permit'?'approved':'submitted',input.actorId,input.now,reason,current.sourceRequestId)]:[]),
    ...(input.decision==='permit'?protectedCaseHoldStatements(db,input.caseId,input.now):[]),
    protectedChangeEvent(db,input,input.caseId,input.decision,reason,{permissionId,scope:JSON.parse(current.scope) as unknown,identityRevision:input.expectedIdentityRevision,bankRevision:input.expectedBankRevision}),
    ...await protectedChangeNotice(db,input.caseId,current.sourceRequestId,eventId,input),
  ],permissionId) as string|null;
}

export async function currentProtectedPermission(db:D1Database,sellerId:string,caseId:string,permissionId:string,actorId:string){
  await protectedOwner(db,sellerId,actorId);
  const row=await db.prepare(`SELECT p.id,p.scope_json AS scope,p.identity_revision AS identityRevision,p.bank_revision AS bankRevision,p.reviewed_by AS reviewedBy,c.version,c.kind,c.source_request_id AS sourceRequestId
    FROM seller_protected_change_permissions p JOIN seller_protected_change_cases c ON c.id=p.case_id
    JOIN seller_profiles s ON s.id=c.seller_id JOIN seller_protected_revisions v ON v.seller_id=s.id
    JOIN users reviewer ON reviewer.id=p.reviewed_by WHERE p.id=? AND c.id=? AND c.seller_id=? AND c.active_permission_id=p.id AND c.status='open'
      AND p.used_at IS NULL AND v.identity_revision=p.identity_revision AND v.bank_revision=p.bank_revision AND reviewer.status='active' AND reviewer.id<>s.user_id
      AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=reviewer.id AND role='super_admin')`).bind(permissionId,caseId,sellerId)
    .first<{id:string;scope:string;identityRevision:number;bankRevision:number;reviewedBy:string;version:number;kind:'identity'|'bank';sourceRequestId:string|null}>();
  if(!row)throw new ProtectedChangeError('The exact replacement permission or its reviewer changed. Ask for current scoped review.');return row;
}
