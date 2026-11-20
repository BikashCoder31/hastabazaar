'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {notifySessionReference,useSessionReference} from '@/hooks/use-session-reference';
import {useRouter} from 'next/navigation';
import {clearSessionAttempt,getOrCreateSessionAttempt,sessionAttemptKey} from '@/lib/forms/client-attempt';
import type {FinanceEvidenceScope,FinanceEvidenceMode} from '@/lib/payments/refund-evidence';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {FinanceAccessNotice} from '@/components/admin/finance-access-notice';

type UploadProps={actorId:string;scope:FinanceEvidenceScope;mode:FinanceEvidenceMode;onSaved?:(id:string)=>void;files?:readonly {id:string;name:string}[]};
export function FinanceEvidenceUpload(props:UploadProps){return <FinanceEvidenceUploadScope key={JSON.stringify([props.actorId,props.mode,props.scope.kind,props.scope.id])} {...props}/>;}
function FinanceEvidenceUploadScope({actorId,scope,mode,onSaved,files=[]}:UploadProps){
 const active=useRef(true);useLayoutEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const router=useRouter(),input=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState<string|null>(null),[accessDenied,setAccessDenied]=useState(false);
 const formId=mode==='customer'?'system.refund-evidence':'system.finance-evidence',endpoint=mode==='customer'?'/api/account/refund-evidence':'/api/admin/finance-evidence',key=sessionAttemptKey(formId,`${actorId}:${scope.kind}:${scope.id}`);
 const storedAttempt=useSessionReference(key),pending=storedAttempt!==null,hydrated=storedAttempt!==undefined;
 async function upload(recover:boolean){setBusy(true);try{
  const file=input.current?.files?.[0];if(!recover&&!file)throw new Error('Choose the original PDF, JPG or PNG file.');
  const requestId=recover?sessionStorage.getItem(key):getOrCreateSessionAttempt(key);if(!requestId)throw new Error('There is no pending upload reference.');
  const data=new FormData();data.set('scopeKind',scope.kind);data.set('scopeId',scope.id);data.set('requestId',requestId);if(!recover)data.set('file',file!);notifySessionReference(key);
  const response=await fetch(endpoint,{method:'POST',headers:{[ACTOR_INTENT_HEADER]:actorId},body:data}),result=await response.json() as {id?:string;error?:string};
  if(!active.current)return;if(response.status===401||response.status===403)setAccessDenied(true);
  if(!response.ok||!result.id)throw new Error(result.error??'Check the original upload before retrying.');
  clearSessionAttempt(key);setAccessDenied(false);notifySessionReference(key);setSaved(result.id);onSaved?.(result.id);setMessage('Private evidence retained. Use its reference in the exact financial decision.');router.refresh();
 }catch(error){if(active.current)setMessage(error instanceof Error?error.message:'Check the original upload before retrying.');}finally{if(active.current)setBusy(false);}}
 if(accessDenied)return <FinanceAccessNotice message={message} busy={busy} onCheck={pending?()=>void upload(true):undefined}/>;
 return <section className="space-y-2 rounded border p-3"><p className="font-medium">Private supporting evidence</p><p className="text-sm">PDF, JPG or PNG, up to 5 MB. Upload only the needed ownership or transaction evidence. Never include banking passwords, PINs or OTPs.</p>
  <form data-form-id={formId} onSubmit={event=>{event.preventDefault();void upload(false);}}><fieldset disabled={busy||!hydrated} className="flex flex-wrap items-center gap-2"><label>Private evidence file<input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="block"/></label><button className="rounded border px-3 py-2">{pending?'Retry original file':'Retain private file'}</button>{pending?<button className="rounded border px-3 py-2" type="button" onClick={()=>void upload(true)}>Recover original upload</button>:null}</fieldset></form>
  {saved?<p className="break-all text-sm"><a className="underline" href={endpoint+'?file='+encodeURIComponent(saved)} target="_blank" rel="noreferrer">Read retained file</a> · Reference: {saved}</p>:null}
  {files.map(file=><p key={file.id} className="flex flex-wrap gap-2 text-sm"><a className="underline" href={endpoint+'?file='+encodeURIComponent(file.id)} target="_blank" rel="noreferrer">{file.name}</a>{onSaved?<button className="underline" onClick={()=>onSaved(file.id)}>Use this retained reference</button>:null}</p>)}
  {message?<output className="block text-sm" aria-live="polite">{message}</output>:null}
 </section>;
}
