'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { CompanySellingIdentity, ManagedMakerIdentityFields, ManagedMakerAgreementFields } from './managed-maker-identity-fields';
import type { ManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SellerParticipationProfile } from '@/lib/db/repositories/seller-applications';
import { sendJson } from '@/lib/http/client-request';
import { ConfiguredFields, fieldDisplay } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearVersionedSessionAttempt, getOrCreateVersionedSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '@/lib/sellers/managed-identity';
import { SellerOnboardingFields } from './seller-onboarding-fields';

const catalogBaseKeys = ['publicName', 'publicCity', 'sellerId', 'expectedVersion', 'experienceCraft',
  'experienceBand', 'facebookUrl', 'instagramUrl', 'linkedinUrl', 'tiktokUrl', 'xUrl', 'youtubeUrl',
  'legalName', 'governmentIdType', 'governmentIdDescription', 'personalPan', 'managedAgreementAccepted', 'managedAgreementVersion', 'managedAgreementContext', 'representativeIdentity', 'personalPanCertificate', 'bankVerification', 'payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber', 'pickupAddress', 'returnAddress', 'requestId', 'formVersion', 'customAnswers'];

const networks = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['linkedin', 'LinkedIn'],
  ['tiktok', 'TikTok'],
  ['x', 'X'],
  ['youtube', 'YouTube'],
] as const;

