import {readBoundedForm} from '@/lib/http/bounded-body';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { env } from 'cloudflare:workers';


import { clearEmailOtpCookie, readEmailOtpCookie } from '@/lib/auth/email-otp';
import { D1EmailOtpStore } from '@/lib/auth/email-otp-d1-store';
import { verifyEmailOtp } from '@/lib/auth/email-otp-service';
import { createHostedSessionForUser, hostedSessionCookie } from '@/lib/auth/hosted-session';
import { requireDatabase } from '@/lib/db/d1';
import { consumeAuthenticationRateLimit as consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

function failed(request: Request, returnTo: string, error: string): Response {
  const location = new URL('/login/code', request.url);
  location.searchParams.set('return_to', returnTo);
  location.searchParams.set('error', error);
  return new Response(null, {
    status: 303,
    headers: { Location: location.pathname + location.search, 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return new Response('Cross-site requests are not allowed.', { status: 403 });
  let data: FormData; try {data=await readBoundedForm(request,16*1024);} catch {return new Response('Invalid or oversized form.',{status:413});}
  const codeValue = data.get('code');
  const returnValue = data.get('return_to');
  const code = (typeof codeValue === 'string' ? codeValue : '').trim().slice(0, 6);
  const returnTo = safeSignInReturnPath(typeof returnValue === 'string' ? returnValue : '/account');
  const token = readEmailOtpCookie(request.headers);
  if (!token || !/^\d{6}$/.test(code)) return failed(request, returnTo, 'invalid');

  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: `email-otp-verify:${token.slice(0, 16)}`,
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rateLimit.allowed) return failed(request, returnTo, 'rate');

  const result = await verifyEmailOtp(new D1EmailOtpStore(database), token, code);
  if (result.status !== 'valid' || !result.userId) return failed(request, returnTo, 'invalid');
  const session = await createHostedSessionForUser(database, result.userId, Date.now(), { mailbox: true });
  const headers = new Headers({ Location: returnTo, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', hostedSessionCookie(session));
  headers.append('Set-Cookie', clearEmailOtpCookie());
  return new Response(null, { status: 303, headers });
}
