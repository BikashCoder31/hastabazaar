import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DispatchParcel } from '../app/admin/orders/dispatch/read-dispatch';

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/navigation') {
      return {
        url: 'data:text/javascript,export const useRouter=()=>({refresh(){}})',
        shortCircuit: true,
      };
    }
    if (specifier === 'next/link') {
      return {
        url: 'data:text/javascript,export default function Link(){return null}',
        shortCircuit: true,
      };
    }
    if (specifier === 'next/image') {
      return {
        url: 'data:text/javascript,export default function Image(){return null}',
        shortCircuit: true,
      };
    }
    if (specifier === '@/app/admin/orders/dispatch/read-dispatch') {
      const source = `export const dispatchLanes = [{id:'ready',label:'Ready for pickup'},{id:'booked',label:'Booked, waiting for courier'}];`;
      return {
        url: 'data:text/javascript,' + encodeURIComponent(source),
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});
const { DispatchBookingForm } =
  await import('../components/admin/dispatch-booking-form');
const { DispatchWorkspace } =
  await import('../components/admin/dispatch-workspace');
hooks.deregister();

const parcel = {
  key: 'order:seller',
  orderId: 'order',
  orderNumber: 'HB-101',
  sellerId: 'seller',
  sellerName: 'Clay Studio',
  pickupGroup: 'seller',
  pickupAddress: 'Kathmandu',
  destination: 'Pokhara',
  itemName: 'Clay cup',
  additionalItems: 0,
  mediaId: null,
  jobId: 'job',
  version: 1,
  codDuePaisa: 0,
  courierName: null,
  trackingNumber: null,
  pickupStart: null,
  pickupEnd: null,
  canMarkPickedUp: false,
  canRecordFailure: false,
  state: 'label_pending',
  lane: 'ready',
} satisfies DispatchParcel;
const ncm = { partnerId: 'ncm', usedToday: 12, limit: 1000 };
const partner = {
  id: 'ncm',
  name: 'Nepal Can Move',
  collectsCod: true,
  hasTrackingPattern: false,
};
const upaya = { ...partner, id: 'upaya', name: 'Upaya' };

function renderForm(
  partners = [partner],
  ncmSettings: typeof ncm | null = ncm,
) {
  return renderToStaticMarkup(
    createElement(DispatchBookingForm, {
      parcels: [parcel],
      pickup: undefined,
      options: [],
      partners,
      actorId: 'super-admin',
      ncm: ncmSettings,
      refreshing: false,
      onBusy() {},
      onSaved() {},
      onNotice() {},
      onNcmResults() {},
    }),
  );
}

void test('NCM and hand booking are offered only when the selected partner has NCM API enabled', () => {
  const html = renderForm();
  assert.match(html, />Book with NCM<\/button>/);
  assert.match(html, />Book by hand<\/button>/);
  assert.match(html, /12 of 1,000 NCM bookings used today/);
  assert.doesNotMatch(renderForm([upaya]), />Book with NCM<\/button>/);
  assert.doesNotMatch(renderForm([partner], null), />Book with NCM<\/button>/);
  assert.match(renderForm([partner], null), /Book pickup for 1 parcel/);
});

void test('an uncertain NCM booking is actionable on its parcel without selecting it', () => {
  const parcels = [
    {
      ...parcel,
      ncmBooking: { state: 'needs_review' as const, trackingNumber: null },
    },
  ];
  const html = renderToStaticMarkup(
    createElement(DispatchWorkspace, {
      parcels,
      actorId: 'super-admin',
      options: [],
      partners: [partner],
      canManagePartners: true,
      ncm,
    }),
  );
  assert.match(html, /Check NCM before retrying/);
  assert.match(html, /I found it on NCM · enter NCM order number/);
  assert.match(html, /It isn’t on NCM · try again/);
});

void test('a booked NCM parcel exposes labels, notes and returns even when it is not selected', () => {
  const parcels = [
    {
      ...parcel,
      lane: 'booked' as const,
      ncmBooking: { state: 'booked' as const, trackingNumber: '747' },
    },
  ];
  const html = renderToStaticMarkup(
    createElement(DispatchWorkspace, {
      parcels,
      actorId: 'super-admin',
      options: [],
      partners: [partner],
      canManagePartners: true,
      initialLane: 'booked',
      ncm,
    }),
  );
  assert.match(html, /NCM order number · 747/);
  assert.match(
    html,
    /href="\/admin\/orders\/dispatch\/ncm-label\?jobId=job">Print NCM label<\/a>/,
  );
  assert.match(html, />Add note for NCM<\/button>/);
  assert.match(html, />Ask NCM to return<\/button>/);
});
