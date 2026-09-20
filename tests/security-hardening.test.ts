import assert from 'node:assert/strict';
import test from 'node:test';
import {sharp} from '../lib/reviews/image-processor';
import {requestFingerprint} from '../lib/http/rate-limit';
import {readBoundedForm,BodyTooLargeError} from '../lib/http/bounded-body';
import {sanitizeReviewPhoto} from '../lib/reviews/sanitize-photo';
import {marketplaceSecurityHeaders} from '../lib/http/security-headers';
void test('account throttle ignores caller-controlled user-agent and forwarded headers',async()=>{
 const a=new Request('https://app.test',{headers:{'user-agent':'one','x-forwarded-for':'1.2.3.4','cf-connecting-ip':'1.2.3.4'}});
 const b=new Request('https://app.test',{headers:{'user-agent':'two','x-forwarded-for':'9.8.7.6','cf-connecting-ip':'9.8.7.6'}});
 assert.equal(await requestFingerprint(a,'login:synthetic@example.test'),await requestFingerprint(b,'login:synthetic@example.test'));
 assert.notEqual(await requestFingerprint(a,'login:synthetic@example.test'),await requestFingerprint(a,'login:other@example.test'));
});
void test('all multipart parsers can reject unknown-length oversized bodies and accept valid forms',async()=>{
 let cancelled=false;
 const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array(1025));},cancel(){cancelled=true;}});
 const request=new Request('https://app.test',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x'},body,duplex:'half'} as RequestInit);
 await assert.rejects(()=>readBoundedForm(request,1024),BodyTooLargeError);assert.equal(cancelled,true);
 const data=new FormData();data.set('name','A valid form');data.set('file',new File(['hello'],'hello.txt'));
 const form=await readBoundedForm(new Request('https://app.test',{method:'POST',body:data}),2048);
 assert.equal(form.get('name'),'A valid form');assert.equal((form.get('file') as File).size,5);
});
void test('review processing strips EXIF and rejects corrupt or oversized decoded images',async()=>{
 const bytes=await sharp({create:{width:20,height:10,channels:3,background:'#ff0000'}}).withExif({IFD0:{Artist:'Private author',ImageDescription:'Sensitive metadata'}}).jpeg().toBuffer();
 assert.ok((await sharp(bytes).metadata()).exif);
 const file=await sanitizeReviewPhoto(new File([new Uint8Array(bytes)],'original.jpg',{type:'image/jpeg'}));
 const metadata=await sharp(Buffer.from(await file.arrayBuffer())).metadata();
 assert.equal(metadata.exif,undefined);assert.equal(metadata.xmp,undefined);assert.equal(metadata.format,'webp');assert.equal(metadata.width,20);
 await assert.rejects(()=>sanitizeReviewPhoto(new File(['not an image'],'bad.jpg',{type:'image/jpeg'})),/valid JPG/);
 const huge=await sharp({create:{width:5000,height:5000,channels:3,background:'#ffffff'}}).png().toBuffer();
 await assert.rejects(()=>sanitizeReviewPhoto(new File([new Uint8Array(huge)],'huge.png',{type:'image/png'})),/20 megapixels/);
});
void test('security headers block embedding while permitting explicit map location and tile images',()=>{
 assert.equal(marketplaceSecurityHeaders['X-Frame-Options'],'DENY');
 assert.match(marketplaceSecurityHeaders['Content-Security-Policy'],/frame-ancestors 'none'/);
 assert.match(marketplaceSecurityHeaders['Content-Security-Policy'],/https:\/\/tile.openstreetmap.org/);
 assert.match(marketplaceSecurityHeaders['Permissions-Policy'],/geolocation=\(self\)/);
});

