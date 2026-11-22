import type { DraftAnswers } from './draft-contract';
import type { SellerDocumentKind } from './application';

/** Protected facts are code-owned; editable contact/location fields do not unlock these facts. */
const fields: Partial<Record<SellerDocumentKind, readonly string[]>> = {
  representative_identity: ['legalName','applicantType','representativeName','governmentIdType','governmentIdDescription'],
  pan_certificate: ['legalName','applicantType','representativeName','personalPan','taxRegistrationNumber','taxStatus'],
  bank_verification: ['legalName','applicantType','representativeName','governmentIdType','governmentIdDescription','personalPan','taxRegistrationNumber'],
  business_registration: ['legalName','applicantType','registrationAuthority','registrationNumber','representativeName'],
  vat_certificate: ['legalName','applicantType','taxRegistrationNumber','taxStatus'],
};
export function protectedRegistrationFields(kinds: readonly string[]) {
  return [...new Set(kinds.flatMap(kind => fields[kind as SellerDocumentKind] ?? []))];
}
export function registrationChangedEvidence(before: DraftAnswers, after: DraftAnswers, uploads: readonly SellerDocumentKind[]) {
  return [...new Set([...uploads, ...Object.entries(fields).filter(([, names]) => names.some(name =>
    JSON.stringify(before[name] ?? ['']) !== JSON.stringify(after[name] ?? ['']))).map(([kind]) => kind as SellerDocumentKind)])];
}
