'use client';
import {createContext,useCallback,useContext,useMemo,useState,type ReactNode} from 'react';
import {sellerAccessDenied} from '@/lib/sellers/client-access';
const ProductScope=createContext<{actorId:string|null;workspace:'seller'|'staff';deny:()=>void}|null>(null);
export function useDenyProductScope(){return useContext(ProductScope)?.deny;}
/** Mounted by the exact actor/source wrapper. A denied nested operation retires
 * its affected private parent immediately, even if a server refresh is offline. */
export function ProductScopeBoundary({actorId,workspace,children}:{actorId:string|null;workspace:'seller'|'staff';children:ReactNode}){
 const parent=useContext(ProductScope),[denied,setDenied]=useState(false);
 const deny=useCallback(()=>{setDenied(true);if(parent&&parent.workspace===workspace&&(parent.actorId===null||actorId===null||parent.actorId===actorId))parent.deny();else if(workspace==='seller'&&actorId)sellerAccessDenied(actorId);},[parent,actorId,workspace]);
 const value=useMemo(()=>({actorId,workspace,deny}),[actorId,workspace,deny]);
 return <ProductScope.Provider value={value}>{denied?<section role="alert" className="space-y-3 rounded-xl border p-4"><h2 className="text-xl font-semibold">Product workspace access changed</h2><p>Private product details and unsent entries are hidden. The original opaque action reference remains retained for an authorized outcome check.</p><button type="button" className="min-h-11 rounded-lg border px-4 py-2" onClick={()=>window.location.reload()}>Reopen this Product with current access</button></section>:children}</ProductScope.Provider>;
}
