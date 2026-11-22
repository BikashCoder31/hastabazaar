import { env } from 'cloudflare:workers';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireExistingStaffIntentApi } from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import { DeliveryPartnerError, saveDeliveryPartner } from '@/lib/delivery/partners';
import { deliveryPartnerStatuses } from '@/lib/delivery/partner-status';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export async function POST(request: Request) {
  const respond = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request)) return respond({ error: 'Cross-site request rejected.' }, 403);
  try {
    const staff = await requireExistingStaffIntentApi(request, 'order.manage');
    if (staff.role !== 'super_admin') return respond({ error: 'Super Admin access is required.' }, 403);
    const { id, name, status, bookingMode, collectsCod, trackingPattern, makeDefault, expectedRevision, requestId } =
      await readBoundedJsonObject(request);
    const option = deliveryPartnerStatuses.find(entry => entry.value === status);
    if (!option || typeof id !== 'string' || typeof name !== 'string' || typeof bookingMode !== 'string' ||
        typeof collectsCod !== 'boolean' || typeof trackingPattern !== 'string' || typeof makeDefault !== 'boolean' ||
        (expectedRevision !== null && typeof expectedRevision !== 'number') || typeof requestId !== 'string') {
      return respond({ error: 'Check the delivery partner details and try again.' }, 400);
    }
    const result = await saveDeliveryPartner(requireDatabase(env as unknown as { DB?: D1Database }), staff.id,
      { id, name, status: option.value, bookingMode, collectsCod, trackingPattern, makeDefault, expectedRevision, requestId, now: Date.now() });
    return respond(result);
  } catch (error) {
    if (error instanceof DeliveryPartnerError || error instanceof StaffAuthorizationError)
      return respond({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return respond({ error: 'The request is too large.' }, 413);
    if (error instanceof SyntaxError) return respond({ error: 'Check the delivery partner details.' }, 400);
    if (error instanceof Error && error.message === 'Request reference was already used for different command content.')
      return respond({ error: 'Refresh the delivery partner before trying again.' }, 409);
    return respond({ error: 'The partner update could not be confirmed. Try again with the same details.' }, 503);
  }
}
