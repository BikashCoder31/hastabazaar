'use client';
import { useState } from 'react';
import {
  companyDetails,
  companyPanDisplay,
} from '@/lib/content/company-details';
import {
  MANAGED_MAKER_AGREEMENT_VERSION,
  managedMakerAgreementTerms,
} from '@/lib/sellers/managed-identity';
import type { ManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CompanySellingIdentity({
  terms,
}: {
  terms: ManagedMakerApplicationTerms;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-secondary/30 p-4 text-sm">
      <p className="font-semibold">
        Company selling account: {terms.account.storeName}
      </p>
      <p>
        {companyDetails.legalName} · Registration{' '}
        {companyDetails.registrationNumber} · Company PAN: {companyPanDisplay}
      </p>
      <p>
        Contact: {terms.account.contactEmail}
        {terms.account.contactPhone ? ` · ${terms.account.contactPhone}` : ''}
      </p>
      <p>Company return address: {terms.account.returnAddress}</p>
      <p>
        This company account is operated by Super Admin. Enter your own personal
        details below; you keep your individual maker account.
      </p>
    </div>
  );
}
export function ManagedMakerIdentityFields({
  includeUploads = false,
}: {
  includeUploads?: boolean;
}) {
  const [type, setType] = useState('');
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-3 font-semibold">Private maker identity</legend>
      <div className="space-y-2">
        <Label htmlFor="governmentIdType">Government-issued ID type *</Label>
        <select
          id="governmentIdType"
          name="governmentIdType"
          required
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="h-10 w-full rounded-lg border bg-background px-3"
        >
          <option value="">Choose a government-issued ID</option>
          <option value="citizenship">Citizenship certificate</option>
          <option value="national_id">National ID</option>
          <option value="passport">Passport</option>
          <option value="driving_licence">Driving licence</option>
          <option value="other_government_id">
            Other government-issued ID
          </option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="governmentIdDescription">
          Issuing authority / description{' '}
          {type === 'other_government_id' ? '*' : '(optional)'}
        </Label>
        <Input
          id="governmentIdDescription"
          name="governmentIdDescription"
          required={type === 'other_government_id'}
          minLength={type === 'other_government_id' ? 3 : undefined}
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="personalPan">Personal PAN (optional)</Label>
        <Input
          id="personalPan"
          name="personalPan"
          inputMode="numeric"
          pattern="[0-9]{9}"
          maxLength={9}
        />
        <p className="text-xs text-muted-foreground">
          If issued, enter your 9-digit personal PAN. This is separate from
          business PAN and the company PAN.
        </p>
      </div>
      {includeUploads ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="representativeIdentity">
              Government-issued ID document *
            </Label>
            <Input
              type="file"
              id="representativeIdentity"
              name="representativeIdentity"
              required
              accept="application/pdf,image/jpeg,image/png"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="personalPanCertificate">
              Personal PAN certificate (optional)
            </Label>
            <Input
              type="file"
              id="personalPanCertificate"
              name="personalPanCertificate"
              accept="application/pdf,image/jpeg,image/png"
            />
          </div>
        </>
      ) : null}
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Identity documents and personal PAN stay private and are reviewed by
        Super Admin. PDF, JPG or PNG; up to 5 MB each.
      </p>
    </fieldset>
  );
}
export function ManagedMakerAgreementFields({
  terms,
}: {
  terms: ManagedMakerApplicationTerms;
}) {
  return (
    <fieldset className="space-y-4 rounded-lg border p-4">
      <legend className="px-2 font-semibold">
        Managed Maker selling agreement
      </legend>
      <p className="text-sm">Version: {MANAGED_MAKER_AGREEMENT_VERSION}</p>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        {managedMakerAgreementTerms(terms.platformRetentionBps).map((term) => (
          <li key={term}>{term}</li>
        ))}
      </ol>
      <a
        href="/prohibited-products"
        target="_blank"
        rel="noreferrer"
        className="text-sm underline"
      >
        Prohibited &amp; Restricted Products Policy
      </a>
      <input
        type="hidden"
        name="managedAgreementVersion"
        value={MANAGED_MAKER_AGREEMENT_VERSION}
      />
      <input
        type="hidden"
        name="managedAgreementContext"
        value={terms.context}
      />
      <div className="flex items-start gap-3">
        <Checkbox
          id="managedAgreementAccepted"
          name="managedAgreementAccepted"
          value="yes"
          required
        />
        <Label
          htmlFor="managedAgreementAccepted"
          className="text-sm font-normal leading-6"
        >
          I have read and explicitly accept this Managed Maker selling
          agreement, the company identity and the{' '}
          {terms.platformRetentionBps / 100}% platform retention shown above. *
        </Label>
      </div>
    </fieldset>
  );
}
