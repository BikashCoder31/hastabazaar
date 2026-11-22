import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { deliverOrderEmails, type OrderMailService } from '@/lib/email/order-updates';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readMessageResendTarget } from '@/lib/operations/admin-message-history';
import { deliverBusinessEmails } from '@/lib/operations/business-notifications';
import { EmailDeliveryOverviewError } from '@/lib/operations/email-delivery-overview';
import { auditManualEmailProcessing, EmailDeliveryAuthorizationError } from '@/lib/operations/manual-email-audit';

export async function POST(request: Request) {
  const reply = (value: Record<string, unknown>, status = 200) =>
    Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Request origin was not accepted.' }, 403);
  try {
    const actor = await requireStaffApi('email.delivery.manage');
    const body: unknown = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 1024)));
    if (!body || typeof body !== 'object' || !('kind' in body) || !('id' in body) ||
        (body.kind !== 'business' && body.kind !== 'order') ||
        typeof body.id !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(body.id))
      return reply({ error: 'Choose an email to resend.' }, 400);
    const { id, kind } = body;
    const config = env as unknown as { DB?: D1Database; EMAIL?: OrderMailService & { configured?: boolean }; APP_ORIGIN?: string };
    const db = requireDatabase(config);
    const now = Date.now();
    const target = await readMessageResendTarget(db, actor.id, kind, id, now);
    if (!target?.resendAllowed) return reply({ error: target?.permanentAddressFailure
      ? 'Check the address with them by phone.' : 'This email cannot be resent. Check its current status.' }, 409);
    if (target.nextAt > now) return reply({ state: 'scheduled', nextAt: target.nextAt }, 202);
    const { EMAIL: mail, APP_ORIGIN: origin } = config;
    if (!mail || mail.configured === false || !origin) return reply({ error: 'Email sending is not configured.' }, 503);

    const outcome = await auditManualEmailProcessing(db, actor.id, async () => {
      const options = { jobId: id, limit: 1 };
      if (kind === 'business') return deliverBusinessEmails(db, mail, origin, options);
      const result = await deliverOrderEmails(db, mail, origin, options);
      return { ...result, accepted: result.sent };
    }, crypto.randomUUID(), Date.now, kind, id);
    return reply({ state: outcome.accepted ? 'processed' : outcome.failed ? 'failed' : 'review' });
  } catch (error) {
    if (error instanceof StaffAuthorizationError || error instanceof EmailDeliveryAuthorizationError ||
        error instanceof EmailDeliveryOverviewError)
      return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: 'Request too large.' }, 413);
    if (error instanceof SyntaxError) return reply({ error: 'Choose an email to resend.' }, 400);
    return reply({ error: 'Check the email status before trying again.' }, 503);
  }
}
