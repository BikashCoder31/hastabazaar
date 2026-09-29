import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import sharpImport from 'sharp';
import type {SharpConstructor} from '../node_modules/sharp/dist/index.d.mts';
const sharp=sharpImport as SharpConstructor;
import { getBusinessSettingDefinition } from '../lib/configuration/definitions';

async function implementation() {
  assert.ok(existsSync(new URL('../lib/products/watermark.ts', import.meta.url)), 'Product watermark renderer is implemented');
  return import('../lib/products/watermark');
}
async function delivery() {
  assert.ok(existsSync(new URL('../lib/products/watermark-delivery.ts', import.meta.url)), 'Protected product derivative delivery is implemented');
  return import('../lib/products/watermark-delivery');
}
const policy = { enabled: true, sizePercent: 18, opacityPercent: 28, position: 'bottom-right' } as const;
const fixture = async () => new Uint8Array(await sharp({create:{width:600,height:400,channels:3,background:'#d9c9ab'}}).png().toBuffer());

void test('watermark is a simple immediate business setting with subtle enabled defaults and strict bounds', () => {
  const definition = getBusinessSettingDefinition('product_photo_watermark');
  assert.deepEqual(definition.defaultValue, policy);
  assert.equal(definition.changeControl, 'simple');
  assert.equal(definition.effectiveMode, 'immediate');
  for (const invalid of [{...policy, enabled: 'yes'},{...policy,sizePercent:0},{...policy,sizePercent:36},{...policy,opacityPercent:9},{...policy,opacityPercent:81},{...policy,position:'center'},{...policy,source:'/private/original'}]) {
    assert.throws(() => definition.validate(invalid));
  }
});
void test('renderer changes real bottom-right pixels while preserving dimensions and caller original bytes', async () => {
  const {renderProductWatermark} = await implementation();
  const input = await fixture(), preserved = Buffer.from(input);
  const marked = await renderProductWatermark(input,'image/png',policy);
  const plain = await renderProductWatermark(input,'image/png',{...policy,enabled:false});
  assert.deepEqual(Buffer.from(input),preserved);
  assert.equal(marked.mimeType,'image/webp');
  assert.equal(marked.width,600); assert.equal(marked.height,400);
  const a=await sharp(marked.bytes).raw().toBuffer(), b=await sharp(plain.bytes).raw().toBuffer();
  let lower=0, upper=0;
  for(let y=0;y<400;y++)for(let x=0;x<600;x++)for(let c=0;c<3;c++)if(Math.abs(a[(y*600+x)*3+c]-b[(y*600+x)*3+c])>8){if(y>330&&x>450)lower++;if(y<250)upper++;}
  assert.ok(lower>50,'Actual watermark pixels exist in chosen corner');
  assert.equal(upper,0,'Upper product area remains unchanged');
});
void test('position, opacity and size change rendered copies; corruption and decode bounds reject', async () => {
  const {renderProductWatermark} = await implementation(); const input=await fixture();
  const a=await renderProductWatermark(input,'image/png',policy);
  for(const change of [{position:'bottom-left' as const},{opacityPercent:70},{sizePercent:30}])assert.notDeepEqual(a.bytes,(await renderProductWatermark(input,'image/png',{...policy,...change})).bytes);
  await assert.rejects(()=>renderProductWatermark(new Uint8Array([137,80,78,71]),'image/png',policy));
  await assert.rejects(()=>renderProductWatermark(input,'image/jpeg',policy));
  await assert.rejects(()=>renderProductWatermark(new Uint8Array(5*1024*1024+1),'image/png',policy));
  const huge=await sharp({create:{width:5000,height:4100,channels:3,background:'#fff'}}).png().toBuffer();
  await assert.rejects(()=>renderProductWatermark(huge,'image/png',policy));
});
void test('derivative cache uses original bytes and effective policy, and never overwrites original', async () => {
  const {productPhotoResponse}=await delivery(); const input=await fixture();
  const store=new Map<string,Uint8Array>([['private/product-media/s/p/m',input]]); const puts:string[]=[];
  const bucket={async get(key:string){const data=store.get(key);return data?{body:new Response(new Uint8Array(data)).body,size:data.length,httpMetadata:{contentType:'image/webp'}}:null;},async put(key:string,data:Uint8Array){puts.push(key);store.set(key,data);}} as unknown as R2Bucket;
  const options={bucket,mediaId:'m',objectKey:'private/product-media/s/p/m',mimeType:'image/png',policy,policyVersion:'default'};
  const first=await productPhotoResponse(options), second=await productPhotoResponse(options);
  assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(puts.length,1);
  assert.match(first.headers.get('cache-control')! ,/private, no-store/);
  assert.deepEqual(store.get(options.objectKey),input);
  await productPhotoResponse({...options,policy:{...policy,opacityPercent:30}});assert.equal(puts.length,2);
  await productPhotoResponse({...options,policyVersion:'v2'});assert.equal(puts.length,3);
  store.set(options.objectKey,new Uint8Array(await sharp({create:{width:600,height:400,channels:3,background:'#ff0000'}}).png().toBuffer()));
  await productPhotoResponse(options);assert.equal(puts.length,4);
});
void test('enabled rendering failure returns controlled 503 and never original bytes', async () => {
  const {productPhotoResponse}=await delivery();
  const original=new Uint8Array([255,216,255,0,1]);
  const bucket={async get(key:string){return key==='private/product-media/s/p/m'?{body:new Response(original).body,size:original.length}:null;},async put(){throw new Error('must not store corrupt copy');}} as unknown as R2Bucket;
  const response=await productPhotoResponse({bucket,mediaId:'m',objectKey:'private/product-media/s/p/m',mimeType:'image/jpeg',policy,policyVersion:'default'});
  assert.equal(response.status,503);assert.notDeepEqual(new Uint8Array(await response.arrayBuffer()),original);
});
