'use client';
import {useEffect,useLayoutEffect,useRef,useState,type SubmitEvent} from 'react';
import {useRouter} from 'next/navigation';
import {usePublishedFormConfig} from '@/components/forms/form-config-client';
import {ConfiguredFields} from '@/components/forms/configured-fields';
import {TEAM_GOVERNANCE_FORM} from '@/lib/operations/governance-form-contracts';
import {configuredJsonPayload,readConfiguredSubmission} from '@/lib/forms/client-submission';
import {sessionAttemptKey} from '@/lib/forms/client-attempt';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSessionReference,notifySessionReference} from '@/hooks/use-session-reference';
import {useDenyTeamScope} from './team-scope-boundary';
import {Button} from '@/components/ui/button';
export type TeamField={key:string;label:string;type?:'text'|'textarea'|'datetime'|'select'|'ordered';required?:boolean;options?:{id:string;label:string}[];value?:string|string[]};
type Props={actorId:string;action:string;sourceId:string;revision:string|null;label:string;fields?:TeamField[];input?:Record<string,unknown>};
type Attempt={requestId:string;body:string;uncertain:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const listValue=(value:string|string[]|undefined):string[]=>Array.isArray(value)?value:[];
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function TeamAction(props:Props){return <OwnedTeamAction key={JSON.stringify([props.actorId,props.action,props.sourceId])} {...props}/>;}
function OwnedTeamAction({actorId,action,sourceId,revision,label,fields=[],input={}}:Props){
 const router=useRouter(),denyWorkspace=useDenyTeamScope(),form=usePublishedFormConfig('staff.team-governance');
 const key=sessionAttemptKey('staff.team-governance',actorId+':'+action+':'+sourceId),stored=useSessionReference(key);
 const [values,setValues]=useState<Record<string,string|string[]>>(()=>Object.fromEntries(fields.map(field=>[field.key,field.value??(field.type==='ordered'?[]:'')])));
 const [reviewedRevision,setReviewedRevision]=useState(revision),[attempt,setAttempt]=useState<Attempt|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false),[denied,setDenied]=useState(false);
 const active=useRef(false),flight=useRef(false),pending=useRef<Attempt|null>(null);
 useLayoutEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 // Retire only this action's former private cache. Preserve its separate opaque reference.
 useEffect(()=>{try{sessionStorage.removeItem(key+':payload');}catch{/* No private cache is read. */}},[key]);
 const restoredId=typeof stored==='string'&&uuid.test(stored)?stored:null;
 const requestId=attempt?.requestId??restoredId,blocked=stored===undefined||stored==='unavailable'||!!stored&&!restoredId,changed=revision!==reviewedRevision;
 function deny(){setDenied(true);denyWorkspace?.();}
 function clearExact(id:string){try{if(sessionStorage.getItem(key)===id){sessionStorage.removeItem(key);notifySessionReference(key);}}catch{/* Native success is still recorded. */}}
 function confirmed(data:unknown,id:string){
  if(!object(data)||data.saved!==true||!object(data.result)||typeof data.result.id!=='string'||!data.result.id||data.result.id.length>191||!Number.isSafeInteger(data.result.revision)||Number(data.result.revision)<0||!object(data.reference))return false;
  return data.reference.actorId===actorId&&data.reference.action===action&&data.reference.sourceId===sourceId&&data.reference.requestId===id;
 }
 function finish(data:unknown,id:string){if(!active.current)return;clearExact(id);pending.current=null;setAttempt(null);setSaved(true);setMessage(object(data)&&typeof data.message==='string'?data.message:'The original Team change is recorded.');router.refresh();}
 async function send(value:Attempt){
  if(!active.current||flight.current||denied)return;flight.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/admin/team/governance',{method:'POST',headers:{'content-type':'application/json',[ACTOR_INTENT_HEADER]:actorId},body:value.body}),data:unknown=await response.json().catch(()=>null);if(!active.current)return;
   if(response.ok&&confirmed(data,value.requestId)){finish(data,value.requestId);return;}
   const rejected=object(data)&&data.phase==='rejected_before_write'&&!value.uncertain;
   if(rejected){clearExact(value.requestId);pending.current=null;setAttempt(null);}else value.uncertain=true;
   if(response.status===401||response.status===403)deny();
   if(object(data)&&data.code==='stale_version')form.handleSubmissionResponse(response,'stale_version');
   setMessage(object(data)&&typeof data.error==='string'?data.error:'The original Team action is unconfirmed. Check its saved outcome or retry the retained exact request.');
  }catch{value.uncertain=true;if(active.current)setMessage('The response is uncertain. Check the original outcome or retry this exact Team action.');}
  finally{flight.current=false;if(active.current)setBusy(false);}
 }
 async function recover(){
  if(!active.current||flight.current||denied||!requestId)return;flight.current=true;setBusy(true);setMessage('');
  try{
   const query=new URLSearchParams({requestId,action,sourceId}),response=await fetch('/api/admin/team/governance?'+query,{cache:'no-store',headers:{[ACTOR_INTENT_HEADER]:actorId}}),data:unknown=await response.json().catch(()=>null);if(!active.current)return;
   if(response.ok&&confirmed(data,requestId)){finish(data,requestId);return;}
   if(response.status===401||response.status===403)deny();
   setMessage(object(data)&&typeof data.error==='string'?data.error:'No original saved result is confirmed yet. Keep this reference; no replacement action has been started.');
  }catch{if(active.current)setMessage('The saved outcome could not be checked. The original request reference is retained.');}
  finally{flight.current=false;if(active.current)setBusy(false);}
 }
 function update(field:string,value:string|string[]){setValues(old=>({...old,[field]:value}));setSaved(false);}
 async function submit(event:SubmitEvent<HTMLFormElement>){
  event.preventDefault();if(!active.current||flight.current||denied||blocked||requestId||changed||!form.config||!form.canSubmit)return;
  try{
   const configured=readConfiguredSubmission(event.currentTarget,form.config,TEAM_GOVERNANCE_FORM.baseFields.map(field=>field.key)),id=crypto.randomUUID();
   const payload:Record<string,unknown>={...input,...values,action,sourceId,expectedRevision:reviewedRevision,requestId:id,...configuredJsonPayload(form.config,configured.answers,TEAM_GOVERNANCE_FORM.baseFields.map(field=>field.key))};
   for(const field of fields)if(field.type==='datetime'&&typeof values[field.key]==='string')payload[field.key]=Date.parse(values[field.key]+'+05:45');
   const value:Attempt={requestId:id,body:JSON.stringify(payload),uncertain:false};
   if(sessionStorage.getItem(key)!==null)throw new Error('An original action reference already exists. Check its saved outcome first.');
   sessionStorage.setItem(key,id);notifySessionReference(key);pending.current=value;setAttempt(value);setSaved(false);await send(value);
  }catch(error){if(active.current)setMessage(error instanceof Error?error.message:'The action could not be prepared. Your current input is retained.');}
 }
 if(denied)return <section role="alert" className="space-y-2"><p>Team access changed. Private inputs are hidden.</p><Button type="button" variant="outline" onClick={()=>window.location.assign('/admin/team')}>Reopen Team with current access</Button></section>;
 return <form data-form-id="staff.team-governance" onSubmit={submit} className="space-y-3 rounded-lg border p-3">{form.config?<ConfiguredFields config={form.config} baseKeys={TEAM_GOVERNANCE_FORM.baseFields.map(field=>field.key)}/>:null}<fieldset disabled={busy||!!requestId} className="space-y-3"><legend className="text-sm font-semibold">{label}</legend>{fields.map(field=><label key={field.key} className="block space-y-1 text-sm"><span>{field.label}{field.required?' *':''}</span>{field.type==='ordered'?<div className="space-y-2"><select aria-label={'Add '+field.label} value="" onChange={event=>{if(event.target.value)update(field.key,[...listValue(values[field.key]),event.target.value]);}}><option value="">Add a person in backup order</option>{field.options?.filter(option=>!(values[field.key]??[]).includes(option.id)).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select><ol>{(Array.isArray(values[field.key])?values[field.key] as string[]:[]).map((id,index)=><li key={id} className="flex gap-2"><span>{index+1}. {field.options?.find(option=>option.id===id)?.label??id}</span><Button type="button" variant="outline" size="sm" disabled={index===0} onClick={()=>{const list=[...(values[field.key] as string[])];[list[index-1],list[index]]=[list[index],list[index-1]];update(field.key,list);}}>Move up</Button><Button type="button" variant="outline" size="sm" onClick={()=>update(field.key,(values[field.key] as string[]).filter(value=>value!==id))}>Remove</Button></li>)}</ol></div>:field.type==='select'?<select className="block w-full rounded border p-2" value={String(values[field.key]??'')} required={field.required} onChange={event=>update(field.key,event.target.value)}><option value="">Unassigned / choose</option>{field.options?.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>:field.type==='textarea'?<textarea className="block min-h-24 w-full rounded border p-2" maxLength={field.key==='body'?20000:1000} value={String(values[field.key]??'')} required={field.required} onChange={event=>update(field.key,event.target.value)}/>:<input className="block w-full rounded border p-2" type={field.type==='datetime'?'datetime-local':'text'} value={String(values[field.key]??'')} required={field.required} maxLength={1000} onChange={event=>update(field.key,event.target.value)}/>}</label>)}{!fields.some(field=>field.key==='reason')?<label className="block text-sm">Reason *<textarea className="block w-full rounded border p-2" value={String(values.reason??'')} minLength={8} maxLength={1000} required onChange={event=>update('reason',event.target.value)}/></label>:null}</fieldset>{changed&&!requestId?<section className="space-y-2 rounded border p-3"><p role="alert">The source version changed. Review its current values before using your retained input.</p><dl>{fields.filter(field=>field.value!==undefined).map(field=><div key={field.key}><dt>{field.label}</dt><dd>{Array.isArray(field.value)?field.value.map(id=>field.options?.find(option=>option.id===id)?.label??id).join(', ')||'None':field.options?.find(option=>option.id===field.value)?.label??field.value??'None'}</dd></div>)}</dl><Button type="button" variant="outline" onClick={()=>setReviewedRevision(revision)}>Use reviewed current version with retained input</Button></section>:null}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy||blocked||!!requestId||changed||!form.canSubmit}>{busy?'Working…':label}</Button>{attempt?<Button type="button" variant="outline" disabled={busy} onClick={()=>{const value=pending.current;if(value)void send(value);}}>Retry exact Team action</Button>:null}<Button type="button" variant="outline" disabled={busy||blocked||!requestId} onClick={()=>void recover()}>Check saved outcome</Button></div>{requestId&&!attempt?<p>A retained action can be checked here. Reloaded private input is never resubmitted automatically.</p>:null}{blocked&&stored!==undefined?<p role="alert">The original browser reference is unavailable or invalid. No action was sent.</p>:null}{!form.canSubmit?<p role="alert" className="text-sm">{form.message||'Loading the protected form…'}</p>:null}{message?saved?<output className="text-sm">{message}</output>:<p role="alert" className="text-sm">{message}</p>:null}</form>;
}
