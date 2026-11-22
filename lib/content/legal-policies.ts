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
    description: 'Rules for accounts, orders and using Hastabazaar.',
    sha256: '3fcf6f26614425824484a13fb096b5b53267096da19ca52e9af0d06cd8a3672c',
  },
  returns: {
    href: '/returns',
    title: 'Return, Exchange, Cancellation & Refund Policy',
    description: 'How cancellations, returns, exchanges and refunds work.',
    sha256: '4f84d013afd687d8d414338c70541e423b49660aae8475b6e91a450f09f025ef',
  },
  shipping: {
    href: '/shipping',
    title: 'Shipping & Delivery Policy',
    description: 'Delivery availability, charges, dispatch and delivery issues.',
    sha256: '631adf0f69f97ffeb374a600955d136b4e81169de0a9847b05093b5830dcb9ea',
  },
  privacy: {
    href: '/privacy',
    title: 'Privacy Policy',
    description: 'How personal information is handled and how to contact us.',
    sha256: '3a10e58365196fe1c46c4c1d163b8659e3c39226020f056445372137f13b2037',
  },
  cookies: {
    href: '/cookies',
    title: 'Cookie Policy',
    description: 'Browser storage, optional tracking and privacy choices.',
    sha256: '63fe439ac605fa036ecf6ecc07b8b64001c198a353e93108efa407747cbcefbc',
  },
  'prohibited-products': {
    href: '/prohibited-products',
    title: 'Prohibited & Restricted Products Policy',
    description: 'Products that cannot be sold or require prior approval.',
    sha256: '7728a5a5ad84644a527ab2ece34058b230148988a2673aacd74d372e4bda8cd4',
  },
  'seller-agreement': {
    href: '/seller-agreement',
    title: 'Seller Marketplace Agreement',
    description: 'Seller responsibilities and agreed commercial terms.',
    // Checksum of the retained launch-rate document; current terms have their own acceptance context.
    baselineSha256: 'bdab704a6983cf545acf64dc74b8ccb33a2400abd6f60fece090a35a723b5924',
  },
  'rewards-terms': {
    href: '/rewards-terms',
    title: 'Rewards & Shopping Credit Terms',
    description: 'Daily check-in, missed days, grace and spending your credit.',
    sha256: '11abd73f2761b115ca47dd41168ca096ba1438f21d7454d3163f811d51404864',
  },
  'promo-code-terms': {
    href: '/promo-code-terms',
    title: 'Promo Code Terms',
    description: 'Offer limits, discounts, cancellations and refunds.',
    sha256: '27a599e4e5903b74b82ccef9a2a6625193e8ab3426dea15ff2ffee4602155345',
  },
  'gift-card-terms': {
    href: '/gift-card-terms',
    title: 'Gift Card Terms',
    description: 'Redeeming gift codes and using their shopping credit.',
    sha256: '13ad2cb0f40438e963d603c51d17157680f259571409d16e6e4d5aa14ed73b84',
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
