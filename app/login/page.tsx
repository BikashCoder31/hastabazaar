import { ConfiguredFields } from '@/components/forms/configured-fields';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { resolvePublishedForm } from '@/lib/forms/runtime';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthenticatedUser } from '@/app/auth';
import { GoogleSignIn } from '@/components/auth/google-sign-in';

const errors: Record<string, string> = {
  missing: 'Enter your email address and password.',
  invalid: 'The email address or password is incorrect.',
  rate: 'Too many attempts. Please wait and try again.',
  google: 'Google sign-in could not be completed. Please try again.',
  google_unavailable: 'Google sign-in is temporarily unavailable. Please use your email and password.',
  email_code_unavailable: 'Email sign-in is temporarily unavailable. Please use your password or Google.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; error?: string; reset?: string }>;
}) {
  const identity = await getAuthenticatedUser();
  const query = await searchParams;
  const returnTo = safeSignInReturnPath(query.return_to ?? '/account');
  if (identity) redirect(returnTo);
  const error = query.error ? errors[query.error] : null;
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [passwordResult, emailRequestResult] = await Promise.allSettled([
    resolvePublishedForm(db, 'identity.login-password'),
    resolvePublishedForm(db, 'identity.email-code-request'),
  ]);
  const passwordConfig = passwordResult.status === 'fulfilled' ? passwordResult.value : null;
  const emailRequestConfig = emailRequestResult.status === 'fulfilled' ? emailRequestResult.value : null;

  return (
    <main tabIndex={-1} id="main-content" className="grid min-h-screen place-items-center bg-muted/20 px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-sm sm:p-9">
        <Link href="/" className="text-sm font-semibold text-primary">← HastaBazaar</Link>
        <h1 className="mt-6 font-heading text-4xl text-foreground">Welcome back</h1>
        {query.reset === 'success' ? <output className="block mt-4 rounded-xl bg-secondary p-3 text-sm">Your password has been reset. Sign in with your new password.</output> : null}
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to view orders, saved products, and your marketplace account. If you first verify your email with Google or an email code, you may need to use Forgot password to set a verified password.</p>
        {error ? <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
        {!passwordConfig && !emailRequestConfig ? <p role="alert" className="mt-5 text-sm text-destructive">Sign-in forms are temporarily unavailable. Please try again later.</p> : null}
        {passwordConfig ? <>
        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
<p className="text-xs text-muted-foreground">* Required field</p>

          <input type="hidden" name="return_to" value={returnTo} />
          <label className="block text-sm font-medium">Email address <span aria-hidden="true">*</span><input required type="email" name="email" autoComplete="email" className="mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-primary" /></label>
          <label className="block text-sm font-medium">Password <span aria-hidden="true">*</span><input required type="password" name="password" autoComplete="current-password" className="mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-primary" /></label>
          <input type="hidden" name="requestId" value={crypto.randomUUID()} />
          <ConfiguredFields config={passwordConfig} baseKeys={['email', 'password', 'return_to', 'requestId', 'formVersion']} />
          <button type="submit" className="w-full rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90">Sign in</button>
        </form>
        <Link className="my-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary" href={`/forgot-password?return_to=${encodeURIComponent(returnTo)}`}>Forgot password?</Link>
        </> : <p className="mt-5 text-sm text-muted-foreground">Password sign-in is temporarily unavailable.</p>}
        <div className="my-6 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        {emailRequestConfig ? <form action="/api/auth/email-code/request" method="post" className="space-y-4">
<p className="text-xs text-muted-foreground">* Required field</p>

          <input type="hidden" name="return_to" value={returnTo} />
          <label className="block text-sm font-medium">Email address <span aria-hidden="true">*</span><input required type="email" name="email" autoComplete="email" className="mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-primary" /></label>
          <input type="hidden" name="requestId" value={crypto.randomUUID()} />
          <ConfiguredFields config={emailRequestConfig} baseKeys={['email', 'return_to', 'requestId', 'formVersion']} />
          <button type="submit" className="w-full rounded-xl border bg-background px-5 py-3 font-semibold text-foreground shadow-xs transition-colors hover:bg-muted">Email me a sign-in code</button>
        </form> : <p className="text-sm text-muted-foreground">Email-code sign-in is temporarily unavailable.</p>}

        <GoogleSignIn returnTo={returnTo} />
        <p className="mt-6 text-center text-sm text-muted-foreground">New to HastaBazaar? <Link className="font-semibold text-primary" href={`/register?return_to=${encodeURIComponent(returnTo)}`}>Create an account</Link></p>
      </section>
    </main>
  );
}
