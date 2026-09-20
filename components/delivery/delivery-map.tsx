'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap,CircleMarker} from 'leaflet';
export function DeliveryMap({latitude,longitude}:{latitude:number;longitude:number}){
 const [unavailable,setUnavailable]=useState(false);
 const latest=useRef({latitude,longitude});
 useEffect(()=>{latest.current={latitude,longitude};},[latitude,longitude]);
 const host=useRef<HTMLDivElement>(null);const map=useRef<LeafletMap|null>(null);const marker=useRef<CircleMarker|null>(null);
 useEffect(()=>{let closed=false;void import('leaflet').then(L=>{if(closed||!host.current)return;const {latitude,longitude}=latest.current;const m=L.map(host.current).setView([latitude,longitude],15);map.current=m;L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);marker.current=L.circleMarker([latitude,longitude],{radius:9,color:'#1d4ed8'}).addTo(m);}).catch(()=>setUnavailable(true));return()=>{closed=true;map.current?.remove();};},[]);
 useEffect(()=>{marker.current?.setLatLng([latitude,longitude]);map.current?.panTo([latitude,longitude]);},[latitude,longitude]);
 return <><div ref={host} aria-label="Reported delivery location" className="relative z-0 h-64 rounded-lg"/>{unavailable?<output className="block text-sm">The map could not load. Use your order details for delivery updates.</output>:null}</>;
}
