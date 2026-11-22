import type {SellerDocumentKind} from './application';
/** Bank evidence has its own beneficiary comparison and verification action. */
export const registrationEvidenceKinds = ['representative_identity','pan_certificate','business_registration','vat_certificate'] as const satisfies readonly SellerDocumentKind[];
