'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import type { ManagedProgramWorkspace } from '@/lib/managed-commerce/program-workspace';

function Input({label,name,type='text',required=true}:{label:string;name:string;type?:string;required?:boolean}){
 return <label className="block text-sm font-medium">{label}<input name={name} type={type} required={required} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label>;
}

export function SellerManagedProgramWorkspace({workspace}:{workspace:ManagedProgramWorkspace}){
 const router=useRouter();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function send(event:React.SyntheticEvent<HTMLFormElement>,action:string){event.preventDefault();setBusy(true);setMessage('');const form=new FormData(event.currentTarget);const body=Object.fromEntries(form.entries()) as Record<string,unknown>;if(action==='propose_fixed_supply')body.agreedUnitPaisa=Math.round(Number(body.agreedUnitNpr)*100);try{const response=await fetch('/api/seller/managed-program',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,action,requestId:crypto.randomUUID()})});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error??'Action failed.');setMessage('Simulated staging record saved.');event.currentTarget.reset();router.refresh();}catch(error){setMessage(error instanceof Error?error.message:'Action failed.');}finally{setBusy(false);}}
 if(workspace.participationRoute!=='managed_maker')return null;
 return <section className="space-y-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:bg-amber-950/20">
  <div><p className="eyebrow">Local staging simulation</p><h2 className="font-heading text-2xl">Managed Maker program</h2><p className="mt-2 text-sm leading-6">These controls create fictional test records only. They do not approve live supplier, title, risk, tax, or payment terms.</p></div>
  {workspace.commercialModel==='managed_fixed_supplier_price_v1'?<form className="grid gap-3 sm:grid-cols-2" onSubmit={(event)=>send(event,'propose_fixed_supply')}>
   <label className="block text-sm font-medium">Product<select name="productId" required className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">Select product</option>{workspace.products.map(product=><option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
   <Input label="Quantity offered" name="quantity" type="number"/><Input label="Agreed unit supplier price (NPR)" name="agreedUnitNpr" type="number"/><Input label="Simulated agreement version" name="agreementVersion"/><Input label="Simulated payout beneficiary" name="payoutBeneficiaryReference"/>
   <label className="block text-sm font-medium">Language presented<select name="agreementLanguage" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="ne">Nepali</option><option value="en">English</option></select></label>
   <div className="sm:col-span-2"><Button disabled={busy||workspace.products.length===0}>Propose documented test supply</Button></div>
  </form>:null}
  {workspace.supplies.length?<div className="space-y-2"><h3 className="font-semibold">Supply history</h3>{workspace.supplies.map(supply=><p key={supply.id} className="rounded-lg border bg-background p-3 text-sm"><span className="font-semibold">{supply.productName}</span> · {supply.quantityProposed} × NPR {(supply.agreedUnitPaisa/100).toFixed(2)} · {supply.status.replaceAll('_',' ')}</p>)}</div>:null}
  <details className="rounded-lg border bg-background p-4"><summary className="cursor-pointer font-semibold">Apply to transition to Registered Seller</summary><form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event)=>send(event,'request_registered_transition')}>
   <Input label="Registered legal name" name="legalName"/><Input label="Registration authority" name="registrationAuthority"/><Input label="Registration number" name="registrationNumber"/>
   <label className="block text-sm font-medium">Tax status<select name="taxMode" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="PAN">Business PAN</option><option value="VAT">VAT registration</option><option value="BOTH">PAN and VAT status</option></select></label>
   <Input label="Applicable PAN/VAT identifier" name="taxRegistrationNumber"/><Input label="Simulated agreement version" name="agreementVersion"/>
   <label className="block text-sm font-medium">Language presented<select name="agreementLanguage" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="ne">Nepali</option><option value="en">English</option></select></label>
   <label className="block text-sm font-medium sm:col-span-2">Private evidence references, one per line<textarea name="evidenceReferences" required rows={3} className="mt-1 w-full rounded-md border bg-background p-3"/></label>
   <div className="sm:col-span-2"><Button disabled={busy}>Submit simulated transition application</Button></div>
  </form></details>
  {workspace.transitions.length?<div className="space-y-2"><h3 className="font-semibold">Transition history</h3>{workspace.transitions.map(item=><p key={item.id} className="rounded-lg border bg-background p-3 text-sm"><span className="font-semibold">{item.legalName}</span> · {item.taxMode} · {item.status.replaceAll('_',' ')}{item.reviewReason?` · ${item.reviewReason}`:''}</p>)}</div>:null}
  <output aria-live="polite" className="block text-sm font-medium">{message}</output>
 </section>;
}
