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
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireStaffApi('admin.permissions.manage');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(
        new TextDecoder().decode(await readBoundedBody(request, 16 * 1024)),
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
        !Array.isArray(body.permissions) ||
        body.permissions.some((p) => typeof p !== 'string')
      )
        return json({ error: 'Select an Admin and valid permissions.' }, 400);
      const id = await proposeStaffPermissions(db, {
        actorId: actor.id,
        userId: body.userId,
        permissions: body.permissions,
        version: body.version,
        reason,
        presetName:
          typeof body.presetName === 'string' ? body.presetName : undefined,
        now: Date.now(),
      });
      return json(
        {
          id,
          message:
            'Proposal saved. Effective access changes only after a different active Super Admin approves.',
        },
        201,
      );
    }
    if (
      (body.action === 'approve' || body.action === 'reject') &&
      typeof body.requestId === 'string'
    ) {
      await decideStaffPermissions(db, {
        actorId: actor.id,
        requestId: body.requestId,
        decision: body.action,
        reason,
        now: Date.now(),
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
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
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
