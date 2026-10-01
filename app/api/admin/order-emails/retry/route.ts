import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { auditManualOrderEmailProcessing } from '@/lib/operations/manual-email-audit';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { sendPendingOrderUpdates } from '@/lib/email/send-order-updates';
export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Request origin was not accepted.' },
      { status: 403, headers },
    );
  try {
    const actor = await requireStaffApi('order.manage');
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    return Response.json(await auditManualOrderEmailProcessing(db, actor.id, () => sendPendingOrderUpdates({ limit: 6 })), {
      headers,
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof StaffAuthorizationError
            ? e.message
            : 'Retry is unavailable.',
      },
      {
        status: e instanceof StaffAuthorizationError ? e.status : 503,
        headers,
      },
    );
  }
}
