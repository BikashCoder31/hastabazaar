import {registerHooks} from 'node:module';
declare global{
 var registrationScopeDb:D1Database;
 var registrationScopeBucket:R2Bucket;
 var registrationScopeIdentity:{userId:string;email:string;mailboxVerified?:boolean}|null;
}
/** Only external identity/runtime/navigation are fixture seams. Real customer/terms/owner guards run. */
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.registrationScopeDb},get MEDIA(){return globalThis.registrationScopeBucket},APP_ORIGIN:"https://seller-registration-scope.test",HASTABAZAAR_RUNTIME_ENV:"test",HASTABAZAAR_RELEASE_ID:"fictional-registration-scope"}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.registrationScopeIdentity};export async function requireAuthenticatedUser(){if(!globalThis.registrationScopeIdentity)throw new Error("Fictional identity is absent");return globalThis.registrationScopeIdentity}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(){throw new Error("Unexpected framework redirect in registration fixture")}',shortCircuit:true};
 return next(specifier,context);
}});
