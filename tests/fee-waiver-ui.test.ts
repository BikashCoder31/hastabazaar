import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { FORM_REGISTRY } from '../lib/forms/registry';
import {
  feeWaiverFixture,
  feeWaiverContext,
} from './helpers/fee-waiver-fixture';
import {
  getCustomerFeeWaiverState as getFeeWaiverState,
  mutateCustomerFeeWaiver as mutateFeeWaiver,
} from '../lib/db/repositories/customer-fee-waivers';
import { FeeWaiverError } from '../lib/marketplace/fee-waivers';
import { presentFeeWaiverState } from '../lib/marketplace/fee-waiver-presentation';
import { readCommercialOutcome } from '../lib/admin/commercial-outcome';
import { sessionAttemptKey } from '../lib/forms/client-attempt';
import { ACTOR_INTENT_HEADER } from '../lib/http/actor-intent';
import type { FixturePage, FixtureRoute } from './helpers/browser-fixture-types';

void test('campaign controls have a protected page, navigation and fixed feature-managed contract', () => {
  assert.ok(
    existsSync('app/admin/fee-waivers/page.tsx'),
    'Super Admin campaign page exists',
  );
  const form = FORM_REGISTRY['staff.fee-waivers'];
  assert.ok(form);
  assert.equal(form.audience, 'super_admin');
  assert.equal(form.capabilities.answerBehavior, 'none');
  assert.deepEqual(form.capabilities.customFieldTypes, []);
  const nav = readFileSync('lib/admin/navigation.ts', 'utf8');
  assert.match(nav, /href: '\/admin\/fee-waivers'/);
});

