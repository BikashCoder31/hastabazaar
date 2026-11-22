import { EDITABLE_FORM_IDS } from './catalog-policy';
import type { FormDefinition } from './types';
import { formGuide } from './plain-language';
import { coreFormContract } from './core-contracts';

// Placement changes neither the runtime registry nor historical publications.
export function isFormCatalogEditable(form: FormDefinition): boolean {
  return EDITABLE_FORM_IDS.has(form.id);
}

export const FORM_CATALOG_UNAVAILABLE_MESSAGE = 'This form is managed by its existing feature and is unavailable for editing in the Form Management.';

export const FORM_CATALOG_CATEGORIES = [
  'Applications & business profiles', 'Products & inventory', 'Orders & customer care',
  'Supply & delivery', 'Payouts & finance', 'Governance & operations',
] as const;
type CatalogCategory = typeof FORM_CATALOG_CATEGORIES[number];
export interface FormCatalogPresentation { readonly label: string; readonly category: CatalogCategory; readonly description?: string }

const businessForms: Readonly<Record<string, FormCatalogPresentation>> = {
  'seller.application': { label: 'Seller application', category: 'Applications & business profiles' },
  'seller.maker-profile': { label: 'Managed Maker application profile', category: 'Applications & business profiles' },
  'seller.managed-terms-acceptance': { label: 'Company-store terms acceptance', category: 'Applications & business profiles' },
  'seller.profile': { label: 'Seller business profile', category: 'Applications & business profiles' },
  'rider.application': { label: 'Rider application', category: 'Applications & business profiles' },
  'staff.seller-review-action': { label: 'Seller application review', category: 'Applications & business profiles' },
  'staff.managed-maker-activation': { label: 'Managed Maker activation', category: 'Applications & business profiles' },
  'staff.managed-eligibility-release': { label: 'Maker earning release', category: 'Payouts & finance' },
  'staff.managed-payout-preparation': { label: 'Sale-linked maker payment preparation', category: 'Payouts & finance' },
  'staff.managed-payout-action': { label: 'Sale-linked maker payment action', category: 'Payouts & finance' },
  'seller.product-submission': { label: 'Product submission', category: 'Products & inventory' },
  'seller.inventory': { label: 'Inventory update', category: 'Products & inventory' },
  'staff.catalog': { label: 'Product catalog management', category: 'Products & inventory' },
  'staff.product-classification': { label: 'Product classification', category: 'Products & inventory' },
  'staff.product-review': { label: 'Product submission review', category: 'Products & inventory' },
  'commerce.checkout': { label: 'Checkout & delivery information', category: 'Orders & customer care' },
  'commerce.return-request': { label: 'Return request', category: 'Orders & customer care' },
  'commerce.order-cancellation': { label: 'Order cancellation', category: 'Orders & customer care' },
  'commerce.complaint': { label: 'Order complaint', category: 'Orders & customer care' },
  'public.contact': { label: 'Contact enquiry', category: 'Orders & customer care' },
  'public.feedback': { label: 'Customer feedback', category: 'Orders & customer care' },
  'public.footer-feedback': { label: 'Footer feedback', category: 'Orders & customer care' },
  'account.review': { label: 'Customer product review', category: 'Orders & customer care' },
  'account.privacy-request': { label: 'Customer privacy request', category: 'Orders & customer care' },
  'seller.review-reply': { label: 'Seller review reply', category: 'Orders & customer care' },
  'seller.case-return-response': { label: 'Seller return response', category: 'Orders & customer care' },
  'seller.case-complaint-response': { label: 'Seller complaint response', category: 'Orders & customer care' },
  'staff.return-case-action': { label: 'Return case review', category: 'Orders & customer care' },
  'staff.complaint-case-action': { label: 'Complaint case review', category: 'Orders & customer care' },
  'staff.cancellation-review': { label: 'Cancellation review', category: 'Orders & customer care' },
  'staff.order-fulfillment': { label: 'Order fulfillment', category: 'Orders & customer care' },
  'staff.review-moderation': { label: 'Customer review moderation', category: 'Orders & customer care' },
  'staff.privacy-action': { label: 'Privacy request review', category: 'Orders & customer care' },
  'seller.shipping-request': { label: 'Seller shipping request', category: 'Supply & delivery' },
  'seller.shipping-action': { label: 'Seller shipping update', category: 'Supply & delivery' },
  'seller.managed-supply-proposal': { label: 'Managed Maker supply proposal', category: 'Supply & delivery' },
  'seller.managed-transition-request': { label: 'Managed Maker transition request', category: 'Supply & delivery' },
  'rider.report': { label: 'Rider delivery report', category: 'Supply & delivery' },
  'staff.delivery-assignment': { label: 'Delivery assignment', category: 'Supply & delivery' },
  'staff.managed-supply-decision': { label: 'Managed supply review', category: 'Supply & delivery' },
  'staff.managed-transition-decision': { label: 'Managed Maker transition review', category: 'Supply & delivery' },
  'staff.parcel-control': { label: 'Parcel management', category: 'Supply & delivery' },
  'staff.rider-control-1': { label: 'Rider application & report review', category: 'Supply & delivery' },
  'staff.rider-control-2': { label: 'Rider delivery policy', category: 'Supply & delivery' },
  'shipping.console-request': { label: 'Shipping console request', category: 'Supply & delivery' },
  'shipping.console-action-seller': { label: 'Seller shipping console update', category: 'Supply & delivery' },
  'shipping.console-action-staff': { label: 'Staff shipping console update', category: 'Supply & delivery' },
  'seller.payout-request': { label: 'Seller payout request', category: 'Payouts & finance' },
  'rider.remittance': { label: 'Rider cash remittance', category: 'Payouts & finance' },
  'commerce.gift-card-issue': { label: 'Gift card issuance', category: 'Payouts & finance' },
  'staff.invoice-adjustment': { label: 'Invoice adjustment', category: 'Payouts & finance' },
  'staff.managed-adjustment': { label: 'Managed Maker adjustment', category: 'Payouts & finance' },
  'staff.managed-payment-preparation': { label: 'Managed Maker payment preparation', category: 'Payouts & finance' },
  'staff.managed-payment-action': { label: 'Managed Maker payment review', category: 'Payouts & finance' },
  'staff.payout-request-action': { label: 'Seller payout request review', category: 'Payouts & finance' },
  'staff.payout-1': { label: 'Seller payout creation', category: 'Payouts & finance' },
  'staff.payout-2': { label: 'Seller payout processing', category: 'Payouts & finance' },
  'staff.exception-work': { label: 'Exception work report', category: 'Governance & operations' },
  'staff.seller-governance': { label: 'Seller governance review', category: 'Governance & operations' },
  'staff.governance-rule-create': { label: 'Governance rule', category: 'Governance & operations' },
  'staff.governance-promotion-create': { label: 'Governance promotion', category: 'Governance & operations' },
  'staff.governance-incident-create': { label: 'Governance incident report', category: 'Governance & operations' },
  'staff.governance-incident-update': { label: 'Governance incident update', category: 'Governance & operations' },
  'staff.governance-backup-verify': { label: 'Backup verification', category: 'Governance & operations' },
};

