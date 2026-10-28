// Public disclosure only. PAN status must not control marketplace functionality.
export const companyDetails = {
  entityReference: 'hastabazaar-company-406171-83-84',
  legalName: 'Hasta Bazaar Private Limited',
  nepaliName: 'हस्त बजार प्राइभेट लिमिटेड',
  brandName: 'Hastabazaar',
  registrationNumber: '406171/83/84',
  registeringAuthority: 'Office of the Company Registrar, Nepal',
  incorporationDate: '8 October 2026 (2083-06-22 BS)',
  registeredOffice:
    'Birgunj Metropolitan City, Ward 11, Parsa, Madhesh Province, Nepal',
  supportEmail: 'support@hastabazaar.com',
  pan: '624749646',
};

export const companyPanDisplay = companyDetails.pan.trim() || 'Registration in progress';

// Public contact disclosures stay separate from recorded commercial identity snapshots.
export const companyPublicContacts = {
  supportPhone: '+977 9747642247',
  supportPhoneE164: '+9779747642247',
  whatsappUrl: 'https://wa.me/9779747642247',
  grievanceUnit: 'Customer Support and Grievances',
  grievanceEmail: companyDetails.supportEmail,
  grievancePhone: '+977 9747642247',
  grievanceAddress: companyDetails.registeredOffice,
  ecommerceListingNumber: '',
};

export const companyPolicyIdentity = `Hastabazaar is operated by ${companyDetails.legalName} (${companyDetails.nepaliName}), incorporated in Nepal under the Companies Act, 2063 and registered with the ${companyDetails.registeringAuthority} under registration number ${companyDetails.registrationNumber}. Company PAN: ${companyPanDisplay}. Registered office: ${companyDetails.registeredOffice}.

References to “Hastabazaar”, “we”, “us” and “our” in this policy mean ${companyDetails.legalName}, unless the context states otherwise. Current company and PAN details are available on our [Legal & Policies page](/legal#company-details).`;
