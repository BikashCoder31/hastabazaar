'use client';
import { useEffect,useState,useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig,parsePublishedFormConfig } from '@/components/forms/form-config-client';
import { digestMultipartRequest } from '@/lib/forms/client-submission';
import type { PublishedFormConfig } from '@/lib/forms/types';
import { registeredTransitionFormId,registeredTransitionKeys } from '@/lib/managed-commerce/transition-contract';
import type { RegisteredSellerTerms } from '@/lib/db/repositories/marketplace-settings';

interface Transition {id:string;status:string;version:number;legalName:string;registrationAuthority:string;registrationNumber:string;taxMode:string;taxRegistrationNumber:string;payoutAccountReference?:string|null;reviewReason:string|null;effectiveAt:number|null}
interface Workspace {sellerId:string;route:string;stage:string;terms:RegisteredSellerTerms;documents:{id:string;kind:string;name:string;status:string}[];transitions:Transition[]}
interface Attempt {requestId:string;digest:string;config:PublishedFormConfig;terms:RegisteredSellerTerms;fields:[string,string][];files:string[]}
export function RegisteredTransitionForm({sellerId,ownerId}:{sellerId:string;ownerId:string}) {
  const router=useRouter();const catalog=usePublishedFormConfig(registeredTransitionFormId);
  const [workspace,setWorkspace]=useState<Workspace|null>(null);const [pending,setPending]=useState<Attempt|null>(null);
  const [loaded,setLoaded]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');const [reload,setReload]=useState(0);
  const [taxMode,setTaxMode]=useState('PAN');
  const formRef=useRef<HTMLFormElement>(null);
  const storageKey=`hastabazaar:registered-transition:${encodeURIComponent(ownerId)}:${encodeURIComponent(sellerId)}`;
  useEffect(()=>{
    const controller=new AbortController();
    Promise.resolve().then(async()=>{
      if(!controller.signal.aborted){setLoaded(false);setError('');}
      const raw=sessionStorage.getItem(storageKey);
      if(raw) {
        if(raw.length>524288)throw new Error('The saved attempt is too large. Check transition history before clearing it.');
        const value=JSON.parse(raw) as Attempt;
        if(!/^[a-f0-9-]{36}$/.test(value.requestId)||!/^[a-f0-9]{64}$/.test(value.digest)||!value.terms?.context||!Array.isArray(value.fields)||
          value.fields.some(entry=>!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||typeof entry[1]!=='string')||
          !Array.isArray(value.files)||value.files.some(field=>!['businessRegistration','panCertificate','vatCertificate','bankVerification'].includes(field))||
          !parsePublishedFormConfig(registeredTransitionFormId,{config:value.config}))throw new Error('The saved attempt cannot be read. Check history before clearing it.');
        if(!controller.signal.aborted){setPending(value);setTaxMode(value.fields.find(([key])=>key==='taxMode')?.[1]??'PAN');}
      }
      const response=await fetch('/api/seller-applications/transition',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      const result=await response.json() as Workspace&{error?:string};
      if(!response.ok||result.sellerId!==sellerId||!result.terms?.context||!Array.isArray(result.transitions)||!Array.isArray(result.documents))throw new Error(result.error??'Transition details are unavailable.');
      if(!controller.signal.aborted){setWorkspace(result);if(!raw)setTaxMode(result.transitions.find(item=>item.status==='changes_requested')?.taxMode??'PAN');setLoaded(true);}
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Transition details are unavailable.');});
    return ()=>controller.abort();
  },[sellerId,storageKey,reload]);
  const open=workspace?.transitions.find(item=>['submitted','under_review','scheduled','changes_requested'].includes(item.status));
  const correction=open?.status==='changes_requested'?open:null;
  const config=pending?.config??catalog.config;
  const presentedTerms=pending?.terms??workspace?.terms;
  useEffect(()=>{
    if(!pending||!formRef.current)return;
    const values=new FormData();for(const [key,value] of pending.fields)values.append(key,value);
    for(const control of formRef.current.elements) {
      if(!(control instanceof HTMLInputElement||control instanceof HTMLSelectElement||control instanceof HTMLTextAreaElement)||control.type==='file'||!values.has(control.name))continue;
      if(control instanceof HTMLInputElement&&control.type==='checkbox')control.checked=values.getAll(control.name).includes(control.value);
      else if(control instanceof HTMLSelectElement&&control.multiple)for(const option of control.options)option.selected=values.getAll(control.name).includes(option.value);
      else {const value=values.get(control.name);control.value=typeof value==='string'?value:'';}
    }
  },[pending,loaded]);
  const canStart=workspace?.route==='managed_maker'&&workspace.stage==='active'&&(!open||Boolean(correction));
  const original=(name:string,fallback='')=>pending?.fields.find(([key])=>key===name)?.[1]??fallback;
  async function submit(event:{preventDefault():void;currentTarget:HTMLFormElement}) {
    event.preventDefault();if(busy||!loaded||!workspace||!config||error||!pending&&!catalog.canSubmit)return;
    setBusy(true);setMessage('');
    try {
      const data=new FormData(event.currentTarget);
      const requestId=pending?.requestId??crypto.randomUUID();data.set('requestId',requestId);
      const digest=await digestMultipartRequest(data);
      if(pending&&digest!==pending.digest)throw new Error('Reselect the original files and keep the saved details unchanged to retry. Check history before starting another attempt.');
      if(!pending){
        const attempt:Attempt={requestId,digest,config,terms:workspace.terms,fields:[],files:[]};
        for(const [key,value] of data)if(typeof value==='string')attempt.fields.push([key,value]);else if(value.size)attempt.files.push(key);
        const raw=JSON.stringify(attempt);sessionStorage.setItem(storageKey,raw);if(sessionStorage.getItem(storageKey)!==raw)throw new Error('The request could not be retained safely.');setPending(attempt);
      }
      const response=await fetch('/api/seller-applications/transition',{method:'POST',credentials:'same-origin',body:data});
      const result=await response.json() as {ok?:boolean;id?:string;requestId?:string;sellerId?:string;simulation?:boolean;error?:string};
      if(!response.ok)throw new Error(result.error??'The transition could not be submitted.');
      if(result.ok!==true||typeof result.id!=='string'||result.requestId!==requestId||result.sellerId!==sellerId||result.simulation!==true)throw new Error('The response could not be verified. Retry the same original request.');
      sessionStorage.removeItem(storageKey);setPending(null);setMessage('Transition saved for independent review. Your company-store route stays active until the reviewed transition takes effect.');setReload(value=>value+1);router.refresh();
    }catch(cause){setMessage(cause instanceof Error?cause.message:'The result is uncertain. Retry the original request.');}
    finally{setBusy(false);}
  }
  return <section id="registered-transition" className="min-w-0 scroll-mt-6 space-y-4 rounded-2xl border bg-card p-5">
    <h2 className="font-heading text-2xl">Become a Registered Seller</h2>
    <p className="text-sm">When your business registration and PAN or VAT are ready, submit private certificates and accept the current seller terms. A different Super Admin reviews the request. Earlier company-store orders and payments keep their original terms.</p>
    {!loaded&&!error?<output className="block">Loading transition details…</output>:null}
    {error?<p role="alert">{error} <button type="button" className="underline" onClick={()=>setReload(value=>value+1)}>Reload details</button></p>:null}
    {workspace?.route==='registered_seller'?<Link className="section-link" href="/seller">Open your seller dashboard</Link>:null}
    {workspace?.transitions.length?<><p className="text-xs text-muted-foreground">Latest 50 transition requests.</p><ul className="space-y-2 text-sm">{workspace.transitions.map(item=><li key={item.id} className="rounded-lg border p-3"><strong>{item.legalName}</strong> · {item.status.replaceAll('_',' ')} · version {item.version}{item.effectiveAt?` · ${new Date(item.effectiveAt).toLocaleString('en-GB',{timeZone:'Asia/Kathmandu'})} Nepal time`:''}{item.reviewReason?<p className="mt-1">{item.reviewReason}</p>:null}<Link className="mt-2 inline-block underline" href={`/sell/application/transitions/${encodeURIComponent(item.id)}`}>Open your original agreements and form answers</Link></li>)}</ul></>:null}
    {workspace&&(canStart||pending)&&config?<form ref={formRef} key={pending?.requestId??correction?.id??'new'} data-form-id="seller.managed-transition-request" onSubmit={submit} className="min-w-0 space-y-4">
      <input type="hidden" name="action" value={original('action',correction?'resubmit':'submit')}/>
      {correction||pending?.fields.some(([key])=>key==='applicationId')?<><input type="hidden" name="applicationId" value={original('applicationId',correction?.id)}/><input type="hidden" name="expectedVersion" value={original('expectedVersion',String(correction?.version??''))}/></>:null}
      <div className="grid gap-4 sm:grid-cols-2">{[['legalName','Registered legal name'],['registrationAuthority','Registration authority'],['registrationNumber','Registration number'],['taxRegistrationNumber','PAN or VAT identifier']].map(([name,label])=><label key={name} className="block text-sm">{label}<input name={name} required maxLength={191} readOnly={Boolean(pending)} defaultValue={original(name,correction?.[name as 'legalName']??'')} className="mt-1 w-full rounded-md border bg-background p-2"/></label>)}</div>
      <label className="block text-sm">Tax status<select name="taxMode" value={taxMode} onChange={event=>{if(!pending)setTaxMode(event.target.value);}} className="mt-1 w-full rounded-md border bg-background p-2"><option value="PAN">Business PAN</option><option value="VAT">VAT</option><option value="BOTH">PAN and VAT</option></select></label>
      <label className="block text-sm">Receiving-account reference<input name="payoutAccountReference" required minLength={4} maxLength={200} readOnly={Boolean(pending)} defaultValue={original('payoutAccountReference',correction?.payoutAccountReference??'')} className="mt-1 w-full rounded-md border bg-background p-2"/><span className="mt-1 block text-muted-foreground">It must match your private receiving-account evidence. Super Admin must verify it before the change. The accepted seller agreement is kept as your written settlement reference.</span></label>
      <div className="grid gap-4 sm:grid-cols-2">{[['businessRegistration','business_registration','Business registration certificate (including sole proprietors)'],['bankVerification','bank_verification','Receiving-account evidence'],...(taxMode!=='VAT'?[['panCertificate','pan_certificate','Business PAN certificate']]:[]),...(taxMode!=='PAN'?[['vatCertificate','vat_certificate','VAT certificate']]:[])].map(([field,kind,label])=><fieldset key={field} className="min-w-0 space-y-2 rounded-lg border p-3"><legend className="text-sm font-medium">{label}</legend>
        <label className="block text-sm">Use a saved private certificate<select name={`${field}Id`} defaultValue={original(`${field}Id`)} className="mt-1 w-full rounded-md border bg-background p-2" onChange={event=>{if(pending)event.target.value=original(`${field}Id`);}}><option value="">Upload a file below</option>{workspace.documents.filter(document=>document.kind===kind&&document.status!=='rejected').map(document=><option value={document.id} key={document.id}>{document.name} · {document.status}</option>)}</select></label>
        <label className="block text-sm">Or upload a private certificate<input name={field} type="file" accept="application/pdf,image/jpeg,image/png" className="mt-1 w-full min-w-0 text-sm"/></label><p className="text-xs text-muted-foreground">PDF, JPG or PNG, up to 5 MB. Choose one saved file or one upload.</p>
      </fieldset>)}</div>
      <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">Read the English Registered Seller agreement · {presentedTerms?.percent}% commission</summary><div className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm">{presentedTerms?.document}</div></details>
      <input type="hidden" name="registeredTermsContext" value={original('registeredTermsContext',workspace.terms.context)}/><input type="hidden" name="agreementVersion" value={original('agreementVersion',workspace.terms.agreementVersion)}/><input type="hidden" name="agreementLanguage" value="en"/>
      <label className="flex items-start gap-2 text-sm"><input name="acceptedTerms" type="checkbox" value="yes" required defaultChecked={Boolean(pending)} aria-label="I accept the displayed English seller agreement and commission terms"/>I accept the displayed English seller agreement and commission terms.</label>
      <ConfiguredFields config={config} baseKeys={registeredTransitionKeys}/>
      {pending?<p className="text-sm">A recorded request is pending. Its original fields and form version are retained. Reselect the original uploads if needed. Current seller terms may have changed; check history before starting again.</p>:null}
      <button type="submit" disabled={busy||Boolean(error)||!loaded||!pending&&!catalog.canSubmit} className="rounded-md border px-4 py-2 disabled:opacity-50">{busy?'Checking request…':pending?'Retry original transition request':correction?'Send corrected transition for review':'Submit transition for review'}</button>
    </form>:null}
    {pending?<button type="button" disabled={busy} className="text-sm underline" onClick={()=>{if(!window.confirm('Check transition history first. The previous request may already have succeeded. Clearing this local retry record does not cancel it. Continue?'))return;sessionStorage.removeItem(storageKey);setPending(null);setReload(value=>value+1);}}>Check history, then start a new transition attempt</button>:null}
    {loaded&&canStart&&!config?<p role="alert">{catalog.message||'The transition form is loading.'} <button type="button" onClick={catalog.refresh} className="underline">Reload form</button></p>:null}
    {message?<output className="block text-sm">{message}</output>:null}
  </section>;
}
