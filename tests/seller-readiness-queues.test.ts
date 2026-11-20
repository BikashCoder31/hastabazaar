import assert from 'node:assert/strict';
import test from 'node:test';
import {companyStoreMakerFixture} from './helpers/company-store-maker-fixture';
import {listReviewTasks,listSellerReviewTasks} from '../lib/workflows/review-tasks';
import {verifySellerDocument} from '../lib/sellers/document-review';
import {reviewSellerDocument,requestDocumentChange,reviewDocumentChange} from '../lib/sellers/document-review';
void test('correction and granted replacement permission identify the seller as next actor without restarting case age',async()=>{
 const f=await companyStoreMakerFixture();try{
  const document=(await listReviewTasks(f.db,'reviewer')).find(task=>task.sourceType==='seller_document')!;
  await reviewSellerDocument(f.db,{sellerId:'maker',documentId:document.sourceId,actorId:'reviewer',decision:'request_correction',reason:'Please provide a readable fictional document image',commandId:'queue-correction',now:f.now+1});
  const reviewId=String(f.sqlite.prepare('SELECT review_request_id FROM seller_documents WHERE id=?').get(document.sourceId)?.review_request_id);
  const waiting=(await listReviewTasks(f.db,'reviewer')).find(task=>task.id===document.id)!;assert.equal(waiting.status,'waiting_on_seller');assert.equal(waiting.startedAt,document.startedAt);assert.equal((await listSellerReviewTasks(f.db,'maker-user')).find(task=>task.id===document.id)?.nextActor,'You');
  await verifySellerDocument(f.db,{sellerId:'maker',documentId:document.sourceId,actorId:'reviewer',reason:'Verify this exact readable fictional identity evidence',expectedReviewId:reviewId,commandId:'queue-verification',now:f.now+2});
  const requestId=await requestDocumentChange(f.db,{sellerId:'maker',documentId:document.sourceId,actorId:'maker-user',reason:'Request permission for the fictional renewed identity document',commandId:'queue-request',now:f.now+3});
  await reviewDocumentChange(f.db,{requestId,actorId:'reviewer',decision:'approve',reason:'Permit this exact fictional identity document replacement',commandId:'queue-permit',now:f.now+4});
  const permitted=(await listReviewTasks(f.db,'reviewer')).find(task=>task.sourceType==='document_change'&&task.sourceId===requestId)!;
  assert.equal(permitted.status,'waiting_on_seller');assert.equal(permitted.nextActor,'You');assert.equal(permitted.startedAt,f.now+3);
 }finally{f.dispose();}
});
void test('initial application and exact evidence have shared tasks without fabricated review deadlines',async()=>{
 const f=await companyStoreMakerFixture();try{
  const staff=await listReviewTasks(f.db,'reviewer'),owner=await listSellerReviewTasks(f.db,'maker-user');
  const application=staff.find(task=>String(task.sourceType)==='seller_application');assert.ok(application,'The submitted application must have its canonical review task');
  const document=staff.find(task=>String(task.sourceType)==='seller_document');assert.ok(document,'The exact pending evidence must have its canonical review task');
  assert.equal(application.dueAt,null);assert.equal(document.dueAt,null);
  assert.equal(owner.find(task=>task.id===application.id)?.sourceId,'maker');assert.ok(owner.some(task=>task.id===document.id));
  await verifySellerDocument(f.db,{sellerId:'maker',documentId:document.sourceId,actorId:'reviewer',reason:'Review the exact fictional government document for this applicant',commandId:'queue-initial-evidence',now:f.now+1,expectedReviewId:null});
  const after=await listReviewTasks(f.db,'reviewer');assert.equal(after.find(task=>task.id===document.id)?.status,'completed');assert.equal(after.find(task=>task.id===application.id)?.status,'awaiting_review');
  assert.equal(after.filter(task=>String(task.sourceType)==='seller_application').length,1);
 }finally{f.dispose();}
});
