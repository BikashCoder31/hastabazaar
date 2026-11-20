import { env } from 'cloudflare:workers';

import { requireNotificationRecipientApi, NotificationRecipientError } from '@/lib/auth/notification-recipient';
import { requireDatabase } from '@/lib/db/d1';
import {
  markNotificationRead,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';

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
    const customer = await requireNotificationRecipientApi();
    if(hasActorIntentMismatch(request,customer.userId))return Response.json({error:'Your signed-in account changed. Refresh the notification workspace.'},{status:403});
    const { id } = await context.params;
    await markNotificationRead(
      requireDatabase(env as unknown as { DB?: D1Database }),
      customer.userId,
      id,
      Date.now(),
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof NotificationRecipientError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 404 });
    return Response.json(
      { error: 'Notification could not be updated.' },
      { status: 500 },
    );
  }
}
