import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { FORM_REGISTRY } from '../../lib/forms/registry';
import type { FormDefinition, FormId } from '../../lib/forms/types';

export interface FormSourceSite {
  readonly path: string;
  readonly ordinal: number;
  readonly line: number;
  readonly fingerprint: string;
  readonly formId: string | null;
}

export interface FormPolicyViolation {
  readonly path: string;
  readonly line: number;
  readonly reason: string;
}

// Exact pre-integration source sites. Keep each path, ordinal and opening-tag
// fingerprint frozen; adding a form or changing one requires an explicit review.
// The final column names its inventory definition, never a live adapter.
const FROZEN_BASELINE = `
app/admin/activity/page.tsx|1|ceb3138e6fd676b5|staff.activity-filter
app/admin/homepage/page.tsx|1|dc7995dc0857f1f0|staff.homepage-filter
app/forgot-password/page.tsx|1|db31fc457665d322|identity.password-reset-request
app/forgot-password/reset/page.tsx|1|511324780e83ec7a|identity.password-reset-complete
app/local-testing/page.tsx|1|59df7d0d602968d6|system.local-testing-role
app/login/code/page.tsx|1|3bddcf1e85f52b1d|identity.email-code-verify
app/login/page.tsx|1|dc1f601bb844a98f|identity.login-password
app/login/page.tsx|2|4d287138bfd4e39f|identity.email-code-request
app/register/page.tsx|1|0fc75e9d2b8a4162|identity.register
app/seller/products/page.tsx|1|4c07d412c02de782|seller.product-filter
components/account/address-manager.tsx|1|c8a26321ff65e694|account.address
components/account/privacy-request-form.tsx|1|91810fb4992c14ba|account.privacy-request
components/account/profile-form.tsx|1|744ffc10f03cb07e|account.profile
components/account/review-form.tsx|1|5b0527d5e50664ae|account.review
components/admin/catalog-manager.tsx|1|3fa6fc30694f5b5f|staff.catalog
components/admin/delivery-rate-settings.tsx|1|49be675c9b037a43|staff.delivery-rate
components/admin/exception-work-form.tsx|1|ed7eff3e03b1d431|staff.exception-work
components/admin/governance-console.tsx|1|fb480e2e527c1385|staff.governance-rule-create
components/admin/governance-console.tsx|2|62b2690a835cf13a|staff.governance-promotion-create
components/admin/governance-console.tsx|3|0128a6bbcf7550e6|staff.governance-incident-create
components/admin/governance-console.tsx|4|c425ed8f8da7f7e5|staff.governance-incident-update
components/admin/governance-console.tsx|5|4f16df98c6610ae2|staff.governance-backup-verify
components/admin/invoice-adjustment-form.tsx|1|9494a4c5c709df16|staff.invoice-adjustment
components/admin/managed-maker-activation-form.tsx|1|7f89bf53933346dd|staff.managed-maker-activation
components/admin/managed-program-review.tsx|1|cffaae1ef13b487c|staff.managed-supply-decision
components/admin/managed-program-review.tsx|2|8f26e356cf1c25fd|staff.managed-adjustment
components/admin/managed-program-review.tsx|3|8f26e356cf1c25fd|staff.managed-payment-preparation
components/admin/managed-program-review.tsx|4|8f26e356cf1c25fd|staff.managed-payment-action
components/admin/managed-program-review.tsx|5|cffaae1ef13b487c|staff.managed-transition-decision
components/admin/parcel-controls.tsx|1|58fe1c7e0e5a35ad|staff.parcel-control
components/admin/payout-actions.tsx|1|a5707b892dfe601f|staff.payout-1
components/admin/payout-actions.tsx|2|82e832e1fca0d89e|staff.payout-2
components/admin/payout-request-actions.tsx|1|04a752f70e9606ce|staff.payout-request-action
components/admin/privacy-actions.tsx|1|bb13b5d4ae6ea63e|staff.privacy-action
components/admin/product-classification-form.tsx|1|1c12ea4c4a2bb0eb|staff.product-classification
components/admin/recorded-progress.tsx|1|da9af394b37ba08f|staff.recorded-progress-filter
components/admin/referral-settings.tsx|1|02ee066429d24df6|staff.referral-settings
components/admin/rider-controls.tsx|1|a1a7202641ae1b0b|staff.rider-control-1
components/admin/rider-controls.tsx|2|1772a67fe1fefc5b|staff.rider-control-2
components/admin/staff-invitation-manager.tsx|1|b13bc5b949f5fb4c|staff.staff-invitation
components/admin/staff-permission-manager.tsx|1|d24a176ca941fa83|staff.staff-permission-1
components/admin/staff-permission-manager.tsx|2|2a57f443c52c03e6|staff.staff-permission-2
components/catalog/catalog-filters.tsx|1|6a943ba0adfd5519|catalog.filters
components/commerce/checkout-form.tsx|1|fc2766b939f80aa0|commerce.checkout
components/commerce/customer-aftercare.tsx|1|3eac76d943f9311d|commerce.return-request
components/commerce/customer-aftercare.tsx|2|42b01cd90a97be10|commerce.complaint
components/commerce/gift-card-form.tsx|1|a0ac5378cbfd92f2|commerce.gift-card-redeem
components/commerce/order-tracker.tsx|1|8892e95cdbdeca9a|commerce.order-tracking
components/delivery/delivery-assignment.tsx|1|259168d8e4b76505|staff.delivery-assignment
components/layout/customer-contact-form.tsx|1|32c936e095497133|public.contact
components/layout/footer-feedback-form.tsx|1|9a6675205b95fe6d|public.footer-feedback
components/layout/site-header.tsx|1|23a42316ba75e0a4|catalog.header-search
components/rider/rider-code.tsx|1|4103a67af559008e|rider.code-verify
components/rider/rider-forms.tsx|1|2d6394e7f549aaa1|rider.application
components/rider/rider-forms.tsx|2|3a793f962934245c|rider.report
components/rider/rider-forms.tsx|3|ec9f9627f5050669|rider.remittance
components/seller/inventory-editor.tsx|1|ba44aff6d90342ae|seller.inventory
components/seller/maker-application-profile-form.tsx|1|31421ad7e3da9af1|seller.maker-profile
components/seller/managed-program-workspace.tsx|1|49bbd3c224a93639|seller.managed-supply-proposal
components/seller/managed-program-workspace.tsx|2|3777662a6e5111e5|seller.managed-transition-request
components/seller/payout-request-form.tsx|1|0805e33fd7fa61b1|seller.payout-request
components/seller/product-submission-form.tsx|1|1ef1223280734361|seller.product-submission
components/seller/review-reply-form.tsx|1|838f06f85b74cff5|seller.review-reply
components/seller/seller-application-form.tsx|1|c0fb6ccd047c3606|seller.application
components/seller/seller-profile-form.tsx|1|7e900252feed5001|seller.profile
components/seller/shipping-workspace.tsx|1|d313fc9f655132f1|seller.shipping-request
components/seller/shipping-workspace.tsx|2|c9b9bae93c681636|seller.shipping-action
components/shipping-console.tsx|1|d513426f1ecce2cc|shipping.console-request
components/shipping-console.tsx|2|18de9f62af95be3e|shipping.console-action-seller
`.trim();

