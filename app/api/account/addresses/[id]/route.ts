import { env } from 'cloudflare:workers';

import { CustomerAuthorizationError, requireCustomerApi } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { CustomerDataConflictError, deleteCustomerAddress, saveCustomerAddress, type CustomerAddressInput } from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const [customer, { id }] = await Promise.all([requireCustomerApi(), context.params]);
    const body = await request.json().catch(() => null) as { address?: CustomerAddressInput; idempotencyKey?: string } | null;
    if (!body?.address || !body.idempotencyKey || id.length > 100) return Response.json({ error: 'Address and idempotency key are required.' }, { status: 400 });
    await saveCustomerAddress(requireDatabase(env as unknown as { DB?: D1Database }), { userId: customer.userId, addressId: id, input: body.address, requestId: body.idempotencyKey, now: Date.now() });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CustomerDataConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'The address could not be updated.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const [customer, { id }] = await Promise.all([requireCustomerApi(), context.params]);
    const body = await request.json().catch(() => null) as { idempotencyKey?: string } | null;
    if (!body?.idempotencyKey || id.length > 100) return Response.json({ error: 'Idempotency key is required.' }, { status: 400 });
    await deleteCustomerAddress(requireDatabase(env as unknown as { DB?: D1Database }), { userId: customer.userId, addressId: id, requestId: body.idempotencyKey, now: Date.now() });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CustomerDataConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'The address could not be deleted.' }, { status: 500 });
  }
}
