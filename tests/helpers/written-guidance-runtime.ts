import './seller-registration-runtime';
import {registerHooks} from 'node:module';
// Presentation/navigation seams only. The actual native registration/terms
// reads and real registration form/hooks remain in the server-rendered page.
registerHooks({resolve(specifier,context,next){
 if(specifier==='next/image')return{url:new URL('../../node_modules/vinext/dist/shims/image.js',import.meta.url).href,shortCircuit:true};
 const code=specifier==='@/components/layout/site-header'?'export const SiteHeader=()=>null':specifier==='@/components/layout/site-footer'?'export const SiteFooter=()=>null':specifier==='next/navigation'?'export const useRouter=()=>({refresh(){},push(){}});export function redirect(){throw new Error("Protected guidance destination denied")};export const usePathname=()=>"/sell/apply";export const useSearchParams=()=>new URLSearchParams()':specifier==='next/link'?'import React from '+JSON.stringify(import.meta.resolve('react'))+';export default function Link({children,...props}){return React.createElement("a",props,children)}':null;
 return code?{url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true}:next(specifier,context);
}});

