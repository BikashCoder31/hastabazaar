import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { adminNavigation } from '../lib/admin/navigation';
import { availablePayoutActions } from '../lib/admin/payout-actions';
import {
  addHomepageHeroSlide,
  moveHomepageHeroSlide,
  removeHomepageHeroSlide,
  setHomepageHeroSlideEnabled,
} from '../lib/homepage/hero-editor';
import { INITIAL_HOMEPAGE_HERO_SLIDES } from '../lib/homepage/hero-slides';
import { sendJson } from '../lib/http/client-request';

void test('staff navigation denies unknown roles and limits staff access to Super Admin', () => {
  for (const role of ['customer', 'seller', 'guest', 'unknown', ''])
    assert.deepEqual(adminNavigation(role), []);
  for (const href of [
    '/admin/team',
    '/admin/referrals',
    '/admin/delivery-rates',
    '/admin/activity',
  ]) {
    assert.equal(
      adminNavigation('admin').some((item) => item.href === href),
      false,
    );
    assert.equal(
      adminNavigation('super_admin').some((item) => item.href === href),
      true,
    );
  }
  assert.deepEqual(
    adminNavigation('admin', []).map((item) => item.href),
    ['/admin/notifications'],
  );
  const orderDesk = adminNavigation('admin', ['order.manage']);
  assert.ok(orderDesk.some((item) => item.href === '/admin/orders'));
  assert.ok(orderDesk.some((item) => item.href === '/admin/order-emails'));
  assert.equal(
    orderDesk.some((item) => item.href === '/admin/cases'),
    false,
  );
  assert.equal(
    orderDesk.some((item) => item.href === '/admin/products'),
    false,
  );
  assert.ok(
    adminNavigation('admin').some(
      (item) => item.href === '/admin/order-emails',
    ),
  );
  assert.equal(
    adminNavigation('admin').some((item) => item.href === '/admin/referrals'),
    false,
  );
  assert.equal(
    adminNavigation('admin').some((item) => item.href === '/admin/team'),
    false,
  );
  assert.equal(
    adminNavigation('super_admin').some((item) => item.href === '/admin/team'),
    true,
  );
  for (const role of ['admin', 'super_admin']) {
    const links = adminNavigation(role);
    assert.equal(new Set(links.map((item) => item.href)).size, links.length);
  }
});
void test('payout affordances follow state, role authority, and independent approval', () => {
  const admin = { canApprove: false, canProcess: false, isPreparer: false };
  const checker = { canApprove: true, canProcess: true, isPreparer: false };
  for (const status of ['prepared', 'scheduled']) {
    assert.deepEqual(availablePayoutActions(status, admin), []);
    assert.deepEqual(availablePayoutActions(status, checker), [
      'approve',
      'reject',
    ]);
    assert.deepEqual(
      availablePayoutActions(status, { ...checker, isPreparer: true }),
      ['approve', 'reject'],
    );
  }
  for (const status of ['approved', 'failed']) {
    assert.deepEqual(availablePayoutActions(status, checker), [
      'start_processing',
    ]);
    assert.deepEqual(availablePayoutActions(status, admin), []);
  }
  assert.deepEqual(availablePayoutActions('processing', checker), [
    'mark_paid',
    'mark_failed',
  ]);
  assert.deepEqual(availablePayoutActions('processing', admin), []);
  for (const status of ['paid', 'rejected', 'reversed', 'unknown', ''])
    assert.deepEqual(availablePayoutActions(status, checker), []);
});
void test('mutation client reports network, non-JSON and rejected responses and retains valid results', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError('Network failed');
    };
    await assert.rejects(
      () => sendJson('/test', 'POST', {}, 'Fallback'),
      /couldn’t connect/,
    );
    globalThis.fetch = async () =>
      new Response('<html>Error</html>', { status: 500 });
    await assert.rejects(
      () => sendJson('/test', 'POST', {}, 'Fallback'),
      /Fallback/,
    );
    globalThis.fetch = async () =>
      Response.json(
        { error: 'Independent approval required.' },
        { status: 403 },
      );
    await assert.rejects(
      () => sendJson('/test', 'POST', {}, 'Fallback'),
      /Independent approval/,
    );
    globalThis.fetch = async () => Response.json({ ok: true });
    assert.deepEqual(await sendJson('/test', 'POST', {}, 'Fallback'), {
      ok: true,
    });
  } finally {
    globalThis.fetch = original;
  }
});
void test('mutation client preserves a rejected response status for retry decisions', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ error: 'The export ID was already used.' }, { status: 409 });
    await assert.rejects(() => sendJson('/test', 'POST', {}, 'Fallback'), (error: unknown) => {
      assert.equal((error as { status?: number }).status, 409);
      assert.match((error as Error).message, /already used/);
      return true;
    });
  } finally { globalThis.fetch = original; }
});

