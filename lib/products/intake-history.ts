import {CategoryContractError,getProductIntakeDraft} from './category-contracts';
import type {IntakeSnapshot} from './intake-workspace';
export async function getOwnerProductIntakeCase(db:D1Database,actorId:string,caseId:string){
 const row=await db.prepare('SELECT c.id,c.draft_id AS draftId,c.version_id AS versionId,c.cycle_number AS cycleNumber,c.state,c.first_requested_at AS firstRequestedAt,c.first_complete_at AS firstCompleteAt,v.snapshot_json AS snapshot FROM product_intake_cases c JOIN product_intake_workspace_versions v ON v.id=c.version_id WHERE c.id=?').bind(caseId).first<{id:string;draftId:string;versionId:string;cycleNumber:number;state:string;firstRequestedAt:number;firstCompleteAt:number|null;snapshot:string}>();
 if(!row)throw new CategoryContractError('This review history is unavailable to this account.',403);
 await getProductIntakeDraft(db,actorId,row.draftId);
 return {...row,snapshot:JSON.parse(row.snapshot) as IntakeSnapshot};
}
export async function getProductIntakeHistory(db:D1Database,actorId:string,draftId:string,input:{versionId?:string;beforeRevision?:number}={}){
 await getProductIntakeDraft(db,actorId,draftId);
 if(input.versionId){
  const row=await db.prepare('SELECT id,revision,created_at AS createdAt,snapshot_json AS snapshot FROM product_intake_workspace_versions WHERE id=? AND draft_id=?').bind(input.versionId,draftId).first<{id:string;revision:number;createdAt:number;snapshot:string}>();
  if(!row)throw new CategoryContractError('This saved version is unavailable for the selected owner draft.',403);
  await getProductIntakeDraft(db,actorId,draftId);
  return {version:{...row,snapshot:JSON.parse(row.snapshot) as IntakeSnapshot}};
 }
 const before=input.beforeRevision??Number.MAX_SAFE_INTEGER;
 if(!Number.isSafeInteger(before)||before<0)throw new CategoryContractError('Use the earlier saved-version reference.',400);
 const rows=(await db.prepare("SELECT id,revision,created_at AS createdAt FROM product_intake_workspace_versions WHERE draft_id=? AND kind='private' AND revision<? ORDER BY revision DESC LIMIT 21").bind(draftId,before).all<{id:string;revision:number;createdAt:number}>()).results;
 await getProductIntakeDraft(db,actorId,draftId);
 return {versions:rows.slice(0,20),nextBeforeRevision:rows.length>20?rows[19].revision:null};
}
