import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { env } from 'cloudflare:workers';

import { beginGoogleFlow, googleConfiguration } from '@/lib/auth/google-oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const configuration = googleConfiguration(
    env as unknown as {
      APP_ORIGIN?: string;
      GOOGLE_CLIENT_ID?: string;
      GOOGLE_CLIENT_SECRET?: string;
    },
  );
  const requestUrl = new URL(request.url);
  if (!configuration) {
    const location = new URL('/login', request.url);
    location.searchParams.set('error', 'google_unavailable');
    return new Response(null, { status: 303, headers: { Location: location.pathname + location.search } });
  }
  const flow = beginGoogleFlow(configuration, safeSignInReturnPath(requestUrl.searchParams.get('return_to') ?? undefined));
  return new Response(null, {
    status: 302,
    headers: {
      Location: flow.location,
      'Set-Cookie': flow.cookie,
      'Cache-Control': 'no-store',
    },
  });
}
