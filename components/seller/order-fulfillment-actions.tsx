'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {OrderOfferDetails} from '@/components/commerce/order-offer-details';
import {Button} from '@/components/ui/button';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {useActionRecovery} from '@/components/orders/use-action-recovery';
import {sellerAccessDenied} from '@/lib/sellers/client-access';
import type {FulfillmentItem,SellerFulfillmentAction} from '@/lib/db/repositories/fulfillment';
import {packedWeightRange,parsePackedWeightKg} from '@/lib/shipping/packed-weight';
import {PackedWeightInput} from './packed-weight-input';
type Props={orderId:string;actorId:string;items:readonly Pick<FulfillmentItem,'id'|'productName'|'quantity'|'fulfillmentStatus'|'offerSnapshot'>[];parcelWeight?:{prefilledGrams:number|null}};
const actions=['start_packing','ready_for_pickup'];
export function SellerOrderFulfillmentActions(props:Props){const scope=useOwnedFormScope(JSON.stringify([props.actorId,props.orderId]));return <OwnedActions key={scope.key} {...props} isCurrent={scope.isCurrent}/>;}
function OwnedActions({orderId,actorId,items,isCurrent,parcelWeight}:Props&{isCurrent:()=>boolean}){
 const router=useRouter(),[selected,setSelected]=useState<string[]>([]),[selectionMessage,setSelectionMessage]=useState('');
 const [enteredWeight,setEnteredWeight]=useState<string|null>(null),[weightInvalid,setWeightInvalid]=useState(false);
 const displayedWeight=enteredWeight ?? (parcelWeight?.prefilledGrams==null?'':String(parcelWeight.prefilledGrams/1000));
 const recovery=useActionRecovery({actorId,sourceId:orderId,endpoint:`/api/seller/orders/${encodeURIComponent(orderId)}/fulfillment`,storageKey:`hastabazaar:preparation:${actorId}:${orderId}`,actions,isCurrent,onDenied:()=>{sellerAccessDenied(actorId);router.refresh();}});
 async function submit(action:SellerFulfillmentAction){
  const from=action==='start_packing'?'confirmed':'packing';
  const matching=items.filter(item=>item.fulfillmentStatus===from);
  const itemIds=items.length===1 ? matching.map(item=>item.id) : matching.filter(item=>selected.includes(item.id)).map(item=>item.id);
  if(!itemIds.length){setSelectionMessage('Select the exact items for this action.');return;}setSelectionMessage('');
  const needsWeight=action==='ready_for_pickup'&&parcelWeight!==undefined;
  const grams=needsWeight?parsePackedWeightKg(displayedWeight):null;
  if(needsWeight&&grams===null){setWeightInvalid(true);setSelectionMessage(packedWeightRange);return;}
  const note=action==='start_packing'?'Started actual preparation of the selected items.':'The selected items are packed and ready for carrier pickup.';
  if(await recovery.run(action,{action,itemIds,note,...(grams===null?{}:{packedParcelWeightGrams:grams})})&&isCurrent()){
    setSelected([]);setEnteredWeight(null);setWeightInvalid(false);router.refresh();
  }
 }
 if(recovery.denied)return <p role="alert">Seller access changed. Reopen this order with current access.</p>;
 const eligible=items.filter(item=>['confirmed','packing'].includes(item.fulfillmentStatus));
 if (!eligible.length && !recovery.pending && !recovery.message) return null;
 return <div className="space-y-3 [&_button]:min-h-11">
 {eligible.length > 1 ? <fieldset disabled={recovery.blocked} className="space-y-2"><legend className="mb-2 text-sm font-semibold">Select the items to update</legend>{eligible.map(item=><label key={item.id} className="flex min-h-11 items-start gap-2 rounded-lg border bg-card p-3 text-sm"><input type="checkbox" checked={selected.includes(item.id)} onChange={event=>setSelected(values=>event.target.checked?[...values,item.id]:values.filter(id=>id!==item.id))}/><span>{item.productName} × {item.quantity} · {item.fulfillmentStatus==='confirmed'?'Awaiting preparation':'Preparing'}<OrderOfferDetails offer={item.offerSnapshot}/></span></label>)}</fieldset> : null}
 {recovery.pending?<div className="space-y-2"><p>The original action still needs confirmation. Its private entries stay only in this open page.</p>{recovery.canRetry?<Button disabled={recovery.busy} onClick={()=>void recovery.retry()}>Retry the same saved action</Button>:null}{recovery.reference?<Button disabled={recovery.busy} onClick={()=>void recovery.check()}>Check original saved outcome</Button>:null}{recovery.rejected?<Button disabled={recovery.busy} onClick={recovery.reviewAgain}>Review current items for a new attempt</Button>:null}</div>:<div className="space-y-2">
  {eligible.some(item=>item.fulfillmentStatus==='confirmed')?<Button className="min-h-11 w-full bg-[#A8232E] text-white hover:bg-[#8F1D27]" disabled={recovery.blocked} onClick={()=>void submit('start_packing')}>Start preparing</Button>:null}
  {eligible.some(item=>item.fulfillmentStatus==='packing')?<>
    {parcelWeight?<PackedWeightInput label="Packed parcel weight (kg)" value={displayedWeight} required disabled={recovery.blocked}
      invalid={weightInvalid} hint={weightInvalid?packedWeightRange:'Weigh the whole parcel, including its packaging.'}
      onChange={value=>{setEnteredWeight(value);setWeightInvalid(false);setSelectionMessage('');}}/>:null}
    <Button className="min-h-11 w-full bg-[#A8232E] text-white hover:bg-[#8F1D27]" disabled={recovery.blocked} onClick={()=>void submit('ready_for_pickup')}>Mark ready for pickup</Button>
  </>:null}
 </div>}
<output className="block" aria-live="polite">{recovery.message||selectionMessage}</output></div>;
}
