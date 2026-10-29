import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { reviewSellerBankDetails, SellerBankError } from '@/lib/sellers/bank-details';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const staff = await requireStaffApi('seller.application.review');
    if (staff.role !== 'super_admin') return reply({ error: 'Super Admin review is required.' }, 403);
    const { id } = await context.params;
    const body = await readBoundedJsonObject(request);
    if (Object.keys(body).some(key => !['revision', 'reference', 'reason'].includes(key)) ||
      typeof body.revision !== 'string' || typeof body.reference !== 'string' || typeof body.reason !== 'string') return reply({ error: 'Invalid review.' }, 400);
    await reviewSellerBankDetails(requireDatabase(env as unknown as { DB?: D1Database }), { sellerId: id, actorId: staff.id,
      revision: body.revision, reference: body.reference, reason: body.reason, now: Date.now() });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError || error instanceof SellerBankError) return reply({ error: error.message }, error.status);
    return reply({ error: 'Bank review could not be confirmed. Reload before retrying.' }, 503);
  }
}
