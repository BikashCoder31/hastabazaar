import { parseSellerPhone, sellerPhoneCountries } from './contact-phone';
import { type DraftAnswers } from './draft-contract';
import { CURRENT_ONBOARDING_VERSION, parseCurrentSellerApplication } from './onboarding';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION, governmentIdTypes } from './managed-identity';
import type { SellerApplicationInput } from './application';

export const intakeVersion = 'seller-registration-2026-10-29';
export const registrationFields = [
  ['legalName', 'Full legal name / legal business name', 160], ['tradingName', 'Shop or trading name', 160],
  ['representativeName', 'Person applying for the business', 160], ['registrationAuthority', 'Office that registered your business', 160],
  ['registrationNumber', 'Business registration number', 80], ['taxRegistrationNumber', 'Business PAN or VAT number', 9],
  ['phone', 'Contact phone', 10], ['district', 'District', 100], ['municipality', 'Municipality', 120],
  ['ward', 'Ward number', 20], ['locality', 'Locality or street', 180], ['publicCity', 'City customers will see', 120],
  ['governmentIdDescription', 'Citizenship number', 500], ['personalPan', 'Personal PAN', 9],
  ['pickupAddress', 'Full pickup address', 500], ['returnAddress', 'Full return address', 500],
] as const;
export const registrationFileKinds = {
  businessRegistration: 'business_registration', panCertificate: 'pan_certificate', vatCertificate: 'vat_certificate',
  representativeIdentity: 'representative_identity', personalPanCertificate: 'pan_certificate',
} as const;
const consentFields = ['acceptedTerms', 'applicationAcknowledgement', 'managedAgreementAccepted', 'managedAgreementVersion', 'managedAgreementContext', 'sellerAgreementContext'];
export function readOptionalRegistration(form: FormData): DraftAnswers {
  const answers: DraftAnswers = {};
  const allowed = new Set([...registrationFields.map(([key]) => key), 'hasBusinessTaxRegistration', 'applicantType', 'taxStatus', 'phoneCountry', 'province', 'governmentIdType', ...consentFields, 'email', 'formVersion', 'requestId', 'website', 'revision']);
  for (const [key, value] of form) {
    if (Object.hasOwn(registrationFileKinds, key)) { if (form.getAll(key).length !== 1 || !(value instanceof File) && value !== '') throw new Error('Invalid document field.'); continue; }
    if (!allowed.has(key) && !key.startsWith('custom.')) throw new Error('Unknown registration field.');
    if (typeof value !== 'string' || value.length > 5000 || !key.startsWith('custom.') && form.getAll(key).length !== 1) throw new Error('Invalid registration field.');
    if (['email', 'formVersion', 'requestId', 'website', 'revision'].includes(key)) continue;
    (answers[key] ??= []).push(value.trim());
  }
  for (const [key, label, maximum] of registrationFields) if ((answers[key]?.[0]?.length ?? 0) > maximum) throw new Error(`${label} is too long.`);
  const text = (key: string) => answers[key]?.[0] ?? '';
  if (text('phoneCountry') && !sellerPhoneCountries.some(country => country.code === text('phoneCountry'))) throw new Error('Choose a valid phone country.');
  if (text('phone')) parseSellerPhone(text('phone'), text('phoneCountry') || 'NP');
  for (const key of ['taxRegistrationNumber', 'personalPan']) if (text(key) && !/^\d{9}$/.test(text(key))) throw new Error('A PAN or VAT number, when entered, must have 9 digits.');
  const enums: Record<string, string[]> = { hasBusinessTaxRegistration: ['yes', 'no'], applicantType: ['individual', 'company'], taxStatus: ['business_pan_only', 'vat_registered'],
    governmentIdType: [...governmentIdTypes], province: ['Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim'] };
  for (const [key, choices] of Object.entries(enums)) if (text(key) && !choices.includes(text(key))) throw new Error(`Choose a valid ${key}.`);
  if (new TextEncoder().encode(JSON.stringify(answers)).length > 64_000) throw new Error('Registration answers are too large.');
  return answers;
}
export function optionalRegistrationInput(answers: DraftAnswers, email: string): SellerApplicationInput {
  const text = (key: string) => answers[key]?.[0] ?? '';
  const registered = text('hasBusinessTaxRegistration') === 'yes';
  const country = text('phoneCountry') || 'NP';
  return { participationRoute: registered ? 'registered_seller' : 'managed_maker', hasBusinessTaxRegistration: registered,
    applicantType: registered && text('applicantType') === 'company' ? 'company' : 'individual', legalName: text('legalName'),
    tradingName: text('tradingName'), representativeName: text('representativeName'), email,
    phone: text('phone') ? parseSellerPhone(text('phone'), country).phone : '', phoneCountry: country,
    registrationAuthority: registered ? text('registrationAuthority') : '', registrationNumber: registered ? text('registrationNumber') : '',
    taxMode: registered ? text('taxStatus') === 'vat_registered' ? 'VAT' : 'PAN' : 'NONE',
    taxStatus: registered ? text('taxStatus') === 'vat_registered' ? 'vat_registered' : 'business_pan_only' : null,
    taxRegistrationNumber: registered ? text('taxRegistrationNumber') : '', province: text('province'), district: text('district'),
    municipality: text('municipality'), ward: text('ward') || null, locality: text('locality'), publicCity: text('publicCity') || text('municipality'),
    businessDescription: '', productCategories: '', craftExperience: [], socialLinks: {},
    onboarding: { version: CURRENT_ONBOARDING_VERSION, bankDetailsDeferred: true, payoutBeneficiary: '', bankName: '', bankBranch: '', bankAccountNumber: '',
      pickupAddress: text('pickupAddress'), returnAddress: text('returnAddress') } };
}
export function completeRegistrationInput(answers: DraftAnswers, email: string) {
  const form = new FormData();
  for (const [key, values] of Object.entries(answers)) for (const value of values) form.append(key, value);
  form.set('email', email);
  if (!form.get('hasBusinessTaxRegistration')) form.set('hasBusinessTaxRegistration', 'no');
  if (!form.get('applicantType')) form.set('applicantType', 'individual');
  if (form.get('hasBusinessTaxRegistration') === 'no') form.set('managedAgreementVersion', MANAGED_SUPPLIER_AGREEMENT_VERSION);
  return parseCurrentSellerApplication(form);
}
