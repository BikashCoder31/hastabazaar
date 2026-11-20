import {withNativeFormLoad} from '../operations/native-form-health';
import {readLegacyProtectedTransition} from './legacy-protected-transition';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {ProtectedChangeError,protectedCapabilityState} from './protected-change-policy';
import {protectedOwner,currentProtectedPermission} from './protected-change-requests';
import {sellerDocumentWorkspace} from './document-workspace';
import {privateBankWorkspace} from './bank-details';
import {currentProtectedIdentity,requiredIdentityProofs} from './protected-identity-change';

async function protectedChangeWorkspaceSource(db:D1Database,caseId:string,actorId:string,audience:'staff'|'owner',now:number=Date.now()){
  const source=await db.prepare('SELECT seller_id AS sellerId FROM seller_protected_change_cases WHERE id=?').bind(caseId).first<{sellerId:string}>();
  if(!source)throw new ProtectedChangeError('Protected change not found.',404);
  if(audience==='staff')await staffMutationGuard(db,actorId,'seller.application.review',ProtectedChangeError,'super_admin');else await protectedOwner(db,source.sellerId,actorId);
  const record=await db.prepare(`SELECT c.id,c.seller_id AS sellerId,c.kind,c.classification,c.status,c.version,c.reason,c.scope_json AS scopeJson,c.proposed_json AS proposedJson,
    c.source_request_id AS sourceRequestId,c.source_document_id AS sourceDocumentId,c.replacement_document_id AS replacementDocumentId,c.original_bank_reference AS originalBankReference,
    c.requested_at AS requestedAt,c.updated_at AS updatedAt,c.reviewed_at AS reviewedAt,c.review_reason AS reviewReason,c.invalid_current AS invalidCurrent,c.active_permission_id AS permissionId,
    v.identity_revision AS identityRevision,v.bank_revision AS bankRevision,t.due_at AS dueAt,
    CASE WHEN owner.status='active' AND owner.id<>s.user_id AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=owner.id AND role='super_admin') THEN owner.display_name ELSE NULL END AS owner
    FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN seller_protected_revisions v ON v.seller_id=s.id
    LEFT JOIN complete_version_legacy_transitions legacy ON legacy.case_id=c.id LEFT JOIN review_tasks t ON t.source_id=c.id AND t.source_type IN ('document_change','protected_change') AND (legacy.review_task_id IS NULL OR t.id=legacy.review_task_id) LEFT JOIN users owner ON owner.id=t.owner_id WHERE c.id=?`)
    .bind(caseId).first<{id:string;sellerId:string;kind:'bank'|'identity';classification:string;status:string;version:number;reason:string;scopeJson:string;proposedJson:string|null;
      sourceRequestId:string|null;sourceDocumentId:string|null;replacementDocumentId:string|null;originalBankReference:string|null;requestedAt:number;updatedAt:number;reviewedAt:number|null;reviewReason:string|null;
      invalidCurrent:number;permissionId:string|null;identityRevision:number;bankRevision:number;dueAt:number|null;owner:string|null}>();
  if(!record)throw new ProtectedChangeError('Protected change not found.',404);
  for(const key of ['version','identityRevision','bankRevision','requestedAt','updatedAt','invalidCurrent','reviewedAt','dueAt']as const){if(record[key]===null)continue;const value=Number(record[key]);if(!Number.isSafeInteger(value)||value<0)throw new ProtectedChangeError('A recorded case clock/revision requires reconciliation.');record[key]=value;}
  const evidence=await sellerDocumentWorkspace(db,record.sellerId,actorId,audience==='staff'?'staff':'seller');
  let permission:Awaited<ReturnType<typeof currentProtectedPermission>>|null=null;
  if(record.permissionId&&audience==='owner')try{permission=await currentProtectedPermission(db,record.sellerId,record.id,record.permissionId,actorId);}catch(error){if(!(error instanceof ProtectedChangeError))throw error;}
  const history=(await db.prepare(`SELECT e.id,e.action,e.reason,e.created_at AS createdAt,u.display_name AS actor FROM seller_protected_change_events e
    LEFT JOIN users u ON u.id=e.actor_id WHERE e.case_id=? AND e.action<>'admin_command_recorded' ORDER BY e.created_at,e.id`).bind(caseId).all<{id:string;action:string;reason:string;createdAt:number;actor:string|null}>()).results;
  const packets=audience==='staff'?(await db.prepare(`SELECT b.payout_model AS model,b.payout_id AS id,b.disposition,b.original_status AS originalStatus,b.created_at AS createdAt,
    d.created_at AS retiredAt,replacement.new_payout_id AS replacementId FROM seller_payout_review_blocks b
    LEFT JOIN seller_payout_packet_dispositions d ON d.payout_model=b.payout_model AND d.old_payout_id=b.payout_id
    LEFT JOIN seller_payout_packet_replacements replacement ON replacement.disposition_id=d.id WHERE b.case_id=? ORDER BY b.created_at,b.payout_id`).bind(caseId)
    .all<{model:string;id:string;disposition:string;originalStatus:string;createdAt:number;retiredAt:number|null;replacementId:string|null}>()).results:[];
  const fields=JSON.parse(record.scopeJson) as string[],identity=await currentProtectedIdentity(db,record.sellerId);
  const possibleEvidence=requiredIdentityProofs(identity,Object.fromEntries(fields.map(field=>[field,'__requested_change__'])),fields);
  const currentBank=await privateBankWorkspace(db,record.sellerId,actorId,audience,now,record.kind==='bank'?caseId:undefined);
  const transition=await readLegacyProtectedTransition(db,caseId);
  if(transition)history.push({id:transition.operationId,action:'legacy_transition',reason:'System linked retained work for current review. Historical request-time identity and bank snapshots remain unknown.',createdAt:transition.cutoverAt,actor:'System'});
  history.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
  const capability=await protectedCapabilityState(db,record.sellerId);
  const actorScope=audience==='staff'?"hex(scope_role.role)=hex('super_admin')":"hex(scope_role.role) IN(hex('customer'),hex('seller')) AND hex(s.user_id)=hex(scope_user.id)";
  const current=await db.prepare(`SELECT 1 FROM seller_protected_change_cases c JOIN seller_protected_revisions v ON v.seller_id=c.seller_id JOIN seller_profiles s ON s.id=c.seller_id WHERE c.id=? AND c.version=? AND v.identity_revision=? AND v.bank_revision=? AND EXISTS(SELECT 1 FROM users scope_user JOIN user_roles scope_role ON hex(scope_role.user_id)=hex(scope_user.id) WHERE hex(scope_user.id)=hex(?) AND hex(scope_user.status)=hex('active') AND ${actorScope})`).bind(caseId,record.version,record.identityRevision,record.bankRevision,actorId).first();
  if(!current){if(audience==='staff')await staffMutationGuard(db,actorId,'seller.application.review',ProtectedChangeError,'super_admin');else await protectedOwner(db,source.sellerId,actorId);throw new ProtectedChangeError('The case or current identity/bank revision changed. Reopen the exact current case.');}
  return{record,transition,fields,evidence,permission,history,packets,identity,possibleEvidence,currentBank,capability,bank:record.kind==='bank'?currentBank:null};
}
export type ProtectedChangeWorkspace=Awaited<ReturnType<typeof protectedChangeWorkspace>>;

export async function protectedChangeWorkspace(db:D1Database,caseId:string,actorId:string,audience:'staff'|'owner',now:number=Date.now()){
 return withNativeFormLoad(db,audience==='owner'?['seller.protected-change-withdrawal','seller.protected-identity-upload']:['staff.protected-change-permission','staff.protected-identity-review','staff.protected-change-disposition'],()=>protectedChangeWorkspaceSource(db,caseId,actorId,audience,now));
}
