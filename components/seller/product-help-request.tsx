'use client';

import {ProductIntakeQuestionSummary} from './product-intake-questions';

import {useState} from 'react';

import type {ProductWorkspace} from './use-product-intake';

import {ProductIntakePreview} from './product-intake-preview';

export function ProductHelpRequest({workspace,busy,onSend,onCancel,selectedOfferId}:{workspace:ProductWorkspace;selectedOfferId?:string;busy:boolean;onSend:(note:string)=>void;onCancel:()=>void}){

 const [note,setNote]=useState(''),replacing=workspace.case&&(workspace.case.state==='resolved'||workspace.case.versionId!==workspace.versionId);

 return <section aria-label="Product assistance request" className="space-y-5 rounded-2xl border-2 border-primary/35 bg-card p-5"><div><h2 className="font-heading text-2xl">Get help with this product</h2><p className="mt-2 text-sm text-muted-foreground">The team will receive this saved product reference, the ordinary product details, selected offers and attached photos. Your private cost and target profit are excluded.</p><p className="mt-2 text-sm">Missing details and zero photos are welcome for assistance. The first assistance response is due within 24 hours; publication requires a separate review of the actual product facts.</p></div>

  {replacing&&workspace.submitted?<details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Compare the earlier submitted candidate</summary><div className="mt-4"><ProductIntakePreview snapshot={workspace.submitted.snapshot} offer={workspace.submitted.snapshot.offers.offers.find(row=>row.included)} uploads={workspace.uploads}/></div><p className="mt-3 text-sm">{workspace.case?.state==='resolved'?'Sending below starts a new review case under the same product reference. The closed case and its original deadlines remain in history.':'Sending below explicitly replaces that candidate. Its history and the original assistance deadline are retained.'}</p></details>:null}

  {workspace.uploads.some(file=>file.state==='uploading')&&<output className="block rounded border border-amber-400 p-3 text-sm">Unconfirmed uploads are excluded from this send. You can still request assistance with the saved details and add those files after upload recovery.</output>}

  <ProductIntakePreview snapshot={workspace} offer={workspace.offers.offers.find(row=>row.id===selectedOfferId)??workspace.offers.offers.find(row=>row.included)} uploads={workspace.uploads}/>

  <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">All offer information being shared</summary><ul className="mt-3 space-y-3 text-sm">{workspace.offers.offers.map((row,index)=><li key={row.id} className="rounded border p-3"><p className="font-medium">Offer {index+1} · {workspace.offers.axes.map(axis=>axis.values.find(choice=>choice.id===row.selection[axis.id])?.label??'Choice not provided').join(' · ')||'No options'}</p><p>Entered selling price: {row.price||'Not provided'} · Original-price claim: {row.compareAt||'Not provided'}</p><p>Contains {row.unitsPerOffer||'unknown amount'} {row.baseUnit} · Draft quantity: {row.stockIntent||'Not provided'}</p><p>{row.included?'Included':'Excluded'}{row.browseOnly?' · For viewing only':''}</p></li>)}</ul>{!workspace.offers.offers.length&&<p className="mt-2 text-sm">No offer facts provided yet.</p>}</details>

  {Object.values(workspace.privateReview).some(Boolean)&&<details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">References shared for authorized product review</summary><dl className="mt-3 space-y-3 text-sm">{Object.entries(workspace.privateReview).map(([key,value])=><div key={key}><dt className="font-medium">{key==='originEvidenceReference'?'Origin evidence reference':key==='licenceReference'?'Product licence reference':'Product-review note'}</dt><dd className="whitespace-pre-wrap break-words">{value||'Not provided'}</dd></div>)}</dl></details>}

  <ProductIntakeQuestionSummary context={workspace.formContext}/>

  <label className="grid gap-2 text-sm">A note for the team <textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={4000} rows={3} className="rounded-lg border bg-background p-3" placeholder="You can leave this blank. Tell us about the category, photos or details you need help with."/></label>

  <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>onSend(note)} className="min-h-11 rounded-lg bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50">{busy?'Sending…':replacing?'Replace submitted version and send':'Send assistance request'}</button><button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-lg border px-4 py-3">Keep editing</button></div>

 </section>;

}

