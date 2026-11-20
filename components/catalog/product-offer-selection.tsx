'use client';
import {createContext,useContext,useMemo,useState,useSyncExternalStore,type ReactNode} from 'react';
import {notifyPublicCartStorage,usePublicCartStorage} from '@/hooks/use-public-cart-storage';
import {readPendingOfferCartAction} from '@/lib/cart/public-cart-reference';
import type {PublicOffer,PublicOfferSet} from '@/lib/products/public-offers';
import {ProductDiscount} from './product-discount';
type Choice={valueId:string;name:string;value:string};
type Choices=Record<string,Choice>;
interface Selection {set:PublicOfferSet|null;selected:PublicOffer|null;choices:Choices;choose:(axisId:string,valueId:string)=>void;clear:()=>void;hydrated:boolean;retainedOfferId:string|null;busy:boolean;setBusy:(busy:boolean)=>void;}
const OfferContext=createContext<Selection|null>(null);
export function useProductOfferSelection(){return useContext(OfferContext);}
const money=(value:number)=>new Intl.NumberFormat('en-NP',{style:'currency',currency:'NPR',maximumFractionDigits:2}).format(value/100);
type ProviderProps={productId:string;offerSet:PublicOfferSet|null|undefined;children:ReactNode};
const subscribeQuery=(changed:()=>void)=>{window.addEventListener('popstate',changed);return()=>window.removeEventListener('popstate',changed);};
const querySnapshot=()=>window.location.search;
const serverQuerySnapshot=():undefined=>undefined;
function restoredChoice(raw:string|null|undefined,search:string|undefined,offerSet:PublicOfferSet|null|undefined):{choices:Choices;retainedOfferId:string|null}{
 const empty={choices:{},retainedOfferId:null};
 if(raw===undefined||search===undefined)return empty;
 try{
  const stored=JSON.parse(raw??'null'),saved=stored?.choices;
  if(saved&&typeof saved==='object'&&!Array.isArray(saved)&&Object.keys(saved).length<=3&&Object.entries(saved).every(([id,v])=>id.length<=80&&v&&typeof v==='object'&&['valueId','name','value'].every(field=>{const value=(v as Record<string,unknown>)[field];return typeof value==='string'&&value.length<=160;})))return {choices:saved as Choices,retainedOfferId:typeof stored.offerId==='string'?stored.offerId:null};
  const id=new URLSearchParams(search).get('offer'),offer=offerSet?.offers.find(row=>row.id===id);
  return {retainedOfferId:id,choices:offer?Object.fromEntries(offer.selection.map(row=>[row.axisId,{valueId:row.valueId,name:row.name,value:row.value}])):{}};
 }catch{return empty;}
}
export function ProductOfferProvider(props:ProviderProps){return <ScopedProductOfferProvider key={props.productId} {...props}/>;}
function ScopedProductOfferProvider({productId,offerSet,children}:ProviderProps){
 const [edited,setEdited]=useState<{choices:Choices;retainedOfferId:string|null}|null>(null),[sending,setBusy]=useState(false),key='hb:product-choice:'+productId;
 const raw=usePublicCartStorage(key),pendingRaw=usePublicCartStorage('hb:cart-add:'+productId),search=useSyncExternalStore(subscribeQuery,querySnapshot,serverQuerySnapshot);
 const restored=useMemo(()=>restoredChoice(raw,search,offerSet),[raw,search,offerSet]);
 const {choices,retainedOfferId}=edited??restored,hydrated=raw!==undefined&&search!==undefined&&pendingRaw!==undefined;
 const pending=useMemo(()=>readPendingOfferCartAction(pendingRaw,productId),[pendingRaw,productId]),busy=sending||Boolean(pending);
 const selected=useMemo(()=>{if(!offerSet||!hydrated||Object.keys(choices).length!==offerSet.axes.length)return null;return offerSet.offers.find(offer=>(!retainedOfferId||offer.id===retainedOfferId)&&offer.selection.every(choice=>choices[choice.axisId]?.valueId===choice.valueId))??null;},[offerSet,choices,hydrated,retainedOfferId]);
 function save(next:Choices){const offer=offerSet?.offers.find(row=>row.selection.length===Object.keys(next).length&&row.selection.every(choice=>next[choice.axisId]?.valueId===choice.valueId)),offerId=offer?.id??null;setEdited({choices:next,retainedOfferId:offerId});try{sessionStorage.setItem(key,JSON.stringify({choices:next,offerId}));notifyPublicCartStorage(key);}catch{/* The visible choice still works when local storage is unavailable. */}}
 function choose(axisId:string,valueId:string){const axis=offerSet?.axes.find(row=>row.id===axisId),value=axis?.values.find(row=>row.id===valueId),next={...choices};if(axis&&value)next[axisId]={valueId,name:axis.label,value:value.label};else delete next[axisId];save(next);}
 return <OfferContext.Provider value={{set:offerSet??null,selected,choices,choose,clear:()=>save({}),hydrated,retainedOfferId,busy,setBusy}}><div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:gap-16">{children}</div></OfferContext.Provider>;
}
export function ProductOfferPrice({pricePaisa,compareAtPricePaisa,priceFrom,purchasable,inventoryQuantity}:{pricePaisa:number|null;compareAtPricePaisa:number|null;priceFrom?:boolean;purchasable?:boolean;inventoryQuantity:number}){
 const context=useProductOfferSelection(),set=context?.set,selected=context?.selected,price=selected?selected.pricePaisa:set?set.display.pricePaisa:pricePaisa,comparison=selected?selected.compareAtPricePaisa:set?set.display.compareAtPricePaisa:compareAtPricePaisa,from=!selected&&(set?set.display.from:priceFrom);
 const status=set?(selected?(selected.orderable?`${selected.available} available for this option`:selected.availability==='out_of_stock'?'This option is out of stock':'This option is unavailable to order'):set.orderable?'Select your option to see its exact availability':'Options are currently unavailable to order'):purchasable&&inventoryQuantity>0?`${inventoryQuantity} available`:'Currently unavailable to order';
 return <div className="mt-5" aria-label="Product options and price">
  {set&&context?<fieldset disabled={context.busy||!context.hydrated} className="mb-5 space-y-3"><legend className="font-semibold">{set.axes.length?'Choose your options':'Product option'}</legend>
   {set.axes.map(axis=>{const choice=context.choices[axis.id],retained=choice&&!axis.values.some(value=>value.id===choice.valueId);return <label key={axis.id} className="block text-sm font-medium">{axis.label}<select aria-label={axis.label} value={choice?.valueId??''} onChange={event=>context.choose(axis.id,event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3"><option value="">Choose {axis.label.toLowerCase()}</option>{retained?<option value={choice.valueId}>{choice.value} — no longer offered</option>:null}{axis.values.map(value=>{const matches=set.offers.filter(offer=>offer.selection.some(row=>row.axisId===axis.id&&row.valueId===value.id)&&offer.selection.every(row=>row.axisId===axis.id||!context.choices[row.axisId]||context.choices[row.axisId].valueId===row.valueId));return <option key={value.id} value={value.id}>{value.label}{!matches.some(offer=>offer.orderable)?' — unavailable':''}</option>;})}</select></label>;})}
   {Object.entries(context.choices).filter(([id])=>!set.axes.some(axis=>axis.id===id)).map(([id,choice])=><p key={id} className="text-sm">Previously selected {choice.name}: {choice.value}. This choice is no longer offered.</p>)}
   {set.axes.length===0&&selected?<p className="text-sm">One sales unit: {selected.unitsPerOffer} {selected.baseUnit}{selected.unitsPerOffer===1?'':'s'}</p>:null}
   {context.retainedOfferId&&!set.offers.some(offer=>offer.id===context.retainedOfferId)?<p className="text-sm">Your previously selected option is no longer offered. Choose a current option explicitly.</p>:null}
   {Object.keys(context.choices).length>0||context.retainedOfferId?<button type="button" className="text-sm font-medium text-primary underline" onClick={context.clear}>Clear choices</button>:null}
  </fieldset>:null}
  {price!==null?<><p className="font-heading text-3xl" data-public-offer-price>{from?'From ':''}{money(price)}</p><ProductDiscount pricePaisa={price} originalPaisa={comparison}/></>:<p className="text-sm text-muted-foreground">No current offer price is available.</p>}
  {selected?<p className="mt-2 text-sm text-muted-foreground">One sales unit: {selected.unitsPerOffer} {selected.baseUnit}{selected.unitsPerOffer===1?'':'s'} · SKU {selected.sku}</p>:null}
  <p aria-live="polite" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">{status}{set&&context&&Object.keys(context.choices).length===set.axes.length&&set.axes.length>0&&!selected?' This combination is not offered. Your choices have been kept.':''}</p>
 </div>;
}
