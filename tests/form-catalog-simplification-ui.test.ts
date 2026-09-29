import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

declare global { var catalogSimplificationDb: D1Database }
(globalThis as unknown as { React: typeof React }).React = React;
registerHooks({ resolve(specifier, context, nextResolve) {
  const boundary = specifier === 'cloudflare:workers' ? 'export const env={get DB(){return globalThis.catalogSimplificationDb}}'
    : specifier === '@/lib/auth/staff' ? 'export async function requireStaffPage(){return {id:"sa",role:"super_admin"}}'
    : specifier === 'next/navigation' ? 'export function redirect(){throw Error("Unexpected redirect")};export function notFound(){throw Error("Not found")}'
    : specifier === 'next/link' ? 'export default function Link({children,...props}){return globalThis.React.createElement("a",props,children)}'
    : null;
  return boundary ? { url: `data:text/javascript,${boundary}`, shortCircuit: true } : nextResolve(specifier, context);
} });

void test('catalog renders business categories and friendly links without universal form editor links', async () => {
  globalThis.catalogSimplificationDb = { prepare() { return { async all() { return { results: [] }; } }; } } as unknown as D1Database;
  const Page = (await import('../app/admin/forms/page')).default;
  const html = renderToStaticMarkup(await Page());
  for (const id of ['identity.register', 'account.profile', 'catalog.header-search', 'staff.staff-permission-1',
    'staff.homepage-hero-manager', 'staff.delivery-rate', 'commerce.add-to-cart']) {
    assert.ok(!html.includes(`/admin/forms/${id}`), `Unexpected editor link for ${id}`);
  }
  assert.match(html, /Applications &amp; business profiles/);
  assert.match(html, /Products &amp; inventory/);
  assert.match(html, /Orders &amp; customer care/);
  assert.match(html, /Supply &amp; delivery/);
  assert.match(html, /Payouts &amp; finance/);
  assert.match(html, /Governance &amp; operations/);
  assert.match(html, /href="\/admin\/forms\/seller.application"[^>]*>Seller application<\/a>/);
  assert.match(html, /href="\/admin\/form-submissions"/);
  assert.match(html, /href="\/admin\/staff-form-history"/);
});

void test('universal form direct page offers read-only version history without editor actions', async () => {
  globalThis.catalogSimplificationDb = { prepare() { return { bind() { return this; }, async all() {
    return { results: [{ id: 'prior-profile', version: 1, revision: 1, status: 'published',
      configJson: JSON.stringify({ formId: 'account.profile', fields: [] }), reason: 'Existing profile layout', updatedAt: 1, publishedAt: 1 }] };
  } }; } } as unknown as D1Database;
  const Page = (await import('../app/admin/forms/[formId]/page')).default;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ formId: 'account.profile' }) }));
  assert.match(html, /unavailable for editing/i);
  assert.match(html, /Version history/);
  assert.match(html, /Existing profile layout/);
  assert.doesNotMatch(html, /Save draft|Publish draft|Restore|Add field|Reason for change/);
  assert.match(html, /href="\/admin\/forms"/);
});
