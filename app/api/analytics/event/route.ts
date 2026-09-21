import { env } from 'cloudflare:workers';

import { parsePublicTrafficEvent } from '@/lib/analytics/first-party';
import { recordRequestTrafficEvent } from '@/lib/analytics/request';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

function empty(status = 204, cookie?: string): Response {
  const headers = new Headers({ 'cache-control': 'no-store' });
  if (cookie) headers.append('set-cookie', cookie);
  return new Response(null, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return empty(403);
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > 2_048)
    return empty(413);
  try {
    const raw = await request.text();
    if (raw.length > 2_048) return empty(413);
    const event = parsePublicTrafficEvent(JSON.parse(raw));
    const result = await recordRequestTrafficEvent(
      requireDatabase(env as unknown as { DB?: D1Database }),
      request,
      event,
    );
    return empty(204, result.cookie);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof RangeError ||
      error instanceof TypeError
    )
      return empty(400);
    console.error('First-party analytics event failed', error);
    return empty(204);
  }
}
