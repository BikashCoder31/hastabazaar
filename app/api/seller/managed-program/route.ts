import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { createFixedSupplyRecord, FixedSupplyError } from '@/lib/managed-commerce/fixed-supply';
import { RouteTransitionError } from '@/lib/managed-commerce/route-transition';
import { resolveRuntimeEnvironment } from '@/lib/staging/environment';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body,{status,headers:{'cache-control':'no-store'}});

export async function POST(request:Request){
  if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
  try{
    const seller=await requireSellerApi();
    const body=await readBoundedJsonObject(request) as Record<string,unknown>;
    const bindings=env as unknown as Record<string,string>;
    const environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
    const database=requireDatabase(env as unknown as {DB?:D1Database});
    if (!body || Array.isArray(body) || typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId) ||
      !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers))
      return reply({error:'The Managed Maker form request is invalid.'},400);
    const now=Date.now(),requestId=body.requestId;
    if(body.action==='propose_fixed_supply'){
      if (Object.keys(body).some((key)=>!['action','productId','quantity','agreedUnitNpr','agreedUnitPaisa','agreementVersion','agreementLanguage','payoutBeneficiaryReference','requestId','formVersion','customAnswers'].includes(key)) ||
        typeof body.productId!=='string' || typeof body.quantity!=='number' || typeof body.agreedUnitPaisa!=='number' ||
        body.agreedUnitNpr!==undefined && (typeof body.agreedUnitNpr!=='number' || Math.round(body.agreedUnitNpr*100)!==body.agreedUnitPaisa) ||
        typeof body.agreementVersion!=='string' || !['en','ne'].includes(String(body.agreementLanguage)) ||
        typeof body.payoutBeneficiaryReference!=='string') return reply({error:'Invalid supply proposal.'},400);
      const form=await validateSellerFormSubmission(database,'seller.managed-supply-proposal',body.formVersion,body.customAnswers,requestId);
      const id=await createFixedSupplyRecord(database,{sellerId:seller.sellerId,productId:body.productId,quantity:body.quantity,agreedUnitPaisa:body.agreedUnitPaisa,createdBy:seller.userId,agreementVersion:body.agreementVersion,agreementLanguage:body.agreementLanguage as 'en'|'ne',payoutBeneficiaryReference:body.payoutBeneficiaryReference,requestId,now,environment,form:{requestId,versionId:form.versionId,answers:form.answers}});
      return reply({ok:true,id,simulation:true});
    }
    if(body.action==='request_registered_transition')return reply({error:'Use the private registration and seller-terms form at /sell/application#registered-transition.'},400);
    return reply({error:'Select a supported Managed Maker action.'},400);
  }catch(error){
    if(error instanceof SellerAuthorizationError)return reply({error:error.message},error.status);
    if(error instanceof BodyTooLargeError)return reply({error:error.message},413);
    if(error instanceof SyntaxError)return reply({error:'Invalid request.'},400);
    if(error instanceof FormRequestConflictError)return reply({error:error.message},409);
    if(error instanceof FormRuntimeError)return reply({error:error.message,code:error.code},error.code==='stale_version'?409:503);
    if(error instanceof FormValidationError)return reply({error:error.message,fieldId:error.fieldId},400);
    if(error instanceof FixedSupplyError||error instanceof RouteTransitionError||error instanceof RangeError||error instanceof TypeError)return reply({error:error.message},409);
    return reply({error:'The simulated Managed Maker action could not be completed.'},500);
  }
}
