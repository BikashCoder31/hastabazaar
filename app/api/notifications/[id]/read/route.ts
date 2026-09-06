import { env } from 'cloudflare:workers';

import {
  CustomerAuthorizationError,
  requireCustomerApi,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import {
  markNotificationRead,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const customer = await requireCustomerApi();
    const { id } = await context.params;
    await markNotificationRead(
      requireDatabase(env as unknown as { DB?: D1Database }),
      customer.userId,
      id,
      Date.now(),
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 404 });
    return Response.json(
      { error: 'Notification could not be updated.' },
      { status: 500 },
    );
  }
}
