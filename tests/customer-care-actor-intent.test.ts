import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/care-runtime';
import {nativeCareFixture} from './helpers/native-care-fixture';

void test('actual customer care receivers reject another actor intent before adopting private request or reply content',async()=>{
 const f=await nativeCareFixture();try{
  f.sqlite.prepare("UPDATE users SET auth_subject='external-customer-subject' WHERE id='checkout-buyer'").run();
  globalThis.careBrowserDb=f.database;globalThis.careBrowserActor='external-customer-subject';
  const returns=await import('../app/orders/[orderNumber]/returns/route'),complaints=await import('../app/orders/[orderNumber]/complaints/route'),returnReply=await import('../app/orders/[orderNumber]/returns/[id]/reply/route'),complaintReply=await import('../app/orders/[orderNumber]/complaints/[id]/reply/route'),cancel=await import('../app/orders/[orderNumber]/cancel/route');
  const origin='https://care-scope.test',before=f.sqlite.prepare('SELECT COUNT(*) n FROM return_request_events').get()!.n;
  for(const[receiver,path,id]of [[returns.POST,'returns',f.caseId],[complaints.POST,'complaints',f.complaintId],[returnReply.POST,'returns/'+f.caseId+'/reply',f.caseId],[complaintReply.POST,'complaints/'+f.complaintId+'/reply',f.complaintId],[cancel.POST,'cancel',f.caseId]]as const){
   const response=await receiver(new Request(origin+'/orders/'+f.access.orderNumber+'/'+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':'previous-customer'},body:JSON.stringify({message:'PRIVATE previous account content must never be adopted by this new authenticated customer.'})}),{params:Promise.resolve({orderNumber:f.access.orderNumber,id})});
   assert.equal(response.status,403,path+': '+await response.text());
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM return_request_events').get()!.n,before);
  const current=await cancel.GET(new Request(origin+'/orders/'+f.access.orderNumber+'/cancel',{headers:{'X-Hastabazaar-Actor':'checkout-buyer'}}),{params:Promise.resolve({orderNumber:f.access.orderNumber})});assert.equal(current.status,200,await current.text());
 }finally{await f.dispose();}
});
