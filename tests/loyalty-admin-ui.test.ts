import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import type {
  FixtureBrowser,
  FixturePage,
  FixtureRoute,
} from './helpers/browser-fixture-types';
import type { LoyaltyState } from '../lib/incentives/types';

const terms = {
  enabled: true,
  dailyPoints: 10,
  pointsPerBlock: 100,
  creditPaisaPerBlock: 1000,
  startsAt: 1000,
  endsAt: 253402300799999,
  dailyBudgetPoints: 100,
  lifetimeBudgetPoints: 1050,
};
const state: LoyaltyState = {
  version: 3,
  revision: 2,
  draftRevision: 2,
  publishedRevision: 1,
  paused: false,
  terms,
  rateLocked: true,
  lockedDenomination: { pointsPerBlock: 100, creditPaisaPerBlock: 1000 },
  issuedPoints: 250,
  redeemedPoints: 100,
  outstandingPoints: 150,
  issuedTodayPoints: 20,
  creditedPaisa: 1000,
  liability: { wholeBlocks: 1, creditPaisa: 1000, remainingPoints: 50 },
  maximumLiability: {
    wholeBlocks: 10,
    creditPaisa: 10000,
    remainingPoints: 50,
  },
};
async function mounted(role = 'super_admin') {
  const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  );
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `import React from 'react';import {createRoot,hydrateRoot} from 'react-dom/client';import {renderToString} from 'react-dom/server';import {LoyaltyManager} from './components/admin/loyalty-manager';const element=document.getElementById('root');const app=<LoyaltyManager role={${JSON.stringify(role)}} ownerId={window.fixtureOwner??'staff-a'} initialState={window.fixtureState??${JSON.stringify(state)}}/>;window.hydrationErrors=[];let root;if(window.fixtureHydrate){element.innerHTML=renderToString(app);root=hydrateRoot(element,app,{onRecoverableError(error){window.hydrationErrors.push(error.message)}});}else{root=createRoot(element);root.render(app);}window.unmountFixture=()=>root.unmount();`,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'loyalty-router-fixture',
        setup(bundler) {
          bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'navigation',
            namespace: 'loyalty-fixture',
          }));
          bundler.onLoad(
            { filter: /^navigation$/, namespace: 'loyalty-fixture' },
            () => ({
              contents:
                'export function useRouter(){return {refresh(){window.routerRefreshCount=(window.routerRefreshCount??0)+1}}}',
              loader: 'js',
            }),
          );
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
  const page = (await browser.newPage()) as FixturePage & {
    setDefaultTimeout(ms: number): void;
    on(event: 'pageerror', handler: (error: Error) => void): void;
  };
  page.setDefaultTimeout(3500);
  const requests: Record<string, unknown>[] = [],
    reads: string[] = [],
    heldReads: FixtureRoute[] = [],
    heldPosts: FixtureRoute[] = [],
    errors: string[] = [];
  let response: { status: number; body: unknown } = {
      status: 503,
      body: { error: 'Uncertain fixture result' },
    },
    lose = false,
    holdRead = false,
    holdPost = false,
    configVersion = 1,
    replacementQuestion = false;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, 'https://loyalty-admin.test');
    if (url.pathname.startsWith('/api/forms/')) {
      reads.push(url.pathname);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            formId: 'staff.loyalty-settings',
            version: configVersion,
            publishedAt: 1,
            fields: [
              {
                id: replacementQuestion ? 'replacement_note' : 'context_note',
                key: replacementQuestion ? 'replacement_note' : 'context_note',
                type: 'short_text',
                label: replacementQuestion
                  ? 'Replacement context'
                  : 'Private context',
                required: true,
                status: 'active',
                order: 0,
              },
            ],
          },
        }),
      });
    }
    if (url.pathname === '/api/admin/loyalty') {
      if (route.request().method() === 'GET') {
        reads.push(url.pathname);
        if (holdRead) {
          heldReads.push(route);
          return;
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(state),
        });
      }
      requests.push(JSON.parse(route.request().postData() ?? '{}'));
      if (lose) return route.abort();
      if (holdPost) {
        heldPosts.push(route);
        return;
      }
      return route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<div id="root"></div>',
    });
  });
  async function reload(next = state, owner = 'staff-a', hydrate = false) {
    await page.goto('https://loyalty-admin.test/admin/loyalty');
    await page.evaluate(
      ({ next, owner, hydrate }) => {
        Object.assign(window, {
          fixtureState: next,
          fixtureOwner: owner,
          fixtureHydrate: hydrate,
        });
      },
      { next, owner, hydrate },
    );
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    if (role === 'super_admin') {
      await page
        .getByText('Administrative details and recorded exposure', {
          exact: true,
        })
        .click();
    }
  }
  await reload();
  const form = () =>
    page.locator('form[data-form-id="staff.loyalty-settings"]');
  async function fillPrivate(
    reason = 'Private reviewed reason',
    context = 'Private evidence',
  ) {
    await form().getByLabel('Reason').fill(reason);
    await form().getByLabel('Private context').fill(context);
  }
  async function send(name = 'Save draft') {
    await form().getByRole('button', { name, exact: true }).press('Enter');
    await page.waitForFunction(
      () =>
        !document
          .querySelector('form[data-form-id="staff.loyalty-settings"] fieldset')
          ?.hasAttribute('disabled'),
    );
  }
  return {
    browser,
    page,
    requests,
    reads,
    heldReads,
    heldPosts,
    errors,
    form,
    fillPrivate,
    send,
    reload,
    state,
    respond(status: number, body: unknown) {
      lose = false;
      response = { status, body };
    },
    loseResponse() {
      lose = true;
    },
    holdReads() {
      holdRead = true;
    },
    holdPosts() {
      holdPost = true;
    },
    replaceQuestion() {
      configVersion = 2;
      replacementQuestion = true;
    },
    configVersion(version: number) {
      configVersion = version;
    },
  };
}
async function finish(route: FixtureRoute, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

void test('unsaved daily earning and forecast inputs update the estimate without submitting or changing the locked rate', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    const estimate = h.page.getByRole('region', {
      name: 'Future earning cost',
    });
    await estimate.getByText('30,000', { exact: true }).waitFor();
    await estimate.getByText(/3,000\.00/).waitFor();
    await estimate.getByText('10 days per customer', { exact: true }).waitFor();
    await h.form().getByLabel('Daily points').fill('20');
    await estimate.getByText('60,000', { exact: true }).waitFor();
    await estimate.getByText(/6,000\.00/).waitFor();
    await estimate.getByText('5 days per customer', { exact: true }).waitFor();
    await estimate.getByLabel('Expected daily participants').fill('50');
    await estimate.getByLabel('Forecast days').fill('5');
    await estimate.getByText('5,000', { exact: true }).waitFor();
    await estimate.getByText(/500\.00/).waitFor();
    assert.equal(
      await h.form().getByLabel('Credit per block (NPR)').inputValue(),
      '10.00',
    );
    assert.equal(
      await h
        .form()
        .getByLabel('Credit per block (NPR)')
        .getAttribute('readonly'),
      '',
    );
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly admin controls switch legacy earning into editable defaults with grace off and verify the saved schedule', async () => {
  const h = await mounted();
  const weekly = {
    ...terms,
    dailyPoints: 5,
    weeklyPoints: [5, 7, 9, 10, 11, 13, 17],
    graceEnabled: true,
  };
  try {
    await h.form().getByLabel('Private context').waitFor();
    assert.equal(
      await h.form().getByLabel('Earning schedule').inputValue(),
      'fixed',
    );
    await h.form().getByLabel('Earning schedule').selectOption('weekly');
    const estimate = h.page.getByRole('region', {
      name: 'Future earning cost',
    });
    await estimate.getByText('29,200', { exact: true }).waitFor();
    assert.equal(await h.form().getByLabel('Day 1 points').inputValue(), '5');
    assert.equal(await h.form().getByLabel('Day 7 points').inputValue(), '15');
    assert.equal(
      await h
        .form()
        .getByLabel('Grace period')
        .evaluate((element) => (element as HTMLInputElement).checked),
      false,
    );
    await h.form().getByLabel('Day 7 points').fill('17');
    await estimate.getByText('30,000', { exact: true }).waitFor();
    await h.form().getByLabel('Grace period').check();
    assert.equal(h.requests.length, 0);
    await h.fillPrivate();
    h.respond(200, {
      ...state,
      version: 4,
      revision: 3,
      draftRevision: 3,
      terms: weekly,
    });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    assert.deepEqual(h.requests[0].terms, weekly);
    assert.equal(await h.form().getByLabel('Day 7 points').inputValue(), '17');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly retained retries restore the original schedule and grace and reject changed intent', async () => {
  const h = await mounted();
  const weekly = {
    ...terms,
    dailyPoints: 5,
    weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
    graceEnabled: true,
  };
  const weeklyState = { ...state, terms: weekly };
  try {
    await h.reload(weeklyState);
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.loseResponse();
    await h.send();
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0];
    await h.reload({
      ...weeklyState,
      version: 8,
      revision: 4,
      draftRevision: 4,
      terms: {
        ...weekly,
        weeklyPoints: [5, 8, 10, 12, 14, 16, 18],
        graceEnabled: false,
      },
    });
    await h.form().getByLabel('Private context').waitFor();
    assert.equal(await h.form().getByLabel('Day 7 points').inputValue(), '15');
    assert.equal(
      await h
        .form()
        .getByLabel('Grace period')
        .evaluate((element) => (element as HTMLInputElement).checked),
      true,
    );
    assert.equal(await h.form().getByLabel('Reason').inputValue(), '');
    await h.fillPrivate();
    await h.form().getByLabel('Day 7 points').fill('16');
    await h.send();
    await h.page
      .getByText(/This operation differs from the prior attempt/)
      .waitFor();
    assert.equal(h.requests.length, 1);
    await h.form().getByLabel('Day 7 points').fill('15');
    await h.form().getByLabel('Grace period').click();
    await h.send();
    await h.page
      .getByText(/This operation differs from the prior attempt/)
      .waitFor();
    assert.equal(h.requests.length, 1);
    await h.form().getByLabel('Grace period').check();
    h.respond(200, {
      ...weeklyState,
      version: 4,
      revision: 3,
      draftRevision: 3,
    });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    assert.deepEqual(h.requests[1], original);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('weekly verified success rejects substituted schedule or grace and retains the operation', async (t) => {
  const weekly = {
    ...terms,
    dailyPoints: 5,
    weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
    graceEnabled: false,
  };
  for (const [name, changed] of [
    [
      'substituted weekly award',
      { ...weekly, weeklyPoints: [5, 7, 9, 10, 11, 13, 16] },
    ],
    ['substituted grace setting', { ...weekly, graceEnabled: true }],
  ] as const)
    await t.test(name, async () => {
      const h = await mounted();
      try {
        await h.reload({ ...state, terms: weekly });
        await h.form().getByLabel('Private context').waitFor();
        await h.fillPrivate();
        h.respond(200, { ...state, version: 4, paused: true, terms: changed });
        h.page.once('dialog', (dialog) => dialog.accept());
        await h.send('Pause earning');
        await h.page.getByText(/result could not be verified/).waitFor();
        assert.equal(h.requests.length, 1);
        assert.ok(
          await h.page.evaluate(() =>
            Object.keys(sessionStorage).some((key) => key.endsWith(':intent')),
          ),
        );
      } finally {
        await h.browser.close();
      }
    });
});

void test('weekly corrupt retained disabled defaults cannot bypass schedule validation', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.loseResponse();
    await h.send();
    await h.page.getByRole('alert').waitFor();
    await h.page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((key) =>
        key.endsWith(':intent'),
      )!;
      const retained = JSON.parse(sessionStorage.getItem(key)!);
      retained.expectedTerms = {
        ...retained.expectedTerms,
        enabled: false,
        startsAt: null,
        endsAt: null,
        dailyBudgetPoints: null,
        lifetimeBudgetPoints: null,
        weeklyPoints: [5, 7],
        graceEnabled: false,
      };
      sessionStorage.setItem(key, JSON.stringify(retained));
    });
    await h.reload();
    await h.page.getByText(/prior operation metadata is invalid/).waitFor();
    await h.fillPrivate();
    await h.send();
    assert.equal(h.requests.length, 1);
  } finally {
    await h.browser.close();
  }
});

