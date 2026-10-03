import { recordedImports } from './import-provenance';

export type OriginEvidenceStatus = 'unverified' | 'seller_declared' | 'verified';
interface ProductDetails {
  nameEn: string;
  descriptionEn: string;
  producer: string;
  countryOfOrigin?: string;
  originEvidenceStatus?: string;
  originEvidenceReference?: string | null;
  materials: string;
  originStory: string | null;
  dimensions: string | null;
  size: string | null;
  colour: string | null;
  variations: string | null;
  specifications: string | null;
  careInstructions: string | null;
  safetyInformation: string | null;
  returnConditions: string | null;
  warranty: string | null;
}
const importsByAsin = new Map(recordedImports.map(record => [record.asin as string, record]));
const normalizedName = (value: string) => value.trim().toLowerCase().replace(/[–—-]/g, '-').replace(/\s+/g, ' ');
const importsByName = new Map(recordedImports.flatMap(record => [record.name, ...record.aliases].map(name => [normalizedName(name), record] as const)));
const unknownSourceValue = /^(?:not stated(?: on the source page)?\.?|requires seller input\.?|unknown|not provided)$/i;

function countryName(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Z]{2}$/i.test(trimmed)) {
    try { return new Intl.DisplayNames(['en'], {type:'region'}).of(trimmed.toUpperCase()) ?? trimmed; }
    catch { return trimmed; }
  }
  return trimmed;
}
export function productOriginDisclosure(country: string | null | undefined, evidence: string | null | undefined): string {
  if (!country?.trim() || unknownSourceValue.test(country.trim()) || !['seller_declared','verified'].includes(evidence ?? '')) return 'Not yet confirmed';
  return countryName(country) + (evidence === 'verified' ? '' : ' (seller declared)');
}

// Remove preparation notes only from identified imports. The stored source stays unchanged.
function importPublicText(value: string | null): string | null {
  if (!value?.trim() || unknownSourceValue.test(value.trim())) return null;
  const cleaned = value
    .replace(/(?:^|(?<=[.!?])\s+)[^.!?\n]*(?:not stated on the source page|requires seller input)[^.!?\n]*[.!?]?/gi, '')
    .split('\n')
    .filter(line => !/^\s*(?:source(?:\s+(?:url|page|notes?))?|amazon(?:\s+(?:url|price|link))?|country\s*of\s*origin)\s*:/i.test(line))
    .map(line => line.replace(/\bASIN\s*:?\s*[A-Z0-9]{10}\b/gi,'').replace(/^\s*(?:model(?:\s*(?:or|\/)\s*identifier)?|identifier)\s*:\s*$/i,'').replace(/;\s*$/,'').trim())
    .filter(Boolean).join('\n')
    .replace(/\b(?:handmade|handcrafted|hand-crafted|artisan-made)\s+/gi, '')
    .trim();
  return cleaned || null;
}

export function publicProductName(name: string): string {
  return importsByName.has(normalizedName(name)) ? name.replace(/\b(?:handmade|handcrafted|hand-crafted|artisan-made)\s+/gi, '').trim() : name;
}

export function publicProductDetails<T extends ProductDetails>(product: T): Omit<T, 'originEvidenceReference'> & { originDisclosure: string } {
  const {originEvidenceReference: _privateOriginEvidence, ...publicFields} = product;
  const asin = [product.specifications, product.descriptionEn].join('\n').match(/\bASIN\s*:?\s*([A-Z0-9]{10})\b/i)?.[1]?.toUpperCase();
  const sourceImport = asin ? importsByAsin.get(asin) : undefined;
  const imported = sourceImport ?? importsByName.get(normalizedName(product.nameEn));
  const status = product.originEvidenceStatus ?? 'unverified';
  // A title match supports copy cleanup, but origin evidence needs explicit saved import identity.
  // Source declarations may correct an old implicit NP value without upgrading verification.
  const sourceCountry = status === 'unverified' ? sourceImport?.country ?? '' : '';
  const country = sourceCountry || product.countryOfOrigin || '';
  const publicCountry = status === 'unverified' && !sourceCountry ? '' : country;
  const originDisclosure = sourceCountry
    ? countryName(sourceCountry) + ' (source listing; unverified)'
    : productOriginDisclosure(country,status);
  if (!imported) return {...publicFields, countryOfOrigin: publicCountry, originDisclosure};
  return {
    ...publicFields,
    nameEn: importPublicText(product.nameEn) ?? product.nameEn,
    countryOfOrigin: publicCountry,
    originEvidenceStatus: status,
    descriptionEn: importPublicText(product.descriptionEn) ?? '',
    producer: importPublicText(product.producer) ?? '',
    materials: importPublicText(product.materials) ?? '',
    originStory: importPublicText(product.originStory),
    dimensions: importPublicText(product.dimensions),
    size: importPublicText(product.size),
    colour: importPublicText(product.colour),
    variations: importPublicText(product.variations),
    specifications: importPublicText(product.specifications),
    careInstructions: importPublicText(product.careInstructions),
    safetyInformation: importPublicText(product.safetyInformation),
    warranty: importPublicText(product.warranty),
    originDisclosure,
  };
}
