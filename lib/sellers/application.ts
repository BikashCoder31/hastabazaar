import { parseManagedMakerIdentity, type ManagedMakerIdentity } from './managed-identity';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';
import type { SellerOnboarding } from './onboarding';
import {
  parseCraftExperience,
  parseMakerSocialLinks,
  type CraftExperience,
  type MakerSocialLinks,
  type ParticipationRoute,
} from '@/lib/sellers/participation';

export const sellerAgreementVersion = SELLER_AGREEMENT_VERSION;

export type SellerDocumentKind =
  | 'business_registration'
  | 'pan_certificate'
  | 'vat_certificate'
  | 'representative_identity'
  | 'bank_verification';
export function sellerDocumentsForApplication(input: {
  applicantType: 'individual' | 'company';
  taxMode: 'PAN' | 'VAT' | 'BOTH' | 'NONE';
  participationRoute?: ParticipationRoute;
  hasBusinessTaxRegistration?: boolean;
  onboarding?: Pick<SellerOnboarding, 'version'>;
}) {
  if (input.onboarding) {
    const managed = input.participationRoute === 'managed_maker';
    return [
      ...(!managed ? [{ field: 'businessRegistration', kind: 'business_registration' as const, label: 'Business registration certificate (including sole proprietors)', required: true }] : []),
      { field: managed ? 'personalPanCertificate' : 'panCertificate', kind: 'pan_certificate' as const, label: managed ? 'Personal PAN certificate' : 'Business PAN certificate', required: true },
      ...(!managed && input.taxMode !== 'PAN' ? [{ field: 'vatCertificate', kind: 'vat_certificate' as const, label: 'VAT certificate', required: true }] : []),
      { field: 'representativeIdentity', kind: 'representative_identity' as const, label: managed ? 'Government-issued identity document' : 'Authorised representative identity document', required: true },
      { field: 'bankVerification', kind: 'bank_verification' as const, label: 'Bank evidence showing beneficiary, bank and account number', required: true },
    ];
  }
  if (input.participationRoute === 'managed_maker' || input.taxMode === 'NONE') {
    return [
      { field: 'personalPanCertificate', kind: 'pan_certificate' as const, label: 'Personal PAN certificate (optional)', required: false },
      {
        field: 'representativeIdentity',
        kind: 'representative_identity' as const,
        label: 'Government-issued identity document',
        required: true,
      },
      {
        field: 'bankVerification',
        kind: 'bank_verification' as const,
        label: 'Payment account evidence (optional during application)',
        required: false,
      },
    ];
  }
  const explicitRegisteredRoute = input.participationRoute === 'registered_seller';
  return [
    ...(input.applicantType === 'company' || explicitRegisteredRoute
      ? [
          {
            field: 'businessRegistration',
            kind: 'business_registration' as const,
            label: 'Company registration certificate',
            required: true,
          },
        ]
      : []),
    ...(input.taxMode !== 'VAT'
      ? [
          {
            field: 'panCertificate',
            kind: 'pan_certificate' as const,
            label: 'PAN certificate',
            required: true,
          },
        ]
      : []),
    ...(input.taxMode !== 'PAN'
      ? [
          {
            field: 'vatCertificate',
            kind: 'vat_certificate' as const,
            label: 'VAT certificate',
            required: true,
          },
        ]
      : []),
    {
      field: 'representativeIdentity',
      kind: 'representative_identity' as const,
      label: 'Identity document (optional)',
      required: false,
    },
    {
      field: 'bankVerification',
      kind: 'bank_verification' as const,
      label: 'Bank verification (optional)',
      required: false,
    },
  ];
}

export interface SellerApplicationInput {
  onboarding?: SellerOnboarding;
  managedIdentity?: ManagedMakerIdentity;
  participationRoute: ParticipationRoute;
  hasBusinessTaxRegistration: boolean;
  applicantType: 'individual' | 'company';
  legalName: string;
  tradingName: string;
  registrationAuthority: string;
  registrationNumber: string;
  taxMode: 'PAN' | 'VAT' | 'BOTH' | 'NONE';
  taxStatus: 'business_pan_only' | 'vat_registered' | null;
  taxRegistrationNumber: string;
  representativeName: string;
  email: string;
  phone: string;
  province: string;
  district: string;
  municipality: string;
  ward: string | null;
  locality: string;
  businessDescription: string;
  productCategories: string;
  publicCity: string;
  craftExperience: readonly CraftExperience[];
  socialLinks: MakerSocialLinks;
}

