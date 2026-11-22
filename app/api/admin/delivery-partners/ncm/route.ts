import { env } from 'cloudflare:workers';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireExistingStaffIntentApi } from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import { changeNcmSettings, NcmSettingsError } from '@/lib/delivery/ncm-settings';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { NcmApiError } from '@/lib/shipping/nepal-can-move';

export async function POST(request: Request) {
  const reply = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site request rejected.' }, 403);
  try {
    const staff = await requireExistingStaffIntentApi(request, 'order.manage');
    if (staff.role !== 'super_admin') return reply({error: 'Super Admin access is required.'}, 403);
    const { partnerId, requestId, action, revision, deliveryType, packageName, pickupAddressId, addressUpdatedAt, branch } =
      await readBoundedJsonObject(request);
    if (typeof partnerId !== 'string' || typeof requestId !== 'string' ||
      (action !== 'test' && action !== 'refresh' && action !== 'settings' && action !== 'map'))
      return reply({error: 'Check the NCM settings and try again.'}, 400);
    const db = requireDatabase(env as unknown as {DB?: D1Database});
    return reply(await changeNcmSettings(db, env, staff.id,
      {partnerId, requestId, action, revision, deliveryType, packageName, pickupAddressId, addressUpdatedAt, branch}));
  } catch (error) {
    if (error instanceof StaffAuthorizationError || error instanceof NcmSettingsError)
      return reply({error: error.message}, error.status);
    if (error instanceof NcmApiError) return reply({error: error.message}, 502);
    if (error instanceof BodyTooLargeError) return reply({error: 'The request is too large.'}, 413);
    if (error instanceof SyntaxError) return reply({error: 'Check the NCM settings and try again.'}, 400);
    return reply({error: 'The NCM settings could not be confirmed. Refresh and review the current values.'}, 409);
  }
}
