import {readBoundedForm,formText} from '@/lib/http/bounded-body';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { env } from 'cloudflare:workers';


import { requireDatabase } from '@/lib/db/d1';
import {
  createHostedSessionForUser,
  findCredentialByEmail,
  hostedSessionCookie,
  verifyPassword,
} from '@/lib/auth/hosted-session';
import { consumeAuthenticationRateLimit as consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

function redirectToLogin(request: Request, returnTo: string, error: string) {
  const location = new URL('/login', request.url);
  location.searchParams.set('return_to', returnTo);
  location.searchParams.set('error', error);
  return new Response(null, { status: 303, headers: { Location: location.pathname + location.search } });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return new Response('Cross-site requests are not allowed.', { status: 403 });
  let data: FormData; try {data=await readBoundedForm(request,16*1024);} catch {return new Response('Invalid or oversized form.',{status:413});}
  const email = formText(data, 'email', '').trim().toLowerCase().slice(0, 254);
  const password = formText(data, 'password', '').slice(0, 256);
  const returnTo = safeSignInReturnPath(formText(data, 'return_to', '/account'));
  if (!email || !password) return redirectToLogin(request, returnTo, 'missing');

  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: `login:${email}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) return redirectToLogin(request, returnTo, 'rate');

  const credential = await findCredentialByEmail(database, email);
  const valid = credential
    ? await verifyPassword(password, credential.passwordHash, credential.passwordSalt)
    : false;
  if (!credential || !valid) return redirectToLogin(request, returnTo, 'invalid');

  const token = await createHostedSessionForUser(database, credential.accountId, Date.now(), { passwordHash: credential.passwordHash });
  return new Response(null, {
    status: 303,
    headers: {
      Location: returnTo,
      'Set-Cookie': hostedSessionCookie(token),
      'Cache-Control': 'no-store',
    },
  });
}

