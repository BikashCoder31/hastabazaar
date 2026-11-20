import { parseSellerApplication, type SellerApplicationInput } from './application';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from './managed-identity';
import { parseSellerPhone } from './contact-phone';

export const CURRENT_ONBOARDING_VERSION = 'seller-onboarding-2026-10-20-v1';
export const PENDING_PAYOUT_PREFIX = 'PENDING VERIFICATION:';
export const managedClearanceBlock = 'Commercial activation is blocked pending documented legal/accounting clearance, supplier registration and tax assessment, and independent payout beneficiary verification. Personal PAN, government ID and agreement acceptance do not authorise unregistered trading or use of Hastabazaar’s PAN.';
export type SellerOnboarding = Readonly<{
  version: typeof CURRENT_ONBOARDING_VERSION;
  bankDetailsDeferred?: true;
  payoutBeneficiary: string; bankName: string; bankBranch: string; bankAccountNumber: string;
  pickupAddress: string; returnAddress: string;
}>;

export function validateSellerOnboarding(value: SellerOnboarding): SellerOnboarding {
  if (value.version !== CURRENT_ONBOARDING_VERSION) throw new Error('Reload the current seller application.');
  for (const key of ['payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber', 'pickupAddress', 'returnAddress'] as const) {
    if (value.bankDetailsDeferred && !key.endsWith('Address')) {
      if (value[key] !== '') throw new Error('Add bank details from your dashboard after registration.');
      continue;
    }
    const text = value[key];
    const maximum = key.endsWith('Address') ? 500 : 160;
    if (typeof text !== 'string' || text.trim().length < 3 || text.length > maximum || /[\p{Cc}<>]/u.test(text))
      throw new Error(`${key} is required (3–${maximum} characters).`);
  }
  if (!value.bankDetailsDeferred && !/^[A-Za-z0-9 -]{4,40}$/.test(value.bankAccountNumber)) throw new Error('Enter a valid bank account number (4–40 characters).');
  return value;
}

/** Pending private evidence, never a verified payout destination or public/form-answer data. */
export function pendingPayoutReference(value: SellerOnboarding): string {
  if (value.bankDetailsDeferred) throw new Error('Bank details must be added before payout verification.');
  const { version, payoutBeneficiary, bankName, bankBranch, bankAccountNumber } = validateSellerOnboarding(value);
  return PENDING_PAYOUT_PREFIX + JSON.stringify({ version, payoutBeneficiary, bankName, bankBranch, bankAccountNumber });
}
export function isPendingPayoutReference(value: string): boolean { return value.trim().startsWith(PENDING_PAYOUT_PREFIX); }

export function parseSellerOnboardingForm(form: FormData, deferBank = false): SellerOnboarding {
  const text = (key: string) => { const value = form.get(key); return typeof value === 'string' ? value.trim() : ''; };
  return validateSellerOnboarding({ version:CURRENT_ONBOARDING_VERSION, ...(deferBank ? { bankDetailsDeferred: true as const } : {}), payoutBeneficiary:deferBank ? '' : text('payoutBeneficiary'),
    bankName:deferBank ? '' : text('bankName'),bankBranch:deferBank ? '' : text('bankBranch'),bankAccountNumber:deferBank ? '' : text('bankAccountNumber'),
    pickupAddress:text('pickupAddress'),returnAddress:text('returnAddress') });
}

/** Every new HTTP application uses this contract; legacy parsing remains for retained fixtures/records. */
export function parseCurrentSellerApplication(form: FormData): ReturnType<typeof parseSellerApplication> {
  const errors: string[] = [];
  const route = form.get('hasBusinessTaxRegistration');
  if (typeof route!=='string' || !['yes', 'no'].includes(route))
    errors.push('Choose Sell through Hastabazaar or Registered business seller.');
  const parsed = parseSellerApplication(form, { deferDashboardFields: true });
  if (parsed.input) {
    parsed.input.businessDescription = ''; parsed.input.productCategories = '';
    parsed.input.craftExperience = []; parsed.input.socialLinks = {};
  }
  errors.push(...parsed.errors);
  let onboarding: SellerOnboarding | undefined;
  try {
    const contact = parseSellerPhone(form.get('phone'), form.get('phoneCountry') ?? 'NP');
    if (parsed.input) { parsed.input.phone = contact.phone; parsed.input.phoneCountry = contact.country; }
    onboarding = parseSellerOnboardingForm(form, true);
    if (parsed.input?.participationRoute === 'managed_maker') {
      if (!/^\d{9}$/.test(parsed.input.managedIdentity?.personalPan ?? '')) errors.push('A 9-digit personal PAN is required.');
      if (parsed.input.managedIdentity?.managedAgreementVersion !== MANAGED_SUPPLIER_AGREEMENT_VERSION)
        errors.push('Review and explicitly accept the current Managed Supplier/Maker Agreement.');
    } else if (parsed.input && (!parsed.input.registrationAuthority || !parsed.input.registrationNumber)) {
      errors.push('Business registration authority and number are required, including for sole proprietors.');
    }
    if (parsed.input?.participationRoute==='registered_seller') {
      const representative=form.get('representativeName');
      if(typeof representative!=='string'||!representative.trim()||representative.length>160)errors.push('Authorised representative name is required.');
      else parsed.input.representativeName=representative.trim();
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : 'Payout and operational details are required.'); }
  return errors.length || !parsed.input || !onboarding ? { errors } : { errors, input: { ...parsed.input, onboarding } };
}

export function validateCurrentApplicationEvidence(input: SellerApplicationInput): void {
  if (!input.onboarding) return; // Existing retained applications use their recorded contract.
  validateSellerOnboarding(input.onboarding);
  if (input.participationRoute === 'managed_maker' &&
    (!/^\d{9}$/.test(input.managedIdentity?.personalPan ?? '') || input.managedIdentity?.managedAgreementVersion !== MANAGED_SUPPLIER_AGREEMENT_VERSION))
    throw new Error('Current personal PAN and explicitly accepted supplier agreement are required.');
  if (input.participationRoute === 'registered_seller' &&
    (!input.registrationAuthority || !input.registrationNumber || !/^\d{9}$/.test(input.taxRegistrationNumber)))
    throw new Error('Business registration and business PAN are required, including for sole proprietors.');
}

/** Only the server-recorded intake contract can defer bank evidence. */
export async function hasDeferredBankDetails(db: D1Database, sellerId: string): Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 AS deferred FROM audit_logs WHERE subject_type='seller' AND subject_id=?
    AND action='seller.application.submitted' AND json_extract(next_json,'$.bankDetailsDeferred')=true LIMIT 1`).bind(sellerId).first());
}
