export const sellerAgreementVersion = 'seller-terms-2026-09-draft';

export const sellerDocumentFields = [
  {
    field: 'businessRegistration',
    kind: 'business_registration',
    label: 'Business registration certificate',
    required: true,
  },
  {
    field: 'taxCertificate',
    kind: 'pan_certificate',
    label: 'PAN or VAT certificate',
    required: true,
  },
  {
    field: 'representativeIdentity',
    kind: 'representative_identity',
    label: 'Authorised representative identity',
    required: true,
  },
  {
    field: 'bankVerification',
    kind: 'bank_verification',
    label: 'Bank account verification',
    required: false,
  },
] as const;

export type SellerDocumentKind =
  | (typeof sellerDocumentFields)[number]['kind']
  | 'vat_certificate';

export interface SellerApplicationInput {
  legalName: string;
  tradingName: string;
  registrationAuthority: string;
  registrationNumber: string;
  taxMode: 'PAN' | 'VAT';
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
}

export interface SellerApplicationDocument {
  id: string;
  kind: SellerDocumentKind;
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
export const maximumApplicationBytes = 22 * 1024 * 1024;

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
  const email = textField(formData, 'email').toLowerCase();
  const phone = textField(formData, 'phone').replace(/[\s()-]/g, '');
  const acceptedTerms = textField(formData, 'acceptedTerms');

  const input: SellerApplicationInput = {
    legalName: textField(formData, 'legalName'),
    tradingName: textField(formData, 'tradingName'),
    registrationAuthority: textField(formData, 'registrationAuthority'),
    registrationNumber: textField(formData, 'registrationNumber'),
    taxMode: taxMode === 'VAT' ? 'VAT' : 'PAN',
    taxRegistrationNumber: textField(formData, 'taxRegistrationNumber'),
    representativeName: textField(formData, 'representativeName'),
    email,
    phone,
    province: textField(formData, 'province'),
    district: textField(formData, 'district'),
    municipality: textField(formData, 'municipality'),
    ward: textField(formData, 'ward') || null,
    locality: textField(formData, 'locality'),
    businessDescription: textField(formData, 'businessDescription'),
    productCategories: textField(formData, 'productCategories'),
  };

  const requiredFields: Array<[keyof SellerApplicationInput, string]> = [
    ['legalName', 'Legal business name'],
    ['tradingName', 'Trading name'],
    ['registrationAuthority', 'Registration authority'],
    ['registrationNumber', 'Registration number'],
    ['taxRegistrationNumber', 'PAN or VAT number'],
    ['representativeName', 'Representative name'],
    ['email', 'Email'],
    ['phone', 'Phone'],
    ['province', 'Province'],
    ['district', 'District'],
    ['municipality', 'Municipality'],
    ['locality', 'Locality'],
    ['businessDescription', 'Business description'],
    ['productCategories', 'Product categories'],
  ];

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

  if (!/^[A-Za-z0-9\-/]{5,24}$/.test(input.taxRegistrationNumber)) {
    errors.push('Enter a valid PAN or VAT registration number.');
  }

  if (acceptedTerms !== 'yes') {
    errors.push('You must accept the seller application terms.');
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

export async function validateSellerDocumentContent(
  file: File,
): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf =
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  const matchesDeclaredType =
    (file.type === 'application/pdf' && isPdf) ||
    (file.type === 'image/jpeg' && isJpeg) ||
    (file.type === 'image/png' && isPng);

  return matchesDeclaredType
    ? null
    : 'The file content does not match its PDF, JPG, or PNG type.';
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