export function formCatalogPresentation(form: FormDefinition): FormCatalogPresentation {
  const guide = formGuide(form.id);
  return { label: guide.title, description: guide.purpose, category: businessForms[form.id]?.category ?? 'Governance & operations' };
}

export interface FormCatalogRow {
  form: Pick<FormDefinition, 'id' | 'audience' | 'adapterId'>;
  presentation: FormCatalogPresentation;
  publishedVersion: number;
  draftVersion: number;
  lastChangedAt?: number;
  lastEditor?: string;
  availability?: 'checked' | 'core' | 'unavailable';
  availabilityReason?: string;
}
export type CatalogStatusFilter = 'all' | 'published' | 'draft' | 'unpublished' | 'attention';
export interface FormCatalogFilters { query?: string; audience?: string; category?: string; status?: CatalogStatusFilter }
export function hasUnpublishedDraft(row: FormCatalogRow): boolean { return row.draftVersion > row.publishedVersion; }
export function catalogNeedsAttention(row: FormCatalogRow): boolean {
  return row.availability === 'unavailable' ||
    (row.publishedVersion === 0 && !coreFormContract(row.form.id)) || row.form.adapterId.startsWith('pending:');
}
export function filterFormCatalog(rows: readonly FormCatalogRow[], filters: FormCatalogFilters): FormCatalogRow[] {
  const words = filters.query?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  return rows.filter(row => {
    if (filters.audience && filters.audience !== 'all' && row.form.audience !== filters.audience) return false;
    if (filters.category && filters.category !== 'all' && row.presentation.category !== filters.category) return false;
    if (filters.status === 'published' && !row.publishedVersion) return false;
    if (filters.status === 'draft' && !hasUnpublishedDraft(row)) return false;
    if (filters.status === 'unpublished' && row.publishedVersion > 0) return false;
    if (filters.status === 'attention' && !catalogNeedsAttention(row)) return false;
    const text = `${row.presentation.label} ${row.presentation.description ?? ''} ${row.form.id} ${row.form.audience} ${row.presentation.category}`.toLowerCase();
    return words.every(word => text.includes(word));
  });
}
