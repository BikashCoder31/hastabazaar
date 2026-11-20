import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import type {HealthEnvironment} from './service-health-repository';

export type IncidentCommandContext=CommandContext&{actorAuthSubject?:string;environment?:HealthEnvironment};
type Source={action:string;subjectType:string;subjectId:string};
type Proof={version:1;actorId:string;actorAuthSubject:string;requestId:string;environment:HealthEnvironment;expectedRevision:string|null;source:Source;payload:unknown};
export class IncidentCommandAccessError extends Error {}

export async function incidentCommandAuthority(db:D1Database,context:IncidentCommandContext,Conflict:new(message:string)=>Error){
 const authority=await staffMutationGuard(db,context.actorId,'system.incidents.manage',context.actorAuthSubject===undefined?Conflict:IncidentCommandAccessError);
 if(context.actorAuthSubject===undefined)return authority;
 const user=await db.prepare('SELECT id,auth_subject AS authSubject FROM users WHERE id=?').bind(context.actorId).first<{id:string;authSubject:string|null}>();
 if(!user||user.id!==context.actorId||user.authSubject!==context.actorAuthSubject)throw new IncidentCommandAccessError('Refresh the current incident workspace.');
 const guardId=crypto.randomUUID();
 authority.statements.push(db.prepare("INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users WHERE HEX(id)=HEX(?) AND HEX(auth_subject)=HEX(?)) THEN 1 ELSE 0 END").bind(guardId,context.actorId,context.actorAuthSubject),db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(guardId));
 return authority;
}

/** Preserve the existing command digest; new API receipts additionally retain trusted identity proof. */
export async function incidentCommandReceipt(db:D1Database,context:IncidentCommandContext,source:Source,payload:unknown){
 const receipt=await commandReceipt(db,context,source,payload);
 if(receipt.replayed||context.actorAuthSubject===undefined||context.environment===undefined)return receipt;
 const proof:Proof={version:1,actorId:context.actorId,actorAuthSubject:context.actorAuthSubject,requestId:context.requestId,environment:context.environment,expectedRevision:context.expectedRevision,source,payload};
 return{replayed:false as const,insert(result:unknown){
  if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Incident result is unavailable.');
  return receipt.insert({...result,commandProof:proof});
 }};
}

const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export async function readIncidentCommandOutcome(db:D1Database,input:{actorId:string;actorAuthSubject:string;requestId:string;action:string;sourceId:string;environment:HealthEnvironment;now:number}){
 await incidentCommandAuthority(db,{...input,expectedRevision:null},IncidentCommandAccessError);
 const row=await db.prepare('SELECT actor_id AS actorId,action,subject_type AS subjectType,subject_id AS subjectId,command_result_json AS result FROM audit_logs WHERE HEX(actor_id)=HEX(?) AND HEX(request_id)=HEX(?) AND command_key IS NOT NULL')
  .bind(input.actorId,input.requestId).first<{actorId:string;action:string;subjectType:string;subjectId:string;result:string|null}>();
 if(!row?.result)return null;
 let result:unknown;try{result=JSON.parse(row.result);}catch{return null;}
 if(!object(result)||!object(result.commandProof))return null;
 const proof=result.commandProof;
 if(proof.version!==1||proof.actorId!==input.actorId||proof.requestId!==input.requestId||proof.environment!==input.environment||!object(proof.source)||!object(proof.payload)||
  (proof.expectedRevision!==null&&typeof proof.expectedRevision!=='string')||typeof proof.actorAuthSubject!=='string')return null;
 if(proof.actorAuthSubject!==input.actorAuthSubject)throw new IncidentCommandAccessError('The original incident responder identity does not match this session.');
 const source=proof.source;
 if(source.action!==row.action||source.subjectType!==row.subjectType||source.subjectId!==row.subjectId||row.actorId!==input.actorId||row.action!=='system.incident.'+input.action||
  (input.action==='create'?'new':row.subjectId)!==input.sourceId)return null;
 const original=await commandReceipt(db,{actorId:input.actorId,requestId:input.requestId,expectedRevision:proof.expectedRevision as string|null,now:input.now},
  {action:row.action,subjectType:row.subjectType,subjectId:row.subjectId},proof.payload);
 if(!original.replayed||typeof result.incidentId!=='string'||typeof result.version!=='string'||typeof result.state!=='string')return null;
 await incidentCommandAuthority(db,{...input,expectedRevision:null},IncidentCommandAccessError);
 return{ok:true,recorded:true,actorId:input.actorId,requestId:input.requestId,action:input.action,sourceId:input.sourceId,incidentId:result.incidentId,version:result.version,state:result.state,historical:true};
}
