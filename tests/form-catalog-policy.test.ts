import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { FORM_REGISTRY, PROGRAMMATIC_FORM_SITES } from '../lib/forms/registry';
import { collectFormSites, scanFormSites } from './helpers/form-policy';

const root = resolve(import.meta.dirname, '..');

void test('the frozen source inventory contains exactly 69 form elements in 51 files', async () => {
  const sites = await collectFormSites(root);
  assert.equal(sites.length, 69);
  assert.equal(new Set(sites.map((site) => site.path)).size, 51);
  assert.deepEqual(await scanFormSites(root), []);
});

void test('the public contact source declares both live variant adapters and footer separately', async () => {
  const sites = await collectFormSites(root);
  const contact = sites.find((site) => site.path === 'components/layout/customer-contact-form.tsx');
  const footer = sites.find((site) => site.path === 'components/layout/footer-feedback-form.tsx');
  assert.deepEqual(contact?.formIds, ['public.feedback', 'public.contact']);
  assert.deepEqual(footer?.formIds, ['public.footer-feedback']);
  for (const id of [...(contact?.formIds ?? []), ...(footer?.formIds ?? [])]) {
    assert.equal(FORM_REGISTRY[id].adapterId, id);
  }
});

void test('a new JSX form cannot inherit a pre-existing exception', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'form-policy-'));
  try {
    await mkdir(join(fixture, 'components'), { recursive: true });
    await writeFile(join(fixture, 'components', 'new-form.tsx'), 'export const NewForm = () => <form><input name="new" /></form>;');
    const violations = await scanFormSites(fixture);
    assert.equal(violations.length, 1);
    assert.match(violations[0].reason, /unregistered/i);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

void test('replacing a frozen form body while preserving its opening tag is rejected', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'form-policy-'));
  try {
    const path = 'components/seller/seller-profile-form.tsx';
    const original = await readFile(join(root, path), 'utf8');
    assert.match(original, /<form\s+onSubmit=\{submit\}/);
    assert.match(original, /name="tradingName"/);
    const replacement = original.replace('name="tradingName"', 'name="newUnapprovedField"');
    await mkdir(join(fixture, 'components', 'seller'), { recursive: true });
    await writeFile(join(fixture, path), replacement);
    const violations = await scanFormSites(fixture);
    assert.ok(violations.some((violation) => violation.path === path && /unregistered/i.test(violation.reason)));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

void test('registry definitions require a server adapter and capability explanation', async () => {
  const broken = {
    ...FORM_REGISTRY,
    'future.unexplained': {
      id: 'future.unexplained', audience: 'customer', mode: 'collection', route: '/api/future',
      baseFields: [], capabilities: { explanation: '', customFieldTypes: [], answerBehavior: 'record' }, adapterId: '',
    },
  } as typeof FORM_REGISTRY;
  const violations = await scanFormSites(root, broken);
  assert.ok(violations.some((violation) => violation.reason.includes('future.unexplained') && violation.reason.includes('adapter')));
  const noExplanation = {
    ...FORM_REGISTRY,
    'future.unexplained': { ...FORM_REGISTRY['account.profile'], id: 'future.unexplained', capabilities: { ...FORM_REGISTRY['account.profile'].capabilities, explanation: '' } },
  };
  assert.ok((await scanFormSites(root, noExplanation)).some((violation) => violation.reason.includes('future.unexplained')));
});

void test('a future site cannot borrow a pending adapter from the frozen inventory', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'form-policy-'));
  try {
    await mkdir(join(fixture, 'components'), { recursive: true });
    await writeFile(join(fixture, 'components', 'new-form.tsx'), 'export const NewForm = () => <form data-form-id="seller.payout-request"><input name="name" /></form>;');
    assert.ok((await scanFormSites(fixture)).some((violation) => violation.reason.includes('pending adapter')));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

void test('a future query form with an invented nonpending adapter is rejected', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'form-policy-'));
  try {
    await mkdir(join(fixture, 'app', 'shop'), { recursive: true });
    await writeFile(join(fixture, 'app', 'shop', 'page.tsx'), 'export default function Shop() { return <form data-form-id="future.price-filter"><input name="min" /></form>; }');
    const invented = {
      ...FORM_REGISTRY,
      'future.price-filter': {
        ...FORM_REGISTRY['catalog.filters'],
        id: 'future.price-filter',
        adapterId: 'invented-price-filter',
        capabilities: { ...FORM_REGISTRY['catalog.filters'].capabilities, explanation: 'Filter by price in server results.' },
      },
    };
    const violations = await scanFormSites(fixture, invented);
    assert.ok(violations.some((violation) => violation.path === 'app/shop/page.tsx' && /adapter/i.test(violation.reason)));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

void test('click-driven data entry has a separate audited inventory including seller case responses', () => {
  const caseResponse = PROGRAMMATIC_FORM_SITES.find((site) => site.path === 'components/seller/case-response-form.tsx');
  assert.deepEqual(caseResponse?.formIds, ['seller.case-return-response', 'seller.case-complaint-response']);
  for (const site of PROGRAMMATIC_FORM_SITES) {
    assert.ok(site.explanation.length > 0);
    for (const id of site.formIds) assert.ok(FORM_REGISTRY[id], `${id} missing from registry`);
  }
});

void test('one rendered site may have separate receiving adapters for conditional modes', () => {
  assert.equal(FORM_REGISTRY['commerce.gift-card-redeem'].route, '/api/account/gift-cards');
  assert.equal(FORM_REGISTRY['commerce.gift-card-issue'].route, '/api/admin/gift-cards');
  assert.equal(FORM_REGISTRY['shipping.console-action-seller'].route, '/api/seller/shipping/:id');
  assert.equal(FORM_REGISTRY['shipping.console-action-staff'].route, '/api/admin/shipping/:id');
});

void test('programmatic actions name their actual primary receiving routes', () => {
  const expected = [
    ['commerce.order-cancellation', '/orders/:number/cancel'],
    ['staff.return-case-action', '/api/admin/returns/:id/review'],
    ['staff.seller-review-action', '/api/admin/seller-applications/:id/review'],
  ] as const;
  assert.deepEqual(
    expected.map(([id]) => [id, FORM_REGISTRY[id].route]),
    expected.map(([id, route]) => [id, route]),
  );
});

void test('return-case capability explains its conditional receiving actions', () => {
  assert.match(FORM_REGISTRY['staff.return-case-action'].capabilities.explanation, /high-value.*operations/i);
});

void test('a new JSX form in a .jsx file is subject to the same policy', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'form-policy-'));
  try {
    await mkdir(join(fixture, 'app'), { recursive: true });
    await writeFile(join(fixture, 'app', 'page.jsx'), 'export default function Page() { return <form><input name="term" /></form>; }');
    assert.equal((await scanFormSites(fixture)).length, 1);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

void test('JSX parsing ignores text and comments that merely contain form markup', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'form-policy-'));
  try {
    await mkdir(join(fixture, 'app'), { recursive: true });
    await writeFile(join(fixture, 'app', 'page.tsx'), 'const prose = "<form></form>"; // <form>\nexport default function Page() { return <p>Not a form</p>; }');
    assert.deepEqual(await collectFormSites(fixture), []);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
