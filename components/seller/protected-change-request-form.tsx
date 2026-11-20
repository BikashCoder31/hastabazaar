'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSellerPrivateScope,SellerFormAccessChanged} from './use-seller-private-scope';
type Props={kind:'identity'|'bank';fields:readonly string[];identityRevision:number;bankRevision:number;accountId:string;onSaved?:()=>void;selectableFields?:boolean};
export function ProtectedChangeRequestForm(props:Props){return <OwnedProtectedChangeRequestForm key={JSON.stringify([props.accountId,props.kind,[...props.fields].sort(),props.selectableFields])} {...props}/>;}
function OwnedProtectedChangeRequestForm({kind,fields,identityRevision,bankRevision,accountId,onSaved,selectableFields=false}:Props){
  const scope=useSellerPrivateScope(accountId,JSON.stringify([kind,[...fields].sort(),selectableFields]));
  const router=useRouter(),pending=useRef<string|null>(null);const [busy,setBusy]=useState(false),[retained,setRetained]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState<string|null>(null);
  async function submit(event:React.SyntheticEvent<HTMLFormElement,SubmitEvent>){event.preventDefault();if(busy||!scope.isCurrent())return;const data=new FormData(event.currentTarget);
    const selected=selectableFields?data.getAll('field').map(String):fields;if(!pending.current&&!selected.length){setMessage('Choose the exact fields or evidence requiring correction.');return;}
    pending.current??=JSON.stringify({kind,fields:selected,identityRevision,bankRevision,accountId,reason:data.get('reason'),currentUnusable:data.get('currentUnusable')==='yes',commandId:crypto.randomUUID()});setBusy(true);setRetained(true);
    try{const response=await fetch('/api/seller/protected-changes',{method:'POST',headers:{'Content-Type':'application/json',[ACTOR_INTENT_HEADER]:accountId},body:pending.current});if(!scope.isCurrent())return;if(response.status===401||response.status===403){scope.deny();return;}const body=await response.json() as {ok?:boolean;error?:string;caseId?:string};if(!scope.isCurrent())return;
      if(!response.ok){if(response.status<500&&![408,429].includes(response.status)){pending.current=null;setRetained(false);}throw new Error(body.error??'The change request could not be confirmed.');}
      if(body.ok!==true||typeof body.caseId!=='string'||!body.caseId)throw new Error('The result is incomplete. Retry the original retained request.');
      pending.current=null;setRetained(false);setSaved(body.caseId!);setMessage('Change request recorded. Open it to see the exact hold and next action.');onSaved?.();router.refresh();
    }catch(error){if(!scope.isCurrent())return;setMessage(error instanceof Error?error.message:'Keep your reason and retry the same request.');}finally{if(scope.isCurrent())setBusy(false);}}
  if(scope.accessDenied)return <SellerFormAccessChanged/>;
  return <form data-form-id="seller.protected-change-request" onSubmit={submit} className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Request a protected {kind==='bank'?'bank':'identity'} change</h3>
    <p className="text-sm">{kind==='bank'?'Submitting pauses unpaid payouts. Existing valid identity and route checks still govern new orders.':'Submitting pauses new orders and unpaid payouts until authorized review and disposition.'} Existing orders retain their obligations and separate restrictions. This cannot transfer ownership to another person or legal entity.</p>
    <fieldset disabled={busy||retained||!!saved} className="space-y-3">{selectableFields?<><legend className="text-sm font-semibold">Exact fields or evidence</legend><div className="grid gap-2 sm:grid-cols-2">{fields.map(field=><label className="flex gap-2 text-sm" key={field}><input type="checkbox" name="field" value={field}/>{field.replace(/([A-Z])/g,' $1').replaceAll('_',' ')}</label>)}</div></>:<p className="text-sm">Requested scope: {fields.map(field=>field.replaceAll('_',' ')).join(', ')}</p>}
    <label className="block text-sm">Specific reason<textarea name="reason" className="mt-1 block min-h-24 w-full rounded border bg-background p-2" minLength={10} maxLength={1000} required/></label>
    {kind==='bank'?<label className="flex gap-2 text-sm"><input name="currentUnusable" type="checkbox" value="yes"/>The current account is closed, unusable or compromised. New-order readiness must also be reviewed.</label>:null}</fieldset>
    <Button variant="workspace-primary" size="workspace" type="submit" disabled={busy||!!saved}>{busy?'Submitting…':retained?'Retry retained request':'Submit change request'}</Button><output className="block text-sm" aria-live="polite">{message}</output>
    {saved?<a className="section-link text-[#A8232E] underline" href={`/seller/requests/changes/${encodeURIComponent(saved)}`}>Open request →</a>:null}</form>;
}
