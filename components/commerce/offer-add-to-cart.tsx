'use client';
import {useMemo,useState} from 'react';
import {notifyPublicCartStorage,usePublicCartStorage} from '@/hooks/use-public-cart-storage';
import {readPendingOfferCartAction,type PendingOfferCartAction} from '@/lib/cart/public-cart-reference';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {useProductOfferSelection} from '@/components/catalog/product-offer-selection';
import {AddToCart} from './add-to-cart';
import type {OfferCartChoice} from '@/lib/cart/offer-cart';
type Pending=PendingOfferCartAction;
type OfferAddProps={productId:string;available:number;purchasable?:boolean};
export function OfferAddToCart(props:OfferAddProps){return <ScopedOfferAddToCart key={props.productId} {...props}/>;}
function ScopedOfferAddToCart({productId,available,purchasable}:OfferAddProps){
 const context=useProductOfferSelection(),set=context?.set,selected=context?.selected,[quantity,setQuantity]=useState(1),[acknowledged,setAcknowledged]=useState<OfferCartChoice|null>(null),[pendingOverride,setPending]=useState<Pending|null|undefined>(undefined),[sending,setSending]=useState(false),[message,setMessage]=useState(''),key='hb:cart-add:'+productId;
 const raw=usePublicCartStorage(key),restored=useMemo(()=>readPendingOfferCartAction(raw,productId),[raw,productId]),pending=pendingOverride===undefined?restored:pendingOverride,hydrated=raw!==undefined;
 function remember(action:Pending|null){setPending(action);context?.setBusy(Boolean(action));try{if(action)sessionStorage.setItem(key,JSON.stringify(action));else sessionStorage.removeItem(key);notifyPublicCartStorage(key);}catch{/* The in-memory receipt still prevents duplicate clicks. */}}
 async function submit(buyNow:boolean){if(sending)return;
  if(buyNow&&!pending&&acknowledged&&selected&&set&&acknowledged.offerId===selected.id&&acknowledged.versionId===set.versionId&&acknowledged.publicVersionId===set.publicVersionId&&acknowledged.pricePaisa===selected.pricePaisa&&acknowledged.quantity===quantity){setSending(true);context?.setBusy(true);try{const response=await fetch('/api/cart',{cache:'no-store'});if(!response.ok)throw new Error('The saved cart could not be confirmed.');const cart=await response.json() as {hasUnavailableItems:boolean;items:{offerId?:string;offerVersionId?:string;publicVersionId?:string|null;pricePaisa:number|null;quantity:number}[]};if(!cart.hasUnavailableItems&&cart.items.some(item=>item.offerId===selected.id&&item.offerVersionId===set.versionId&&item.publicVersionId===set.publicVersionId&&item.pricePaisa===selected.pricePaisa&&item.quantity>=quantity)){location.assign('/checkout');return;}setAcknowledged(null);setMessage('The saved selection changed. Review your cart before continuing.');}catch(error){setMessage(error instanceof Error?error.message:'The saved cart could not be confirmed.');}finally{setSending(false);context?.setBusy(false);}return;}
const action=pending??(selected&&set?{input:{productId,offerId:selected.id,versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:selected.pricePaisa,quantity,requestId:crypto.randomUUID()},buyNow,label:selected.selection.map(row=>`${row.name}: ${row.value}`).join(', ')||'Standard option'}:null);if(!action)return;remember(action);setSending(true);setMessage('');
  try{
   // Establish the anonymous identity before a possibly interrupted write response.
   const identity=await fetch('/api/cart',{cache:'no-store'});if(!identity.ok)throw new Error('The cart could not be confirmed. Your exact action is saved.');
   const response=await fetch('/api/cart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(action.input)}),body=await response.json() as {error?:string;hasUnavailableItems?:boolean};
   if(!response.ok){if(response.status<500)remember(null);throw new Error(body.error??'The cart response could not be confirmed. Retry the saved action.');}
   remember(null);setAcknowledged(action.input);window.dispatchEvent(new Event('cart:updated'));if(action.buyNow&&!body.hasUnavailableItems){location.assign('/checkout');return;}setMessage(body.hasUnavailableItems?'Your selection is saved. Review the unavailable cart items before checkout.':'Added to your cart.');
  }catch(error){setMessage(error instanceof TypeError?'The response was interrupted. Retry the exact saved action.':error instanceof Error?error.message:'The response was interrupted. Retry the exact saved action.');}finally{setSending(false);}
 }
 if(!set)return purchasable?<AddToCart productId={productId} available={available}/>:<p className="mt-5 rounded-xl border bg-muted p-4 text-sm">This product is currently unavailable to order.</p>;
 const enabled=hydrated&&context?.hydrated&&selected?.orderable&&quantity<=selected.available&&quantity>=1&&quantity<=10;
 return <div data-form-id="commerce.add-to-cart" className="mt-5 space-y-3" aria-label="Purchase selected option">
  <label className="block text-sm font-medium">Quantity<input aria-label="Option quantity" type="number" min={1} max={Math.min(10,selected?.available??10)} value={quantity} onChange={event=>setQuantity(Number(event.target.value))} disabled={sending||Boolean(pending)} className="ml-3 w-20 rounded-lg border bg-background px-3 py-2"/></label>
  {pending?<div className="rounded-xl border bg-secondary/30 p-3 text-sm"><p>Saved action: {pending.input.quantity} × {pending.label}. Its response may be unconfirmed.</p><Button className="mt-2" disabled={sending} onClick={()=>void submit(pending.buyNow)}>{sending?'Confirming…':'Retry exact cart action'}</Button></div>:<div className="flex flex-wrap gap-3"><Button disabled={!enabled||sending} onClick={()=>void submit(false)}>Add to cart</Button><Button variant="outline" disabled={!enabled||sending} onClick={()=>void submit(true)}>Buy now</Button></div>}
  {!selected?<p className="text-sm text-muted-foreground">Choose the actual product option before adding it.</p>:quantity>selected.available?<p className="text-sm text-muted-foreground">The requested quantity is not currently available. Your quantity has been kept.</p>:null}
  {message?<output className="block text-sm">{message}</output>:null}<Link href="/cart" className="inline-block text-sm font-semibold text-primary underline">View cart</Link>
 </div>;
}