export interface SellerApplicationDocument {
  id: string;
  kind: SellerDocumentKind;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SellerProfileMediaUpload {
  id: string;
  kind: 'profile_image' | 'maker_video';
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

const acceptedDocumentTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export const maximumDocumentBytes = 5 * 1024 * 1024;
export const maximumApplicationBytes = 42 * 1024 * 1024;

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function parseSellerApplication(formData: FormData): {
  input?: SellerApplicationInput;
  errors: readonly string[];
} {
  const errors: string[] = [];
  const taxMode = textField(formData, 'taxMode');
  const registrationAnswer = textField(formData, 'hasBusinessTaxRegistration');
  const usesNewRouteQuestion = registrationAnswer.length > 0;
  const participationRoute: ParticipationRoute = registrationAnswer === 'no'
    ? 'managed_maker'
    : 'registered_seller';
  const taxStatus = textField(formData, 'taxStatus');
  const applicantType = textField(formData, 'applicantType');
  if (!['individual', 'company'].includes(applicantType))
    errors.push('Choose Individual or Company.');
  if (usesNewRouteQuestion && !['yes', 'no'].includes(registrationAnswer)) {
    errors.push('Answer whether this business has PAN/VAT registration.');
  }
  if (participationRoute === 'registered_seller') {
    if (usesNewRouteQuestion && !['business_pan_only', 'vat_registered'].includes(taxStatus)) {
      errors.push('Choose business PAN without VAT or VAT registered.');
    } else if (!usesNewRouteQuestion && !['PAN', 'VAT', 'BOTH'].includes(taxMode)) {
      errors.push('Choose PAN, VAT or Both.');
    }
  }
  const email = textField(formData, 'email').toLowerCase();
  const phone = textField(formData, 'phone').replace(/[\s()-]/g, '');
  const acceptedTerms = textField(formData, 'acceptedTerms');
  const applicationAcknowledgement = textField(formData, 'applicationAcknowledgement');

  let craftExperience: readonly CraftExperience[] = [];
  let socialLinks: MakerSocialLinks = {};
  try {
    craftExperience = parseCraftExperience(
      textField(formData, 'experienceCraft'),
      textField(formData, 'experienceBand'),
    );
    socialLinks = parseMakerSocialLinks({
      facebook: textField(formData, 'facebookUrl'),
      instagram: textField(formData, 'instagramUrl'),
      linkedin: textField(formData, 'linkedinUrl'),
      tiktok: textField(formData, 'tiktokUrl'),
      x: textField(formData, 'xUrl'),
      youtube: textField(formData, 'youtubeUrl'),
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Optional maker profile details are invalid.');
  }

  const resolvedTaxMode: SellerApplicationInput['taxMode'] = participationRoute === 'managed_maker'
    ? 'NONE'
    : usesNewRouteQuestion
      ? taxStatus === 'vat_registered' ? 'VAT' : 'PAN'
      : taxMode === 'BOTH' ? 'BOTH' : taxMode === 'VAT' ? 'VAT' : 'PAN';

  let managedIdentity: ManagedMakerIdentity | undefined;
  if (participationRoute === 'managed_maker') {
    try { managedIdentity = parseManagedMakerIdentity(formData); }
    catch (error) { errors.push(error instanceof Error ? error.message : 'Invalid managed identity.'); }
  }
  const input: SellerApplicationInput = {
    ...(managedIdentity ? { managedIdentity } : {}),
    participationRoute,
    hasBusinessTaxRegistration: participationRoute === 'registered_seller',
    applicantType: participationRoute === 'managed_maker' ? 'individual' : applicantType === 'company' ? 'company' : 'individual',
    legalName: textField(formData, 'legalName'),
    tradingName: textField(formData, 'tradingName'),
    registrationAuthority:
      participationRoute === 'registered_seller' && (applicantType === 'company' || usesNewRouteQuestion)
        ? textField(formData, 'registrationAuthority')
        : '',
    registrationNumber:
      participationRoute === 'registered_seller' && (applicantType === 'company' || usesNewRouteQuestion)
        ? textField(formData, 'registrationNumber')
        : '',
    taxMode: resolvedTaxMode,
    taxStatus: participationRoute === 'managed_maker'
      ? null
      : usesNewRouteQuestion
        ? taxStatus === 'vat_registered' ? 'vat_registered' : 'business_pan_only'
        : taxMode === 'VAT' || taxMode === 'BOTH' ? 'vat_registered' : 'business_pan_only',
    taxRegistrationNumber: participationRoute === 'managed_maker' ? '' : textField(formData, 'taxRegistrationNumber'),
    representativeName:
      participationRoute === 'registered_seller' && applicantType === 'company'
        ? textField(formData, 'representativeName')
        : textField(formData, 'legalName'),
    email,
    phone,
    province: textField(formData, 'province'),
    district: textField(formData, 'district'),
    municipality: textField(formData, 'municipality'),
    ward: textField(formData, 'ward') || null,
    locality: textField(formData, 'locality'),
    businessDescription: textField(formData, 'businessDescription'),
    productCategories: textField(formData, 'productCategories'),
    publicCity: textField(formData, 'publicCity') || textField(formData, 'municipality'),
    craftExperience,
    socialLinks,
  };

  const requiredFields: Array<[keyof SellerApplicationInput, string]> = [
    ['legalName', 'Legal business name'],
    ['tradingName', 'Trading name'],

    ['representativeName', 'Representative name'],
    ['email', 'Email'],
    ['phone', 'Phone'],
    ['province', 'Province'],
    ['district', 'District'],
    ['municipality', 'Municipality'],
    ['locality', 'Locality'],
    ['businessDescription', 'Business description'],
    ['productCategories', 'Product categories'],
    ['publicCity', 'Public city or town'],
  ];

  if (participationRoute === 'registered_seller') {
    requiredFields.push(['taxRegistrationNumber', 'PAN or VAT number']);
  }

  if (participationRoute === 'registered_seller' && applicantType === 'company')
    requiredFields.push(
      ['registrationAuthority', 'Registration authority'],
      ['registrationNumber', 'Registration number'],
    );

  for (const [field, label] of requiredFields) {
    if (!input[field]) errors.push(`${label} is required.`);
  }

  const fieldLimits: Array<[keyof SellerApplicationInput, string, number]> = [
    ['legalName', 'Legal business name', 160],
    ['tradingName', 'Trading name', 160],
    ['registrationAuthority', 'Registration authority', 160],
    ['registrationNumber', 'Registration number', 80],
    ['taxRegistrationNumber', 'PAN or VAT number', 24],
    ['representativeName', 'Representative name', 160],
    ['email', 'Email', 254],
    ['phone', 'Phone', 20],
    ['province', 'Province', 80],
    ['district', 'District', 100],
    ['municipality', 'Municipality', 120],
    ['locality', 'Locality', 180],
    ['businessDescription', 'Business description', 1_500],
    ['productCategories', 'Product categories', 500],
  ];

  for (const [field, label, maximum] of fieldLimits) {
    const value = input[field];
    if (typeof value === 'string' && value.length > maximum) {
      errors.push(
        `${label} must be ${maximum.toLocaleString('en-US')} characters or fewer.`,
      );
    }
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    errors.push('Enter a valid email address.');
  }

  if (!/^\+?\d{7,15}$/.test(phone)) {
    errors.push(
      'Enter a valid phone number including the country code when needed.',
    );
  }

  if (participationRoute === 'registered_seller') {
    const validTaxIdentifier = usesNewRouteQuestion
      ? /^\d{9}$/.test(input.taxRegistrationNumber)
      : /^[A-Za-z0-9\-/]{5,24}$/.test(input.taxRegistrationNumber);
    if (!validTaxIdentifier) errors.push('Enter a valid 9-digit business PAN/VAT identifier.');
  }

  if (participationRoute === 'registered_seller' && acceptedTerms !== 'yes') {
    errors.push('You must accept the seller application terms.');
  }
  if (participationRoute === 'managed_maker' && applicationAcknowledgement !== 'yes') {
    errors.push('You must confirm the Managed Maker application acknowledgement.');
  }

  if (participationRoute === 'managed_maker') {
    for (const field of ['taxStatus', 'taxRegistrationNumber', 'registrationAuthority', 'registrationNumber']) {
      if (textField(formData, field)) {
        errors.push('Managed Maker applications must not contain business tax or registration placeholders.');
        break;
      }
    }
  }

  if (textField(formData, 'website')) {
    errors.push('The application could not be accepted.');
  }

  return errors.length > 0 ? { errors } : { input, errors };
}

export function validateSellerDocument(file: File): string | null {
  if (file.size === 0) return 'The selected document is empty.';
  if (file.size > maximumDocumentBytes)
    return 'Each document must be 5 MB or smaller.';
  if (!acceptedDocumentTypes.has(file.type)) {
    return 'Documents must be PDF, JPG, or PNG files.';
  }
  return null;
}

export function createSellerApplicationReference(now = new Date()): string {
  const year = now.getUTCFullYear();
  const random = crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, 8)
    .toUpperCase();
  return `HK-S-${year}-${random}`;
}
