import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {OfferError} from './offer-contracts';
import {independentProductStaffSql} from './party-scope';
export {independentProductStaffSql} from './party-scope';
export {OfferError};
export const productReadGuardConflict=(error:unknown)=>/constraint|conflict|guard[_ ]?(?:failed|invalid|rejected)/i.test(String(error));
/** A private read returns only after its captured current authority/source proof commits. */
export async function confirmProductRead(db:D1Database,guards:D1PreparedStatement[],recheck:()=>Promise<void>){try{await db.batch(guards);}catch(error){if(!productReadGuardConflict(error))throw new OfferError('Current Product information could not be confirmed. Keep your entries and retry.',503);await recheck();throw new OfferError('The Product source changed. Keep your entries and compare the current record.',409);}}
export function offerGuard(db:D1Database,predicate:string,values:unknown[]){const id=crypto.randomUUID();return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
export const offerOwnerSql="EXISTS(SELECT 1 FROM products p JOIN seller_profiles s ON s.id=p.seller_id JOIN users u ON u.id=s.user_id WHERE p.id=? AND u.id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('customer','seller')))";
export async function productStaffPartyGuards(db:D1Database,actorId:string,productId:string){const predicates=independentProductStaffSql('?','?');for(const predicate of predicates)if(!await db.prepare(`SELECT 1 WHERE ${predicate}`).bind(productId,actorId).first())throw new OfferError('An independent permitted staff member must review this Product; its current or retained original owner cannot act as independent staff.',403);return predicates.flatMap(predicate=>offerGuard(db,predicate,[productId,actorId]));}
export async function offerAuthority(db:D1Database,actorId:string,productId:string,review=false){
 const owner=await db.prepare(`SELECT 1 WHERE ${offerOwnerSql}`).bind(productId,actorId).first();if(!review&&owner)return offerGuard(db,offerOwnerSql,[productId,actorId]);
 class PermissionError extends OfferError{constructor(message:string){super(message,403);}}
 const authority=await staffMutationGuard(db,actorId,'product.review',PermissionError);
 if(review){if(owner)throw new PermissionError('An independent permitted reviewer must review this offer candidate.');return [...authority.statements,...await productStaffPartyGuards(db,actorId,productId)];}
 throw new PermissionError('This operation requires the current product owner.');
}
export const offerReason=(value:string)=>{if(typeof value!=='string'||value.trim().length<10||value.length>1000)throw new OfferError('Describe the actual stock or review reason.',400);return value.trim();};
type OfferCommandBuilder<T>=(receipt:Extract<Awaited<ReturnType<typeof commandReceipt>>,{replayed:false}>)=>Promise<{statements:D1PreparedStatement[];result:T}>;
export interface PreparedOfferCommand<T>{statements:D1PreparedStatement[];result:T;replayed:boolean}
export async function prepareOfferCommand<T>(db:D1Database,ctx:CommandContext,action:string,subjectId:string,payload:unknown,build:OfferCommandBuilder<T>):Promise<PreparedOfferCommand<T>>{
 const receipt=await commandReceipt(db,ctx,{action,subjectType:'product_offer',subjectId},payload);if(receipt.replayed)return {replayed:true,statements:[],result:receipt.result as T};
 const {statements,result}=await build(receipt);return {replayed:false,statements:[...statements,receipt.insert(result)],result};
}
export async function commitPreparedOfferCommand<T>(db:D1Database,ctx:CommandContext,action:string,subjectId:string,payload:unknown,prepared:PreparedOfferCommand<T>):Promise<T>{
 if(prepared.replayed)return prepared.result;try{await db.batch(prepared.statements);}catch(error){const retry=await commandReceipt(db,ctx,{action,subjectType:'product_offer',subjectId},payload);if(retry.replayed)return retry.result as T;throw new OfferError(/constraint|conflict|offer_|guard/i.test(String(error))?'The offer, stock or authority changed. Keep your draft and compare the current record.':'The outcome is uncertain. Retry this exact request before editing again.',/constraint|conflict|offer_|guard/i.test(String(error))?409:503);}return prepared.result;
}
export async function executeOfferCommand<T>(db:D1Database,ctx:CommandContext,action:string,subjectId:string,payload:unknown,build:OfferCommandBuilder<T>):Promise<T>{return commitPreparedOfferCommand(db,ctx,action,subjectId,payload,await prepareOfferCommand(db,ctx,action,subjectId,payload,build));}
