import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncentiveDb } from './helpers/incentive-db';
import { startSellerRegistration } from '../lib/db/repositories/seller-commercial-access';
import { readSellerDraft, saveSellerDraft } from '../lib/sellers/draft-store';
import { requestDocumentChange, reviewDocumentChange, submitDocumentReplacement, verifySellerDocument } from '../lib/sellers/document-review';

void test('native ephemeral D1 preserves a private draft through an account revocation race', async () => {
  // createIncentiveDb uses a random database ID, no persistence and no local bindings.
  const f = await createIncentiveDb();
  try {
    await f.db.batch([
      f.db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('draft-owner','draft-owner','draft-owner@local.hastabazaar.test','Fictional draft owner','active',1,1)"),
      f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('draft-owner','customer',1)"),
    ]);
    await startSellerRegistration(f.db, { userId: 'draft-owner', requestId: 'start-native-draft', now: 1 });
    const input = { revision: null, changeId: 'native-first-save', attemptId: 'native-registration', formVersion: 1, answers: { legalName: ['Keep this private progress'] }, files: {} };
    const bucket = {} as R2Bucket;
    const saved = await saveSellerDraft(f.db, bucket, 'draft-owner', input, {}, 2);
    const racedDb = { prepare: f.db.prepare.bind(f.db), batch: async (statements: D1PreparedStatement[]) => {
      await f.db.prepare("UPDATE users SET status='disabled' WHERE id='draft-owner'").run();
      return f.db.batch(statements);
    } } as D1Database;
    await assert.rejects(saveSellerDraft(racedDb, bucket, 'draft-owner', { ...input, revision: saved.revision, changeId: 'native-revoked-save', answers: { legalName: ['Must roll back'] } }, {}, 3));
    assert.deepEqual((await readSellerDraft(f.db, 'draft-owner', 4))?.answers, input.answers);
    assert.equal((await readSellerDraft(f.db, 'draft-owner', 4))?.revision, saved.revision);
  } finally { await f.dispose(); }
});

void test('native ephemeral D1 retains reviewed documents and atomically consumes one scoped replacement permission', async () => {
  const f=await createIncentiveDb();
  try {
    await f.db.batch([
      f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('native-owner','owner@local.hastabazaar.test','Fictional owner','active',1,1),('native-reviewer','reviewer@local.hastabazaar.test','Fictional reviewer','active',1,1)"),
      f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('native-owner','customer',1),('native-reviewer','super_admin',1)"),
      f.db.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,
        support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at)
        VALUES('native-seller','native-owner','Fictional Owner','Fictional Shop','Fixture','FIX-NATIVE','PAN','FIX-NATIVE-PAN','Fictional Owner',
          '9800000000','owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional address','submitted',1,1)`),
      f.db.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES('native-original','native-seller','representative_identity','private/seller-documents/native-seller/native-original','original.png','image/png',20,'pending',1)"),
    ]);
    await verifySellerDocument(f.db,{sellerId:'native-seller',documentId:'native-original',actorId:'native-reviewer',reason:'Fictional exact identity reviewed',now:100});
    const requestId=await requestDocumentChange(f.db,{sellerId:'native-seller',documentId:'native-original',actorId:'native-owner',reason:'A clearer fictional scan is available',commandId:'native-change-once',now:101});
    await reviewDocumentChange(f.db,{requestId,actorId:'native-reviewer',decision:'approve',reason:'Only this exact replacement is permitted',now:102});
    const input={sellerId:'native-seller',requestId,actorId:'native-owner',commandId:'native-upload-once',now:103,
      document:{id:'native-replacement',kind:'representative_identity' as const,objectKey:'private/seller-documents/native-seller/native-replacement',originalName:'replacement.png',mimeType:'image/png',sizeBytes:20}};
    await submitDocumentReplacement(f.db,input);await submitDocumentReplacement(f.db,input);
    assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM seller_document_replacement_permissions WHERE used_document_id='native-replacement'").first<{n:number}>())?.n,1);
    assert.equal((await f.db.prepare("SELECT status FROM seller_documents WHERE id='native-original'").first<{status:string}>())?.status,'verified');
    assert.equal((await f.db.prepare("SELECT status FROM seller_documents WHERE id='native-replacement'").first<{status:string}>())?.status,'pending');
    await assert.rejects(f.db.prepare("UPDATE seller_documents SET object_key='changed' WHERE id='native-original'").run());
    await assert.rejects(f.db.prepare("DELETE FROM seller_document_replacement_permissions WHERE request_id=?").bind(requestId).run());
    assert.equal((await f.db.prepare('SELECT due_at FROM review_tasks WHERE source_id=?').bind(requestId).first<{due_at:number}>())?.due_at,101+24*60*60*1000);
  }finally{await f.dispose();}
});