void test('homepage controls present Hero slides first with every approved editable field', async () => {
  const [page, manager] = await Promise.all([
    readFile(
      new URL('../app/admin/homepage/page.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../components/admin/homepage-hero-manager.tsx', import.meta.url),
      'utf8',
    ),
  ]);
  assert.match(
    page,
    /requireStaffPage\('\/admin\/homepage', 'business_settings\.view'\)/,
  );
  const heroPosition = page.indexOf('<HomepageHeroManager');
  const searchPosition = page.indexOf('data-form-id="staff.homepage-filter"');
  assert.ok(heroPosition >= 0 && searchPosition >= 0, 'Both hero editor and registered product search must exist.');
  assert.ok(heroPosition < searchPosition, 'Hero editor stays before product search regardless of configured label.');
  const helperFields = new Set([
    'eyebrow',
    'headingLead',
    'highlightedPhrase',
    'headingTail',
    'primaryActionLabel',
    'primaryActionHref',
    'secondaryActionLabel',
    'secondaryActionHref',
    'imageAlt',
    'videoDescription',
    'imageNote',
  ]);
  for (const field of [
    'eyebrow',
    'headingLead',
    'highlightedPhrase',
    'headingTail',
    'body',
    'primaryActionLabel',
    'primaryActionHref',
    'secondaryActionLabel',
    'secondaryActionHref',
    'mediaType',
    'mediaId',
    'imageAlt',
    'posterMediaId',
    'videoDescription',
    'imageNote',
  ]) {
    assert.match(
      manager,
      helperFields.has(field)
        ? new RegExp(`text\\('${field}'`)
        : new RegExp(`name=\\"${field}\\"`),
    );
  }
  assert.match(manager, /Desktop preview/);
  assert.match(manager, /Mobile preview/);
  assert.match(manager, /\/api\/admin\/homepage\/hero-media/);
  assert.match(manager, /key:\s*'homepage_hero_slides'/);
  assert.doesNotMatch(manager, /slide 1.*locked|first slide.*locked/i);
});

void test('hero editor explicitly adds, orders, and protects the three-enabled minimum', () => {
  const initial = [...INITIAL_HOMEPAGE_HERO_SLIDES];
  const four = addHomepageHeroSlide(initial, 'new-slide-four');
  assert.equal(four.length, 4);
  assert.equal(four[3]?.enabled, false);
  let eight = four;
  for (let index = 5; index <= 8; index += 1) {
    eight = addHomepageHeroSlide(eight, `new-slide-${index}`);
  }
  assert.throws(
    () => addHomepageHeroSlide(eight, 'new-slide-nine'),
    /at most 8/i,
  );

  const moved = moveHomepageHeroSlide(four, 'new-slide-four', 'up');
  assert.equal(moved[2]?.id, 'new-slide-four');
  assert.deepEqual(
    moved.map((slide) => slide.position),
    [1, 2, 3, 4],
  );
  assert.throws(
    () => setHomepageHeroSlideEnabled(initial, initial[0]!.id, false),
    /at least 3 enabled/i,
  );
  const enabledFour = setHomepageHeroSlideEnabled(four, 'new-slide-four', true);
  const withoutFirst = removeHomepageHeroSlide(enabledFour, initial[0]!.id);
  assert.equal(withoutFirst.length, 3);
  assert.equal(
    withoutFirst.some((slide) => slide.id === initial[0]!.id),
    false,
  );
  assert.deepEqual(
    withoutFirst.map((slide) => slide.position),
    [1, 2, 3],
  );
});

void test('responsive admin media preserves moderation and homepage authority and controls', async () => {
  const [review, homepage, layout] = await Promise.all([
    readFile(
      new URL('../app/admin/products/[id]/page.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../app/admin/homepage/page.tsx', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../app/admin/layout.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(
    review,
    /requireStaffPage\(\s*`\/admin\/products\/\$\{id\}`,\s*'product\.review',?\s*\)/,
  );
  assert.match(review, /canUnpublish=\{staff\.role === 'super_admin'\}/);
  assert.match(review, /canPublish=\{can\(staff, 'product\.publish'\)\}/);
  assert.match(review, /can\(staff, 'catalog\.manage'\)/);
  assert.match(review, /<figcaption[\s\S]*?\{media\.originalName\}/);
  assert.match(
    homepage,
    /requireStaffPage\('\/admin\/homepage', 'business_settings\.view'\)/,
  );
  assert.match(homepage, /<HomepageVisibilityControl/);
  assert.match(layout, /requireStaffPage\('\/admin'\)/);
  assert.match(
    layout,
    /<AdminNavigation role=\{staff\.role\} permissions=\{staff\.permissions\}/,
  );
});
