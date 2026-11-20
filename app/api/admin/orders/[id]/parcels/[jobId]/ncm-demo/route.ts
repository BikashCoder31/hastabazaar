import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import { hasStaffPermissionBySubject } from '@/lib/db/repositories/staff-permissions';
import { ncmDemoCheckout } from '@/lib/shipping/ncm-demo-checkout';
import { readNcmDemoHandoff } from '@/lib/shipping/ncm-demo-handoff';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; jobId: string }> }) {
  if (!ncmDemoCheckout(env)) return json({ error: 'NCM demo handoff is unavailable.' }, 404);
  try {
    const identity = await getAuthenticatedUser({ readOnly: true });
    if (!identity) return json({ error: 'Authentication is required.' }, 401);
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    if (!await hasStaffPermissionBySubject(db, identity.userId, 'order.manage'))
      return json({ error: 'Staff access is not permitted.' }, 403);

    const { id, jobId } = await context.params;
    const draft = await readNcmDemoHandoff(db, id, jobId);
    return draft ? json(draft) : json({ error: 'NCM demo handoff is unavailable.' }, 404);
  } catch {
    return json({ error: 'The NCM demo handoff could not be read.' }, 500);
  }
}
