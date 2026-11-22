import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
import { permissions, type Permission } from '../lib/marketplace/permissions';

void test('staff navigation denies unknown roles, exposes own responsibilities and preserves reserved access', () => {
  for (const role of ['customer', 'seller', 'guest', 'unknown', '']) {
    assert.deepEqual(adminNavigation(role), []);
    assert.deepEqual(adminNavigation(role, permissions), []);
  }
  for (const href of [
    '/admin/referrals',
    '/admin/fees',
    '/admin/fee-waivers',
    '/admin/promo-codes',
    '/admin/loyalty',
    '/admin/delivery-rates',
    '/admin/activity',
    '/admin/forms',
    '/admin/accounting',
    '/admin/backup-transfer',
    '/admin/staff-form-history',
    '/admin/form-submissions',
    '/admin/riders',
    '/admin/homepage',
    '/admin/business-emails',
    '/admin/order-emails',
  ]) {
    assert.equal(
      adminNavigation('admin').some((item) => item.href === href),
      false,
    );
    assert.equal(adminNavigation('admin', permissions).some((item) => item.href === href), false, href);
    assert.equal(
      adminNavigation('super_admin').some((item) => item.href === href),
      true,
    );
  }
  assert.deepEqual(
    adminNavigation('admin', []).map((item) => item.href),
    ['/admin', '/admin/notifications', '/admin/team', '/security'],
  );
  assert.equal(adminNavigation('admin', []).find((item) => item.href === '/admin/team')?.label, 'My responsibilities');
  assert.equal(adminNavigation('super_admin').find((item) => item.href === '/admin/team')?.label, 'Team & access');
  for (const [href, permission] of [
    ['/admin/products/publications', 'product.publish'],
    ['/admin/payments', 'payment.receipt.verify'],
    ['/admin/system-health', 'system.health.view'],
    ['/admin/legal-policies/active', 'support.manage'],
  ] as const satisfies readonly (readonly [string, Permission])[]) {
    assert.equal(adminNavigation('admin', []).some((item) => item.href === href), false, href);
    assert.equal(adminNavigation('admin', [permission]).some((item) => item.href === href), true, href);
    assert.equal(adminNavigation('admin', ['order.manage']).some((item) => item.href === href), false, href);
  }
  const orderDesk = adminNavigation('admin', ['order.manage']);
  assert.ok(orderDesk.some((item) => item.href === '/admin/orders'));
  assert.equal(orderDesk.some((item) => item.href === '/admin/order-emails'), false);
  assert.equal(
    orderDesk.some((item) => item.href === '/admin/cases'),
    false,
  );
  assert.equal(
    orderDesk.some((item) => item.href === '/admin/products'),
    false,
  );
  assert.equal(
    adminNavigation('admin').some((item) => item.href === '/admin/team'),
    true,
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
  const [page, manager, upload] = await Promise.all([
    readFile(
      new URL('../app/admin/homepage/page.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../components/admin/homepage-hero-manager.tsx', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../components/admin/use-homepage-upload.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(
    page,
    /requireStaffPage\('\/admin\/homepage', 'business_settings\.view'\)/,
  );
  const heroPosition = page.indexOf('<HomepageHeroManager');
  const searchPosition = page.indexOf('data-form-id="staff.homepage-filter"');
  assert.ok(heroPosition >= 0 && searchPosition >= 0, 'Both hero editor and registered product search must exist.');
  assert.ok(heroPosition < searchPosition, 'Hero editor stays before product search regardless of configured label.');
  // Render the actual manager and preview; only the Next router is unavailable in node.
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === 'next/navigation') return { url: 'data:text/javascript,export const useRouter=()=>({refresh(){}})', shortCircuit: true };
    return nextResolve(specifier, context);
  } });
  let markup: string;
  try {
    const { HomepageHeroManager } = await import('../components/admin/homepage-hero-manager');
    const image = INITIAL_HOMEPAGE_HERO_SLIDES[0]!;
    markup = renderToStaticMarkup(createElement(HomepageHeroManager, {
      actorId: 'presentation-reviewer', initialSlides: [image, { ...image, id: 'video-controls', mediaType: 'video' }],
      initialMedia: [], history: [], asOf: 1,
    }));
  } finally { hooks.deregister(); }
  assert.match(markup, /<form[^>]*data-form-id="staff\.homepage-hero-manager"/);
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
    assert.match(markup, new RegExp(`<(?:input|textarea|select)\\b[^>]*name="${field}"`), field);
  }
  assert.match(markup, /Desktop preview/);
  assert.match(markup, /Mobile preview/);
  assert.match(markup, /type="file"/);
  assert.match(manager, /import\s*\{\s*useHomepageUpload\s*\}\s*from\s*'\.\/use-homepage-upload'/);
  assert.match(manager, /upload\s*=\s*useHomepageUpload\(actorId,/);
  assert.match(upload, /const endpoint\s*=\s*'\/api\/admin\/homepage\/hero-media'/);
  assert.match(upload, /fetch\(endpoint,\{method:'POST'/);
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
