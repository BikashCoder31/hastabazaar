'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import type { ManagedProgramWorkspace } from '@/lib/managed-commerce/program-workspace';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const supplyBaseKeys = ['action', 'productId', 'quantity', 'agreedUnitNpr', 'agreedUnitPaisa', 'agreementVersion', 'agreementLanguage', 'payoutBeneficiaryReference', 'requestId', 'sellerId', 'formVersion', 'customAnswers'];
const transitionBaseKeys = ['action', 'legalName', 'registrationAuthority', 'registrationNumber', 'taxMode', 'taxRegistrationNumber', 'evidenceReferences', 'agreementVersion', 'agreementLanguage', 'requestId', 'sellerId', 'formVersion', 'customAnswers'];

function Input({label,name,type='text',required=true}:{label:string;name:string;type?:string;required?:boolean}){
 return <label className="block text-sm font-medium">{label}<input name={name} type={type} required={required} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>;
}

type WorkspaceProps = {workspace:ManagedProgramWorkspace;sellerId:string};

export function SellerManagedProgramWorkspace(props:WorkspaceProps){
 if(props.workspace.participationRoute!=='managed_maker')return null;
 return <ManagedProgramForms {...props}/>;
}

function ManagedProgramForms({workspace,sellerId}:WorkspaceProps){
 const router=useRouter();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const supply=usePublishedFormConfig('seller.managed-supply-proposal');
 const transition=usePublishedFormConfig('seller.managed-transition-request');
 const supplyAttemptKey=sessionAttemptKey('seller.managed-supply-proposal',sellerId);
 const transitionAttemptKey=sessionAttemptKey('seller.managed-transition-request',sellerId);
 const [pendingSupply,setPendingSupply]=useState(false);
 const [pendingTransition,setPendingTransition]=useState(false);
 useEffect(()=>{
  const timeout=window.setTimeout(()=>{
   setPendingSupply(hasSessionAttempt(supplyAttemptKey));
   setPendingTransition(hasSessionAttempt(transitionAttemptKey));
  },0);
  return ()=>window.clearTimeout(timeout);
 },[supplyAttemptKey,transitionAttemptKey]);
 function resetAttempt(kind:'supply'|'transition'){
  const attemptKey=kind==='supply'?supplyAttemptKey:transitionAttemptKey;
  if(!window.confirm(`A previous managed ${kind} action may already have succeeded. Check its history first. Starting a new attempt can create a duplicate ${kind} record. Start a new attempt anyway?`))return;
  try{sessionStorage.removeItem(attemptKey);}
  catch{setMessage('Browser session storage is unavailable. Please enable it before submitting.');return;}
  if(kind==='supply')setPendingSupply(false);else setPendingTransition(false);
  setMessage(`New managed ${kind} attempt ready.`);
 }
 async function send(event:React.SyntheticEvent<HTMLFormElement>,action:'propose_fixed_supply'|'request_registered_transition'){
  event.preventDefault();
  const catalog=action==='propose_fixed_supply'?supply:transition;
  if(busy||!catalog.canSubmit||!catalog.config)return;
  const element=event.currentTarget;
  const baseKeys=action==='propose_fixed_supply'?supplyBaseKeys:transitionBaseKeys;
  setBusy(true);setMessage('');
  try{
   const configured=readConfiguredSubmission(element,catalog.config,baseKeys);
   const form=new FormData(element);
   const body=Object.fromEntries([...form.entries()].filter(([key])=>key!=='formVersion'&&!key.startsWith('custom.'))) as Record<string,unknown>;
   if(action==='propose_fixed_supply'){
    body.quantity=Number(body.quantity);body.agreedUnitNpr=Number(body.agreedUnitNpr);
    body.agreedUnitPaisa=Math.round(Number(body.agreedUnitNpr)*100);
   }
   const attemptKey=action==='propose_fixed_supply'?supplyAttemptKey:transitionAttemptKey;
   const requestId=getOrCreateSessionAttempt(attemptKey);
   if(action==='propose_fixed_supply')setPendingSupply(true);else setPendingTransition(true);
   const response=await fetch('/api/seller/managed-program',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,action,requestId,...configuredJsonPayload(catalog.config,configured.answers,baseKeys)})});
   const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error??'Action failed.');
   clearSessionAttempt(attemptKey);
   if(action==='propose_fixed_supply')setPendingSupply(false);else setPendingTransition(false);
   setMessage('Simulated staging record saved.');element.reset();router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:'Action failed.');}finally{setBusy(false);}
 }
 return <section className="space-y-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:bg-amber-950/20">
  <div><p className="eyebrow">Local staging simulation</p><h2 className="font-heading text-2xl">Managed Maker program</h2><p className="mt-2 text-sm leading-6">These controls create fictional test records only. They do not approve live supplier, title, risk, tax, or payment terms.</p></div>
  {workspace.commercialModel==='managed_fixed_supplier_price_v1'?<form data-form-id="seller.managed-supply-proposal" className="grid gap-3 sm:grid-cols-2" onSubmit={(event)=>void send(event,'propose_fixed_supply')}>
   <label className="block text-sm font-medium">Product<select name="productId" required className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">Select product</option>{workspace.products.map(product=><option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
   <Input label="Quantity offered" name="quantity" type="number"/><Input label="Agreed unit supplier price (NPR)" name="agreedUnitNpr" type="number"/><Input label="Simulated agreement version" name="agreementVersion"/><Input label="Simulated payout beneficiary" name="payoutBeneficiaryReference"/>
   <label className="block text-sm font-medium">Language presented<select name="agreementLanguage" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="ne">Nepali</option><option value="en">English</option></select></label>
   {supply.config?<div className="sm:col-span-2"><ConfiguredFields config={supply.config} baseKeys={supplyBaseKeys}/></div>:null}
   {supply.status!=='ready'?<p role="alert" className="sm:col-span-2 text-sm text-destructive">{supply.message||'Form configuration is unavailable. Please try again.'}</p>:null}
   <div className="sm:col-span-2 flex flex-wrap gap-3"><Button type="submit" disabled={busy||!supply.canSubmit||workspace.products.length===0}>Propose documented test supply</Button>
    {pendingSupply?<Button type="button" variant="outline" disabled={busy} onClick={()=>resetAttempt('supply')}>Start a new managed supply attempt</Button>:null}</div>
  </form>:null}
  {workspace.supplies.length?<div className="space-y-2"><h3 className="font-semibold">Supply history</h3>{workspace.supplies.map(supply=><p key={supply.id} className="rounded-lg border bg-background p-3 text-sm"><span className="font-semibold">{supply.productName}</span> · {supply.quantityProposed} × NPR {(supply.agreedUnitPaisa/100).toFixed(2)} · {supply.status.replaceAll('_',' ')}</p>)}</div>:null}
  <details className="rounded-lg border bg-background p-4"><summary className="cursor-pointer font-semibold">Apply to transition to Registered Seller</summary><form data-form-id="seller.managed-transition-request" className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event)=>void send(event,'request_registered_transition')}>
   <Input label="Registered legal name" name="legalName"/><Input label="Registration authority" name="registrationAuthority"/><Input label="Registration number" name="registrationNumber"/>
   <label className="block text-sm font-medium">Tax status<select name="taxMode" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="PAN">Business PAN</option><option value="VAT">VAT registration</option><option value="BOTH">PAN and VAT status</option></select></label>
   <Input label="Applicable PAN/VAT identifier" name="taxRegistrationNumber"/><Input label="Simulated agreement version" name="agreementVersion"/>
   <label className="block text-sm font-medium">Language presented<select name="agreementLanguage" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="ne">Nepali</option><option value="en">English</option></select></label>
   <label className="block text-sm font-medium sm:col-span-2">Private evidence references, one per line<textarea name="evidenceReferences" required rows={3} className="mt-1 w-full rounded-md border bg-background p-3"/></label>
   {transition.config?<div className="sm:col-span-2"><ConfiguredFields config={transition.config} baseKeys={transitionBaseKeys}/></div>:null}
   {transition.status!=='ready'?<p role="alert" className="sm:col-span-2 text-sm text-destructive">{transition.message||'Form configuration is unavailable. Please try again.'}</p>:null}
   <div className="sm:col-span-2 flex flex-wrap gap-3"><Button type="submit" disabled={busy||!transition.canSubmit}>Submit simulated transition application</Button>
    {pendingTransition?<Button type="button" variant="outline" disabled={busy} onClick={()=>resetAttempt('transition')}>Start a new managed transition attempt</Button>:null}</div>
  </form></details>
  {workspace.transitions.length?<div className="space-y-2"><h3 className="font-semibold">Transition history</h3>{workspace.transitions.map(item=><p key={item.id} className="rounded-lg border bg-background p-3 text-sm"><span className="font-semibold">{item.legalName}</span> · {item.taxMode} · {item.status.replaceAll('_',' ')}{item.reviewReason?` · ${item.reviewReason}`:''}</p>)}</div>:null}
  <output aria-live="polite" className="block text-sm font-medium">{message}</output>
 </section>;
}