void test('mounted admin lifecycle exposes private accounting, finite terms, locked denomination and configured keyboard submission', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.page
      .getByText('Administrative version: 3', { exact: true })
      .waitFor();
    await h.page
      .getByText('Live financial revision: 1', { exact: true })
      .waitFor();
    await h.page
      .getByText('Draft financial revision: 2', { exact: true })
      .waitFor();
    await h.page
      .getByText(/Outstanding liability:.*50 remaining points/)
      .waitFor();
    await h.page
      .getByText(/Maximum budget exposure:.*50 remaining points/)
      .waitFor();
    assert.equal(
      await h.form().getByLabel('Points per block').getAttribute('readonly'),
      '',
    );
    assert.equal(
      await h
        .form()
        .getByLabel('Credit per block (NPR)')
        .getAttribute('readonly'),
      '',
    );
    await h.fillPrivate();
    await h.form().getByLabel('Daily points').fill('11');
    h.respond(200, {
      ...state,
      version: 4,
      revision: 3,
      draftRevision: 3,
      terms: { ...terms, dailyPoints: 11 },
    });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    assert.equal(h.requests.length, 1);
    assert.deepEqual(
      Object.keys(h.requests[0]).sort(),
      [
        'action',
        'customAnswers',
        'expectedVersion',
        'formVersion',
        'reason',
        'requestId',
        'terms',
      ].sort(),
    );
    assert.equal(h.requests[0].expectedVersion, 3);
    assert.equal(h.requests[0].action, 'draft');
    assert.deepEqual(h.requests[0].terms, { ...terms, dailyPoints: 11 });
    assert.equal(
      await h.page.evaluate(
        () =>
          (window as unknown as { routerRefreshCount: number })
            .routerRefreshCount,
      ),
      1,
    );
    assert.deepEqual(h.requests[0].customAnswers, [
      { fieldId: 'context_note', value: 'Private evidence' },
    ]);
    await h.fillPrivate();
    h.page.once('dialog', (dialog) => dialog.dismiss());
    await h.send('Publish draft');
    assert.equal(h.requests.length, 1);
    assert.equal(
      await h.page.evaluate(
        () =>
          (window as unknown as { routerRefreshCount: number })
            .routerRefreshCount,
      ),
      1,
    );
    h.page.once('dialog', (dialog) => dialog.accept());
    h.respond(200, {
      ...state,
      version: 5,
      revision: 3,
      publishedRevision: 3,
      draftRevision: null,
      terms: { ...terms, dailyPoints: 11 },
    });
    await h.send('Publish draft');
    await h.page
      .getByText('Earning terms published.', { exact: true })
      .waitFor();
    assert.equal(h.requests[1].action, 'publish');
    assert.equal(h.requests[1].terms, undefined);
    assert.equal(
      await h.page.evaluate(
        () =>
          (window as unknown as { routerRefreshCount: number })
            .routerRefreshCount,
      ),
      2,
    );
    await h.fillPrivate();
    h.page.once('dialog', (dialog) => dialog.accept());
    h.respond(200, {
      ...state,
      version: 6,
      revision: 3,
      publishedRevision: 3,
      draftRevision: null,
      paused: true,
      terms: { ...terms, dailyPoints: 11 },
    });
    await h.send('Pause earning');
    await h.page
      .getByText('Earning paused. Existing points remain redeemable.', {
        exact: true,
      })
      .waitFor();
    assert.equal(h.requests[2].action, 'pause');
    assert.equal(
      await h.page.evaluate(
        () =>
          (window as unknown as { routerRefreshCount: number })
            .routerRefreshCount,
      ),
      3,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('ordinary admins do not mount configured controls or private accounting', async () => {
  const h = await mounted('admin');
  try {
    await h.page.getByRole('alert').waitFor();
    assert.equal(h.reads.length, 0);
    assert.equal(await h.form().count(), 0);
  } finally {
    await h.browser.close();
  }
});
void test('mounted terms reject nonfinite budgets and reversed dates without submission', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    await h
      .form()
      .getByLabel('Lifetime budget (points)')
      .fill('100000000000000000000');
    await h.send();
    await h.page
      .getByRole('alert')
      .getByText(/finite|safe|budget/i)
      .waitFor();
    assert.equal(h.requests.length, 0);
    assert.equal(
      await h.page
        .getByRole('alert')
        .evaluate((el) => document.activeElement === el),
      true,
    );
    await h.form().getByLabel('Lifetime budget (points)').fill('1050');
    await h
      .form()
      .getByLabel('Earning end (Nepal time)')
      .fill('1970-01-01T05:45');
    await h.send();
    await h.page
      .getByRole('alert')
      .getByText(/dates|end/i)
      .waitFor();
    assert.equal(h.requests.length, 0);
  } finally {
    await h.browser.close();
  }
});

