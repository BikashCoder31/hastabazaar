'use client';
import {ProductScopeBoundary,useDenyProductScope} from '@/components/products/product-scope-boundary';
import Image from 'next/image';
import {CircleHelp,TriangleAlert} from 'lucide-react';
import {CatalogProductPhoto} from '@/app/admin/products/intakes/catalog-product-photo';
import {describeRetainedHelp} from '@/app/admin/products/intakes/retained-help';
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
import {productPreviewPath} from '@/lib/products/preview-path';

import {usePublicationCommand} from '@/components/products/use-publication-command';
import {useProductScope} from '@/components/products/use-product-scope';

type Review=Awaited<ReturnType<typeof getProductIntakeReview>>;

const button='min-h-11 max-w-full rounded-lg border px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A8232E] disabled:opacity-50';
const yesNoFields=new Set<ProductDetailKey>(['fitDependent','activeDevice','warrantyOffered','madeToOrder','returnEligible']);

export function ProductIntakeReview(props:Parameters<typeof ProductIntakeReviewBody>[0]){return <ProductScopeBoundary workspace="staff" key={JSON.stringify([props.initial.actorId,props.initial.id])} actorId={props.initial.actorId}><ProductIntakeReviewBody {...props}/></ProductScopeBoundary>;}
function ProductIntakeReviewBody({initial,category,categories,sellerName,onRecorded}:{sellerName?:string;onRecorded?:()=>void;initial:Review;category:CategoryDetailModel;categories:readonly {id:string;nameEn:string}[]}){
 const denyProduct=useDenyProductScope();

 const [readerDenied,setReaderDenied]=useState(false),[work,setWork]=useState(initial),[draft,setDraft]=useState<IntakeSnapshot>(initial.snapshot),[sellerMessage,setSellerMessage]=useState(''),[sourceNote,setSourceNote]=useState(''),[comparison,setComparison]=useState<Review|null>(null),[photoOffer,setPhotoOffer]=useState<string|null>(null),[selected,setSelected]=useState(initial.snapshot.offers.offers[0]?.id??'');const offersSection=useRef<HTMLDivElement>(null),responseSection=useRef<HTMLElement>(null),detailsSection=useRef<HTMLDetailsElement>(null),sourceSection=useRef<HTMLDetailsElement>(null),questionSection=useRef<HTMLDetailsElement>(null),sourceInput=useRef<HTMLTextAreaElement>(null),questionInput=useRef<HTMLTextAreaElement>(null);

 const {capture:readCapture,isCurrent:readCurrent}=useProductScope(JSON.stringify([initial.actorId,initial.id]));
 const read=useCallback(async()=>{const current=readCapture();const response=await fetch('/api/admin/product-intakes?caseId='+encodeURIComponent(work.id),{cache:'no-store',headers:{'X-Hastabazaar-Actor':initial.actorId}});if(current()&&[401,403].includes(response.status))denyProduct?.();const data=await response.json() as Review&{error?:string};if(!current())throw new Error('The current Product actor or source changed.');if(!response.ok){if([401,403].includes(response.status)){denyProduct?.();setReaderDenied(true);}throw new Error(data.error??'Current case unavailable. Keep your proposed entries.');}if(data.actorId!==initial.actorId){denyProduct?.();setReaderDenied(true);throw new Error('The signed-in Product account changed. Open this record again.');}setReaderDenied(false);return data;},[readCapture,initial.actorId,work.id,denyProduct]);
 const command=usePublicationCommand('/api/admin/product-intakes','hb:intake-review:'+initial.actorId+':'+initial.id,async current=>{const updated=await read();if(!current()||!readCurrent())return;setWork(updated);setDraft(updated.snapshot);onRecorded?.();},{kind:'intake_review',sourceId:initial.id,actorId:initial.actorId}),{busy,pending,status,setStatus}=command;
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
  const submittedQuestion=describeRetainedHelp(work.events.find(event=>event.kind==='received')?.detail);
  const canRespond=!busy&&!pending&&work.state!=='resolved';
  const detailsFields=(work.categoryModel??category).groups.flatMap(group=>group.fields);
  const selectedOffer=draft.offers.offers.find(row=>row.included);
  const setAnswer=(key:ProductDetailKey,value:string)=>setDraft(old=>({...old,answers:{...old.answers,[key]:value}}));
  const openResponse=(question:boolean)=>{
   if(questionSection.current)questionSection.current.open=true;
   if(question)questionInput.current?.focus();
  };
  const openDetails=()=>{
   if(detailsSection.current)detailsSection.current.open=true;
   offersSection.current?.scrollIntoView({block:'start'});
  };
  const preview=work.canReviewProducts&&work.state!=='resolved'?<a href={productPreviewPath(work.id,'case')} className={button+' inline-flex items-center text-sm font-semibold'}>Open preview</a>:null;
  const outcome=status&&<div className="rounded-xl border p-4"><output className="block">{status}</output><ProductOutcomeCheck command={command}/>{pending&&<button type="button" className="mt-3 min-h-11 underline" disabled={busy} onClick={()=>void command.retry()}>Retry same staff action</button>}</div>;
  const assistanceDetails=<>
 <section className="space-y-3 rounded-xl border bg-card p-5"><h2 className="font-heading text-2xl">{detailText(work.snapshot.answers,'nameEn')||'Incomplete product information'}</h2><p className="text-sm">{work.state.replaceAll('_',' ')} · First assistance response due {new Date(work.triageDueAt).toLocaleString('en-NP')}{work.triagedAt?' · First response recorded':''}</p>{work.reviewDueAt!==null&&<p className="text-sm">First complete-candidate review due {new Date(work.reviewDueAt).toLocaleString('en-NP')}</p>}<p className="text-sm text-muted-foreground">Review the frozen submitted facts. Changes below are proposals for the owner; they do not alter the owner’s draft or publish a listing.</p><button type="button" className={button} disabled={busy} onClick={()=>void compare()}>Compare current case</button></section>

  {work.canReviewProducts&&(sellerName===undefined||work.firstCompleteAt!==null)&&<ProductPublicationReview caseId={work.id} blocked={busy||!!pending} actorId={initial.actorId} onRecorded={async()=>{const current=readCapture(),updated=await read();if(current())setWork(updated);}}/>}
  <ProductIntakePreview snapshot={work.snapshot} offer={work.snapshot.offers.offers.find(row=>row.included)} uploads={work.uploads} caseId={work.id}/><ProductIntakeQuestionSummary context={work.snapshot.formContext}/>

  {comparison&&<section className="space-y-4 rounded-xl border border-amber-400 p-4"><h2 className="font-semibold">Current submitted candidate</h2><ProductIntakePreview snapshot={comparison.snapshot} offer={comparison.snapshot.offers.offers.find(row=>row.included)} uploads={comparison.uploads} caseId={comparison.id}/><button type="button" className={button} disabled={command.blocked} onClick={()=>{setWork(comparison);setDraft(comparison.snapshot);setComparison(null);setStatus('Current case loaded. Reapply only the factual proposals you still intend.');}}>Use current case and clear my proposed edits</button><button type="button" className={button} onClick={()=>setComparison(null)}>Keep my entries for comparison</button></section>}

  <section ref={responseSection} className="space-y-4 rounded-xl border bg-card p-5" aria-label="First assistance response"><h2 className="font-heading text-2xl">Respond to the owner</h2><label className="grid gap-2 text-sm">Information needed or next step<textarea rows={4} maxLength={4000} value={sellerMessage} onChange={event=>setSellerMessage(event.target.value)} disabled={busy} className="w-full rounded-lg border p-3"/></label><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy||!!pending} onClick={()=>triage('needs_information')}>Request the specific missing information</button>{(work.firstCompleteAt===null||work.canReviewProducts)&&<button type="button" className={button} disabled={busy||!!pending} onClick={()=>triage('reviewing')}>Record first response and continue review</button>}</div></section>

  <fieldset disabled={busy||!!pending||work.state==='resolved'} className="min-w-0 space-y-5 rounded-xl border bg-card p-5"><legend className="px-2 font-heading text-2xl">Propose actual factual changes</legend><label className="grid gap-2 text-sm">Proposed category<select className="min-h-11 rounded-lg border p-3" value={draft.categoryId??''} onChange={event=>setDraft(old=>({...old,categoryId:event.target.value||null}))}><option value="">Not established</option>{categories.map(item=><option key={item.id} value={item.id}>{item.nameEn}</option>)}{draft.categoryId&&!categories.some(item=>item.id===draft.categoryId)&&<option value={draft.categoryId}>Saved category needs review</option>}</select></label>

  <CategoryDetailGroups model={(work.categoryModel??category).categoryId===draft.categoryId?(work.categoryModel??category):{...category,categoryId:draft.categoryId,status:'unknown',contract:null,groups:productDetailGroups.map(group=>({...group,recommended:false}))}} onOffers={()=>offersSection.current?.scrollIntoView({behavior:'smooth'})} answers={draft.answers} onChange={(field,value)=>setDraft(old=>({...old,answers:{...old.answers,[field]:value}}))} onHelp={()=>responseSection.current?.scrollIntoView({behavior:'smooth'})}/>

  <div ref={offersSection}><VariantEditor onPhoto={id=>setPhotoOffer(id??null)} value={draft.offers} onChange={set=>setDraft(old=>({...old,offers:set}))} onHelp={()=>responseSection.current?.scrollIntoView({behavior:'smooth'})}/></div>

  {photoOffer&&<section className="space-y-3 rounded border p-3"><h3 className="font-medium">Choose a photo actually shared with this candidate</h3><div className="grid grid-cols-2 gap-3">{work.uploads.filter(file=>file.mimeType.startsWith('image/')).map(file=><button key={file.id} type="button" className="rounded border p-2 text-sm" onClick={()=>{setDraft(old=>({...old,offers:{...old.offers,offers:old.offers.offers.map(row=>row.id===photoOffer?{...row,mediaId:file.id}:row)}}));setPhotoOffer(null);}}><Image data-media-mode="contain" unoptimized width={640} height={480} src={'/api/seller/product-intakes/media/'+encodeURIComponent(file.id)+'?caseId='+encodeURIComponent(work.id)} alt={file.originalName} className="h-28 w-full object-contain"/>{file.originalName}</button>)}</div><p className="text-sm">For another photo, ask the owner to attach the actual file to this saved product reference.</p><button type="button" className={button} onClick={()=>setPhotoOffer(null)}>Keep current offer photo</button></section>}

  {draft.offers.offers.length>0&&<label className="grid gap-2 text-sm">Offer to preview<select className="min-h-11 rounded-lg border p-3" value={offer?.id??''} onChange={event=>setSelected(event.target.value)}>{draft.offers.offers.map((row,index)=><option key={row.id} value={row.id}>Offer {index+1}{row.sku?' · '+row.sku:''}</option>)}</select></label>}<ProductIntakePreview snapshot={draft} offer={offer} uploads={work.uploads} caseId={work.id}/>

  {sellerName===undefined&&<><label className="grid gap-2 text-sm">Where these actual facts came from<textarea rows={3} maxLength={4000} value={sourceNote} onChange={event=>setSourceNote(event.target.value)} className="w-full rounded-lg border p-3" placeholder="Identify the seller’s message, the supplied product evidence or the exact clarification."/></label><button type="button" className={button} onClick={propose}>{work.activeProposalId?'Replace earlier proposal with these changes':'Send these proposed changes to the owner'}</button></>}

  </fieldset>

  {work.canReviewProducts&&Object.keys(work.snapshot.privateReview).length>0&&<details className="rounded-xl border p-4"><summary>Private product-review references</summary><dl className="mt-4 space-y-3 text-sm">{Object.entries(work.snapshot.privateReview).map(([key,value])=><div key={key}><dt className="font-medium">{key==='originEvidenceReference'?'Origin evidence reference':key==='licenceReference'?'Product licence reference':'Product-review note'}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl></details>}

  <details className="rounded-xl border p-4"><summary>Retained assistance activity</summary><ol className="mt-4 space-y-3 text-sm">{work.events.map(event=><li key={event.id}>{new Date(event.createdAt).toLocaleString('en-NP')} · {event.kind.replaceAll('_',' ')}{typeof event.detail.sellerMessage==='string'?': '+event.detail.sellerMessage:typeof event.detail.sourceNote==='string'?': '+event.detail.sourceNote:typeof event.detail.note==='string'?': '+event.detail.note:''}</li>)}</ol></details>

 {work.proposals.length>0&&<details className="space-y-3 rounded-xl border p-4"><summary className="cursor-pointer font-medium">Recorded factual proposals and owner responses</summary><ol className="space-y-3 text-sm">{work.proposals.map(proposal=><li key={proposal.id} className="rounded border p-3"><p className="font-medium">{proposal.state} · {new Date(proposal.createdAt).toLocaleString('en-NP')}</p><p className="whitespace-pre-wrap break-words">Source: {proposal.sourceNote}</p>{Object.entries(proposal.patch.answers??{}).map(([key,value])=><p key={key} className="whitespace-pre-wrap break-words">{productDetailGroups.flatMap(group=>group.fields).find(field=>field.key===key)?.label??'Product detail'}: {Array.isArray(value)?value.join(', '):value||'Cleared'}</p>)}{proposal.patch.offers&&<p>Includes proposed offer changes; the retained proposal keeps their exact values.</p>}</li>)}</ol></details>}
 </>;
 if(sellerName===undefined) return <div className="min-w-0 space-y-6">{preview}{assistanceDetails}{outcome}</div>;
 return <div className="min-w-0 space-y-4">
  <section aria-label="Product help request" className="min-w-0 space-y-3.5 rounded-[14px] border border-[#E4DACA] bg-white p-[22px] text-[#14213D]">
   <header className="flex min-w-0 items-center gap-3.5">
    <CatalogProductPhoto caseId={work.id} photoId={work.snapshot.mediaIds.find(id=>work.uploads.some(file=>file.id===id&&file.mimeType.startsWith('image/')))} large/>
    <div className="min-w-0 [overflow-wrap:anywhere]">
     <p className="text-sm text-[#46536F]">{sellerName}</p>
     <h2 className="font-heading text-[24px] font-medium leading-[1.12]">{detailText(work.snapshot.answers,'nameEn')||detailText(work.snapshot.answers,'nameNe')||'Incomplete product information'}</h2>
    </div>
   </header>
   {preview}
   {submittedQuestion.note&&<blockquote className="whitespace-pre-wrap rounded-xl border border-[#E4DACA] px-3.5 py-3 text-sm [overflow-wrap:anywhere]">
    <span className="block text-xs text-[#46536F]">The seller asked</span>“{submittedQuestion.note}”
   </blockquote>}
   {submittedQuestion.issues.length>0&&<fieldset disabled={!canRespond} className="min-w-0">
    <legend className="pb-3.5 text-sm font-bold text-[#46536F]">{submittedQuestion.issues.every(issue=>issue.code==='missing')?'Still missing':'Details to check'}</legend>
    <div className="divide-y divide-[#E4DACA] border-t border-[#E4DACA]">
     {submittedQuestion.issues.map(issue=>{
      const field=detailsFields.find(detail=>detail.key===issue.field);
      const label=field?.label??(issue.field==='categoryId'?'Category':issue.field==='offers'?'Offers':issue.field);
      const inputStyle='min-h-11 min-w-0 w-full rounded-[10px] border border-[#D3C5AD] bg-white px-3 py-2 text-sm text-[#14213D] focus-visible:outline-2 focus-visible:outline-[#14213D]';
      let input;
      if(issue.field==='categoryId'){
       input=<select className={inputStyle} value={draft.categoryId??''} onChange={event=>setDraft(old=>({...old,categoryId:event.target.value||null}))}><option value="">Select a category</option>{categories.map(item=><option key={item.id} value={item.id}>{item.nameEn}</option>)}{draft.categoryId&&!categories.some(item=>item.id===draft.categoryId)&&<option value={draft.categoryId}>Saved category needs review</option>}</select>;
      }else if(issue.field==='coverImage'||issue.field==='occasionIds'){
       input=<button type="button" className={button+' text-sm'} onClick={()=>openResponse(true)}>{issue.field==='coverImage'?'Ask for a photo':'Ask about occasions'}</button>;
      }else if(issue.field==='price'&&selectedOffer){
       input=<input className={inputStyle} inputMode="decimal" value={selectedOffer.price} onChange={event=>setDraft(old=>({...old,offers:{...old.offers,offers:old.offers.offers.map(row=>row.id===selectedOffer.id?{...row,price:event.target.value}:row)}}))}/>;
      }else if(!field||['price','compareAtPrice','inventoryQuantity','sellerSku'].includes(issue.field)){
       input=<button type="button" className={button+' text-sm'} onClick={openDetails}>Open offer details</button>;
      }else if(field.key==='condition'||yesNoFields.has(field.key)){
       const value=detailText(draft.answers,field.key);
       const choices=field.key==='condition'?[['new','Unused new goods']]:[['yes','Yes'],['no','No']];
       input=<select className={inputStyle} value={value} onChange={event=>setAnswer(field.key,event.target.value)}><option value="">Not provided</option>{choices.map(([key,name])=><option key={key} value={key}>{name}</option>)}{value&&!choices.some(([key])=>key===value)&&<option value={value}>Saved value needs review</option>}</select>;
      }else{
       const original=draft.answers[field.key];
       const value=typeof original==='string'?original:detailText(draft.answers,field.key);
       input=field.key.startsWith('description')?<textarea className={inputStyle} rows={2} maxLength={12000} value={value} onChange={event=>setAnswer(field.key,event.target.value)}/>:<input className={inputStyle} maxLength={12000} value={value} onChange={event=>setAnswer(field.key,event.target.value)}/>;
      }
      const Wrapper=input.type==='button'?'div':'label';
      return <Wrapper key={issue.field} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,clamp(10rem,50vw,220px))] items-center gap-2 py-3 text-sm max-[380px]:grid-cols-1">
       <span className="flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]"><TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-[#A8232E]"/>{label}</span>
       {input}
      </Wrapper>;
     })}
    </div>
   </fieldset>}
   <div className="flex items-start gap-3 rounded-xl bg-[#E3E9F4] px-4 py-3.5 text-sm leading-relaxed text-[#1E3566]">
    <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0"/>
    <p>Fill in what you can from the seller’s photos or a call. The seller checks your edits before sending the product for review.</p>
   </div>
   <details ref={sourceSection} className="[&:not([open])]:hidden">
    <summary className="sr-only">Source of the proposed details</summary>
    <label className="grid gap-2 text-sm font-semibold">Where these actual facts came from<textarea ref={sourceInput} rows={2} maxLength={4000} value={sourceNote} onChange={event=>setSourceNote(event.target.value)} disabled={!canRespond} className="min-h-11 w-full rounded-[10px] border border-[#D3C5AD] p-3 font-normal" placeholder="Identify the seller’s message, product evidence or other clarification."/></label>
   </details>
   <details ref={questionSection} className="[&:not([open])]:hidden">
    <summary className="sr-only">Question for the seller</summary>
    <label className="grid gap-2 text-sm font-semibold">Question for the seller<textarea ref={questionInput} rows={3} maxLength={4000} value={sellerMessage} onChange={event=>setSellerMessage(event.target.value)} disabled={!canRespond} className="min-h-11 w-full rounded-[10px] border border-[#D3C5AD] p-3 font-normal"/></label>
    <button type="button" className={button+' mt-2 border-[#D3C5AD] text-sm font-semibold'} disabled={!canRespond||sellerMessage.trim().length<4} onClick={()=>triage('needs_information')}>Send question</button>
   </details>
   <div className="flex flex-wrap gap-2">
    <button type="button" className={button+' border-[#14213D] bg-[#14213D] text-sm font-semibold text-white hover:bg-[#233250]'} disabled={!canRespond} onClick={()=>{
     if(sourceNote.trim().length>=4){propose();return;}
     if(sourceSection.current)sourceSection.current.open=true;
     sourceInput.current?.focus();
    }}>{work.activeProposalId?'Replace my edits and send to the seller':'Send my edits to the seller'}</button>
    <button type="button" className={button+' border-[#D3C5AD] text-sm font-semibold hover:bg-[#F7F3EC]'} disabled={!canRespond} onClick={()=>openResponse(true)}>Ask the seller a question</button>
   </div>
   {outcome}
  </section>
  <details ref={detailsSection} className="rounded-[14px] border border-[#E4DACA] bg-white px-[18px]">
   <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Submitted details and activity</summary>
   <div className="min-w-0 space-y-4 pb-[18px] [&_summary]:min-h-11 [&_summary]:content-center [&_button]:min-h-11">{assistanceDetails}</div>
  </details>
 </div>;


}

