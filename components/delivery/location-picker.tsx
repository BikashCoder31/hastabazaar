'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap,CircleMarker} from 'leaflet';
import type {DeliveryLocation} from '@/lib/delivery/validation';
import {Button} from '@/components/ui/button';
export function LocationPicker({initial}:{initial?:DeliveryLocation}) {
 const [locating,setLocating]=useState(false);
 const [point,setPoint]=useState(initial);const [opened,setOpened]=useState(false);const [error,setError]=useState('');
 const latest=useRef(point);
 useEffect(()=>{latest.current=point;},[point]);
 const host=useRef<HTMLDivElement>(null);const map=useRef<LeafletMap|null>(null);const marker=useRef<CircleMarker|null>(null);
 useEffect(()=>{if(!opened||!host.current)return;let cancelled=false;void import('leaflet').then(L=>{
  if(cancelled||!host.current)return;
  const point=latest.current;
  const m=L.map(host.current).setView(point?[point.latitude,point.longitude]:[28.2,84.1],point?16:7);map.current=m;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m).on('tileerror',()=>setError('Map tiles could not load. You can still enter your address or use your location.'));
  marker.current=L.circleMarker(point?[point.latitude,point.longitude]:[28.2,84.1],{radius:9,color:'#1d4ed8',opacity:point?1:0,fillOpacity:point?0.4:0}).addTo(m);
  m.on('click',e=>{setPoint({latitude:e.latlng.lat,longitude:e.latlng.lng});setError('');});
 }).catch(()=>setError('Map unavailable. Manual address entry still works.'));return()=>{cancelled=true;map.current?.remove();map.current=null;};},[opened]);
 useEffect(()=>{marker.current?.setStyle({opacity:point?1:0,fillOpacity:point?0.4:0});if(point){map.current?.setView([point.latitude,point.longitude],16);marker.current?.setLatLng([point.latitude,point.longitude]);}},[point]);
 function locate(){setError('');if(!navigator.geolocation){setError('Location is unavailable. Enter your address manually.');return;}setLocating(true);navigator.geolocation.getCurrentPosition(p=>{setLocating(false);setPoint({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy});setOpened(true);},()=>{setLocating(false);setError('Location permission was denied or your position is unavailable. You can select the map or enter your address manually.');},{enableHighAccuracy:true,timeout:15000,maximumAge:0});}
 return <section className="col-span-full space-y-3 rounded-xl border p-4"><p className="font-semibold">Delivery map pin (optional)</p><p className="text-sm text-muted-foreground">You can enter your address without a map pin. If you add a pin, check that it marks the delivery entrance. Province, district, municipality and street, tole or locality are required; ward and landmark are optional. Charges use your delivery district. Opening the map loads OpenStreetMap tiles.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={locate} disabled={locating}>{locating?'Finding location…':'Use my location'}</Button><Button type="button" variant="outline" onClick={()=>setOpened(!opened)}>{opened?'Close map':'Select on map'}</Button>{point?<Button type="button" variant="outline" onClick={()=>setPoint(undefined)}>Remove pin</Button>:null}</div>{locating?<output className="block text-sm">Finding your location. You can continue entering your address.</output>:null}{opened?<div ref={host} className="relative z-0 h-72 rounded-lg" aria-label="Delivery location map" />:null}{point?<p className="text-sm">Selected: {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}{point.accuracy!==undefined?` · estimated accuracy ${Math.round(point.accuracy)} m`:''}. Confirm this is the delivery entrance.</p>:null}{error?<p role="alert" className="text-sm">{error}</p>:null}<input type="hidden" name="latitude" value={point?.latitude??''}/><input type="hidden" name="longitude" value={point?.longitude??''}/></section>;
}
