import { env } from 'cloudflare:workers';
import { requireSellerCenterApi, SellerCenterAuthorizationError } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { readSellerWorkspaceTasks, SellerTaskAccessError } from '@/lib/seller/workspace-tasks';
export async function GET(request: Request) { try {
    const actor = await requireSellerCenterApi(), url = new URL(request.url);
    const result = await readSellerWorkspaceTasks(requireDatabase(env as unknown as {
        DB?: D1Database;
    }), actor.userId, { limit: 20, cursor: url.searchParams.get('cursor') ?? undefined, view: url.searchParams.get('view') === 'all' ? 'all' : 'active' });
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
}
catch (error) {
    return Response.json({ error: error instanceof SellerCenterAuthorizationError || error instanceof SellerTaskAccessError ? error.message : 'Your work could not be loaded. Keep the original record and refresh to retry.' }, { status: error instanceof SellerCenterAuthorizationError ? error.status : error instanceof SellerTaskAccessError ? 409 : 503, headers: { 'cache-control': 'no-store' } });
} }
