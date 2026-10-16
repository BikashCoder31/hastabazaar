import { FormGuide } from '@/components/forms/form-guide';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { resolvePublishedForm } from '@/lib/forms/runtime';
import Link from 'next/link';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
export const metadata = { title: 'Reset password' };
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; error?: string }>;
}) {
  const query = await searchParams;
  const back = safeSignInReturnPath(query.return_to);
  const config = await resolvePublishedForm(requireDatabase(env as unknown as { DB?: D1Database }), 'identity.password-reset-complete');
  const errors: Record<string, string> = {
    invalid:
      'That code is invalid, expired or already used. Request another code and try again.',
    password:
      'Use 10–256 characters and enter the same new password in both fields.',
    rate: 'Too many attempts. Please wait 10 minutes before trying again.',
  };
  return (
    <main tabIndex={-1} id="main-content" className="grid min-h-screen place-items-center bg-muted/20 px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-sm sm:p-9">
        <Link href="/" className="text-sm font-semibold text-primary">
          ← HastaBazaar
        </Link>
        <h1 className="mt-6 font-heading text-4xl">Reset your password</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          If an active account exists for that email, a reset code may arrive.
          Check your inbox and spam folder. The code expires in 10 minutes
          and works in the browser where you requested it.
        </p>
        {query.error && errors[query.error] ? (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {errors[query.error]}
          </p>
        ) : null}
        <form
          data-form-id="identity.password-reset-complete"
          action="/api/auth/password-reset/complete"
          method="post"
          className="mt-6 space-y-4"
        >
      <FormGuide formId="identity.password-reset-complete" />

<p className="text-xs text-muted-foreground">* Required field</p>

          <input type="hidden" name="return_to" value={back} />
          <label className="block text-sm font-medium">
            Reset code
             <span aria-hidden="true">*</span><input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-mono text-xl tracking-widest"
            />
          </label>
          <label className="block text-sm font-medium">
            New password
             <span aria-hidden="true">*</span><input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={10}
              maxLength={256}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Confirm new password
             <span aria-hidden="true">*</span><input
              name="confirm_password"
              type="password"
              required
              autoComplete="new-password"
              minLength={10}
              maxLength={256}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3"
            />
          </label>
          <p className="text-sm leading-6 text-muted-foreground">
            Use at least 10 characters. Resetting your password signs out
            existing sessions. Sign in again with your new password.
          </p>
          <input type="hidden" name="requestId" value={crypto.randomUUID()} />
          <ConfiguredFields config={config} baseKeys={['code', 'password', 'confirm_password', 'return_to', 'requestId', 'formVersion']} />
          <button className="min-h-11 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">
            Reset password
          </button>
        </form>
        <div className="mt-5 flex flex-wrap gap-5 text-sm font-semibold text-primary">
          <Link
            className="inline-flex min-h-11 items-center"
            href={`/forgot-password?return_to=${encodeURIComponent(back)}`}
          >
            Request another code
          </Link>
          <Link
            className="inline-flex min-h-11 items-center"
            href={`/login?return_to=${encodeURIComponent(back)}`}
          >
            Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
