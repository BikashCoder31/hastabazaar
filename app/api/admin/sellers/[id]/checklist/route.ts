import { env } from 'cloudflare:workers';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireExistingStaffIntentApi } from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { ChecklistRequestError, requestSellerChecklistItem } from '@/lib/sellers/shop-checklist-notices';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const staff = await requireExistingStaffIntentApi(request, 'seller.application.review');
    if (staff.role !== 'super_admin') return reply({ error: 'Super Admin review is required.' }, 403);
    const [body, { id }] = await Promise.all([readBoundedJsonObject(request), params]);
    if (Object.keys(body).some(key => !['itemId', 'note', 'requestId', 'remind'].includes(key)) ||
      typeof body.itemId !== 'string' || typeof body.note !== 'string' || typeof body.requestId !== 'string' || typeof body.remind !== 'boolean')
      return reply({ error: 'Enter a valid seller checklist request.' }, 400);
    await requestSellerChecklistItem(requireDatabase(env as unknown as { DB?: D1Database }), {
      sellerId: id, actorId: staff.id, authSubject: staff.authSubject, itemId: body.itemId, note: body.note,
      requestId: body.requestId, remind: body.remind, now: Date.now(),
    });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError || error instanceof ChecklistRequestError) return reply({ error: error.message }, error.status);
    return reply({ error: 'The message could not be confirmed. Keep the note and try again.' }, 503);
  }
}
