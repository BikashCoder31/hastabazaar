import {NATIVE_FORM_SOURCES} from '../forms/native-source-contracts';
import {readDatabaseHealthScope} from '../db/health-context';
import {recordFormLoadObservation} from './form-health';

type Audience='seller'|'staff'|'super_admin';
type Mapping={formId:string;audience:Audience;subjectType:string};
const mappings:Record<string,Mapping>={};
function map(prefix:string,subjectType:string,entries:Record<string,string>){
 for(const [action,formId] of Object.entries(entries)){
  const source=NATIVE_FORM_SOURCES.find(row=>row.id===formId)!;
  mappings[prefix+action]=Object.freeze({formId,audience:source.audience as Audience,subjectType});
 }
}
map('seller.document.command.','seller_document_workflow',{
 request:'seller.document-change-request',unverified_correction:'seller.document-correction-upload',replacement:'seller.document-replacement-upload',
 review:'staff.seller-document-review',permission:'staff.seller-document-change-permission',
});
map('seller.protected_change.','seller_protected_change',{
 requested:'seller.protected-change-request',withdrawn:'seller.protected-change-withdrawal',identity_submitted:'seller.protected-identity-upload',
 permission:'staff.protected-change-permission',identity_verified:'staff.protected-identity-review',
 hold_disposition:'staff.protected-change-disposition',bank_revalidated:'staff.protected-change-disposition',evidence_only:'staff.protected-change-disposition',packet_retired:'staff.protected-change-disposition',
});
map('seller.public_profile.','seller_public_profile',{
 withdrawn:'seller.public-profile-withdrawal',correction_requested:'seller.public-profile-correction',correction_answered:'seller.public-profile-correction',
 support_saved:'seller.public-support-contacts',locations_saved:'seller.operational-locations',media_uploaded:'seller.public-profile-media',
 reviewed:'staff.public-profile-review',correction_reviewed:'staff.public-profile-review',staff_correction_requested:'staff.public-profile-correction-request',legacy_history_reconciled:'staff.public-profile-history-reconciliation',
});
Object.freeze(mappings);
export function nativeCommandMapping(action:string,audience?:'seller'|'staff'):Mapping|null{
 if(action==='order.response.issue.reported'&&audience)return {formId:audience+'.order-preparation',audience,subjectType:'order_response'};
 if(action==='order.response.followup.recorded'&&audience==='staff')return {formId:'staff.order-preparation',audience,subjectType:'order_response'};
 return mappings[action]??null;
}
async function hash(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');}
const contracts=new Map<string,Promise<{version:number;sourceHash:string}>>();
/** The numeric version is derived from the reviewed contract, not a catalog publication. */
export function nativeFormContract(formId:string){
 const source=NATIVE_FORM_SOURCES.find(row=>row.id===formId&&row.mode!=='query');if(!source)return null;
 let result=contracts.get(formId);if(!result){result=(async()=>{
  const actions=Object.entries(mappings).filter(([,mapping])=>mapping.formId===formId).map(([action])=>action).sort();
  if(formId.endsWith('.order-preparation'))actions.push('order.response.issue.reported',...(formId.startsWith('staff.')?['order.response.followup.recorded']:[]));
  const sourceHash=await hash(['native-form-command-v1',source,actions]);
  return {version:parseInt(sourceHash.slice(0,12),16)+1,sourceHash};
 })();contracts.set(formId,result);}return result;
}
export async function currentNativeSourceHashes(){return Promise.all(NATIVE_FORM_SOURCES.filter(source=>source.mode!=='query').map(async source=>(await nativeFormContract(source.id)!).sourceHash));}
export interface NativeFormProvenance{
 kind:'native-command-v1';formId:string;version:number;sourceHash:string;audience:Audience;
 environment:string;releaseId:string;configurationHash:string;revisionHash:string;
}
/** Only owning server repositories call this, after their original authority checks.
 * No request-supplied form/version/scope is read, and unbound databases stay unscoped. */
export async function nativeCommandProvenance(db:D1Database,action:string,expectedRevision:string|null,audience?:'seller'|'staff'):Promise<NativeFormProvenance|undefined>{
 const bound=readDatabaseHealthScope(db),mapping=nativeCommandMapping(action,audience);if(!bound||!mapping)return;
 const contract=await nativeFormContract(mapping.formId)!;
 return {kind:'native-command-v1',formId:mapping.formId,...contract,audience:mapping.audience,...bound,
  configurationHash:await hash([bound.environment,bound.releaseId,contract.sourceHash]),revisionHash:await hash(expectedRevision)};
}
export interface NativeReceiptRow{id:string;action:string;subjectType:string;subjectId:string;actorId:string|null;requestId:string;result:string;metadata:string;observedAt:number;commandKey:string;commandDigest:string;}
/** Returns only a compatible, originally scoped native contract. Never projects business data. */
export async function validateNativeReceipt(db:D1Database,row:NativeReceiptRow,environment:string,releaseId:string){
 let provenance:NativeFormProvenance,result:unknown;
 try{provenance=JSON.parse(row.metadata)?.nativeFormHealth;result=JSON.parse(row.result);}catch{return null;}
 if(!provenance||provenance.kind!=='native-command-v1'||provenance.environment!==environment||provenance.releaseId!==releaseId||
  !/^[a-f0-9]{64}$/.test(row.commandKey)||!/^[a-f0-9]{64}$/.test(row.commandDigest)||!/^[a-f0-9]{64}$/.test(provenance.revisionHash))return null;
 const mapping=nativeCommandMapping(row.action,provenance.audience==='seller'?'seller':provenance.audience==='staff'?'staff':undefined);
 if(!mapping||mapping.formId!==provenance.formId||mapping.audience!==provenance.audience||mapping.subjectType!==row.subjectType)return null;
 const contract=await nativeFormContract(mapping.formId)!;
 if(contract.version!==provenance.version||contract.sourceHash!==provenance.sourceHash||provenance.configurationHash!==await hash([environment,releaseId,contract.sourceHash]))return null;
 if(!await nativeOutcomeExists(db,row,result))return null;
 return {formId:mapping.formId,version:contract.version};
}
function object(value:unknown):Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function ref(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=191;}
async function nativeOutcomeExists(db:D1Database,row:NativeReceiptRow,result:unknown){
 const exists=async(sql:string,values:unknown[])=>!!await db.prepare(sql).bind(...values).first();
 const scalar=(column:string,path:string)=>`${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract'}(${column},'$.${path}')`;
 const actor='(actor_id=? OR (actor_id IS NULL AND ? IS NULL))',actorValues=[row.actorId,row.actorId];
 if(row.action.startsWith('seller.document.command.')){
  if(!ref(result))return false;
  const action=row.action.slice('seller.document.command.'.length);
  if(action==='request')return exists(`SELECT 1 FROM seller_document_change_requests WHERE id=? AND document_id=? AND requested_at=? AND (requested_by=? OR (requested_by IS NULL AND ? IS NULL))`,[result,row.subjectId,row.observedAt,...actorValues]);
  if(action==='review'||action==='permission')return result===row.subjectId&&exists(`SELECT 1 FROM audit_logs WHERE subject_id=? AND request_id=? AND created_at=? AND ${actor} AND action IN(${action==='review'?"'seller.document.verified','seller.document.rejected','seller.document.correction_requested'":"'seller.document.change_reviewed'"})`,[row.subjectId,row.requestId,row.observedAt,...actorValues]);
  if(action==='replacement')return exists(`SELECT 1 FROM audit_logs a JOIN seller_documents d ON d.id=? WHERE a.action='seller.document.replacement_submitted' AND a.subject_id=? AND ${scalar('a.next_json','documentId')}=d.id AND a.created_at=? AND (a.actor_id=? OR (a.actor_id IS NULL AND ? IS NULL))`,[result,row.subjectId,row.observedAt,...actorValues]);
  if(action==='unverified_correction')return exists(`SELECT 1 FROM audit_logs a JOIN seller_documents d ON d.id=a.subject_id WHERE a.action='seller.document.correction_submitted' AND d.id=? AND ${scalar('a.next_json','previousDocumentId')}=? AND a.created_at=? AND (a.actor_id=? OR (a.actor_id IS NULL AND ? IS NULL))`,[result,row.subjectId,row.observedAt,...actorValues]);
  return false;
 }
 if(row.action.startsWith('seller.protected_change.')){
  const action=row.action.slice('seller.protected_change.'.length),out=object(result),caseId=action==='requested'?result:row.subjectId;
  if(!ref(caseId))return false;
  let events:string[]=[action];
  if(action==='permission')events=['permit','clarify','reject'];
  if(action==='hold_disposition'){if(out.caseId!==caseId||!Array.isArray(out.released))return false;events=[out.released.length?'holds_released':'holds_retained'];}
  if(action==='evidence_only'){if(out.caseId!==caseId||out.classification!=='identity_evidence_only')return false;events=['evidence_only_classified'];}
  if(['withdrawn','identity_submitted','identity_verified'].includes(action)&&result!==caseId)return false;
  let predicate='',values:unknown[]=[];
  if(action==='permission'){if(result!==null&&!ref(result))return false;predicate=` AND (${scalar('payload_json','permissionId')}=? OR (${scalar('payload_json','permissionId')} IS NULL AND ? IS NULL))`;values=[result,result];}
  if(action==='packet_retired'){if(!ref(out.dispositionId))return false;predicate=` AND ${scalar('payload_json','dispositionId')}=?`;values=[out.dispositionId];}
  if(action==='bank_revalidated'){if(!ref(out.beneficiaryVersionId))return false;predicate=` AND ${scalar('payload_json','beneficiaryVersionId')}=?`;values=[out.beneficiaryVersionId];}
  if(action==='requested'){predicate+=' AND EXISTS(SELECT 1 FROM seller_protected_change_cases c WHERE c.id=case_id AND c.seller_id=?)';values.push(row.subjectId);}
  return exists(`SELECT 1 FROM seller_protected_change_events WHERE case_id=? AND ${actor} AND created_at=? AND action IN(${events.map(()=>'?').join(',')})${predicate}`,[caseId,...actorValues,row.observedAt,...events,...values]);
 }
 if(row.action.startsWith('seller.public_profile.')){
  const action=row.action.slice('seller.public_profile.'.length),out=object(result);
  if(action==='media_uploaded')return ref(result)&&exists('SELECT 1 FROM seller_profile_media WHERE id=? AND seller_id=? AND uploaded_at=?',[result,row.subjectId,row.observedAt]);
  // A deduplicated no-op acknowledges existing state; it is not a fresh saved change.
  if((action==='support_saved'||action==='locations_saved')&&out.noop!==false)return false;
  let sourceColumn='seller_id',sourceId:unknown=row.subjectId,events:string[]=[];
  if(action==='support_saved'||action==='locations_saved'){if(!ref(out.revision))return false;events=[action==='support_saved'?'support_updated':'locations_updated'];}
  if(action==='legacy_history_reconciled'){if(!Number.isSafeInteger(out.version))return false;events=[action];}
  if(action==='withdrawn'||action==='reviewed'){if(out.candidateId!==row.subjectId||!ref(out.status))return false;sourceColumn='revision_id';events=[out.status];}
  if(action==='correction_requested'||action==='staff_correction_requested'){if(!ref(result))return false;sourceColumn='correction_id';sourceId=result;events=[action==='correction_requested'?'correction_requested':'correction_authorized'];}
  if(action==='correction_answered'||action==='correction_reviewed'){if(out.correctionId!==row.subjectId)return false;sourceColumn='correction_id';events=[action==='correction_answered'?'correction_answered':'correction_'+out.status];}
  if(!events.length)return false;
  const creation=action==='correction_requested'||action==='staff_correction_requested';
  return exists(`SELECT 1 FROM seller_public_profile_events WHERE ${sourceColumn}=? AND ${actor} AND created_at=? AND action IN(${events.map(()=>'?').join(',')})${creation?' AND seller_id=?':''}`,[sourceId,...actorValues,row.observedAt,...events,...(creation?[row.subjectId]:[])]);
 }
 const out=object(result);if(!ref(out.id))return false;
 if(row.action==='order.response.issue.reported')return exists('SELECT 1 FROM order_response_cases c JOIN order_response_events e ON e.case_id=c.id WHERE c.id=? AND c.portion_id=? AND c.source_key=? AND e.source_key=? AND e.kind=\'delay\'',[out.id,row.subjectId,'report:'+row.actorId+':'+row.requestId,'issue:'+out.id]);
 if(row.action==='order.response.followup.recorded')return out.id===row.subjectId&&Number.isSafeInteger(out.revision)&&exists("SELECT 1 FROM order_response_events WHERE case_id=? AND source_key=? AND kind='followup'",[row.subjectId,'followup:'+row.actorId+':'+row.requestId]);
 return false;
}
/** Real authorized domain loaders execute inside this boundary. Authorization and
 * absence are not infrastructure failures; diagnostics never change domain results. */
export async function withNativeFormLoad<T>(db:D1Database,formIds:readonly string[],load:()=>Promise<T>):Promise<T>{
 const bound=readDatabaseHealthScope(db);if(!bound||!formIds.length)return load();
 const observe=async(outcome:'compatible'|'blocked')=>{
  for(const formId of formIds){const contract=await nativeFormContract(formId);if(!contract)continue;
   try{await recordFormLoadObservation(db,{...bound,now:Date.now(),formId,version:contract.version,outcome,...(outcome==='blocked'?{category:'read_unavailable' as const}:{})});}catch{/* A diagnostic outage cannot replace an authoritative domain outcome. */}
  }
 };
 try{const result=await load();if(result!==null&&result!==undefined)await observe('compatible');return result;}
 catch(error){const status=object(error).status;if(status!==400&&status!==403&&status!==404&&status!==409)await observe('blocked');throw error;}
}
