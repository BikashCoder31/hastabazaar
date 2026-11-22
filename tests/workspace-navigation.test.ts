import assert from 'node:assert/strict';
import test from 'node:test';
import { adminNavigation, adminNavigationGroups } from '../lib/admin/navigation';
import { sellerWorkspaceSection, sellerWorkspaceSections } from '../lib/sellers/workspace-navigation';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { getSellerCenterAccess } from '../lib/db/repositories/seller-center-access';
import { startSellerRegistration } from '../lib/db/repositories/seller-commercial-access';
import { activeAdminSection, adminSections } from '../components/admin/admin-sections';

void test('Seller Center requires an owned registration or explicit start; access never grants selling authority', async () => {
  const f = await completeVersionFixture();
  try {
    for (const subject of ['applicant', 'customer', 'foreign', 'delegate', 'reviewer', 'missing'])
      assert.equal(await getSellerCenterAccess(f.db, subject), null, subject);
    await startSellerRegistration(f.db, { userId: 'applicant', requestId: 'start-center', now: f.now });
    const applicant = await getSellerCenterAccess(f.db, 'applicant');
    assert.equal(applicant?.userId, 'applicant');
    assert.equal(applicant?.sellerId, null);
    assert.equal(applicant?.approvedSeller, false);
    const restricted = await getSellerCenterAccess(f.db, 'registered-owner');
    assert.equal(restricted?.sellerId, 'registered');
    assert.equal(restricted?.approvedSeller, true, 'An order hold must not conceal existing responsibilities.');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='applicant' AND role='seller'").get()?.n, 0);
    f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='applicant'");
    assert.equal(await getSellerCenterAccess(f.db, 'applicant'), null);
  } finally { f.dispose(); }
});

void test('Seller Studio places each old route in its current section', () => {
  assert.deepEqual(sellerWorkspaceSections.map(section => section.label), [
    'Today', 'Orders', 'Returns', 'Products', 'Earnings',
    'Shop profile', 'Reviews', 'Documents & agreement', 'Shipping', 'Requests & help',
  ]);
  for (const [path, section] of [
    ['/seller/shipping/parcel-1', 'shipping'], ['/seller/cases/returns/case-1', 'returns'],
    ['/seller/order-responses/answer', 'orders'], ['/seller/analytics', 'products'],
    ['/seller/products/product-1/edit', 'products'], ['/sell/application/products/draft-1/edit', 'products'],
    ['/sell/application', 'documents'], ['/seller/registration?document=pan', 'documents'],
    ['/seller#managed-program', 'documents'], ['/seller/form-history', 'documents'],
    ['/seller/notifications', 'requests'], ['/seller/reminders/example', 'requests'],
    ['/seller/reviews', 'reviews'], ['/seller/finance/recoveries', 'earnings'],
    ['/seller/financial-notices/refund/example', 'earnings'],
  ]) assert.equal(sellerWorkspaceSection(path)?.id, section, path);
  assert.equal(sellerWorkspaceSection('/seller'), sellerWorkspaceSections[0]);
  assert.equal(sellerWorkspaceSection('/admin/sellers'), undefined);
});

void test('all eight approved admin areas retain existing destinations and current permission boundaries', () => {
  assert.deepEqual(adminNavigationGroups, [
    'Overview & work queue', 'Sellers', 'Products & storefront', 'Orders & customer care',
    'Finance & payments', 'Fees, programs & promotions', 'Team & business policies', 'System health & records',
  ]);
  const superAdmin = adminNavigation('super_admin');
  const newDestinations = ['/admin/not-in-use', '/admin/orders/dispatch', '/admin/customers', '/admin/products/intakes',
    '/admin/payments/refunds', '/admin/payments/recoveries', '/admin/payouts/run', '/admin/offers',
    '/admin/system-health/incidents', '/admin/orders/delivery-partners'];
  const paths = new Set(superAdmin.map(link => link.href));
  assert.equal(paths.size, 43 + newDestinations.length);
  for (const path of newDestinations) assert.ok(paths.has(path), path);
  assert.deepEqual(new Set(superAdmin.map(link => link.group)), new Set(adminNavigationGroups));
  assert.equal(superAdmin.find(link => link.href === '/admin/commission')?.group, 'Fees, programs & promotions');
  assert.equal(superAdmin.find(link => link.href === '/admin/payouts')?.group, 'Finance & payments');
  assert.equal(superAdmin.find(link => link.href === '/admin/forms')?.group, 'System health & records');
  const delegated = adminNavigation('admin', ['product.review']);
  assert.ok(delegated.some(link => link.href === '/admin/products'));
  assert.ok(!delegated.some(link => ['/admin/forms', '/admin/payouts', '/admin/products/publications'].includes(link.href)));
  assert.equal(delegated.find(link => link.href === '/admin/team')?.label, 'My responsibilities');
  assert.equal(adminNavigation('customer').length, 0);
});

