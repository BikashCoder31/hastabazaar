import policyDocuments from './legal-policy-documents.json';
import { phaseOneMarketplacePolicy } from '../marketplace/policy';
import { companyPanDisplay } from './company-details';
import { publicPolicyDocuments } from './public-policy-documents';

export const CUSTOMER_POLICY_VERSION =
  'customer-policy-set-2026-10-13';
// Stable acceptance identifier: this company identity update does not require seller reacceptance.
// The current public document checksum is tracked separately below.
export const SELLER_AGREEMENT_VERSION =
  'seller-agreement:sha256:4817512b1e2ac55b23a262245a825a26355c640aac3ec4c2e64b2146f396f7a1';

export const publicLegalPolicies = {
  terms: {
    href: '/terms',
    title: 'Terms & Conditions',
    description: 'Rules for accounts, orders and using HastaBazaar.',
    sha256: 'f048227ae4315b39b04566654996d5a296b9b91b6cf4b4d96c98ae989eaa0ed9',
  },
  returns: {
    href: '/returns',
    title: 'Return, Exchange, Cancellation & Refund Policy',
    description: 'How cancellations, returns, exchanges and refunds work.',
    sha256: 'fe1ce8ecb209f94861103a6c0f63418068116861ca47ed136dff6b1f20aae19b',
  },
  shipping: {
    href: '/shipping',
    title: 'Shipping & Delivery Policy',
    description: 'Delivery availability, charges, dispatch and delivery issues.',
    sha256: '7523ecd552d52161fd13fbb86579616e9f72ff564e955abbdedf31d811030ee2',
  },
  privacy: {
    href: '/privacy',
    title: 'Privacy Policy',
    description: 'How personal information is handled and how to contact us.',
    sha256: 'c73ff698ca068c67ebb4856460ba5020102446929bcadcebec28e34b4068be4e',
  },
  cookies: {
    href: '/cookies',
    title: 'Cookie Policy',
    description: 'Browser storage, optional tracking and privacy choices.',
    sha256: '270a7ff94bf7bdae82901474a06b18eace0f2feaf05947b225ccdc4310e8dd7b',
  },
  'prohibited-products': {
    href: '/prohibited-products',
    title: 'Prohibited & Restricted Products Policy',
    description: 'Products that cannot be sold or require prior approval.',
    sha256: 'afa80125cd2c1daadc16b242a542f8b3c4c5604545f0ab9a8edbb1a61bd3582a',
  },
  'seller-agreement': {
    href: '/seller-agreement',
    title: 'Seller Marketplace Agreement',
    description: 'Seller responsibilities, 9% commission and settlement terms.',
    sha256: '3bbe5e4b2775ea265ddeffdcd7360a7e7977737b5ac826b3c8c01be55d2ff96d',
  },
} as const;

export type PublicLegalPolicyKey = keyof typeof publicLegalPolicies;
export type LegalPolicyKey = PublicLegalPolicyKey | 'internal-compliance';

const returnWindows = phaseOneMarketplacePolicy.value.returns;

export const publicLegalPolicySummaries: Partial<Record<PublicLegalPolicyKey, {
  title: string;
  answer: string;
  detailsHref: string;
}>> = {
  returns: {
    title: 'Returns at a glance',
    answer: `For eligible unused, unaltered items with accessories and labels, request a return within ${returnWindows.generalRequestWindowDays} calendar days after delivery. For goods supplied sealed, the window is ${returnWindows.sealedGoodsWindowDays} calendar days when the original seal remains intact. Product exclusions and full conditions apply; protections for damaged, defective or misdescribed items remain.`,
    detailsHref: '#standard-returns',
  },
  shipping: {
    title: 'Delivery at a glance',
    answer: 'District estimates do not confirm delivery availability. Delivery is available only to an address accepted for your order. Each store’s delivery charge is included in the checkout total before you order; products from different stores may arrive separately.',
    detailsHref: '#delivery-availability-and-charges',
  },
};

export const publicLegalPolicyNavigation = Object.entries(
  publicLegalPolicies,
).map(([key, value]) => ({
  key: key as PublicLegalPolicyKey,
  ...value,
}));

export function getLegalPolicyDocument(key: LegalPolicyKey): string {
  return key === 'internal-compliance'
    ? policyDocuments[key].replace('PAN registration is in progress.', `PAN: ${companyPanDisplay}.`)
    : publicPolicyDocuments[key];
}
