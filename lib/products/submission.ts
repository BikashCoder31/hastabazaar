export const productImageFields = [
  'image1',
  'image2',
  'image3',
  'image4',
  'image5',
] as const;

/**
 * New forms submit every image under the repeated `images` field. The legacy
 * numbered names remain accepted so an already-open form can still be saved
 * after a deployment.
 */
export function productImageFiles(formData: FormData): File[] {
  const values = [
    ...productImageFields.map((field) => formData.get(field)),
    ...formData.getAll('images'),
  ];
  return values.filter(
    (value): value is File => value instanceof File && value.size > 0,
  );
}

export const maximumProductImageBytes = 5 * 1024 * 1024;
export const maximumProductSubmissionBytes = 47 * 1024 * 1024;

export interface ProductSubmissionInput {
  categoryId: string;
  occasionIds: readonly string[];
  sku: string;
  nameEn: string;
  nameNe?: string | null;
  descriptionEn: string;
  descriptionNe?: string | null;
  pricePaisa: number;
  compareAtPricePaisa: number | null;
  inventoryQuantity: number;
  producer: string;
  countryOfOrigin?: string;
  originEvidenceStatus?: 'unverified' | 'seller_declared';
  originEvidenceReference?: string | null;
  originDeclarationProvided?: boolean;
  materials: readonly string[];
  originStory: string | null;
  dimensions: string | null;
  size?: string | null;
  colour?: string | null;
  variations?: string | null;
  specifications?: string | null;
  careInstructions: string | null;
  safetyInformation: string | null;
  returnConditions: string | null;
  returnEligible: boolean;
  warranty: string | null;
  madeToOrder: boolean;
  preparationDays: number;
  manufacturedAt: number | null;
  expiresAt: number | null;
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

export function normalizeProductMaterials(values:readonly string[]):readonly string[]{
  const normalized:string[]=[];const seen=new Set<string>();
  for(const raw of values.flatMap(value=>value.split(/[,\n]/))){
    const value=raw.trim().replace(/\s+/g,' ');if(!value)continue;
    if(value.length>80)throw new RangeError('Each material must be 80 characters or fewer.');
    if(value.includes('<')||value.includes('>')||/\p{Cc}/u.test(value))throw new RangeError('Materials contain an invalid character.');
    const key=value.toLocaleLowerCase('en');if(seen.has(key))continue;
    seen.add(key);normalized.push(value);
  }
  if(normalized.length>20)throw new RangeError('Select no more than 20 materials.');
  return Object.freeze(normalized);
}

function parseMoney(value: string): number | null | 'invalid' {
  if (!value) return null;
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return 'invalid';
  const [rupees, paisa = ''] = value.split('.');
  const result = Number(rupees) * 100 + Number(paisa.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : 'invalid';
}

function parseDate(value: string): number | null | 'invalid' {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'invalid';
  const result = Date.parse(`${value}T00:00:00+05:45`);
  return Number.isFinite(result) ? result : 'invalid';
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
  const preparationDays = Number(textField(formData, 'preparationDays'));
  const manufacturedAt = parseDate(textField(formData, 'manufacturedAt'));
  const expiresAt = parseDate(textField(formData, 'expiresAt'));
  const occasionIds = [
    ...new Set(
      formData
        .getAll('occasionIds')
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  let materials:readonly string[]=[];
  try{materials=normalizeProductMaterials(formData.getAll('materials').filter((value):value is string=>typeof value==='string'));}
  catch(error){errors.push(error instanceof Error?error.message:'Materials are invalid.');}
  const input: ProductSubmissionInput = {
    categoryId: textField(formData, 'categoryId'),
    occasionIds,
    sku: textField(formData, 'sku').toUpperCase(),
    nameEn: textField(formData, 'nameEn'),
    nameNe: formData.has('nameNe') ? textField(formData, 'nameNe') || null : undefined,
    descriptionEn: textField(formData, 'descriptionEn'),
    descriptionNe: formData.has('descriptionNe') ? textField(formData, 'descriptionNe') || null : undefined,
    pricePaisa: typeof pricePaisa === 'number' ? pricePaisa : 0,
    compareAtPricePaisa:
      typeof compareAtPricePaisa === 'number' ? compareAtPricePaisa : null,
    inventoryQuantity,
    producer: textField(formData, 'producer'),
    countryOfOrigin: textField(formData, 'countryOfOrigin'),
    originDeclarationProvided: formData.has('countryOfOrigin'),
    originEvidenceStatus: textField(formData, 'countryOfOrigin') ? 'seller_declared' : 'unverified',
    originEvidenceReference: textField(formData, 'originEvidenceReference') || null,
    materials,
    originStory: textField(formData,'originStory') || null,
    dimensions: textField(formData, 'dimensions') || null,
    size: textField(formData, 'size') || null,
    colour: textField(formData, 'colour') || null,
    variations: textField(formData, 'variations') || null,
    specifications: textField(formData, 'specifications') || null,
    careInstructions: textField(formData, 'careInstructions') || null,
    safetyInformation: textField(formData, 'safetyInformation') || null,
    returnConditions: textField(formData, 'returnConditions') || null,
    returnEligible: textField(formData, 'returnEligible') === 'yes',
    warranty: textField(formData, 'warranty') || null,
    madeToOrder: textField(formData, 'madeToOrder') === 'yes',
    preparationDays,
    manufacturedAt: typeof manufacturedAt === 'number' ? manufacturedAt : null,
    expiresAt: typeof expiresAt === 'number' ? expiresAt : null,
    licenceReference: textField(formData, 'licenceReference') || null,
  };

  const warrantyOffered = textField(formData, 'warrantyOffered');
  if (warrantyOffered === 'no') input.warranty = null;
  else if (warrantyOffered === 'yes') {
    const parts: string[] = [];
    for (const [field, unit] of [
      ['warrantyYears', 'year'],
      ['warrantyMonths', 'month'],
      ['warrantyDays', 'day'],
    ] as const) {
      const value = textField(formData, field);
      if (
        value &&
        (!/^\d{1,6}$/.test(value) || !Number.isSafeInteger(Number(value)))
      )
        errors.push('Warranty duration must use non-negative whole numbers.');
      else if (Number(value) > 0)
        parts.push(
          value.replace(/^0+/, '') +
            ' ' +
            unit +
            (Number(value) === 1 ? '' : 's'),
        );
    }
    if (!parts.length)
      errors.push('Enter at least one positive warranty duration.');
    input.warranty = parts.join(', ') || null;
  } else if (warrantyOffered)
    errors.push('Choose Yes or No for warranty or guarantee.');

  const required: Array<[keyof ProductSubmissionInput, string]> = [
    ['categoryId', 'Category'],
    ['nameEn', 'English product name'],
    ['descriptionEn', 'English description'],
  ];
  for (const [field, label] of required) {
    if (!input[field]) errors.push(`${label} is required.`);
  }

  if (input.sku && !/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(input.sku)) {
    errors.push(
      'SKU must be 3–40 letters, numbers, dots, dashes, or underscores.',
    );
  }
  if (pricePaisa === null || pricePaisa === 'invalid' || pricePaisa < 100) {
    errors.push('Enter a valid price of at least NPR 1.00.');
  }
  if (compareAtPricePaisa === 'invalid') {
    errors.push('Enter a valid comparison price.');
  } else if (
    typeof compareAtPricePaisa === 'number' &&
    typeof pricePaisa === 'number' &&
    compareAtPricePaisa < pricePaisa
  ) {
    errors.push('Original price cannot be lower than the selling price.');
  }
  if (
    !Number.isInteger(inventoryQuantity) ||
    inventoryQuantity < 0 ||
    inventoryQuantity > 1_000_000
  ) {
    errors.push('Inventory must be a whole number from 0 to 1,000,000.');
  }
  if (
    !Number.isInteger(preparationDays) ||
    preparationDays < 0 ||
    preparationDays > 180
  ) {
    errors.push('Preparation time must be a whole number from 0 to 180 days.');
  }
  if (manufacturedAt === 'invalid' || expiresAt === 'invalid') {
    errors.push('Enter valid manufacture and expiry dates.');
  } else if (
    typeof manufacturedAt === 'number' &&
    typeof expiresAt === 'number' &&
    expiresAt <= manufacturedAt
  ) {
    errors.push('Expiry date must be after the manufacture date.');
  }
  if (
    input.returnEligible &&
    (!input.returnConditions || input.returnConditions.length < 10)
  ) {
    errors.push(
      'Describe the return conditions for a return-eligible product.',
    );
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
    ['countryOfOrigin', 'Country of origin', 100],
    ['originEvidenceReference', 'Origin evidence reference', 500],
    ['originStory', 'Product story', 2000],
    ['dimensions', 'Dimensions', 500],
    ['size', 'Size', 300],
    ['colour', 'Colour', 300],
    ['variations', 'Variations', 1500],
    ['specifications', 'Specifications', 2000],
    ['careInstructions', 'Care instructions', 1500],
    ['safetyInformation', 'Safety information', 1500],
    ['returnConditions', 'Return conditions', 1500],
    ['warranty', 'Warranty', 500],
    ['licenceReference', 'Licence reference', 160],
  ];
  for (const [field, label, maximum] of limits) {
    const value = input[field];
    if (typeof value === 'string' && value.length > maximum) {
      errors.push(
        `${label} must be ${maximum.toLocaleString('en-US')} characters or fewer.`,
      );
    }
  }

  return errors.length > 0 ? { errors } : { input, errors };
}

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateProductImage(file: File): string | null {
  if (file.size === 0) return 'The selected image is empty.';
  if (file.size > maximumProductImageBytes)
    return 'Each image must be 5 MB or smaller.';
  if (!acceptedImageTypes.has(file.type))
    return 'Images must be JPG, PNG, or WebP.';
  return null;
}

export async function validateProductImageContent(
  file: File,
): Promise<string | null> {
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
  if (!matches) return 'The image content does not match its declared type.';
  // Exercise the same bounded decoder and metadata stripping used for public
  // derivatives before accepting private source bytes. Signature checks alone
  // do not detect truncated or oversized images.
  const { renderProductWatermark, ProductWatermarkError } = await import('./watermark');
  const { defaultProductWatermarkPolicy } = await import('./watermark-policy');
  try {
    await renderProductWatermark(new Uint8Array(await file.arrayBuffer()), file.type,
      { ...defaultProductWatermarkPolicy, enabled: false });
    return null;
  } catch (error) {
    if (error instanceof ProductWatermarkError && error.status === 503) throw error;
    return error instanceof Error ? error.message : 'The product photo could not be safely decoded.';
  }
}

export function createProductSlug(name: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'handmade-product';
  return `${base}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

export function createProductSku(): string {
  return 'HB-' + crypto.randomUUID().replaceAll('-', '').toUpperCase();
}
export function productPhotoCountError(
  added: number,
  existing?: number,
): string | null {
  if (
    !Number.isInteger(added) ||
    added < 0 ||
    (existing !== undefined && (!Number.isInteger(existing) || existing < 0))
  )
    return 'Invalid photo count.';
  return added + (existing ?? 0) < 4
    ? 'Add at least four useful product photos from different angles.'
    : null;
}
