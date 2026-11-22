'use client';
import {useCallback,useLayoutEffect,useMemo,useRef} from 'react';

/** Private fields belong to one mounted actor/source, independently of revisions.
 * Native receivers remain responsible for authority and exact request identity.
 */
export function useOwnedFormScope(identity:string){
 const owned=useMemo(()=>({identity}),[identity]);
 const active=useRef<typeof owned|null>(null);
 useLayoutEffect(()=>{active.current=owned;return()=>{if(active.current===owned)active.current=null;};},[owned]);
 const isCurrent=useCallback(()=>active.current===owned,[owned]);
 return{key:identity,isCurrent};
}
