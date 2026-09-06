import { env } from 'cloudflare:workers';

import { CustomerAuthorizationError, requireCustomerApi } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { CustomerDataConflictError, updateCustomerProfile } from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const customer = await requireCustomerApi();
    const body = await request.json().catch(() => null) as { displayName?: string; phone?: string; locale?: string; idempotencyKey?: string } | null;
    if (!body?.idempotencyKey || body.idempotencyKey.length > 100 || !['en-NP', 'ne-NP'].includes(body.locale ?? '')) return Response.json({ error: 'Valid profile values and idempotency key are required.' }, { status: 400 });
    await updateCustomerProfile(requireDatabase(env as unknown as { DB?: D1Database }), {
      userId: customer.userId,
      displayName: body.displayName ?? '',
      phone: body.phone ?? '',
      locale: body.locale as 'en-NP' | 'ne-NP',
      requestId: body.idempotencyKey,
      now: Date.now(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CustomerDataConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'The profile could not be updated.' }, { status: 500 });
  }
}
