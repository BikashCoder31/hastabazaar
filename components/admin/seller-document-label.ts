const documentLabels: Record<string, string> = {
  pan_certificate: 'PAN document',
  vat_certificate: 'VAT document',
  representative_identity: 'Government ID',
  business_registration: 'Business registration',
  bank_verification: 'Bank cheque or statement',
};

export function sellerDocumentLabel(kind: string) {
  return documentLabels[kind] ?? kind.replaceAll('_', ' ');
}
