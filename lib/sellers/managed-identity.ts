import { companyDetails } from '../content/company-details';
import type { ManagedMakerCompanyAccount } from '../configuration/types';
export const MANAGED_MAKER_AGREEMENT_VERSION =
  'managed-maker-sale-linked-2026-10-13-v1';
export const governmentIdTypes = [
  'citizenship',
  'national_id',
  'passport',
  'driving_licence',
  'other_government_id',
] as const;
export type ManagedMakerIdentity = Readonly<{
  governmentIdType: (typeof governmentIdTypes)[number];
  governmentIdDescription: string;
  personalPan: string;
  managedAgreementAccepted: true;
  managedAgreementContext: string;
  managedAgreementVersion: typeof MANAGED_MAKER_AGREEMENT_VERSION;
}>;
export function validateManagedMakerIdentity(
  value: unknown,
): ManagedMakerIdentity {
  if (!value || typeof value !== 'object')
    throw new Error(
      'Government identity and explicit Managed Maker agreement acceptance are required.',
    );
  const data = value as Record<string, unknown>;
  if (
    !governmentIdTypes.includes(
      data.governmentIdType as ManagedMakerIdentity['governmentIdType'],
    )
  )
    throw new Error('Choose a government-issued identity document type.');
  const description =
    typeof data.governmentIdDescription === 'string'
      ? data.governmentIdDescription.trim()
      : '';
  if (
    description.length > 200 ||
    (data.governmentIdType === 'other_government_id' && description.length < 3)
  )
    throw new Error(
      'Describe the government document and its issuing authority (3–200 characters).',
    );
  if (data.personalPan !== undefined && typeof data.personalPan !== 'string')
    throw new Error('Personal PAN must be a 9-digit string when supplied.');
  const personalPan =
    typeof data.personalPan === 'string' ? data.personalPan.trim() : '';
  if (personalPan && !/^\d{9}$/.test(personalPan))
    throw new Error(
      'Personal PAN, if supplied, must contain exactly 9 digits.',
    );
  if (
    data.managedAgreementAccepted !== true ||
    data.managedAgreementVersion !== MANAGED_MAKER_AGREEMENT_VERSION
  )
    throw new Error(
      'Explicitly accept the current Managed Maker selling agreement.',
    );
  if (
    typeof data.managedAgreementContext !== 'string' ||
    !/^[a-f0-9]{64}$/.test(data.managedAgreementContext)
  )
    throw new Error(
      'Reload the Managed Maker agreement before accepting its terms.',
    );
  return {
    managedAgreementContext: data.managedAgreementContext,
    governmentIdType:
      data.governmentIdType as ManagedMakerIdentity['governmentIdType'],
    governmentIdDescription: description,
    personalPan,
    managedAgreementAccepted: true,
    managedAgreementVersion: MANAGED_MAKER_AGREEMENT_VERSION,
  };
}
export function parseManagedMakerIdentity(
  form: FormData,
): ManagedMakerIdentity {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  return validateManagedMakerIdentity({
    governmentIdType: text('governmentIdType'),
    governmentIdDescription: text('governmentIdDescription'),
    personalPan: text('personalPan'),
    managedAgreementContext: text('managedAgreementContext'),
    managedAgreementAccepted: text('managedAgreementAccepted') === 'yes',
    managedAgreementVersion: text('managedAgreementVersion'),
  });
}
export function managedMakerAgreementTerms(
  platformRetentionBps: number,
): readonly string[] {
  return [
    `I authorise ${companyDetails.legalName} (${companyDetails.brandName}) to operate the company selling account for my approved products. My maker identity and individual account remain my own.`,
    `Compensation is sale-linked: HastaBazaar retains ${platformRetentionBps / 100}% of eligible product value and my entitlement is the remainder. Eligible value excludes separately stated tax and delivery charges and deducts maker-funded discounts. HastaBazaar-funded discounts do not reduce my agreed product value.`,
    'Unpaid, undelivered, cancelled, disputed or refunded sales do not create payable earnings. Adjustments, the delivery hold, payout schedule, verified receiving-account requirements and legally applicable deductions still apply.',
    'I will provide truthful identity and product information, comply with applicable supplier and tax duties, and follow the Prohibited & Restricted Products Policy. Optional personal PAN at application does not remove any tax obligation or replace business PAN/VAT registration.',
    'Acceptance records this version and the company identity and retention rate shown at submission. Application approval does not enable live commerce; program, maker, product and commercial readiness checks must all pass. Changes to commercial terms require separate review and acceptance where applicable.',
  ];
}
export function managedMakerAgreementSnapshot(
  account: ManagedMakerCompanyAccount,
  platformRetentionBps: number,
) {
  return {
    version: MANAGED_MAKER_AGREEMENT_VERSION,
    company: { ...companyDetails },
    companyAccount: { ...account },
    commercialModel: 'managed_sale_linked_percentage_v1' as const,
    platformRetentionBps,
    terms: managedMakerAgreementTerms(platformRetentionBps),
  };
}

export async function managedMakerAgreementContext(
  snapshot: ReturnType<typeof managedMakerAgreementSnapshot>,
): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(snapshot)),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
