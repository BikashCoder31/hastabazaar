import './helpers/seller-registration-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {sellerDocumentScopeFixture} from './helpers/seller-document-scope-fixture';
import {registrationScopeOrigin as origin} from './helpers/seller-registration-scope-fixture';

void test('document correction rejects wrong intended actor before private media inventory or replacement writes',async()=>{
 const f=await sellerDocumentScopeFixture();try{
  const api=await import('../app/api/seller-applications/documents/[id]/replacement/route'),before={objects:f.objects.size,documents:f.sqlite.prepare('SELECT COUNT(*) n FROM seller_documents').get()!.n,inventory:f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='seller.document.upload_started'").get()!.n};
  const data=f.correction();const response=await api.POST(new Request(origin+'/api/seller-applications/documents/'+f.document.id+'/replacement',{method:'POST',headers:{origin,'X-Hastabazaar-Actor':'registration-a'},body:data}),{params:Promise.resolve({id:f.document.id})});
  assert.equal(response.status,403,await response.text());assert.equal(f.objects.size,before.objects);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_documents').get()!.n,before.documents);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='seller.document.upload_started'").get()!.n,before.inventory);
  const own=()=>new Request(origin+'/api/seller-applications/documents/'+f.document.id+'/replacement',{method:'POST',headers:{origin,'X-Hastabazaar-Actor':'registration-b'},body:data});
  const saved=await api.POST(own(),{params:Promise.resolve({id:f.document.id})});assert.equal(saved.status,200,await saved.clone().text());const result=await saved.json()as{documentId:string};const replay=await api.POST(own(),{params:Promise.resolve({id:f.document.id})});assert.equal(replay.status,200,await replay.clone().text());assert.equal((await replay.json()as{documentId:string}).documentId,result.documentId);
  assert.equal(f.objects.size,before.objects+1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_documents').get()!.n,Number(before.documents)+1);assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(result.documentId)!.status,'pending');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='registration-b' AND role='seller'").get()!.n,0);

 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});


void test('verified document change requests bind intended actor without inventing permission or holds',async()=>{
 const f=await sellerDocumentScopeFixture();try{
  const {verifySellerDocument}=await import('../lib/sellers/document-review');await verifySellerDocument(f.db,{sellerId:f.document.sellerId,documentId:f.document.id,actorId:'reviewer',expectedReviewId:null,commandId:crypto.randomUUID(),reason:'Independently review the actual synthetic uploaded identity PDF.',now:Date.now()});
  const api=await import('../app/api/seller-applications/document-change/route'),body={documentId:f.document.id,reason:'Replace only this exact verified evidence with a clearer owned scan.',commandId:crypto.randomUUID()},before={requests:f.sqlite.prepare('SELECT COUNT(*) n FROM seller_document_change_requests').get()!.n,cases:f.sqlite.prepare('SELECT COUNT(*) n FROM seller_protected_change_cases').get()!.n};
  const request=(actor:string)=>new Request(origin+'/api/seller-applications/document-change',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});
  const wrong=await api.POST(request('registration-a'));assert.equal(wrong.status,403,await wrong.text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_document_change_requests').get()!.n,before.requests);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_protected_change_cases').get()!.n,before.cases);
  const saved=await api.POST(request('registration-b'));assert.equal(saved.status,200,await saved.clone().text());const receipt=await saved.json()as{requestId:string};const replay=await api.POST(request('registration-b'));assert.equal(replay.status,200);assert.equal((await replay.json()as{requestId:string}).requestId,receipt.requestId);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_document_change_requests').get()!.n,Number(before.requests)+1);assert.equal(f.sqlite.prepare('SELECT status FROM seller_document_change_requests WHERE id=?').get(receipt.requestId)!.status,'submitted');assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(f.document.id)!.status,'verified');
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});


void test('protected identity requests bind intended owner before scoped holds and review work are recorded',async()=>{
 const f=await sellerDocumentScopeFixture();try{
  const {verifySellerDocument}=await import('../lib/sellers/document-review'),{sellerDocumentWorkspace}=await import('../lib/sellers/document-workspace');await verifySellerDocument(f.db,{sellerId:f.document.sellerId,documentId:f.document.id,actorId:'reviewer',expectedReviewId:null,commandId:crypto.randomUUID(),reason:'Independently review this actual synthetic identity PDF before protected changes.',now:Date.now()});
  const workspace=await sellerDocumentWorkspace(f.db,f.document.sellerId,'registration-b','seller');assert.ok(workspace.revisions);const body={kind:'identity',fields:['governmentIdDescription'],reason:'Correct this recorded identity reference for the same actual person.',...workspace.revisions,currentUnusable:false,commandId:crypto.randomUUID(),accountId:'registration-b'};
  const api=await import('../app/api/seller/protected-changes/route'),request=(actor:string)=>new Request(origin+'/api/seller/protected-changes',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});
  const before=f.sqlite.prepare('SELECT COUNT(*) n FROM seller_protected_change_cases WHERE seller_id=?').get(f.document.sellerId)!.n;
  const wrong=await api.POST(request('registration-a'));assert.equal(wrong.status,403,await wrong.text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_protected_change_cases WHERE seller_id=?').get(f.document.sellerId)!.n,before);
  const saved=await api.POST(request('registration-b'));assert.equal(saved.status,200,await saved.clone().text());const receipt=await saved.json()as{caseId:string};const first=f.sqlite.prepare('SELECT version,requested_at FROM seller_protected_change_cases WHERE id=?').get(receipt.caseId);const replay=await api.POST(request('registration-b'));assert.equal(replay.status,200);assert.equal((await replay.json()as{caseId:string}).caseId,receipt.caseId);assert.deepEqual(f.sqlite.prepare('SELECT version,requested_at FROM seller_protected_change_cases WHERE id=?').get(receipt.caseId),first);assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(f.document.id)!.status,'verified');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_protected_change_permissions WHERE case_id=?').get(receipt.caseId)!.n,0,'requesting a change does not approve replacement permission');
  const withdrawal=await import('../app/api/seller/protected-changes/[id]/withdraw/route'),withdrawBody={version:Number(first!.version),accountId:'registration-b',reason:'Withdraw only this original proposed correction without releasing its holds.',commandId:crypto.randomUUID()};
  const withdraw=(actor:string)=>withdrawal.POST(new Request(origin+'/api/seller/protected-changes/'+receipt.caseId+'/withdraw',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(withdrawBody)}),{params:Promise.resolve({id:receipt.caseId})});
  const wrongWithdraw=await withdraw('registration-a');assert.equal(wrongWithdraw.status,403,await wrongWithdraw.text());assert.equal(f.sqlite.prepare('SELECT status FROM seller_protected_change_cases WHERE id=?').get(receipt.caseId)!.status,'open');
  const accepted=await withdraw('registration-b');assert.equal(accepted.status,200,await accepted.text());assert.equal((await withdraw('registration-b')).status,200);assert.equal(f.sqlite.prepare('SELECT status FROM seller_protected_change_cases WHERE id=?').get(receipt.caseId)!.status,'withdrawn');assert.ok(Number(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_capability_holds WHERE case_id=? AND released_at IS NULL').get(receipt.caseId)!.n)>0,'withdrawal cannot release existing capability holds');

 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});


void test('permitted protected identity uploads bind intended owner before bytes or proposed facts',async()=>{
 const f=await sellerDocumentScopeFixture();try{
  const {verifySellerDocument}=await import('../lib/sellers/document-review'),{sellerDocumentWorkspace}=await import('../lib/sellers/document-workspace'),{reviewProtectedChangePermission}=await import('../lib/sellers/protected-change-requests'),{currentProtectedIdentity}=await import('../lib/sellers/protected-identity-change');
  await verifySellerDocument(f.db,{sellerId:f.document.sellerId,documentId:f.document.id,actorId:'reviewer',expectedReviewId:null,commandId:crypto.randomUUID(),reason:'Independently review the actual uploaded synthetic original identity.',now:Date.now()});const workspace=await sellerDocumentWorkspace(f.db,f.document.sellerId,'registration-b','seller');assert.ok(workspace.revisions);
  const requests=await import('../app/api/seller/protected-changes/route'),created=await requests.POST(new Request(origin+'/api/seller/protected-changes',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':'registration-b'},body:JSON.stringify({kind:'identity',fields:['governmentIdDescription'],reason:'Correct the recorded reference for the same original legal person.',...workspace.revisions,currentUnusable:false,commandId:crypto.randomUUID(),accountId:'registration-b'})}));assert.equal(created.status,200,await created.clone().text());const{caseId}=await created.json()as{caseId:string};
  const row=f.sqlite.prepare('SELECT version FROM seller_protected_change_cases WHERE id=?').get(caseId)!;const permissionId=await reviewProtectedChangePermission(f.db,{caseId,actorId:'reviewer',expectedVersion:Number(row.version),expectedIdentityRevision:workspace.revisions.identityRevision,expectedBankRevision:workspace.revisions.bankRevision,decision:'permit',reason:'Permit only this exact reference and fresh identity evidence for independent verification.',requestId:crypto.randomUUID(),now:Date.now()});assert.ok(permissionId);
  const before=await currentProtectedIdentity(f.db,f.document.sellerId),data=new FormData();for(const[key,value]of Object.entries({accountId:'registration-b',commandId:crypto.randomUUID(),permissionId,values:JSON.stringify({governmentIdDescription:'SYNTHETIC PROPOSED OWN REFERENCE'})}))data.set(key,value);data.set('representative_identity',f.correction().get('document')as File);
  const api=await import('../app/api/seller/protected-changes/[id]/identity/route'),request=(actor:string)=>new Request(origin+'/api/seller/protected-changes/'+caseId+'/identity',{method:'POST',headers:{origin,'X-Hastabazaar-Actor':actor},body:data}),objects=f.objects.size;
  const wrong=await api.POST(request('registration-a'),{params:Promise.resolve({id:caseId})});assert.equal(wrong.status,403,await wrong.text());assert.equal(f.objects.size,objects);assert.equal(f.sqlite.prepare('SELECT proposed_json FROM seller_protected_change_cases WHERE id=?').get(caseId)!.proposed_json,null);
  const own=await api.POST(request('registration-b'),{params:Promise.resolve({id:caseId})});assert.equal(own.status,200,await own.text());const replay=await api.POST(request('registration-b'),{params:Promise.resolve({id:caseId})});assert.equal(replay.status,200,await replay.text());assert.equal(f.objects.size,objects+1);assert.equal((await currentProtectedIdentity(f.db,f.document.sellerId)).governmentIdDescription,before.governmentIdDescription,'permitted replacement is proposed evidence, not effective verified facts');
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});


void test('current protected identity retains exact saved optional-intake identity facts before normalization',async()=>{
 const f=await sellerDocumentScopeFixture();try{
  const {currentProtectedIdentity}=await import('../lib/sellers/protected-identity-change');const saved=await f.api.GET(new Request(origin+'/api/seller-registrations',{headers:{'X-Hastabazaar-Actor':'registration-b'}}));assert.equal(saved.status,200);const record=(await saved.json()as{registration:{answers:Record<string,string[]>}}).registration;
  assert.equal(record.answers.governmentIdType[0],'national_id');const facts=await currentProtectedIdentity(f.db,f.document.sellerId);assert.equal(facts.governmentIdType,record.answers.governmentIdType[0]);assert.equal(facts.governmentIdDescription,record.answers.governmentIdDescription[0]);
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});