void test('Phase 1 exposes nine ordered hubs and preserves every original menu destination', () => {
  const sections = adminSections('super_admin');
  assert.deepEqual(sections.map(({ label }) => label), [
    'Today', 'Orders', 'Care', 'Sellers', 'Catalog', 'Money', 'Growth', 'Reports', 'Settings',
  ]);
  assert.deepEqual(sections.map(({ tabs }) => tabs[0].href), [
    '/admin', '/admin/orders', '/admin/cases', '/admin/sellers?reviewType=seller_application',
    '/admin/products', '/admin/payments', '/admin/offers', '/admin/analytics', '/admin/team',
  ]);
  const destinations = new Set(sections.flatMap(({ tabs }) => tabs.flatMap(({ href, related, routes }) =>
    [href, ...related.map(link => link.href), ...routes].map(value => value.split(/[?#]/)[0]))));
  for (const { href } of adminNavigation('super_admin')) assert.ok(destinations.has(href), href);
  assert.equal(activeAdminSection(sections, '/admin/products/publications/p-1')?.tab.label, 'Publishing');
  assert.equal(activeAdminSection(sections, '/admin/orders/delivery-partners')?.tab.label, 'Delivery partners');
  assert.ok(!adminSections('admin', ['order.manage']).flatMap(({ tabs }) => tabs).some(tab => tab.label === 'Delivery partners'));
  assert.equal(activeAdminSection(sections, '/admin/governance')?.section.label, 'Settings');
  assert.equal(activeAdminSection(sections, '/admin/backup-transfer')?.tab.label, 'System health & backups');
  assert.equal(activeAdminSection(adminSections('admin', ['system.incidents.manage']), '/admin/system-health/incidents')?.tab.label, 'Incidents');
  assert.equal(activeAdminSection(sections, '/admin/payments/recoveries/case-1')?.tab.label, 'Refunds & recoveries');
  assert.equal(activeAdminSection(sections, '/admin/sellers/seller-1')?.tab.label, 'All sellers');
  assert.equal(activeAdminSection(sections, '/admin/seller-protected-changes/c-1')?.tab.label, 'Bank & owner changes');
  assert.equal(activeAdminSection(sections, '/admin/notifications', new URLSearchParams('view=money-notices'))?.section.label, 'Money');
  assert.equal(activeAdminSection(sections, '/admin/notifications', new URLSearchParams('view=reminders'))?.tab.label, 'Reminders');
  assert.equal(activeAdminSection(sections, '/admin/sellers', new URLSearchParams('reviewType=seller_document'))?.tab.label, 'Documents');
});

void test('delegated staff land on a permitted tab and cannot discover restricted tabs or related links', () => {
  const sections = adminSections('admin', ['product.publish', 'payout.prepare', 'seller.application.review', 'support.manage']);
  assert.equal(sections.find(({ id }) => id === 'catalog')?.tabs[0].href, '/admin/products/intakes');
  assert.equal(adminSections('admin', ['product.publish']).find(({ id }) => id === 'catalog')?.tabs[0].href, '/admin/products/publications');
  assert.equal(sections.find(({ id }) => id === 'money')?.tabs[0].href, '/admin/payouts');
  assert.ok(sections.find(({ id }) => id === 'settings')?.tabs.some(({ href }) => href === '/admin/legal-policies/active'));
  const tabs = sections.flatMap(({ tabs }) => tabs);
  for (const label of ['Riders', 'Books', 'Documents', 'Updated documents', 'Bank & owner changes', 'ID requests', 'Forms']) {
    assert.ok(tabs.every(tab => tab.label !== label), label);
  }
  assert.equal(activeAdminSection(sections, '/admin/sellers', new URLSearchParams('reviewType=seller_document'))?.tab.label, 'Applications');
  assert.ok(!adminSections('admin', ['product.review']).some(({ id }) => id === 'money'));
  assert.deepEqual(adminSections('seller'), []);
});

void test('notification panel counts authorized unread records before its ten-item limit and never marks opening as read', async () => {
  const path = '../lib/operations/notification-panel';
  const panel = await import(path);
  const f = await completeVersionFixture();
  try {
    f.sqlite.exec('DELETE FROM notification_messages');
    const insert = f.sqlite.prepare(`INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,
      subject_en,subject_ne,body_en,body_ne,status,request_id,created_at,related_type,required_permission)
      VALUES(?,?,?,'in_app','fixture.notice','Fictional notice','Fictional notice','Open your record','Open your record','sent',?,?,'product',?)`);
    for (let i = 0; i < 105; i++) insert.run(`notice-${i}`, 'registered-owner', 'seller', `notice-${i}`, i, null);
    insert.run('foreign', 'foreign', 'seller', 'foreign', 1000, null);
    const result = await panel.getNotificationPanel(f.db, { userId: 'registered-owner', audience: 'seller' });
    assert.equal(result.unreadCount, 105); assert.equal(result.items.length, 10);
    assert.equal(result.items[0].id, 'notice-104');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM notification_messages WHERE read_at IS NOT NULL').get()?.n, 0);
    insert.run('product-work', 'delegate', 'staff', 'product-work', 100, 'product.review');
    insert.run('finance-work', 'delegate', 'staff', 'finance-work', 200, 'payout.prepare');
    const staff = await panel.getNotificationPanel(f.db, { userId: 'delegate', audience: 'staff', staff: { role: 'admin', permissions: ['product.review'] } });
    assert.equal(staff.unreadCount, 1); assert.deepEqual(staff.items.map((item: { id: string }) => item.id), ['product-work']);
  } finally { f.dispose(); }
});
