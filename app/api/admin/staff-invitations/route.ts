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
import { sendStaffInvitationEmail } from '@/lib/email/staff-invitation';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  let validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  try {
    const staff = await requireStaffApi('admin.invite');
    if (staff.role !== 'super_admin') return json({ error: 'Only a Super Admin can invite staff.' }, 403);
    let body: {
      email?: unknown; role?: unknown; requestId?: unknown; formVersion?: unknown; customAnswers?: unknown;
    };
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(request, 256 * 1024))); }
    catch (error) { if (error instanceof BodyTooLargeError) throw error;
      return json({ error: 'Invalid invitation request.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId))
      return json({ error: 'A valid invitation request reference is required.' }, 400);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role = body.role;
    if (!emailPattern.test(email) || email.length > 254) {
      return json({ error: 'Enter a valid staff email address.' }, 400);
    }
    if (role !== 'admin' && role !== 'super_admin') {
      return json({ error: 'Select a valid staff role.' }, 400);
    }

    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const configured = await validateSellerFormSubmission(db, 'staff.staff-invitation',
      body.formVersion, body.customAnswers, body.requestId);
    validatedVersionId = configured.versionId;
    const invitation = await createStaffInvitation(
      db,
      {
        email,
        role: role as StaffRole,
        invitedBy: staff.id,
        now: Date.now(),
        requestId: body.requestId,
        form: { requestId: body.requestId, versionId: configured.versionId, answers: configured.answers },
      },
    );
    if (invitation.duplicate) return json({ ...invitation, message: 'Invitation already created for this request.', emailDelivered: false }, 200);
    try {
      await sendStaffInvitationEmail({
        email,
        role: role as StaffRole,
        expiresAt: invitation.expiresAt,
      });
    } catch {
      return json(
        {
          ...invitation,
          message:
            'Access invitation created, but its email could not be delivered. Share the /admin address with the invited person and check the email settings.',
          emailDelivered: false,
        },
        201,
      );
    }
    return json(
      {
        ...invitation,
        message: 'Access invitation created and emailed.',
        emailDelivered: true,
      },
      201,
    );
  } catch (error) {
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }), 'staff.staff-invitation', validatedVersionId))
      return json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, 409);
    if (error instanceof StaffAuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof FormRuntimeError) return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    if (error instanceof SyntaxError) return json({ error: 'Invalid invitation request.' }, 400);
    if (error instanceof StaffInvitationConflictError) {
      return json({ error: error.message }, 409);
    }
    return json({ error: 'The staff invitation could not be created.' }, 500);
  }
}
