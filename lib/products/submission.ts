export const productImageFields = [
  'image1',
  'image2',
  'image3',
  'image4',
  'image5',
] as const;

export const maximumProductImageBytes = 5 * 1024 * 1024;
export const maximumProductSubmissionBytes = 27 * 1024 * 1024;

export interface ProductSubmissionInput {
  categoryId: string;
  occasionIds: readonly string[];
  sku: string;
  nameEn: string;
  nameNe: string | null;
  descriptionEn: string;
  descriptionNe: string | null;
  pricePaisa: number;
  compareAtPricePaisa: number | null;
  inventoryQuantity: number;
  producer: string;
  materials: string;
  dimensions: string | null;
  careInstructions: string | null;
  safetyInformation: string | null;
  returnEligible: boolean;
  warranty: string | null;
  licenceReference: string | null;
}

export interface ProductImageUpload {
  id: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  altEn: string;
  altNe: string | null;
  sortOrder: number;
}

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function parseMoney(value: string): number | null | 'invalid' {
  if (!value) return null;
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return 'invalid';
  const [rupees, paisa = ''] = value.split('.');
  const result = Number(rupees) * 100 + Number(paisa.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : 'invalid';
}

export function parseProductSubmission(formData: FormData): {
  input?: ProductSubmissionInput;
  errors: readonly string[];
} {
  const errors: string[] = [];
  const pricePaisa = parseMoney(textField(formData, 'price'));
  const compareAtPricePaisa = parseMoney(textField(formData, 'compareAtPrice'));
  const inventoryText = textField(formData, 'inventoryQuantity');
  const inventoryQuantity = Number(inventoryText);
  const occasionIds = [
    ...new Set(
      formData
        .getAll('occasionIds')
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  const input: ProductSubmissionInput = {
    categoryId: textField(formData, 'categoryId'),
    occasionIds,
    sku: textField(formData, 'sku').toUpperCase(),
    nameEn: textField(formData, 'nameEn'),
    nameNe: textField(formData, 'nameNe') || null,
    descriptionEn: textField(formData, 'descriptionEn'),
    descriptionNe: textField(formData, 'descriptionNe') || null,
    pricePaisa: typeof pricePaisa === 'number' ? pricePaisa : 0,
    compareAtPricePaisa:
      typeof compareAtPricePaisa === 'number' ? compareAtPricePaisa : null,
    inventoryQuantity,
    producer: textField(formData, 'producer'),
    materials: textField(formData, 'materials'),
    dimensions: textField(formData, 'dimensions') || null,
    careInstructions: textField(formData, 'careInstructions') || null,
    safetyInformation: textField(formData, 'safetyInformation') || null,
    returnEligible: textField(formData, 'returnEligible') === 'yes',
    warranty: textField(formData, 'warranty') || null,
    licenceReference: textField(formData, 'licenceReference') || null,
  };

  const required: Array<[keyof ProductSubmissionInput, string]> = [
    ['categoryId', 'Category'],
    ['sku', 'SKU'],
    ['nameEn', 'English product name'],
    ['descriptionEn', 'English description'],
    ['producer', 'Producer'],
    ['materials', 'Materials'],
  ];
  for (const [field, label] of required) {
    if (!input[field]) errors.push(`${label} is required.`);
  }

  if (!/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(input.sku)) {
    errors.push('SKU must be 3–40 letters, numbers, dots, dashes, or underscores.');
  }
  if (pricePaisa === null || pricePaisa === 'invalid' || pricePaisa < 100) {
    errors.push('Enter a valid price of at least NPR 1.00.');
  }
  if (compareAtPricePaisa === 'invalid') {
    errors.push('Enter a valid comparison price.');
  } else if (
    typeof compareAtPricePaisa === 'number' &&
    typeof pricePaisa === 'number' &&
    compareAtPricePaisa <= pricePaisa
  ) {
    errors.push('Comparison price must be higher than the selling price.');
  }
  if (
    !Number.isInteger(inventoryQuantity) ||
    inventoryQuantity < 0 ||
    inventoryQuantity > 1_000_000
  ) {
    errors.push('Inventory must be a whole number from 0 to 1,000,000.');
  }
  if (occasionIds.length === 0) {
    errors.push('Select at least one gift occasion.');
  } else if (occasionIds.length > 5) {
    errors.push('Select no more than 5 gift occasions.');
  } else if (occasionIds.some((value) => value.length > 80)) {
    errors.push('A gift occasion selection is invalid.');
  }

  const limits: Array<[keyof ProductSubmissionInput, string, number]> = [
    ['categoryId', 'Category', 80],
    ['sku', 'SKU', 40],
    ['nameEn', 'English product name', 160],
    ['nameNe', 'Nepali product name', 160],
    ['descriptionEn', 'English description', 4000],
    ['descriptionNe', 'Nepali description', 4000],
    ['producer', 'Producer', 180],
    ['materials', 'Materials', 1000],
    ['dimensions', 'Dimensions', 500],
    ['careInstructions', 'Care instructions', 1500],
    ['safetyInformation', 'Safety information', 1500],
    ['warranty', 'Warranty', 500],
    ['licenceReference', 'Licence reference', 160],
  ];
  for (const [field, label, maximum] of limits) {
    const value = input[field];
    if (typeof value === 'string' && value.length > maximum) {
      errors.push(`${label} must be ${maximum.toLocaleString('en-US')} characters or fewer.`);
    }
  }

  return errors.length > 0 ? { errors } : { input, errors };
}

const acceptedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function validateProductImage(file: File): string | null {
  if (file.size === 0) return 'The selected image is empty.';
  if (file.size > maximumProductImageBytes) return 'Each image must be 5 MB or smaller.';
  if (!acceptedImageTypes.has(file.type)) return 'Images must be JPG, PNG, or WebP.';
  return null;
}

export async function validateProductImageContent(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
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
  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  const matches =
    (file.type === 'image/jpeg' && isJpeg) ||
    (file.type === 'image/png' && isPng) ||
    (file.type === 'image/webp' && isWebp);
  return matches ? null : 'The image content does not match its declared type.';
}

export function createProductSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'handmade-product';
  return `${base}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
}
