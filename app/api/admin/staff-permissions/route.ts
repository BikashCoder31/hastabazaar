import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  decideStaffPermissions,
  proposeStaffPermissions,
  StaffPermissionConflictError,
} from '@/lib/db/repositories/staff-permissions';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  let validated: { formId: 'staff.staff-permission-1' | 'staff.staff-permission-2'; versionId: string } | undefined;
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireStaffApi('admin.permissions.manage');
    if (actor.role !== 'super_admin') return json({ error: 'Only a Super Admin can manage staff permissions.' }, 403);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(request, 256 * 1024)),
      );
      if (!body || Array.isArray(body) || typeof body !== 'object')
        throw new Error();
    } catch (error) {
      return json(
        {
          error:
            error instanceof BodyTooLargeError
              ? error.message
              : 'Invalid request.',
        },
        error instanceof BodyTooLargeError ? 413 : 400,
      );
    }
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const reason = typeof body.reason === 'string' ? body.reason : '';
    if (body.action === 'propose') {
      if (
        typeof body.userId !== 'string' ||
        typeof body.version !== 'number' ||
        typeof body.requestId !== 'string' ||
        !Array.isArray(body.permissions) ||
        body.permissions.some((p) => typeof p !== 'string')
      )
        return json({ error: 'Select an Admin and valid permissions.' }, 400);
      const configured = await validateSellerFormSubmission(db, 'staff.staff-permission-1',
        body.formVersion, body.customAnswers, body.requestId);
      validated = { formId: 'staff.staff-permission-1', versionId: configured.versionId };
      const id = await proposeStaffPermissions(db, {
        actorId: actor.id,
        userId: body.userId,
        permissions: body.permissions,
        version: body.version,
        reason,
        presetName:
          typeof body.presetName === 'string' ? body.presetName : undefined,
        now: Date.now(),
        requestId: body.requestId,
        form: { requestId: body.requestId, versionId: configured.versionId, answers: configured.answers },
      });
      return json(
        {
          id,
          message: 'Permissions saved. Effective access applies on the next request.',
        },
        201,
      );
    }
    if (
      (body.action === 'approve' || body.action === 'reject') &&
      typeof body.requestId === 'string' && typeof body.formRequestId === 'string'
    ) {
      const configured = await validateSellerFormSubmission(db, 'staff.staff-permission-2',
        body.formVersion, body.customAnswers, body.formRequestId);
      validated = { formId: 'staff.staff-permission-2', versionId: configured.versionId };
      await decideStaffPermissions(db, {
        actorId: actor.id,
        requestId: body.requestId,
        decision: body.action,
        reason,
        now: Date.now(),
        formRequestId: body.formRequestId,
        form: { requestId: body.formRequestId, versionId: configured.versionId, answers: configured.answers },
      });
      return json(
        {
          message:
            body.action === 'approve'
              ? 'Approved. Effective permissions apply on the next request.'
              : 'Request rejected; effective access is unchanged.',
        },
        200,
      );
    }
    return json({ error: 'Select a valid action.' }, 400);
  } catch (error) {
    if (validated && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }), validated.formId, validated.versionId))
      return json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof StaffPermissionConflictError)
      return json({ error: error.message }, 409);
    return json(
      {
        error:
          'Permission change could not be completed. Check the selected permissions and refresh.',
      },
      400,
    );
  }
}
