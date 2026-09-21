import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { createFixedSupplyRecord, FixedSupplyError } from '@/lib/managed-commerce/fixed-supply';
import { RouteTransitionError, submitRegisteredSellerTransition } from '@/lib/managed-commerce/route-transition';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body,{status,headers:{'cache-control':'no-store'}});
const value = (body:Record<string,unknown>,key:string) => typeof body[key]==='string' ? body[key] as string : '';

export async function POST(request:Request){
  if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
  try{
    const seller=await requireSellerApi();
    const body=JSON.parse(new TextDecoder().decode(await readBoundedBody(request,24*1024))) as Record<string,unknown>;
    const bindings=env as unknown as Record<string,string>;
    const environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
    const database=requireDatabase(env as unknown as {DB?:D1Database});
    const now=Date.now(),requestId=value(body,'requestId')||crypto.randomUUID();
    if(body.action==='propose_fixed_supply'){
      const id=await createFixedSupplyRecord(database,{sellerId:seller.sellerId,productId:value(body,'productId'),quantity:Number(body.quantity),agreedUnitPaisa:Number(body.agreedUnitPaisa),createdBy:seller.userId,agreementVersion:value(body,'agreementVersion'),agreementLanguage:body.agreementLanguage==='en'?'en':'ne',payoutBeneficiaryReference:value(body,'payoutBeneficiaryReference'),requestId,now,environment});
      return reply({ok:true,id,simulation:true});
    }
    if(body.action==='request_registered_transition'){
      const evidence=Array.isArray(body.evidenceReferences)?body.evidenceReferences.filter((item):item is string=>typeof item==='string'):value(body,'evidenceReferences').split('\n').map(item=>item.trim()).filter(Boolean);
      const taxMode=body.taxMode==='VAT'?'VAT':body.taxMode==='BOTH'?'BOTH':'PAN';
      const id=await submitRegisteredSellerTransition(database,{sellerId:seller.sellerId,actorId:seller.userId,legalName:value(body,'legalName'),registrationAuthority:value(body,'registrationAuthority'),registrationNumber:value(body,'registrationNumber'),taxMode,taxRegistrationNumber:value(body,'taxRegistrationNumber'),evidenceReferences:evidence,agreementVersion:value(body,'agreementVersion'),agreementLanguage:body.agreementLanguage==='en'?'en':'ne',agreementAcceptedAt:now,requestId,now,environment});
      return reply({ok:true,id,simulation:true});
    }
    return reply({error:'Select a supported Managed Maker action.'},400);
  }catch(error){
    if(error instanceof SellerAuthorizationError)return reply({error:error.message},error.status);
    if(error instanceof BodyTooLargeError)return reply({error:error.message},413);
    if(error instanceof SyntaxError)return reply({error:'Invalid request.'},400);
    if(error instanceof FixedSupplyError||error instanceof RouteTransitionError||error instanceof RangeError||error instanceof TypeError)return reply({error:error.message},409);
    return reply({error:'The simulated Managed Maker action could not be completed.'},500);
  }
}
