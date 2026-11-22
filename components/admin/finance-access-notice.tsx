'use client';
import type {Ref} from 'react';
export function FinanceAccessNotice({message,busy=false,onCheck,alertRef}:{message?:string;busy?:boolean;onCheck?:()=>void;alertRef?:Ref<HTMLDivElement>}){
 return <div ref={alertRef} role="alert" tabIndex={-1} className="space-y-3 rounded border p-4"><p>Current account or Finance access changed. Private controls are hidden. The original attempt remains bound to its original actor.</p>{message?<p>{message}</p>:null}{onCheck?<button type="button" disabled={busy} className="mr-3 rounded border p-2" onClick={onCheck}>Check original saved outcome</button>:null}<button type="button" className="rounded border p-2" onClick={()=>window.location.reload()}>Refresh current Finance view</button></div>;
}
