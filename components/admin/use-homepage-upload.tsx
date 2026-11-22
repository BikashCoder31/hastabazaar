'use client';
import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {notifySessionReference,useSessionReference} from '@/hooks/use-session-reference';
import {useHomepageScope} from './homepage-access-boundary';
import type {HomepageHeroMediaRecord} from '@/lib/db/repositories/homepage-hero';
import {HERO_UPLOAD_ID_HEADER as UPLOAD_HEADER} from '@/lib/homepage/hero-upload-identity';
const endpoint='/api/admin/homepage/hero-media';
type Attempt={uploadId:string;wire?:ArrayBuffer;contentType?:string;uncertain:boolean};
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function recordedMedia(value:unknown,actorId:string,uploadId:string):value is HomepageHeroMediaRecord{
 if(!object(value))return false;
 return value.id===uploadId&&value.createdBy===actorId&&typeof value.objectKey==='string'&&typeof value.originalName==='string'
  &&['image/webp','video/mp4'].includes(String(value.mimeType))&&['sizeBytes','width','height'].every(key=>Number.isSafeInteger(value[key])&&Number(value[key])>0)
  &&Number.isSafeInteger(value.createdAt)&&Number(value.createdAt)>=0&&(value.archivedAt===null||Number.isSafeInteger(value.archivedAt))
  &&(value.durationSeconds===null||typeof value.durationSeconds==='number'&&Number.isFinite(value.durationSeconds)&&value.durationSeconds>0);
}
/** A lost upload reply never authorizes another upload or deletion of its private bytes. */
export function useHomepageUpload(actorId:string,onRecorded:(media:HomepageHeroMediaRecord)=>void){
 const scope=useHomepageScope(actorId),storageKey='hastabazaar:homepage-upload:'+actorId;
 const attempt=useRef<Attempt|null>(null),flight=useRef(false),[hasWire,setHasWire]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const metadata=(id:string)=>JSON.stringify({schema:1,actorId,uploadId:id});
 const raw=useSessionReference(storageKey),saved=useMemo(()=>{if(raw===undefined)return{loading:true,blocked:false,uploadId:null};if(raw===null)return{loading:false,blocked:false,uploadId:null};try{const value:unknown=JSON.parse(raw);if(!object(value)||Object.keys(value).length!==3||value.schema!==1||value.actorId!==actorId||typeof value.uploadId!=='string'||!(/^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/).test(value.uploadId))throw Error('Invalid original upload reference');return{loading:false,blocked:false,uploadId:value.uploadId};}catch{return{loading:false,blocked:true,uploadId:null};}},[raw,actorId]);
 const {uploadId,blocked}=saved;
 useLayoutEffect(()=>{if(uploadId&&attempt.current===null)attempt.current={uploadId,uncertain:true};},[uploadId]);
 function forget(id:string){try{if(sessionStorage.getItem(storageKey)===metadata(id)){sessionStorage.removeItem(storageKey);notifySessionReference(storageKey);}}catch{/* Keep an inaccessible marker for later original-record recovery. */}}
 function finish(value:Attempt,media:HomepageHeroMediaRecord){if(!scope.current()||attempt.current!==value)return;forget(value.uploadId);attempt.current=null;setHasWire(false);onRecorded(media);setMessage(media.archivedAt===null?'Original upload confirmed. Select it from the private media library.':'The original upload was recorded and is now archived. Review its retained library record.');}
 async function send(value:Attempt){
  if(!scope.current()||flight.current||!value.wire||!value.contentType)return;flight.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{...scope.headers,[UPLOAD_HEADER]:value.uploadId,'Content-Type':value.contentType},body:value.wire}),data:unknown=await response.json().catch(()=>null);
   const rejected=object(data)&&data.uploadId===value.uploadId&&!value.uncertain&&(data.code==='access_denied_before_write'||data.code==='invalid_upload_before_write');
   if(!scope.current()){if(rejected)forget(value.uploadId);return;}
   if([401,403].includes(response.status)){if(rejected){forget(value.uploadId);attempt.current=null;setHasWire(false);}else value.uncertain=true;scope.deny();return;}
   if(response.ok&&object(data)&&data.uploadId===value.uploadId&&data.status==='recorded'&&recordedMedia(data.media,actorId,value.uploadId)){finish(value,data.media);return;}
   if(rejected){forget(value.uploadId);attempt.current=null;setHasWire(false);}else value.uncertain=true;
   setMessage(object(data)&&typeof data.error==='string'?data.error:'The original upload could not be confirmed. Check its original record before another upload.');
  }catch{if(scope.current()){value.uncertain=true;setMessage('The original upload could not be confirmed. Check its original record before another upload.');}}
  finally{if(scope.current()){flight.current=false;setBusy(false);}}
 }
 async function start(file:File){
  if(!scope.current()||flight.current||attempt.current||blocked||saved.loading)return;if(file.size>22*1024*1024){setMessage('Choose a file smaller than the supported upload request limit.');return;}
  flight.current=true;setBusy(true);setMessage('');
  try{const id=crypto.randomUUID(),form=new FormData();form.set('uploadId',id);form.set('file',file);const prepared=new Request(endpoint,{method:'POST',body:form}),wire=await prepared.arrayBuffer();if(!scope.current())return;const value:Attempt={uploadId:id,wire,contentType:prepared.headers.get('Content-Type')!,uncertain:false};sessionStorage.setItem(storageKey,metadata(id));attempt.current=value;setHasWire(true);notifySessionReference(storageKey);flight.current=false;await send(value);}
  catch{if(scope.current())setMessage('The upload could not be prepared. No request was sent; keep this page open.');}
  finally{if(scope.current()){flight.current=false;setBusy(false);}}
 }
 async function check(){
  const value=attempt.current;if(!scope.current()||flight.current||!value)return;flight.current=true;setBusy(true);setMessage('');
  try{const response=await fetch(endpoint+'?'+new URLSearchParams({uploadId:value.uploadId}),{cache:'no-store',headers:scope.headers}),data:unknown=await response.json().catch(()=>null);if(!scope.current()||attempt.current!==value)return;if([401,403].includes(response.status)){scope.deny();return;}
   if(response.ok&&object(data)&&data.uploadId===value.uploadId&&data.status==='recorded'&&recordedMedia(data.media,actorId,value.uploadId)){finish(value,data.media);return;}
   setMessage(response.ok&&object(data)&&data.uploadId===value.uploadId&&data.status==='unconfirmed'&&data.media===null?'No original upload record is confirmed yet. Keep this reference and ask Help before another upload.':object(data)&&typeof data.error==='string'?data.error:'The original upload record is unavailable. Keep its reference.');
  }catch{if(scope.current())setMessage('The original upload record is unavailable. Keep its reference.');}finally{if(scope.current()){flight.current=false;setBusy(false);}}
 }
 const recovery=uploadId?<div className="space-y-2 rounded border p-3" aria-label="Original upload recovery"><button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>void check()}>Check original uploaded media</button>{hasWire?<button type="button" disabled={busy} className="ml-2 rounded border px-3 py-2" onClick={()=>{if(attempt.current)void send(attempt.current);}}>Retry original upload</button>:null}</div>:blocked?<output className="block">The original upload reference is unavailable. Ask Help to reconcile it before another upload.</output>:null;
 return {scope,busy,pending:saved.loading||!!uploadId||blocked,message,recovery,start,setMessage};
}
