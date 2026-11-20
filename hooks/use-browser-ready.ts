'use client';
import {useSyncExternalStore} from 'react';

const subscribe=()=>()=>{};
const client=()=>true;
const server=()=>false;

/** Mount browser-owned draft state only after hydration has reconciled the server view. */
export function useBrowserReady(){return useSyncExternalStore(subscribe,client,server);}
