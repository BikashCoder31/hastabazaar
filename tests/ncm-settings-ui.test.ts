import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NcmSettingsView } from '../lib/delivery/ncm-settings';
import type { DeliveryPartner } from '../lib/delivery/partners';

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/navigation') {
      return { url: 'data:text/javascript,export const useRouter=()=>({refresh(){}})', shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { DeliveryPartners } = await import('../components/admin/delivery-partners');
hooks.deregister();

const partner: DeliveryPartner = {
  id: 'ncm', name: 'Nepal Can Move', status: 'in_use', bookingMode: 'manual', collectsCod: true,
  trackingPattern: null, isDefault: true, revision: 1, parcelsThisMonth: 0,
};
const ncm: NcmSettingsView = {
  partnerId: partner.id, configured: true, connectedAt: 1, assignedBranches: ['KATHMANDU', 'POKHARA'],
  branchesCheckedAt: 1, canRefresh: false, deliveryType: 'Door2Door', packageName: 'Handmade goods', revision: 1,
  pickups: [{ id: 'pickup', sellerName: 'Clay Studio', address: 'Boudha, Kathmandu', updatedAt: 1,
    branch: null, suggestedBranch: 'KATHMANDU' }],
  lastWebhookAt: null, lastCheckAt: null,
};
function render(partners: DeliveryPartner[], view: NcmSettingsView | null) {
  return renderToStaticMarkup(createElement(DeliveryPartners, { partners, actorId: 'super-admin', ncm: view }));
}

void test('connection controls belong to the configured NCM delivery partner and stay hidden before rollout', () => {
  const upaya = { ...partner, id: 'upaya', name: 'Upaya', isDefault: false };
  assert.doesNotMatch(render([partner], null), /Test connection/);
  assert.doesNotMatch(render([upaya], ncm), /Test connection/);
  assert.match(render([partner, upaya], ncm), /Connected · pickup branches: KATHMANDU, POKHARA/);
});

void test('a suggested pickup branch still requires an explicit confirmation before API booking', () => {
  const html = render([partner], ncm);
  assert.match(html, /Clay Studio/);
  assert.match(html, /Suggested branch: KATHMANDU/);
  assert.match(html, /Confirm a pickup branch before booking parcels from this address with NCM/);
  assert.match(html, />Confirm branch<\/button>/);
});

void test('an API-mode partner keeps the by-hand fallback without exposing the default action', () => {
  const partners: DeliveryPartner[] = [{ ...partner, bookingMode: 'api', isDefault: false }];
  const html = render(partners, ncm);
  assert.match(html, /<strong>API<\/strong>/);
  assert.match(html, /Book by hand remains available/);
  assert.doesNotMatch(html, />Make default<\/button>/);
  assert.match(render(partners, { ...ncm, configured: false }), /Choose Book by hand in Dispatch while the NCM connection is unavailable/);
});
