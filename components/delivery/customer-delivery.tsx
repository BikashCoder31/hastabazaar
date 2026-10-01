'use client';
import {useEffect,useState} from 'react';
import {ParcelList} from './parcel-list';
import type {customerParcel} from '@/lib/operations/parcels';
import type {DeliveryInfo} from '@/lib/delivery/repository';
import {DeliveryMap} from './delivery-map';
export function CustomerDelivery({orderNumber}:{orderNumber:string}){
 const [parcels,setParcels]=useState<ReturnType<typeof customerParcel>[]>([]);
 const [delivery,setDelivery]=useState<DeliveryInfo|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let active=true;async function load(){if(document.hidden)return;try{const r=await fetch('/orders/'+encodeURIComponent(orderNumber)+'/delivery',{cache:'no-store'});if(!r.ok)throw new Error();const data=await r.json() as {delivery:DeliveryInfo|null;parcels?:ReturnType<typeof customerParcel>[]};if(active){setDelivery(data.delivery);setParcels(data.parcels??[]);setError('');}}catch{if(active){setDelivery(null);setParcels([]);setError('Delivery tracking is temporarily unavailable.');}}}void load();const timer=setInterval(()=>void load(),20000);return()=>{active=false;clearInterval(timer);};},[orderNumber]);
 if(parcels.length)return <ParcelList parcels={parcels}/>;
 if(!delivery&&!error)return null;
 return <section className="my-6 space-y-3 rounded-xl border p-5"><h2 className="font-semibold">Delivery tracking</h2>{error?<p>{error}</p>:delivery?.method==='courier'?<><p>Courier: {delivery.courierName} · Reference: {delivery.trackingReference}</p>{delivery.trackingUrl?<a className="underline" href={delivery.trackingUrl} target="_blank" rel="noopener noreferrer">Track on courier website</a>:null}<p className="text-sm">Automatic courier updates are not connected. The order timeline shows recorded updates.</p></>:delivery?<><p>Own rider delivery</p>{delivery.latitude!==null&&delivery.longitude!==null?<><p>Last reported {new Date(delivery.positionAt!).toLocaleTimeString()} · estimated accuracy {delivery.accuracy!==null?Math.round(delivery.accuracy)+' m':'unavailable'}. This is a reported position, not a guaranteed arrival time.</p><DeliveryMap latitude={delivery.latitude} longitude={delivery.longitude}/></>:<p>{delivery.orderStatus==='dispatched'?'No recent rider location. The rider may have stopped sharing or lost connection.':'Live location is available only during dispatch while the rider shares it.'}</p>}</>:null}</section>;
}
