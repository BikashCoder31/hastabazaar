import { env } from 'cloudflare:workers';
import { securitySignInDestination } from '@/lib/auth/sign-in-destination';

import {
  clearGoogleFlowCookie,
  finishGoogleFlow,
  googleConfiguration,
  readGoogleFlow,
} from '@/lib/auth/google-oauth';
import {
  createHostedSessionForUser,
  hostedSessionCookie,
} from '@/lib/auth/hosted-session';
import { requireDatabase } from '@/lib/db/d1';

export const dynamic = 'force-dynamic';

function failed(request: Request, reason: string): Response {
  const location = new URL('/login', request.url);
  location.searchParams.set('error', reason);
  const headers = new Headers({
    Location: location.pathname + location.search,
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', clearGoogleFlowCookie());
  return new Response(null, { status: 303, headers });
}

export async function GET(request: Request): Promise<Response> {
  const configuration = googleConfiguration(
    env as unknown as {
      APP_ORIGIN?: string;
      GOOGLE_CLIENT_ID?: string;
      GOOGLE_CLIENT_SECRET?: string;
    },
  );
  const requestUrl = new URL(request.url);
  const flow = readGoogleFlow(request);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  if (
    !configuration ||
    !flow ||
    !code ||
    !state ||
    state !== flow.state ||
    requestUrl.searchParams.has('error')
  ) {
    return failed(request, 'google');
  }

  try {
    const identity = await finishGoogleFlow({ configuration, code, flow });
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const existing = await database
      .prepare('SELECT id, status FROM users WHERE lower(email) = ? LIMIT 1')
      .bind(identity.email)
      .first<{ id: string; status: string }>();
    let userId = existing?.id;
    if (existing && existing.status !== 'active')
      return failed(request, 'google');
    if (!userId) {
      userId = crypto.randomUUID();
      const now = Date.now();
      await database.batch([
        database
          .prepare(
            `INSERT INTO users (id, auth_subject, email, phone, display_name, locale, status, created_at, updated_at)
             VALUES (?, ?, ?, NULL, ?, 'en-NP', 'active', ?, ?)`,
          )
          .bind(
            userId,
            `google:${identity.subject}`,
            identity.email,
            identity.displayName,
            now,
            now,
          ),
        database
          .prepare(
            "INSERT INTO user_roles (user_id, role, assigned_by, assigned_at) VALUES (?, 'customer', NULL, ?)",
          )
          .bind(userId, now),
      ]);
    }
    const session = await createHostedSessionForUser(
      database,
      userId,
      Date.now(),
      { mailbox: true },
    );
    const headers = new Headers({
      Location: await securitySignInDestination(
        database,
        userId,
        flow.returnTo,
      ),
      'Cache-Control': 'no-store',
    });
    headers.append('Set-Cookie', hostedSessionCookie(session));
    headers.append('Set-Cookie', clearGoogleFlowCookie());
    return new Response(null, { status: 303, headers });
  } catch {
    return failed(request, 'google');
  }
}
