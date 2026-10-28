import { companyDetails } from '../content/company-details';
import type { ManagedMakerCompanyAccount } from '../configuration/types';
export const MANAGED_MAKER_AGREEMENT_VERSION =
  'managed-maker-sale-linked-2026-10-13-v1';
// Retain v1 and its exact snapshot for historical commerce. New intake uses v2.
export const MANAGED_SUPPLIER_AGREEMENT_VERSION = 'managed-supplier-maker-2026-10-20-v2';
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
  managedAgreementVersion: typeof MANAGED_MAKER_AGREEMENT_VERSION | typeof MANAGED_SUPPLIER_AGREEMENT_VERSION;
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
    ![MANAGED_MAKER_AGREEMENT_VERSION, MANAGED_SUPPLIER_AGREEMENT_VERSION].includes(String(data.managedAgreementVersion))
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
    managedAgreementVersion: data.managedAgreementVersion as ManagedMakerIdentity['managedAgreementVersion'],
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
  version: ManagedMakerIdentity['managedAgreementVersion'] = MANAGED_MAKER_AGREEMENT_VERSION,
): readonly string[] {
  if (version === MANAGED_SUPPLIER_AGREEMENT_VERSION) return [
    `${companyDetails.legalName} is the legal seller and invoice issuer only for approved company sales. My public store remains the supplier, traceable on order and billing records. This agreement does not authorise me to borrow or trade under the company’s PAN.`,
    'I have authority to supply these goods, own them or have lawful permission from their owner, and will provide truthful source, authenticity, intellectual-property and product safety information. Restricted goods and required licences remain subject to review.',
    `For an accepted sale-linked offer, the company retains ${platformRetentionBps / 100}% and the maker receives ${(10000 - platformRetentionBps) / 100}% of eligible product value, excluding separately stated tax and delivery and deducting maker-funded discounts. Company-funded discounts do not reduce the agreed value. A fixed purchase-price arrangement requires a separate accepted supply offer; only its agreed purchase price applies, with no automatic additional commission.`,
    'I retain responsibility for accurate stock, lawful source, safe storage and preparation until the separately agreed handover. The approved product price, transfer of ownership/risk and any fixed purchase price must be recorded before commercial activation.',
    'Payouts require verified beneficiary and bank evidence; a name mismatch requires independent review. Only completed, paid eligible sales create earnings, subject to the recorded delivery hold, settlement schedule, returns, disputes, refunds and legally required deductions. Fixed-price payments follow their accepted supply terms.',
    'I must disclose defects and warranties, provide accurate product information and cooperate with returns, replacements and warranty claims. Customer rights and the company’s legal obligations continue; responsibility for supplier defects, return costs and losses must be recorded in the approved commercial terms.',
    'Personal PAN and government ID establish identity, not permission to conduct unregistered business. Applicable firm/industry registration, business PAN conversion, VAT, source invoices, withholding and supplier tax reporting require accountant/legal confirmation before activation. The company remains responsible for its own sales invoices and tax accounting.',
    'Identity, PAN and bank information is private and used by authorised staff for verification, tax compliance, payment and dispute handling under the Privacy Policy, with lawful retention and disclosure. It is excluded from the public store profile.',
    'I explicitly accept only this version and displayed company identity and sale-linked rate. Submission is Under review and grants no selling permission. Staff review, Super Admin approval, product review and documented legal/accounting and payout clearance remain separate. Later changes require fresh acceptance where applicable; historical agreements, orders and payments retain their recorded terms.',
  ];
  return [
    `I authorise ${companyDetails.legalName} (${companyDetails.brandName}) to operate the company selling account for my approved products. My maker identity and individual account remain my own.`,
    `Compensation is sale-linked: Hastabazaar retains ${platformRetentionBps / 100}% of eligible product value and my entitlement is the remainder. Eligible value excludes separately stated tax and delivery charges and deducts maker-funded discounts. Hastabazaar-funded discounts do not reduce my agreed product value.`,
    'Unpaid, undelivered, cancelled, disputed or refunded sales do not create payable earnings. Adjustments, the delivery hold, payout schedule, verified receiving-account requirements and legally applicable deductions still apply.',
    'I will provide truthful identity and product information, comply with applicable supplier and tax duties, and follow the Prohibited & Restricted Products Policy. Optional personal PAN at application does not remove any tax obligation or replace business PAN/VAT registration.',
    'Acceptance records this version and the company identity and retention rate shown at submission. Application approval does not enable live commerce; program, maker, product and commercial readiness checks must all pass. Changes to commercial terms require separate review and acceptance where applicable.',
  ];
}
export function managedMakerAgreementSnapshot(
  account: ManagedMakerCompanyAccount,
  platformRetentionBps: number,
  version: ManagedMakerIdentity['managedAgreementVersion'] = MANAGED_MAKER_AGREEMENT_VERSION,
) {
  return {
    version,
    company: { ...companyDetails },
    companyAccount: { ...account },
    commercialModel: 'managed_sale_linked_percentage_v1' as const,
    platformRetentionBps,
    terms: managedMakerAgreementTerms(platformRetentionBps, version),
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
