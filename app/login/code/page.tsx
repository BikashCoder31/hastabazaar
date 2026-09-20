import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthenticatedUser } from '@/app/auth';

const errors: Record<string, string> = {
  invalid: 'That code is invalid or has expired. Request a new code and try again.',
  rate: 'Too many attempts. Request a new code after 10 minutes.',
};

export default async function EmailCodePage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; error?: string }>;
}) {
  const identity = await getAuthenticatedUser();
  const query = await searchParams;
  const returnTo = safeSignInReturnPath(query.return_to ?? '/account');
  if (identity) redirect(returnTo);
  const error = query.error ? errors[query.error] : null;

  return (
    <main tabIndex={-1} id="main-content" className="grid min-h-screen place-items-center bg-muted/20 px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-sm sm:p-9">
        <Link href="/" className="text-sm font-semibold text-primary">← HastaBazaar</Link>
        <h1 className="mt-6 font-heading text-4xl text-foreground">Check your email</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">If an active account exists for that address, we sent a six-digit code. It expires in 10 minutes.</p>
        {error ? <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
        <form action="/api/auth/email-code/verify" method="post" className="mt-6 space-y-4">
<p className="text-xs text-muted-foreground">* Required field</p>

          <input type="hidden" name="return_to" value={returnTo} />
          <label className="block text-sm font-medium">Sign-in code <span aria-hidden="true">*</span><input required name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] outline-none focus:ring-2 focus:ring-primary" /></label>
          <button type="submit" className="w-full rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90">Verify and sign in</button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground"><Link className="font-semibold text-primary" href={`/login?return_to=${encodeURIComponent(returnTo)}`}>Request another code</Link></p>
      </section>
    </main>
  );
}
