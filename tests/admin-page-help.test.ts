import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import ts from 'typescript';

void test('admin heading variants render the shared help beside each heading', async () => {
  const missing: string[] = [];
  for (const directory of ['app/admin', 'components/admin']) {
    const files = await readdir(directory, { recursive: true, withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.tsx')) continue;
      const path = join(file.parentPath, file.name);
      const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'h1') {
          if (!ts.isJsxElement(node.parent) || node.parent.openingElement.tagName.getText(source) !== 'AdminPageTitle') {
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            missing.push(relative(process.cwd(), path) + ':' + line);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  assert.deepEqual(missing, []);
  const sharedTitleRoutes = [
    'app/admin/seller-documents/[id]/review/page.tsx',
    'app/admin/seller-document-change-requests/[id]/page.tsx',
    'app/admin/seller-protected-changes/[id]/page.tsx',
  ];
  for (const path of sharedTitleRoutes) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /<(DocumentReviewWorkspace|ProtectedChangeReviewWorkspace)\b/);
    assert.doesNotMatch(source, /<h1\b/, path + ' renders its title inside the shared review workspace');
  }
});

void test('page help gives short workflow guidance and uses existing procedure access', async () => {
  const { getAdminPageHelp } = await import('../components/admin/page-help-copy');
  const overview = getAdminPageHelp('/admin', { role: 'super_admin' });
  assert.equal(overview.title, 'How Today works');
  assert.match(overview.sentences.join(' '), /overdue/i);
  assert.match(overview.sentences.join(' '), /notification/i);
  assert.equal(overview.procedureHref, '/admin/legal-policies/active');

  const delegated = getAdminPageHelp('/admin/orders/order-1', { role: 'admin', permissions: ['order.manage'] });
  assert.match(delegated.sentences.join(' '), /payment/i);
  assert.equal(delegated.procedureHref, undefined);
  const support = getAdminPageHelp('/admin/cases/returns/return-1', { role: 'admin', permissions: ['support.manage'] });
  assert.equal(support.procedureHref, '/admin/legal-policies/active');
  assert.match(support.sentences.join(' '), /return/i);
  const receipt = getAdminPageHelp('/admin/payments/refunds', { role: 'admin', permissions: ['refund.approve.standard'] });
  assert.match(receipt.sentences.join(' '), /refund/i);
  const answers = getAdminPageHelp('/admin/orders', { role: 'admin', permissions: ['order.manage'] }, new URLSearchParams('workspace=answers'));
  assert.match(answers.sentences.join(' '), /original order/);
  const release = getAdminPageHelp('/admin/payments/orders/order-1', { role: 'super_admin' });
  assert.match(release.sentences.join(' '), /Check readiness and release/);
  const reviewTasks = getAdminPageHelp('/admin', { role: 'super_admin' }, new URLSearchParams('workspace=reviews'));
  assert.equal(reviewTasks.title, 'How to use review tasks');
  for (const help of [overview, delegated, support, receipt, answers, release, reviewTasks]) {
    assert.ok(help.sentences.length >= 2 && help.sentences.length <= 3);
  }
});

const chrome = process.env.CHROME_PATH ?? chromium.executablePath();

void test('page help supports keyboard dismissal, collision handling, and reduced motion', { skip: !existsSync(chrome) }, async () => {
  const { outputFiles } = await build({
    stdin: {
      sourcefile: 'admin-help-fixture.tsx',
      loader: 'tsx',
      resolveDir: process.cwd(),
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {AdminPageHelpProvider, AdminPageTitle} from './components/admin/page-help';
        import {getAdminPageHelp} from './components/admin/page-help-copy';
        createRoot(document.getElementById('root')).render(
          <AdminPageHelpProvider help={getAdminPageHelp('/admin', {role: 'super_admin'})}>
            <AdminPageTitle><h1>Overview</h1></AdminPageTitle>
          </AdminPageHelpProvider>
        );
      `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
  });
  const css = await readFile('app/admin/workspace.css', 'utf8');
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><div id="root"></div>');
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: outputFiles[0].text });
    const trigger = page.getByRole('button', { name: 'How Today works' });
    const popover = page.getByRole('dialog', { name: 'How Today works' });
    try {
      await trigger.waitFor({ timeout: 5_000 });
    } catch (error) {
      assert.deepEqual(errors, []);
      throw error;
    }
    assert.equal(await popover.isVisible(), false);

    await page.keyboard.press('Tab');
    assert.equal(await trigger.evaluate(button => button.matches(':focus-visible')), true);
    assert.equal(await trigger.evaluate(button => getComputedStyle(button).outlineWidth), '2px');
    await page.keyboard.press('Enter');
    await popover.waitFor();
    assert.deepEqual(await popover.evaluate(popup => {
      const style = getComputedStyle(popup);
      return [style.animationDuration, style.animationTimingFunction];
    }), ['0.18s', 'ease-out']);
    const procedure = popover.getByRole('link', { name: 'Full staff procedure' });
    assert.equal(await procedure.getAttribute('href'), '/admin/legal-policies/active');
    await procedure.focus();
    await page.keyboard.press('Escape');
    await popover.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(button => button === document.activeElement), true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await trigger.click();
    await popover.waitFor();
    assert.equal(await popover.evaluate(popup => getComputedStyle(popup).animationName), 'none');
    const bounds = await popover.evaluate(popup => {
      const { left, right } = popup.getBoundingClientRect();
      return { left, right, width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.scrollWidth === bounds.width, JSON.stringify(bounds));
    await page.getByRole('heading', { name: 'Overview', exact: true }).click({ position: { x: 1, y: 1 }, timeout: 5_000 });
    await popover.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
