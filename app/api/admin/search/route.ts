import { env } from 'cloudflare:workers';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireExistingStaffIntentApi } from '@/lib/auth/staff-intent';
import { requireDatabase } from '@/lib/db/d1';
import { searchAdminWorkspace } from './results';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });

export async function GET(request: Request) {
  try {
    const staff = await requireExistingStaffIntentApi(request, 'account.self.manage');
    const query = new URL(request.url).searchParams.get('q') ?? '';
    if (query.length > 120) return json({ error: 'Use up to 120 characters to search.' }, 400);
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    return json({ results: await searchAdminWorkspace(db, staff, query) });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return json({ error: error.message }, error.status);
    return json({ error: 'Search could not load. Try again.' }, 500);
  }
}
