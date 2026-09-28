import { ConfiguredFields } from '@/components/forms/configured-fields';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { resolvePublishedForm } from '@/lib/forms/runtime';
import Link from 'next/link';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
export const metadata = { title: 'Forgot password' };
export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; error?: string }>;
}) {
  const query = await searchParams;
  const back = safeSignInReturnPath(query.return_to);
  const config = await resolvePublishedForm(requireDatabase(env as unknown as { DB?: D1Database }), 'identity.password-reset-request');
  const errors: Record<string, string> = {
    invalid: 'Enter a valid email address.',
    rate: 'Too many requests. Please wait 15 minutes before trying again.',
    unavailable:
      'Password reset email is temporarily unavailable. Please try again later or use an available sign-in option.',
  };
  return (
    <main tabIndex={-1} id="main-content" className="grid min-h-screen place-items-center bg-muted/20 px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-sm sm:p-9">
        <Link href="/" className="text-sm font-semibold text-primary">
          ← HastaBazaar
        </Link>
        <h1 className="mt-6 font-heading text-4xl">Forgot password?</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Enter your account email. A reset code may arrive to help you choose a new
          password.
        </p>
        {query.error && errors[query.error] ? (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {errors[query.error]}
          </p>
        ) : null}
        <form
          data-form-id="identity.password-reset-request"
          action="/api/auth/password-reset/request"
          method="post"
          className="mt-6 space-y-5"
        >
<p className="text-xs text-muted-foreground">* Required field</p>

          <input type="hidden" name="return_to" value={back} />
          <label className="block text-sm font-medium">
            Email address
             <span aria-hidden="true">*</span><input
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3"
            />
          </label>
          <input type="hidden" name="requestId" value={crypto.randomUUID()} />
          <ConfiguredFields config={config} baseKeys={['email', 'return_to', 'requestId', 'formVersion']} />
          <button className="min-h-11 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">
            Send reset code
          </button>
        </form>
        <Link
          className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          href={`/login?return_to=${encodeURIComponent(back)}`}
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
