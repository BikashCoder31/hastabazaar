import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const footerPath = new URL(
  '../components/layout/site-footer.tsx',
  import.meta.url,
);

void test('public footer uses the editorial customer-facing presentation', async () => {
  const footer = await readFile(footerPath, 'utf8');

  assert.match(footer, /site-footer-cta/);
  assert.match(footer, /Crafted in Nepal\. Connected to the world\./);
  assert.match(footer, /Shop & discover/);
  assert.match(footer, /Official Hastabazaar social media/);
});

void test('public footer does not advertise staff or local testing entry points', async () => {
  const footer = await readFile(footerPath, 'utf8');

  assert.doesNotMatch(footer, /href="\/admin"/);
  assert.doesNotMatch(footer, /Staff sign in/);
  assert.doesNotMatch(footer, /href="\/local-testing"/);
  assert.doesNotMatch(footer, /Local role testing/);
});
