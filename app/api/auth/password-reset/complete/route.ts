import {readBoundedForm,formText} from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import {
  readResetCookie,
  resetCookie,
  resetPassword,
} from '@/lib/auth/password-reset';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import { consumeAuthenticationRateLimit as consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return new Response('Cross-site requests are not allowed.', {
      status: 403,
    });
  let form: FormData; try {form=await readBoundedForm(request,16*1024);} catch {return new Response('Invalid or oversized form.',{status:413});}
  const back = safeSignInReturnPath(
    formText(form, 'return_to', '/account'),
  );
  const password = formText(form, 'password', '');
  const confirm = formText(form, 'confirm_password', '');
  const fail = (error: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/forgot-password/reset?return_to=${encodeURIComponent(back)}&error=${error}`,
        'Cache-Control': 'no-store',
      },
    });
  if (password.length < 10 || password.length > 256 || password !== confirm)
    return fail('password');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  if (
    !(
      await consumeRequestRateLimit(db, request, {
        scope: `password-reset-complete:${readResetCookie(request.headers).slice(0,16)}`,
        limit: 10,
        windowMs: 10 * 60_000,
      })
    ).allowed
  )
    return fail('rate');
  if (
    !(await resetPassword(
      db,
      readResetCookie(request.headers),
      formText(form, 'code', '').trim(),
      password,
    ))
  )
    return fail('invalid');
  const headers = new Headers({
    Location: `/login?reset=success&return_to=${encodeURIComponent(back)}`,
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', resetCookie('', true));
  headers.append(
    'Set-Cookie',
    'hastabazaar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure',
  );
  return new Response(null, { status: 303, headers });
}
