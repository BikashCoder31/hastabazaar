import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import { env } from 'cloudflare:workers';
import { requireSellerCenterApi, SellerCenterAuthorizationError } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerParticipationForUser } from '@/lib/db/repositories/seller-applications';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { requestDocumentChange, SellerDocumentReviewError } from '@/lib/sellers/document-review';

export async function POST(request:Request) {
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if (!isTrustedMutationRequest(request)) return reply({error:'Cross-site requests are not allowed.'},403);
  try {
    const customer=await requireSellerCenterApi();
    if(hasActorIntentMismatch(request,customer.userId))throw new SellerCenterAuthorizationError('The signed-in account changed. Reopen this document for your current account.',403);
    const db=requireDatabase(env as unknown as {DB?:D1Database});
    const profile=await getSellerParticipationForUser(db,customer.userId);
    if (!profile) return reply({error:'Seller application not found.'},404);
    const body=await readBoundedJsonObject(request);
    if (Object.keys(body).some(key=>!['documentId','reason','commandId'].includes(key)) || typeof body.documentId!=='string' || typeof body.reason!=='string' || body.commandId!==undefined&&typeof body.commandId!=='string') return reply({error:'Invalid request.'},400);
    const requestId=await requestDocumentChange(db,{sellerId:profile.sellerId,documentId:body.documentId,actorId:customer.userId,reason:body.reason,commandId:body.commandId as string|undefined,now:Date.now()});
    return reply({ok:true,requestId});
  } catch(error) {
    if (error instanceof SellerCenterAuthorizationError || error instanceof SellerDocumentReviewError) return reply({error:error.message},error.status);
    return reply({error:'Request could not be confirmed. Keep the reason and retry the same submission.'},503);
  }
}
