import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt} from '../workflows/contracts';

export type ProtectedAdminAction='permission'|'verify-identity'|'disposition'|'bank-details';
export type ProtectedAdminActor={actorId:string;actorAuthSubject?:string|null};
type Source={action:string;subjectType:string;subjectId:string};
type Context=ProtectedAdminActor&{requestId:string;now:number};
export class ProtectedAdminError extends Error{constructor(message:string,readonly status=409){super(message);}}
/** Applies to this invocation only; it cannot settle an earlier unknown attempt. */
export class ProtectedAdminBeforeWriteError extends ProtectedAdminError{}
class AccessError extends ProtectedAdminError{constructor(message:string){super(message,403);}}
const actions:Record<string,ProtectedAdminAction>={
 'seller.protected_change.permission':'permission','seller.protected_change.identity_verified':'verify-identity',
 'seller.protected_change.hold_disposition':'disposition','seller.protected_change.bank_revalidated':'disposition',
 'seller.protected_change.evidence_only':'disposition','seller.protected_change.packet_retired':'disposition',
 'seller.bank.command.verify':'bank-details',
};
export async function protectedAdminAuthority(db:D1Database,input:ProtectedAdminActor){
 const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',AccessError,'super_admin');
 const row=await db.prepare('SELECT id,auth_subject AS authSubject FROM users WHERE id=?').bind(input.actorId).first<{id:string;authSubject:string|null}>();
 if(!row||row.id!==input.actorId||(input.actorAuthSubject!==undefined&&row.authSubject!==input.actorAuthSubject))throw new AccessError('The authenticated reviewer changed. Reopen the current workspace.');
 const guardId=crypto.randomUUID();
 authority.statements.push(db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users WHERE HEX(id)=HEX(?) AND ${row.authSubject===null?'auth_subject IS NULL':'HEX(auth_subject)=HEX(?)'}) THEN 1 ELSE 0 END`).bind(guardId,input.actorId,...(row.authSubject===null?[]:[row.authSubject])),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId));
 return authority;
}
function equal(a:unknown,b:unknown):boolean{
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>,keys=Object.keys(aa);return keys.length===Object.keys(bb).length&&keys.every(key=>Object.hasOwn(bb,key)&&equal(aa[key],bb[key]));
}
/** New proof is appended in the same native batch as its unchanged receipt/effect. */
export function protectedAdminProof(db:D1Database,input:Context,source:Source,revision:string,payload:unknown,result:unknown,caseId:string){
 const action=actions[source.action];if(!action||typeof input.actorAuthSubject!=='string')return[];
 const proof={version:1,actorId:input.actorId,actorAuthSubject:input.actorAuthSubject,requestId:input.requestId,action,sourceId:source.subjectId,caseId,source,revision,payload,result};
 return[db.prepare(`INSERT INTO seller_protected_change_events(id,case_id,actor_id,action,reason,payload_json,created_at) VALUES(?,?,?,'admin_command_recorded','Original protected review command recorded.',?,?)`)
  .bind(crypto.randomUUID(),caseId,input.actorId,JSON.stringify(proof),input.now)];
}
/** Only reads immutable history. It never creates provenance for legacy receipts. */
export async function readProtectedAdminOutcome(db:D1Database,input:ProtectedAdminActor&{actorAuthSubject:string;action:ProtectedAdminAction;sourceId:string;requestId:string;now:number}){
 await protectedAdminAuthority(db,input);
 const rows=(await db.prepare(`SELECT e.id,e.case_id AS caseId,e.actor_id AS actorId,e.payload_json AS payload FROM seller_protected_change_events e JOIN seller_protected_change_cases c ON c.id=e.case_id
  WHERE e.action='admin_command_recorded' AND e.actor_id=? AND ${input.action==='bank-details'?'c.seller_id':'e.case_id'}=? AND json_extract(e.payload_json,'$.requestId')=?`)
  .bind(input.actorId,input.sourceId,input.requestId).all<{id:string;caseId:string;actorId:string;payload:string}>()).results;
 for(const row of rows){
  let proof:Record<string,unknown>;try{proof=JSON.parse(row.payload) as Record<string,unknown>;}catch{continue;}
  const source=proof.source as Source|undefined;
  if(row.actorId!==input.actorId||proof.version!==1||proof.actorId!==input.actorId||proof.action!==input.action||proof.sourceId!==input.sourceId||proof.requestId!==input.requestId||proof.caseId!==row.caseId||!source||actions[source.action]!==input.action||source.subjectId!==input.sourceId||source.subjectType!==(input.action==='bank-details'?'seller_bank':'seller_protected_change')||typeof proof.revision!=='string'||typeof proof.actorAuthSubject!=='string')continue;
  if(proof.actorAuthSubject!==input.actorAuthSubject)throw new AccessError('The original reviewer identity does not match this session.');
  if(source.action==='seller.protected_change.packet_retired')await staffMutationGuard(db,input.actorId,'payout.approve',AccessError,'super_admin');
  let receipt;try{receipt=await commandReceipt(db,{actorId:input.actorId,requestId:input.requestId,expectedRevision:proof.revision,now:input.now},source,proof.payload);}catch(error){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')continue;throw error;}
  if(!receipt.replayed||!equal(receipt.result,proof.result))continue;
  const current=await db.prepare(`SELECT 1 FROM seller_protected_change_events e JOIN seller_protected_change_cases c ON c.id=e.case_id JOIN seller_profiles s ON s.id=c.seller_id
   WHERE HEX(e.id)=HEX(?) AND HEX(e.payload_json)=HEX(?) AND HEX(e.actor_id)=HEX(?) AND HEX(s.user_id)<>HEX(?)
   AND EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE HEX(u.id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND HEX(u.status)=HEX('active') AND HEX(r.role)=HEX('super_admin'))`)
   .bind(row.id,row.payload,input.actorId,input.actorId,input.actorId,input.actorAuthSubject).first();
  await protectedAdminAuthority(db,input);
  if(!current)throw new AccessError('Current independent protected review access is required.');
  const payload=proof.payload as Record<string,unknown>;
  const decision=input.action==='permission'?payload.decision:source.action==='seller.protected_change.hold_disposition'?payload.release?'release_holds':'retain_holds':source.action.split('.').at(-1);
  return{ok:true as const,recorded:true as const,actorId:input.actorId,action:input.action,sourceId:input.sourceId,requestId:input.requestId,decision,...(input.action==='permission'?{permissionId:receipt.result as string|null}:{}),historical:true as const};
 }
 await protectedAdminAuthority(db,input);return null;
}
export async function protectedAdminCasePreflight(db:D1Database,input:ProtectedAdminActor&{caseId:string;expectedVersion:number;expectedIdentityRevision?:number;expectedBankRevision?:number}){
 if(typeof input.actorAuthSubject!=='string')return;
 const current=await db.prepare(`SELECT c.id,c.version,v.identity_revision AS identityRevision,v.bank_revision AS bankRevision,s.user_id AS owner FROM seller_protected_change_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN seller_protected_revisions v ON v.seller_id=c.seller_id WHERE c.id=?`).bind(input.caseId).first<{id:string;version:number;identityRevision:number;bankRevision:number;owner:string}>();
 if(current?.owner===input.actorId)throw new AccessError('An independent eligible Super Admin must review this case.');
 if(!current||current.id!==input.caseId||Number(current.version)!==input.expectedVersion||(input.expectedIdentityRevision!==undefined&&Number(current.identityRevision)!==input.expectedIdentityRevision)||(input.expectedBankRevision!==undefined&&Number(current.bankRevision)!==input.expectedBankRevision))throw new ProtectedAdminBeforeWriteError('The protected case or evidence version changed. Inspect the current record.',409);
}
