import './helpers/seller-registration-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {sellerRegistrationScopeFixture,registrationScopeOrigin,type RegistrationScopeResponse} from './helpers/seller-registration-scope-fixture';
import {readSellerDraft} from '../lib/sellers/draft-store';
import {startSellerRegistration} from '../lib/db/repositories/seller-commercial-access';

void test('registration reads bind intended internal account while the existing draft guard protects even its first unsaved write',async()=>{
 const f=await sellerRegistrationScopeFixture();try{
  const get:(request:Request)=>Promise<Response>=f.api.GET;
  f.select('registration-b');const oldA=new Request(registrationScopeOrigin+'/api/seller-registrations',{headers:{'X-Hastabazaar-Actor':'registration-a'}}),denied=await get(oldA);
  assert.equal(denied.status,403,await denied.clone().text());assert.doesNotMatch(await denied.text(),/PRIVATE-ORIGINAL/);
  const own=await get(new Request(registrationScopeOrigin+'/api/seller-registrations',{headers:{'X-Hastabazaar-Actor':'registration-b'}}));assert.equal(own.status,200);assert.match(await own.text(),/PRIVATE-ORIGINAL-NATIONAL-ID-B/);
  const external=await get(new Request(registrationScopeOrigin+'/api/seller-registrations',{headers:{'X-Hastabazaar-Actor':'subject-registration-b'}}));assert.equal(external.status,403,'provider subject is not the internal rendered actor');
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});


void test('the existing mandatory draft account guard protects a first unsaved draft and never activates a seller',async()=>{
 const f=await sellerRegistrationScopeFixture();try{
  f.select('registration-b');
  const drafts=await import('../app/api/seller-applications/draft/route'),data=new FormData();data.set('payload',JSON.stringify({revision:null,changeId:crypto.randomUUID(),attemptId:crypto.randomUUID(),formVersion:1,answers:{legalName:['PRIVATE UNSAVED A']},files:{}}));
  const unsaved=await drafts.PUT(new Request(registrationScopeOrigin+'/api/seller-applications/draft',{method:'PUT',headers:{origin:registrationScopeOrigin,'X-Draft-Account':'registration-a'},body:data}));assert.equal(unsaved.status,403);assert.equal(await readSellerDraft(f.db,'registration-b'),null);

  const own=new FormData();own.set('payload',JSON.stringify({revision:null,changeId:crypto.randomUUID(),attemptId:'registration_v1_'+crypto.randomUUID(),formVersion:1,answers:{legalName:['PRIVATE CURRENT B OWN DRAFT']},files:{}}));
  const saved=await drafts.PUT(new Request(registrationScopeOrigin+'/api/seller-applications/draft',{method:'PUT',headers:{origin:registrationScopeOrigin,'X-Draft-Account':'registration-b'},body:own}));assert.equal(saved.status,200,await saved.text());assert.equal((await readSellerDraft(f.db,'registration-b'))!.answers.legalName[0],'PRIVATE CURRENT B OWN DRAFT');assert.equal(await readSellerDraft(f.db,'registration-a'),null);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id IN('registration-a','registration-b') AND role='seller'").get()!.n,0);
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});


void test('staff commercial terms access does not grant account draft or intake access before an explicit start',async()=>{
 const f=await sellerRegistrationScopeFixture();try{
  f.select('registration-c');
  f.sqlite.exec(`DELETE FROM audit_logs WHERE actor_id='registration-c' AND action='seller.registration.started';
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registration-c','super_admin',1)`);
  const terms=await import('../lib/auth/seller-commercial-access');
  assert.equal((await terms.requireSellerTermsApi()).audience,'staff');
  const draft=await import('../app/api/seller-applications/draft/route');
  const url=registrationScopeOrigin+'/api/seller-applications/draft';
  const headers={origin:registrationScopeOrigin,'X-Draft-Account':'registration-c'};
  const body=new FormData();
  const changeId=crypto.randomUUID();
  body.set('payload',JSON.stringify({revision:null,changeId,attemptId:'registration_v1_'+crypto.randomUUID(),formVersion:1,answers:{legalName:['Fictional staff applicant']},files:{}}));
  const read=()=>draft.GET(new Request(url,{headers}));
  const save=()=>draft.PUT(new Request(url,{method:'PUT',headers,body}));
  const remove=()=>draft.DELETE(new Request(url,{method:'DELETE',headers:{...headers,'If-Match':changeId}}));
  for(const call of [read,save,remove]){
   const denied=await call();assert.equal(denied.status,403,await denied.text());
  }
  const intake = () => f.api.GET(new Request(registrationScopeOrigin+'/api/seller-registrations',
    {headers:{'X-Hastabazaar-Actor':'registration-c'}}));
  assert.equal((await intake()).status,403);
  assert.equal(await readSellerDraft(f.db,'registration-c'),null);
  await startSellerRegistration(f.db,{userId:'registration-c',requestId:crypto.randomUUID(),now:Date.now()});
  assert.deepEqual(await (await intake()).json(),{registration:null});
  const empty=await read();assert.equal(empty.status,200,await empty.clone().text());assert.deepEqual(await empty.json(),{draft:null});
  const saved=await save();assert.equal(saved.status,200,await saved.clone().text());
  assert.equal((await readSellerDraft(f.db,'registration-c'))?.revision,changeId);
  const deleted=await remove();assert.equal(deleted.status,200,await deleted.text());
  assert.equal(await readSellerDraft(f.db,'registration-c'),null);
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});

void test('the actual retained read projects verified identity locks without converting its historical passport',async()=>{
 const f=await sellerRegistrationScopeFixture();try{
  f.select('registration-a');const {PDFDocument,PDFName}=await import('pdf-lib'),{verifySellerDocument}=await import('../lib/sellers/document-review');
  const pdf=await PDFDocument.create(),page=pdf.addPage([300,400]);
  page.drawText('Synthetic retained identity fixture');
  pdf.catalog.set(PDFName.of('OpenAction'),pdf.context.obj([page.ref,'XYZ',null,null,0.75]));
  const originalPdf=new Uint8Array(await pdf.save({useObjectStreams:false}));
  const ownRequest=()=>new Request(registrationScopeOrigin+'/api/seller-registrations',{headers:{'X-Hastabazaar-Actor':'registration-a'}});
  const prior=(await(await f.api.GET(ownRequest())).json() as RegistrationScopeResponse).registration,data=new FormData();
  const {registrationEmail,...answers}=prior.answers;
  for(const[k,values]of Object.entries(answers))for(const value of values)data.append(k,value);
  data.set('email',registrationEmail?.[0]??'registration-a@local.hastabazaar.test');data.set('requestId',crypto.randomUUID());data.set('revision',String(prior.version));data.set('formVersion','1');data.set('representativeIdentity',new File([originalPdf],'synthetic-identity.pdf',{type:'application/pdf'}));
  const upload=await f.api.PUT(new Request(registrationScopeOrigin+'/api/seller-registrations',{method:'PUT',headers:{origin:registrationScopeOrigin,'X-Hastabazaar-Actor':'registration-a'},body:data}));assert.equal(upload.status,200,await upload.text());
  const document=f.sqlite.prepare("SELECT d.id,d.seller_id AS sellerId,d.object_key AS objectKey FROM seller_documents d JOIN seller_profiles p ON p.id=d.seller_id WHERE p.user_id='registration-a' AND d.kind='representative_identity'").get()!;
  assert.deepEqual(f.objects.get(String(document.objectKey)),originalPdf);
  await verifySellerDocument(f.db,{sellerId:String(document.sellerId),documentId:String(document.id),actorId:'reviewer',reason:'Independently review this synthetic exact identity',now:Date.now()});
  const record=(await(await f.api.GET(ownRequest())).json() as RegistrationScopeResponse).registration;assert.equal(record.answers.governmentIdType[0],'passport');assert.equal(record.answers.governmentIdDescription[0],'PRIVATE-ORIGINAL-PASSPORT-A');assert.equal(record.editable,true);assert.ok(record.lockedFields?.includes('governmentIdType'));assert.ok(record.lockedFields?.includes('governmentIdDescription'));assert.ok(record.lockedDocumentKinds?.includes('representative_identity'));
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});


void test('registration read rechecks intended internal account after its asynchronous private projections',async()=>{
 const f=await sellerRegistrationScopeFixture();try{
  f.select('registration-a');const prepare=f.db.prepare.bind(f.db);let changed=false;
  f.db.prepare=(sql:string)=>{const statement=prepare(sql);if(sql.startsWith('SELECT s.status,')&&sql.includes('WHERE s.id=? AND s.user_id=?')){
   const first=statement.first.bind(statement);statement.first=async<T>(column?:string)=>{const result=column===undefined?await first<T>():await first<T>(column);if(!changed){changed=true;f.select('registration-b');}return result;};
  }return statement;};
  const response=await f.api.GET(new Request(registrationScopeOrigin+'/api/seller-registrations',{headers:{'X-Hastabazaar-Actor':'registration-a'}}));assert.ok(changed);assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/PRIVATE-ORIGINAL/);
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});