void test('uncertain draft retries restore exact owner-scoped terms and versions through reload, stale forms, errors and explicit reset', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    await h.form().getByLabel('Daily points').fill('11');
    h.loseResponse();
    await h.send();
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0];
    const storage = await h.page.evaluate(() =>
      Object.values(sessionStorage).join(' '),
    );
    assert.equal(storage.includes('Private reviewed reason'), false);
    assert.equal(storage.includes('Private evidence'), false);
    assert.match(storage, /"digest":"[0-9a-f]{64}"/);
    h.configVersion(2);
    await h.reload({
      ...state,
      version: 8,
      revision: 4,
      draftRevision: 4,
      terms: { ...terms, dailyPoints: 50 },
      paused: true,
    });
    await h.form().getByLabel('Private context').waitFor();
    assert.equal(await h.form().getByLabel('Daily points').inputValue(), '11');
    await h.fillPrivate();
    h.respond(409, { error: 'Updated form', code: 'stale_version' });
    await h.send();
    await h.page.getByText('Updated form', { exact: true }).waitFor();
    assert.deepEqual(h.requests[1], original);
    await h
      .form()
      .getByRole('button', { name: 'Refresh form', exact: true })
      .click();
    await h.page.waitForFunction(
      () =>
        !document
          .querySelector('button[value="draft"]')
          ?.hasAttribute('disabled'),
    );
    h.respond(400, { error: 'Invalid fixture' });
    await h.send();
    await h.page.getByText('Invalid fixture', { exact: true }).waitFor();
    assert.deepEqual(h.requests[2], original);
    await h.fillPrivate('Changed private reason');
    await h.send();
    await h.page.getByText(/differs from the prior attempt/).waitFor();
    assert.equal(h.requests.length, 3);
    await h.fillPrivate();
    h.respond(200, {
      ...state,
      version: 4,
      revision: 3,
      draftRevision: 3,
      terms: { ...terms, dailyPoints: 11 },
      liability: { ...state.liability, remainingPoints: 0 },
    });
    await h.send();
    await h.page.getByText(/result could not be verified/).waitFor();
    assert.equal(h.requests[3].requestId, original.requestId);
    h.page.once('dialog', (dialog) => dialog.dismiss());
    await h
      .form()
      .getByRole('button', { name: 'Start a new attempt', exact: true })
      .click();
    h.respond(409, { error: 'Settings changed', code: 'stale' });
    await h.send();
    assert.deepEqual(h.requests[4], original);
    h.respond(200, {
      ...state,
      version: 4,
      revision: 3,
      draftRevision: 3,
      terms: { ...terms, dailyPoints: 11 },
    });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    assert.deepEqual(h.requests[5], original);
    assert.equal(
      await h.page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.includes('staff.loyalty-settings:staff-a:settings'),
          ).length,
      ),
      0,
    );
    await h.page
      .getByText('Administrative version: 8', { exact: true })
      .waitFor();
    await h.fillPrivate();
    h.respond(503, { error: 'Uncertain fixture result' });
    await h.send();
    await h.page
      .getByText('Uncertain fixture result', { exact: true })
      .waitFor();
    assert.notEqual(h.requests[6].requestId, original.requestId);
    h.page.once('dialog', (dialog) => dialog.accept());
    await h
      .form()
      .getByRole('button', { name: 'Start a new attempt', exact: true })
      .click();
    await h.page.waitForFunction(
      () =>
        !document
          .querySelector('button[value="draft"]')
          ?.hasAttribute('disabled'),
    );
    await h.send();
    await h.page
      .getByText('Uncertain fixture result', { exact: true })
      .waitFor();
    assert.notEqual(h.requests[7].requestId, h.requests[6].requestId);
    assert.equal(h.requests[7].expectedVersion, 8);
    await h.reload(state, 'staff-b');
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    await h.send();
    await h.page
      .getByText('Uncertain fixture result', { exact: true })
      .waitFor();
    assert.equal(h.requests[8].expectedVersion, 3);
    assert.notEqual(h.requests[8].requestId, h.requests[7].requestId);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('pending hash and request reject duplicate keyboard actions; superseded reads and unmount cannot replace mutation results', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.holdReads();
    await h.page
      .getByRole('button', { name: 'Review latest settings', exact: true })
      .click();
    await h.page.waitForFunction(() =>
      document.body.textContent?.includes('Loading latest settings'),
    );
    await h.page.evaluate(() => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      (window as unknown as { releaseDigest: () => void }).releaseDigest =
        release;
      crypto.subtle.digest = async (algorithm, data) => {
        await gate;
        return original(algorithm, data);
      };
    });
    await h.page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>(
        'form[data-form-id="staff.loyalty-settings"]',
      )!;
      const button = form.querySelector<HTMLButtonElement>(
        'button[value="draft"]',
      )!;
      form.requestSubmit(button);
      form.requestSubmit(button);
    });
    await h.page.waitForFunction(
      () =>
        typeof (window as unknown as { releaseDigest: unknown })
          .releaseDigest === 'function',
    );
    assert.equal(h.requests.length, 0);
    assert.equal(
      await h
        .form()
        .getByRole('button', { name: 'Save draft', exact: true })
        .isDisabled(),
      true,
    );
    h.holdPosts();
    await h.page.evaluate(() =>
      (window as unknown as { releaseDigest: () => void }).releaseDigest(),
    );
    await h.page.waitForFunction(() =>
      document.body.textContent?.includes('Retained draft attempt'),
    );
    assert.equal(h.requests.length, 1);
    assert.equal(
      await h
        .form()
        .getByRole('button', { name: 'Pause earning', exact: true })
        .isDisabled(),
      true,
    );
    await finish(h.heldPosts[0], 200, {
      ...state,
      version: 4,
      revision: 3,
      draftRevision: 3,
    });
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    await finish(h.heldReads[0], 503, { error: 'Obsolete failed read' });
    await h.page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await h.page
      .getByText('Administrative version: 4', { exact: true })
      .waitFor();
    assert.equal(await h.page.getByRole('alert').count(), 0);
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Review latest settings', exact: true })
        .isEnabled(),
      true,
    );
    await h.page
      .getByRole('button', { name: 'Review latest settings', exact: true })
      .click();
    await h.page.waitForFunction(() =>
      document.body.textContent?.includes('Loading latest settings'),
    );
    await h.page.evaluate(() =>
      (window as unknown as { unmountFixture: () => void }).unmountFixture(),
    );
    await finish(h.heldReads[1], 200, { ...state, version: 20 });
    await h.page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    assert.equal(await h.form().count(), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('retained publish remains retryable after draft disappears and malformed lifecycle success cannot clear it', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.page.once('dialog', (dialog) => dialog.accept());
    h.loseResponse();
    await h.send('Publish draft');
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0];
    await h.reload({
      ...state,
      version: 5,
      revision: 2,
      publishedRevision: 2,
      draftRevision: null,
      paused: true,
    });
    await h.form().getByLabel('Private context').waitFor();
    assert.equal(
      await h
        .form()
        .getByRole('button', { name: 'Publish draft', exact: true })
        .isEnabled(),
      true,
    );
    await h.fillPrivate();
    h.page.once('dialog', (dialog) => dialog.accept());
    h.respond(200, {
      ...state,
      version: 4,
      revision: 2,
      publishedRevision: 2,
      draftRevision: null,
      paused: true,
    });
    await h.send('Publish draft');
    await h.page.getByText(/result could not be verified/).waitFor();
    assert.deepEqual(h.requests[1], original);
    h.page.once('dialog', (dialog) => dialog.accept());
    h.respond(200, {
      ...state,
      version: 4,
      revision: 2,
      publishedRevision: 2,
      draftRevision: null,
    });
    await h.send('Publish draft');
    await h.page
      .getByText('Earning terms published.', { exact: true })
      .waitFor();
    assert.deepEqual(h.requests[2], original);
    assert.equal(
      await h.page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.includes('staff.loyalty-settings:staff-a:settings'),
          ).length,
      ),
      0,
    );
  } finally {
    await h.browser.close();
  }
});

