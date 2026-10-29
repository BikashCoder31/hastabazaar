import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { NextRequest } from 'vinext/shims/server';
import type { NextRequest as FrameworkRequest } from 'next/server';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { nodeToWebRequest } from 'vinext/server/prod-server';
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

void test('production public discovery survives TLS termination in the Node hosting adapter', async () => {
  const { middleware } = await import('../middleware');
  const robots = await import('../app/robots.txt/route');
  const before = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://hastabazaar.com';
  try {
    for (const path of ['/', '/shop', '/categories', '/occasions', '/products/cup', '/api/product-media/photo', '/robots.txt', '/sitemap.xml', '/sitemaps/0.xml', '/icon.png', '/brand/hastabazaar-mark-192.png', '/brand/hastabazaar-logo-lockup-640.png']) {
      const incoming = new IncomingMessage(new Socket());
      incoming.method = 'GET'; incoming.url = path;
      incoming.headers = { host: 'hastabazaar.com', 'x-forwarded-proto': 'https' };
      const converted = nodeToWebRequest(incoming);
      assert.equal(middleware(request(converted.url)).headers.get('x-robots-tag'), null, path);
    }
    const text = await robots.GET(new Request('http://hastabazaar.com/robots.txt')).text();
    assert.match(text, /^Allow: \/$/m);
    assert.match(text, /^Sitemap: https:\/\/hastabazaar.com\/sitemap.xml$/m);
    assert.doesNotMatch(text, /^Disallow: \/$/m);
    for (const path of ['/admin', '/seller', '/account', '/checkout', '/security', '/recover-account', '/forgot-password', '/auth', '/local-testing']) {
      assert.ok(text.includes('Disallow: ' + path + '\n'), path);
      assert.equal(middleware(request('http://hastabazaar.com' + path)).headers.get('x-robots-tag'), 'noindex, nofollow', path);
    }
    assert.equal(middleware(request('http://hastabazaar.com/shop?q=cup')).headers.get('x-robots-tag'), 'noindex, nofollow');
  } finally {
    if (before === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = before;
  }
});

void test('only production public GET and HEAD requests on www redirect to the canonical host', async () => {
  const { middleware } = await import('../middleware');
  const before = process.env.APP_ORIGIN;
  try {
    process.env.APP_ORIGIN = 'https://hastabazaar.com';
    for (const protocol of ['http:', 'https:']) {
      for (const method of ['GET', 'HEAD']) {
        const result = middleware(new NextRequest(protocol + '//www.hastabazaar.com/shop?q=gift', { method }) as unknown as FrameworkRequest);
        assert.equal(result.status, 308);
        assert.equal(result.headers.get('location'), 'https://hastabazaar.com/shop?q=gift');
      }
    }
    for (const url of ['https://www.hastabazaar.com/account', 'https://www.hastabazaar.com/api/auth/login', 'https://www.hastabazaar.com.attacker.test/shop']) {
      const result = middleware(request(url));
      assert.equal(result.headers.get('location'), null);
      assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow');
    }
    assert.equal(middleware(new NextRequest('https://www.hastabazaar.com/shop', {method:'POST'}) as unknown as FrameworkRequest).headers.get('location'), null);
    process.env.APP_ORIGIN = 'https://staging.hastabazaar.com';
    const result = middleware(request('https://www.hastabazaar.com/'));
    assert.equal(result.headers.get('location'), null);
    assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow');
  } finally {
    if (before === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = before;
  }
});

void test('production indexing never trusts forwarded headers or a staging/local/invalid origin', async () => {
  const { middleware } = await import('../middleware');
  const robots = await import('../app/robots.txt/route');
  const before = process.env.APP_ORIGIN;
  try {
    for (const configured of ['https://staging.hastabazaar.com', 'http://localhost:3018', 'https://hastabazaar.com/unexpected', 'https://user@hastabazaar.com', 'invalid']) {
      process.env.APP_ORIGIN = configured;
      for (const origin of ['https://hastabazaar.com', 'http://hastabazaar.com']) {
        assert.equal(middleware(request(origin + '/shop')).headers.get('x-robots-tag'), 'noindex, nofollow', configured);
        assert.match(await robots.GET(new Request(origin + '/robots.txt')).text(), /^Disallow: \/$/m);
      }
    }
    process.env.APP_ORIGIN = 'https://hastabazaar.com';
    for (const origin of ['http://staging.hastabazaar.com', 'https://staging.hastabazaar.com', 'http://localhost:3018', 'https://hastabazaar.com.attacker.test', 'http://hastabazaar.com:8080']) {
      const spoof = new NextRequest(origin + '/shop', { headers: { 'x-forwarded-host': 'hastabazaar.com', 'x-forwarded-proto': 'https' } }) as unknown as FrameworkRequest;
      assert.equal(middleware(spoof).headers.get('x-robots-tag'), 'noindex, nofollow', origin);
      assert.match(await robots.GET(new Request(origin + '/robots.txt', { headers: spoof.headers })).text(), /^Disallow: \/$/m);
    }
    delete process.env.APP_ORIGIN;
    assert.match(await robots.GET(new Request('http://hastabazaar.com/robots.txt')).text(), /^Disallow: \/$/m);
  } finally {
    if (before === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = before;
  }
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
