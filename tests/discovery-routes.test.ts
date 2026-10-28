import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { NextRequest } from 'vinext/shims/server';
import type { NextRequest as FrameworkRequest } from 'next/server';
const request = (url: string) =>
  new NextRequest(url) as unknown as FrameworkRequest;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/server')
      return next('vinext/shims/server', context);
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={}',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});

void test('canonical public discovery pages and product images are indexable while private routes and filtered listings are not', async () => {
  const { middleware } = await import('../middleware');
  const before = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://hastabazaar.com';
  try {
    for (const path of [
      '/contact-us',
      '/categories',
      '/occasions',
      '/shop',
      '/api/product-media/photo',
    ]) {
      assert.equal(
        middleware(request('https://hastabazaar.com' + path)).headers.get(
          'x-robots-tag',
        ),
        null,
        path,
      );
    }
    for (const path of [
      '/contact',
      '/account',
      '/orders/private',
      '/admin',
      '/api/return-evidence/private',
      '/shop?q=pot',
    ]) {
      assert.equal(
        middleware(request('https://hastabazaar.com' + path)).headers.get(
          'x-robots-tag',
        ),
        'noindex, nofollow',
        path,
      );
    }
  } finally {
    if (before === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = before;
  }
});

void test('static sitemap includes canonical discovery URLs and excludes the contact redirect', async () => {
  const { GET } = await import('../app/sitemaps/[page]/route');
  const response = await GET(
    new Request('https://hastabazaar.com/sitemaps/0.xml'),
    { params: Promise.resolve({ page: '0.xml' }) },
  );
  const xml = await response.text();
  for (const path of ['/contact-us', '/categories', '/occasions'])
    assert.ok(xml.includes(`<loc>https://hastabazaar.com${path}</loc>`), path);
  assert.ok(!xml.includes('<loc>https://hastabazaar.com/contact</loc>'));
});

void test('local and hosted staging remain nonindexable in both middleware and robots responses', async () => {
  const { middleware } = await import('../middleware');
  const robots = await import('../app/robots.txt/route');
  const before = process.env.APP_ORIGIN;
  try {
    for (const origin of [
      'http://localhost:3018',
      'https://staging.hastabazaar.com',
    ]) {
      process.env.APP_ORIGIN = origin;
      for (const path of ['/', '/shop', '/categories', '/products/cup'])
        assert.equal(
          middleware(request(origin + path)).headers.get('x-robots-tag'),
          'noindex, nofollow',
        );
      const response = robots.GET(new Request(origin + '/robots.txt'));
      assert.match(await response.text(), /User-agent: \*\s+Disallow: \/\s*$/);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    }
    process.env.APP_ORIGIN = 'https://hastabazaar.com';
    assert.equal(
      middleware(request('https://staging.hastabazaar.com/')).headers.get(
        'x-robots-tag',
      ),
      'noindex, nofollow',
    );
    assert.match(
      await robots
        .GET(new Request('https://hastabazaar.com/robots.txt'))
        .text(),
      /Sitemap: https:\/\/hastabazaar.com\/sitemap.xml/,
    );
  } finally {
    if (before === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = before;
  }
});
