import { env } from 'cloudflare:workers';

import { safeRelativeReturnPath } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import {
  clearHostedSessionCookie,
  revokeHostedSession,
} from '@/lib/auth/hosted-session';

export async function GET(request: Request): Promise<Response> {
  await revokeHostedSession(
    requireDatabase(env as unknown as { DB?: D1Database }),
    request.headers,
  );
  const returnTo = safeRelativeReturnPath(
    new URL(request.url).searchParams.get('return_to') ?? '/',
  );
  return new Response(null, {
    status: 303,
    headers: {
      Location: returnTo,
      'Set-Cookie': clearHostedSessionCookie(),
      'Cache-Control': 'no-store',
    },
  });
}
