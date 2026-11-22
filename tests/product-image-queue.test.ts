import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageWorkQueue, ImageWorkQueueFullError } from '../lib/products/image-work-queue';

void test('image work stays bounded, serves waiting requests in order, and recovers after a failed job', async () => {
  const run=createImageWorkQueue(2,2), started:number[]=[], release:(()=>void)[]=[];
  let active=0, maximum=0;
  const job=(id:number,fail=false)=>run(async()=>{
    started.push(id); active++; maximum=Math.max(maximum,active);
    await new Promise<void>(resolve=>release[id]=resolve);
    active--; if(fail)throw new Error('fixture decode failed'); return id;
  });
  const first=job(0), second=job(1,true), third=job(2), fourth=job(3);
  const rejected=assert.rejects(second,/fixture decode failed/);
  assert.deepEqual(started,[0,1]);
  await assert.rejects(job(4),ImageWorkQueueFullError);
  release[1](); await rejected;
  assert.deepEqual(started,[0,1,2]);
  release[0](); assert.equal(await first,0);
  assert.deepEqual(started,[0,1,2,3]);
  release[2](); release[3]();
  assert.deepEqual(await Promise.all([third,fourth]),[2,3]);
  assert.equal(maximum,2);
  assert.equal(await run(async()=>5),5);
});
