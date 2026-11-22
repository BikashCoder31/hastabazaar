'use client';
import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useSessionReference,notifySessionReference} from '@/hooks/use-session-reference';
import {sessionAttemptKey} from '@/lib/forms/client-attempt';
import {useDenyTeamScope} from './team-scope-boundary';

type Status='pending'|'accepted'|'expired'|'revoked';
type Ref={schema:1;actorId:string;kind:'invite'|'revoke';requestId:string;id?:string};
type Attempt={ref:Ref;body:string;uncertain:boolean};
type Callbacks={recorded:(kind:Ref['kind'])=>void;rejected?:(response:Pick<Response,'ok'|'status'>,data:Record<string,unknown>)=>void};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,191}$/.test(value);
const status=(value:unknown):value is Status=>['pending','accepted','expired','revoked'].includes(String(value));
function parse(raw:string|null|undefined,actorId:string):Ref|null|'invalid'|'loading'{
 if(raw===undefined)return'loading';if(raw===null)return null;
 try{const row:unknown=JSON.parse(raw);if(!object(row)||Object.keys(row).some(key=>!['schema','actorId','kind','requestId','id'].includes(key))||row.schema!==1||row.actorId!==actorId||!uuid(row.requestId)||!['invite','revoke'].includes(String(row.kind)))return'invalid';if(row.kind==='revoke'&&!id(row.id)||row.kind==='invite'&&row.id!==undefined)return'invalid';return{schema:1,actorId,kind:row.kind==='invite'?'invite':'revoke',requestId:row.requestId,...(typeof row.id==='string'?{id:row.id}:{})};}catch{return'invalid';}
}
/** Private invitation fields exist only in the retained RAM wire. Storage holds
 * an exact actor/operation/UUID (and immutable revocation target) reference. */
