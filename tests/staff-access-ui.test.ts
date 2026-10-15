import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import type { Page } from 'playwright';
import { stubFixtureLink } from './helpers/browser-fixture-link';

const fixture = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {StaffPermissionManager} from './components/admin/staff-permission-manager';
const members=[
 {userId:'maya',displayName:'Maya Rai',email:'maya@example.test',permissions:['order.manage'],version:3,updatedAt:0,updatedBy:'owner'},
 {userId:'nima',displayName:'Nima Sherpa',email:'nima@example.test',permissions:['support.manage'],version:2,updatedAt:0,updatedBy:'owner'}
];
const base={actorId:'owner',members,presets:[
 {id:'saved',name:'Review team',permissionsJson:'["product.review"]'},
 {id:'broken',name:'Broken template',permissionsJson:'not json'},
 {id:'reserved',name:'Reserved template',permissionsJson:'["admin.invite"]'}],
 staffNames:{owner:'Asha Sharma',maya:'Maya Rai',nima:'Nima Sherpa'},requests:[],history:[]};
const root=createRoot(document.getElementById('root'));
window.renderStaff=(patch={})=>root.render(<StaffPermissionManager {...base} {...patch}/>);
window.fixtureMembers=members;
window.renderStaff();
`;

void test('staff access editor uses real mounted drafts and protected history', async (t) => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: 'staff-access-fixture.tsx',
      loader: 'tsx',
      contents: fixture,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'staff-access-fixture',
        setup(bundler) {
          stubFixtureLink(bundler);
          bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'navigation',
            namespace: 'fixture',
          }));
          bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            loader: 'js',
            contents:
              'export function useRouter(){return {refresh(){window.refreshCount=(window.refreshCount??0)+1}}}',
          }));
        },
      },
    ],
  });
  const playwrightPath =
    process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = (await import(
    playwrightPath
  )) as typeof import('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const screenshotDirectory = process.env.STAFF_ACCESS_SCREENSHOTS;
  let css = '';
  if (screenshotDirectory) {
    const [{ default: postcss }, { default: tailwind }] = await Promise.all([
      import('postcss'),
      import('@tailwindcss/postcss'),
    ]);
    css = (
      await postcss([tailwind()]).process(
        await readFile('app/globals.css', 'utf8'),
        { from: resolve('app/globals.css') },
      )
    ).css;
    await mkdir(screenshotDirectory, { recursive: true });
  }
  async function mount(
    run: (page: Page, bodies: Record<string, unknown>[]) => Promise<void>,
  ) {
    const page = await browser.newPage();
    const bodies: Record<string, unknown>[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.setDefaultTimeout(2500);
    await page.route('https://staff-access.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/api/forms/'))
        return route.fulfill({
          json: {
            config: {
              formId: decodeURIComponent(path.split('/').at(-1)!),
              version: 4,
              publishedAt: 1,
              fields: [
                {
                  id: 'team_note',
                  key: 'team_note',
                  label: 'Team note',
                  type: 'short_text',
                  required: false,
                  order: 0,
                  status: 'active',
                },
              ],
            },
          },
        });
      if (path === '/api/admin/staff-permissions') {
        bodies.push(route.request().postDataJSON());
        return route.fulfill({
          json: { id: 'saved-request', message: 'Permissions saved.' },
        });
      }
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Staff access fixture</title><style>${css || '[data-slot="alert-dialog-content"]{position:fixed;z-index:51;background:white;top:10%;left:10%;width:80%;max-height:80%;overflow:auto}[data-slot="alert-dialog-overlay"]{position:fixed;inset:0;z-index:50}svg{width:1em;height:1em}'}</style><main id="root" class="mx-auto max-w-6xl p-4 sm:p-8"></main>`,
      });
    });
    try {
      await page.goto('https://staff-access.test/');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByLabel('Team note').waitFor();
      await run(page, bodies);
      assert.deepEqual(
        errors,
        [],
        'Mounted staff access must not emit runtime or console errors',
      );
    } finally {
      await page.close();
    }
  }
  try {
    await t.test(
      'job and validated saved templates change only the draft, then submit reviewed changes',
      () =>
        mount(async (page, bodies) => {
          const template = page.getByLabel('Job template', { exact: true });
          assert.equal(
            await template
              .locator('option')
              .filter({ hasText: 'Broken template' })
              .count(),
            0,
          );
          assert.equal(
            await template
              .locator('option')
              .filter({ hasText: 'Reserved template' })
              .count(),
            0,
          );
          await template.selectOption('built-in:product-publisher');
          assert.equal(
            await page
              .getByRole('checkbox', { name: 'Publish products', exact: true })
              .isChecked(),
            true,
          );
          assert.equal(
            await page
              .getByRole('checkbox', {
                name: 'Review products and customer reviews',
                exact: true,
              })
              .isChecked(),
            true,
          );
          assert.equal(
            await page
              .getByRole('checkbox', {
                name: 'Manage orders and shipping',
                exact: true,
              })
              .isChecked(),
            false,
          );
          assert.equal(bodies.length, 0);
          assert.match(
            await page
              .getByRole('region', { name: 'Staff summary' })
              .innerText(),
            /1 of 9/,
          );
          assert.match(
            await page
              .getByRole('region', { name: 'Permission change preview' })
              .innerText(),
            /Added \(2\)[\s\S]*Removed \(1\)/,
          );
          await page
            .getByLabel('Reason *', { exact: true })
            .fill('Cover product publishing');
          await page.getByLabel('Team note').fill('October cover');
          await page
            .getByRole('button', { name: 'Save permissions', exact: true })
            .click();
          assert.equal(bodies.length, 0);
          await page
            .getByRole('button', {
              name: 'Confirm permission changes',
              exact: true,
            })
            .click();
          await page.getByText('Permissions saved.', { exact: true }).waitFor();
          assert.deepEqual(bodies[0].permissions, [
            'product.review',
            'product.publish',
          ]);
          assert.equal(bodies[0].userId, 'maya');
          assert.equal(bodies[0].version, 3);
          assert.equal(bodies[0].formVersion, 4);
          assert.deepEqual(bodies[0].customAnswers, [
            { fieldId: 'team_note', value: 'October cover' },
          ]);
          assert.equal(await page.getByText(/Unsaved draft/).count(), 0);
          await page.evaluate(() => {
            const w = window as unknown as {
              renderStaff(patch: unknown): void;
              fixtureMembers: Record<string, unknown>[];
            };
            w.renderStaff({
              members: w.fixtureMembers.map((member) =>
                member.userId === 'maya'
                  ? {
                      ...member,
                      permissions: ['product.review', 'product.publish'],
                      version: 4,
                    }
                  : member,
              ),
            });
          });
          await page
            .getByRole('region', { name: 'Staff summary' })
            .getByText(/2 of 9/)
            .waitFor();
          assert.equal(
            await page
              .getByRole('button', { name: 'Save permissions', exact: true })
              .isEnabled(),
            true,
          );
        }),
    );
    await t.test(
      'access search and filters preserve keyboard focus when a right changes groups',
      () =>
        mount(async (page) => {
          await page.getByLabel('Search work access').fill('shipping');
          assert.equal(await page.getByRole('checkbox').count(), 1);
          const right = page.getByRole('checkbox', {
            name: 'Manage orders and shipping',
            exact: true,
          });
          await right.focus();
          await right.press('Space');
          assert.equal(await right.isChecked(), false);
          assert.equal(
            await right.evaluate((el) => el === document.activeElement),
            true,
          );
          await page.getByLabel('Show access').selectOption('blocked');
          await right.focus();
          await right.press('Space');
          assert.equal(await right.isChecked(), true);
          assert.equal(
            await right.evaluate((el) => el === document.activeElement),
            true,
          );
          await page.getByLabel('Search work access').fill('no matching work');
          await page.getByText('No work areas match your search.').waitFor();
        }),
    );
    await t.test(
      'switching people requires discard and clears reason, template and configured answers',
      () =>
        mount(async (page, bodies) => {
          await page.getByLabel('Team note').fill('Only for Maya');
          await page
            .getByLabel('Admin *', { exact: true })
            .selectOption('nima');
          await page.getByRole('alertdialog').waitFor();
          await page
            .getByRole('button', { name: 'Go back', exact: true })
            .click();
          assert.equal(
            await page.getByLabel('Admin *', { exact: true }).inputValue(),
            'maya',
          );
          assert.equal(
            await page.getByLabel('Team note').inputValue(),
            'Only for Maya',
          );
          await page
            .getByLabel('Reason *', { exact: true })
            .fill('Maya needs cover');
          await page
            .getByLabel('Save as template', { exact: true })
            .fill('Maya cover');
          await page
            .getByLabel('Job template', { exact: true })
            .selectOption('saved:saved');
          await page
            .getByLabel('Admin *', { exact: true })
            .selectOption('nima');
          await page
            .getByRole('button', { name: 'Discard and switch', exact: true })
            .click();
          assert.equal(
            await page.getByLabel('Admin *', { exact: true }).inputValue(),
            'nima',
          );
          for (const label of [
            'Reason *',
            'Save as template',
            'Team note',
            'Job template',
          ])
            assert.equal(
              await page
                .getByLabel(label, { exact: label !== 'Team note' })
                .inputValue(),
              '',
            );
          assert.equal(
            await page
              .getByRole('checkbox', { name: 'Help customers', exact: true })
              .isChecked(),
            true,
          );
          assert.equal(bodies.length, 0);
        }),
    );
    await t.test(
      'a removed person or changed version cannot be submitted from an open review',
      () =>
        mount(async (page, bodies) => {
          await page
            .getByLabel('Reason *', { exact: true })
            .fill('Reviewed work access');
          await page
            .getByRole('button', { name: 'Save permissions', exact: true })
            .click();
          await page.evaluate(() => {
            const w = window as unknown as {
              renderStaff(patch: unknown): void;
              fixtureMembers: Record<string, unknown>[];
            };
            w.renderStaff({
              members: w.fixtureMembers.map((m) => ({ ...m, version: 9 })),
            });
          });
          assert.equal(
            await page
              .getByRole('button', {
                name: 'Confirm permission changes',
                exact: true,
              })
              .isDisabled(),
            true,
          );
          await page
            .getByRole('button', { name: 'Go back', exact: true })
            .click();
          assert.equal(
            await page
              .getByRole('button', { name: 'Save permissions', exact: true })
              .isDisabled(),
            true,
          );
          await page.evaluate(() => {
            const w = window as unknown as {
              renderStaff(patch: unknown): void;
              fixtureMembers: Record<string, unknown>[];
            };
            w.renderStaff({
              members: w.fixtureMembers.filter((m) => m.userId !== 'maya'),
            });
          });
          assert.equal(
            await page
              .getByRole('button', { name: 'Save permissions', exact: true })
              .isDisabled(),
            true,
          );
          assert.equal(bodies.length, 0);
        }),
    );
    await t.test(
      'permission-only drafts keep the discard choice when the staff record disappears',
      () =>
        mount(async (page) => {
          await page
            .getByRole('checkbox', { name: 'Help customers', exact: true })
            .check();
          await page.evaluate(() => {
            const w = window as unknown as {
              renderStaff(patch: unknown): void;
              fixtureMembers: Record<string, unknown>[];
            };
            w.renderStaff({
              members: w.fixtureMembers.filter(
                (member) => member.userId !== 'maya',
              ),
            });
          });
          await page
            .getByLabel('Admin *', { exact: true })
            .selectOption('nima');
          await page
            .getByRole('button', { name: 'Discard and switch', exact: true })
            .waitFor();
          await page
            .getByRole('button', { name: 'Go back', exact: true })
            .click();
          assert.equal(
            await page.getByLabel('Admin *', { exact: true }).inputValue(),
            'maya',
          );
        }),
    );
    await t.test('own permissions are never editable or submittable', () =>
      mount(async (page, bodies) => {
        await page.evaluate(() =>
          (
            window as unknown as { renderStaff(patch: unknown): void }
          ).renderStaff({ actorId: 'maya' }),
        );
        assert.equal(
          await page
            .getByRole('button', { name: 'Save permissions', exact: true })
            .isDisabled(),
          true,
        );
        assert.equal(
          await page.getByRole('checkbox').first().isDisabled(),
          true,
        );
        assert.equal(bodies.length, 0);
      }),
    );
    await t.test(
      'history separates actual changes, rejections and unavailable snapshots, keeping original form links',
      () =>
        mount(async (page) => {
          await page.evaluate(() => {
            const w = window as unknown as {
              renderStaff(patch: unknown): void;
            };
            const common = {
              staffId: 'maya',
              staffName: 'Maya Rai',
              actorId: 'owner',
              actorName: 'Asha Sharma',
              createdAt: 1792000000000,
              formRequestId: 'decision-operation',
              formHistoryKind: 'staff-permission-decision',
            };
            w.renderStaff({
              members: [],
              history: [
                {
                  ...common,
                  id: 'applied',
                  action: 'staff.permissions.approved',
                  outcome: 'applied',
                  reason: 'Cover support',
                  requestId: 'original-request',
                  beforePermissions: ['order.manage'],
                  afterPermissions: ['support.manage'],
                  requestedPermissions: ['support.manage'],
                  changes: {
                    added: ['support.manage'],
                    removed: ['order.manage'],
                    unchanged: [],
                  },
                },
                {
                  ...common,
                  id: 'direct',
                  action: 'staff.permissions.applied',
                  outcome: 'applied',
                  reason: 'Cover product review',
                  requestId: 'direct-request',
                  formHistoryKind: 'staff-permission-proposal',
                  beforePermissions: [],
                  afterPermissions: ['product.review'],
                  requestedPermissions: ['product.review'],
                  changes: {
                    added: ['product.review'],
                    removed: [],
                    unchanged: [],
                  },
                },
                {
                  ...common,
                  id: 'rejected',
                  action: 'staff.permissions.rejected',
                  outcome: 'rejected',
                  reason: 'Publishing not needed',
                  requestId: 'rejected-request',
                  beforePermissions: ['order.manage'],
                  afterPermissions: ['order.manage'],
                  requestedPermissions: ['product.publish'],
                  changes: {
                    added: [],
                    removed: [],
                    unchanged: ['order.manage'],
                  },
                },
                {
                  ...common,
                  id: 'old',
                  action: 'staff.permissions.applied',
                  outcome: 'incomplete',
                  reason: 'Older change',
                  requestId: null,
                  beforePermissions: null,
                  afterPermissions: ['support.manage'],
                  requestedPermissions: ['support.manage'],
                  changes: null,
                },
              ],
              requests: [
                {
                  id: 'legacy',
                  userId: 'former',
                  status: 'approved',
                  permissionsJson: 'bad json',
                  reason: 'Legacy decision',
                  proposedBy: 'owner',
                  proposedAt: 1,
                  expectedVersion: 1,
                  decidedBy: 'owner',
                  decisionNote: 'Done',
                },
              ],
            });
          });
          const history = page.getByRole('region', {
            name: 'Access change history',
          });
          assert.match(await history.innerText(), /Asha Sharma/);
          const applied = history
            .locator('article')
            .filter({ hasText: 'Cover support' });
          assert.match(
            await applied.innerText(),
            /Added[\s\S]*Help customers[\s\S]*Removed[\s\S]*Manage orders and shipping/,
          );
          assert.doesNotMatch(await applied.innerText(), /not applied/i);
          assert.doesNotMatch(
            await history
              .locator('article')
              .filter({ hasText: 'Cover product review' })
              .innerText(),
            /not applied/i,
          );
          assert.match(
            (await applied.getByRole('link').getAttribute('href')) ?? '',
            /id=original-request/,
          );
          assert.doesNotMatch(
            (await applied.getByRole('link').getAttribute('href')) ?? '',
            /decision-operation/,
          );
          const rejected = history
            .locator('article')
            .filter({ hasText: 'Publishing not needed' });
          assert.match(await rejected.innerText(), /No access was changed/);
          assert.match(
            await rejected.innerText(),
            /Requested, not applied: Publish products/,
          );
          assert.doesNotMatch(
            await history
              .locator('article')
              .filter({ hasText: 'Older change' })
              .innerText(),
            /not applied/i,
          );
          assert.doesNotMatch(
            await rejected.innerText(),
            /Added.*Publish products/,
          );
          await history
            .getByText(/Before and after access are unavailable/)
            .first()
            .waitFor();
          assert.match(
            (await history
              .locator('article')
              .filter({ hasText: 'Legacy decision' })
              .getByRole('link')
              .getAttribute('href')) ?? '',
            /id=legacy/,
          );
          if (screenshotDirectory) {
            await page.setViewportSize({ width: 1280, height: 900 });
            await history.screenshot({
              path: join(
                screenshotDirectory,
                'staff-access-history-desktop.png',
              ),
            });
            await page.setViewportSize({ width: 390, height: 844 });
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
              true,
            );
            await history.screenshot({
              path: join(
                screenshotDirectory,
                'staff-access-history-mobile.png',
              ),
            });
          }
          await page.getByLabel('History outcome').selectOption('rejected');
          assert.equal(await history.locator('article').count(), 1);
          await page.getByLabel('Search history').fill('absent name');
          await history.getByText('No changes match these filters.').waitFor();
        }),
    );
    if (screenshotDirectory)
      await t.test(
        'desktop and mobile draft layout stays within the viewport',
        () =>
          mount(async (page) => {
            assert.equal(await page.title(), 'Staff access fixture');
            assert.equal(page.url(), 'https://staff-access.test/');
            await page
              .getByLabel('Job template', { exact: true })
              .selectOption('built-in:product-publisher');
            await page
              .getByLabel('Reason *', { exact: true })
              .fill('Cover product publishing while the team grows');
            await page.setViewportSize({ width: 1280, height: 900 });
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
              true,
            );
            await page.screenshot({
              path: join(screenshotDirectory, 'staff-access-desktop.png'),
              fullPage: true,
            });
            await page.setViewportSize({ width: 390, height: 844 });
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
              true,
            );
            await page.screenshot({
              path: join(screenshotDirectory, 'staff-access-mobile.png'),
              fullPage: true,
            });
          }),
      );
  } finally {
    await browser.close();
  }
});
