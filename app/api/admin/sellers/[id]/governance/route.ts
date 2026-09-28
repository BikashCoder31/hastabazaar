import { readBoundedJsonObject } from '@/lib/http/form-json-body';
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
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

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

  let validatedVersionId: string | undefined;
  try {
    const staff = await requireStaffApi('seller.suspend');
    const { id } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return reply({ error: 'Invalid seller.' }, 400);
    }

    const body = await readBoundedJsonObject(request) as Record<string, unknown>;
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
    if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))
      return reply({ error: 'A stable request reference is required.' }, 400);
    const form = await validateSellerFormSubmission(database, 'staff.seller-governance',
      body.formVersion, body.customAnswers, body.requestId);
    validatedVersionId = form.versionId;

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
        form: { versionId: form.versionId, answers: form.answers },
      }),
    });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return reply({ error: error.message }, error.status);
    }
    if (error instanceof BodyTooLargeError) return reply({ error: error.message }, 413);
    if (error instanceof FormRuntimeError)
      return reply({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return reply({ error: error.message, fieldId: error.fieldId }, 400);
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }), 'staff.seller-governance', validatedVersionId))
      return reply({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
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
