'use client';
import {createContext,useCallback,useContext,useState,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
const TeamScope=createContext<(()=>void)|null>(null);
export function useDenyTeamScope(){return useContext(TeamScope);}
/** The parent keys this boundary by the current server actor and workspace authority. */
export function TeamScopeBoundary({children}:{children:ReactNode}){
 const [denied,setDenied]=useState(false),deny=useCallback(()=>setDenied(true),[setDenied]);
 return <TeamScope.Provider value={deny}>{denied?<section role="alert" className="space-y-3 rounded-lg border p-4"><p>Team access changed. Private workspace details and inputs are hidden.</p><p>The original action reference is retained for an authorized saved-outcome check.</p><Button type="button" variant="outline" onClick={()=>window.location.assign('/admin/team')}>Reopen Team with current access</Button></section>:children}</TeamScope.Provider>;
}
