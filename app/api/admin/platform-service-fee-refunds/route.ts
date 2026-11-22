import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import {authorizeLawfulFeeRefund,RefundObligationError} from '@/lib/payments/refund-obligations';

const json = (body: unknown, status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return json({error:'Request origin was not accepted.'},403);
  try {
    const staff = await requireStaffApi('business_settings.manage');
    if (staff.role !== 'super_admin') return json({error:'Super Admin access is required.'},403);
    const body = await readBoundedJsonObject(request);
    if(body.sourceFormId!=='system.platform-service-fee-refund' || Object.keys(body).some(key=>!['sourceFormId','orderId','amountPaisa','legalBasis','caseReference','evidenceReference','requestId'].includes(key)))
      return json({error:'Invalid fixed fee refund control.'},400);
    if (typeof body.orderId!=='string' || typeof body.amountPaisa!=='number' || typeof body.legalBasis!=='string' || typeof body.caseReference!=='string' || typeof body.evidenceReference!=='string' || typeof body.requestId!=='string')
      return json({error:'Complete the saved fee, legal basis, case and decision evidence.'},400);
    return json(await authorizeLawfulFeeRefund(requireDatabase(env as unknown as {DB?:D1Database}),{actorId:staff.id,requestId:body.requestId,expectedRevision:null,now:Date.now()},{orderId:body.orderId,amountPaisa:body.amountPaisa,legalBasis:body.legalBasis,caseReference:body.caseReference,evidenceReference:body.evidenceReference}));
  } catch(error) {
    if(error instanceof StaffAuthorizationError) return json({error:error.message},error.status);
    if(error instanceof RefundObligationError) return json({error:error.message},error.status);
    if(error instanceof BodyTooLargeError) return json({error:'Request too large.'},413);
    if(error instanceof SyntaxError) return json({error:'Invalid request.'},400);
    return json({error:'The fee refund could not be recorded.'},503);
  }
}

export async function GET(request:Request){try{const staff=await requireStaffApi('business_settings.manage');if(staff.role!=='super_admin')return json({error:'Super Admin access is required.'},403);const query=new URL(request.url).searchParams,attempt=query.get('attempt'),order=query.get('order');if(!attempt||!order||attempt.length>191||order.length>120)return json({error:'Use the original order and saved request.'},400);const result=await requireDatabase(env as unknown as {DB?:D1Database}).prepare("SELECT command_result_json AS result FROM audit_logs WHERE actor_id=? AND request_id=? AND subject_id=? AND action='refund.obligation.fee_authorized' AND command_key IS NOT NULL").bind(staff.id,attempt,order).first<{result:string}>();return json({outcome:result?JSON.parse(result.result):null});}catch(error){return json({error:error instanceof StaffAuthorizationError?error.message:'The fee authorization could not be checked.'},error instanceof StaffAuthorizationError?error.status:503);}}
