export function nepaliTaxonomyName({ nameEn, nameNe }: { nameEn: string; nameNe: string | null }) {
  const nepali = nameNe?.trim();
  return nepali && nepali !== nameEn.trim() ? nepali : null;
}
