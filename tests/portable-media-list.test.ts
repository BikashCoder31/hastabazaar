import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

void test('filesystem media inventory preserves all private bytes and metadata with pagination',async()=>{
 const {LocalMediaBucket}=await import('../lib/runtime/node-bindings');
 const root=await mkdtemp(join(tmpdir(),'hzb-media-fixture-'));
 const media=new LocalMediaBucket(root);
 await media.put('private/evidence/one',new Uint8Array([1,2,3]),{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{purpose:'fictional-evidence'}});
 await media.put('public/picture',new Uint8Array([4]),{httpMetadata:{contentType:'image/png'}});
 const first=await media.list({limit:1});assert.equal(first.objects.length,1);assert.equal(first.truncated,true);
 assert.equal(first.objects[0].key,'private/evidence/one');assert.equal(first.objects[0].customMetadata.purpose,'fictional-evidence');
 const second=await media.list({limit:1,cursor:first.cursor});assert.equal(second.objects[0].key,'public/picture');assert.equal(second.truncated,false);
 const object=await media.get('private/evidence/one'),reader=object!.body.getReader(),chunks:Uint8Array[]=[];
 for(;;){const chunk=await reader.read();if(chunk.done)break;chunks.push(chunk.value);}reader.releaseLock();
 assert.deepEqual(Buffer.concat(chunks),Buffer.from([1,2,3]));
});
