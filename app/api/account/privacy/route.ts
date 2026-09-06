import { env } from 'cloudflare:workers';
import {
  CustomerAuthorizationError,
  requireCustomerApi,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import {
  createDataRightsRequest,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const customer = await requireCustomerApi();
    const body = (await request.json()) as {
      requestType?: string;
      detail?: string;
      requestId?: string;
    };
    if (!body.requestId || body.requestId.length > 100)
      return Response.json(
        { error: 'Request identifier is required.' },
        { status: 400 },
      );
    const id = await createDataRightsRequest(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        customerId: customer.userId,
        requestType: body.requestType ?? '',
        detail: body.detail ?? '',
        requestId: body.requestId,
        now: Date.now(),
      },
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Privacy request could not be submitted.' },
      { status: 500 },
    );
  }
}
