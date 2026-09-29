import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { categoryMediaForAdmin, categoryImageResponse } from '@/lib/catalog/category-media';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await requireStaffApi('catalog.manage');
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const { id } = await params;
    return await categoryImageResponse(await categoryMediaForAdmin(requireDatabase(bindings), id, actor.id), requireMediaBucket(bindings));
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ error: 'Category image was not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}
