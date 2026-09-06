import { env } from 'cloudflare:workers';

import {
  requireStaffApi,
  StaffAuthorizationError,
} from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { revokeStaffInvitation } from '@/lib/db/repositories/staff';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  try {
    const staff = await requireStaffApi('admin.invite');
    const { id } = await context.params;
    const revoked = await revokeStaffInvitation(
      requireDatabase(env as unknown as { DB?: D1Database }),
      { invitationId: id, actorId: staff.id, now: Date.now() },
    );
    if (!revoked) {
      return json({ error: 'Only pending invitations can be revoked.' }, 409);
    }
    return json({ message: 'Invitation revoked.' }, 200);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'The invitation could not be revoked.' }, 500);
  }
}
