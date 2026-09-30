import { env } from 'cloudflare:workers';

import { safeRelativeReturnPath } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { isLocalTestRequest, localTestCookieName } from '@/lib/auth/local-test-access';
import {
  clearHostedSessionCookie,
  revokeHostedSession,
} from '@/lib/auth/hosted-session';

export async function GET(request: Request): Promise<Response> {
  const returnTo = safeRelativeReturnPath(new URL(request.url).searchParams.get('return_to') ?? '/');
  return new Response(null, { status: 303, headers: { Location: returnTo, 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request, (env as unknown as { APP_ORIGIN?: string }).APP_ORIGIN))
    return new Response('Cross-site requests are not allowed.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  await revokeHostedSession(
    requireDatabase(env as unknown as { DB?: D1Database }),
    request.headers,
  );
  const returnTo = safeRelativeReturnPath(
    new URL(request.url).searchParams.get('return_to') ?? '/',
  );
  const responseHeaders = new Headers({
    Location: returnTo,
    'Set-Cookie': clearHostedSessionCookie(),
    'Cache-Control': 'no-store',
  });
  if (isLocalTestRequest(request.headers)) {
    responseHeaders.append('Set-Cookie',
      `${localTestCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  }
  return new Response(null, { status: 303, headers: responseHeaders });
}
