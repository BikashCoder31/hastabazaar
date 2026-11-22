import {registerHooks} from 'node:module';
declare global{var publicCheckoutDb:D1Database;var publicCheckoutActor:{userId:string;authSubject:string;email:string}|null;var publicCheckoutNcmDemoToken:string|undefined;var publicCheckoutNcmDemoPickupBranches:string|undefined;var publicCheckoutEnvironment:string|undefined;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.publicCheckoutDb},APP_ORIGIN:"https://public-checkout.test",get HASTABAZAAR_RUNTIME_ENV(){return globalThis.publicCheckoutEnvironment??"test"},get NCM_DEMO_API_TOKEN(){return globalThis.publicCheckoutNcmDemoToken},get NCM_DEMO_PICKUP_BRANCHES(){return globalThis.publicCheckoutNcmDemoPickupBranches},HASTABAZAAR_RELEASE_ID:"fictional-t31-checkout"}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(){throw new Error("Unexpected framework redirect in isolated API fixture")}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.publicCheckoutActor?{userId:globalThis.publicCheckoutActor.authSubject}:null};export async function requireAuthenticatedUser(){const actor=await getAuthenticatedUser();if(!actor)throw new Error("Authentication required");return actor}',shortCircuit:true};
 if(specifier==='@/lib/auth/customer')return{url:'data:text/javascript,export class CustomerAuthorizationError extends Error{constructor(message,status=401){super(message);this.status=status}};export async function getCustomerUser(){return globalThis.publicCheckoutActor};export async function requireExistingCustomerApi(){if(!globalThis.publicCheckoutActor)throw new CustomerAuthorizationError("Authentication required");return globalThis.publicCheckoutActor}',shortCircuit:true};
 // External mail is held: the real transaction/outbox stays intact and no provider is invoked.
 if(specifier==='@/lib/email/send-order-updates')return{url:'data:text/javascript,export async function sendPendingOrderUpdates(){}',shortCircuit:true};
 return next(specifier,context);
}});
