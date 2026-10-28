import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { recordLawfulServiceFeeRefund, ServiceFeeRefundConflict } from '@/lib/db/repositories/platform-service-fee-refunds';

const json = (body: unknown, status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return json({error:'Request origin was not accepted.'},403);
  try {
    const staff = await requireStaffApi('business_settings.manage');
    if (staff.role !== 'super_admin') return json({error:'Super Admin access is required.'},403);
    const body = await readBoundedJsonObject(request);
    if(body.sourceFormId!=='system.platform-service-fee-refund' || Object.keys(body).some(key=>!['sourceFormId','orderId','amountPaisa','legalBasis','caseReference','paymentReference','requestId'].includes(key)))
      return json({error:'Invalid fixed fee refund control.'},400);
    if (typeof body.orderId!=='string' || typeof body.amountPaisa!=='number' || typeof body.legalBasis!=='string' || typeof body.caseReference!=='string' || typeof body.paymentReference!=='string' || typeof body.requestId!=='string')
      return json({error:'Complete the saved fee, legal basis, case and payment reference.'},400);
    return json(await recordLawfulServiceFeeRefund(requireDatabase(env as unknown as {DB?:D1Database}),{orderId:body.orderId,amountPaisa:body.amountPaisa,legalBasis:body.legalBasis,caseReference:body.caseReference,paymentReference:body.paymentReference,requestId:body.requestId,actorId:staff.id,now:Date.now()}));
  } catch(error) {
    if(error instanceof StaffAuthorizationError) return json({error:error.message},error.status);
    if(error instanceof ServiceFeeRefundConflict) return json({error:error.message},409);
    if(error instanceof BodyTooLargeError) return json({error:'Request too large.'},413);
    if(error instanceof SyntaxError) return json({error:'Invalid request.'},400);
    return json({error:'The fee refund could not be recorded.'},503);
  }
}
