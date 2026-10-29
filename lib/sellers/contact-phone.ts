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
export function parseSellerPhone(value: unknown, country: unknown = 'NP') {
  const selected = sellerPhoneCountries.find(item => item.code === country);
  if (!selected) throw new Error('Choose a supported phone country.');
  if (typeof value !== 'string' || !/^[0-9]{10}$/.test(value))
    throw new Error('Enter exactly 10 digits for your contact phone, without the country code.');
  return { country: selected.code, phone: `+${selected.dial}${value}` };
}
