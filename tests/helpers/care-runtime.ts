import {registerHooks} from 'node:module';
declare global{var careBrowserDb:D1Database;var careBrowserActor:string;var careBrowserIdentity:{userId:string;email:string}|null|undefined;var careBrowserAuthority:(permission?:string)=>Promise<{id:string;role:'admin'|'super_admin'}>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.careBrowserDb},APP_ORIGIN:"https://care-scope.test",HASTABAZAAR_RUNTIME_ENV:"test",HASTABAZAAR_RELEASE_ID:"fictional-care-scope"}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(){throw new Error("Unexpected framework redirect in care fixture")}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.careBrowserIdentity===undefined?{userId:globalThis.careBrowserActor}:globalThis.careBrowserIdentity};export async function requireAuthenticatedUser(){return getAuthenticatedUser()}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(permission){try{return await globalThis.careBrowserAuthority(permission)}catch{throw new StaffAuthorizationError("Current case permission is required")}}',shortCircuit:true};
 return next(specifier,context);
}});