void test('mobile keyboard editor persists Nepal schedule, pause/resume/end, overlaps, exact dates and conflict refresh', async (t) => {
  assert.ok(
    existsSync('components/admin/fee-waiver-manager.tsx'),
    'Campaign manager exists',
  );
  const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  );
  const f = await feeWaiverFixture();
  t.after(() => f.dispose());
  const now = Date.now();
  const festivalYear = new Date(now).getUTCFullYear() + 2;
  const reason = 'Review these fictional customer fee waiver terms.';
  const actorId = 'owner';
  const terms = {
    name: 'First launch',
    description: 'Fictional Registered Sellers',
    startsAt: Math.floor(now / 60000) * 60000 - 58766,
    endsAt: now + 86400000,
  };
  const first = await mutateFeeWaiver(
    f.database,
    feeWaiverContext('ui-create-first', 0, { now }),
    { type: 'create', terms },
  );
  await mutateFeeWaiver(
    f.database,
    feeWaiverContext('ui-publish-first', 1, { now }),
    { type: 'publish', campaignId: first.id },
  );
  const second = await mutateFeeWaiver(
    f.database,
    feeWaiverContext('ui-create-second', 2, { now }),
    {
      type: 'create',
      terms: { ...terms, name: 'Second launch', startsAt: terms.startsAt + 1 },
    },
  );
  await mutateFeeWaiver(
    f.database,
    feeWaiverContext('ui-publish-second', 3, { now }),
    { type: 'publish', campaignId: second.id },
  );
  async function routeState(at: number) {
    return {
      feeTarget: 'customer_service_fee' as const,
      ...presentFeeWaiverState(await getFeeWaiverState(f.database), at),
    };
  }
  const initialState = await routeState(now);
  const globals = readFileSync('app/globals.css', 'utf8');
  const tailwindImport = "@import 'tailwindcss';";
  assert.ok(globals.includes(tailwindImport), 'Fixture stylesheet has an explicit Tailwind import');
  const scopedCss = globals.replace(tailwindImport, [
    "@import 'tailwindcss' source(none);",
    "@source '../components/admin/fee-waiver-manager.tsx';",
    "@source '../components/admin/commercial-recovery.tsx';",
    "@source '../components/admin/finance-access-notice.tsx';",
    "@source '../components/ui/button.tsx';",
  ].join('\n'));
  const [compiled, styles] = await Promise.all([
    build({
      stdin: {
        resolveDir: process.cwd(),
        loader: 'tsx',
        contents:
          "import React from 'react';import {createRoot} from 'react-dom/client';import {FeeWaiverManager} from './components/admin/fee-waiver-manager';createRoot(document.getElementById('root')).render(<FeeWaiverManager actorId={" + JSON.stringify(actorId) + "} initialState={" +
          JSON.stringify(initialState) +
          '}/>);',
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [{
        name: 'isolated-router',
        setup(builder) {
          builder.onResolve({ filter: /^next\/navigation$/ }, ({ path }) => ({
            path,
            namespace: 'router-fixture',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'router-fixture' }, () => ({
            loader: 'js',
            contents: 'export const useRouter = () => ({ refresh() {} });',
          }));
        },
      }],
    }),
    postcss([tailwind()]).process(scopedCss, {
      from: resolve('app/globals.css'),
    }),
  ]);
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  try {
    const nativePage = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    type Route = Omit<FixtureRoute, 'request'> & {
      request(): ReturnType<FixtureRoute['request']> & { headers(): Record<string, string> };
    };
    const page = nativePage as Omit<FixturePage, 'route'> & {
      route(pattern: string, handler: (route: Route) => Promise<void>): Promise<void>;
    };
    const errors: string[] = [];
    const expectedConflicts: string[] = [];
    const expectedRecoveryFailures: string[] = [];
    nativePage.on('pageerror', (error: Error) => errors.push(error.message));
    nativePage.on('console', (message: { type(): string; text(): string }) => {
      if (message.type() === 'error') {
        if (message.text().includes('409 (Conflict)'))
          expectedConflicts.push(message.text());
        else if (/403 \(Forbidden\)|503 \(Service Unavailable\)|net::ERR_FAILED/.test(message.text()))
          expectedRecoveryFailures.push(message.text());
        else errors.push(message.text());
      }
    });
    const posts: Record<string, unknown>[] = [];
    let competing = false;
    let lookupMode: 'malformed' | 'denied' | 'native' = 'native';
    let refreshMode: 'failure' | 'denied' | 'malformed' | 'changed-reference' | 'late-commit' | 'native' = 'native';
    let loseOriginalResponse = false;
    async function writeCampaign(body: Record<string, unknown>) {
      return mutateFeeWaiver(
        f.database,
        feeWaiverContext(String(body.requestId), Number(body.expectedRevision), {
          now: Date.now(), actorId, authSubject: actorId, reason: String(body.reason),
        }),
        body.command as Parameters<typeof mutateFeeWaiver>[2],
      );
    }
    const checkedReferences: string[] = [];
    const attemptKey = sessionAttemptKey('staff.fee-waivers', actorId + ':campaigns');
    const replacementReference = 'a0000000-0000-4000-8000-000000000001';
    const reference = () => page.evaluate(key => sessionStorage.getItem(key), attemptKey);
    await page.route('**/*', async (route: Route) => {
      const r = route.request();
      const url = new URL(r.url());
      if (url.origin === 'https://waiver.test' && url.pathname === '/api/admin/commercial-outcomes' && r.method() === 'GET') {
        assert.equal(r.headers()[ACTOR_INTENT_HEADER.toLowerCase()], actorId);
        assert.equal(url.searchParams.size, 2);
        assert.equal(url.searchParams.get('kind'), 'waiver');
        const attempt = url.searchParams.get('attempt')!;
        checkedReferences.push(attempt);
        const result = lookupMode === 'denied'
          ? { status: 403, body: { error: 'Fictional original actor access denied.' } }
          : lookupMode === 'malformed'
            ? { status: 200, body: { outcome: { requestId: 'another-reference' } } }
            : { status: 200, body: { outcome: await readCommercialOutcome(f.database, { id: actorId, authSubject: actorId }, 'waiver', attempt) } };
        return route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) });
      }
      if (url.href === 'https://waiver.test/api/admin/customer-fee-waivers') {
        assert.equal(r.headers()[ACTOR_INTENT_HEADER.toLowerCase()], actorId);
        if (r.method() === 'POST') {
          const body = JSON.parse(r.postData()!);
          posts.push(body);
          if (loseOriginalResponse) {
            loseOriginalResponse = false;
            return route.abort();
          }
          if (competing) {
            competing = false;
            const state = await getFeeWaiverState(f.database);
            await mutateFeeWaiver(
              f.database,
              feeWaiverContext('ui-competing', state.revision, {
                now: Date.now(),
              }),
              { type: 'create', terms: { ...terms, name: 'Competing draft' } },
            );
          }
          try {
            const campaign = await writeCampaign(body);
            return route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify({ campaign }),
            });
          } catch (error) {
            assert.ok(error instanceof FeeWaiverError);
            return route.fulfill({
              status: error.code === 'stale' ? 409 : 422,
              contentType: 'application/json',
              body: JSON.stringify({ error: error.message, code: error.code }),
            });
          }
        }
        if (r.method() !== 'GET') return route.abort();
        if (refreshMode === 'failure') {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Fictional source refresh failure.' }),
          });
        }
        if (refreshMode === 'denied') {
          return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Fictional fresh source denied.' }) });
        }
        if (refreshMode === 'malformed') {
          const snapshot = await routeState(Date.now());
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...snapshot, campaigns: [null] }) });
        }
        if (refreshMode === 'late-commit') {
          refreshMode = 'native';
          await writeCampaign(posts.at(-1)!);
        }
        if (refreshMode === 'changed-reference') {
          await page.evaluate(({ key, value }) => {
            sessionStorage.setItem(key, value);
            window.dispatchEvent(new CustomEvent('hastabazaar:session-reference', { detail: key }));
          }, { key: attemptKey, value: replacementReference });
        }
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(await routeState(Date.now())),
        });
      }
      if (url.href !== 'https://waiver.test/' || r.method() !== 'GET') return route.abort();
      return route.fulfill({
        contentType: 'text/html',
        body:
          '<title>Fee waiver fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
          styles.css +
          '</style><main id="root" style="padding:12px"></main>',
      });
    });
    const auditReason = page.getByLabel('Decision and audit reason');
    async function openReview(action: 'pause' | 'resume' | 'publish' | 'end', name: string, keyboard = false, decisionReason = reason) {
      const count = posts.length;
      const revision = (await getFeeWaiverState(f.database)).revision;
      await auditReason.fill(decisionReason);
      const label = action[0].toUpperCase() + action.slice(1);
      const button = page.getByRole('button', { name: label + ' ' + name, exact: true });
      if (keyboard) await button.press('Enter');
      else await button.click();
      await page.getByRole('heading', { name: 'Review ' + action + ' · ' + name, exact: true }).waitFor();
      await page.getByText('Decision reason: ' + decisionReason, { exact: true }).waitFor();
      await page.getByText(new RegExp('shared source revision ' + revision + '\\.')).waitFor();
      assert.equal(posts.length, count, 'Review opens without writing');
      return page.getByRole('button', { name: 'Confirm reviewed ' + action, exact: true });
    }
    await page.goto('https://waiver.test');
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await page
      .getByText('Pausing this campaign will not stop other active campaigns.')
      .first()
      .waitFor();
    assert.equal(await page.getByText(/Control revision/).count(),0);
    assert.match(
      (await page.getByText(/Applying: First launch/).textContent()) ?? '',
      /2 active/,
    );
    const confirmPause = await openReview('pause', 'First launch', true);
    await page.getByText(/winning campaign after this action would be: Second launch/).waitFor();
    await confirmPause.press('Enter');
    await page.getByRole('button', { name: 'Resume First launch', exact: true }).waitFor();
    assert.equal(posts[0].feeTarget, 'customer_service_fee');
    assert.deepEqual(posts[0].command, { type: 'pause', campaignId: first.id });
    await page.getByText(/Applying: Second launch/).waitFor();
    await (await openReview('resume', 'First launch')).click();
    await page.getByRole('button',{name:'Pause First launch',exact:true}).waitFor();
    await page
      .getByRole('button', { name: 'Edit First launch', exact: true })
      .click();
    await page.getByLabel('Campaign name').fill('First launch edited');
    await auditReason.fill(reason);
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.getByRole('heading',{name:'First launch edited · active',exact:true}).waitFor();
    const revised = (
      posts[2].command as { terms: { startsAt: number; endsAt: number } }
    ).terms;
    assert.equal(
      revised.startsAt,
      terms.startsAt,
      'Editing a name must retain original subminute start',
    );
    assert.equal(revised.endsAt, terms.endsAt);
    await page.getByLabel('Campaign name').fill('Festival');
    await auditReason.fill(reason);
    await page.getByLabel('Starts at (Nepal time)').fill(festivalYear + '-11-01T10:00');
    await page.getByLabel('Ends at (Nepal time)').fill(festivalYear + '-11-02T10:00');
    await page
      .getByRole('button', { name: 'Save draft', exact: true })
      .press('Enter');
    await page.getByRole('heading',{name:'Festival · draft',exact:true}).waitFor();
    assert.equal(
      (posts[3].command as { terms: { startsAt: number } }).terms.startsAt,
      Date.parse(festivalYear + '-11-01T04:15:00Z'),
    );
    await (await openReview('publish', 'Festival')).click();
    await page
      .getByRole('heading', { name: 'Festival · scheduled', exact: true })
      .waitFor();
    await (await openReview('end', 'Festival')).click();
    await page
      .getByRole('heading', { name: 'Festival · ended', exact: true })
      .waitFor();

    // A refreshed global revision must never authorize older, unsaved terms.
    await page.getByRole('button',{name:'Edit First launch edited',exact:true}).click();
    await page.getByLabel('Campaign name').fill('Unsaved stale name');
    f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('staff','super_admin',1)");
    const beforeManualRefresh=await getFeeWaiverState(f.database);
    const competingTerms={
      name:'First launch edited',
      description:'Another operator reviewed these campaign terms.',
      startsAt:terms.startsAt+12567,
      endsAt:terms.endsAt+98765,
    };
    const competingRevision=await mutateFeeWaiver(f.database,feeWaiverContext('ui-manual-refresh-competitor',beforeManualRefresh.revision,{actorId:'staff',authSubject:'staff',now:Date.now()}),{
      type:'revise',campaignId:first.id,terms:competingTerms,
    });
    await page.getByRole('button',{name:'Refresh campaigns',exact:true}).click();
    await page.getByRole('heading',{name:'New campaign',exact:true}).waitFor({timeout:3000});
    await page.getByRole('status').waitFor();
    assert.match(await page.getByRole('status').textContent()??'',/unsaved edit was cleared/i);
    assert.equal(await page.getByLabel('Campaign name').inputValue(),'');
    await auditReason.fill(reason);
    const postCountBeforeEmptySave=posts.length;
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    assert.equal(posts.length,postCountBeforeEmptySave,'An old edit cannot be submitted after manual refresh');
    assert.deepEqual((await getFeeWaiverState(f.database)).campaigns.find(c=>c.id===first.id),competingRevision);

    // Only reopening the refreshed campaign and deliberately editing can revise it.
    await page.getByRole('button',{name:'Edit First launch edited',exact:true}).click();
    assert.equal(await page.getByLabel('Description').inputValue(),competingTerms.description);
    await page.getByLabel('Campaign name').fill('Reviewed current launch');
    await auditReason.fill(reason);
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('heading',{name:'Reviewed current launch · active',exact:true}).waitFor();
    const reviewedCampaign=(await getFeeWaiverState(f.database)).campaigns.find(c=>c.id===first.id)!;
    assert.equal(reviewedCampaign.name,'Reviewed current launch');
    assert.equal(reviewedCampaign.description,competingTerms.description);
    assert.equal(reviewedCampaign.startsAt,competingTerms.startsAt);
    assert.equal(reviewedCampaign.endsAt,competingTerms.endsAt);

    const beforeConflict = await getFeeWaiverState(f.database);
    const confirmCompetingPause = await openReview('pause', 'Second launch');
    competing = true;
    await confirmCompetingPause.click();
    await page.getByRole('alert').waitFor();
    await page
      .getByRole('heading', { name: 'Competing draft · draft', exact: true })
      .waitFor();
    assert.match(
      (await page.getByRole('alert').textContent()) ?? '',
      /draft is retained.*check the original saved outcome/i,
    );
    await page.getByRole('button', { name: 'Check original saved outcome', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Retry unchanged original action', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Confirm reviewed pause', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Save draft', exact: true }).isDisabled(), true);
    const afterConflict = await getFeeWaiverState(f.database);
    assert.equal(afterConflict.revision, beforeConflict.revision + 1, 'Only the competing draft commits');
    assert.deepEqual(afterConflict.campaigns.find(c => c.id === second.id), beforeConflict.campaigns.find(c => c.id === second.id));
    assert.equal(posts.length, 8);
    assert.deepEqual(posts.map(post => post.expectedRevision), [4, 5, 6, 7, 8, 9, 11, 12]);
    for (const post of posts) {
      assert.equal(post.reason, reason);
      assert.equal(post.feeTarget, 'customer_service_fee');
      assert.match(String(post.requestId), /^[a-zA-Z0-9_-]{1,100}$/);
    }
    assert.equal(new Set(posts.map(post => post.requestId)).size, posts.length);
    assert.deepEqual(posts[7].command, { type: 'pause', campaignId: second.id });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    assert.equal(
      expectedConflicts.length,
      1,
      'Only the deliberately exercised stale request reports a network conflict',
    );
    const screenshotDirectory=await mkdtemp(join(tmpdir(),'hastabazaar-customer-fee-ui-'));
    await nativePage.screenshot({
      path: join(screenshotDirectory,'mobile.png'),
      fullPage: true,
    });
    await nativePage.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await nativePage.screenshot({
      path: join(screenshotDirectory,'desktop.png'),
      fullPage: true,
    });

    await t.test('new waiver attempt requires an exact missing outcome and a successful fresh-source review', async () => {
      const check = page.getByRole('button', { name: 'Check original saved outcome', exact: true });
      const start = page.getByRole('button', { name: 'Start a new reviewed attempt', exact: true });
      const original = String(posts[7].requestId);
      assert.equal(await reference(), original);
      assert.equal(await start.count(), 0);

      lookupMode = 'malformed';
      await check.click();
      await page.getByText(/original outcome could not be verified/i).waitFor();
      assert.equal(await start.count(), 0);
      assert.equal(await reference(), original);

      lookupMode = 'denied';
      await check.click();
      await page.getByText(/private controls are hidden/i).waitFor();
      assert.equal(await start.count(), 0);
      assert.equal(await reference(), original);
      assert.equal(posts.length, 8);

      lookupMode = 'native';
      await check.click();
      await start.waitFor();
      assert.equal(await start.isEnabled(), true);
      assert.deepEqual(checkedReferences, [original, original, original]);

      refreshMode = 'failure';
      await start.click();
      await page.getByText('Fictional source refresh failure.', { exact: true }).waitFor();
      assert.equal(await reference(), original);
      assert.equal(await auditReason.isDisabled(), true);

      refreshMode = 'malformed';
      await start.click();
      await page.getByText(/current campaigns could not be verified/i).waitFor();
      assert.equal(await reference(), original);
      assert.equal(await auditReason.isDisabled(), true);

      refreshMode = 'denied';
      await start.click();
      await page.getByText(/private controls are hidden/i).waitFor();
      assert.equal(await reference(), original);
      assert.equal(await start.count(), 0);

      refreshMode = 'native';
      await check.click();
      await start.waitFor();
      lookupMode = 'malformed';
      await start.click();
      await page.getByText(/original outcome could not be verified/i).waitFor();
      assert.equal(await reference(), original);
      assert.equal(await auditReason.isDisabled(), true);

      lookupMode = 'denied';
      await start.click();
      await page.getByText(/private controls are hidden/i).waitFor();
      assert.equal(await reference(), original);
      assert.equal(await start.count(), 0);

      lookupMode = 'native';
      await check.click();
      await start.waitFor();
      refreshMode = 'changed-reference';
      await start.click();
      await page.getByText(/original action reference changed/i).waitFor();
      assert.equal(await reference(), replacementReference);
      assert.equal(await start.count(), 0);
      assert.equal(await auditReason.isDisabled(), true);
      assert.equal(posts.length, 8);

      await page.evaluate(({ key, value }) => {
        sessionStorage.setItem(key, value);
        window.dispatchEvent(new CustomEvent('hastabazaar:session-reference', { detail: key }));
      }, { key: attemptKey, value: original });
      refreshMode = 'native';
      await page.getByRole('button', { name: 'Retry unchanged original action', exact: true }).click();
      await page.getByText(/Campaigns changed. Your draft is retained/i).waitFor();
      assert.deepEqual(posts[8], posts[7], 'The retry uses the exact original ID, command, reason and revision');
      assert.equal(await reference(), original);
      assert.equal(await start.count(), 0);
      assert.equal((await getFeeWaiverState(f.database)).revision, afterConflict.revision);

      await check.click();
      await start.waitFor();
      assert.equal(checkedReferences.at(-1), original);
      await mutateFeeWaiver(
        f.database,
        feeWaiverContext('ui-recovery-competitor', afterConflict.revision, { now: Date.now() }),
        { type: 'create', terms: { ...terms, name: 'Latest recovery draft' } },
      );
      const latest = await getFeeWaiverState(f.database);
      await start.click();
      await page.getByText(/enter a fresh decision reason/i).waitFor();
      await page.getByRole('heading', { name: 'Latest recovery draft · draft', exact: true }).waitFor();
      assert.equal(await reference(), null);
      assert.equal(await auditReason.inputValue(), '');
      assert.deepEqual(checkedReferences.slice(-2), [original, original], 'Recheck the original after refreshing beyond its CAS revision');
      assert.equal(await readCommercialOutcome(f.database, { id: actorId, authSubject: actorId }, 'waiver', original), null);
      assert.equal(await page.getByRole('button', { name: 'Confirm reviewed pause', exact: true }).count(), 0);
      assert.equal(posts.length, 9, 'Starting a review does not write');
      const freshReason = 'Review the updated campaigns after the fictional conflict.';
      const confirmFresh = await openReview('pause', 'Second launch', false, freshReason);
      await confirmFresh.click();
      await page.getByRole('heading', { name: 'Second launch · paused', exact: true }).waitFor();
      assert.equal(posts.length, 10);
      assert.notEqual(posts[9].requestId, original);
      assert.equal(posts[9].expectedRevision, latest.revision);
      assert.equal(posts[9].reason, freshReason);
      assert.deepEqual(posts[9].command, posts[7].command);
      assert.equal(await reference(), null);
      const final = await getFeeWaiverState(f.database);
      assert.equal(final.revision, latest.revision + 1);
      assert.equal(final.campaigns.find(c => c.id === second.id)?.state, 'paused');
    });
    await t.test('a late create commit after null resolves the original without a duplicate', async () => {
      const check = page.getByRole('button', { name: 'Check original saved outcome', exact: true });
      const start = page.getByRole('button', { name: 'Start a new reviewed attempt', exact: true });
      const saveDraft = page.getByRole('button', { name: 'Save draft', exact: true });
      const name = page.getByLabel('Campaign name');
      const campaignName = 'Late original draft';
      const before = await getFeeWaiverState(f.database);
      const postCount = posts.length;
      await auditReason.fill(reason);
      await name.fill(campaignName);
      await page.getByLabel('Starts at (Nepal time)').fill(festivalYear + '-11-01T10:00');
      await page.getByLabel('Ends at (Nepal time)').fill(festivalYear + '-11-02T10:00');
      loseOriginalResponse = true;
      await saveDraft.click();
      await check.waitFor();

      const original = String(posts[postCount].requestId);
      const actor = { id: actorId, authSubject: actorId };
      assert.equal(posts[postCount].expectedRevision, before.revision);
      assert.equal(await reference(), original);
      assert.equal(await readCommercialOutcome(f.database, actor, 'waiver', original), null);

      const lookupsBefore = checkedReferences.length;
      await check.click();
      await start.click();
      await page.getByText(/still able to commit/i).waitFor();
      assert.equal(await reference(), original);
      assert.equal(await saveDraft.isDisabled(), true);
      assert.equal(await name.inputValue(), campaignName);
      assert.equal((await getFeeWaiverState(f.database)).revision, before.revision);
      assert.deepEqual(checkedReferences.slice(lookupsBefore), [original]);

      refreshMode = 'late-commit';
      await start.click();
      await page.getByText(/original committed campaign action confirmed/i).waitFor();
      await page.getByRole('heading', { name: campaignName + ' · draft', exact: true }).waitFor();
      const final = await getFeeWaiverState(f.database);
      const matches = final.campaigns.filter(campaign => campaign.name === campaignName);
      assert.equal(final.revision, before.revision + 1);
      assert.equal(matches.length, 1);
      assert.equal((await readCommercialOutcome(f.database, actor, 'waiver', original))?.sourceId, matches[0].id);
      assert.equal((await f.database.prepare('SELECT COUNT(*) AS total FROM customer_fee_waiver_requests WHERE request_id=?').bind(original).first<{ total: number }>())?.total, 1);
      assert.equal((await f.database.prepare('SELECT COUNT(*) AS total FROM audit_logs WHERE subject_id=? AND action=?').bind(matches[0].id, 'customer.service-fee-waiver.create').first<{ total: number }>())?.total, 1);
      assert.equal(posts.length, postCount + 1, 'Recovery never posts a replacement create');
      assert.deepEqual(checkedReferences.slice(lookupsBefore), [original, original]);
      assert.equal(await reference(), null);
      assert.equal(await name.inputValue(), '');
      assert.equal(await auditReason.inputValue(), '');
    });
    assert.deepEqual(errors, []);
    assert.equal(expectedConflicts.length, 2);
    assert.equal(expectedRecoveryFailures.filter(message => message.includes('403 (Forbidden)')).length, 3);
    assert.equal(expectedRecoveryFailures.filter(message => message.includes('503 (Service Unavailable)')).length, 1);
    assert.equal(expectedRecoveryFailures.filter(message => message.includes('net::ERR_FAILED')).length, 1);
  } finally {
    await browser.close();
  }
});
