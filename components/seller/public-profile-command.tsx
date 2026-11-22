'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {sellerAccessDenied} from '@/lib/sellers/client-access';
type ActingScope={actorId:string;onAccessDenied?:()=>void};
/** Keep an uncertain body exact; only its original mounted actor/source can adopt a result. */
export function usePublicProfileCommand(url:string,onSuccess?:(result:unknown,body:Record<string,unknown>)=>void,identity?:{sellerId:string;ownerId:string},actingScope?:ActingScope){
 const actorId=actingScope?.actorId??identity?.ownerId,scope=useOwnedFormScope(JSON.stringify([url,actorId,identity?.sellerId,identity?.ownerId]));
 const router=useRouter(),pending=useRef<Record<string,unknown>|null>(null),denied=useRef(false),[accessDenied,setAccessDenied]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState('');
 const isCurrent=()=>scope.isCurrent()&&!denied.current;
 async function run(input:Record<string,unknown>){if(busy||!isCurrent())return;const body=pending.current??{...input,...identity,requestId:crypto.randomUUID()};pending.current=body;setBusy(true);setMessage('');
  try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(actorId!==undefined?{[ACTOR_INTENT_HEADER]:actorId}:{})},body:JSON.stringify(body)});
   if(!isCurrent())return;if(response.status===401||response.status===403){denied.current=true;setAccessDenied(true);if(identity)sellerAccessDenied(identity.ownerId);actingScope?.onAccessDenied?.();router.refresh();return;}
   const result=await response.json() as {ok?:boolean;error?:string;result?:unknown};if(!isCurrent())return;
   if(!response.ok){if(response.status<500&&![408,429].includes(response.status)){pending.current=null;setUncertain(false);}throw new Error(result.error??'The result could not be confirmed.');}
   if(result.ok!==true||['save_draft','save_support','save_locations'].includes(String(body.action))&&(!result.result||typeof(result.result as {revision?:unknown}).revision!=='string'))throw new Error('The result is incomplete. Retry the original retained command.');
   pending.current=null;setUncertain(false);setMessage(body.action==='save_draft'?'Private draft saved.':'Profile action recorded. Refreshing the current version.');onSuccess?.(result.result,body);router.refresh();
  }catch(error){if(!isCurrent())return;setUncertain(pending.current!==null);setMessage(error instanceof Error?error.message:'Keep your entries and retry the same request.');}finally{if(isCurrent())setBusy(false);}
 }
 return{run,busy,uncertain,message,setMessage,accessDenied,locked:busy||uncertain||accessDenied,retry:()=>run({})};
}
export function PublicProfileCommandFeedback({command}:{command:ReturnType<typeof usePublicProfileCommand>}){if(command.accessDenied)return <p role="alert">Access changed. Reopen the current workspace before entering private details.</p>;return <div className="space-y-2"><output className="block text-sm" aria-live="polite">{command.message}</output>{command.uncertain?<><p className="text-sm">The outcome is uncertain. Your entries are retained; retry checks the same request.</p><button className="rounded-lg border px-4 py-3" type="button" disabled={command.busy} onClick={()=>void command.retry()}>Retry the same request</button></>:null}</div>;}
