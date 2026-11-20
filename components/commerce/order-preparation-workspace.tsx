'use client';
import {useLayoutEffect,useMemo,useRef,useState,type SubmitEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {PreparationWorkspace} from '@/lib/orders/response-workspace';
import {OrderOfferDetails} from './order-offer-details';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSessionReference,notifySessionReference} from '@/hooks/use-session-reference';
import {useDenyStaffReview} from '@/components/admin/staff-review-access-boundary';
import {sellerAccessDenied} from '@/lib/sellers/client-access';
import {notificationAccessDenied} from '@/lib/operations/notification-client-events';

type Pending={action:string;requestId:string;expectedRevision:string|null;input:Record<string,unknown>};
const time=(value:number|null)=>value===null?'Not yet confirmed':new Intl.DateTimeFormat('en-NP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kathmandu'}).format(value)+' Nepal time';
type SavedReference={action:'report'|'followup';requestId:string;sourceId:string};
function reference(value:unknown):SavedReference|null{
 if(!value||typeof value!=='object')return null;
 const row=value as Record<string,unknown>,input=row.input as Record<string,unknown>|undefined,sourceId=row.sourceId??(row.action==='report'?input?.portionId:input?.caseId);
 return (row.action==='report'||row.action==='followup')&&typeof row.requestId==='string'&&/^[a-zA-Z0-9:_-]{1,150}$/.test(row.requestId)&&typeof sourceId==='string'&&/^[a-zA-Z0-9:_-]{1,191}$/.test(sourceId)?{action:row.action,requestId:row.requestId,sourceId}:null;
}
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const formText=(form:FormData,key:string)=>{const value=form.get(key);return typeof value==='string'?value:'';};
function parseReference(raw:string|null|undefined){if(raw===null||raw===undefined)return null;try{return reference(JSON.parse(raw));}catch{return null;}}
function sameReference(a:SavedReference|null,b:SavedReference|null){return a!==null&&b!==null&&a.action===b.action&&a.sourceId===b.sourceId&&a.requestId===b.requestId;}
function metadataMatches(body:unknown,actorId:string,ref:SavedReference):body is Record<string,unknown>{return object(body)&&body.actorId===actorId&&body.action===ref.action&&body.sourceId===ref.sourceId&&body.requestId===ref.requestId;}
function outcomeMatches(body:unknown,actorId:string,ref:SavedReference,key:'result'|'outcome'){
 if(!metadataMatches(body,actorId,ref)||body.recorded!==true)return false;
 const result=body[key];return object(result)&&typeof result.id==='string'&&/^[a-zA-Z0-9:_-]{1,191}$/.test(result.id)
  &&(ref.action==='report'||result.id===ref.sourceId&&typeof result.revision==='number'&&Number.isSafeInteger(result.revision)&&result.revision>0);
}
function reportableItems(portion:PreparationWorkspace['portions'][number]){return portion.items.filter(item=>['confirmed','packing','ready_for_pickup'].includes(item.status)&&!portion.cases.some(c=>c.state!=='resolved'&&['delay','cannot_fulfill'].includes(c.kind)&&c.itemIds.includes(item.id)));}
export function OrderPreparationWorkspace({workspace}:{workspace:PreparationWorkspace}){
 const scope=useOwnedFormScope(JSON.stringify([workspace.audience,workspace.actorId,workspace.orderId]));
 return <ScopedOrderPreparationWorkspace key={scope.key} workspace={workspace} isCurrent={scope.isCurrent}/>;
}
function ScopedOrderPreparationWorkspace({workspace:w,isCurrent}:{workspace:PreparationWorkspace;isCurrent:()=>boolean}){
 const router=useRouter(),storageKey='preparation:'+JSON.stringify([w.audience,w.actorId,w.orderId]),legacyKey=`preparation:${w.audience}:${w.actorId}:${w.orderId}`,endpoint=`/api/${w.audience==='staff'?'admin':'seller'}/order-responses`;
 const raw=useSessionReference(storageKey),legacyRaw=useSessionReference(legacyKey),denyParent=useDenyStaffReview();
 const stored=useMemo(()=>{const loading=raw===undefined||legacyRaw===undefined,current=parseReference(raw),legacy=parseReference(legacyRaw);return{loading,reference:current??legacy,blocked:raw!=null&&!current||legacyRaw!=null&&!legacy||current!==null&&legacy!==null&&!sameReference(current,legacy)};},[raw,legacyRaw]);
 const[pending,setPending]=useState<Pending|null>(null),[memoryReference,setMemoryReference]=useState<SavedReference|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[accessDenied,setAccessDenied]=useState(false),[unknown,setUnknown]=useState(false),[rejected,setRejected]=useState<SavedReference|null>(null),inFlight=useRef(false);
 const saved=memoryReference??stored.reference,blocked=stored.loading||stored.blocked;
 useLayoutEffect(()=>{for(const[key,value]of [[storageKey,raw],[legacyKey,legacyRaw]] as const){const ref=parseReference(value);if(ref&&JSON.stringify(ref)!==value){try{sessionStorage.setItem(key,JSON.stringify(ref));notifySessionReference(key);}catch{/* Keep the original reference; writes remain blocked until it can persist. */}}}},[storageKey,legacyKey,raw,legacyRaw]);
 function clear(confirmed:SavedReference){setPending(null);setMemoryReference(null);setUnknown(false);setRejected(null);for(const key of [storageKey,legacyKey])try{if(sameReference(parseReference(sessionStorage.getItem(key)),confirmed)){sessionStorage.removeItem(key);notifySessionReference(key);}}catch{}}
 function deny(){setAccessDenied(true);setMessage('Current account or preparation access changed. Private draft fields are hidden. The original reference is retained.');if(w.audience==='staff'){if(denyParent)denyParent();else notificationAccessDenied({accountId:w.actorId,workspace:'staff'});}else if(w.audience==='seller')sellerAccessDenied(w.actorId);router.refresh();}
 async function send(command:Pending){
  if(!isCurrent()||accessDenied||inFlight.current||blocked)return;const ref=reference(command);if(!ref)return;
  if(saved&&!sameReference(saved,ref)){setMessage('Keep the original request reference until its recorded outcome is confirmed.');return;}
  const hadUnknown=unknown||pending===null&&saved!==null;
  try{const serialized=JSON.stringify(ref);sessionStorage.setItem(storageKey,serialized);if(sessionStorage.getItem(storageKey)!==serialized)throw new Error('reference_not_retained');notifySessionReference(storageKey);}catch{setMessage('No action was sent. The opaque recovery reference could not be retained in this browser. Your private note remains here; repair browser storage before retrying.');return;}
  inFlight.current=true;setPending(command);setMemoryReference(ref);setBusy(true);setMessage('');
  try{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',[ACTOR_INTENT_HEADER]:w.actorId},body:JSON.stringify(command)});
   if(!isCurrent())return;if(response.status===401||response.status===403){deny();return;}
   const result:unknown=await response.json();if(!isCurrent())return;
   if(!response.ok&&!hadUnknown&&metadataMatches(result,w.actorId,ref)&&result.phase==='before_write'){setRejected(ref);setMessage(typeof result.error==='string'?result.error:'Review the current preparation source before correcting your retained note.');return;}
   if(!response.ok||!object(result)||result.ok!==true||!outcomeMatches(result,w.actorId,ref,'result'))throw new Error(object(result)&&typeof result.error==='string'?result.error:'The saved outcome could not be checked. Keep the original reference.');
   clear(ref);setMessage('Saved. The current order and case history have been refreshed.');router.refresh();
  }catch(error){if(isCurrent()){setUnknown(true);setRejected(null);setMessage(error instanceof Error?error.message:'The outcome is uncertain. Check the original request.');}}finally{inFlight.current=false;if(isCurrent())setBusy(false);}
 }
 async function recover(){
  if(!saved||!isCurrent()||inFlight.current)return;inFlight.current=true;setBusy(true);try{
   const query=new URLSearchParams({orderId:w.orderId,action:saved.action,sourceId:saved.sourceId,attempt:saved.requestId}),response=await fetch(endpoint+'?'+query,{headers:{[ACTOR_INTENT_HEADER]:w.actorId}});
   if(!isCurrent())return;if(response.status===401||response.status===403){deny();return;}
   const result:unknown=await response.json();if(!isCurrent())return;
   if(!response.ok||!object(result)||result.actorId!==w.actorId||result.action!==saved.action||result.sourceId!==saved.sourceId||result.requestId!==saved.requestId)throw new Error(object(result)&&typeof result.error==='string'?result.error:'The original outcome could not be verified.');
   if(outcomeMatches(result,w.actorId,saved,'outcome')){setAccessDenied(false);clear(saved);setMessage('Saved. The current order and case history have been refreshed.');router.refresh();}
   else if(result.recorded===false&&result.outcome===null)setMessage('No recorded outcome was found for the original reference. Its outcome remains unconfirmed and the reference is retained. An exact unchanged retry is available only while its original body remains in this page.');
   else throw new Error('The original receipt could not be verified. Keep its reference.');
  }catch(error){if(isCurrent())setMessage(error instanceof Error?error.message:'The original outcome could not be checked.');}finally{inFlight.current=false;if(isCurrent())setBusy(false);}
 }
 function submit(event:SubmitEvent<HTMLFormElement>,action:'report'|'followup',subject:string,revision:number|null){event.preventDefault();const form=new FormData(event.currentTarget),readyAt=formText(form,'proposedReadyAt'),nextAt=formText(form,'nextUpdateAt'),state=formText(form,'state'),input:Record<string,unknown>=action==='report'?{portionId:subject,itemIds:form.getAll('itemId').filter((value):value is string=>typeof value==='string'),kind:formText(form,'kind'),detail:formText(form,'detail'),proposedReadyAt:readyAt?new Date(readyAt).getTime():null}:{caseId:subject,ownerId:formText(form,'ownerId'),backupId:formText(form,'backupId')||null,state,nextUpdateAt:state==='resolved'?null:nextAt?new Date(nextAt).getTime():null,privateNote:formText(form,'privateNote'),customerMessage:formText(form,'customerMessage')};void send({action,requestId:crypto.randomUUID(),expectedRevision:revision===null?null:String(revision),input});}
 if(accessDenied)return <section role="alert" className="rounded border p-4"><p>{message}</p><button type="button" disabled={busy} onClick={()=>void recover()}>Check original saved outcome</button><button type="button" onClick={()=>window.location.reload()}>Reload current preparation record</button></section>;
 const editable=w.audience!=='customer';
 const sellerView=w.audience==='seller';
 return <section className={sellerView ? "space-y-5 rounded-xl border bg-card p-4 md:p-5 [&_button]:min-h-11" : "space-y-6 rounded-xl border p-5"} aria-label="Order preparation follow-up">
  <h2 className={sellerView ? 'font-heading text-2xl' : 'text-xl font-semibold'}>{sellerView ? 'Running late or can’t fulfil?' : 'Preparation and next updates'}</h2>
  <p>{sellerView ? `Order ${w.orderNumber}. Tell Hastabazaar what changed so we can update the customer.` : `Order ${w.orderNumber}. Starting preparation and marking ready are separate from physical carrier handoff.`}</p>
  {!w.portions.length&&<p>Preparation has not been released to this workspace. Check the current payment, confirmation or company preparation status in the order.</p>}
  {message&&<output className="block">{message}</output>}
  {stored.blocked&&<p role="alert">A browser recovery reference is unavailable or conflicts with retained history. Keep it for an authorized original-outcome check; no new action can be sent.</p>}
  {saved&&editable&&<div className="rounded border p-3"><p>A saved request needs its original receipt checked. Private answers are never stored in browser storage.</p><button type="button" disabled={busy} onClick={()=>void recover()}>Check saved outcome</button>{pending&&<button type="button" disabled={busy||blocked} onClick={()=>void send(pending)}>Retry unchanged action</button>}{rejected&&!unknown&&sameReference(rejected,saved)&&<button type="button" disabled={busy} onClick={()=>{if(isCurrent()){clear(rejected);setMessage('The first request was rejected before a write. Review the current preparation source and correct your retained note.');router.refresh();}}}>Review current preparation and keep my note</button>}</div>}
  {w.portions.map(portion=><article key={portion.id} className="space-y-4 border-t pt-4">
   <h3 className="font-semibold">{portion.operatorMode==='company'?'Company preparation':'Seller preparation'}</h3>
   {w.audience==='staff'&&!portion.canAct&&<p>An independent eligible operator must handle this portion. Your current preparation workspace is read-only.</p>}
   <ul>{portion.items.map(item=><li key={item.id} className="py-2">{item.name} × {item.quantity} — {item.status.replaceAll('_',' ')}<OrderOfferDetails offer={item.offerSnapshot}/>{editable&&<span className="block text-sm">Released {time(item.releasedAt)}. {item.clock.paused?'Preparation is held for these items.':item.clock.responded?'A preparation response is recorded.':'Preparation response is pending.'}</span>}</li>)}</ul>
   {editable&&portion.canAct&&reportableItems(portion).length>0&&<form data-form-id={w.audience==='staff'?'staff.order-preparation':'seller.order-preparation'} onSubmit={e=>submit(e,'report',portion.id,null)} className="space-y-3">
    <fieldset disabled={busy||blocked||Boolean(saved)} className="space-y-3"><legend className="font-semibold">{sellerView ? 'Select the affected items' : 'Report an actual preparation issue'}</legend>
     {reportableItems(portion).map(item=><label key={item.id} className="block min-h-11 rounded-lg border bg-card p-3"><input type="checkbox" name="itemId" value={item.id}/> {item.name} × {item.quantity}<OrderOfferDetails offer={item.offerSnapshot}/></label>)}
     <label className="block"><span className="block text-sm font-medium">What changed?</span><select name="kind" className="mt-1 min-h-11 w-full rounded-lg border bg-card px-3"><option value="delay">{sellerView ? 'Give a new ready date' : 'Preparation delayed'}</option><option value="cannot_fulfill">{sellerView ? 'I can’t fulfil these items' : 'Unable to fulfill'}</option></select></label>
     <label className="block text-sm font-medium">Factual detail for staff<textarea name="detail" required minLength={12} maxLength={2000} className="mt-1 block min-h-24 w-full rounded-lg border bg-card p-2" /></label>
     <label className="block text-sm font-medium">{sellerView ? 'New ready date and time, if known (your local time)' : 'Proposed ready time, if known (your browser’s local time)'}<input type="datetime-local" name="proposedReadyAt" className="mt-1 block min-h-11 max-w-full rounded-lg border bg-card p-2" /></label>
     <p className="text-sm">{sellerView ? 'Hastabazaar reviews the new ready date or cancellation request and contacts the customer.' : 'This proposal requires review. Reporting an issue does not cancel items or promise a delivery time.'}</p><button type="submit" className="min-h-11 rounded-lg bg-[#A8232E] px-4 text-sm font-semibold text-white disabled:opacity-50">Send preparation issue</button>
    </fieldset>
   </form>}
   {portion.cases.map(c=><section key={c.id} className="space-y-2 rounded border p-3">
    <h4 className="font-semibold">{c.kind.replaceAll('_',' ')} — {c.state}</h4>
    <p>Affected: {portion.items.filter(i=>c.itemIds.includes(i.id)).map(i=>`${i.name} × ${i.quantity}`).join(', ')}</p>
    <p>{c.publicMessage??'Support is reviewing the affected preparation scope.'}</p><p>Next customer update: {time(c.nextUpdateAt)}</p>
    {w.audience==='staff'&&<><p>Original case: {time(c.createdAt)}. First follow-up due: {time(c.firstDueAt)}.</p><p>Private report: {c.privateDetail}</p>{c.proposedReadyAt&&<p>Unapproved ready-time proposal: {time(c.proposedReadyAt)}</p>}{Boolean(c.commitmentMissing)&&c.state!=='resolved'&&<p>Coverage gap: an eligible owner and an actual next update are still required.</p>}</>}
    {w.audience==='staff'&&c.history.length>0&&<details><summary>Recent protected history</summary><ol>{c.history.map(e=><li key={e.id}>{time(e.createdAt)} · {e.actor??'System'} · {e.note}</li>)}</ol></details>}
    {w.audience==='staff'&&portion.canAct&&<PreparationFollowupForm c={c} portion={portion} reviewers={w.reviewers} disabled={busy||blocked||Boolean(saved)} submit={submit}/>}
   </section>)}
  </article>)}
 </section>;
}