export function useStaffInvitationCommand(actorId:string,callbacks:Callbacks){
 const key='hb:staff-invitation:v1:'+encodeURIComponent(actorId),legacyKey=sessionAttemptKey('staff.staff-invitation','new'),raw=useSessionReference(key),legacyRaw=useSessionReference(legacyKey),own=parse(raw,actorId);
 const legacy=own===null&&uuid(legacyRaw),reference=object(own)?own:legacy?{schema:1 as const,actorId,kind:'invite' as const,requestId:legacyRaw}:null;
 const invalid=own==='invalid'||own===null&&legacyRaw!==null&&legacyRaw!==undefined&&!uuid(legacyRaw),loading=own==='loading'||own===null&&legacyRaw===undefined;
 const [ram,setRam]=useState<Attempt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[denied,setDenied]=useState(false),[revokeRetryAllowed,setRevokeRetryAllowed]=useState(false);
 const lease=useRef<object|null>(null),flight=useRef<object|null>(null),denyTeam=useDenyTeamScope();
 useLayoutEffect(()=>{const token={};lease.current=token;return()=>{if(lease.current===token)lease.current=null;};},[]);
 const capture=useCallback(()=>{const token=lease.current;return()=>token!==null&&lease.current===token;},[]);
 const deny=()=>{setDenied(true);denyTeam?.();};
 const pending=ram?.ref??reference,conflicting=!!(ram&&reference&&ram.ref.requestId!==reference.requestId),blocked=loading||invalid||conflicting||busy||!!pending||denied;
 function forget(ref:Ref){try{const current=parse(sessionStorage.getItem(key),actorId);if(object(current)&&current.requestId===ref.requestId&&current.kind===ref.kind&&current.id===ref.id){sessionStorage.removeItem(key);notifySessionReference(key);}if(legacy&&sessionStorage.getItem(legacyKey)===ref.requestId){sessionStorage.removeItem(legacyKey);notifySessionReference(legacyKey);}}catch{/* A confirmed result never licenses removing an unvalidated reference. */}}
 function persist(attempt:Attempt){try{const current=parse(sessionStorage.getItem(key),actorId);if(current==='invalid'||current==='loading'||object(current)&&(current.requestId!==attempt.ref.requestId||current.kind!==attempt.ref.kind||current.id!==attempt.ref.id))throw Error('The original reference changed.');sessionStorage.setItem(key,JSON.stringify(attempt.ref));notifySessionReference(key);setRam(attempt);return true;}catch{setError('No new request was sent because its recovery reference could not be saved. Keep your entries and restore browser storage.');return false;}}
 function complete(ref:Ref,text:string){forget(ref);setRam(null);setRevokeRetryAllowed(false);setError('');setMessage(text);try{callbacks.recorded(ref.kind);}catch{setError('The original result is confirmed, but the current Team view could not be refreshed. Reopen Team before another action.');}}
 function validCreation(data:unknown,ref:Ref,post:boolean){return object(data)&&data.recorded===true&&data.requestId===ref.requestId&&id(data.id)&&typeof data.expiresAt==='number'&&Number.isSafeInteger(data.expiresAt)&&data.expiresAt>0&&status(data.status)&&(!post||data.actorId===actorId&&data.phase==='recorded'&&typeof data.duplicate==='boolean'&&typeof data.emailDelivered==='boolean'&&typeof data.emailAttempted==='boolean');}
 async function send(attempt:Attempt){
  if(flight.current||denied)return false;const current=capture(),token={};if(!current()||!persist(attempt))return false;flight.current=token;setBusy(true);setError('');setMessage('');let original=attempt;
  try{const response=await fetch('/api/admin/staff-invitations'+(attempt.ref.kind==='revoke'?'/'+encodeURIComponent(attempt.ref.id!):''),{method:attempt.ref.kind==='invite'?'POST':'DELETE',headers:{'content-type':'application/json','X-Hastabazaar-Actor':actorId},...(attempt.ref.kind==='invite'?{body:attempt.body}:{})}),data:unknown=await response.json().catch(()=>null);
   const rejected=!original.uncertain&&object(data)&&data.phase==='rejected_before_write';
   if(!current()){if(rejected)forget(attempt.ref);return false;}
   if(!response.ok){if(rejected){forget(attempt.ref);setRam(null);}else{original={...original,uncertain:true};setRam(original);}if([401,403].includes(response.status))deny();else if(rejected&&object(data))callbacks.rejected?.(response,data);setError(object(data)&&typeof data.error==='string'?data.error:'The original invitation action remains unconfirmed.');return false;}
   const valid=attempt.ref.kind==='invite'?validCreation(data,attempt.ref,true):object(data)&&data.id===attempt.ref.id&&data.actorId===actorId&&data.revoked===true;
   if(!valid){setRam({...original,uncertain:true});setError('The original invitation is unconfirmed. Check its saved outcome or retry the retained exact request.');return false;}
   complete(attempt.ref,attempt.ref.kind==='invite'?'The original invitation creation is recorded. Current invitation status: '+String((data as Record<string,unknown>).status)+'. Email delivery is not confirmed here.':'The invitation revocation is recorded.');return true;
  }catch{if(current()){setRam({...original,uncertain:true});setError('The original invitation is unconfirmed. Check its saved outcome or retry the retained exact request.');}return false;}
  finally{if(flight.current===token)flight.current=null;if(current())setBusy(false);}
 }
 async function check(){
  if(!pending||flight.current||loading||denied)return false;const ref=pending,current=capture(),token={};if(!current())return false;flight.current=token;setBusy(true);setError('');
  try{const response=await fetch('/api/admin/staff-invitations'+(ref.kind==='invite'?'?requestId='+encodeURIComponent(ref.requestId):'/'+encodeURIComponent(ref.id!)),{cache:'no-store',headers:{'X-Hastabazaar-Actor':actorId}}),data:unknown=await response.json().catch(()=>null);if(!current())return false;
   if([401,403].includes(response.status)){deny();setError('Current invitation access is unavailable. The original reference remains retained.');return false;}
   if(ref.kind==='invite'&&response.ok&&validCreation(data,ref,false)){complete(ref,'The original invitation creation is recorded. Current invitation status: '+String((data as Record<string,unknown>).status)+'. This check did not send another email.');return true;}
   if(ref.kind==='revoke'&&response.ok&&object(data)&&data.id===ref.id&&status(data.status)){
    if(data.status==='pending'){setRevokeRetryAllowed(true);setMessage('The original target is still pending. Its revocation remains unconfirmed; retry only that original target.');return false;}
    complete(ref,'Current invitation status: '+data.status+'. This status check does not establish who caused it.'+(data.status==='accepted'?' Review existing staff access separately.':''));return true;
   }
   setError('The original invitation outcome is unconfirmed. Check its current history or use the original staff account; no new attempt was started.');return false;
  }catch{if(current())setError('The original invitation outcome could not be checked. Keep its reference and retry the check.');return false;}
  finally{if(flight.current===token)flight.current=null;if(current())setBusy(false);}
 }
 async function invite(payload:Record<string,unknown>){if(blocked)return false;const ref:Ref={schema:1,actorId,kind:'invite',requestId:crypto.randomUUID()};return send({ref,body:JSON.stringify({...payload,requestId:ref.requestId}),uncertain:false});}
 async function revoke(targetId:string){if(blocked||!id(targetId))return false;const ref:Ref={schema:1,actorId,kind:'revoke',id:targetId,requestId:crypto.randomUUID()};return send({ref,body:'',uncertain:false});}
 const canRetry=!!ram||!!(pending?.kind==='revoke'&&revokeRetryAllowed);
 return{busy,blocked,pending,denied,error:invalid?'The earlier recovery reference cannot be validated. Review current invitation history with the original staff account before another attempt.':error,message,canRetry,invite,revoke,check,retry:()=>ram?send(ram):pending?.kind==='revoke'&&revokeRetryAllowed?send({ref:pending,body:'',uncertain:true}):Promise.resolve(false),capture,clearFeedback:()=>{setError('');setMessage('');}};
}
