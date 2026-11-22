import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

async function render(user: object | null) {
  const output = await build({ entryPoints: ['app/seller-access-denied/page.tsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'boundaries', setup(b) {
      b.onResolve({ filter: /^(next\/image|next\/link|@\/app\/auth)$/ }, args => ({ path: args.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ loader: 'js', resolveDir: process.cwd(), contents:
        args.path === '@/app/auth' ? `export async function getAuthenticatedUser(){return globalThis.fixtureUser} export function signInPath(p){return '/login?return_to='+encodeURIComponent(p)} export function signOutPath(p){return '/api/auth/logout?return_to='+encodeURIComponent(p)}` :
          `import {createElement} from 'react';export default function Element(props){return createElement('${args.path === 'next/image' ? 'img' : 'a'}',props)}` }));
    }}] });
  const pageModule = { exports: {} as { default: () => Promise<ReactElement> } };
  runInNewContext(output.outputFiles[0].text, { require: createRequire(import.meta.url), module: pageModule, exports: pageModule.exports, fixtureUser: user });
  return renderToStaticMarkup(await pageModule.exports.default());
}

void test('signed-in applicants can reach their own application and private product drafts from seller denial', async () => {
  const html = await render({ email: 'fictional@example.test' });
  assert.match(html, /href="\/sell\/application"/);
  assert.match(html, /application.*product drafts/i);
  assert.match(html, /href="\/sell"/);
  assert.match(html, /approval/i);
});

void test('anonymous users retain sign-in and application entry', async () => {
  const html = await render(null);
  assert.match(html, /href="\/login\?return_to=%2Fseller"/);
  assert.match(html, /href="\/sell"/);
  assert.doesNotMatch(html, /href="\/sell\/application"/);
});