function PreparationFollowupForm({c,portion,reviewers,disabled,submit}:{c:PreparationWorkspace['portions'][number]['cases'][number];portion:PreparationWorkspace['portions'][number];reviewers:PreparationWorkspace['reviewers'];disabled:boolean;submit:(event:SubmitEvent<HTMLFormElement>,action:'followup',subject:string,revision:number)=>void}){
 const[reviewedRevision,setReviewedRevision]=useState(c.revision),[startedOpen]=useState(c.state!=='resolved');
 if(!startedOpen&&c.state==='resolved')return null;
 const stale=reviewedRevision!==c.revision,closed=c.state==='resolved',eligible=reviewers.filter(r=>portion.operatorMode!=='company'||r.role==='super_admin');
 return <>{closed?<p>The current case is resolved. Your unsent note remains here; no further follow-up can be submitted.</p>:stale&&<div role="alert"><p>This case changed. Review its current history before applying your retained note to revision {c.revision}.</p><button type="button" disabled={disabled} onClick={()=>setReviewedRevision(c.revision)}>Review current case and keep my note</button></div>}
    <form data-form-id="staff.order-preparation" onSubmit={e=>submit(e,'followup',c.id,reviewedRevision)}><fieldset disabled={disabled||stale||closed} className="space-y-2">
     <legend className="font-semibold">Record accountable follow-up</legend>
     <label className="block">Owner <select name="ownerId" required defaultValue={c.ownerId??''}><option value="">Choose eligible owner</option>{eligible.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
     <label className="block">Backup <select name="backupId" defaultValue={c.backupId??''}><option value="">No backup assigned</option>{eligible.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
     <label className="block">Next action <select name="state"><option value="open">Continue review</option><option value="waiting">Waiting for a recorded response</option><option value="resolved">Actual preparation issue resolved</option></select></label>
     <label className="block">Next update within 24 hours (your browser’s local time) <input type="datetime-local" name="nextUpdateAt"/></label>
     <label className="block">Private follow-up note <textarea name="privateNote" required minLength={10} maxLength={2000} className="block w-full rounded border p-2"/></label>
     <label className="block">Customer-facing factual update <textarea name="customerMessage" required minLength={10} maxLength={1500} className="block w-full rounded border p-2"/></label>
     <button type="submit">Save follow-up and customer update</button>
    </fieldset></form></>;
}
