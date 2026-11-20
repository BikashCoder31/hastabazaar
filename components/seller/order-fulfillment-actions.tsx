'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {OrderOfferDetails} from '@/components/commerce/order-offer-details';
import {Button} from '@/components/ui/button';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import {useActionRecovery} from '@/components/orders/use-action-recovery';
import {sellerAccessDenied} from '@/lib/sellers/client-access';
import type {FulfillmentItem,SellerFulfillmentAction} from '@/lib/db/repositories/fulfillment';
type Props={orderId:string;actorId:string;items:readonly Pick<FulfillmentItem,'id'|'productName'|'quantity'|'fulfillmentStatus'|'offerSnapshot'>[]};
const actions=['start_packing','ready_for_pickup'];
export function SellerOrderFulfillmentActions(props:Props){const scope=useOwnedFormScope(JSON.stringify([props.actorId,props.orderId]));return <OwnedActions key={scope.key} {...props} isCurrent={scope.isCurrent}/>;}
function OwnedActions({orderId,actorId,items,isCurrent}:Props&{isCurrent:()=>boolean}){
 const router=useRouter(),[selected,setSelected]=useState<string[]>([]),[selectionMessage,setSelectionMessage]=useState('');
 const recovery=useActionRecovery({actorId,sourceId:orderId,endpoint:`/api/seller/orders/${encodeURIComponent(orderId)}/fulfillment`,storageKey:`hastabazaar:preparation:${actorId}:${orderId}`,actions,isCurrent,onDenied:()=>{sellerAccessDenied(actorId);router.refresh();}});
 async function submit(action:SellerFulfillmentAction){
  const from=action==='start_packing'?'confirmed':'packing',itemIds=selected.filter(id=>items.some(item=>item.id===id&&item.fulfillmentStatus===from));
  if(!itemIds.length){setSelectionMessage('Select the exact items for this action.');return;}setSelectionMessage('');
  if(await recovery.run(action,{action,itemIds,note:action==='start_packing'?'Started actual preparation of the selected items.':'The selected items are packed and ready for carrier pickup.'})&&isCurrent()){setSelected([]);router.refresh();}
 }
 if(recovery.denied)return <p role="alert">Seller access changed. Reopen this order with current access.</p>;
 const eligible=items.filter(item=>['confirmed','packing'].includes(item.fulfillmentStatus));
 return <div className="space-y-4"><p className="text-sm">Select the items that actually reached the next stage. Ready for pickup does not mean handed to the carrier.</p>
 <fieldset disabled={recovery.blocked} className="space-y-2">{eligible.map(item=><label key={item.id} className="flex gap-2 rounded border p-3"><input type="checkbox" checked={selected.includes(item.id)} onChange={event=>setSelected(values=>event.target.checked?[...values,item.id]:values.filter(id=>id!==item.id))}/><span>{item.productName} × {item.quantity} · {item.fulfillmentStatus==='confirmed'?'Awaiting preparation':'Preparing'}<OrderOfferDetails offer={item.offerSnapshot}/></span></label>)}</fieldset>
 {recovery.pending?<div className="space-y-2"><p>The original action still needs confirmation. Its private entries stay only in this open page.</p>{recovery.canRetry?<Button disabled={recovery.busy} onClick={()=>void recovery.retry()}>Retry the same saved action</Button>:null}{recovery.reference?<Button disabled={recovery.busy} onClick={()=>void recovery.check()}>Check original saved outcome</Button>:null}{recovery.rejected?<Button disabled={recovery.busy} onClick={recovery.reviewAgain}>Review current items for a new attempt</Button>:null}</div>:<div className="flex flex-wrap gap-2">{eligible.some(item=>item.fulfillmentStatus==='confirmed')?<Button disabled={recovery.blocked} onClick={()=>void submit('start_packing')}>Start selected preparation</Button>:null}{eligible.some(item=>item.fulfillmentStatus==='packing')?<Button disabled={recovery.blocked} onClick={()=>void submit('ready_for_pickup')}>Selected items ready for pickup</Button>:null}</div>}
 {!eligible.length&&!recovery.pending?<p>No preparation transition is available for these current item states. Review delivery and any open cases below.</p>:null}<output className="block" aria-live="polite">{recovery.message||selectionMessage}</output></div>;
}
