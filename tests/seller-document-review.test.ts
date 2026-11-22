import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';

void test('an independent Super Admin verifies the exact current identity document and records an audit', async () => {
  const modulePath = '../lib/sellers/document-review';
  const review = await import(modulePath).catch(() => null);
  assert.equal(typeof review?.verifySellerDocument, 'function', 'document review must be available');
  const f = await companyStoreMakerFixture();
  try {
    const doc = f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as { id: string };
    await review.verifySellerDocument(f.db, { sellerId:'maker', documentId:doc.id, actorId:'reviewer', reason:'Identity evidence independently reviewed', now:f.now });
    const saved = f.sqlite.prepare('SELECT status,reviewed_by AS reviewer FROM seller_documents WHERE id=?').get(doc.id) as {status:string;reviewer:string};
    assert.equal(saved.status, 'verified');
    assert.equal(saved.reviewer, 'reviewer');
    assert.equal((f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='seller.document.verified' AND subject_id=?").get(doc.id) as {n:number}).n, 1);
  } finally { f.sqlite.close(); }
});

void test('review rejects foreign, self-reviewed, stale and already verified documents', async () => {
  const { verifySellerDocument } = await import('../lib/sellers/document-review');
  const f = await companyStoreMakerFixture();
  try {
    const doc = f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as { id: string };
    const input = { sellerId:'maker',documentId:doc.id,actorId:'reviewer',reason:'Independently inspected identity',now:f.now };
    await assert.rejects(verifySellerDocument(f.db,{...input,sellerId:'foreign'}));
    await assert.rejects(verifySellerDocument(f.db,{...input,actorId:'maker-user'}));
    f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('maker-user','super_admin',1)").run();
    await assert.rejects(verifySellerDocument(f.db,{...input,actorId:'maker-user'}));
    f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='maker-user' AND role='super_admin'").run();
    f.setBeforeBatch(() => { f.sqlite.prepare("UPDATE seller_documents SET status='rejected' WHERE id=?").run(doc.id); });
    await assert.rejects(verifySellerDocument(f.db,input));
    f.sqlite.prepare("UPDATE seller_documents SET status='pending' WHERE id=?").run(doc.id);
    await verifySellerDocument(f.db,input);
    await assert.rejects(verifySellerDocument(f.db,input));
    assert.equal((f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='seller.document.verified'").get() as {n:number}).n,1);
  } finally { f.sqlite.close(); }
});

void test('a verified document blocks direct replacement even if verified while an update is in flight', async () => {
  const { verifiedDocumentChangeGuards } = await import('../lib/sellers/document-review');
  assert.equal(typeof verifiedDocumentChangeGuards, 'function');
  const f = await companyStoreMakerFixture();
  try {
    f.sqlite.exec("UPDATE seller_documents SET status='verified' WHERE seller_id='maker' AND kind='representative_identity'");
    await assert.rejects(f.db.batch([...verifiedDocumentChangeGuards(f.db,'maker'),f.db.prepare("UPDATE seller_profiles SET legal_name='Changed' WHERE id='maker'")]));
    assert.notEqual((f.sqlite.prepare("SELECT legal_name AS name FROM seller_profiles WHERE id='maker'").get() as {name:string}).name,'Changed');
  } finally { f.sqlite.close(); }
});

void test('only the owner can request a change to verified evidence with a reason', async () => {
  const review = await import('../lib/sellers/document-review');
  assert.equal(typeof (review as Record<string, unknown>).requestDocumentChange, 'function');
  const f = await companyStoreMakerFixture();
  try {
    const doc = f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    f.sqlite.prepare("UPDATE seller_documents SET status='verified' WHERE id=?").run(doc.id);
    const input={sellerId:'maker',documentId:doc.id,actorId:'maker-user',reason:'The identity document needs correction',now:f.now};
    await assert.rejects(review.requestDocumentChange(f.db,{...input,reason:'short'}));
    await assert.rejects(review.requestDocumentChange(f.db,{...input,actorId:'reviewer'}));
    await review.requestDocumentChange(f.db,input);
    const row=f.sqlite.prepare('SELECT status,reason FROM seller_document_change_requests WHERE document_id=?').get(doc.id) as {status:string;reason:string};
    assert.equal(row.status,'submitted'); assert.equal(row.reason,input.reason);
    await assert.rejects(review.requestDocumentChange(f.db,input));
    assert.equal((f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(doc.id) as {status:string}).status,'verified');
  } finally {f.sqlite.close();}
});

void test('an independent Super Admin can reject a change request without altering verified evidence', async () => {
  const review = await import('../lib/sellers/document-review');
  assert.equal(typeof (review as Record<string, unknown>).reviewDocumentChange, 'function');
  const f = await companyStoreMakerFixture();
  try {
    const doc=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    f.sqlite.prepare("UPDATE seller_documents SET status='verified' WHERE id=?").run(doc.id);
    const requestId=await review.requestDocumentChange(f.db,{sellerId:'maker',documentId:doc.id,actorId:'maker-user',reason:'The identity document needs correction',now:f.now});
    await assert.rejects(review.reviewDocumentChange(f.db,{requestId,actorId:'maker-user',decision:'reject',reason:'Reviewed request',now:f.now}));
    await review.reviewDocumentChange(f.db,{requestId,actorId:'reviewer',decision:'reject',reason:'Insufficient supporting reason',now:f.now});
    assert.equal((f.sqlite.prepare('SELECT status FROM seller_document_change_requests WHERE id=?').get(requestId) as {status:string}).status,'rejected');
    assert.equal((f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(doc.id) as {status:string}).status,'verified');
  } finally { f.sqlite.close(); }
});

void test('a stale change request cannot be approved after its evidence is superseded', async () => {
  const review = await import('../lib/sellers/document-review');
  const f = await companyStoreMakerFixture();
  try {
    const doc=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    f.sqlite.prepare("UPDATE seller_documents SET status='verified' WHERE id=?").run(doc.id);
    const requestId=await review.requestDocumentChange(f.db,{sellerId:'maker',documentId:doc.id,actorId:'maker-user',reason:'The identity document needs correction',now:f.now});
    f.sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
      VALUES ('newer','maker','representative_identity','private/seller-documents/maker/newer','new.png','image/png',10,'pending',?)`).run(f.now+1);
    await assert.rejects(review.reviewDocumentChange(f.db,{requestId,actorId:'reviewer',decision:'approve',reason:'Evidence reviewed carefully',now:f.now+2}));
    assert.equal((f.sqlite.prepare('SELECT status FROM seller_document_change_requests WHERE id=?').get(requestId) as {status:string}).status,'submitted');
  } finally { f.sqlite.close(); }
});

void test('approved document change adds pending evidence without changing verified history', async () => {
  const review=await import('../lib/sellers/document-review');
  assert.equal(typeof (review as Record<string,unknown>).submitDocumentReplacement,'function');
  const f=await companyStoreMakerFixture();
  try {
    const old=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    f.sqlite.prepare("UPDATE seller_documents SET status='verified' WHERE id=?").run(old.id);
    const requestId=await review.requestDocumentChange(f.db,{sellerId:'maker',documentId:old.id,actorId:'maker-user',reason:'Renewed document available',now:f.now+1});
    const doc={id:'replacement',kind:'representative_identity' as const,objectKey:'private/seller-documents/maker/replacement',originalName:'id.png',mimeType:'image/png',sizeBytes:20};
    const input={sellerId:'maker',actorId:'maker-user',requestId,document:doc,now:f.now+3};
    await assert.rejects(review.submitDocumentReplacement(f.db,input));
    await review.reviewDocumentChange(f.db,{requestId,actorId:'reviewer',decision:'approve',reason:'Replacement request accepted',now:f.now+2});
    await assert.rejects(review.submitDocumentReplacement(f.db,{...input,actorId:'reviewer'}));
    await review.submitDocumentReplacement(f.db,input);
    assert.equal((f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(old.id) as {status:string}).status,'verified');
    assert.equal((f.sqlite.prepare("SELECT status FROM seller_documents WHERE id='replacement'").get() as {status:string}).status,'pending');
    assert.equal((f.sqlite.prepare('SELECT status FROM seller_document_change_requests WHERE id=?').get(requestId) as {status:string}).status,'completed');
    await assert.rejects(review.submitDocumentReplacement(f.db,input));
  } finally {f.sqlite.close();}
});

void test('replacement permission is bound to the exact kind, owner, current evidence and active approver', async () => {
  const review = await import('../lib/sellers/document-review');
  const f = await companyStoreMakerFixture();
  try {
    const old = f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    await review.verifySellerDocument(f.db, { sellerId:'maker', documentId:old.id, actorId:'reviewer', reason:'Inspected exact identity evidence', now:f.now });
    const requestId = await review.requestDocumentChange(f.db, { sellerId:'maker', documentId:old.id, actorId:'maker-user', reason:'Replace the unclear scan with a clearer copy', now:f.now+1 });
    await review.reviewDocumentChange(f.db, { requestId, actorId:'reviewer', decision:'approve', reason:'Exact scan replacement is permitted', now:f.now+2 });
    const input = { sellerId:'maker', actorId:'maker-user', requestId, now:f.now+3,
      document:{id:'scope-replacement',kind:'representative_identity' as const,objectKey:'private/seller-documents/maker/scope-replacement',originalName:'fictional.png',mimeType:'image/png',sizeBytes:20} };
    await assert.rejects(review.submitDocumentReplacement(f.db, {...input, document:{...input.document,kind:'pan_certificate'}}));
    await assert.rejects(review.submitDocumentReplacement(f.db, {...input, document:{...input.document,objectKey:'private/seller-documents/foreign/secret'}}));
    f.setBeforeBatch(() => { f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'"); });
    await assert.rejects(review.submitDocumentReplacement(f.db,input));
    assert.equal(f.sqlite.prepare("SELECT id FROM seller_documents WHERE id='scope-replacement'").get(), undefined);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_document_change_requests WHERE id=?').get(requestId)?.status, 'approved');
    f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)");
    f.setBeforeBatch(() => { f.sqlite.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES('concurrent','maker','representative_identity','private/seller-documents/maker/concurrent','other.png','image/png',20,'pending',?)").run(f.now+2); });
    await assert.rejects(review.submitDocumentReplacement(f.db,input));
    assert.equal(f.sqlite.prepare("SELECT id FROM seller_documents WHERE id='scope-replacement'").get(), undefined);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(old.id)?.status, 'verified');
  } finally { f.dispose(); }
});

void test('document decisions and scoped requests replay exact commands without duplicate tasks, notices or history', async () => {
  const review = await import('../lib/sellers/document-review');
  const f = await companyStoreMakerFixture();
  try {
    const doc = f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    const verified = { sellerId:'maker', documentId:doc.id, actorId:'reviewer', reason:'Independently verified exact evidence', now:f.now, commandId:'verify-once' };
    await review.verifySellerDocument(f.db, verified); await review.verifySellerDocument(f.db, verified);
    const submitted = { sellerId:'maker', documentId:doc.id, actorId:'maker-user', reason:'A clearer scan is available for review', now:f.now+1, commandId:'request-once' };
    const requestId = await review.requestDocumentChange(f.db, submitted);
    assert.equal(await review.requestDocumentChange(f.db, submitted), requestId);
    await assert.rejects(review.requestDocumentChange(f.db,{...submitted,reason:'Different proposed facts need a separate command'}));
    const decision = { requestId, actorId:'reviewer', decision:'approve' as const, reason:'Only the exact evidence replacement is permitted', now:f.now+2, commandId:'permission-once' };
    await review.reviewDocumentChange(f.db,decision); await review.reviewDocumentChange(f.db,decision);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_document_change_requests WHERE document_id=?").get(doc.id)?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='document_change' AND source_id=?").get(requestId)?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='seller.document.verified' AND subject_id=?").get(doc.id)?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.seller.document.change' AND related_id=?").get(requestId)?.n, 8, 'Two events, each with owner and Super Admin email/bell copies.');
    assert.throws(() => f.sqlite.prepare("UPDATE seller_documents SET object_key='private/replaced' WHERE id=?").run(doc.id));
    assert.throws(() => f.sqlite.prepare('DELETE FROM seller_documents WHERE id=?').run(doc.id));
    assert.throws(() => f.sqlite.prepare("UPDATE audit_logs SET reason='changed' WHERE action='seller.document.verified' AND subject_id=?").run(doc.id));
  } finally { f.dispose(); }
});

void test('a correction grants only a new exact-version permission and keeps the original request clock', async () => {
  const review = await import('../lib/sellers/document-review');
  const f = await companyStoreMakerFixture();
  try {
    const old = f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
    await review.verifySellerDocument(f.db,{sellerId:'maker',documentId:old.id,actorId:'reviewer',reason:'Original identity independently verified',now:f.now});
    const requestId=await review.requestDocumentChange(f.db,{sellerId:'maker',documentId:old.id,actorId:'maker-user',reason:'Please review the clearer replacement scan',now:f.now+1});
    await review.reviewDocumentChange(f.db,{requestId,actorId:'reviewer',decision:'approve',reason:'The exact scan replacement is permitted',now:f.now+2});
    const document={id:'first-correction',kind:'representative_identity' as const,objectKey:'private/seller-documents/maker/first-correction',originalName:'first.png',mimeType:'image/png',sizeBytes:20};
    await review.submitDocumentReplacement(f.db,{sellerId:'maker',actorId:'maker-user',requestId,document,now:f.now+3});
    const correction={sellerId:'maker',documentId:document.id,actorId:'reviewer',decision:'request_correction' as const,reason:'The lower edge must be visible in the scan',expectedReviewId:null,commandId:'clarify-scan',now:f.now+4};
    await review.reviewSellerDocument(f.db,correction); await review.reviewSellerDocument(f.db,correction);
    const permission=f.sqlite.prepare('SELECT id FROM seller_document_replacement_permissions WHERE request_id=? AND used_document_id IS NULL').get(requestId) as {id:string};
    assert.ok(permission);
    const fixed={...document,id:'fixed-correction',objectKey:'private/seller-documents/maker/fixed-correction',originalName:'fixed.png'};
    await assert.rejects(review.submitDocumentReplacement(f.db,{sellerId:'maker',actorId:'maker-user',requestId,permissionId:requestId,document:fixed,now:f.now+5}));
    const replacement={sellerId:'maker',actorId:'maker-user',requestId,permissionId:permission.id,document:fixed,commandId:'upload-fixed',now:f.now+5};
    await review.submitDocumentReplacement(f.db,replacement); await review.submitDocumentReplacement(f.db,replacement);
    await review.reviewSellerDocument(f.db,{sellerId:'maker',documentId:fixed.id,actorId:'reviewer',decision:'verify',reason:'All required identity details are now readable',expectedReviewId:null,now:f.now+6});
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(old.id)?.status,'verified');
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(fixed.id)?.status,'verified');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_document_change_requests').get()?.n,1);
    assert.equal(f.sqlite.prepare("SELECT started_at FROM review_tasks WHERE source_type='document_change' AND source_id=?").get(requestId)?.started_at,f.now+1);
    const latest=f.sqlite.prepare("SELECT identity_document_id,agreement_accepted_at FROM managed_maker_application_details WHERE seller_id='maker' ORDER BY created_at DESC,id DESC LIMIT 1").get();
    assert.equal(latest?.identity_document_id,fixed.id); assert.equal(latest?.agreement_accepted_at,f.now);
  } finally { f.dispose(); }
});

void test('a new eligible reviewer revalidates an unused permission without reusing a stale review version',async()=>{
  const review=await import('../lib/sellers/document-review');const f=await companyStoreMakerFixture();
  try{
    const documentId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id);
    await review.verifySellerDocument(f.db,{sellerId:'maker',documentId,actorId:'reviewer',reason:'Original fictional identity verified',now:f.now});
    const requestId=await review.requestDocumentChange(f.db,{sellerId:'maker',documentId,actorId:'maker-user',reason:'A clearer scan is ready for review',now:f.now+1});
    const initialOperation=String(f.sqlite.prepare('SELECT operation_request_id FROM seller_document_change_requests WHERE id=?').get(requestId)!.operation_request_id);
    await review.reviewDocumentChange(f.db,{requestId,actorId:'reviewer',decision:'approve',reason:'Exact evidence replacement is permitted',expectedOperationId:initialOperation,now:f.now+2});
    await assert.rejects(review.reviewDocumentChange(f.db,{requestId,actorId:'reviewer',decision:'approve',reason:'A stale tab must not replace the current review',expectedOperationId:initialOperation,now:f.now+3}));
    f.sqlite.exec("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('backup-reviewer','backup@local.hastabazaar.test','Fictional eligible backup','active',1,1); INSERT INTO user_roles(user_id,role,assigned_at) VALUES('backup-reviewer','super_admin',1); DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");
    await review.reviewDocumentChange(f.db,{requestId,actorId:'backup-reviewer',decision:'approve',reason:'Current exact evidence and scope independently rechecked',now:f.now+4});
    const permissionId=String(f.sqlite.prepare('SELECT active_permission_id FROM seller_document_change_requests WHERE id=?').get(requestId)!.active_permission_id);
    assert.notEqual(permissionId,requestId);
    const input={sellerId:'maker',actorId:'maker-user',requestId,now:f.now+5,document:{id:'revalidated-file',kind:'representative_identity' as const,objectKey:'private/seller-documents/maker/revalidated-file',originalName:'fictional.png',mimeType:'image/png',sizeBytes:20}};
    await assert.rejects(review.submitDocumentReplacement(f.db,input));await review.submitDocumentReplacement(f.db,{...input,permissionId});
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_document_replacement_permissions WHERE request_id=?').get(requestId)?.n,2);
    assert.equal(f.sqlite.prepare('SELECT started_at FROM review_tasks WHERE source_id=?').get(requestId)?.started_at,f.now+1);
  }finally{f.dispose();}
});

void test('unverified evidence corrections are owned, versioned and stop if verification wins the race',async()=>{
  const review=await import('../lib/sellers/document-review');
  for(const race of [false,true]){
    const f=await companyStoreMakerFixture();
    try{
      const documentId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id);
      const input={sellerId:'maker',actorId:'maker-user',documentId,commandId:'correct-unverified',now:f.now+3,
        document:{id:'unverified-correction',kind:'representative_identity' as const,objectKey:'private/seller-documents/maker/unverified-correction',originalName:'fictional.png',mimeType:'image/png',sizeBytes:20}};
      await assert.rejects(review.submitUnverifiedDocumentCorrection(f.db,{...input,actorId:'reviewer'}));
      if(race){f.setBeforeBatch(async()=>{await review.verifySellerDocument(f.db,{sellerId:'maker',documentId,actorId:'reviewer',reason:'Verification committed before the correction',now:f.now+2});});
        await assert.rejects(review.submitUnverifiedDocumentCorrection(f.db,input));assert.equal(f.sqlite.prepare("SELECT id FROM seller_documents WHERE id='unverified-correction'").get(),undefined);
      }else{
        await review.submitUnverifiedDocumentCorrection(f.db,input);await review.submitUnverifiedDocumentCorrection(f.db,input);
        await review.verifySellerDocument(f.db,{sellerId:'maker',documentId:input.document.id,actorId:'reviewer',reason:'Current corrected evidence independently verified',now:f.now+4});
        assert.equal(f.sqlite.prepare("SELECT identity_document_id FROM managed_maker_application_details WHERE seller_id='maker' ORDER BY created_at DESC,id DESC LIMIT 1").get()?.identity_document_id,input.document.id);
        assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_document_change_requests').get()?.n,0,'An unverified correction does not fabricate a protected-change request.');
      }
    }finally{f.dispose();}
  }
});

void test('business and VAT evidence use independent scoped review, verified locks and fresh replacement verification',async()=>{
 const review=await import('../lib/sellers/document-review');const {completeVersionFixture}=await import('./helpers/complete-version-fixture');const f=await completeVersionFixture();try{
  for(const kind of ['business_registration','vat_certificate'] as const){const original='business-test-'+kind;f.sqlite.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES(?,'registered',?,?,'fictional.png','image/png',20,'pending',?)").run(original,kind,'private/seller-documents/registered/'+original,f.now+1);const input={sellerId:'registered',documentId:original,actorId:'reviewer',commandId:'review-'+kind,reason:'Review this exact fictional registration evidence independently.',expectedReviewId:null,now:f.now+2};await assert.rejects(review.verifySellerDocument(f.db,{...input,actorId:'registered-owner'}));await assert.rejects(review.verifySellerDocument(f.db,{...input,actorId:'delegate'}));await review.verifySellerDocument(f.db,input);await review.verifySellerDocument(f.db,input);assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE subject_id=? AND action='seller.document.verified'").get(original)!.n,1);await assert.rejects(f.db.batch(review.verifiedDocumentChangeGuards(f.db,'registered',[kind])));
  const requestId=await review.requestDocumentChange(f.db,{sellerId:'registered',documentId:original,actorId:'registered-owner',commandId:'replace-request-'+kind,reason:'Provide a clearer copy of this same verified registration evidence.',now:f.now+3});await review.reviewDocumentChange(f.db,{requestId,actorId:'reviewer',commandId:'replace-allow-'+kind,decision:'approve',reason:'Permit only this exact registration document replacement for fresh review.',now:f.now+4});const permissionId=String(f.sqlite.prepare('SELECT active_permission_id AS id FROM seller_document_change_requests WHERE id=?').get(requestId)!.id),id='replacement-test-'+kind,document={id,kind,objectKey:'private/seller-documents/registered/'+id,originalName:'replacement.png',mimeType:'image/png',sizeBytes:20};await review.submitDocumentReplacement(f.db,{sellerId:'registered',requestId,permissionId,document,actorId:'registered-owner',commandId:'replace-upload-'+kind,now:f.now+5});assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(id)!.status,'pending');assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(original)!.status,'verified');await review.verifySellerDocument(f.db,{...input,documentId:id,commandId:'review-replacement-'+kind,now:f.now+6});assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(id)!.status,'verified');
  }
 }finally{f.dispose();}
});
