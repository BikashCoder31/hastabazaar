import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../../lib/forms/registry';
import type { FormDefinition, FormId } from '../../lib/forms/types';

export interface FormSourceSite {
  readonly path: string;
  readonly ordinal: number;
  readonly line: number;
  readonly fingerprint: string;
  readonly formId: string | null;
  readonly formIds?: readonly string[];
}

export interface FormPolicyViolation {
  readonly path: string;
  readonly line: number;
  readonly reason: string;
}

// Exact pre-integration source sites. Keep each path, ordinal and full-form
// fingerprint frozen; adding a form or changing one requires an explicit review.
// The final column names its inventory definition, never a live adapter.
const FROZEN_BASELINE = `
app/admin/activity/page.tsx|1|7ba21c3206cc05a2|staff.activity-filter
app/admin/homepage/page.tsx|1|237a866190d23266|staff.homepage-filter
app/forgot-password/page.tsx|1|1279d881fb7f9046|identity.password-reset-request
app/forgot-password/reset/page.tsx|1|1c1f701fd783b171|identity.password-reset-complete
app/local-testing/page.tsx|1|6e9f8f1e61fdc654|system.local-testing-role
app/login/code/page.tsx|1|9a523f2cdcddc920|identity.email-code-verify
app/login/page.tsx|1|ada051e2836470ee|identity.login-password
app/login/page.tsx|2|a042e05b7276bc3b|identity.email-code-request
app/register/page.tsx|1|a9a9a3b7531bfabd|identity.register
app/seller/products/page.tsx|1|d5d574dcd78d58bb|seller.product-filter
components/admin/catalog-manager.tsx|1|cc10cf6494149a43|staff.catalog
components/admin/delivery-rate-settings.tsx|1|9698f58ea30c192c|staff.delivery-rate
components/admin/exception-work-form.tsx|1|0d6b2a34694bde01|staff.exception-work
components/admin/governance-console.tsx|1|7bcd9cc8b2f09389|staff.governance-rule-create
components/admin/governance-console.tsx|2|364c0d385d0eab30|staff.governance-promotion-create
components/admin/governance-console.tsx|3|8562e1bac855d1ef|staff.governance-incident-create
components/admin/governance-console.tsx|4|52e3f9ce8c417491|staff.governance-incident-update
components/admin/governance-console.tsx|5|97a6df07f680d772|staff.governance-backup-verify
components/admin/invoice-adjustment-form.tsx|1|aaa675d3f2b0fcde|staff.invoice-adjustment
components/admin/managed-maker-activation-form.tsx|1|0b4da76526f65672|staff.managed-maker-activation
components/admin/managed-program-review.tsx|1|c79c8a95622c2934|staff.managed-supply-decision
components/admin/managed-program-review.tsx|2|f15650744e5a6642|staff.managed-adjustment
components/admin/managed-program-review.tsx|3|acfeffa8d68fa09d|staff.managed-payment-preparation
components/admin/managed-program-review.tsx|4|72d92c891a935e5a|staff.managed-payment-action
components/admin/managed-program-review.tsx|5|11ce3f53a5768675|staff.managed-transition-decision
components/admin/parcel-controls.tsx|1|1c5edc646ee22383|staff.parcel-control
components/admin/payout-actions.tsx|1|0c9e2e6be85357bc|staff.payout-1
components/admin/payout-actions.tsx|2|1be0cb5fdc9b31f2|staff.payout-2
components/admin/payout-request-actions.tsx|1|226d5f0f2dd3992c|staff.payout-request-action
components/admin/privacy-actions.tsx|1|25fa9a12e6c58ff0|staff.privacy-action
components/admin/product-classification-form.tsx|1|3c7c0850487ba6f6|staff.product-classification
components/admin/recorded-progress.tsx|1|f01e48a55389ad28|staff.recorded-progress-filter
components/admin/referral-settings.tsx|1|3c56a5afbbec9e12|staff.referral-settings
components/admin/rider-controls.tsx|1|075077b2bd5ac9c9|staff.rider-control-1
components/admin/rider-controls.tsx|2|2fe219cccbef7424|staff.rider-control-2
components/admin/staff-invitation-manager.tsx|1|837eabc8ee11d381|staff.staff-invitation
components/admin/staff-permission-manager.tsx|1|fac9c7b9874e69d9|staff.staff-permission-1
components/admin/staff-permission-manager.tsx|2|db915f5fc80feeb9|staff.staff-permission-2
components/catalog/catalog-filters.tsx|1|f69d92f8b2083c49|catalog.filters
components/commerce/checkout-form.tsx|1|79a07828ec082b54|commerce.checkout
components/commerce/customer-aftercare.tsx|1|417435099796a888|commerce.return-request
components/commerce/customer-aftercare.tsx|2|d783a2bcada9085b|commerce.complaint
components/commerce/gift-card-form.tsx|1|5342c96832a973ab|commerce.gift-card-redeem
components/commerce/order-tracker.tsx|1|3afed58539121cfc|commerce.order-tracking
components/delivery/delivery-assignment.tsx|1|95c4f5b2a77f5a06|staff.delivery-assignment
components/layout/site-header.tsx|1|ed4b8ecbf0b141e5|catalog.header-search
components/rider/rider-code.tsx|1|038f0239202bc644|rider.code-verify
components/rider/rider-forms.tsx|1|114a8494120aa500|rider.application
components/rider/rider-forms.tsx|2|9f842c13daeabb3f|rider.report
components/rider/rider-forms.tsx|3|e0e19bcb5d976898|rider.remittance
components/seller/inventory-editor.tsx|1|8b247e4b170098a3|seller.inventory
components/seller/maker-application-profile-form.tsx|1|4d8d692da4bae111|seller.maker-profile
components/seller/managed-program-workspace.tsx|1|1788e9a6e7146fe8|seller.managed-supply-proposal
components/seller/managed-program-workspace.tsx|2|7cdb2508742528c7|seller.managed-transition-request
components/seller/payout-request-form.tsx|1|4c786e7a16233cde|seller.payout-request
components/seller/product-submission-form.tsx|1|18ab3a2fd406982f|seller.product-submission
components/seller/review-reply-form.tsx|1|19c1f3ee22a30a2b|seller.review-reply
components/seller/seller-application-form.tsx|1|aa9ba3abeacd03db|seller.application
components/seller/seller-profile-form.tsx|1|b0db3d37c07631f6|seller.profile
components/seller/shipping-workspace.tsx|1|fb2a56c35f735a44|seller.shipping-request
components/seller/shipping-workspace.tsx|2|8a14968ab575bf7d|seller.shipping-action
components/shipping-console.tsx|1|10441fd1c3053740|shipping.console-request
components/shipping-console.tsx|2|84261bfac06aec3d|shipping.console-action-seller
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
        const initializer = idAttribute && ts.isJsxAttribute(idAttribute) ? idAttribute.initializer : undefined;
        const expression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : undefined;
        const formIds = initializer && ts.isStringLiteral(initializer) ? [initializer.text]
          : expression && ts.isConditionalExpression(expression) &&
            ts.isStringLiteral(expression.whenTrue) && ts.isStringLiteral(expression.whenFalse)
            ? [expression.whenTrue.text, expression.whenFalse.text] : null;
        const formId = formIds?.length === 1 ? formIds[0] : null;
        const formSource = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)
          ? node.parent.getText(ast)
          : node.getText(ast);
        sites.push({ path: file.replaceAll('\\', '/'), ordinal, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, fingerprint: createHash('sha256').update(formSource).digest('hex').slice(0, 16), formId, ...(formIds ? { formIds } : {}) });
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return sites;
}

export async function scanFormSites(root: string, registry: Readonly<Record<FormId, FormDefinition>> = FORM_REGISTRY): Promise<FormPolicyViolation[]> {
  const violations: FormPolicyViolation[] = [];
  function hasImplementedAdapter(definition: FormDefinition): boolean {
    const adapter = IMPLEMENTED_FORM_ADAPTERS[definition.adapterId];
    return Boolean(adapter && adapter.formId === definition.id && adapter.route === definition.route && adapter.mode === definition.mode);
  }
  for (const site of await collectFormSites(resolve(root))) {
    const frozenId = baseline.get(`${site.path}|${site.ordinal}|${site.fingerprint}`);
    const ids = site.formIds ?? (frozenId ? [frozenId] : []);
    if (!ids.length || ids.some((id) => !registry[id])) {
      violations.push({ path: site.path, line: site.line, reason: 'Unregistered form site' });
    } else if (frozenId && site.formIds && (site.formIds.length !== 1 || site.formIds[0] !== frozenId)) {
      violations.push({ path: site.path, line: site.line, reason: `Form ID ${site.formId} does not match frozen site ${frozenId}` });
    } else if (!frozenId) {
      for (const id of ids) {
        if (registry[id].adapterId.startsWith('pending:'))
          violations.push({ path: site.path, line: site.line, reason: `Unregistered future form ${id} cannot use a pending adapter` });
        else if (!hasImplementedAdapter(registry[id]))
          violations.push({ path: site.path, line: site.line, reason: `Form ${id} has no registered implemented adapter` });
      }
    }
  }
  for (const [id, definition] of Object.entries(registry)) {
    if (!definition.adapterId?.trim() || !definition.capabilities?.explanation?.trim()) violations.push({ path: 'lib/forms/registry.ts', line: 0, reason: `${id} requires an adapter and capability explanation` });
    else if (!definition.adapterId.startsWith('pending:') && !hasImplementedAdapter(definition)) violations.push({ path: 'lib/forms/registry.ts', line: 0, reason: `${id} has no registered implemented adapter` });
  }
  return violations;
}
