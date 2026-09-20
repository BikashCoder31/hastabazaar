import {readBoundedForm,formText} from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { PasswordResetStore } from '@/lib/auth/password-reset-store';
import { requestPasswordReset } from '@/lib/auth/password-reset-request';
import { resetCookie } from '@/lib/auth/password-reset';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { sendPasswordResetCode } from '@/lib/email/password-reset';
import type { EmailLoginEnvironment } from '@/lib/email/login-code';
import { consumeAuthenticationRateLimit as consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return new Response('Cross-site requests are not allowed.', {
      status: 403,
    });
  let form: FormData; try {form=await readBoundedForm(request,16*1024);} catch {return new Response('Invalid or oversized form.',{status:413});}
  const email = formText(form, 'email', '')
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const back = safeSignInReturnPath(
    formText(form, 'return_to', '/account'),
  );
  const redirect = (path: string, error?: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `${path}?return_to=${encodeURIComponent(back)}${error ? '&error=' + error : ''}`,
        'Cache-Control': 'no-store',
      },
    });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return redirect('/forgot-password', 'invalid');
  const emailEnv = env as unknown as EmailLoginEnvironment;
  if (
    !emailEnv.EMAIL ||
    (emailEnv.EMAIL_DELIVERY_CONFIGURED !== 'true' &&
      emailEnv.EMAIL.configured !== true)
  )
    return redirect('/forgot-password', 'unavailable');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const ipLimit = await consumeRequestRateLimit(db, request, {
    scope: 'password-reset-request',
    limit: 300,
    windowMs: 15 * 60_000,
  });
  const accountLimit = await consumeRequestRateLimit(
    db,
    new Request('https://local.invalid'),
    { scope: `password-reset-email:${email}`, limit: 3, windowMs: 15 * 60_000 },
  );
  if (!ipLimit.allowed || !accountLimit.allowed)
    return redirect('/forgot-password', 'rate');
  const token = await requestPasswordReset(
    new PasswordResetStore(db),
    email,
    (recipient, code) => sendPasswordResetCode(emailEnv, recipient, code),
  );
  const response = redirect('/forgot-password/reset');
  response.headers.append('Set-Cookie', resetCookie(token));
  return response;
}
