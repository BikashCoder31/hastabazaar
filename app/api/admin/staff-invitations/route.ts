import { env } from 'cloudflare:workers';

import {
  requireStaffApi,
  StaffAuthorizationError,
  type StaffRole,
} from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  createStaffInvitation,
  StaffInvitationConflictError,
} from '@/lib/db/repositories/staff';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  try {
    const staff = await requireStaffApi('admin.invite');
    const body = (await request.json()) as { email?: unknown; role?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role = body.role;
    if (!emailPattern.test(email) || email.length > 254) {
      return json({ error: 'Enter a valid staff email address.' }, 400);
    }
    if (role !== 'admin' && role !== 'super_admin') {
      return json({ error: 'Select a valid staff role.' }, 400);
    }

    const invitation = await createStaffInvitation(
      requireDatabase(env as unknown as { DB?: D1Database }),
      {
        email,
        role: role as StaffRole,
        invitedBy: staff.id,
        now: Date.now(),
      },
    );
    return json(
      {
        ...invitation,
        message: 'Access invitation created. No email was sent automatically.',
      },
      201,
    );
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof StaffInvitationConflictError) {
      return json({ error: error.message }, 409);
    }
    return json({ error: 'The staff invitation could not be created.' }, 500);
  }
}
