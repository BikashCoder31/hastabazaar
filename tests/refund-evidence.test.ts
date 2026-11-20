import assert from 'node:assert/strict';
import test from 'node:test';
import {PNG} from 'pngjs';
import {refundPacketFixture} from './helpers/refund-funding-fixture';

void test('private refund evidence recovers exact stored bytes after a lost acknowledgement and enforces current scoped access',async()=>{
 const f=await refundPacketFixture();try{
  const path='../lib/payments/refund-evidence',m=await import(path).catch(()=>null);assert.equal(typeof m?.uploadFinanceEvidence,'function');
  const objects=new Map<string,ArrayBuffer>();let loseAcknowledgement=true;
  const bucket={async get(key:string){const value=objects.get(key);return value?{body:new Blob([value]).stream(),arrayBuffer:async()=>value}:null;},async put(key:string,bytes:ArrayBuffer){objects.set(key,bytes);if(loseAcknowledgement){loseAcknowledgement=false;throw new Error('Fictional lost storage acknowledgement');}}} as unknown as R2Bucket;
  const png=new PNG({width:2,height:2});png.data.fill(255);const bytes=new Uint8Array(PNG.sync.write(png)).buffer,file=new File([bytes],'private-owner-proof.png',{type:'image/png'});
  const ctx={...f.ctx('private-upload'),actorId:'customer'},scope={kind:'obligation',id:f.obligationId};
  await assert.rejects(m!.uploadFinanceEvidence(f.db,bucket,ctx,scope,file,'customer'),/lost storage/);
  const saved=await m!.recoverFinanceEvidence(f.db,bucket,ctx,scope,'customer');assert.equal(objects.size,1);
  assert.deepEqual(await m!.uploadFinanceEvidence(f.db,bucket,ctx,scope,file,'customer'),saved);
  await assert.rejects(m!.uploadFinanceEvidence(f.db,bucket,ctx,scope,new File([bytes],'different.png',{type:'image/png'}),'customer'),/different|another|original/i);
  const read=await m!.readFinanceEvidence(f.db,bucket,'customer',saved.id,'customer');assert.match(read.headers.get('Cache-Control')!,/private.*no-store/);assert.equal(read.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual(new Uint8Array(await read.arrayBuffer()),new Uint8Array(bytes));
  await assert.rejects(m!.readFinanceEvidence(f.db,bucket,'foreign',saved.id,'customer'));
  await assert.rejects(m!.readFinanceEvidence(f.db,bucket,'delegate',saved.id,'staff'));
  assert.equal((await m!.readFinanceEvidence(f.db,bucket,'reviewer',saved.id,'staff')).status,200);
  await assert.rejects(m!.uploadFinanceEvidence(f.db,bucket,{...ctx,requestId:'unsupported-private-file'},scope,new File(['<script>bad</script>'],'fake.png',{type:'image/png'}),'customer'));
  f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='customer'").run();
  await assert.rejects(m!.readFinanceEvidence(f.db,bucket,'customer',saved.id,'customer'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM finance_evidence_files').get()!.n,1);
 }finally{f.dispose();}
});
