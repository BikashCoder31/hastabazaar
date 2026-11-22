import {env} from 'cloudflare:workers';
import {getAuthenticatedUser} from '@/app/auth';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {PrivatePricingError,pricingSubject,pricingSubjectAuthority,getPrivatePriceInputs,savePrivatePriceInputs} from '@/lib/products/private-price-inputs';
import {getPriceScenarios} from '@/lib/products/price-scenarios';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
function failure(error:unknown,invoked=false){const phase=invoked?'outcome_unconfirmed':'rejected_before_write';if(error instanceof PrivatePricingError||error instanceof SellerCenterAuthorizationError)return reply({error:error.message,phase},error.status);if(error instanceof BodyTooLargeError)return reply({error:'Private inputs exceed the supported size.',phase},413);if(error instanceof SyntaxError)return reply({error:'Invalid private pricing request.',phase},400);return reply({error:'Private pricing is unavailable. Keep your entries and retry the same save request.',phase},503);}
async function ownerFor(request:Request,original?:{userId:string;authSubject:string}){
 const identity=await getAuthenticatedUser();if(!identity)throw new SellerCenterAuthorizationError('Sign in to reopen private pricing.',401);
 // The existing Seller Center lookup is read-only; no invitation acceptance or
 // customer provisioning is performed by these private input readers.
 const owner=await requireSellerCenterApi();
 if(owner.authSubject!==identity.userId||hasActorIntentMismatch(request,owner.userId)||original&&(owner.userId!==original.userId||owner.authSubject!==original.authSubject))throw new SellerCenterAuthorizationError('Current owner identity changed. Reopen the Product workspace.',403);
 return owner;
}
export async function GET(request:Request){try{const owner=await ownerFor(request),query=new URL(request.url).searchParams;if([...query.keys()].some(key=>!['kind','id','offerId'].includes(key)||query.getAll(key).length!==1))throw new PrivatePricingError('Use one exact pricing reference.',400);const subject=pricingSubject(Object.fromEntries(query)),db=requireDatabase(env as unknown as {DB?:D1Database});const inputs=await getPrivatePriceInputs(db,owner.userId,subject),scenarios=await getPriceScenarios(db,owner.userId,subject,Date.now());await ownerFor(request,owner);await pricingSubjectAuthority(db,owner.userId,subject,owner.authSubject);return reply({inputs,...scenarios});}catch(error){return failure(error);}}
export async function POST(request:Request){let invoked=false;if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.',phase:'rejected_before_write'},403);try{const owner=await ownerFor(request),body=await readBoundedJsonObject(request);if(Object.keys(body).some(key=>!['subject','cost','target','requestId','expectedRevision'].includes(key))||typeof body.cost!=='string'||typeof body.target!=='string'||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||!(body.expectedRevision===null||typeof body.expectedRevision==='string'&&/^\d+$/.test(body.expectedRevision)))throw new PrivatePricingError('Use bounded private inputs and their saved revision.',400);const db=requireDatabase(env as unknown as {DB?:D1Database}),subject=pricingSubject(body.subject);invoked=true;const result=await savePrivatePriceInputs(db,{actorId:owner.userId,authSubject:owner.authSubject,requestId:body.requestId,expectedRevision:body.expectedRevision,now:Date.now()},{subject,cost:body.cost,target:body.target});await ownerFor(request,owner);await pricingSubjectAuthority(db,owner.userId,subject,owner.authSubject);return reply(result);}catch(error){return failure(error,invoked);}}
