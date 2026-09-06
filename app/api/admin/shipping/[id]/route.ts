import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  operateShippingJob,
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
    const staff = await requireStaffApi('order.manage');
    const body = (await request.json()) as Record<string, string | undefined>;
    const { id } = await context.params;
    if (
      !body.requestId ||
      ![
        'record_label',
        'schedule_pickup',
        'picked_up',
        'in_transit',
        'delivered',
        'open_claim',
        'resolve_claim',
        'reconcile',
      ].includes(body.action ?? '')
    )
      return Response.json(
        { error: 'Valid action and request identifier are required.' },
        { status: 400 },
      );
    if (
      body.reconciliationStatus &&
      !['matched', 'variance', 'resolved'].includes(body.reconciliationStatus)
    )
      return Response.json(
        { error: 'Invalid reconciliation state.' },
        { status: 400 },
      );
    await operateShippingJob(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        jobId: id,
        actorId: staff.id,
        actorRole: staff.role,
        action: body.action!,
        note: body.note ?? '',
        labelReference: body.labelReference,
        trackingCode: body.trackingCode,
        claimReference: body.claimReference,
        reconciliationStatus: body.reconciliationStatus,
        requestId: body.requestId,
        now: Date.now(),
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Shipping job could not be updated.' },
      { status: 500 },
    );
  }
}
