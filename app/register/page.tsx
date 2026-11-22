import { AuthPanels, authSubmit, authField } from '@/components/account/customer-auth-panels';
import { FormGuide } from '@/components/forms/form-guide';
import { SignupPasswordFields } from '@/components/auth/signup-password-fields';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { loadQueryPresentationConfig } from '@/lib/catalog/shop-query';
import { resolvePublishedForm } from '@/lib/forms/runtime';
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
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [config, trackingPresentation] = await Promise.all([
    resolvePublishedForm(db, 'identity.register'),
    loadQueryPresentationConfig(db, 'commerce.order-tracking'),
  ]);

  return (
    <AuthPanels page="register" returnTo={returnTo} trackingPresentation={trackingPresentation}>
        <h1 className="font-heading text-4xl tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Save favourites, track orders, and shop from Nepalese makers.</p>
        {error ? <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
        <GoogleSignIn returnTo={returnTo} />
        <form data-form-id="identity.register" action="/api/auth/register" method="post" className="mt-6 space-y-4">
      <FormGuide formId="identity.register" />

          <p className="text-xs text-muted-foreground">* Required field</p>
          <input type="hidden" name="return_to" value={returnTo} />
          <label className="block text-sm font-medium">Full name *<input required name="display_name" autoComplete="name" minLength={2} maxLength={100} className={authField} /></label>
          <label className="block text-sm font-medium">Email address *<input required type="email" name="email" autoComplete="email" className={authField} /></label>
          <SignupPasswordFields />
          <input type="hidden" name="requestId" value={crypto.randomUUID()} />
          <ConfiguredFields config={config} baseKeys={['display_name', 'email', 'password', 'confirm_password', 'return_to', 'requestId', 'formVersion']} />
          <button type="submit" className={authSubmit}>Create account</button>
        </form>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">Read our <Link href="/terms" className="font-semibold text-primary underline">Terms & conditions</Link> and <Link href="/privacy" className="font-semibold text-primary underline">Privacy policy</Link> before creating an account.</p>
        <p className="mt-6 text-center text-sm text-muted-foreground">Already registered? <Link className="font-semibold text-primary" href={`/login?return_to=${encodeURIComponent(returnTo)}`}>Sign in</Link></p>
    </AuthPanels>
  );
}
