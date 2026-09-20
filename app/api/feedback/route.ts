import { env } from 'cloudflare:workers';

import { requireDatabase } from '@/lib/db/d1';
import { sendCustomerFeedbackEmail } from '@/lib/email/customer-feedback';
import { validateCustomerFeedback } from '@/lib/feedback/customer-feedback';
import { readBoundedForm } from '@/lib/http/bounded-body';
import {
  consumePublicRequestRateLimit,
  consumeRequestRateLimit,
  rateLimitJson,
} from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403, headers: noStoreHeaders },
    );
  }

  let form: FormData;
  try {
    form = await readBoundedForm(request, 16 * 1024);
  } catch {
    return Response.json(
      { error: 'The submitted form is invalid or too large.' },
      { status: 413, headers: noStoreHeaders },
    );
  }

  // Bots commonly populate this visually hidden field. Return a neutral success
  // response without sending mail so the endpoint does not become a spam relay.
  if (form.get('website')) {
    return Response.json({ ok: true }, { headers: noStoreHeaders });
  }

  const validation = validateCustomerFeedback(form);
  if (!validation.ok) {
    return Response.json(
      { error: validation.error },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const networkLimit = await consumePublicRequestRateLimit(database, request, {
    scope: 'public-feedback',
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!networkLimit.allowed) return rateLimitJson(networkLimit);

  const addressLimit = await consumeRequestRateLimit(database, request, {
    scope: `public-feedback:${validation.feedback.email}`,
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!addressLimit.allowed) return rateLimitJson(addressLimit);

  try {
    await sendCustomerFeedbackEmail(validation.feedback);
    return Response.json({ ok: true }, { headers: noStoreHeaders });
  } catch {
    return Response.json(
      {
        error:
          'Your query could not be sent right now. Please try again later or use the contact page.',
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
