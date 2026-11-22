import {commerceOrderFixture} from './commerce-order-fixture';
import {publishCareForm} from './published-care-form';
import {createCustomerReturnRequest,reviewReturnAsAdmin} from '../../lib/db/repositories/returns';
import {createCustomerComplaint} from '../../lib/db/repositories/complaints';

/** Fictional original delivered order and exact native care sources; no provider. */
export async function nativeCareFixture(options:{review?:boolean}={}){
 const f=await commerceOrderFixture();try{
  await f.deliver();const item=f.sqlite.prepare('SELECT id,line_total_paisa AS amount FROM order_items').get()!;
  const request=await createCustomerReturnRequest(f.database,{...f.access,receiptTokenHash:null,orderItemId:String(item.id),quantity:1,reason:'defective',requestedResolution:'replacement',detail:'Independently retain this fictional original damaged item and its requested supported replacement.',locale:'en-NP',idempotencyKey:crypto.randomUUID(),evidence:[],now:Date.now()});
  const returnForm=await publishCareForm(f.database,'owner','staff.return-case-action',{context:'FINANCIAL-ONLY-FICTIONAL-ORIGINAL-REVIEW'});
  if(options.review!==false)await reviewReturnAsAdmin(f.database,{returnRequestId:request.id,actorId:'owner',actorRole:'super_admin',action:'approve',responsibility:'seller',outcome:'replacement',note:'Retain the exact original independent review before physical replacement handling.',publicMessageEn:'Replacement approved. Instructions, actual receipt, inspection and delivery remain separate.',publicMessageNe:'प्रतिस्थापन स्वीकृत भयो। निर्देशन, प्राप्ति, निरीक्षण र डेलिभरी अलग चरण हुन्।',requestId:'care-original-reviewed',now:Date.now(),form:{versionId:returnForm.validated.versionId,answers:returnForm.validated.answers}});
  const complaint=await createCustomerComplaint(f.database,{...f.access,receiptTokenHash:null,orderItemId:null,category:'other',subject:'Fictional original case communication',detail:'Retain this distinct order-level support concern and original customer reference.',locale:'en-NP',requestId:crypto.randomUUID(),now:Date.now()});
  const complaintForm=await publishCareForm(f.database,'owner','staff.complaint-case-action',{context:'FICTIONAL-COMPLAINT-CONTEXT'});
  return{...f,caseId:request.id,complaintId:complaint.id,returnForm,complaintForm};
 }catch(error){await f.dispose();throw error;}
}
