import { env } from 'cloudflare:workers';
import {
  requireExistingCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { ContactVerificationError } from '@/lib/auth/contact-verification';
import {
  readLocalContactCaptures,
  localCaptureAvailable,
  type ContactDeliveryEnvironment,
} from '@/lib/auth/contact-delivery';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const actor = await requireExistingCustomerApi();
    const environment = env as unknown as ContactDeliveryEnvironment & {
      DB?: D1Database;
    };
    if (!localCaptureAvailable(environment, request))
      return Response.json(
        { error: 'Local capture is unavailable.' },
        { status: 403, headers },
      );
    return Response.json(
      {
        captures: await readLocalContactCaptures(
          requireDatabase(environment),
          environment,
          actor,
        ),
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ContactVerificationError ||
          error instanceof CustomerAuthorizationError
            ? error.message
            : 'Local capture is unavailable.',
      },
      {
        status:
          error instanceof ContactVerificationError ||
          error instanceof CustomerAuthorizationError
            ? error.status
            : 503,
        headers,
      },
    );
  }
}
