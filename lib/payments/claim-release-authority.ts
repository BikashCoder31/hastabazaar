import type {CommandContext} from '../workflows/contracts';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import type {PaymentAttemptAction} from './claim-release-client';

/** Only server authentication may supply this binding. Legacy domain callers omit it. */
export type ClaimReleaseContext=CommandContext&{authSubject?:string};
export class ClaimReleaseAuthorityError extends Error{readonly status=403;constructor(message='Current access to the original payment is required.'){super(message);}}
export class ClaimReleaseProofError extends Error{readonly status=409;constructor(){super('The original authenticated outcome remains unconfirmed. Keep its reference for review.');}}
function predicate(context:ClaimReleaseContext,sourceId:string,action:PaymentAttemptAction){
 const subject=context.authSubject===undefined?'':' AND HEX(u.auth_subject)=HEX(?)';
 const scope=action==='release'?" AND EXISTS(SELECT 1 FROM user_roles r WHERE HEX(r.user_id)=HEX(u.id) AND r.role IN('admin','super_admin'))":" AND EXISTS(SELECT 1 FROM user_roles r WHERE HEX(r.user_id)=HEX(u.id) AND HEX(r.role)=HEX('customer')) AND EXISTS(SELECT 1 FROM orders o WHERE HEX(o.id)=HEX(?) AND HEX(o.customer_id)=HEX(u.id))";
 return {sql:"EXISTS(SELECT 1 FROM users u WHERE HEX(u.id)=HEX(?) AND HEX(u.status)=HEX('active')"+subject+scope+')',values:[context.actorId,...context.authSubject===undefined?[]:[context.authSubject],...action==='release'?[]:[sourceId]]};
}
export async function claimReleaseAuthority(db:D1Database,context:ClaimReleaseContext,sourceId:string,action:PaymentAttemptAction){
 const condition=predicate(context,sourceId,action);
 if(!await db.prepare('SELECT 1 WHERE '+condition.sql).bind(...condition.values).first())throw new ClaimReleaseAuthorityError();
 const staff=action==='release'?(await staffMutationGuard(db,context.actorId,'order.manage',ClaimReleaseAuthorityError)).statements:[];
 const id=crypto.randomUUID();return [...staff,db.prepare('INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN '+condition.sql+' THEN 1 ELSE 0 END').bind(id,...condition.values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}
export async function withClaimReleaseAuthority<T>(db:D1Database,context:ClaimReleaseContext,sourceId:string,action:PaymentAttemptAction,work:()=>Promise<T>):Promise<T>{
 await claimReleaseAuthority(db,context,sourceId,action);
 try{const result=await work();await claimReleaseAuthority(db,context,sourceId,action);return result;}
 catch(error){await claimReleaseAuthority(db,context,sourceId,action);throw error;}
}
async function proofId(context:Pick<CommandContext,'actorId'|'requestId'>){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([context.actorId,context.requestId])));return 'payment-authority:'+Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
/** Inserted only in the same transaction as the original native result; never on replay. */
export async function claimReleaseProofStatement(db:D1Database,context:ClaimReleaseContext,sourceId:string,action:PaymentAttemptAction){
 if(context.authSubject===undefined)return [];
 return [db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,next_json,created_at) VALUES(?,?,'manual.payment.authority.proven','order',?,?,?,?)").bind(await proofId(context),context.actorId,sourceId,context.requestId,JSON.stringify({version:1,action,authSubject:context.authSubject}),context.now)];
}
export async function requireClaimReleaseProof(db:D1Database,context:ClaimReleaseContext,sourceId:string,action:PaymentAttemptAction,recordedAt?:number){
 if(!context.authSubject)throw new ClaimReleaseProofError();
 const row=await db.prepare("SELECT next_json AS proof,created_at AS recordedAt FROM audit_logs WHERE HEX(id)=HEX(?) AND HEX(actor_id)=HEX(?) AND action='manual.payment.authority.proven' AND subject_type='order' AND HEX(subject_id)=HEX(?) AND HEX(request_id)=HEX(?)").bind(await proofId(context),context.actorId,sourceId,context.requestId).first<{proof:string;recordedAt:number}>();
 let proof:unknown;try{proof=row?JSON.parse(row.proof):null;}catch{throw new ClaimReleaseProofError();}
 if(!proof||typeof proof!=='object'||Array.isArray(proof))throw new ClaimReleaseProofError();const saved=proof as Record<string,unknown>;
 if(saved.version!==1||saved.action!==action||saved.authSubject!==context.authSubject||(recordedAt!==undefined&&row?.recordedAt!==recordedAt))throw new ClaimReleaseProofError();
}
