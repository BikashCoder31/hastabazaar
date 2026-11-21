import { PasswordVisibility } from '@/components/account/password-visibility';
import { AuthPanels, authSubmit, authField } from '@/components/account/customer-auth-panels';
import { FormGuide } from '@/components/forms/form-guide';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { resolvePublishedForm } from '@/lib/forms/runtime';
import { safeSignInReturnPath, SESSION_EXPIRED_MESSAGE } from '@/lib/auth/sign-in-destination';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthenticatedUser } from '@/app/auth';
import { GoogleSignIn } from '@/components/auth/google-sign-in';

const errors: Record<string, string> = {
  missing: 'Enter your email address and password.',
  invalid: 'The email address or password is incorrect.',
  rate: 'Too many attempts. Please wait and try again.',
  session_expired: SESSION_EXPIRED_MESSAGE,
  google: 'Google sign-in could not be completed. Please try again.',
  google_unavailable: 'Google sign-in is temporarily unavailable. Please use your email and password.',
  email_code_unavailable: 'Email sign-in is temporarily unavailable. Please use your password or Google.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; error?: string; reset?: string; reauth?: string }>;
}) {
  const identity = await getAuthenticatedUser();
  const query = await searchParams;
  const returnTo = safeSignInReturnPath(query.return_to ?? '/account');
  const passwordStep = query.reauth === 'password';
  const freshChallenge = passwordStep || query.reauth === '1';
  if (identity&&!freshChallenge) redirect(returnTo);
  const error = query.error ? errors[query.error] : null;
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [passwordResult, emailRequestResult] = await Promise.allSettled([
    resolvePublishedForm(db, 'identity.login-password'),
    passwordStep ? null : resolvePublishedForm(db, 'identity.email-code-request'),
  ]);
  const passwordConfig = passwordResult.status === 'fulfilled' ? passwordResult.value : null;
  const emailRequestConfig = emailRequestResult.status === 'fulfilled' ? emailRequestResult.value : null;

  return (
    <AuthPanels page="login" returnTo={returnTo} challenge={freshChallenge}>
        <h1 className="font-heading text-4xl tracking-tight">{freshChallenge?'Confirm your sign-in':'Welcome back'}</h1>
        {passwordStep ? <p className="mt-3">Enter your password to continue to your authenticator.</p>
          : freshChallenge ? <p className="mt-3">Enter your password or a new email sign-in code to confirm this sensitive account change.</p> : null}
        {query.reset === 'success' ? <output className="block mt-4 rounded-xl bg-secondary p-3 text-sm">Your password has been reset. Sign in with your new password.</output> : null}
        {!passwordStep ? <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to view orders, saved products, and your marketplace account. If you first verify your email with Google or an email code, you may need to use Forgot password to set a verified password.</p> : null}
        {error ? <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
        {!passwordConfig && !emailRequestConfig ? <p role="alert" className="mt-5 text-sm text-destructive">Sign-in forms are temporarily unavailable. Please try again later.</p> : null}
        {!freshChallenge ? <GoogleSignIn returnTo={returnTo} showEmailDivider={Boolean(passwordConfig || emailRequestConfig)} /> : null}
        {passwordConfig ? <>
        <form data-form-id="identity.login-password" action={passwordStep ? '/api/auth/login?reauth=password' : '/api/auth/login'} method="post" className="mt-6 space-y-4">
      <FormGuide formId="identity.login-password" />

<p className="text-xs text-muted-foreground">* Required field</p>

          <input type="hidden" name="return_to" value={returnTo} />
          <label className="block text-sm font-medium">Email address <span aria-hidden="true">*</span><input required type="email" name="email" autoComplete="email" className={authField} /></label>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <label htmlFor="login-password" className="font-medium">Password <span aria-hidden="true">*</span></label>
              <Link className="inline-flex min-h-11 items-center font-semibold text-[#a8232e] underline" href={`/forgot-password?return_to=${encodeURIComponent(returnTo)}`}>Forgot password?</Link>
            </div>
            <div className="relative">
              <input id="login-password" required type="password" name="password" autoComplete="current-password" className={authField + ' pr-14'} />
              <PasswordVisibility inputId="login-password" />
            </div>
          </div>
          <input type="hidden" name="requestId" value={crypto.randomUUID()} />
          <ConfiguredFields config={passwordConfig} baseKeys={['email', 'password', 'return_to', 'requestId', 'formVersion']} />
          <button type="submit" className={authSubmit}>Sign in</button>
        </form>
        </> : <p className="mt-5 text-sm text-muted-foreground">Password sign-in is temporarily unavailable.</p>}
        {passwordConfig && emailRequestConfig ? <div className="my-3 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div> : null}
        {passwordStep ? null : emailRequestConfig ? <details open={!passwordConfig} className="mt-4 rounded-lg border bg-white">
          <summary className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 py-2 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#a8232e]">Email me a sign-in code instead</summary>
          <form data-form-id="identity.email-code-request" action="/api/auth/email-code/request" method="post" className="space-y-4 px-4 pb-4">
      <FormGuide formId="identity.email-code-request" />

<p className="text-xs text-muted-foreground">* Required field</p>

          <input type="hidden" name="return_to" value={returnTo} />
          <label className="block text-sm font-medium">Email address <span aria-hidden="true">*</span><input required type="email" name="email" autoComplete="email" className={authField} /></label>
          <input type="hidden" name="requestId" value={crypto.randomUUID()} />
          <ConfiguredFields config={emailRequestConfig} baseKeys={['email', 'return_to', 'requestId', 'formVersion']} />
          <button type="submit" className="w-full rounded-xl border bg-background px-5 py-3 font-semibold text-foreground shadow-xs transition-colors hover:bg-muted">Email me a sign-in code</button>
        </form></details> : <p className="text-sm text-muted-foreground">Email-code sign-in is temporarily unavailable.</p>}

        {!passwordStep ? <p className="mt-6 text-center text-sm text-muted-foreground">New to Hastabazaar? <Link className="font-semibold text-primary" href={`/register?return_to=${encodeURIComponent(returnTo)}`}>Create an account</Link></p> : null}
    </AuthPanels>
  );
}