export function MakerApplicationProfileForm({ profile, managedTerms }: { profile: SellerParticipationProfile; managedTerms?: ManagedMakerApplicationTerms }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const attemptKey = sessionAttemptKey('seller.maker-profile', profile.sellerId);
  const [hasPendingAttempt, setHasPendingAttempt] = useState(false);
  const catalog = usePublishedFormConfig('seller.maker-profile');
  const correcting = profile.participationRoute === 'managed_maker' && profile.applicationStage === 'changes_requested';
  const experience = profile.craftExperience[0];
  useEffect(() => {
    const timeout = window.setTimeout(() => setHasPendingAttempt(hasSessionAttempt(attemptKey)), 0);
    return () => window.clearTimeout(timeout);
  }, [attemptKey]);
  function resetAttempt() {
    if (!window.confirm('A previous maker profile save may already have succeeded. Check your application progress first. Starting a new attempt can create duplicate history. Start a new attempt anyway?')) return;
    try { sessionStorage.removeItem(attemptKey); sessionStorage.removeItem(`${attemptKey}:expected-version`); }
    catch { setMessage('Browser session storage is unavailable. Please enable it before submitting.'); return; }
    setHasPendingAttempt(false);
    setMessage('New maker profile attempt ready.');
  }
  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (busy || !catalog.canSubmit || !catalog.config) return;
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const configured = readConfiguredSubmission(event.currentTarget, catalog.config, catalogBaseKeys);
      const attempt = getOrCreateVersionedSessionAttempt(attemptKey, profile.version);
      setHasPendingAttempt(true);
      if (correcting) {
        if (!managedTerms) throw new Error('Reload before accepting the Managed Maker agreement.');
        form.set('expectedVersion',String(attempt.expectedVersion)); form.set('requestId',attempt.requestId);
        const response=await fetch('/api/seller-applications/profile',{method:'POST',body:form});
        const result=await response.json().catch(()=>null) as {ok?:boolean;error?:string;code?:string}|null;
        if (result?.code==='stale_version') catalog.handleSubmissionResponse(response,result.code);
        if (!response.ok || result?.ok!==true) throw new Error(result?.error ?? 'Correction status is uncertain. Retry the same details to recover its outcome.');
      } else {
      await sendJson('/api/seller-applications/profile', 'PATCH', {
        ...Object.fromEntries([...form.entries()].filter(([key]) => key !== 'formVersion' && !key.startsWith('custom.'))),
        expectedVersion: attempt.expectedVersion,
        requestId: attempt.requestId,
        ...configuredJsonPayload(catalog.config, configured.answers, catalogBaseKeys),
      }, 'Maker profile could not be saved.');
      }
      clearVersionedSessionAttempt(attemptKey);
      setHasPendingAttempt(false);
      setMessage(correcting ? 'Evidence supplied and application resubmitted for Super Admin review.' : 'Maker profile saved.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Maker profile could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return <form data-form-id="seller.maker-profile" onSubmit={(event) => void submit(event)} className="mt-5 grid gap-4 rounded-2xl border bg-card p-6 sm:grid-cols-2">
      <FormGuide formId="seller.maker-profile" />

    <Field name="publicName" label={fieldDisplay(catalog.config, 'publicName')?.label ?? 'Public maker/shop name'}
      help={fieldDisplay(catalog.config, 'publicName')?.helpText} placeholder={fieldDisplay(catalog.config, 'publicName')?.placeholder}
      defaultValue={profile.publicName} required />
    <Field name="publicCity" label={fieldDisplay(catalog.config, 'publicCity')?.label ?? 'Public city/town only'}
      help={fieldDisplay(catalog.config, 'publicCity')?.helpText} placeholder={fieldDisplay(catalog.config, 'publicCity')?.placeholder}
      defaultValue={profile.publicCity} required />
    <Field name="experienceCraft" label="Craft for this experience (optional)" defaultValue={experience?.craft ?? ''} />
    <div className="space-y-2">
      <Label htmlFor="experienceBand">Experience in that craft (optional)</Label>
      <select id="experienceBand" name="experienceBand" defaultValue={experience?.band ?? ''} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">
        <option value="">Not provided</option>
        <option value="beginner">Beginner</option>
        <option value="less_than_one_year">Less than one year</option>
        <option value="one_to_three_years">1–3 years</option>
        <option value="four_to_ten_years">4–10 years</option>
        <option value="more_than_ten_years">More than 10 years</option>
      </select>
    </div>
    {networks.map(([network, label]) => <Field key={network} name={`${network}Url`} label={`${label} link (optional)`} type="url" defaultValue={profile.socialLinks[network] ?? ''} />)}
    {correcting && managedTerms ? <div className="space-y-4 sm:col-span-2"><p className="text-sm">Supply government identity evidence and explicitly accept the current terms to resubmit requested corrections. Prior evidence and acceptances remain recorded.</p><CompanySellingIdentity terms={managedTerms}/><ManagedMakerIdentityFields includeUploads requirePersonalPan={managedTerms.version===MANAGED_SUPPLIER_AGREEMENT_VERSION}/>{managedTerms.version===MANAGED_SUPPLIER_AGREEMENT_VERSION ? <SellerOnboardingFields/> : null}<ManagedMakerAgreementFields terms={managedTerms}/></div> : null}
    <p className="text-sm leading-6 text-muted-foreground sm:col-span-2">Your private verification, pickup, return, and invoice addresses are not shown here. Empty optional public sections stay hidden.</p>
    {catalog.config ? <div className="sm:col-span-2"><ConfiguredFields config={catalog.config} baseKeys={catalogBaseKeys} /></div> : null}
    {catalog.status !== 'ready' ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{catalog.message || 'Form configuration is unavailable. Please try again.'}</p> : null}
    <div className="flex items-center gap-3 sm:col-span-2">
      <Button type="submit" disabled={busy || !catalog.canSubmit || (correcting && !managedTerms)}>{busy ? 'Saving…' : correcting ? 'Resubmit application with evidence' : 'Save maker profile'}</Button>
      <output className="text-sm text-muted-foreground" aria-live="polite">{message}</output>
    </div>
    {hasPendingAttempt ? <div className="space-y-2 sm:col-span-2">
      <p className="text-sm text-muted-foreground">If a save response was lost, retrying reuses its request reference. Check application progress before starting a different attempt.</p>
      <Button type="button" variant="outline" onClick={resetAttempt}>Start a new maker profile attempt</Button>
    </div> : null}
  </form>;
}

function Field({ name, label, help, ...props }: { name: string; label: string; help?: string } & React.ComponentProps<typeof Input>) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label>
    <Input id={name} name={name} maxLength={500} aria-describedby={help ? `${name}-catalog-help` : undefined} {...props} />
    {help ? <p id={`${name}-catalog-help`} className="text-sm text-muted-foreground">{help}</p> : null}</div>;
}
