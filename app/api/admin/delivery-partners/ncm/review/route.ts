import { env } from 'cloudflare:workers';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireExistingStaffIntentApi } from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import { completeNcmReview } from '@/lib/delivery/ncm-progress';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export async function POST(request: Request) {
  const reply = (data:unknown,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if (!isTrustedMutationRequest(request)) return reply({error:'Cross-site request rejected.'},403);
  try {
    const staff = await requireExistingStaffIntentApi(request,'order.manage');
    if (staff.role !== 'super_admin') return reply({error:'Super Admin access is required.'},403);
    const {eventId,requestId} = await readBoundedJsonObject(request);
    if (typeof eventId !== 'string' || !/^ncm-[a-f0-9]{64}$/.test(eventId) ||
      typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))
      return reply({error:'Refresh the order and choose a request to review.'},400);
    await completeNcmReview(requireDatabase(env as unknown as {DB?:D1Database}),staff.id,eventId,requestId);
    return reply({ok:true});
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return reply({error:error.message},error.status);
    if (error instanceof BodyTooLargeError) return reply({error:'The request is too large.'},413);
    if (error instanceof SyntaxError) return reply({error:'Check the review details.'},400);
    return reply({error:'The review could not be recorded. Refresh the order and try again.'},409);
  }
}
