import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type {
  FixtureBrowser,
  FixturePage,
  FixtureRoute,
} from './helpers/browser-fixture-types';
import type { RewardsView } from '@/lib/incentives/types';

const initial: RewardsView = {
  balancePoints: 200,
  walletBalancePaisa: 5000,
  claimedToday: false,
  nextClaimAt: Date.parse('2026-09-28T18:15:00Z'),
  state: {
    version: 3,
    revision: 1,
    enabled: true,
    paused: false,
    dailyPoints: 10,
    pointsPerBlock: 100,
    creditPaisaPerBlock: 1000,
    startsAt: null,
    endsAt: null,
    status: 'active',
  },
  history: [],
  nextCursor: null,
};
const claim = {
  claimId: 'claim-a',
  localDate: '2026-09-28',
  awardedPoints: 10,
  balancePoints: 210,
};
const redemption = {
  redemptionId: 'redeem-a',
  points: 100,
  creditPaisa: 1000,
  balancePoints: 100,
  walletBalancePaisa: 6000,
};
const weekly: RewardsView = {
  ...initial,
  state: {
    ...initial.state,
    dailyPoints: 9,
    weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
    graceEnabled: false,
  },
  cycle: {
    day: 3,
    number: 2,
    graceUsed: false,
    graceApplied: false,
    resetReason: null,
    lastClaimDate: '2026-09-27',
  },
};
const weeklyClaim = {
  ...claim,
  awardedPoints: 9,
  balancePoints: 209,
  cycle: weekly.cycle,
};

