import { env } from 'cloudflare:workers';
import { readSearchSuggestions } from '@/lib/catalog/search-suggestions';
import { requireDatabase } from '@/lib/db/d1';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100) ?? '';
  const headers = { 'Cache-Control': 'no-store' };
  if (query.length < 2) return Response.json({ suggestions: [] }, { headers });

  try {
    const suggestions = await readSearchSuggestions(requireDatabase(env as unknown as { DB?: D1Database }), query);
    return Response.json({ suggestions }, { headers });
  } catch {
    return Response.json({ error: 'Suggestions are temporarily unavailable. You can still search.' }, { status: 503, headers });
  }
}
