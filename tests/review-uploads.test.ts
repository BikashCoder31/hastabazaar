import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReviewPhotos,readReviewForm,maximumReviewBytes} from '../lib/reviews/uploads';
void test('review photo limits reject spoofed types, oversized images and excess files',async()=>{
 const image=new File([new Uint8Array([255,216,255,224,0,2])],'photo.jpg',{type:'image/jpeg'});
 assert.equal(await validateReviewPhotos([image]),null);
 assert.match((await validateReviewPhotos([image,image,image,image]))!,/three/);
 assert.match((await validateReviewPhotos([new File(['<svg/>'],'photo.jpg',{type:'image/jpeg'})]))!,/match|content/i);
 assert.match((await validateReviewPhotos([new File(['<svg/>'],'photo.svg',{type:'image/svg+xml'})]))!,/JPG/);
 assert.match((await validateReviewPhotos([new File([new Uint8Array(5*1024*1024+1)],'photo.jpg',{type:'image/jpeg'})]))!,/5 MB/);
});
void test('multipart review body is bounded even without a content-length header',async()=>{
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(maximumReviewBytes+1));c.close();}});
 const req=new Request('http://localhost/reviews',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x'},body,duplex:'half'} as RequestInit);
 await assert.rejects(()=>readReviewForm(req),/too large/);
});
