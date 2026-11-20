import test from 'node:test';
import assert from 'node:assert/strict';
import {liveMakerFixture} from './helpers/live-maker-fixture';
void test('externally issued clearance upload is scoped retained private evidence, recoverable without overwriting original bytes',async()=>{
 const f=await liveMakerFixture();try{
  const evidence=await import('../lib/managed-commerce/live-clearance-evidence');
  const clearance=await import('../lib/managed-commerce/live-clearance');
  const scope=await clearance.getManagedClearanceScope(f.db,f.sellerId,Date.now());
  const input={sellerId:f.sellerId,materialScopeDigest:scope.materialScopeDigest};
  const ctx=f.ctx('actual-external-clearance-upload');
  const saved=await evidence.uploadManagedClearanceEvidence(f.db,f.bucket,ctx,input,f.externalFile());
  assert.deepEqual(await evidence.recoverManagedClearanceEvidence(f.db,f.bucket,ctx,input),saved);
  assert.equal(f.objects.size,1);
  const response=await evidence.readManagedClearanceEvidence(f.db,f.bucket,'reviewer',saved.id);
  assert.match(response.headers.get('cache-control')!,/no-store/);assert.match(response.headers.get('content-security-policy')!,/sandbox/);
  await assert.rejects(evidence.readManagedClearanceEvidence(f.db,f.bucket,f.ownerId,saved.id));
  await assert.rejects(evidence.uploadManagedClearanceEvidence(f.db,f.bucket,ctx,input,new File(['not the original bytes'],'changed.pdf',{type:'application/pdf'})));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_clearance_evidence_files').get()!.n,1);
  const review=await(await import('../lib/managed-commerce/live-activation')).getManagedLiveActivationReview(f.db,'reviewer',f.sellerId);
  assert.deepEqual(review.uploads.map(file=>file.id),[saved.id]);assert.doesNotMatch(JSON.stringify(review.uploads),/private\/|objectKey/);
  const key=Array.from(f.objects.keys())[0],object=f.objects.get(key)!;f.objects.set(key,{...object,bytes:new TextEncoder().encode('different retained bytes').buffer});
  await assert.rejects(evidence.readManagedClearanceEvidence(f.db,f.bucket,'reviewer',saved.id));
 }finally{f.dispose();}
});
void test('a competing different-byte upload intent cannot write storage or retain a file under another intent hash',async()=>{
 const f=await liveMakerFixture();try{
  const evidence=await import('../lib/managed-commerce/live-clearance-evidence'),{getManagedClearanceScope}=await import('../lib/managed-commerce/live-clearance'),{liveDigest}=await import('../lib/managed-commerce/live-activation-support');
  const scope=await getManagedClearanceScope(f.db,f.sellerId,Date.now()),input={sellerId:f.sellerId,materialScopeDigest:scope.materialScopeDigest},ctx=f.ctx('competing-external-file');
  const id='clearance-file-'+await liveDigest([ctx.actorId,input,ctx.requestId]),file=f.externalFile();
  f.setBeforeBatch(()=>{f.sqlite.prepare('INSERT INTO managed_clearance_evidence_intents(id,seller_id,material_scope_digest,uploaded_by,object_key,original_name,mime_type,size_bytes,content_hash,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,f.sellerId,scope.materialScopeDigest,ctx.actorId,'private/managed-clearance-evidence/'+id,file.name,file.type,file.size,'0'.repeat(64),ctx.requestId,Date.now());});
  await assert.rejects(evidence.uploadManagedClearanceEvidence(f.db,f.bucket,ctx,input,file));
  assert.equal(f.objects.size,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_clearance_evidence_files').get()!.n,0);
 }finally{f.dispose();}
});
