import type { FormAudience, FormDefinition } from '../forms/types';

function fixed(id: string, audience: FormAudience, route: string, keys: string[], explanation: string): FormDefinition {
  return Object.freeze({ id, adapterId: id, audience, route, mode: 'operation',
    baseFields: Object.freeze(keys.map(key => Object.freeze({ key, label: key, type: 'existing', capability: 'protected' as const,
      explanation: 'The native seller endpoint enforces ownership, validation and revision checks.' }))),
    capabilities: Object.freeze({ customFieldTypes: Object.freeze([]), answerBehavior: 'none',
      explanation: `${explanation} The native record and audit retain this action; no generic answers or configurable questions are collected.` }),
  });
}

export const SELLER_DASHBOARD_FORM_CONTRACTS: Readonly<Record<string, FormDefinition>> = Object.freeze({
  'seller.bank-details': fixed('seller.bank-details', 'seller', '/api/seller/bank-details',
    ['revision', 'payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber', 'bankVerification'],
    'Private payout details and evidence require independent review before payouts.'),
  'staff.seller-bank-review': fixed('staff.seller-bank-review', 'super_admin', '/api/admin/seller-applications/:id/bank-details',
    ['sellerId', 'revision', 'reference', 'reason'], 'Only Super Admin can record independent bank verification against the current evidence.'),
  'seller.products-description': fixed('seller.products-description', 'seller', '/api/seller/products-description',
    ['businessDescription', 'productCategories', 'expectedVersion', 'requestId'], 'An applicant may update the product description without public product approval.'),
});
