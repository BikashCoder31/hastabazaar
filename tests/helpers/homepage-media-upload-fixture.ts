import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {completeVersionFixture} from './complete-version-fixture';
import {isolatedMediaBucket} from './isolated-media-bucket';
declare global{var homepageUploadFixture:{db:D1Database;bucket:R2Bucket;subject:string;email?:string};}
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.homepageUploadFixture.db},get MEDIA(){return globalThis.homepageUploadFixture.bucket},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:globalThis.homepageUploadFixture.subject,email:globalThis.homepageUploadFixture.email??"foreign@local.hastabazaar.test",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
export const mediaOrigin='http://localhost:3018';
export async function homepageMediaUploadFixture(){const f=await completeVersionFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));f.sqlite.exec(await readFile('drizzle/0055_homepage_hero_carousel.sql','utf8'));f.sqlite.exec("UPDATE users SET auth_subject='external-home-b' WHERE id='foreign';INSERT INTO user_roles(user_id,role,assigned_at)VALUES('foreign','super_admin',1)");
 const {objects,puts,gets,deletes,bucket}=isolatedMediaBucket();
 globalThis.homepageUploadFixture={db:f.db,bucket,subject:'external-home-b'};const api=await import('../../app/api/admin/homepage/hero-media/route');
 const file=(color:number)=>{const png=new PNG({width:8,height:8});for(let i=0;i<png.data.length;i+=4){png.data[i]=color;png.data[i+1]=40;png.data[i+2]=220-color;png.data[i+3]=255;}return new File([new Uint8Array(PNG.sync.write(png))],'synthetic-owned-image.png',{type:'image/png'});};
 const upload=(id:string,color=40,actor='foreign')=>{const body=new FormData();body.set('uploadId',id);body.set('file',file(color));return new Request(mediaOrigin+'/api/admin/homepage/hero-media',{method:'POST',headers:{origin:mediaOrigin,'X-Hastabazaar-Actor':actor,'X-Hastabazaar-Upload-Id':id},body});};
 return{...f,api,objects,puts,gets,deletes,bucket,file,upload};
 }catch(error){f.dispose();throw error;}}
/** Inject transport failure outside real committed SQL, never inside/mocking the transaction. */
export function mediaWriteBoundary(db:D1Database,onBefore?:()=>void,onCommitted?:()=>void){let inBatch=false;const mediaStatements=new WeakSet<object>();
 const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>{const proxy=new Proxy(statement,{get(target,key){if(key==='bind')return(...values:unknown[])=>wrap(target.bind(...values));if(key==='run')return async()=>{if(!inBatch)onBefore?.();const result=await target.run();if(!inBatch)onCommitted?.();return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});mediaStatements.add(proxy);return proxy;};
 let queue:Promise<unknown>=Promise.resolve();const wrapper={prepare(sql:string){const statement=db.prepare(sql);return /INSERT INTO\s+homepage_hero_media/i.test(sql)?wrap(statement):statement;},batch(statements:D1PreparedStatement[]){const run=queue.then(async()=>{const affects=statements.some(statement=>mediaStatements.has(statement));if(affects)onBefore?.();inBatch=true;try{const result=await db.batch(statements);inBatch=false;if(affects)onCommitted?.();return result;}finally{inBatch=false;}});queue=run.catch(()=>{});return run;}}as D1Database;return wrapper;
}
