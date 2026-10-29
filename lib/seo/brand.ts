import { companyDetails, companyPublicContacts } from '@/lib/content/company-details';
import { PUBLIC_ORIGIN } from './discovery';

export const brandStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': PUBLIC_ORIGIN + '/#website',
      name: companyDetails.brandName,
      url: PUBLIC_ORIGIN + '/',
      publisher: { '@id': PUBLIC_ORIGIN + '/#organization' },
    },
    {
      '@type': 'OnlineStore',
      '@id': PUBLIC_ORIGIN + '/#organization',
      name: companyDetails.brandName,
      legalName: companyDetails.legalName,
      url: PUBLIC_ORIGIN + '/',
      logo: {
        '@type': 'ImageObject',
        url: PUBLIC_ORIGIN + '/brand/hastabazaar-mark-512.png',
        width: 512,
        height: 512,
      },
      description: 'A marketplace for handmade gifts, crafts, jewellery, textiles and homeware from independent makers in Nepal.',
      email: companyDetails.supportEmail,
      telephone: companyPublicContacts.supportPhoneE164,
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Ward 11',
        addressLocality: 'Birgunj, Parsa',
        addressRegion: 'Madhesh Province',
        addressCountry: 'NP',
      },
    },
  ],
};
