import policyDocuments from './legal-policy-documents.json';
import { phaseOneMarketplacePolicy, calculateSellerCommissionPaisa } from '../marketplace/policy';
import { companyPanDisplay } from './company-details';
import { publicPolicyDocuments } from './public-policy-documents';
import archivedPolicyDocuments from './archived-policy-documents.json';

export const LEGAL_POLICY_REVISION = '2026-10-15';
export const LEGAL_POLICY_DATE_LABEL = '15 October 2026';

export const CUSTOMER_POLICY_VERSION =
  'customer-policy-set-2026-10-15';
// Stable acceptance identifier: these disclosure clarifications do not change agreed commercial obligations.
// The current public document checksum is tracked separately below.
export const SELLER_AGREEMENT_VERSION =
  'seller-agreement:sha256:4817512b1e2ac55b23a262245a825a26355c640aac3ec4c2e64b2146f396f7a1';

export const publicLegalPolicies = {
  terms: {
    href: '/terms',
    title: 'Terms & Conditions',
    description: 'Rules for accounts, orders and using HastaBazaar.',
    sha256: '8a274b41bd8d1b5b452e3132a77e44f065286fb0fa27798a85fc6fe43b540a3e',
  },
  returns: {
    href: '/returns',
    title: 'Return, Exchange, Cancellation & Refund Policy',
    description: 'How cancellations, returns, exchanges and refunds work.',
    sha256: 'c67d42fd1e460e2056e17ae91776440bd6c58754fe553d948e2966bed27149af',
  },
  shipping: {
    href: '/shipping',
    title: 'Shipping & Delivery Policy',
    description: 'Delivery availability, charges, dispatch and delivery issues.',
    sha256: 'e4adbfeeafc88e0960fdead660abdc2896235ee01c1bf9f95d0479d0aa983e72',
  },
  privacy: {
    href: '/privacy',
    title: 'Privacy Policy',
    description: 'How personal information is handled and how to contact us.',
    sha256: '925adb21568d0aa266697df408b7bb60e689693bd00484f7fbaabf5de6621198',
  },
  cookies: {
    href: '/cookies',
    title: 'Cookie Policy',
    description: 'Browser storage, optional tracking and privacy choices.',
    sha256: '5c7ef9dab26029d80f93c60e5efb15b31794f8af9865a76c72294b1e64ebf790',
  },
  'prohibited-products': {
    href: '/prohibited-products',
    title: 'Prohibited & Restricted Products Policy',
    description: 'Products that cannot be sold or require prior approval.',
    sha256: '64a1de9fd03f73757772ff120d6b036af5fbc68a05a680046a3d7628b3c5adc5',
  },
  'seller-agreement': {
    href: '/seller-agreement',
    title: 'Seller Marketplace Agreement',
    description: 'Seller responsibilities and agreed commercial terms.',
    // Checksum of the retained launch-rate document; current terms have their own acceptance context.
    baselineSha256: '302fc96515d3c2f485980d408631bc73fe6d6e3ce7d8f16a446562a05f0d5012',
  },
  'rewards-terms': {
    href: '/rewards-terms',
    title: 'Rewards & Shopping Credit Terms',
    description: 'Daily check-in, missed days, grace and spending your credit.',
    sha256: '0a4877985cc22dbcf5fb3ff4933b46f3441da5c70080359ee0a29131509201e9',
  },
  'promo-code-terms': {
    href: '/promo-code-terms',
    title: 'Promo Code Terms',
    description: 'Offer limits, discounts, cancellations and refunds.',
    sha256: 'c35d0dac08357380ce7a2b783bb28e84f572cafa4f775c3b1c7d91952c85884a',
  },
  'gift-card-terms': {
    href: '/gift-card-terms',
    title: 'Gift Card Terms',
    description: 'Redeeming gift codes and using their shopping credit.',
    sha256: '80e26befcc61c451be0e21e1599144e6432e2936bc6a2958df721d9c7622630f',
  },
} as const;

export type PublicLegalPolicyKey = keyof typeof publicLegalPolicies;
export type LegalPolicyKey = PublicLegalPolicyKey | 'internal-compliance';

export const archivedLegalPolicies = archivedPolicyDocuments;

export function getArchivedLegalPolicy(sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  return archivedLegalPolicies.find((policy) => policy.sha256 === sha256) ?? null;
}

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
).filter(([key]) => key !== 'seller-agreement').map(([key, value]) => ({
  key: key as PublicLegalPolicyKey,
  ...value,
}));

export function getLegalPolicyDocument(key: LegalPolicyKey, commissionBps?: number): string {
  if (key === 'seller-agreement') {
    if (commissionBps === undefined) throw new Error('Seller agreement requires a configured commission rate.');
    const fee=calculateSellerCommissionPaisa(100_000,commissionBps);
    const money=new Intl.NumberFormat('en-NP',{maximumFractionDigits:2});
    return publicPolicyDocuments[key].replaceAll('{{COMMISSION_PERCENT}}',String(commissionBps/100))
      .replaceAll('{{COMMISSION_EXAMPLE_FEE}}',money.format(fee/100))
      .replaceAll('{{COMMISSION_EXAMPLE_NET}}',money.format((100_000-fee)/100));
  }
  return key === 'internal-compliance'
    ? policyDocuments[key].replace('PAN registration is in progress.', `PAN: ${companyPanDisplay}.`)
    : publicPolicyDocuments[key];
}
