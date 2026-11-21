import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { isValidElement, type ReactNode } from 'react';
import { commerceOrderFixture } from './helpers/commerce-order-fixture';
import { getPlatformServiceFee } from '../lib/db/repositories/platform-service-fee';
import type { requireSellerCenterPage } from '../lib/auth/seller-center';

declare global {
  var offCustomerFeeFixture: D1Database | undefined;
}

const stubs: Record<string, string> = {
  'cloudflare:workers': `export const env = { get DB() { return globalThis.offCustomerFeeFixture }, HASTABAZAAR_RUNTIME_ENV: 'test' }`,
  'next/link': 'export default function FrameworkLink() { return null }',
  'next/image': 'export default function FrameworkImage() { return null }',
  'next/headers': 'export const headers = async () => new Headers(); export const cookies = async () => ({ get() {} });',
  'next/navigation': 'export function notFound() { throw new Error("Not found") } export const redirect = notFound; export const useRouter = () => ({}); export const usePathname = () => "/"; export const useSearchParams = () => new URLSearchParams();',
  '@/lib/auth/customer': 'export const getCustomerUser = async () => ({ userId: "checkout-buyer", authSubject: "checkout-buyer" });',
  '@/lib/auth/staff': 'export const requireStaffPage = async () => ({ id: "owner", authSubject: "owner", role: "super_admin" }); export class StaffAuthorizationError extends Error {}',
};
registerHooks({ resolve(specifier, context, next) {
  const code = specifier.endsWith('.module.css') ? 'export default {}' : stubs[specifier];
  return code ? { url: 'data:text/javascript,' + encodeURIComponent(code), shortCircuit: true } : next(specifier, context);
} });

function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (!isValidElement<{ children?: ReactNode; panels?: Record<string, ReactNode> }>(node)) return '';
  return [text(node.props.children), ...Object.values(node.props.panels ?? {}).map(text)].join(' ');
}

void test('customer, seller and Admin order pages omit the customer fee from an order placed while it was off', async () => {
  const fixture = await commerceOrderFixture();
  globalThis.offCustomerFeeFixture = fixture.database;
  try {
    const policy = await getPlatformServiceFee(fixture.database, 100);
    assert.equal(policy.enabled, false);
    assert.equal(policy.chargedPaisa, 0);
    const [customerPage, adminPage, sellerPage] = await Promise.all([
      import('../app/orders/[orderNumber]/page'), import('../app/admin/orders/[id]/page'),
      import('../app/seller/orders/order-detail'),
    ]);
    const params = Promise.resolve({ id: fixture.orderId });
    const seller = { sellerId: 'seller-a', userId: 'user-a', approvedSeller: true } as Awaited<ReturnType<typeof requireSellerCenterPage>>;
    const [customer, admin, sellerOrder] = await Promise.all([
      customerPage.default({ params: Promise.resolve({ orderNumber: fixture.placed.orderNumber }) }),
      adminPage.default({ params, searchParams: Promise.resolve({}) }),
      sellerPage.SellerOrderDetail({ db: fixture.database, seller, id: fixture.orderId }),
    ]);
    for (const rendered of [customer, admin, sellerOrder]) {
      const pageText = text(rendered);
      assert.ok(pageText.includes(fixture.placed.orderNumber), 'The original order is visible');
      assert.doesNotMatch(pageText, /(?:customer|platform) service fee|legally required fee refunds/i);
    }
  } finally {
    globalThis.offCustomerFeeFixture = undefined;
    await fixture.dispose();
  }
});
