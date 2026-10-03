import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const footerPath = new URL(
  '../components/layout/site-footer.tsx',
  import.meta.url,
);
const stylesPath = new URL('../app/globals.css', import.meta.url);

void test('public footer uses the editorial customer-facing presentation', async () => {
  const footer = await readFile(footerPath, 'utf8');

  assert.match(footer, /site-footer-cta/);
  assert.match(footer, /hastabazaar-logo-lockup-640\.webp/);
  assert.match(footer, /alt="Hastabazaar"/);
  assert.doesNotMatch(footer, /HastaBazaar<span>\.<\/span>/);
  assert.match(footer, /Thoughtful finds\. Everyday possibilities\./);
  assert.match(footer, /Shop & discover/);
  assert.match(footer, /Official Hastabazaar social media/);
  assert.match(footer, /SocialBrandIcon/);
  assert.match(footer, /site-footer-social-icon/);
  assert.match(footer, /aria-label=\{label\}/);
});

void test('public footer does not advertise staff or local testing entry points', async () => {
  const footer = await readFile(footerPath, 'utf8');

  assert.doesNotMatch(footer, /href="\/admin"/);
  assert.doesNotMatch(footer, /Staff sign in/);
  assert.doesNotMatch(footer, /href="\/local-testing"/);
  assert.doesNotMatch(footer, /Local role testing/);
});

void test('footer action panel uses a calm parchment treatment instead of bright red', async () => {
  const styles = await readFile(stylesPath, 'utf8');
  const actionPanel = styles.match(/\.site-footer-cta \{[\s\S]*?\n  \}/)?.[0];

  assert.ok(actionPanel);
  assert.match(actionPanel, /#f2e7d7/);
  assert.match(actionPanel, /#dfc9ad/);
  assert.doesNotMatch(actionPanel, /#a20f18/);
});