void test('valid-looking pause response with changed financial terms does not clear the original attempt', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.respond(200, {
      ...state,
      version: 4,
      paused: true,
      terms: { ...terms, dailyPoints: 25 },
    });
    h.page.once('dialog', (dialog) => dialog.accept());
    await h.send('Pause earning');
    await h.page.getByText(/result could not be verified/).waitFor();
    assert.equal(h.requests.length, 1);
    assert.ok(
      await h.page.evaluate(() =>
        Object.keys(sessionStorage).some((key) => key.endsWith(':intent')),
      ),
    );
  } finally {
    await h.browser.close();
  }
});
void test('missing opaque reference fails closed after reload until an explicit reset', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.loseResponse();
    await h.send();
    await h.page.getByRole('alert').waitFor();
    await h.page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((key) =>
        key.endsWith(':intent'),
      )!;
      sessionStorage.removeItem(key.slice(0, -7));
    });
    await h.reload();
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    await h.send();
    await h.page.getByText(/prior operation metadata is invalid/).waitFor();
    assert.equal(h.requests.length, 1);
  } finally {
    await h.browser.close();
  }
});

void test('retained settings hydrate with the server snapshot before restoring original draft terms', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    await h.form().getByLabel('Daily points').fill('11');
    h.loseResponse();
    await h.send();
    await h.page.getByRole('alert').waitFor();
    await h.reload(
      {
        ...state,
        version: 8,
        revision: 4,
        draftRevision: 4,
        terms: { ...terms, dailyPoints: 50 },
      },
      'staff-a',
      true,
    );
    await h.form().getByLabel('Private context').waitFor();
    await h.page
      .getByText(/Retained draft attempt at administrative version 3/)
      .waitFor();
    assert.equal(await h.form().getByLabel('Daily points').inputValue(), '11');
    assert.deepEqual(
      await h.page.evaluate(
        () =>
          (window as unknown as { hydrationErrors: string[] }).hydrationErrors,
      ),
      [],
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});
void test('overlapping settings reads preserve newest success and authorized failure focuses the alert without clearing entries', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.holdReads();
    await h.page
      .getByRole('button', { name: 'Review latest settings', exact: true })
      .click();
    await h.page
      .getByRole('button', { name: 'Loading latest settings…', exact: true })
      .click();
    await h.page.waitForFunction(() =>
      document.body.textContent?.includes('Loading latest settings'),
    );
    await finish(h.heldReads[1], 200, {
      ...state,
      version: 8,
      revision: 4,
      draftRevision: 4,
    });
    await h.page
      .getByText('Administrative version: 8', { exact: true })
      .waitFor();
    await finish(h.heldReads[0], 200, state);
    await h.page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await h.page
      .getByText('Administrative version: 8', { exact: true })
      .waitFor();
    assert.equal(
      await h.form().getByLabel('Reason').inputValue(),
      'Private reviewed reason',
    );
    assert.equal(
      await h.form().getByLabel('Private context').inputValue(),
      'Private evidence',
    );
    await h.page
      .getByRole('button', { name: 'Review latest settings', exact: true })
      .click();
    await finish(h.heldReads[2], 403, { error: 'Access removed' });
    await h.page.getByRole('alert').waitFor();
    assert.equal(
      await h.page
        .getByRole('alert')
        .evaluate((el) => document.activeElement === el),
      true,
    );
    assert.equal(
      await h.form().getByLabel('Private context').inputValue(),
      'Private evidence',
    );
    await h.page
      .getByText('Administrative version: 8', { exact: true })
      .waitFor();
    assert.equal(
      await h.page
        .getByRole('button', { name: 'Review latest settings', exact: true })
        .isEnabled(),
      true,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('disabled initial revision zero accepts a finite first draft while earning stays unpublished', async () => {
  const h = await mounted();
  try {
    const disabled: LoyaltyState = {
      ...state,
      version: 1,
      revision: 0,
      publishedRevision: 0,
      draftRevision: null,
      rateLocked: false,
      lockedDenomination: null,
      issuedPoints: 0,
      redeemedPoints: 0,
      outstandingPoints: 0,
      issuedTodayPoints: 0,
      creditedPaisa: 0,
      liability: { wholeBlocks: 0, creditPaisa: 0, remainingPoints: 0 },
      maximumLiability: null,
      terms: {
        ...terms,
        enabled: false,
        startsAt: null,
        endsAt: null,
        dailyBudgetPoints: null,
        lifetimeBudgetPoints: null,
      },
    };
    await h.reload(disabled);
    await h.form().getByLabel('Private context').waitFor();
    assert.equal(
      await h
        .form()
        .getByRole('button', { name: 'Publish draft', exact: true })
        .isDisabled(),
      true,
    );
    await h.fillPrivate();
    await h
      .form()
      .getByLabel('Earning start (Nepal time)')
      .fill('2026-09-28T05:45');
    await h
      .form()
      .getByLabel('Earning end (Nepal time)')
      .fill('2026-09-29T05:45');
    await h.form().getByLabel('Daily budget (points)').fill('100');
    await h.form().getByLabel('Lifetime budget (points)').fill('1050');
    const finite = {
      ...terms,
      enabled: false,
      startsAt: Date.parse('2026-09-28T00:00Z'),
      endsAt: Date.parse('2026-09-29T00:00Z'),
    };
    h.respond(200, {
      ...disabled,
      version: 2,
      revision: 1,
      draftRevision: 1,
      terms: finite,
      maximumLiability: state.maximumLiability,
    });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    await h.page
      .getByText('Live financial revision: 0', { exact: true })
      .waitFor();
    assert.equal(h.requests[0].expectedVersion, 1);
    assert.equal((h.requests[0].terms as { enabled: boolean }).enabled, false);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.browser.close();
  }
});

void test('true locked denomination stays distinct from an incompatible immutable draft; saving a corrected draft permits publish', async () => {
  const h = await mounted();
  try {
    const incompatible = {
      ...state,
      terms: { ...terms, pointsPerBlock: 200, creditPaisaPerBlock: 3000 },
    };
    await h.reload(incompatible);
    await h.form().getByLabel('Private context').waitFor();
    await h.page
      .getByText(/Locked exchange denomination: 100 points/)
      .waitFor();
    await h.page.getByText(/Saved draft denomination: 200 points/).waitFor();
    await h.page
      .getByText(/Save a corrected draft before publishing/)
      .waitFor();
    assert.equal(
      await h
        .form()
        .getByRole('button', { name: 'Publish draft', exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await h.form().getByLabel('Points per block').inputValue(),
      '100',
    );
    assert.equal(
      await h.form().getByLabel('Credit per block (NPR)').inputValue(),
      '10.00',
    );
    h.holdReads();
    await h.page
      .getByRole('button', { name: 'Review latest settings', exact: true })
      .click();
    await finish(h.heldReads[0], 200, { ...incompatible, version: 8 });
    await h.page
      .getByText('Administrative version: 8', { exact: true })
      .waitFor();
    assert.equal(await h.page.getByRole('alert').count(), 0);
    await h.fillPrivate();
    h.respond(200, { ...state, version: 9, revision: 3, draftRevision: 3 });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    assert.equal(h.requests[0].expectedVersion, 8);
    assert.deepEqual(h.requests[0].terms, terms);
    assert.equal(
      await h
        .form()
        .getByRole('button', { name: 'Publish draft', exact: true })
        .isEnabled(),
      true,
    );
    assert.equal(
      await h.page
        .getByText(/Save a corrected draft before publishing/)
        .count(),
      0,
    );
  } finally {
    await h.browser.close();
  }
});
void test('uncertain pre-issuance draft preserves original denomination B through a newly locked denomination A', async () => {
  const h = await mounted();
  try {
    const denominationB = {
      ...terms,
      pointsPerBlock: 200,
      creditPaisaPerBlock: 3000,
    };
    const before: LoyaltyState = {
      ...state,
      rateLocked: false,
      lockedDenomination: null,
      issuedPoints: 0,
      redeemedPoints: 0,
      outstandingPoints: 0,
      issuedTodayPoints: 0,
      creditedPaisa: 0,
      terms: denominationB,
      liability: { wholeBlocks: 0, creditPaisa: 0, remainingPoints: 0 },
      maximumLiability: {
        wholeBlocks: 5,
        creditPaisa: 15000,
        remainingPoints: 50,
      },
    };
    await h.reload(before);
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.loseResponse();
    await h.send();
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0];
    await h.reload({ ...state, version: 8, terms: denominationB });
    await h.form().getByLabel('Private context').waitFor();
    assert.equal(
      await h.form().getByLabel('Points per block').inputValue(),
      '200',
    );
    assert.equal(
      await h.form().getByLabel('Credit per block (NPR)').inputValue(),
      '30.00',
    );
    await h.page
      .getByText(/Locked exchange denomination: 100 points/)
      .waitFor();
    await h.fillPrivate();
    h.respond(200, { ...before, version: 4, revision: 3, draftRevision: 3 });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    assert.deepEqual(h.requests[1], original);
    await h.page
      .getByText('Administrative version: 8', { exact: true })
      .waitFor();
    assert.equal(
      await h.form().getByLabel('Points per block').inputValue(),
      '100',
    );
    assert.equal(
      await h.form().getByLabel('Credit per block (NPR)').inputValue(),
      '10.00',
    );
    assert.equal(
      await h.page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.includes('staff.loyalty-settings:staff-a:settings'),
          ).length,
      ),
      0,
    );
  } finally {
    await h.browser.close();
  }
});

void test('finite incompatible draft exposure overflow remains readable and requires a bounded corrected budget', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    h.holdReads();
    await h.page
      .getByRole('button', { name: 'Review latest settings', exact: true })
      .click();
    const unsafe = {
      ...state,
      version: 8,
      terms: {
        ...terms,
        pointsPerBlock: 1000,
        lifetimeBudgetPoints: Number.MAX_SAFE_INTEGER,
      },
      maximumLiability: null,
    };
    await finish(h.heldReads[0], 200, unsafe);
    await h.page
      .getByText('Administrative version: 8', { exact: true })
      .waitFor();
    await h.page.getByText(/Reduce the draft lifetime budget/).waitFor();
    assert.equal(await h.page.getByRole('alert').count(), 0);
    assert.equal(
      await h
        .form()
        .getByRole('button', { name: 'Publish draft', exact: true })
        .isDisabled(),
      true,
    );
    await h.fillPrivate();
    await h.send();
    await h.page
      .getByRole('alert')
      .getByText(/budget exposure|supported integer/i)
      .waitFor();
    assert.equal(h.requests.length, 0);
    await h.form().getByLabel('Lifetime budget (points)').fill('1050');
    h.respond(200, { ...state, version: 9, revision: 3, draftRevision: 3 });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    assert.deepEqual(h.requests[0].terms, terms);
    assert.equal(
      await h
        .form()
        .getByRole('button', { name: 'Publish draft', exact: true })
        .isEnabled(),
      true,
    );
  } finally {
    await h.browser.close();
  }
});
void test('removed required question is restored for the original private exact retry and current questions appear only after verified success', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate(
      'Sensitive original staff reason',
      'Sensitive original answer',
    );
    h.loseResponse();
    await h.send();
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0];
    h.replaceQuestion();
    await h.reload({ ...state, version: 8 });
    await h.form().getByLabel('Private context').waitFor();
    assert.equal(await h.form().getByLabel('Replacement context').count(), 0);
    await h.fillPrivate(
      'Sensitive original staff reason',
      'Sensitive original answer',
    );
    await h
      .form()
      .getByRole('button', { name: 'Refresh form', exact: true })
      .click();
    await h.page.waitForFunction(
      () =>
        !document
          .querySelector('button[value="draft"]')
          ?.hasAttribute('disabled'),
    );
    assert.equal(await h.form().getByLabel('Replacement context').count(), 0);
    const stored = await h.page.evaluate(() =>
      Object.values(sessionStorage).join(' '),
    );
    assert.equal(stored.includes('Sensitive original staff reason'), false);
    assert.equal(stored.includes('Sensitive original answer'), false);
    const schema = await h.page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((key) =>
        key.endsWith(':intent'),
      )!;
      return JSON.parse(sessionStorage.getItem(key)!).originalConfig;
    });
    assert.equal(schema.version, 1);
    assert.equal(schema.fields[0].id, 'context_note');
    assert.equal(Object.hasOwn(schema.fields[0], 'value'), false);
    assert.equal(Object.hasOwn(schema, 'answers'), false);
    h.respond(200, { ...state, version: 4, revision: 3, draftRevision: 3 });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    assert.deepEqual(h.requests[1], original);
    assert.equal(h.requests[1].formVersion, 1);
    assert.equal(h.requests[1].expectedVersion, 3);
    await h.form().getByLabel('Replacement context').waitFor();
    assert.equal(await h.form().getByLabel('Private context').count(), 0);
    assert.equal(
      await h.form().getByLabel('Replacement context').inputValue(),
      '',
    );
    assert.equal(
      await h.page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.includes('staff.loyalty-settings:staff-a:settings'),
          ).length,
      ),
      0,
    );
  } finally {
    await h.browser.close();
  }
});

