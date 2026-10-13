import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { build } from 'esbuild';
import { getBusinessSettingDefinition } from '../lib/configuration/definitions';
import { managedIdentityFields } from './helpers/managed-identity-fixture';
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ??
  'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
void test('managed application and correction UI require government evidence and separate unchecked acceptance while personal PAN stays optional', async () => {
  // Browser plugin not available: use the repository's bundled Playwright fixture workflow.
  const { chromium } = (await import(playwrightPath)) as {
    chromium: {
      launch(options: {
        headless: boolean;
        executablePath: string;
      // oxlint-disable-next-line typescript/no-explicit-any -- Browser runtime is provided externally.
      }): Promise<any>;
    };
  };
  const terms = {
    account: getBusinessSettingDefinition('managed_maker_company_account')
      .defaultValue,
    platformRetentionBps: 900,
    context: managedIdentityFields().managedAgreementContext,
  };
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: 'managed-identity-client.tsx',
      loader: 'tsx',
      contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {SellerApplicationForm} from './components/seller/seller-application-form';
    import {MakerApplicationProfileForm} from './components/seller/maker-application-profile-form';
    const root=createRoot(document.getElementById('root'));const terms=${JSON.stringify(terms)};
    window.mountCorrection=()=>root.render(<MakerApplicationProfileForm managedTerms={terms} profile={{sellerId:'maker',version:1,publicName:'Fictional Studio',publicCity:'Birgunj',craftExperience:[],socialLinks:{},participationRoute:'managed_maker',applicationStage:'changes_requested'}}/>);
    root.render(<SellerApplicationForm managedTerms={terms}/>);`,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'fixture-navigation',
        setup(builder) {
          builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'navigation',
            namespace: 'fixture',
          }));
          builder.onLoad(
            { filter: /^navigation$/, namespace: 'fixture' },
            () => ({
              contents: 'export function useRouter(){return {refresh(){}}}',
              loader: 'js',
            }),
          );
        },
      },
    ],
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Browser route type belongs to external runtime.
    await page.route('https://managed-identity.test/**', async (route: any) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/api/forms/')) {
        const formId = decodeURIComponent(path.slice('/api/forms/'.length));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            config: { formId, version: 1, publishedAt: 1, fields: [] },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<title>Managed identity QA</title><div id="root"></div>',
      });
    });
    await page.goto('https://managed-identity.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page
      .locator('[name="hasBusinessTaxRegistration"]')
      .selectOption('no');
    await page
      .getByText('Company selling account: HastaBazaar', { exact: true })
      .waitFor();
    assert.match(
      await page.locator('form').innerText(),
      /cannot upload its certificate now, choose Yes/,
    );
    assert.equal(
      await page
        .locator('[name="representativeIdentity"]')
        .getAttribute('required'),
      '',
    );
    assert.equal(
      await page.locator('[name="personalPan"]').getAttribute('required'),
      null,
    );
    assert.equal(
      await page
        .locator('[name="personalPanCertificate"]')
        .getAttribute('required'),
      null,
    );
    assert.equal(
      await page.locator('[name="managedAgreementAccepted"]').isChecked(),
      false,
    );
    assert.equal(
      await page.locator('[name="applicationAcknowledgement"]').isChecked(),
      false,
    );
    await page
      .locator('[name="governmentIdType"]')
      .selectOption('other_government_id');
    assert.equal(
      await page
        .locator('[name="governmentIdDescription"]')
        .getAttribute('required'),
      '',
    );
    await page.locator('[name="governmentIdType"]').selectOption('passport');
    assert.equal(
      await page
        .locator('[name="governmentIdDescription"]')
        .getAttribute('required'),
      null,
    );
    await page.locator('[name="personalPan"]').fill('123');
    assert.equal(
      await page
        .locator('[name="personalPan"]')
        .evaluate((input: HTMLInputElement) => input.checkValidity()),
      false,
    );
    await page.locator('[name="personalPan"]').fill('123456789');
    assert.equal(
      await page
        .locator('[name="personalPan"]')
        .evaluate((input: HTMLInputElement) => input.checkValidity()),
      true,
    );
    await page.evaluate(() => {
      (window as unknown as { mountCorrection(): void }).mountCorrection();
    });
    await page
      .getByRole('button', { name: 'Resubmit application with evidence' })
      .waitFor();
    assert.equal(
      await page
        .locator('[name="representativeIdentity"]')
        .getAttribute('required'),
      '',
    );
    assert.equal(
      await page.locator('[name="managedAgreementAccepted"]').isChecked(),
      false,
    );
    const evidence = join(tmpdir(), 'hastabazaar-managed-identity-qa');
    await mkdir(evidence, { recursive: true });
    await page.screenshot({
      path: join(evidence, 'correction-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: join(evidence, 'correction-mobile.png'),
      fullPage: true,
    });
    assert.equal(await page.title(), 'Managed identity QA');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
