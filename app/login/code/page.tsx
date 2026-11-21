import { AuthPanels, authSubmit, authField } from '@/components/account/customer-auth-panels';
import { FormGuide } from '@/components/forms/form-guide';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { resolvePublishedForm } from '@/lib/forms/runtime';
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
  const config = await resolvePublishedForm(requireDatabase(env as unknown as { DB?: D1Database }), 'identity.email-code-verify');

  return (
    <AuthPanels page="login" returnTo={returnTo} challenge>
        <h1 className="font-heading text-4xl tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">If an active account exists for that address, a six-digit code may arrive shortly. It expires 10 minutes after the request.</p>
        {error ? <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
        <form data-form-id="identity.email-code-verify" action="/api/auth/email-code/verify" method="post" className="mt-6 space-y-4">
      <FormGuide formId="identity.email-code-verify" />

<p className="text-xs text-muted-foreground">* Required field</p>

          <input type="hidden" name="return_to" value={returnTo} />
          <label className="block text-sm font-medium">Sign-in code <span aria-hidden="true">*</span><input required name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} className={authField + " text-center font-mono text-2xl tracking-[0.35em]"} /></label>
          <input type="hidden" name="requestId" value={crypto.randomUUID()} />
          <ConfiguredFields config={config} baseKeys={['code', 'return_to', 'requestId', 'formVersion']} />
          <button type="submit" className={authSubmit}>Verify and sign in</button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground"><Link className="font-semibold text-primary" href={`/login?return_to=${encodeURIComponent(returnTo)}`}>Request another code</Link></p>
    </AuthPanels>
  );
}
