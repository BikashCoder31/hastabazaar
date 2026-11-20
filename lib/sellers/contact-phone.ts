/** Seller intake contact only; this never creates SMS verification evidence. */
export const sellerPhoneCountries = [
  { code: 'NP', name: 'Nepal', dial: '977' },
  { code: 'IN', name: 'India', dial: '91' },
  { code: 'BD', name: 'Bangladesh', dial: '880' },
  { code: 'BT', name: 'Bhutan', dial: '975' },
  { code: 'CN', name: 'China', dial: '86' },
  { code: 'PK', name: 'Pakistan', dial: '92' },
  { code: 'LK', name: 'Sri Lanka', dial: '94' },
  { code: 'AU', name: 'Australia', dial: '61' },
  { code: 'CA', name: 'Canada', dial: '1' },
  { code: 'JP', name: 'Japan', dial: '81' },
  { code: 'MY', name: 'Malaysia', dial: '60' },
  { code: 'QA', name: 'Qatar', dial: '974' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966' },
  { code: 'SG', name: 'Singapore', dial: '65' },
  { code: 'KR', name: 'South Korea', dial: '82' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971' },
  { code: 'GB', name: 'United Kingdom', dial: '44' },
  { code: 'US', name: 'United States', dial: '1' },
] as const;
export function sellerPhoneConstraints(country: unknown = 'NP') {
  const selected = sellerPhoneCountries.find(item => item.code === country);
  if (!selected) throw new Error('Choose a supported phone country.');
  // E.164 A.3: at most 15 digits including the country code. This is contact-format validation, not proof of ownership.
  // https://www.itu.int/rec/t-rec-e.164/en
  const minLength = selected.code === 'NP' ? 10 : 6, maxLength = selected.code === 'NP' ? 10 : 15 - selected.dial.length;
  return { selected, minLength, maxLength, pattern: `[0-9]{${minLength},${maxLength}}`,
    guidance: selected.code === 'NP' ? '10 digits, without country code' : `National number without country code; ${minLength}–${maxLength} digits` };
}
export function parseSellerPhone(value: unknown, country: unknown = 'NP') {
  const { selected, minLength, maxLength } = sellerPhoneConstraints(country);
  if (typeof value !== 'string' || !new RegExp(`^[0-9]{${minLength},${maxLength}}$`).test(value))
    throw new Error(selected.code === 'NP' ? 'Enter exactly 10 digits for your contact phone, without the country code.'
      : `Enter ${minLength}–${maxLength} digits for your contact phone, without the country code.`);
  return { country: selected.code, phone: `+${selected.dial}${value}` };
}