type Page = FixturePage & {
  setDefaultTimeout(ms: number): void;
  on(event: 'pageerror', handler: (error: Error) => void): void;
};
async function mounted(
  view = initial,
  subject = 'owner-a',
  surface = 'rewards',
) {
  const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  );
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {RewardsPanel} from './components/account/rewards-panel';
    import {AccountNavigation} from './components/account/account-navigation';
    const root=createRoot(document.getElementById('root'));
    window.unmountFixture=()=>root.unmount();
    root.render(window.fixtureSurface === 'navigation' ? <AccountNavigation displayName="Fixture Buyer" email="buyer@example.test" signOutPath="/sign-out"/> : <RewardsPanel key={window.fixtureSubject} subjectId={window.fixtureSubject} initialRewards={window.fixtureView}/>);
  `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'rewards-fixture',
        setup(b) {
          stubFixtureLink(b);
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'navigation',
            namespace: 'fixture',
          }));
          b.onLoad({ filter: /^navigation$/, namespace: 'fixture' }, () => ({
            contents:
              'export function usePathname(){return "/account/rewards"}',
            loader: 'js',
          }));
        },
      },
    ],
  });
  const browser = (await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })) as FixtureBrowser;
  const page = (await browser.newPage()) as Page;
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  const held: FixtureRoute[] = [];
  let currentView = view,
    currentSubject = subject,
    formVersion = 1;
  let response = {
    status: 503,
    body: { error: 'Uncertain fixture result' } as object,
  };
  let lost = false,
    holdReads = false,
    holdPost = false;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, 'https://rewards.test');
    if (url.pathname.startsWith('/api/forms/'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            formId: decodeURIComponent(
              url.pathname.slice('/api/forms/'.length),
            ),
            version: formVersion,
            publishedAt: 1,
            fields: [],
          },
        }),
      });
    if (route.request().method() === 'POST') {
      requests.push({
        path: url.pathname,
        body: JSON.parse(route.request().postData() ?? '{}'),
      });
      if (holdPost) {
        held.push(route);
        return;
      }
      if (lost) return route.abort();
      return route.fulfill({
        ...response,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
    }
    if (url.pathname === '/api/account/rewards') {
      reads.push(url.search);
      if (holdReads) {
        held.push(route);
        return;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentView),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<title>My Rewards fixture</title><div id="root"></div>',
    });
  });
  async function reload() {
    await page.goto('https://rewards.test/account/rewards');
    await page.evaluate(
      ({ view, subject, surface }) =>
        Object.assign(window, {
          fixtureView: view,
          fixtureSubject: subject,
          fixtureSurface: surface,
        }),
      { view: currentView, subject: currentSubject, surface },
    );
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    if (surface === 'navigation')
      await page
        .getByRole('navigation', { name: 'Customer account' })
        .waitFor();
    else {
      await page
        .getByRole('heading', { name: 'My Rewards', exact: true })
        .waitFor();
      await page.waitForFunction(
        () => document.querySelector('[data-config-ready="true"]') !== null,
      );
    }
  }
  await reload();
  return {
    browser,
    page,
    requests,
    reads,
    errors,
    held,
    reload,
    setView(value: RewardsView) {
      currentView = value;
    },
    setSubject(value: string) {
      currentSubject = value;
    },
    setFormVersion(value: number) {
      formVersion = value;
    },
    holdReads(value = true) {
      holdReads = value;
    },
    holdPost() {
      holdPost = true;
    },
    respond(status: number, body: object) {
      lost = false;
      response = { status, body };
    },
    loseResponse() {
      lost = true;
    },
  };
}
async function claimOnce(h: Awaited<ReturnType<typeof mounted>>) {
  await h.page
    .getByRole('button', {
      name: /^(Check in|Retry original claim)$/,
    })
    .click();
  await h.page.waitForFunction(
    () =>
      document.querySelector(
        'form[data-form-id="account.daily-reward"] button[type="submit"]',
      )?.textContent !== 'Checking in…',
  );
}
async function review(h: Awaited<ReturnType<typeof mounted>>, points = '100') {
  await h.page.getByLabel('Points to exchange').fill(points);
  await h.page
    .getByRole('button', {
      name: /^(Review exchange|Review original exchange)$/,
    })
    .click();
  await h.page.getByRole('alertdialog').waitFor();
}
async function confirm(h: Awaited<ReturnType<typeof mounted>>) {
  await h.page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Confirm exchange', exact: true })
    .press('Enter');
  await h.page.waitForFunction(
    () =>
      !document
        .querySelector('button[data-exchange-confirm]')
        ?.hasAttribute('disabled'),
  );
}

void test('paused earning leaves existing points redeemable', async () => {
  const h = await mounted({
    ...initial,
    balancePoints: 100,
    state: { ...initial.state, paused: true, status: 'paused' },
  });
  try {
    assert.equal(
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      true,
    );
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Review exchange', exact: true })
        .isDisabled(),
      false,
    );
    await h.page
      .getByText(
        'Daily earning is paused. Your existing points remain redeemable.',
        { exact: true },
      )
      .waitFor();
    assert.equal(h.requests.length, 0);
  } finally {
    await h.browser.close();
  }
});

void test('mounted daily claim by keyboard updates balance and focused errors retain attempt', async () => {
  const h = await mounted();
  try {
    await h.page.evaluate(() => {
      document.body.dataset.rewardNotifications = '0';
      window.addEventListener('hastabazaar:rewards-updated', () => {
        document.body.dataset.rewardNotifications = String(
          Number(document.body.dataset.rewardNotifications) + 1,
        );
      });
    });
    const button = h.page.getByRole('button', {
      name: 'Check in',
      exact: true,
    });
    await button.press('Space');
    await h.page
      .getByRole('alert')
      .getByText('Uncertain fixture result')
      .waitFor();
    assert.equal(
      await h.page.evaluate(() => document.activeElement?.getAttribute('role')),
      'alert',
    );
    assert.equal(
      await h.page.evaluate(() => document.body.dataset.rewardNotifications),
      '0',
    );
    const original = h.requests[0].body;
    assert.deepEqual(Object.keys(original).sort(), [
      'customAnswers',
      'expectedVersion',
      'formVersion',
      'requestId',
    ]);
    h.setView({ ...initial, balancePoints: 210, claimedToday: true });
    h.respond(200, claim);
    await claimOnce(h);
    await h.page
      .getByRole('status')
      .getByText(/10 points claimed/)
      .waitFor();
    await h.page.getByText('210 points', { exact: true }).waitFor();
    assert.equal(
      await h.page.evaluate(() => document.body.dataset.rewardNotifications),
      '1',
    );
    assert.deepEqual(h.requests[1].body, original);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('mounted exchange review cancels without mutation and keyboard confirmation displays exact resulting balances', async () => {
  const h = await mounted();
  try {
    await review(h);
    const dialog = h.page.getByRole('alertdialog');
    await dialog
      .getByText('Exchange 100 points for NPR 10.00.', { exact: true })
      .waitFor();
    await dialog
      .getByText('Points after exchange: 100', { exact: true })
      .waitFor();
    await dialog
      .getByText('Shopping credit after exchange: NPR 60.00', { exact: true })
      .waitFor();
    await dialog
      .getByRole('button', { name: 'Cancel', exact: true })
      .press('Enter');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(h.requests.length, 0);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
    await review(h);
    h.respond(200, redemption);
    await confirm(h);
    await h.page
      .getByRole('status')
      .getByText(/100 points exchanged for NPR 10.00/)
      .waitFor();
    await h.page.getByText('100 points', { exact: true }).waitFor();
    await h.page.getByText('NPR 60.00', { exact: true }).waitFor();
    assert.deepEqual(Object.keys(h.requests[0].body).sort(), [
      'customAnswers',
      'expectedVersion',
      'formVersion',
      'points',
      'requestId',
    ]);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('no eligible points disables exchange clearly and invalid blocks focus the error without POST', async () => {
  const empty = await mounted({ ...initial, balancePoints: 99 });
  try {
    assert.equal(
      await empty.page
        .getByRole('button', { name: 'Review exchange', exact: true })
        .isDisabled(),
      true,
    );
    await empty.page
      .getByText('You need at least 100 points to exchange.', { exact: true })
      .waitFor();
  } finally {
    await empty.browser.close();
  }
  const h = await mounted();
  try {
    await h.page.getByLabel('Points to exchange').fill('101');
    await h.page
      .getByRole('button', { name: 'Review exchange', exact: true })
      .click();
    await h.page
      .getByRole('alert')
      .getByText(/whole blocks of 100/)
      .waitFor();
    assert.equal(
      await h.page.evaluate(() => document.activeElement?.getAttribute('role')),
      'alert',
    );
    assert.equal(h.requests.length, 0);
  } finally {
    await h.browser.close();
  }
});

void test('claim lost-response retry after reload midnight pause and form publication retains exact original intent', async () => {
  const h = await mounted();
  try {
    h.loseResponse();
    await claimOnce(h);
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0].body;
    h.setView({
      ...initial,
      claimedToday: true,
      nextClaimAt: initial.nextClaimAt + 86400000,
      state: { ...initial.state, version: 9, paused: true, status: 'paused' },
    });
    h.setFormVersion(2);
    await h.reload();
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Retry original claim', exact: true })
        .isDisabled(),
      false,
    );
    h.respond(200, claim);
    await claimOnce(h);
    assert.deepEqual(h.requests[1].body, original);
    await h.page.getByRole('status').waitFor();
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
  } finally {
    await h.browser.close();
  }
});

void test('exchange lost-response retry after reload pause lower balance and form publication restores exact original amount', async () => {
  const h = await mounted();
  try {
    h.loseResponse();
    await review(h);
    await confirm(h);
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0].body;
    h.setView({
      ...initial,
      balancePoints: 0,
      walletBalancePaisa: 9000,
      state: { ...initial.state, version: 10, paused: true, status: 'paused' },
    });
    h.setFormVersion(4);
    await h.reload();
    assert.equal(
      await h.page.getByLabel('Points to exchange').inputValue(),
      '100',
    );
    assert.equal(
      await h.page.getByLabel('Points to exchange').getAttribute('readonly'),
      '',
    );
    await h.page
      .getByRole('button', { name: 'Review original exchange', exact: true })
      .click();
    await h.page
      .getByRole('alertdialog')
      .getByText(/original exchange.*current balances/i)
      .waitFor();
    h.respond(200, redemption);
    await confirm(h);
    assert.deepEqual(h.requests[1].body, original);
    await h.page
      .getByRole('status')
      .getByText(/100 points exchanged/)
      .waitFor();
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
  } finally {
    await h.browser.close();
  }
});

void test('malformed success retains exact attempts and only validated success clears them', async () => {
  const h = await mounted();
  try {
    h.respond(200, { ...claim, balancePoints: -1 });
    await claimOnce(h);
    await h.page
      .getByRole('alert')
      .getByText(/could not be verified/)
      .waitFor();
    const originalClaim = h.requests[0].body;
    await claimOnce(h);
    assert.deepEqual(h.requests[1].body, originalClaim);
    await review(h);
    h.respond(200, { ...redemption, points: 200 });
    await confirm(h);
    await h.page
      .getByRole('alert')
      .getByText(/could not be verified/)
      .waitFor();
    const originalRedeem = h.requests[2].body;
    await h.reload();
    await h.page
      .getByRole('button', { name: 'Review original exchange', exact: true })
      .click();
    h.respond(200, redemption);
    await confirm(h);
    assert.deepEqual(h.requests[3].body, originalRedeem);
    assert.equal(
      await h.page.evaluate(() => sessionStorage.length),
      1,
      'exchange success preserves independent claim attempt',
    );
    h.respond(200, claim);
    await claimOnce(h);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
  } finally {
    await h.browser.close();
  }
});

void test('explicit reset is required for changed intent and persistence is bounded owner scoped metadata only', async () => {
  const h = await mounted();
  try {
    await review(h);
    await confirm(h);
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0].body;
    const stored = await h.page.evaluate(() => Object.entries(sessionStorage));
    assert.equal(stored.length, 1);
    assert.match(stored[0][0], /account.points-redemption:owner-a/);
    const intent = JSON.parse(stored[0][1]);
    assert.deepEqual(Object.keys(intent).sort(), [
      'expectedVersion',
      'formVersion',
      'points',
      'requestId',
    ]);
    assert.equal(JSON.stringify(intent).includes('owner-a'), false);
    h.page.once('dialog', (dialog) => void dialog.dismiss());
    await h.page
      .getByRole('button', {
        name: 'Start a new exchange attempt',
        exact: true,
      })
      .click();
    assert.equal(
      await h.page.getByLabel('Points to exchange').getAttribute('readonly'),
      '',
    );
    h.page.once('dialog', (dialog) => void dialog.accept());
    await h.page
      .getByRole('button', {
        name: 'Start a new exchange attempt',
        exact: true,
      })
      .click();
    await review(h, '200');
    await confirm(h);
    await h.page.getByRole('alert').waitFor();
    assert.notEqual(h.requests[1].body.requestId, original.requestId);
    assert.equal(h.requests[1].body.points, 200);
    h.setSubject('owner-b');
    await h.reload();
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Review exchange', exact: true })
        .isEnabled(),
      true,
    );
    assert.equal(
      await h.page.getByLabel('Points to exchange').inputValue(),
      '100',
    );
    await review(h);
    await confirm(h);
    await h.page.getByRole('alert').waitFor();
    assert.notEqual(h.requests[2].body.requestId, h.requests[1].body.requestId);
  } finally {
    await h.browser.close();
  }
});

void test('storage write failure and corrupt retained metadata fail closed without financial requests', async () => {
  const h = await mounted();
  try {
    await h.page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error('blocked');
      };
    });
    await claimOnce(h);
    await h.page
      .getByRole('alert')
      .getByText(/session storage is unavailable/i)
      .waitFor();
    assert.equal(h.requests.length, 0);
  } finally {
    await h.browser.close();
  }
  const corrupt = await mounted();
  try {
    await corrupt.page.evaluate(() =>
      sessionStorage.setItem(
        'hastabazaar:profile-attempt:account.daily-reward:owner-a:intent-v1',
        '{"requestId":"bad"}',
      ),
    );
    await corrupt.reload();
    await corrupt.page
      .getByRole('alert')
      .getByText(/prior claim.*unavailable/i)
      .waitFor();
    assert.equal(
      await corrupt.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      true,
    );
    assert.equal(corrupt.requests.length, 0);
  } finally {
    await corrupt.browser.close();
  }
});

void test('mounted history pagination uses the opaque cursor and a stale read cannot overwrite mutation balances', async () => {
  const h = await mounted({
    ...initial,
    history: [{ kind: 'daily_claim', createdAt: 1, result: claim }],
    nextCursor: 'opaque-owner-cursor',
  });
  try {
    await h.page
      .getByText('Daily claim: +10 points', { exact: true })
      .waitFor();
    h.setView({
      ...initial,
      history: [{ kind: 'redemption', createdAt: 2, result: redemption }],
      nextCursor: null,
    });
    await h.page
      .getByRole('button', { name: 'Load more activity', exact: true })
      .click();
    await h.page
      .getByText('Exchange: −100 points · NPR 10.00', { exact: true })
      .waitFor();
    assert.ok(h.reads.includes('?cursor=opaque-owner-cursor'));
    h.holdReads();
    await h.page
      .getByRole('button', { name: 'Refresh rewards', exact: true })
      .click();
    await h.page.waitForFunction(
      () => document.querySelector('[data-reading="true"]') !== null,
    );
    h.holdReads(false);
    h.setView({ ...initial, balancePoints: 210, claimedToday: true });
    h.respond(200, claim);
    await claimOnce(h);
    await h.page.getByText('210 points', { exact: true }).waitFor();
    assert.equal(h.held.length, 1);
    await h.held[0].fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...initial, balancePoints: 999 }),
    });
    await h.page.waitForFunction(
      () => document.querySelector('[data-reading="false"]') !== null,
    );
    assert.equal(
      await h.page.getByText('999 points', { exact: true }).count(),
      0,
    );
    await h.page.getByText('210 points', { exact: true }).waitFor();
  } finally {
    await h.browser.close();
  }
});

void test('duplicate clicks while a mutation is pending send one request and unmounted success leaves retry intact', async () => {
  const h = await mounted();
  try {
    h.holdPost();
    await h.page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>(
        'form[data-form-id="account.daily-reward"] button[type="submit"]',
      );
      button?.click();
      button?.click();
    });
    await h.page.waitForFunction(() =>
      document
        .querySelector(
          'form[data-form-id="account.daily-reward"] button[type="submit"]',
        )
        ?.hasAttribute('disabled'),
    );
    assert.equal(h.requests.length, 1);
    await h.page.evaluate(() =>
      (window as unknown as { unmountFixture(): void }).unmountFixture(),
    );
    await h.held[0].fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(claim),
    });
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 1);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('mounted account navigation exposes Rewards as the current native account link', async () => {
  const h = await mounted(initial, 'owner-a', 'navigation');
  try {
    const link = h.page.getByRole('link', { name: 'My Rewards', exact: true });
    assert.equal(await link.getAttribute('href'), '/account/rewards');
    assert.equal(await link.getAttribute('aria-current'), 'page');
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('actual rewards server page authenticates existing customers and reads the owner without provisioning', async () => {
  const { createRequire } = await import('node:module');
  const localRequire = createRequire(import.meta.url);
  const fixture = {
    mode: 'customer',
    events: [] as { kind: string; values: unknown[] }[],
    customer: { userId: 'database-owner-a', authSubject: 'subject-owner-a' },
    view: initial,
  };
  const sources: Record<string, string> = {
    'cloudflare:workers': 'export const env={DB:{fixture:true}};',
    'next/navigation':
      'export function redirect(path){throw new Error("redirect:"+path)}',
    '@/app/auth':
      'export async function requireAuthenticatedUser(path){const f=globalThis.__rewardsPageFixture;f.events.push({kind:"authenticate",values:[path]});if(f.mode==="guest")throw new Error("sign-in:"+path);return {userId:"subject-owner-a"}}',
    '@/lib/auth/customer':
      'export class CustomerAuthorizationError extends Error {constructor(message,status){super(message);this.status=status}};export async function requireExistingCustomerApi(){const f=globalThis.__rewardsPageFixture;f.events.push({kind:"existing-customer",values:[]});if(f.mode==="denied")throw new CustomerAuthorizationError("denied",403);return f.customer}',
    '@/lib/db/d1': 'export function requireDatabase(env){return env.DB}',
    '@/lib/db/repositories/loyalty':
      'export async function getRewards(...values){const f=globalThis.__rewardsPageFixture;f.events.push({kind:"rewards-read",values});return f.view}',
    '@/components/account/rewards-panel':
      'export function RewardsPanel(){return null}',
  };
  const bundle = await build({
    entryPoints: ['app/account/rewards/page.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    plugins: [
      {
        name: 'rewards-page-boundaries',
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            Object.hasOwn(sources, args.path)
              ? { path: args.path, namespace: 'page-fixture' }
              : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: 'page-fixture' }, (args) => ({
            contents: sources[args.path],
            loader: 'js',
          }));
        },
      },
    ],
  });
  const pageModule = {
    exports: {} as {
      default?: () => Promise<{
        props: { subjectId: string; initialRewards: RewardsView };
      }>;
    },
  };
  try {
    runInNewContext(bundle.outputFiles[0].text, {
      require: localRequire,
      module: pageModule,
      exports: pageModule.exports,
      __rewardsPageFixture: fixture,
    });
    const result = await pageModule.exports.default!();
    assert.deepEqual(
      fixture.events.map((entry) => entry.kind),
      ['authenticate', 'existing-customer', 'rewards-read'],
    );
    const read = fixture.events[2].values;
    assert.equal(read[1], 'database-owner-a');
    assert.equal(typeof read[2], 'number');
    assert.equal(read[5], 'subject-owner-a');
    assert.equal(result.props.subjectId, 'subject-owner-a');
    assert.deepEqual(result.props.initialRewards, initial);
    fixture.events.length = 0;
    fixture.mode = 'guest';
    await assert.rejects(
      pageModule.exports.default!(),
      /sign-in:\/account\/rewards/,
    );
    assert.deepEqual(
      fixture.events.map((entry) => entry.kind),
      ['authenticate'],
    );
    fixture.events.length = 0;
    fixture.mode = 'denied';
    await assert.rejects(
      pageModule.exports.default!(),
      /redirect:\/account-access-denied/,
    );
    assert.deepEqual(
      fixture.events.map((entry) => entry.kind),
      ['authenticate', 'existing-customer'],
    );
  } finally {
    fixture.events.length = 0;
  }
});

void test('successful current-server-day claim ignores a spoofed future browser clock', async () => {
  const h = await mounted();
  try {
    await h.page.evaluate(() => {
      Date.now = () => Date.parse('2026-09-30T12:00:00Z');
    });
    h.setView({
      ...initial,
      claimedToday: true,
      balancePoints: 210,
      history: [
        {
          kind: 'daily_claim',
          createdAt: Date.parse('2026-09-28T12:00:00Z'),
          result: claim,
        },
      ],
    });
    h.respond(200, claim);
    await claimOnce(h);
    await h.page
      .getByRole('status')
      .getByText(/10 points claimed/)
      .waitFor();
    assert.equal(
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      true,
    );
    await h.page.getByText(/Next check-in:/).waitFor();
    await h.page
      .getByText('Daily claim: +10 points', { exact: true })
      .waitFor();
    assert.equal(h.requests.length, 1);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('old exact claim replay on a later server day permits a new claim despite a spoofed old browser clock', async () => {
  const h = await mounted();
  try {
    h.loseResponse();
    await claimOnce(h);
    const original = h.requests[0].body;
    const laterView = {
      ...initial,
      balancePoints: 310,
      nextClaimAt: Date.parse('2026-09-30T18:15:00Z'),
    };
    h.setView(laterView);
    await h.reload();
    await h.page.evaluate(() => {
      Date.now = () => Date.parse('2026-09-28T12:00:00Z');
    });
    h.respond(200, claim);
    await claimOnce(h);
    assert.deepEqual(h.requests[1].body, original);
    assert.equal(
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      false,
    );
    await h.page.getByText('310 points', { exact: true }).waitFor();
    await h.page
      .getByRole('status')
      .getByText(/Resulting points balance: 210/)
      .waitFor();
    h.setView({ ...laterView, balancePoints: 320, claimedToday: true });
    h.respond(200, {
      ...claim,
      claimId: 'claim-current',
      localDate: '2026-09-30',
      balancePoints: 320,
    });
    await claimOnce(h);
    assert.notEqual(h.requests[2].body.requestId, original.requestId);
    assert.equal(
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      true,
    );
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
  } finally {
    await h.browser.close();
  }
});

void test('claim response crossing server midnight refreshes the new day rather than suppressing its award', async () => {
  const h = await mounted();
  try {
    h.holdPost();
    await h.page
      .getByRole('button', { name: /^(Check in|Checked in)$/ })
      .click();
    await h.page.waitForFunction(
      () =>
        document.querySelector(
          'form[data-form-id="account.daily-reward"] button[type="submit"]',
        )?.textContent === 'Checking in…',
    );
    h.setView({
      ...initial,
      balancePoints: 210,
      claimedToday: false,
      nextClaimAt: Date.parse('2026-09-29T18:15:00Z'),
    });
    await h.page.evaluate(() => {
      Date.now = () => Date.parse('2026-09-28T12:00:00Z');
    });
    await h.held[0].fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(claim),
    });
    await h.page.waitForFunction(
      () =>
        document.querySelector(
          'form[data-form-id="account.daily-reward"] button[type="submit"]',
        )?.textContent !== 'Checking in…',
    );
    assert.equal(
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      false,
    );
    assert.equal(await h.page.getByText(/Daily reset:/).count(), 1);
    assert.equal(await h.page.getByText(/Next check-in:/).count(), 0);
    assert.equal(h.requests.length, 1);
  } finally {
    await h.browser.close();
  }
});

void test('unverified post-claim status fails closed until an authoritative refresh succeeds', async () => {
  for (const status of [503, 200]) {
    const h = await mounted();
    try {
      await h.page.evaluate(() => {
        Date.now = () => Date.parse('2026-09-30T12:00:00Z');
      });
      h.holdReads();
      h.respond(200, claim);
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .click();
      await h.page
        .getByRole('status')
        .getByText(/10 points claimed/)
        .waitFor();
      assert.equal(
        await h.page
          .getByRole('button', { name: /^(Checking in…|Check in)$/ })
          .isDisabled(),
        true,
      );
      assert.equal(
        h.held.length,
        1,
        'confirmed claim requests authoritative status before enabling a new attempt',
      );
      await h.held[0].fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ...initial, claimedToday: 'unverified' }),
      });
      await h.page
        .getByRole('alert')
        .getByText(/claim is confirmed.*daily status could not be refreshed/)
        .waitFor();
      assert.equal(
        await h.page
          .getByRole('button', { name: /^(Check in|Checked in)$/ })
          .count(),
        0,
      );
      assert.equal(
        await h.page
          .getByRole('button', { name: 'Retry original claim', exact: true })
          .isDisabled(),
        false,
      );
      assert.equal(await h.page.getByText(/Next check-in:/).count(), 0);
      const original = h.requests[0].body;
      assert.equal(
        await h.page.evaluate(() => sessionStorage.length),
        1,
        'retain exact recovery intent while current status is unknown',
      );
      h.holdReads(false);
      h.setView({ ...initial, balancePoints: 210, claimedToday: true });
      await h.page
        .getByRole('button', { name: 'Refresh rewards', exact: true })
        .click();
      await h.page.getByText(/Next check-in:/).waitFor();
      await claimOnce(h);
      assert.deepEqual(h.requests[1].body, original);
      assert.equal(
        await h.page
          .getByRole('button', { name: /^(Check in|Checked in)$/ })
          .isDisabled(),
        true,
      );
      assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
      assert.equal(h.requests.length, 2);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.browser.close();
    }
  }
});

void test('weekly schedule exposes seven accessible cards and the server projected claim amount', async () => {
  const h = await mounted(weekly);
  try {
    const schedule = h.page.getByRole('list', {
      name: '7-day reward schedule',
    });
    assert.equal(await schedule.count(), 1);
    assert.equal(await schedule.getByRole('listitem').count(), 7);
    assert.equal(
      await schedule.locator('[aria-current="step"]').textContent(),
      'Day 39 pointsToday',
    );
    await h.page.getByText('70 points in 7 days', { exact: true }).waitFor();
    await h.page.getByText('Day 3 of 7', { exact: true }).waitFor();
    assert.equal(await h.page.locator('form').count(), 2);
    await h.page.getByText('200 points', { exact: true }).waitFor();
    await h.page.getByText('NPR 50.00', { exact: true }).waitFor();
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly missed-day reset and optional one-day grace explain preserved balances', async () => {
  const h = await mounted({
    ...weekly,
    state: { ...weekly.state, dailyPoints: 5 },
    cycle: { ...weekly.cycle!, day: 1, resetReason: 'missed_day' },
  });
  try {
    assert.equal(
      await h.page.getByRole('list', { name: '7-day reward schedule' }).count(),
      1,
    );
    await h.page.getByText(/Restarted at Day 1 after a missed day/).waitFor();
    h.setView({
      ...weekly,
      state: { ...weekly.state, graceEnabled: true },
      cycle: { ...weekly.cycle!, graceUsed: true, graceApplied: true },
    });
    await h.page
      .getByRole('button', { name: 'Refresh rewards', exact: true })
      .click();
    await h.page.getByText(/Grace day used. Your streak continues./).waitFor();
    await h.page.getByText(/Another missed day resets to Day 1./).waitFor();
    await h.page.getByText('200 points', { exact: true }).waitFor();
    await h.page.getByText('NPR 50.00', { exact: true }).waitFor();
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly claim success reconciles the recorded day and balance without using the browser clock', async () => {
  const h = await mounted(weekly);
  try {
    await h.page.evaluate(() => {
      Date.now = () => Date.parse('2026-10-30T12:00:00Z');
    });
    h.setView({
      ...weekly,
      claimedToday: true,
      balancePoints: 209,
      history: [
        {
          kind: 'daily_claim',
          createdAt: Date.parse('2026-09-28T12:00:00Z'),
          result: weeklyClaim,
        },
      ],
    });
    h.respond(200, weeklyClaim);
    await claimOnce(h);
    assert.equal(
      await h.page.getByRole('list', { name: '7-day reward schedule' }).count(),
      1,
    );
    assert.equal(
      await h.page.locator('[aria-current="step"]').textContent(),
      'Day 39 pointsClaimed today',
    );
    await h.page.getByText('209 points', { exact: true }).waitFor();
    assert.equal(
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      true,
    );
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
    assert.deepEqual(Object.keys(h.requests[0].body).sort(), [
      'customAnswers',
      'expectedVersion',
      'formVersion',
      'requestId',
    ]);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly Day 7 completion previews the repeating Day 1 while an old replay uses the later server projection', async () => {
  const daySeven: RewardsView = {
    ...weekly,
    claimedToday: true,
    state: { ...weekly.state, dailyPoints: 15 },
    cycle: { ...weekly.cycle!, day: 7 },
  };
  const h = await mounted(daySeven);
  try {
    assert.equal(
      await h.page.getByRole('list', { name: '7-day reward schedule' }).count(),
      1,
    );
    await h.page
      .getByText('Next check-in: Day 1 · 5 points.', { exact: true })
      .waitFor();
    h.setView({
      ...weekly,
      state: { ...weekly.state, dailyPoints: 5 },
      cycle: {
        ...weekly.cycle!,
        day: 1,
        number: 3,
        resetReason: 'cycle_complete',
      },
    });
    await h.page
      .getByRole('button', { name: 'Refresh rewards', exact: true })
      .click();
    await h.page.getByText('Day 1 of 7', { exact: true }).waitFor();
    h.loseResponse();
    await claimOnce(h);
    const original = h.requests[0].body;
    h.setView({
      ...weekly,
      balancePoints: 300,
      nextClaimAt: Date.parse('2026-09-30T18:15:00Z'),
      state: { ...weekly.state, dailyPoints: 10 },
      cycle: {
        ...weekly.cycle!,
        day: 4,
        number: 3,
        lastClaimDate: '2026-09-29',
      },
    });
    await h.reload();
    h.respond(200, weeklyClaim);
    await claimOnce(h);
    await h.page.getByText('Day 4 of 7', { exact: true }).waitFor();
    await h.page.getByText('300 points', { exact: true }).waitFor();
    assert.deepEqual(h.requests[1].body, original);
    assert.equal(
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      false,
    );
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly malformed claim cycle retains the exact original attempt and confirmed balances', async () => {
  const h = await mounted(weekly);
  try {
    h.respond(200, { ...weeklyClaim, cycle: { ...weekly.cycle, day: 8 } });
    await claimOnce(h);
    assert.equal(await h.page.getByRole('alert').count(), 1);
    await h.page
      .getByRole('alert')
      .getByText(/claim response could not be verified/)
      .waitFor();
    const original = h.requests[0].body;
    await h.page.getByText('200 points', { exact: true }).waitFor();
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 1);
    h.setView({ ...weekly, claimedToday: true, balancePoints: 209 });
    h.respond(200, weeklyClaim);
    await claimOnce(h);
    assert.deepEqual(h.requests[1].body, original);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly malformed refreshed schedule or cycle fails closed while keeping confirmed points and wallet', async () => {
  const h = await mounted(weekly);
  try {
    h.setView({
      ...weekly,
      claimedToday: true,
      balancePoints: 209,
      state: { ...weekly.state, weeklyPoints: [5, 7, 9, 10, 11, 13] },
    });
    h.respond(200, weeklyClaim);
    await claimOnce(h);
    assert.equal(await h.page.getByRole('alert').count(), 1);
    await h.page.getByText('209 points', { exact: true }).waitFor();
    await h.page.getByText('NPR 50.00', { exact: true }).waitFor();
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 1);
    assert.equal(await h.page.locator('[aria-current="step"]').count(), 0);
    h.setView({
      ...weekly,
      cycle: { ...weekly.cycle!, lastClaimDate: '2026-02-30' },
    });
    await h.page
      .getByRole('button', { name: 'Refresh rewards', exact: true })
      .click();
    await h.page
      .getByRole('alert')
      .getByText(/Rewards could not be loaded/)
      .waitFor();
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Retry original claim', exact: true })
        .isDisabled(),
      false,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly conflicting same-day refreshed cycle retains recovery instead of displaying an incorrect award day', async () => {
  const h = await mounted(weekly);
  try {
    h.setView({
      ...weekly,
      claimedToday: true,
      balancePoints: 209,
      cycle: { ...weekly.cycle!, day: 4 },
      history: [
        {
          kind: 'daily_claim',
          createdAt: Date.parse('2026-09-28T12:00:00Z'),
          result: weeklyClaim,
        },
      ],
    });
    h.respond(200, weeklyClaim);
    await claimOnce(h);
    assert.equal(await h.page.getByRole('alert').count(), 1);
    await h.page
      .getByRole('alert')
      .getByText(/claim is confirmed.*daily status could not be refreshed/)
      .waitFor();
    await h.page.getByText('209 points', { exact: true }).waitFor();
    assert.equal(await h.page.locator('[aria-current="step"]').count(), 0);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 1);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly schedule publication preserves the recorded today award while showing future amounts', async () => {
  const h = await mounted({
    ...weekly,
    claimedToday: true,
    balancePoints: 209,
    state: { ...weekly.state, weeklyPoints: [6, 8, 11, 12, 13, 14, 16] },
    history: [
      {
        kind: 'daily_claim',
        createdAt: Date.parse('2026-09-28T12:00:00Z'),
        result: weeklyClaim,
      },
    ],
  });
  try {
    assert.equal(
      await h.page.locator('[aria-current="step"]').textContent(),
      'Day 39 pointsClaimed today',
    );
    await h.page.getByText('80 points in 7 days', { exact: true }).waitFor();
    await h.page.getByText('16 points', { exact: true }).waitFor();
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly activation after a fixed reward keeps Day 1 as the next claim without relabeling earned points', async () => {
  const h = await mounted({
    ...weekly,
    claimedToday: true,
    balancePoints: 210,
    state: { ...weekly.state, dailyPoints: 10 },
    cycle: {
      ...weekly.cycle!,
      day: 1,
      number: 1,
      resetReason: 'first_claim',
      lastClaimDate: '2026-09-28',
    },
    history: [
      {
        kind: 'daily_claim',
        createdAt: Date.parse('2026-09-28T12:00:00Z'),
        result: claim,
      },
    ],
  });
  try {
    assert.equal(
      await h.page.locator('[aria-current="step"]').textContent(),
      'Day 15 pointsNext claim',
    );
    await h.page
      .getByText(
        '10 points collected today. New rewards start at your next check-in.',
        {
          exact: true,
        },
      )
      .waitFor();
    assert.equal(
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      true,
    );
    await h.page.getByText('210 points', { exact: true }).waitFor();
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly conflicting next-claim amount fails refresh validation without changing the displayed cycle', async () => {
  const h = await mounted(weekly);
  try {
    h.setView({ ...weekly, state: { ...weekly.state, dailyPoints: 15 } });
    await h.page
      .getByRole('button', { name: 'Refresh rewards', exact: true })
      .click();
    await h.page.waitForFunction(
      () => document.querySelector('[data-reading="false"]') !== null,
    );
    assert.equal(await h.page.getByRole('alert').count(), 1);
    assert.equal(
      await h.page.locator('[aria-current="step"]').textContent(),
      'Day 39 pointsToday',
    );
    await h.page.getByText('200 points', { exact: true }).waitFor();
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly-to-fixed same-day lost-response replay recovers the exact claim from authoritative history', async () => {
  const firstDay: RewardsView = {
    ...weekly,
    state: { ...weekly.state, dailyPoints: 5 },
    cycle: {
      ...weekly.cycle!,
      day: 1,
      number: 1,
      resetReason: 'first_claim',
      lastClaimDate: null,
    },
  };
  const originalResult = {
    ...weeklyClaim,
    awardedPoints: 5,
    balancePoints: 205,
    cycle: firstDay.cycle,
  };
  const h = await mounted(firstDay);
  try {
    h.loseResponse();
    await claimOnce(h);
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0].body;
    h.setView({
      ...initial,
      claimedToday: true,
      balancePoints: 205,
      state: { ...initial.state, dailyPoints: 5, version: 4, revision: 2 },
      history: [
        {
          kind: 'daily_claim',
          createdAt: Date.parse('2026-09-28T12:00:00Z'),
          result: originalResult,
        },
      ],
    });
    await h.reload();
    h.respond(200, originalResult);
    await claimOnce(h);
    assert.deepEqual(h.requests[1].body, original);
    assert.equal(await h.page.getByRole('alert').count(), 0);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 0);
    await h.page.getByText('205 points', { exact: true }).waitFor();
    await h.page.getByText('NPR 50.00', { exact: true }).waitFor();
    assert.equal(
      await h.page.getByRole('list', { name: '7-day reward schedule' }).count(),
      0,
    );
    assert.equal(
      await h.page
        .getByRole('button', { name: /^(Check in|Checked in)$/ })
        .isDisabled(),
      true,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly-to-fixed same-day replay retains recovery when authoritative history is missing or conflicts', async () => {
  const h = await mounted(weekly);
  try {
    const fixedView: RewardsView = {
      ...initial,
      claimedToday: true,
      balancePoints: 209,
      state: { ...initial.state, dailyPoints: 9 },
    };
    h.setView(fixedView);
    h.respond(200, weeklyClaim);
    await claimOnce(h);
    const original = h.requests[0].body;
    assert.equal(await h.page.getByRole('alert').count(), 1);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 1);
    h.setView({
      ...fixedView,
      history: [
        {
          kind: 'daily_claim',
          createdAt: Date.parse('2026-09-28T12:00:00Z'),
          result: { ...weeklyClaim, balancePoints: 208 },
        },
      ],
    });
    await claimOnce(h);
    assert.deepEqual(h.requests[1].body, original);
    assert.equal(await h.page.getByRole('alert').count(), 1);
    assert.equal(await h.page.evaluate(() => sessionStorage.length), 1);
    await h.page.getByText('209 points', { exact: true }).waitFor();
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
