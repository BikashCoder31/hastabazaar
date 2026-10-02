import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { AuthenticatedUser } from '../app/auth';

async function renderDeniedPage(user: AuthenticatedUser | null) {
  const output = await build({
    entryPoints: ['app/staff-access-denied/page.tsx'], absWorkingDir: process.cwd(),
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'denied-page-boundary', setup(plugin) {
      plugin.onResolve({ filter: /^(next\/image|next\/link|@\/app\/auth)$/ }, (args) => ({ path: args.path, namespace: 'denied-page-stub' }));
      plugin.onLoad({ filter: /.*/, namespace: 'denied-page-stub' }, (args) => ({ contents:
        args.path === '@/app/auth' ? `
          export async function getAuthenticatedUser(){return globalThis.deniedPageUser}
          export function signInPath(path){return '/login?return_to=' + encodeURIComponent(path)}
          export function signOutPath(path){return '/api/auth/logout?return_to=' + encodeURIComponent(path)}
        ` : `import {createElement} from 'react'; export default function Element(props){return createElement('${args.path === 'next/image' ? 'img' : 'a'}', props)}`,
        loader: 'js', resolveDir: process.cwd(),
      }));
    } }],
  });
  const pageModule = { exports: {} as { default: () => Promise<ReactElement> } };
  runInNewContext(output.outputFiles[0].text, {
    require: createRequire(import.meta.url), module: pageModule, exports: pageModule.exports,
    deniedPageUser: user,
  });
  return renderToStaticMarkup(await pageModule.exports.default());
}

void test('authenticated permission denial offers workspace recovery without claiming staff membership is missing', async () => {
  const html = await renderDeniedPage({ userId: 'qa-admin', displayName: 'Fictional QA Admin',
    email: 'qa-staging+admin@hastabazaar.com', fullName: 'Fictional QA Admin', mailboxVerified: true });
  assert.match(html, /qa-staging\+admin@hastabazaar\.com/);
  assert.doesNotMatch(html, /has not been granted HastaBazaar staff access|<h1[^>]*>Staff invitation required/);
  assert.match(html, /permission[^<]*this page/);
  assert.match(html, /<a[^>]*href="\/auth\/continue"[^>]*>Return to your workspace<\/a>/);
  const logoutForm = html.match(/<form[^>]*data-form-id="identity.logout"[^>]*>/)?.[0] ?? '';
  assert.match(logoutForm, /method="POST"/);
  assert.match(logoutForm, /target="_top"/);
  assert.match(html, /<button[^>]*type="submit"[^>]*>Use another account<\/button>/);
  assert.doesNotMatch(html, />Staff sign in<\/a>/);
});

void test('anonymous denial retains invitation verification and sign-in instead of authenticated recovery', async () => {
  const html = await renderDeniedPage(null);
  assert.match(html, /Sign in with the email address invited by a HastaBazaar Super Admin/);
  assert.match(html, /email code or Google/);
  assert.match(html, /Password registration alone does not verify/);
  assert.match(html, /<a[^>]*href="\/login\?return_to=%2Fadmin"[^>]*target="_top"[^>]*>Staff sign in<\/a>/);
  assert.match(html, /href="\/seller"/);
  assert.match(html, /href="\/sell"/);
  assert.doesNotMatch(html, /href="\/auth\/continue"|data-form-id="identity.logout"|Use another account/);
});
