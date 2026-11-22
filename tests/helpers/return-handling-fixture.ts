import {commerceOrderFixture} from './commerce-order-fixture';
import {createCustomerReturnRequest,reviewReturnAsAdmin} from '../../lib/db/repositories/returns';
export async function approvedReplacement(){
 const f=await commerceOrderFixture();try{
  await f.deliver();const itemId=String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id);
  const request=await createCustomerReturnRequest(f.database,{...f.access,receiptTokenHash:null,orderItemId:itemId,quantity:1,reason:'defective',requestedResolution:'replacement',detail:'The original delivered item is defective. Please arrange the same supported replacement.',locale:'en-NP',idempotencyKey:'physical-return-request',evidence:[],now:Date.now()});
  await reviewReturnAsAdmin(f.database,{returnRequestId:request.id,actorId:'owner',actorRole:'super_admin',action:'approve',note:'The original item evidence supports the requested replacement.',publicMessageEn:'Replacement approved; physical instructions and actual delivery remain to be arranged.',publicMessageNe:'प्रतिस्थापन स्वीकृत भयो। फिर्ता निर्देशन र डेलिभरीको व्यवस्था बाँकी छ।',responsibility:'seller',outcome:'replacement',requestId:'physical-return-approve',now:Date.now()});
  return {...f,caseId:request.id,itemId};
 }catch(error){await f.dispose();throw error;}
}
