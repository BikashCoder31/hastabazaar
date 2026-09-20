import { SignupPasswordFields } from '@/components/auth/signup-password-fields';
import { safeSignInReturnPath } from '@/lib/auth/sign-in-destination';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthenticatedUser } from '@/app/auth';
import { GoogleSignIn } from '@/components/auth/google-sign-in';

const errors: Record<string, string> = {
  confirmation: 'Passwords must match exactly. Please enter both passwords again.',
  invalid: 'Use a valid name and email, and a password with at least 10 characters.',
  exists: 'An account already exists for this email address. Please sign in.',
  rate: 'Too many attempts. Please wait and try again.',
  google: 'Google sign-up could not be completed. Please try again.',
  google_unavailable: 'Google sign-up is temporarily unavailable. Please create an account with email and password.',
};

export default async function RegisterPage({
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
        <h1 className="mt-6 font-heading text-4xl text-foreground">Create your account</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Save favourites, track orders, and shop from Nepalese makers.</p>
        {error ? <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
        <form action="/api/auth/register" method="post" className="mt-6 space-y-4">
          <p className="text-xs text-muted-foreground">* Required field</p>
          <input type="hidden" name="return_to" value={returnTo} />
          <label className="block text-sm font-medium">Full name *<input required name="display_name" autoComplete="name" minLength={2} maxLength={100} className="mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-primary" /></label>
          <label className="block text-sm font-medium">Email address *<input required type="email" name="email" autoComplete="email" className="mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-primary" /></label>
          <SignupPasswordFields />
          <button type="submit" className="w-full rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90">Create account</button>
        </form>
        <GoogleSignIn returnTo={returnTo} />
        <p className="mt-5 text-sm leading-6 text-muted-foreground">Read our <Link href="/terms" className="font-semibold text-primary underline">Terms & conditions</Link> and <Link href="/privacy" className="font-semibold text-primary underline">Privacy policy</Link> before creating an account.</p>
        <p className="mt-6 text-center text-sm text-muted-foreground">Already registered? <Link className="font-semibold text-primary" href={`/login?return_to=${encodeURIComponent(returnTo)}`}>Sign in</Link></p>
      </section>
    </main>
  );
}
