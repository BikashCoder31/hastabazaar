import { env } from 'cloudflare:workers';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireStaffIntentApi } from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { reviewDocumentChange, SellerDocumentReviewError,readDocumentAdminOutcome } from '@/lib/sellers/document-review';
import {documentAdminOutcomeGET,confirmDocumentAdminActor,documentAdminErrorReference,type DocumentAdminReference} from '@/lib/sellers/document-admin-api';

export async function GET(request:Request,context:{params:Promise<{id:string}>}){return documentAdminOutcomeGET(request,context,'permission');}

export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if (!isTrustedMutationRequest(request)) return reply({error:'Cross-site requests are not allowed.'},403);
  let reference:DocumentAdminReference|undefined;
  try {
    const staff=await requireStaffIntentApi(request,'seller.application.review');
    if (staff.role!=='super_admin') return reply({error:'Super Admin review is required.'},403);
    const body=await readBoundedJsonObject(request);
    if (Object.keys(body).some(key=>!['decision','reason','commandId','expectedOperationId'].includes(key)) || (body.decision!=='approve' && body.decision!=='reject') || typeof body.reason!=='string' || body.commandId!==undefined&&typeof body.commandId!=='string' || body.expectedOperationId!=null&&typeof body.expectedOperationId!=='string') return reply({error:'Invalid review.'},400);
    const sourceId=(await context.params).id,commandId=typeof body.commandId==='string'?body.commandId:crypto.randomUUID();
    if(!sourceId||sourceId.length>191||!commandId.trim()||commandId.length>191)return reply({error:'Select an exact request and command reference.'},400);
    reference={actorId:staff.id,action:'permission',sourceId,requestId:commandId};
    const db=requireDatabase(env as unknown as {DB?:D1Database});
    await reviewDocumentChange(db,{requestId:sourceId,actorId:staff.id,actorAuthSubject:staff.authSubject,decision:body.decision,reason:body.reason,commandId,expectedOperationId:body.expectedOperationId as string|null|undefined,now:Date.now()});
    const outcome=await readDocumentAdminOutcome(db,{actorId:staff.id,actorAuthSubject:staff.authSubject,commandId,action:'permission',sourceId,now:Date.now()});
    await confirmDocumentAdminActor(request,staff);
    return outcome?reply(outcome):reply({...documentAdminErrorReference(null,reference),recorded:false,code:'outcome_unconfirmed',error:'The original permission outcome could not be confirmed.'},503);
  } catch(error) {
    if (error instanceof StaffAuthorizationError || error instanceof SellerDocumentReviewError) return reply({...documentAdminErrorReference(error,reference),error:error.message},error.status);
    return reply({...documentAdminErrorReference(error,reference),error:'Review could not be confirmed. Keep the note and retry the same decision.'},503);
  }
}