const baseline = new Map(FROZEN_BASELINE.split('\n').map((row) => {
  const [path, ordinal, fingerprint, id] = row.split('|');
  return [`${path}|${ordinal}|${fingerprint}`, id] as const;
}));

async function sourceFiles(root: string, directory: string): Promise<string[]> {
  const current = join(root, directory);
  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(root, child));
    else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) files.push(child);
  }
  return files;
}

export async function collectFormSites(root: string): Promise<FormSourceSite[]> {
  const files = [...await sourceFiles(root, 'app'), ...await sourceFiles(root, 'components')].sort();
  const sites: FormSourceSite[] = [];
  for (const file of files) {
    const source = await readFile(join(root, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX);
    let ordinal = 0;
    function visit(node: ts.Node): void {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'form') {
        ordinal += 1;
        const idAttribute = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'data-form-id');
        const formId = idAttribute && ts.isJsxAttribute(idAttribute) && idAttribute.initializer && ts.isStringLiteral(idAttribute.initializer) ? idAttribute.initializer.text : null;
        const tag = node.getText(ast).replace(/\s+/g, ' ');
        sites.push({ path: file.replaceAll('\\', '/'), ordinal, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, fingerprint: createHash('sha256').update(tag).digest('hex').slice(0, 16), formId });
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return sites;
}

export async function scanFormSites(root: string, registry: Readonly<Record<FormId, FormDefinition>> = FORM_REGISTRY): Promise<FormPolicyViolation[]> {
  const violations: FormPolicyViolation[] = [];
  for (const site of await collectFormSites(resolve(root))) {
    const frozenId = baseline.get(`${site.path}|${site.ordinal}|${site.fingerprint}`);
    const id = site.formId ?? frozenId;
    if (!id || !registry[id]) {
      violations.push({ path: site.path, line: site.line, reason: 'Unregistered form site' });
    } else if (frozenId && site.formId && site.formId !== frozenId) {
      violations.push({ path: site.path, line: site.line, reason: `Form ID ${site.formId} does not match frozen site ${frozenId}` });
    } else if (!frozenId && registry[id].adapterId.startsWith('pending:')) {
      violations.push({ path: site.path, line: site.line, reason: `Unregistered future form ${id} cannot use a pending adapter` });
    }
  }
  for (const [id, definition] of Object.entries(registry)) {
    if (!definition.adapterId?.trim() || !definition.capabilities?.explanation?.trim()) violations.push({ path: 'lib/forms/registry.ts', line: 0, reason: `${id} requires an adapter and capability explanation` });
  }
  return violations;
}
