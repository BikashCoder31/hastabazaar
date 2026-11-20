import Image from 'next/image';
import {formatPaisaExact} from '@/lib/marketplace/money-display';
import {offerMoney,type OfferDraft} from '@/lib/products/offer-contracts';
import {priceApprovedVariant} from '@/lib/products/variant-pricing';
import {detailText,productDetailGroups} from '@/lib/products/category-fields';
import type {IntakeSnapshot} from '@/lib/products/intake-workspace';
const money=(value:string)=>value?`NPR ${value}`:'Not provided';
type PriceReference = Readonly<{offerId:string;decision:string;sellingPaisa:number;comparePaisa:number}>;

export function ProposedVariantPricing({offer,returnDeclaration,reference}:{offer:OfferDraft;returnDeclaration:string;reference?:PriceReference}){
 const sellerBasePaisa=offerMoney(offer.price);
 if(sellerBasePaisa===null)return <p>Price not provided</p>;
 const returnEligible=returnDeclaration!=='no';
 let pricing:ReturnType<typeof priceApprovedVariant>;
 try{
  pricing=priceApprovedVariant(sellerBasePaisa,returnEligible);
 }catch(error){
  if(!(error instanceof RangeError))throw error;
  return <p className="text-amber-800">The proposed customer price exceeds the supported amount.</p>;
 }
 const compareAtPaisa=offerMoney(offer.compareAt);
 const evidence=reference&&reference.sellingPaisa===sellerBasePaisa&&reference.comparePaisa===compareAtPaisa?reference.decision:null;
 const comparisonConflict=compareAtPaisa!==null&&compareAtPaisa<=pricing.customerUnitPaisa;
 return <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
  <dl className="space-y-1">
   <div className="flex flex-wrap justify-between gap-x-3"><dt>Seller base per unit</dt><dd>{formatPaisaExact(pricing.sellerBasePaisa)}</dd></div>
   <div className="flex flex-wrap justify-between gap-x-3"><dt>Return eligibility</dt><dd>{returnEligible?(returnDeclaration==='yes'?'Eligible':'Eligible by default'):'Nonreturnable'}</dd></div>
   <div className="flex flex-wrap justify-between gap-x-3"><dt>Platform addition per unit</dt><dd>{formatPaisaExact(pricing.additionPaisa)}</dd></div>
   <div className="flex flex-wrap justify-between gap-x-3 font-semibold"><dt>Proposed customer price per unit</dt><dd>{formatPaisaExact(pricing.customerUnitPaisa)}</dd></div>
   {offer.compareAt?<>
    <div className="flex flex-wrap justify-between gap-x-3"><dt>Claimed original price</dt><dd className="break-all">{compareAtPaisa===null?money(offer.compareAt):formatPaisaExact(compareAtPaisa)}</dd></div>
    <div className="flex flex-wrap justify-between gap-x-3"><dt>Comparison evidence</dt><dd>{evidence==='approved'?'Approved':evidence==='suppressed'?'Unsupported':'Review pending'}</dd></div>
   </>:null}
  </dl>
  {comparisonConflict?<p className="text-amber-800">The claimed original price is at or below the proposed customer price. The listing would hide the discount under this rule.</p>:null}
 </div>;
}

export function ProductPublicationFacts({snapshot,title,uploads,caseId,publicMedia=false,priceReferences}:{snapshot:IntakeSnapshot;title:string;uploads:readonly {id:string;mimeType:string}[];caseId?:string;publicMedia?:boolean;priceReferences?:readonly PriceReference[]}){
 const source=(id:string)=>publicMedia?'/api/product-media/'+encodeURIComponent(id):'/api/seller/product-intakes/media/'+encodeURIComponent(id)+(caseId?'?caseId='+encodeURIComponent(caseId):''),name=detailText(snapshot.answers,'nameEn');
 const cover=snapshot.mediaIds.find(id=>uploads.find(file=>file.id===id)?.mimeType.startsWith('image/'))??snapshot.mediaIds[0];
 const fields=productDetailGroups.flatMap(group=>group.fields).filter(field=>!['coverImage','price','compareAtPrice','inventoryQuantity','occasionIds'].includes(field.key));
 return <section aria-label={title} className="min-w-0 space-y-4 rounded-xl border bg-card p-4"><h3 className="font-heading text-xl">{title}</h3><div className="grid grid-cols-2 gap-2">{snapshot.mediaIds.map(id=>{const media=uploads.find(file=>file.id===id);return <figure key={id} className="min-w-0 rounded border p-2">{media?.mimeType==='video/mp4'?<a href={source(id)} target="_blank" rel="noopener noreferrer" className="flex min-h-32 items-center justify-center rounded border px-3 text-center text-sm underline">Open original product video<span className="sr-only"> in a new tab</span></a>:<Image data-media-mode="contain" unoptimized width={640} height={480} src={source(id)} alt={id===cover?'Cover: '+name:name+' — additional photo'} className="h-32 w-full object-contain"/>}<figcaption className="text-xs">{media?.mimeType==='video/mp4'?'Product video':id===cover?'Cover':'Additional photo'}</figcaption></figure>;})}</div>
 <dl className="space-y-3 text-sm">{fields.map(field=>{const value=detailText(snapshot.answers,field.key);return value?<div key={field.key}><dt className="text-muted-foreground">{field.label}</dt><dd className="whitespace-pre-wrap break-words">{field.key==='condition'&&value==='new'?'Unused new goods':value}</dd></div>:null;})}</dl>
 <h4 className="font-medium">Actual offers</h4><ul className="space-y-3 text-sm">{snapshot.offers.offers.map(row=><li key={row.id} className="min-w-0 space-y-1 rounded border p-3"><p className="font-medium">{snapshot.offers.axes.map(axis=>axis.label+': '+(axis.values.find(value=>value.id===row.selection[axis.id])?.label??'Not selected')).join(' · ')||'One offer, no option choices'}</p>{row.included&&priceReferences?
  <ProposedVariantPricing offer={row} returnDeclaration={detailText(snapshot.answers,'returnEligible')} reference={priceReferences.find(proof=>proof.offerId===row.id)}/>:
  <p>Selling price: {money(row.price)}{row.compareAt?' · Claimed original price: '+money(row.compareAt):''}</p>}<p>Includes {row.unitsPerOffer} {row.baseUnit} · Seller stock code: {row.sku||'Not provided'}</p><p>{row.included?'Included':'Excluded'}{row.browseOnly?' · Browse only':''}</p>{row.mediaId&&row.mediaId!==snapshot.mediaIds[0]&&<Image data-media-mode="contain" unoptimized width={160} height={160} src={source(row.mediaId)} alt="Selected offer" className="h-20 w-20 object-contain"/>}</li>)}</ul>
 <p className="text-sm">Gift occasions: {Array.isArray(snapshot.answers.occasionIds)?snapshot.answers.occasionIds.length:0} selected</p></section>;
}
