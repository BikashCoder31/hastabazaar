import policyDocuments from './legal-policy-documents.json';
import { publicPolicyDocuments } from './public-policy-documents';

export const CUSTOMER_POLICY_VERSION =
  'customer-policy-set-2026-09-18';
export const SELLER_AGREEMENT_VERSION =
  'seller-agreement:sha256:4817512b1e2ac55b23a262245a825a26355c640aac3ec4c2e64b2146f396f7a1';

export const publicLegalPolicies = {
  terms: {
    href: '/terms',
    title: 'Terms & Conditions',
    description: 'Rules for accounts, orders and using HastaBazaar.',
    sha256: 'dab5f74dc949e3e567c9cf6e670eae491b7fd16387acac59bdef87a4734c475a',
  },
  returns: {
    href: '/returns',
    title: 'Return, Exchange, Cancellation & Refund Policy',
    description: 'How cancellations, returns, exchanges and refunds work.',
    sha256: '9afdd3f1f6de09b9c3c81d03640d9c314b27f2e4131a77db67d3f690114c360f',
  },
  shipping: {
    href: '/shipping',
    title: 'Shipping & Delivery Policy',
    description: 'Delivery availability, charges, dispatch and delivery issues.',
    sha256: '9212a7a0e1959724ee3e4c0d630b9756b89293cc0c54d2f0605fc033937435ce',
  },
  privacy: {
    href: '/privacy',
    title: 'Privacy Policy',
    description: 'How personal information is handled and how to contact us.',
    sha256: '6843a1271878b41ee14ce2c3c85152330763d4ec16e3e45a4fda2c053cbcbb8d',
  },
  cookies: {
    href: '/cookies',
    title: 'Cookie Policy',
    description: 'Browser storage, optional tracking and privacy choices.',
    sha256: '55dc1dfb9b5c07c2c7d542fbea037c92c8d115b36c56fffaa50e4ee0958d20af',
  },
  'prohibited-products': {
    href: '/prohibited-products',
    title: 'Prohibited & Restricted Products Policy',
    description: 'Products that cannot be sold or require prior approval.',
    sha256: 'fa3f3b8ecaf2989f8d4298e1ce8b45c94971e5d46a190b1b191cf3a06dbcca49',
  },
  'seller-agreement': {
    href: '/seller-agreement',
    title: 'Seller Marketplace Agreement',
    description: 'Seller responsibilities, 9% commission and settlement terms.',
    sha256: '4817512b1e2ac55b23a262245a825a26355c640aac3ec4c2e64b2146f396f7a1',
  },
} as const;

export type PublicLegalPolicyKey = keyof typeof publicLegalPolicies;
export type LegalPolicyKey = PublicLegalPolicyKey | 'internal-compliance';

export const publicLegalPolicyNavigation = Object.entries(
  publicLegalPolicies,
).map(([key, value]) => ({
  key: key as PublicLegalPolicyKey,
  ...value,
}));

export function getLegalPolicyDocument(key: LegalPolicyKey): string {
  return key === 'internal-compliance'
    ? policyDocuments[key]
    : publicPolicyDocuments[key];
}
