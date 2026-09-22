import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { scanResponsiveMediaRenderSites } from './helpers/responsive-media-policy';

void test('every production TSX media render site follows the responsive contract', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const violations = await scanResponsiveMediaRenderSites(root);
  assert.deepEqual(
    violations,
    [],
    violations
      .map((item) => `${item.file}:${item.line} ${item.rule}`)
      .join('\n'),
  );
});
