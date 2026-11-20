'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSellerPrivateScope,SellerFormAccessChanged} from './use-seller-private-scope';
type Props={caseId:string;version:number;accountId:string};
export function ProtectedChangeWithdrawal(props:Props){return <OwnedProtectedChangeWithdrawal key={JSON.stringify([props.accountId,props.caseId])} {...props}/>;}
function OwnedProtectedChangeWithdrawal({caseId,version,accountId}:Props){
  const scope=useSellerPrivateScope(accountId,caseId);
  const router=useRouter(),pending=useRef<string|null>(null);const [busy,setBusy]=useState(false),[retained,setRetained]=useState(false),[message,setMessage]=useState('');
  async function submit(event:React.SyntheticEvent<HTMLFormElement,SubmitEvent>){event.preventDefault();if(busy||!scope.isCurrent())return;const form=new FormData(event.currentTarget);
    pending.current??=JSON.stringify({version,accountId,reason:form.get('reason'),commandId:crypto.randomUUID()});setBusy(true);setRetained(true);
    try{const response=await fetch(`/api/seller/protected-changes/${encodeURIComponent(caseId)}/withdraw`,{method:'POST',headers:{'Content-Type':'application/json',[ACTOR_INTENT_HEADER]:accountId},body:pending.current});if(!scope.isCurrent())return;if(response.status===401||response.status===403){scope.deny();return;}const body=await response.json() as {ok?:boolean;error?:string};if(!scope.isCurrent())return;
      if(!response.ok){if(response.status<500&&![408,429].includes(response.status)){pending.current=null;setRetained(false);}throw new Error(body.error??'Withdrawal could not be confirmed.');}
      if(body.ok!==true)throw new Error('The result is incomplete. Retry the original retained request.');
      pending.current=null;setRetained(false);setMessage('Withdrawal recorded. Holds remain until an eligible reviewer confirms their disposition.');router.refresh();
    }catch(error){if(!scope.isCurrent())return;setMessage(error instanceof Error?error.message:'Keep your reason and retry the same withdrawal.');}finally{if(scope.isCurrent())setBusy(false);}}
  if(scope.accessDenied)return <SellerFormAccessChanged/>;
  return <details><summary className="cursor-pointer font-semibold">Withdraw this proposed change</summary><form data-form-id="seller.protected-change-withdrawal" onSubmit={submit} className="mt-4 space-y-3"><p className="text-sm">Withdrawal keeps the current record and all existing holds. A closed or compromised account cannot resume payments through withdrawal.</p>
    <label className="block text-sm">Reason<textarea name="reason" required minLength={10} maxLength={1000} disabled={busy||retained} className="mt-1 block min-h-24 w-full rounded border bg-background p-2"/></label>
    <Button type="submit" variant="outline" disabled={busy}>{busy?'Saving…':retained?'Retry retained withdrawal':'Withdraw proposed change'}</Button><output className="block text-sm" aria-live="polite">{message}</output></form></details>;
}
