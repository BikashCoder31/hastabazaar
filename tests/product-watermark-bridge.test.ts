import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import sharpImport from 'sharp';
import type {SharpConstructor} from '../node_modules/sharp/dist/index.d.mts';
const sharp=sharpImport as SharpConstructor;
void test('native local bridge renders actual WebP only through capability-bound loopback requests',async()=>{
  assert.ok(existsSync(new URL('../scripts/staging/product-watermark-plugin.ts',import.meta.url)),'Guarded product watermark bridge exists');
  const {createLocalProductWatermarkPlugin}=await import('../scripts/staging/product-watermark-plugin');
  let middleware:(req:IncomingMessage,res:ServerResponse,next:()=>void)=>void=(_req,res)=>{res.statusCode=404;res.end();};
  const server=createServer((req,res)=>middleware(req,res,()=>{res.statusCode=404;res.end();}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port,origin='http://127.0.0.1:'+port;
  try{
    assert.throws(()=>createLocalProductWatermarkPlugin(process.cwd(),'https://public.test'));
    const plugin=createLocalProductWatermarkPlugin(process.cwd(),origin);
    const configure=plugin.configureServer as (server:unknown)=>void;
    configure({config:{server:{host:'127.0.0.1',port,strictPort:true}},middlewares:{use(fn:typeof middleware){middleware=fn;}}});
    const loader=plugin.load as unknown as (this:unknown,id:string)=>string|null;
    const source=loader.call({environment:{name:'rsc'}},process.cwd().replaceAll('\\','/')+'/lib/products/watermark.ts')!;
    const token=/const capability = "([a-f0-9]{64})"/.exec(source)![1];
    const policy={enabled:true,sizePercent:18,opacityPercent:28,position:'bottom-right'};
    const input=await sharp({create:{width:600,height:400,channels:3,background:'#d9c9ab'}}).png().toBuffer();
    const headers={'content-type':'image/png','x-watermark-policy':encodeURIComponent(JSON.stringify(policy)),authorization:'Bearer '+token};
    const url=origin+'/__staging/product-watermark';
    assert.equal((await fetch(url,{method:'POST',body:new Uint8Array(input),headers:{...headers,authorization:'Bearer '+ '0'.repeat(64)}})).status,403);
    assert.equal((await fetch(url,{method:'POST',body:new Uint8Array(input),headers:{...headers,Origin:origin}})).status,403);
    assert.equal((await fetch(url,{method:'POST',body:new Uint8Array(input),headers:{...headers,'x-watermark-policy':encodeURIComponent(JSON.stringify({...policy,position:'center'}))}})).status,400);
    const response=await fetch(url,{method:'POST',body:new Uint8Array(input),headers});
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
    const output=await response.arrayBuffer();assert.equal((await sharp(new Uint8Array(output)).metadata()).format,'webp');assert.notDeepEqual(Buffer.from(output),input);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

void test('checked localhost listener keeps its exact transport and server-only capability',async()=>{
  const {createLocalProductWatermarkPlugin}=await import('../scripts/staging/product-watermark-plugin');
  let middleware:(req:IncomingMessage,res:ServerResponse,next:()=>void)=>void=(_req,res)=>{res.statusCode=404;res.end();};
  const server=createServer((req,res)=>middleware(req,res,()=>{res.statusCode=404;res.end();}));
  await new Promise<void>(resolve=>server.listen(0,'localhost',resolve));
  const port=(server.address() as {port:number}).port,origin='http://localhost:'+port;
  try {
    assert.throws(()=>createLocalProductWatermarkPlugin(process.cwd(),origin,'0.0.0.0' as 'localhost'),/loopback/i);
    const plugin=createLocalProductWatermarkPlugin(process.cwd(),origin,'localhost');
    const configure=plugin.configureServer as (server:unknown)=>void;
    assert.throws(()=>configure({config:{server:{host:'0.0.0.0',port,strictPort:true}}}),/loopback|listener/i);
    configure({config:{server:{host:'localhost',port,strictPort:true}},middlewares:{use(fn:typeof middleware){middleware=fn;}}});
    const loader=plugin.load as unknown as (this:unknown,id:string)=>string|null;
    const path=process.cwd().replaceAll('\\','/')+'/lib/products/watermark.ts';
    const source=loader.call({environment:{name:'rsc'}},path)!;
    assert.ok(source.includes(origin+'/__staging/product-watermark'));
    assert.ok(loader.call({environment:{name:'ssr'}},path));
    assert.equal(loader.call({environment:{name:'client'}},path),null);
    assert.equal(loader.call({environment:{name:'rsc'}},path+'.unrelated'),null);
    const token=/const capability = "([a-f0-9]{64})"/.exec(source)![1];
    const policy={enabled:false,sizePercent:18,opacityPercent:28,position:'bottom-right'};
    const input=await sharp({create:{width:900,height:900,channels:3,background:'#d9c9ab'}}).png().toBuffer();
    const headers={'content-type':'image/png','x-watermark-policy':encodeURIComponent(JSON.stringify(policy)),authorization:'Bearer '+token};
    assert.equal((await fetch(origin+'/__staging/product-watermark',{method:'POST',body:new Uint8Array(input),headers:{...headers,'sec-fetch-site':'same-origin'}})).status,403);
    const response=await fetch(origin+'/__staging/product-watermark',{method:'POST',body:new Uint8Array(input),headers});
    assert.equal(response.status,200);
    assert.equal((await sharp(new Uint8Array(await response.arrayBuffer())).metadata()).format,'webp');
    const simultaneous=await Promise.all(Array.from({length:4},()=>fetch(origin+'/__staging/product-watermark',{method:'POST',body:new Uint8Array(input),headers})));
    assert.deepEqual(simultaneous.map(item=>item.status),[200,200,200,200],'four required product photos should queue instead of failing after the first two');
    for(const item of simultaneous)assert.equal((await sharp(new Uint8Array(await item.arrayBuffer())).metadata()).format,'webp');
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
