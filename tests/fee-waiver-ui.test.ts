import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { FORM_REGISTRY } from '../lib/forms/registry';
import {
  feeWaiverFixture,
  feeWaiverContext,
} from './helpers/fee-waiver-fixture';
import {
  getFeeWaiverState,
  mutateFeeWaiver,
} from '../lib/db/repositories/fee-waivers';
import { FeeWaiverError } from '../lib/marketplace/fee-waivers';
import { presentFeeWaiverState } from '../lib/marketplace/fee-waiver-presentation';
import type { FixturePage } from './helpers/browser-fixture-types';

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

void test('mobile keyboard editor persists Nepal schedule, pause/resume/end, overlaps, exact dates and conflict refresh', async () => {
  assert.ok(
    existsSync('components/admin/fee-waiver-manager.tsx'),
    'Campaign manager exists',
  );
  const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ??
      'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
  );
  const f = await feeWaiverFixture();
  const now = Date.now();
  const terms = {
    name: 'First launch',
    description: 'Fictional Registered Sellers',
    startsAt: now - 10000,
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
  const initialState = presentFeeWaiverState(
    await getFeeWaiverState(f.database),
    now,
  );
  const [compiled, styles] = await Promise.all([
    build({
      stdin: {
        resolveDir: process.cwd(),
        loader: 'tsx',
        contents:
          "import React from 'react';import {createRoot} from 'react-dom/client';import {FeeWaiverManager} from './components/admin/fee-waiver-manager';createRoot(document.getElementById('root')).render(<FeeWaiverManager initialState={" +
          JSON.stringify(initialState) +
          '}/>);',
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"' },
    }),
    postcss([tailwind()]).process(readFileSync('app/globals.css', 'utf8'), {
      from: resolve('app/globals.css'),
    }),
  ]);
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const nativePage = await browser.newPage({
    viewport: { width: 375, height: 812 },
  });
  const page = nativePage as FixturePage;
  const errors: string[] = [];
  const expectedConflicts: string[] = [];
  nativePage.on('pageerror', (error: Error) => errors.push(error.message));
  nativePage.on('console', (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') {
      if (message.text().includes('409 (Conflict)'))
        expectedConflicts.push(message.text());
      else errors.push(message.text());
    }
  });
  const posts: Record<string, unknown>[] = [];
  let competing = false;
  try {
    await page.route('**/*', async (route) => {
      const r = route.request();
      assert.equal(new URL(r.url()).origin, 'https://waiver.test');
      if (new URL(r.url()).pathname === '/api/admin/fee-waivers') {
        if (r.method() === 'POST') {
          const body = JSON.parse(r.postData()!);
          posts.push(body);
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
            const campaign = await mutateFeeWaiver(
              f.database,
              feeWaiverContext(body.requestId, body.expectedRevision, {
                now: Date.now(),
              }),
              body.command,
            );
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
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(
            presentFeeWaiverState(
              await getFeeWaiverState(f.database),
              Date.now(),
            ),
          ),
        });
      }
      return route.fulfill({
        contentType: 'text/html',
        body:
          '<title>Fee waiver fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
          styles.css +
          '</style><main id="root" style="padding:12px"></main>',
      });
    });
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
    await page
      .getByRole('button', { name: 'Pause First launch', exact: true })
      .press('Enter');
    await page.getByRole('button',{name:'Resume First launch',exact:true}).waitFor();
    assert.deepEqual(posts[0].command, { type: 'pause', campaignId: first.id });
    await page.getByText(/Applying: Second launch/).waitFor();
    await page
      .getByRole('button', { name: 'Resume First launch', exact: true })
      .click();
    await page.getByRole('button',{name:'Pause First launch',exact:true}).waitFor();
    await page
      .getByRole('button', { name: 'Edit First launch', exact: true })
      .click();
    await page.getByLabel('Campaign name').fill('First launch edited');
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
    await page.getByLabel('Starts at (Nepal time)').fill('2027-11-01T10:00');
    await page.getByLabel('Ends at (Nepal time)').fill('2027-11-02T10:00');
    await page
      .getByRole('button', { name: 'Save draft', exact: true })
      .press('Enter');
    await page.getByRole('heading',{name:'Festival · draft',exact:true}).waitFor();
    assert.equal(
      (posts[3].command as { terms: { startsAt: number } }).terms.startsAt,
      Date.parse('2027-11-01T04:15:00Z'),
    );
    await page
      .getByRole('button', { name: 'Publish Festival', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Festival · scheduled', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'End Festival', exact: true })
      .click();
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
    const postCountBeforeEmptySave=posts.length;
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    assert.equal(posts.length,postCountBeforeEmptySave,'An old edit cannot be submitted after manual refresh');
    assert.deepEqual((await getFeeWaiverState(f.database)).campaigns.find(c=>c.id===first.id),competingRevision);

    // Only reopening the refreshed campaign and deliberately editing can revise it.
    await page.getByRole('button',{name:'Edit First launch edited',exact:true}).click();
    assert.equal(await page.getByLabel('Description').inputValue(),competingTerms.description);
    await page.getByLabel('Campaign name').fill('Reviewed current launch');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('heading',{name:'Reviewed current launch · active',exact:true}).waitFor();
    const reviewedCampaign=(await getFeeWaiverState(f.database)).campaigns.find(c=>c.id===first.id)!;
    assert.equal(reviewedCampaign.name,'Reviewed current launch');
    assert.equal(reviewedCampaign.description,competingTerms.description);
    assert.equal(reviewedCampaign.startsAt,competingTerms.startsAt);
    assert.equal(reviewedCampaign.endsAt,competingTerms.endsAt);

    competing = true;
    await page
      .getByRole('button', { name: 'Pause Second launch', exact: true })
      .click();
    await page.getByRole('alert').waitFor();
    await page
      .getByRole('heading', { name: 'Competing draft · draft', exact: true })
      .waitFor();
    assert.match(
      (await page.getByRole('alert').textContent()) ?? '',
      /refreshed/i,
    );
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
    await mkdir('output/fee-waiver-ui', { recursive: true });
    await nativePage.screenshot({
      path: resolve('output/fee-waiver-ui/mobile.png'),
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
      path: resolve('output/fee-waiver-ui/desktop.png'),
      fullPage: true,
    });
  } finally {
    await browser.close();
    await f.dispose();
  }
});
