import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    await requireStaffApi('commercial_policy.manage');
    return Response.json(
      {
        error:
          'This legacy endpoint is read-only. Use controlled Business Settings to schedule independent seller commission changes.',
      },
      { status: 410 },
    );
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: 'The commission policy could not be read.' },
      { status: 500 },
    );
  }
}
