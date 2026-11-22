'use client';
import {useCallback,useLayoutEffect,useRef,useState} from 'react';
/** Capture before an await; a different source or unmount invalidates every old callback. */
export function useProductScope(key:string){
 const[token,setToken]=useState(()=>({key}));
 if(token.key!==key)setToken({key});
 const active=useRef<{token:typeof token}|null>(null);
 useLayoutEffect(()=>{const lease={token};active.current=lease;return()=>{if(active.current===lease)active.current=null;};},[token]);
 const isCurrent=useCallback(()=>active.current?.token===token,[token]);
 const capture=useCallback(()=>{const lease=active.current;return()=>lease!==null&&lease.token===token&&active.current===lease;},[token]);
 return{isCurrent,capture,token};
}