void test('missing, corrupt and oversized original question metadata fail closed without a fresh request or private default values', async () => {
  const h = await mounted();
  try {
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.loseResponse();
    await h.send();
    await h.page.getByRole('alert').waitFor();
    const original = h.requests[0];
    const saved = await h.page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((key) =>
        key.endsWith(':intent'),
      )!;
      return { key, value: sessionStorage.getItem(key)! };
    });
    for (const mode of [
      'missing',
      'private-default',
      'too-many',
      'oversized',
    ]) {
      await h.page.evaluate(
        ({ saved, mode }) => {
          const metadata = JSON.parse(saved.value);
          if (mode === 'missing') delete metadata.originalConfig;
          if (mode === 'private-default')
            metadata.originalConfig.fields[0].value = 'Injected private answer';
          if (mode === 'too-many')
            metadata.originalConfig.fields = Array.from(
              { length: 65 },
              (_, i) => ({
                ...metadata.originalConfig.fields[0],
                id: 'context_' + i,
                key: 'context_' + i,
                order: i,
              }),
            );
          sessionStorage.setItem(
            saved.key,
            mode === 'oversized'
              ? saved.value + ' '.repeat(70000)
              : JSON.stringify(metadata),
          );
        },
        { saved, mode },
      );
      await h.reload();
      await h.form().getByLabel('Private context').waitFor();
      await h.page
        .getByRole('alert')
        .getByText(/prior operation metadata is invalid/)
        .waitFor();
      assert.equal(
        await h.page.getByText('Injected private answer').count(),
        0,
      );
      await h.fillPrivate();
      await h.send();
      assert.equal(h.requests.length, 1);
    }
    await h.page.evaluate(
      (saved) => sessionStorage.setItem(saved.key, saved.value),
      saved,
    );
    await h.reload();
    await h.form().getByLabel('Private context').waitFor();
    await h.fillPrivate();
    h.respond(200, { ...state, version: 4, revision: 3, draftRevision: 3 });
    await h.send();
    await h.page
      .getByText('Draft saved. Review and publish separately.', { exact: true })
      .waitFor();
    assert.deepEqual(h.requests[1], original);
  } finally {
    await h.browser.close();
  }
});
