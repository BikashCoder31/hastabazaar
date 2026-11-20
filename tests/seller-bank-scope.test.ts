import './helpers/seller-registration-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {sellerRegistrationScopeFixture,registrationScopeOrigin as origin} from './helpers/seller-registration-scope-fixture';

void test('bank status does not adopt another internal account for an old rendered owner',async()=>{
 const f=await sellerRegistrationScopeFixture();try{
  f.select('registration-b');const api=await import('../app/api/seller/bank-details/route');
  const own=await api.GET(new Request(origin+'/api/seller/bank-details',{headers:{'X-Hastabazaar-Actor':'registration-b'}}));assert.equal(own.status,200);assert.equal((await own.json()as{userId:string}).userId,'registration-b');
  const wrong=await api.GET(new Request(origin+'/api/seller/bank-details',{headers:{'X-Hastabazaar-Actor':'registration-a'}}));assert.equal(wrong.status,403);assert.doesNotMatch(await wrong.text(),/registration-b/);
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});

void test('bank intake rejects wrong internal actor before any document or protected-case write',async()=>{
 const f=await sellerRegistrationScopeFixture();try{
  f.select('registration-b');const api=await import('../app/api/seller/bank-details/route'),{PDFDocument}=await import('pdf-lib');
  const state=await(await api.GET(new Request(origin+'/api/seller/bank-details'))).json()as{revision:string};
  const pdf=await PDFDocument.create();pdf.addPage([300,400]).drawText('Synthetic bank ownership evidence');
  const data=new FormData();for(const[key,value]of Object.entries({accountId:'registration-b',revision:state.revision,commandId:crypto.randomUUID(),payoutBeneficiary:'Fictional registration-b',bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'1234567890'}))data.set(key,value);
  data.set('bankVerification',new File([new Uint8Array(await pdf.save({useObjectStreams:false}))],'synthetic-bank.pdf',{type:'application/pdf'}));
  const before={documents:f.sqlite.prepare('SELECT COUNT(*) n FROM seller_documents').get()!.n,cases:f.sqlite.prepare('SELECT COUNT(*) n FROM seller_protected_change_cases').get()!.n,objects:f.objects.size};
  const response=await api.POST(new Request(origin+'/api/seller/bank-details',{method:'POST',headers:{origin,'X-Hastabazaar-Actor':'registration-a'},body:data}));assert.equal(response.status,403,await response.text());
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_documents').get()!.n,before.documents);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_protected_change_cases').get()!.n,before.cases);assert.equal(f.objects.size,before.objects);
  const own=()=>new Request(origin+'/api/seller/bank-details',{method:'POST',headers:{origin,'X-Hastabazaar-Actor':'registration-b'},body:data});
  const accepted=await api.POST(own());assert.equal(accepted.status,200,await accepted.text());const replay=await api.POST(own());assert.equal(replay.status,200,await replay.text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_documents').get()!.n,Number(before.documents)+1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_protected_change_cases').get()!.n,Number(before.cases)+1);
  assert.equal(f.sqlite.prepare("SELECT status FROM seller_documents WHERE original_name='synthetic-bank.pdf'").get()!.status,'pending');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_beneficiary_versions WHERE seller_id=(SELECT id FROM seller_profiles WHERE user_id='registration-b')").get()!.n,0,'intake and exact replay never verify or execute a payout');
  const caseId=String(f.sqlite.prepare("SELECT id FROM seller_protected_change_cases WHERE seller_id=(SELECT id FROM seller_profiles WHERE user_id='registration-b')").get()!.id);const ownedCase=await api.GET(new Request(origin+'/api/seller/bank-details?caseId='+encodeURIComponent(caseId),{headers:{'X-Hastabazaar-Actor':'registration-b'}}));assert.equal(ownedCase.status,200);assert.equal((await ownedCase.json()as{caseId:string}).caseId,caseId);
  f.select('registration-a');const foreign=await api.GET(new Request(origin+'/api/seller/bank-details?caseId='+encodeURIComponent(caseId),{headers:{'X-Hastabazaar-Actor':'registration-a'}}));assert.equal(foreign.status,404,'a foreign exact case must not fall back to this account general bank intake');


 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});
