import { auditManualEmailProcessing, EmailDeliveryAuthorizationError } from '@/lib/operations/manual-email-audit';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import type { OrderMailService } from '@/lib/email/order-updates';
import { deliverBusinessEmails } from '@/lib/operations/business-notifications';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Request origin was not accepted.' },
      { status: 403, headers },
    );
  try {
    const actor = await requireStaffApi('email.delivery.manage');
    await readBoundedBody(request, 1024);
    const config = env as unknown as {
      DB?: D1Database;
      EMAIL?: OrderMailService & { configured?: boolean };
      APP_ORIGIN?: string;
    };
    if (
      !config.EMAIL ||
      config.EMAIL.configured === false ||
      !config.APP_ORIGIN
    )
      return Response.json(
        { error: 'Email sending is not configured.' },
        { status: 503, headers },
      );
    const db = requireDatabase(config);
    const mail = config.EMAIL;
    const origin = config.APP_ORIGIN;
    const result = await auditManualEmailProcessing(db, actor.id,
      () => deliverBusinessEmails(db, mail, origin, { limit: 6 }),
      crypto.randomUUID(), Date.now, 'business');
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof StaffAuthorizationError || error instanceof EmailDeliveryAuthorizationError
            ? error.message
            : 'Business email processing is unavailable.',
      },
      {
        status:
          error instanceof StaffAuthorizationError || error instanceof EmailDeliveryAuthorizationError
            ? error.status
            : error instanceof BodyTooLargeError
              ? 413
              : 503,
        headers,
      },
    );
  }
}
