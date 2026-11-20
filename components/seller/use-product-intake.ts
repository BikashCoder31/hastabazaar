'use client';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {getProductWorkspace,IntakeSnapshot} from '@/lib/products/intake-workspace';
export type ProductWorkspace=Awaited<ReturnType<typeof getProductWorkspace>>;
const endpoint='/api/seller/product-intakes/workspace';
const snapshot=(work:ProductWorkspace):IntakeSnapshot=>({formContext:work.formContext??null,categoryId:work.categoryId,answers:work.answers,offers:work.offers,mediaIds:work.mediaIds,privateReview:work.privateReview});
const blank=():IntakeSnapshot=>({formContext:null,categoryId:null,answers:{},offers:{axes:[],offers:[]},mediaIds:[],privateReview:{}});
class ProductIntakeAccessError extends Error{}
async function response<T>(request:Promise<Response>):Promise<T>{const result=await request,data=await result.json() as T&{error?:string};if(!result.ok){const message=data.error??'The outcome is unavailable. Keep your entries and retry.';throw [401,403].includes(result.status)?new ProductIntakeAccessError(message):new Error(message);}return data;}
export function useProductIntake(initial:ProductWorkspace|null,actorId=initial?.actorId){
 const actorHeaders=useMemo(()=>{const headers:Record<string,string>={};if(actorId)headers['X-Hastabazaar-Actor']=actorId;return headers;},[actorId]);
 const [draft,setDraft]=useState<IntakeSnapshot>(()=>initial?snapshot(initial):blank()),[saved,setSaved]=useState(initial),[status,setStatus]=useState(initial?'Saved':'Not saved yet'),[busy,setBusy]=useState(false),[editCount,setEditCount]=useState(0),[comparison,setComparison]=useState<ProductWorkspace|null>(null),[accessDenied,setAccessDenied]=useState(false),[baseline,setBaseline]=useState<IntakeSnapshot|null>(()=>initial?snapshot(initial):null),[pendingSave,setPendingSave]=useState(false);
 const draftRef=useRef(draft),savedRef=useRef(saved),savedSnapshot=useRef(initial?snapshot(initial):null),dirty=useRef(false),generation=useRef(0),mounted=useRef(true),blocked=useRef(false);
 const pending=useRef<{payload:Record<string,unknown>;snapshot:IntakeSnapshot;generation:number}|null>(null),flight=useRef<Promise<ProductWorkspace|null>|null>(null);
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 function change(next:IntakeSnapshot|((old:IntakeSnapshot)=>IntakeSnapshot)){
  const value=typeof next==='function'?next(draftRef.current):next;draftRef.current=value;generation.current++;dirty.current=JSON.stringify(value)!==JSON.stringify(savedSnapshot.current);setDraft(value);setEditCount(generation.current);if(!pending.current&&!blocked.current)setStatus(dirty.current?'Unsaved changes':'Saved');
 }
 const remember=useCallback((work:ProductWorkspace)=>{if(!mounted.current||actorId&&work.actorId!==actorId)return;savedRef.current=work;setSaved(work);const url=new URL(window.location.href);url.searchParams.set('draftId',work.id);window.history.replaceState(window.history.state,'',url);},[actorId]);
 const fetchSaved=useCallback(async function fetchSaved(id:string){return response<ProductWorkspace>(fetch(endpoint+'?draftId='+encodeURIComponent(id),{cache:'no-store',headers:actorHeaders}));},[actorHeaders]);
 const saveOnce=useCallback(async function saveOnce():Promise<ProductWorkspace|null>{
  if(flight.current)return flight.current;
  if(!dirty.current&&savedRef.current?.versionId&&!pending.current)return savedRef.current;
  if(blocked.current&&!pending.current){setStatus('Compare the saved version before saving these entries.');return null;}
  const attempt=pending.current??{payload:{action:'save',draftId:savedRef.current?.id??null,...structuredClone(draftRef.current),formContext:draftRef.current.formContext?{version:draftRef.current.formContext.version,publishedAt:draftRef.current.formContext.publishedAt,answers:draftRef.current.formContext.answers}:null,requestId:crypto.randomUUID(),expectedRevision:savedRef.current?String(savedRef.current.revision):null},snapshot:structuredClone(draftRef.current),generation:generation.current};pending.current=attempt;setPendingSave(true);setBusy(true);setStatus('Saving…');
  const running=(async()=>{try{
   const result=await response<{id:string;revision:number;versionId:string}>(fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...actorHeaders},body:JSON.stringify(attempt.payload)})),work=await fetchSaved(result.id);
   if(!mounted.current)return null;
   remember(work);pending.current=null;setPendingSave(false);
   if(work.revision!==result.revision||work.versionId!==result.versionId){blocked.current=true;setComparison(work);setStatus('Another saved version is available. Compare it with your retained entries.');return null;}
   blocked.current=false;setComparison(null);const unchanged=JSON.stringify(draftRef.current)===JSON.stringify(attempt.snapshot),confirmed=snapshot(work);savedSnapshot.current=confirmed;setBaseline(confirmed);if(unchanged){draftRef.current=confirmed;setDraft(confirmed);}dirty.current=JSON.stringify(draftRef.current)!==JSON.stringify(confirmed);setStatus(dirty.current?'Unsaved changes':'Saved');return work;
  }catch(error){if(mounted.current){if(error instanceof ProductIntakeAccessError)setAccessDenied(true);blocked.current=true;setStatus(error instanceof Error?error.message:'Save not confirmed. Retry the same save.');}return null;}
  finally{flight.current=null;if(mounted.current)setBusy(false);}})();flight.current=running;return running;
 },[actorHeaders,fetchSaved,remember]);
 async function checkAccess(){const current=savedRef.current,expectedActor=actorId??current?.actorId;if(!expectedActor)return false;try{await response<unknown>(fetch(endpoint+(current?'?draftId='+encodeURIComponent(current.id):'?categoryId='),{cache:'no-store',headers:{'X-Hastabazaar-Actor':expectedActor}}));if(!mounted.current)return false;setAccessDenied(false);setStatus('The intended account and original source are current. Your original entries and retry identity remain retained.');return true;}catch(error){if(mounted.current){setAccessDenied(true);setStatus(error instanceof Error?error.message:'Current Product access is unavailable.');}return false;}}
 async function flush(){let work=await saveOnce();while(work&&dirty.current&&!pending.current&&!blocked.current)work=await saveOnce();return work;}
 const refresh=useCallback(async function refresh(){const current=savedRef.current;if(!current)return null;try{
  const work=await fetchSaved(current.id);if(!mounted.current||savedRef.current?.revision!==current.revision)return null;
  if(work.revision!==current.revision&&(dirty.current||pending.current)){blocked.current=true;setComparison(work);setStatus('The saved draft changed. Your entries are retained for comparison.');return work;}
  remember(work);if(!dirty.current&&!pending.current){const value=snapshot(work);savedSnapshot.current=value;setBaseline(value);draftRef.current=value;setDraft(value);}return work;
 }catch(error){if(mounted.current){if(error instanceof ProductIntakeAccessError)setAccessDenied(true);setStatus(error instanceof Error?error.message:'Unable to refresh the saved draft.');}return null;}},[fetchSaved,remember]);
 async function compare(){const current=savedRef.current;if(!current){setStatus('Retry the first save to recover its saved reference.');return;}try{const work=await fetchSaved(current.id);if(!mounted.current)return;blocked.current=true;setComparison(work);}catch(error){if(mounted.current){if(error instanceof ProductIntakeAccessError)setAccessDenied(true);setStatus(error instanceof Error?error.message:'Saved version unavailable. Your entries are retained.');}}}
 function resolveComparison(keepEdits:boolean){if(!comparison||busy)return;remember(comparison);savedSnapshot.current=snapshot(comparison);setBaseline(savedSnapshot.current);pending.current=null;setPendingSave(false);blocked.current=false;if(!keepEdits){draftRef.current=snapshot(comparison);setDraft(draftRef.current);}dirty.current=JSON.stringify(draftRef.current)!==JSON.stringify(savedSnapshot.current);generation.current++;setEditCount(generation.current);setComparison(null);setStatus(dirty.current?'Unsaved changes':'Saved');}
 function applyConfirmed(work:ProductWorkspace){if(!mounted.current||actorId&&work.actorId!==actorId)return;remember(work);const value=snapshot(work);savedSnapshot.current=value;setBaseline(value);draftRef.current=value;dirty.current=false;blocked.current=false;pending.current=null;setPendingSave(false);setDraft(value);setStatus('Saved');}
 useEffect(()=>{if(!dirty.current||pending.current||blocked.current||busy)return;const timer=setTimeout(()=>void saveOnce(),900);return()=>clearTimeout(timer);},[editCount,busy,saved?.revision,saveOnce]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty.current||pending.current){event.preventDefault();}},focus=()=>{if(!flight.current)void refresh();};window.addEventListener('beforeunload',warn);window.addEventListener('focus',focus);return()=>{window.removeEventListener('beforeunload',warn);window.removeEventListener('focus',focus);};},[refresh]);
 return {draft,saved,status,busy,accessDenied,checkAccess,denyAccess:()=>{if(mounted.current)setAccessDenied(true);},dirty:baseline===null?editCount>0:JSON.stringify(draft)!==JSON.stringify(baseline),pendingSave,comparison,change,flush,refresh,compare,resolveComparison,applyConfirmed,getCurrent:()=>({draft:draftRef.current,saved:savedRef.current,dirty:dirty.current,generation:generation.current}),setStatus};
}
