import {digestFormRequest} from '@/lib/forms/client-submission';
import {parsePublishedFormConfig} from '@/components/forms/form-config-client';
import type {PublishedFormConfig} from '@/lib/forms/types';
import type {ManagedTermsOffer} from '@/lib/managed-commerce/accepted-terms';
const formId='seller.managed-terms-acceptance';
export interface ManagedTermsAttempt {schema:1;ownerId:string;sellerId:string;offer:ManagedTermsOffer;config:PublishedFormConfig;body:Record<string,unknown>;digest:string}
export const managedTermsAttemptPrefix=(ownerId:string,sellerId:string)=>`hastabazaar:managed-terms:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(sellerId)}:`;
export const managedTermsAttemptKey=(ownerId:string,sellerId:string,offerId:string)=>`${managedTermsAttemptPrefix(ownerId,sellerId)}${encodeURIComponent(offerId)}`;
export async function readManagedTermsAttempts(storage:Storage,ownerId:string,sellerId:string) {
 const prefix=managedTermsAttemptPrefix(ownerId,sellerId);const attempts:ManagedTermsAttempt[]=[];
 for(let index=0;index<storage.length;index++){
  const key=storage.key(index);if(!key?.startsWith(prefix))continue;
  if(attempts.length>=64)throw new Error('Review the recorded acceptance history before starting more requests.');
  const offerId=decodeURIComponent(key.slice(prefix.length));const attempt=await readManagedTermsAttempt(storage,ownerId,sellerId,offerId);
  if(attempt)attempts.push(attempt);
 }
 return attempts;
}
export async function readManagedTermsAttempt(storage:Storage,ownerId:string,sellerId:string,offerId:string) {
 const raw=storage.getItem(managedTermsAttemptKey(ownerId,sellerId,offerId));if(raw===null)return null;
 if(raw.length>524288)throw new Error('The saved acceptance needs review before starting another request.');
 const value=JSON.parse(raw) as ManagedTermsAttempt;const {digest,...original}=value;
 if(value.schema!==1||value.ownerId!==ownerId||value.sellerId!==sellerId||value.offer?.id!==offerId||
  !parsePublishedFormConfig(formId,{config:value.config})||!value.body||value.body.offerId!==offerId||value.body.context!==value.offer.context||
  value.body.language!=='en'||value.body.accepted!==true||value.body.formVersion!==value.config.version||!Array.isArray(value.body.customAnswers)||
  typeof value.body.requestId!=='string'||!/^[-a-f0-9]{36}$/.test(value.body.requestId)||digest!==await digestFormRequest(original))
  throw new Error('The saved acceptance changed. Check its history before starting another request.');
 return value;
}
export async function retainManagedTermsAttempt(storage:Storage,ownerId:string,sellerId:string,offer:ManagedTermsOffer,config:PublishedFormConfig,body:Record<string,unknown>) {
 const key=managedTermsAttemptKey(ownerId,sellerId,offer.id);
 if(storage.getItem(key)!==null)throw new Error('Retry the original acceptance first.');
 const original={schema:1 as const,ownerId,sellerId,offer,config,body};
 const value={...original,digest:await digestFormRequest(original)};const raw=JSON.stringify(value);
 if(raw.length>524288)throw new Error('The acceptance form is too large to retain safely.');
 storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw new Error('The acceptance could not be retained for safe retry.');
 return value;
}
export function verifiedManagedTermsReceipt(attempt:ManagedTermsAttempt,result:unknown) {
 if(!result||typeof result!=='object')return false;
 const value=result as Record<string,unknown>;
 return value.ok===true&&value.requestId===attempt.body.requestId&&value.sellerId===attempt.sellerId&&value.offerId===attempt.offer.id&&
  value.formVersion===attempt.config.version&&typeof value.detailId==='string'&&value.detailId.length>0;
}
