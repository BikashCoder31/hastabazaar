'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {useSellerPrivateScope,SellerFormAccessChanged} from './use-seller-private-scope';

type Props={accountId:string;documentId:string;requestId?:string;permissionId?:string;unverified?:boolean};
export function DocumentChangeRequestForm(props:Props){return <OwnedDocumentChangeRequestForm key={JSON.stringify([props.accountId,props.documentId,props.requestId,props.permissionId,props.unverified])} {...props}/>;}
function OwnedDocumentChangeRequestForm({accountId,documentId,requestId,permissionId,unverified=false}:Props) {
  const scope=useSellerPrivateScope(accountId,JSON.stringify([documentId,requestId,permissionId,unverified]));
  const router=useRouter(),pending=useRef<{body:FormData|string;url:string;json:boolean}|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false),[hasPending,setHasPending]=useState(false);
  const replacement=unverified||Boolean(requestId&&permissionId);
  async function submit(event:React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy||!scope.isCurrent()) return;
    const form=event.currentTarget; setBusy(true);setMessage('');
    try {
      if(!pending.current) {
        const data=new FormData(form),commandId=crypto.randomUUID();
        if(replacement) {data.set('commandId',commandId);if(!unverified)data.set('permissionId',permissionId!);pending.current={body:data,json:false,url:unverified?`/api/seller-applications/documents/${encodeURIComponent(documentId)}/replacement`:`/api/seller-applications/document-change/${encodeURIComponent(requestId!)}/replacement`};}
        else pending.current={body:JSON.stringify({documentId,reason:data.get('reason'),commandId}),json:true,url:'/api/seller-applications/document-change'};
        setHasPending(true);
      }
      const attempt=pending.current,response=await fetch(attempt.url,{method:'POST',headers:{[ACTOR_INTENT_HEADER]:accountId,...(attempt.json?{'Content-Type':'application/json'}:{})},body:attempt.body});
      if(!scope.isCurrent())return;if(response.status===401||response.status===403){scope.deny();return;}
      const result=await response.json() as {ok?:boolean;error?:string};if(!scope.isCurrent())return;
      if(!response.ok) {if(response.status<500&&![408,429].includes(response.status)){pending.current=null;setHasPending(false);}throw new Error(result.error??'The result could not be confirmed.');}
      if(result.ok!==true)throw new Error('The submission result is incomplete. Retry the same retained request.');
      pending.current=null;setHasPending(false);setSaved(true);setMessage(replacement?'Replacement submitted for fresh verification. Your previous evidence is retained.':'Change request submitted. Hastabazaar will review this exact document scope.');router.refresh();
    } catch(error) {if(!scope.isCurrent())return;setMessage(error instanceof Error?error.message:'Keep your entries and retry this submission.');}
    finally {if(scope.isCurrent())setBusy(false);}
  }
  if(scope.accessDenied)return <SellerFormAccessChanged/>;
  return <form data-form-id={unverified?'seller.document-correction-upload':replacement?'seller.document-replacement-upload':'seller.document-change-request'} onSubmit={submit} className="space-y-3 rounded-xl border p-4">
    {!saved?<fieldset disabled={busy} className="space-y-3">{replacement?<label className="block space-y-2 text-sm">{unverified?'Corrected evidence file':'Permitted replacement file'}<Input name="document" type="file" required accept="application/pdf,image/jpeg,image/png" /><span>Private PDF, JPG or PNG, up to 5 MB. Uploading does not verify the document.</span></label>
      :<label className="block space-y-2 text-sm">Explain the document change<textarea className="block min-h-24 w-full rounded-lg border bg-background p-3" name="reason" required minLength={10} maxLength={1000} /><span>Describe the exact change. Unrelated verified documents remain locked.</span></label>}
      <Button type="submit">{busy?'Saving…':unverified?'Submit correction for review':replacement?'Submit replacement for review':'Request a document change'}</Button></fieldset>:null}
    {hasPending&&!busy?<p className="text-sm">Retry checks the same submitted request. Keep your entries and selected file here until the result is confirmed.</p>:null}
    <output className="block text-sm" aria-live="polite">{message}</output>
  </form>;
}
