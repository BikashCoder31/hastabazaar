import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/navigation') return { shortCircuit: true, url: 'data:text/javascript,export function usePathname(){return globalThis.securityBeaconPath}' };
  if (specifier === 'react') return { shortCircuit: true, url: 'data:text/javascript,export function useEffect(callback){callback()}' };
  return next(specifier, context);
} });
declare global { var securityBeaconPath: string }
void test('traffic beacon emits no literal private paths and preserves public product metrics', async () => {
  const { TrafficBeacon } = await import('../components/analytics/traffic-beacon');
  const previous = globalThis.fetch; const bodies: unknown[] = [];
  globalThis.fetch = async (_url, options) => { assert.equal(typeof options?.body, 'string'); bodies.push(JSON.parse(options!.body as string)); return new Response(null); };
  try {
    for (const path of ['/orders/private-order', '/account/private-account', '/seller/documents/private-document', '/orders/order/managed-invoices/invoice']) {
      globalThis.securityBeaconPath = path; TrafficBeacon();
    }
    assert.deepEqual(bodies, []);
    globalThis.securityBeaconPath = '/products/public-cup'; TrafficBeacon();
    assert.deepEqual(bodies, [{ eventType: 'product_view', path: '/products/public-cup', entityKey: 'public-cup' }]);
  } finally { globalThis.fetch = previous; }
});
