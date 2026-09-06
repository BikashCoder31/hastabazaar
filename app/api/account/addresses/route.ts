import { env } from 'cloudflare:workers';

import { CustomerAuthorizationError, requireCustomerApi } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { CustomerDataConflictError, saveCustomerAddress, type CustomerAddressInput } from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const customer = await requireCustomerApi();
    const body = await request.json().catch(() => null) as { address?: CustomerAddressInput; idempotencyKey?: string } | null;
    if (!body?.address || !body.idempotencyKey || body.idempotencyKey.length > 100) return Response.json({ error: 'Address and idempotency key are required.' }, { status: 400 });
    const id = await saveCustomerAddress(requireDatabase(env as unknown as { DB?: D1Database }), { userId: customer.userId, input: body.address, requestId: body.idempotencyKey, now: Date.now() });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CustomerDataConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'The address could not be saved.' }, { status: 500 });
  }
}
