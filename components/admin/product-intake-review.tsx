'use client';
import {ProductScopeBoundary,useDenyProductScope} from '@/components/products/product-scope-boundary';
import Image from 'next/image';
import {ProductAccessNotice,ProductOutcomeCheck} from '@/components/products/product-access-notice';

import {ProductPublicationReview} from './product-publication-review';
import {ProductIntakeQuestionSummary} from '@/components/seller/product-intake-questions';

import {useCallback,useRef,useState} from 'react';

import type {getProductIntakeReview} from '@/lib/products/intake-assistance';

import type {IntakeSnapshot} from '@/lib/products/intake-workspace';

import {detailText,productDetailGroups,type CategoryDetailModel,type ProductDetailKey} from '@/lib/products/category-fields';

import {CategoryDetailGroups} from '@/components/seller/category-detail-groups';

import {VariantEditor} from '@/components/seller/variant-editor';

import {ProductIntakePreview} from '@/components/seller/product-intake-preview';

import {usePublicationCommand} from '@/components/products/use-publication-command';
import {useProductScope} from '@/components/products/use-product-scope';

type Review=Awaited<ReturnType<typeof getProductIntakeReview>>;

const button='min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50';

export function ProductIntakeReview(props:Parameters<typeof ProductIntakeReviewBody>[0]){return <ProductScopeBoundary workspace="staff" key={JSON.stringify([props.initial.actorId,props.initial.id])} actorId={props.initial.actorId}><ProductIntakeReviewBody {...props}/></ProductScopeBoundary>;}
function ProductIntakeReviewBody({initial,category,categories}:{initial:Review;category:CategoryDetailModel;categories:readonly {id:string;nameEn:string}[]}){
 const denyProduct=useDenyProductScope();

 const [readerDenied,setReaderDenied]=useState(false),[work,setWork]=useState(initial),[draft,setDraft]=useState<IntakeSnapshot>(initial.snapshot),[sellerMessage,setSellerMessage]=useState(''),[sourceNote,setSourceNote]=useState(''),[comparison,setComparison]=useState<Review|null>(null),[photoOffer,setPhotoOffer]=useState<string|null>(null),[selected,setSelected]=useState(initial.snapshot.offers.offers[0]?.id??'');const offersSection=useRef<HTMLDivElement>(null),responseSection=useRef<HTMLElement>(null);

 const {capture:readCapture,isCurrent:readCurrent}=useProductScope(JSON.stringify([initial.actorId,initial.id]));
 const read=useCallback(async()=>{const current=readCapture();const response=await fetch('/api/admin/product-intakes?caseId='+encodeURIComponent(work.id),{cache:'no-store',headers:{'X-Hastabazaar-Actor':initial.actorId}});if(current()&&[401,403].includes(response.status))denyProduct?.();const data=await response.json() as Review&{error?:string};if(!current())throw new Error('The current Product actor or source changed.');if(!response.ok){if([401,403].includes(response.status)){denyProduct?.();setReaderDenied(true);}throw new Error(data.error??'Current case unavailable. Keep your proposed entries.');}if(data.actorId!==initial.actorId){denyProduct?.();setReaderDenied(true);throw new Error('The signed-in Product account changed. Open this record again.');}setReaderDenied(false);return data;},[readCapture,initial.actorId,work.id,denyProduct]);
 const command=usePublicationCommand('/api/admin/product-intakes','hb:intake-review:'+initial.actorId+':'+initial.id,async current=>{const updated=await read();if(!current()||!readCurrent())return;setWork(updated);setDraft(updated.snapshot);},{kind:'intake_review',sourceId:initial.id,actorId:initial.actorId}),{busy,pending,status,setStatus}=command;
 const offer=draft.offers.offers.find(row=>row.id===selected)??draft.offers.offers.find(row=>row.included)??draft.offers.offers[0];



 async function send(payload:Record<string,unknown>){await command.run(payload,payload.action==='propose'?'The proposed changes are waiting for the owner’s confirmation. The submitted candidate is unchanged.':'The first response and next step are recorded.');}

 function triage(outcome:'needs_information'|'reviewing'){void send({action:'triage',caseId:work.id,versionId:work.versionId,expectedRevision:String(work.revision),requestId:crypto.randomUUID(),outcome,sellerMessage});}

 function propose(){

  const answers=Object.fromEntries([...new Set([...Object.keys(work.snapshot.answers),...Object.keys(draft.answers)])].filter(key=>JSON.stringify(work.snapshot.answers[key as ProductDetailKey])!==JSON.stringify(draft.answers[key as ProductDetailKey])).map(key=>[key,draft.answers[key as ProductDetailKey]??'']));

  const patch={...(Object.keys(answers).length?{answers}:{}),...(work.snapshot.categoryId!==draft.categoryId?{categoryId:draft.categoryId}:{}),...(JSON.stringify(work.snapshot.offers)!==JSON.stringify(draft.offers)?{offers:draft.offers}:{})};

  if(!Object.keys(patch).length){setStatus('No changed facts to propose. Use the first-response controls to explain the next step.');return;}

  void send({action:'propose',caseId:work.id,versionId:work.versionId,expectedRevision:String(work.revision),requestId:crypto.randomUUID(),patch,sourceNote,...(work.activeProposalId?{replaceProposalId:work.activeProposalId}:{})});

 }

 async function compare(){const current=readCapture();try{const updated=await read();if(!current())return;setComparison(updated);setStatus('Compare the current submitted candidate before replacing your proposed entries.');}catch(error){setStatus(error instanceof Error?error.message:'Current case unavailable.');}}

 if(readerDenied||command.accessDenied)return <ProductAccessNotice command={command} onRead={read}/>;
 return <div className="min-w-0 space-y-6"><section className="space-y-3 rounded-xl border bg-card p-5"><h2 className="font-heading text-2xl">{detailText(work.snapshot.answers,'nameEn')||'Incomplete product information'}</h2><p className="text-sm">{work.state.replaceAll('_',' ')} · First assistance response due {new Date(work.triageDueAt).toLocaleString('en-NP')}{work.triagedAt?' · First response recorded':''}</p>{work.reviewDueAt!==null&&<p className="text-sm">First complete-candidate review due {new Date(work.reviewDueAt).toLocaleString('en-NP')}</p>}<p className="text-sm text-muted-foreground">Review the frozen submitted facts. Changes below are proposals for the owner; they do not alter the owner’s draft or publish a listing.</p><button type="button" className={button} disabled={busy} onClick={()=>void compare()}>Compare current case</button></section>

  <ProductIntakePreview snapshot={work.snapshot} offer={work.snapshot.offers.offers.find(row=>row.included)} uploads={work.uploads} caseId={work.id}/><ProductIntakeQuestionSummary context={work.snapshot.formContext}/>

  {comparison&&<section className="space-y-4 rounded-xl border border-amber-400 p-4"><h2 className="font-semibold">Current submitted candidate</h2><ProductIntakePreview snapshot={comparison.snapshot} offer={comparison.snapshot.offers.offers.find(row=>row.included)} uploads={comparison.uploads} caseId={comparison.id}/><button type="button" className={button} disabled={command.blocked} onClick={()=>{setWork(comparison);setDraft(comparison.snapshot);setComparison(null);setStatus('Current case loaded. Reapply only the factual proposals you still intend.');}}>Use current case and clear my proposed edits</button><button type="button" className={button} onClick={()=>setComparison(null)}>Keep my entries for comparison</button></section>}

  <section ref={responseSection} className="space-y-4 rounded-xl border bg-card p-5" aria-label="First assistance response"><h2 className="font-heading text-2xl">Respond to the owner</h2><label className="grid gap-2 text-sm">Information needed or next step<textarea rows={4} maxLength={4000} value={sellerMessage} onChange={event=>setSellerMessage(event.target.value)} disabled={busy} className="w-full rounded-lg border p-3"/></label><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy||!!pending} onClick={()=>triage('needs_information')}>Request the specific missing information</button>{(work.firstCompleteAt===null||work.canReviewProducts)&&<button type="button" className={button} disabled={busy||!!pending} onClick={()=>triage('reviewing')}>Record first response and continue review</button>}</div></section>

  <fieldset disabled={busy||!!pending||work.state==='resolved'} className="min-w-0 space-y-5 rounded-xl border bg-card p-5"><legend className="px-2 font-heading text-2xl">Propose actual factual changes</legend><label className="grid gap-2 text-sm">Proposed category<select className="min-h-11 rounded-lg border p-3" value={draft.categoryId??''} onChange={event=>setDraft(old=>({...old,categoryId:event.target.value||null}))}><option value="">Not established</option>{categories.map(item=><option key={item.id} value={item.id}>{item.nameEn}</option>)}{draft.categoryId&&!categories.some(item=>item.id===draft.categoryId)&&<option value={draft.categoryId}>Saved category needs review</option>}</select></label>

  <CategoryDetailGroups model={(work.categoryModel??category).categoryId===draft.categoryId?(work.categoryModel??category):{...category,categoryId:draft.categoryId,status:'unknown',contract:null,groups:productDetailGroups.map(group=>({...group,recommended:false}))}} onOffers={()=>offersSection.current?.scrollIntoView({behavior:'smooth'})} answers={draft.answers} onChange={(field,value)=>setDraft(old=>({...old,answers:{...old.answers,[field]:value}}))} onHelp={()=>responseSection.current?.scrollIntoView({behavior:'smooth'})}/>

  <div ref={offersSection}><VariantEditor onPhoto={id=>setPhotoOffer(id??null)} value={draft.offers} onChange={set=>setDraft(old=>({...old,offers:set}))} onHelp={()=>responseSection.current?.scrollIntoView({behavior:'smooth'})}/></div>

  {photoOffer&&<section className="space-y-3 rounded border p-3"><h3 className="font-medium">Choose a photo actually shared with this candidate</h3><div className="grid grid-cols-2 gap-3">{work.uploads.filter(file=>file.mimeType.startsWith('image/')).map(file=><button key={file.id} type="button" className="rounded border p-2 text-sm" onClick={()=>{setDraft(old=>({...old,offers:{...old.offers,offers:old.offers.offers.map(row=>row.id===photoOffer?{...row,mediaId:file.id}:row)}}));setPhotoOffer(null);}}><Image data-media-mode="contain" unoptimized width={640} height={480} src={'/api/seller/product-intakes/media/'+encodeURIComponent(file.id)+'?caseId='+encodeURIComponent(work.id)} alt={file.originalName} className="h-28 w-full object-contain"/>{file.originalName}</button>)}</div><p className="text-sm">For another photo, ask the owner to attach the actual file to this saved product reference.</p><button type="button" className={button} onClick={()=>setPhotoOffer(null)}>Keep current offer photo</button></section>}

  {draft.offers.offers.length>0&&<label className="grid gap-2 text-sm">Offer to preview<select className="min-h-11 rounded-lg border p-3" value={offer?.id??''} onChange={event=>setSelected(event.target.value)}>{draft.offers.offers.map((row,index)=><option key={row.id} value={row.id}>Offer {index+1}{row.sku?' · '+row.sku:''}</option>)}</select></label>}<ProductIntakePreview snapshot={draft} offer={offer} uploads={work.uploads} caseId={work.id}/>

  <label className="grid gap-2 text-sm">Where these actual facts came from<textarea rows={3} maxLength={4000} value={sourceNote} onChange={event=>setSourceNote(event.target.value)} className="w-full rounded-lg border p-3" placeholder="Identify the seller’s message, the supplied product evidence or the exact clarification."/></label><button type="button" className={button} onClick={propose}>{work.activeProposalId?'Replace earlier proposal with these changes':'Send these proposed changes to the owner'}</button>

  </fieldset>

  {work.canReviewProducts&&<ProductPublicationReview caseId={work.id} blocked={busy||!!pending} actorId={initial.actorId} onRecorded={async()=>{const current=readCapture(),updated=await read();if(current())setWork(updated);}}/>}
  {work.canReviewProducts&&Object.keys(work.snapshot.privateReview).length>0&&<details className="rounded-xl border p-4"><summary>Private product-review references</summary><dl className="mt-4 space-y-3 text-sm">{Object.entries(work.snapshot.privateReview).map(([key,value])=><div key={key}><dt className="font-medium">{key==='originEvidenceReference'?'Origin evidence reference':key==='licenceReference'?'Product licence reference':'Product-review note'}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl></details>}

  <details className="rounded-xl border p-4"><summary>Retained assistance activity</summary><ol className="mt-4 space-y-3 text-sm">{work.events.map(event=><li key={event.id}>{new Date(event.createdAt).toLocaleString('en-NP')} · {event.kind.replaceAll('_',' ')}{typeof event.detail.sellerMessage==='string'?': '+event.detail.sellerMessage:typeof event.detail.sourceNote==='string'?': '+event.detail.sourceNote:typeof event.detail.note==='string'?': '+event.detail.note:''}</li>)}</ol></details>

  {status&&<div className="rounded-xl border p-4"><output className="block">{status}</output><ProductOutcomeCheck command={command}/>{pending&&<button type="button" className="mt-3 underline" disabled={busy} onClick={()=>void command.retry()}>Retry same staff action</button>}</div>}

 {work.proposals.length>0&&<details className="space-y-3 rounded-xl border p-4"><summary className="cursor-pointer font-medium">Recorded factual proposals and owner responses</summary><ol className="space-y-3 text-sm">{work.proposals.map(proposal=><li key={proposal.id} className="rounded border p-3"><p className="font-medium">{proposal.state} · {new Date(proposal.createdAt).toLocaleString('en-NP')}</p><p className="whitespace-pre-wrap break-words">Source: {proposal.sourceNote}</p>{Object.entries(proposal.patch.answers??{}).map(([key,value])=><p key={key} className="whitespace-pre-wrap break-words">{productDetailGroups.flatMap(group=>group.fields).find(field=>field.key===key)?.label??'Product detail'}: {Array.isArray(value)?value.join(', '):value||'Cleared'}</p>)}{proposal.patch.offers&&<p>Includes proposed offer changes; the retained proposal keeps their exact values.</p>}</li>)}</ol></details>}</div>;

}

