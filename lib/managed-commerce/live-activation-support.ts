import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {paymentGuard} from '../payments/manual-receipts';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
export class ManagedLiveError extends Error{constructor(message:string,readonly status=409){super(message);}}
class ManagedLiveAuthorityError extends ManagedLiveError{constructor(message:string){super(message,403);}}
export const MANAGED_LIVE_MODEL='managed_sale_linked_percentage_v1' as const;
export const liveDigest=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');
export function liveText(value:unknown,label:string,min=8,max=1500){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\p{Cc}<>]/u.test(value))throw new ManagedLiveError('Record the actual '+label+'.',400);return value.trim();}
/** Code-owned SQL selectors only; the same retained-party rule fences lists and commands. */
export function managedLivePartyPredicate(sellerExpression:'?'|'seller.id'='?'){return `EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=${sellerExpression} AND s.user_id<>?) AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=${sellerExpression} AND retained.agreement_accepted_by=?) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=${sellerExpression} AND retained.owner_id=?) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=${sellerExpression} AND retained.owner_id=?)`;}
export async function managedLiveAuthority(db:D1Database,actorId:string,sellerId:string){
 const authority=await staffMutationGuard(db,actorId,'seller.application.review',ManagedLiveAuthorityError,'super_admin');
 const predicate=managedLivePartyPredicate();
 const values=[sellerId,actorId,sellerId,actorId,sellerId,actorId,sellerId,actorId];
 if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new ManagedLiveError('An eligible Super Admin without a current or retained personal seller interest must review this live commercial action.',403);
 return [...authority.statements,...paymentGuard(db,predicate,values)];
}
export async function managedLiveCommand(db:D1Database,ctx:CommandContext,action:string,sellerId:string,payload:unknown){
 const authority=await managedLiveAuthority(db,ctx.actorId,sellerId),identity={action:'managed_maker.live.'+action,subjectType:'seller',subjectId:sellerId};
 const read=()=>commandReceipt(db,ctx,identity,payload),receipt=await read();
 return {authority,receipt,async commit<T>(statements:D1PreparedStatement[],result:T):Promise<T>{if(receipt.replayed)return receipt.result as T;try{await db.batch([...authority,...statements,...authority,receipt.insert(result)]);return result;}catch(error){await managedLiveAuthority(db,ctx.actorId,sellerId);const saved=await read();if(saved.replayed)return saved.result as T;throw error;}}};
}
