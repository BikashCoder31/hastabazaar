import {accountCommandActions,type AccountCommandReference,type AccountCommandOutcome} from './command-outcome-contract';
export class AccountCommandOutcomeError extends Error{constructor(message:string,readonly status:number=400){super(message);}}
const validId=(value:unknown,max=191):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&!Array.from(value).some(character=>{const code=character.charCodeAt(0);return code<=31||code===127;});
export function accountCommandReference(value:unknown):AccountCommandReference{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['action','sourceId','requestId','relatedId'].includes(key)))throw new AccountCommandOutcomeError('Identify the original account action and source.');
 const row=value as Record<string,unknown>;if(!accountCommandActions.includes(row.action as never)||!validId(row.sourceId)||!validId(row.requestId,100)||row.relatedId!==undefined&&!validId(row.relatedId))throw new AccountCommandOutcomeError('The original account action reference is invalid.');
 if(row.action==='review.submit'?!validId(row.relatedId):row.relatedId!==undefined)throw new AccountCommandOutcomeError('Identify the exact original review product and purchase.');
 if(row.action==='address.create'&&row.sourceId!=='new')throw new AccountCommandOutcomeError('The original new-address source is invalid.');return row as unknown as AccountCommandReference;
}
const customerRole="EXISTS(SELECT 1 FROM user_roles customer_role WHERE customer_role.user_id=account_user.id AND HEX(customer_role.user_id)=HEX(account_user.id) AND customer_role.role='customer' AND HEX(customer_role.role)=HEX('customer'))";
const auditActions={ 'profile.update':['account.profile.updated','user'],'address.create':['account.address.created','address'],'address.update':['account.address.updated','address'],'address.delete':['account.address.deleted','address'],'review.submit':['review.submitted','product_review']}as const;
interface Receipt{id:string;actorId:string;requestId:string;action:string;subjectType:string;subjectId:string}
/** Read-only, private-payload-free proof of an original native command. No replay or provisioning. */
export async function readAccountCommandOutcome(db:D1Database,actorId:string,value:unknown):Promise<AccountCommandOutcome>{
 const input=accountCommandReference(value),identity=await db.prepare(`SELECT account_user.id,account_user.auth_subject authSubject,account_user.status FROM users account_user WHERE account_user.id=? AND ${customerRole}`).bind(actorId).first<{id:string;authSubject:string|null;status:string}>();
 if(!identity||identity.id!==actorId||identity.status!=='active'||!identity.authSubject)throw new AccountCommandOutcomeError('Current account access is unavailable. Sign in to the intended account before checking its original result.',403);
 const nativeRequest=input.action==='privacy.request'?input.requestId+':audit':input.requestId;
 const receipt=await db.prepare('SELECT id,actor_id actorId,request_id requestId,action,subject_type subjectType,subject_id subjectId FROM audit_logs WHERE request_id=? AND actor_id=? LIMIT 1').bind(nativeRequest,actorId).first<Receipt>();
 const expected=input.action==='privacy.request'?['privacy.submit','data_rights_request']:auditActions[input.action];
 let recorded=!!receipt&&receipt.actorId===actorId&&receipt.requestId===nativeRequest&&receipt.action===expected[0]&&receipt.subjectType===expected[1];
 if(input.action==='profile.update'||input.action==='privacy.request')recorded=recorded&&input.sourceId===actorId;
 if(input.action==='profile.update')recorded=recorded&&receipt?.subjectId===actorId;
 if(input.action==='address.update'||input.action==='address.delete')recorded=recorded&&receipt?.subjectId===input.sourceId;
 let sourceProof='1=1';const sourceValues:unknown[]=[];
 if((input.action==='profile.update'||input.action==='privacy.request')&&input.sourceId!==actorId)throw new AccountCommandOutcomeError('This account source belongs to a different account.',403);
 let proof='1=1';const values:unknown[]=[];
 if(recorded&&receipt){
  proof='EXISTS(SELECT 1 FROM audit_logs original_receipt WHERE original_receipt.id=? AND HEX(original_receipt.actor_id)=HEX(?) AND HEX(original_receipt.request_id)=HEX(?) AND HEX(original_receipt.action)=HEX(?) AND HEX(original_receipt.subject_type)=HEX(?) AND HEX(original_receipt.subject_id)=HEX(?))';values.push(receipt.id,actorId,nativeRequest,receipt.action,receipt.subjectType,receipt.subjectId);
  if(input.action==='review.submit'){
   const row=await db.prepare('SELECT customer_id actorId,order_item_id sourceId,product_id productId FROM product_reviews WHERE id=?').bind(receipt.subjectId).first<{actorId:string;sourceId:string;productId:string}>();recorded=!!row&&row.actorId===actorId&&row.sourceId===input.sourceId&&row.productId===input.relatedId;
   proof+=' AND EXISTS(SELECT 1 FROM product_reviews original_review WHERE original_review.id=? AND HEX(original_review.customer_id)=HEX(?) AND HEX(original_review.order_item_id)=HEX(?) AND HEX(original_review.product_id)=HEX(?))';values.push(receipt.subjectId,actorId,input.sourceId,input.relatedId);
  }else if(input.action==='privacy.request'){
   const row=await db.prepare('SELECT customer_id actorId,created_request_id requestId FROM data_rights_requests WHERE id=?').bind(receipt.subjectId).first<{actorId:string;requestId:string}>();recorded=!!row&&row.actorId===actorId&&row.requestId===input.requestId;
   proof+=' AND EXISTS(SELECT 1 FROM data_rights_requests original_privacy WHERE original_privacy.id=? AND HEX(original_privacy.customer_id)=HEX(?) AND HEX(original_privacy.created_request_id)=HEX(?))';values.push(receipt.subjectId,actorId,input.requestId);
  }
 }
 if(!recorded&&(input.action==='address.update'||input.action==='address.delete')){sourceProof='EXISTS(SELECT 1 FROM addresses current_address WHERE current_address.id=? AND HEX(current_address.id)=HEX(?) AND HEX(current_address.user_id)=HEX(?))';sourceValues.push(input.sourceId,input.sourceId,actorId);}
 if(!recorded&&input.action==='review.submit'){sourceProof='EXISTS(SELECT 1 FROM order_items current_item JOIN orders current_order ON current_order.id=current_item.order_id WHERE current_item.id=? AND HEX(current_item.id)=HEX(?) AND HEX(current_item.product_id)=HEX(?) AND HEX(current_order.customer_id)=HEX(?))';sourceValues.push(input.sourceId,input.sourceId,input.relatedId,actorId);}
 if(sourceProof!=='1=1'&&!await db.prepare('SELECT 1 WHERE '+sourceProof).bind(...sourceValues).first())throw new AccountCommandOutcomeError('Current access to the original account source is unavailable.',403);
 const active="account_user.id=? AND HEX(account_user.id)=HEX(?) AND account_user.status='active' AND HEX(account_user.status)=HEX('active') AND account_user.auth_subject=? AND HEX(account_user.auth_subject)=HEX(?) AND "+customerRole;
 // The final SELECT preserves indexed identity lookup plus byte-exact identity,
 // role, native receipt and source proof. No data await follows this boundary.
 const final=await db.prepare(`SELECT CASE WHEN ${recorded?proof:'1=1'} THEN 1 ELSE 0 END confirmed FROM users account_user WHERE ${active} AND ${sourceProof}`).bind(...(recorded?values:[]),actorId,actorId,identity.authSubject,identity.authSubject,...sourceValues).first<{confirmed:number}>();
 if(!final)throw new AccountCommandOutcomeError('Current account access changed. Recheck the intended signed-in account.',403);
 if(!final.confirmed)throw new AccountCommandOutcomeError('The original account receipt or current source could not be confirmed. Check the saved result again.',409);
 return{requestId:input.requestId,status:recorded?'recorded':'unconfirmed'};
}
