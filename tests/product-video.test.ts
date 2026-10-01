import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProductVideo } from '../lib/media/product-video';
function box(kind:string, body:Uint8Array) { const b=Buffer.alloc(8+body.length);b.writeUInt32BE(b.length);b.write(kind,4);b.set(body,8);return b; }
function clip(seconds:number) { const h=Buffer.alloc(100);h.writeUInt32BE(1000,12);h.writeUInt32BE(seconds*1000,16);return new File([Buffer.concat([box('ftyp',Buffer.from('isom0000isom')),box('moov',Buffer.concat([box('mvhd',h),box('trak',box('mdia',Buffer.concat([box('mdhd',h),box('hdlr',Buffer.concat([Buffer.alloc(8),Buffer.from('vide'),Buffer.alloc(12)]))])))])),box('mdat',Buffer.alloc(8))])],'demo.mp4',{type:'video/mp4'}); }
void test('optional product video validates bounded MP4 metadata and rejects malformed/overlong uploads',async()=>{
 assert.equal(await validateProductVideo(clip(10)),null);
 assert.match(await validateProductVideo(clip(61)) ?? '',/60/);
 assert.match(await validateProductVideo(new File(['junk'],'fake.mp4',{type:'video/mp4'})) ?? '',/MP4/);
 assert.match(await validateProductVideo(new File(['junk'],'fake.html',{type:'text/html'})) ?? '',/MP4/);
 const b=Buffer.alloc(16); b.writeUInt32BE(4294967295); b.write('ftyp',4); assert.ok(await validateProductVideo(new File([b],'bad.mp4',{type:'video/mp4'})));
});

void test('MP4 without a video track is rejected even with a valid movie duration',async()=>{ const h=Buffer.alloc(100);h.writeUInt32BE(1000,12);h.writeUInt32BE(10000,16); const f=new File([Buffer.concat([box('ftyp',Buffer.from('isom0000isom')),box('moov',box('mvhd',h)),box('mdat',Buffer.alloc(8))])],'fake.mp4',{type:'video/mp4'}); assert.ok(await validateProductVideo(f)); });
