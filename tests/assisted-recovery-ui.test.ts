import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import type { Page, Route } from 'playwright';
import { stubFixtureLink } from './helpers/browser-fixture-link';
async function fixture(
  component: 'public' | 'admin',
  width: number,
  handle: (route: Route) => Promise<void>,
  run: (page: Page) => Promise<void>,
) {
  const componentModule =
    component === 'public'
      ? 'components/auth/assisted-recovery-form'
      : 'components/admin/account-recovery-assistance';
  const name =
    component === 'public'
      ? 'AssistedRecoveryForm'
      : 'AccountRecoveryAssistance';
  const props =
    component === 'public'
      ? ''
      : 'actorId="fictional-reviewer" targetId="fictional" displayName="Fictional seller" email="fictional@local.hastabazaar.test"';
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import{${name}}from'./${componentModule}';createRoot(document.getElementById('root')).render(<${name} ${props}/>);`,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-link', setup(build){stubFixtureLink(build);build.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'assisted-legacy-nav'}));build.onLoad({filter:/.*/,namespace:'assisted-legacy-nav'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){}}}'}));} }],
  });
  const { chromium } = createRequire(import.meta.url)(
    'playwright',
  ) as typeof import('playwright');
  const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROME_PATH ??
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
    }),
    page = await browser.newPage({ viewport: { width, height: 850 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      assert.equal(url.origin, 'https://recovery.fixture');
      assert.equal(url.hash, '');
      if (url.pathname === '/fixture.js')
        return route.fulfill({
          contentType: 'text/javascript',
          body: bundle.outputFiles[0].text,
        });
      if (url.pathname.startsWith('/api/')) return handle(route);
      return route.fulfill({
        contentType: 'text/html',
        body: '<style>*{box-sizing:border-box}body{margin:16px}button,input,select{max-width:100%;min-height:44px}p,label,summary{overflow-wrap:anywhere}</style><div id="root"></div><script src="/fixture.js"></script>',
      });
    });
    await page.goto(
      `https://recovery.fixture/fixture${component === 'public' ? '#dGFyZ2V0.password.fixture-private-secret' : ''}`,
    );
    await run(page);
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
  } finally {
    await browser.close();
  }
}
for (const width of [390, 1280])
  void test(`recipient private fragment and completion notice are usable at ${width}px`, async () => {
    let requests = 0;
    await fixture(
      'public',
      width,
      async (route) => {
        requests++;
        const data = route.request().postDataJSON();
        assert.equal(data.token, 'dGFyZ2V0.password.fixture-private-secret');
        assert.equal(data.password, 'new-private-password');
        await route.fulfill({
          json: {
            ok: true,
            replacementRequired: false,
            notificationDelivered: false,
          },
        });
      },
      async (page) => {
        await page.getByLabel('New password', { exact: true }).waitFor();
        assert.equal(new URL(page.url()).hash, '');
        await page
          .getByLabel('New password', { exact: true })
          .fill('new-private-password');
        await page
          .getByLabel('Confirm new password')
          .fill('new-private-password');
        await page.getByRole('button', { name: 'Save new password' }).click();
        await page
          .getByText(
            /change succeeded, but the confirmation email could not be delivered/,
          )
          .waitFor();
        assert.equal(requests, 1);
        assert.equal(
          await page
            .getByRole('link', { name: 'Continue to sign in' })
            .getAttribute('href'),
          '/login',
        );
      },
    );
  });
void test('Admin form records real review references and sends no owner credential', async () => {
  let requests = 0;
  await fixture(
    'admin',
    390,
    async (route) => {
      requests++;
      const data = route.request().postDataJSON();
      assert.equal(data.supportReference, 'SUP-123');
      assert.equal(data.verificationReference, 'SELLER-123');
      assert.equal(data.ownershipVerified, true);
      assert.equal(data.confirmedTarget, true);
      assert.equal(data.confirmedEmail, 'fictional@local.hastabazaar.test');
      assert.equal(data.password, undefined);
      await route.fulfill({
        json: { ok: true, message: 'A private invitation was sent.' },
      });
    },
    async (page) => {
      await page
        .getByText('Account recovery for Fictional seller', { exact: true })
        .click();
      await page.getByLabel('Support request reference').fill('SUP-123');
      await page
        .getByLabel('Matching onboarding record reference')
        .fill('SELLER-123');
      await page.getByRole('checkbox').nth(0).check();
      await page.getByRole('checkbox').nth(1).check();
      await page
        .getByRole('button', { name: 'Send password reset', exact: true })
        .click();
      await page.getByText('A private invitation was sent.').waitFor();
      assert.equal(requests, 1);
    },
  );
});
