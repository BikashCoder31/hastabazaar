import { env } from 'cloudflare:workers';

import { StaffAuthorizationError, requireStaffApi } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  SellerGovernanceConflictError,
  applySellerRestriction,
  runSellerDeletionPreflight,
  type ExistingObligationMode,
  type SellerRestrictionMode,
} from '@/lib/db/repositories/seller-governance';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isTrustedMutationRequest(request)) {
    return reply({ error: 'Request origin was not accepted.' }, 403);
  }

  try {
    const staff = await requireStaffApi('seller.suspend');
    const { id } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return reply({ error: 'Invalid seller.' }, 400);
    }

    const raw = await request.text();
    if (raw.length > 5_000) {
      return reply({ error: 'Request is too large.' }, 413);
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const requestId =
      typeof body.requestId === 'string' && body.requestId.length <= 150
        ? body.requestId
        : crypto.randomUUID();

    if (body.action === 'deletion_preflight') {
      return reply(
        await runSellerDeletionPreflight(database, {
          sellerId: id,
          actorId: staff.id,
          requestId,
          now: Date.now(),
        }),
      );
    }
    if (body.action !== 'set_restriction') {
      return reply({ error: 'Select a supported governance action.' }, 400);
    }

    return reply({
      restriction: await applySellerRestriction(database, {
        sellerId: id,
        actorId: staff.id,
        mode: body.mode as SellerRestrictionMode,
        suspendedUntil:
          typeof body.suspendedUntil === 'number' ? body.suspendedUntil : null,
        obligationMode: body.obligationMode as ExistingObligationMode,
        reasonCode: typeof body.reasonCode === 'string' ? body.reasonCode : '',
        reason: typeof body.reason === 'string' ? body.reason : '',
        expectedVersion:
          typeof body.expectedVersion === 'number' ? body.expectedVersion : -1,
        requestId,
        now: Date.now(),
      }),
    });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return reply({ error: error.message }, error.status);
    }
    if (error instanceof SellerGovernanceConflictError) {
      return reply({ error: error.message }, 409);
    }
    if (error instanceof SyntaxError) {
      return reply({ error: 'Invalid request.' }, 400);
    }
    console.error('Seller governance action failed', error);
    return reply(
      { error: 'The seller governance action could not be completed.' },
      500,
    );
  }
}
