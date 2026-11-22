import {BodyTooLargeError} from '../http/bounded-body';
import {CategoryContractError} from './category-contracts';
import {OfferError} from './offer-contracts';
import {PrivatePricingError} from './private-price-inputs';
import {hasActorIntentMismatch} from '../http/actor-intent';
export const intakeReply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export type ProductMutationPhase='rejected_before_write'|'outcome_unconfirmed';
export function productMutationBoundary(){let invoked=false;return{get phase():ProductMutationPhase{return invoked?'outcome_unconfirmed':'rejected_before_write';},begin(){invoked=true;}};}
export function intakeErrorReply(error:string,status:number,phase?:ProductMutationPhase){return intakeReply({error,...(phase?{phase,...([401,403].includes(status)&&phase==='rejected_before_write'?{code:'access_denied_before_write'}:{})}:{})},status);}
export function intakeFailure(error:unknown,phase?:ProductMutationPhase){
 if(error instanceof CategoryContractError||error instanceof OfferError||error instanceof PrivatePricingError)return intakeErrorReply(error.message,error.status,phase);
 if(error instanceof BodyTooLargeError)return intakeErrorReply(error.message,413,phase);
 if(error instanceof SyntaxError)return intakeErrorReply('Invalid product workspace request.',400,phase);
 return intakeErrorReply('The outcome is unavailable. Retain your entries and retry the same request.',503,phase);
}
export function closedIntakeFields(body:Record<string,unknown>,allowed:readonly string[]){if(Object.keys(body).some(key=>!allowed.includes(key)))throw new CategoryContractError('Use only the supported product workspace fields.',400);}
export function intakeId(value:unknown):value is string{return typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);}
/** Optional UI intent is never authority; an old tab cannot submit as a newly signed-in actor. */
export function intakeActor(request:Request,actorId:string){if(hasActorIntentMismatch(request,actorId))throw new CategoryContractError('The signed-in Product account changed. Open the original record with the intended account.',403);}
export function intakeCommand(body:Record<string,unknown>,actorId:string,request?:Request){
 if(request)intakeActor(request,actorId);
 if(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||!(body.expectedRevision===null||typeof body.expectedRevision==='string'&&/^\d{1,16}$/.test(body.expectedRevision)))throw new CategoryContractError('Keep the original request reference and expected revision.',400);
 return {actorId,requestId:body.requestId,expectedRevision:body.expectedRevision as string|null,now:Date.now()};
}
export function intakeQuery(request:Request,allowed:readonly string[]){const query=new URL(request.url).searchParams;if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))throw new CategoryContractError('Use one supported reference for this workspace request.',400);return query;}
