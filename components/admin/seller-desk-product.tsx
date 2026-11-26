'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CatalogProductPhoto } from '@/app/admin/products/intakes/catalog-product-photo';
import { detailText } from '@/lib/products/category-fields';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { offerMoney } from '@/lib/products/offer-contracts';
import type { getProductPublicationReview, PublicationDecisionInput } from '@/lib/products/publication';
import { toggleSellerDeskFix } from './seller-desk-fix-note';

type Review = Awaited<ReturnType<typeof getProductPublicationReview>>;
const primary = 'admin-decision min-h-11';
const secondary = 'admin-button min-h-11';

export function SellerDeskProduct({ view, caseId, disabled, reason, setReason, sameItem, setSameItem,
  accurateCover, setAccurateCover, evidence, setEvidence, proofsReady, reviewReady, canPublish, decide }: {
  view:Review; caseId:string; disabled:boolean; reason:string; setReason:(value:string)=>void;
  sameItem:boolean; setSameItem:(value:boolean)=>void; accurateCover:boolean; setAccurateCover:(value:boolean)=>void;
  evidence:Record<string,string>; setEvidence:(value:Record<string,string>)=>void; proofsReady:boolean;
  reviewReady:boolean; canPublish:boolean; decide:(action:PublicationDecisionInput['action'])=>Promise<void>;
}) {
  const [marked,setMarked]=useState<string[]>([]);
  const candidate=view.candidate.snapshot;
  const offers=candidate.offers.offers.filter(offer=>offer.included);
  const price=offers[0] ? offerMoney(offers[0].price) : null;
  const readyNote=reason.trim().length>=10 && reason.length<=1000;
  const checks=[
    {title:'The details and offers describe the same product.',sentence:'Please check the product details and offers so they describe the same item.',checked:sameItem,onCheck:setSameItem},
    {title:'The main photo shows the actual product.',sentence:'Please add a cover photo that shows the actual product.',checked:accurateCover,onCheck:setAccurateCover},
  ];
  function fixButton(sentence:string) {
    const active=marked.includes(sentence);
    return <button type="button" aria-pressed={active} className={'min-h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold '+(active?'border-[#A8232E] bg-[#F8E1DE] text-[#861923]':'border-[#D3C5AD]')} onClick={()=>{
      const next=toggleSellerDeskFix(marked,reason,sentence);setMarked(next.marked);setReason(next.note);
    }}>{active?'Will ask to fix':'Ask to fix'}</button>;
  }
  const fullReview='/admin/products/publications/'+encodeURIComponent(caseId);
  const title=detailText(candidate.answers,'nameEn')||'Product name not provided';
  return <section aria-label="Product review" className="min-w-0 space-y-4 rounded-xl border border-[#E4DACA] bg-white p-4 md:p-5">
    <header className="flex items-center gap-3"><CatalogProductPhoto large caseId={caseId} photoId={candidate.mediaIds[0]}/><div className="min-w-0 break-words">
      <p className="text-sm text-muted-foreground">Product review</p><h2 className="font-heading text-2xl">{title}</h2>
      <p className="text-sm">{[view.category.name,typeof price==='number'?formatPaisaExact(price):null,detailText(candidate.answers,'materials')].filter(Boolean).join(' · ')}</p>
    </div></header>
    <p className="whitespace-pre-line break-words text-sm">{detailText(candidate.answers,'descriptionEn')}</p>
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold underline" href={fullReview}>Open full moderation review</Link>
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="font-semibold">Checks</legend>
      {checks.map(check=><div key={check.sentence} className="flex flex-wrap items-center justify-between gap-2 border-t py-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm"><input type="checkbox" className="size-5 shrink-0" checked={check.checked} onChange={event=>check.onCheck(event.target.checked)}/>{check.title}</label>
        {fixButton(check.sentence)}
      </div>)}
      {(view.category.contract?.eligibilityRequirements??[]).map(requirement=>{
        const label=requirement.replaceAll('_',' ');
        return <div key={requirement} className="grid min-w-0 gap-2 border-t py-2">
          <label className="grid gap-1 text-sm">Evidence for {label}<input className="min-h-11 rounded-lg border px-3" maxLength={2000} value={evidence[requirement]??''} onChange={event=>setEvidence({...evidence,[requirement]:event.target.value})}/></label>
          <div>{fixButton('Please provide evidence for '+label+'.')}</div>
        </div>;
      })}
      {!proofsReady&&<div className="flex flex-wrap items-center justify-between gap-2 border-t py-2"><p className="min-w-0 flex-1 text-sm">The original-price claim needs an evidence finding in the full moderation review.</p>{fixButton('Please supply evidence for the original price or correct the comparison.')}</div>}
      {view.categoryChanged&&<p className="text-sm">The category policy changed. Ask the seller to review the guidance and resubmit.</p>}
      <label className="grid gap-2 text-sm font-semibold">Note to the seller<textarea className="min-h-20 rounded-lg border p-3 font-normal" value={reason} onChange={event=>setReason(event.target.value)} minLength={10} maxLength={1000} placeholder="Explain the decision in at least 10 characters."/></label>
      {!canPublish&&<p className="text-sm">Publication requires an independent reviewer with publishing access.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {marked.length>0&&<button type="button" data-desk-action="change" className={primary} disabled={!readyNote} onClick={()=>void decide('request_changes')}>Send back with {marked.length} {marked.length===1?'fix':'fixes'}</button>}
        {canPublish&&<button type="button" data-desk-action="approve" className={marked.length?secondary:primary} disabled={!reviewReady||!readyNote} onClick={()=>void decide('approve_and_publish')}>{marked.length?'Approve anyway':'Approve & publish'}</button>}
        <button type="button" className="min-h-11 px-2 text-sm font-semibold text-[#A8232E]" disabled={!readyNote} onClick={()=>{if(window.confirm('Reject this product? The seller will receive your reason.'))void decide('reject');}}>Reject…</button>
      </div>
    </fieldset>
  </section>;
}
