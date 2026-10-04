import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// Origin rejection must happen before any database/session operation.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={}', shortCircuit: true };
  return nextResolve(specifier, context);
} });

void test('cart handlers accept both configured storefront hosts before validating the submitted fields', async () => {
  const { POST, PATCH, DELETE } = await import('../app/api/cart/route');
  const previous = process.env.APP_ORIGIN;
  const previousAliases = process.env.APP_ALLOWED_ORIGINS;
  try {
    process.env.APP_ORIGIN = 'https://hastabazaar.com';
    process.env.APP_ALLOWED_ORIGINS = 'https://www.hastabazaar.com';
    for (const origin of ['https://hastabazaar.com', 'https://www.hastabazaar.com']) {
      for (const [method, handler] of [['POST', POST], ['PATCH', PATCH], ['DELETE', DELETE]] as const) {
        const response = await handler(new Request('http://127.0.0.1:3000/api/cart', {
          method, headers: { origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
          body: '{}',
        }));
        assert.equal(response.status, 400, `${method} from ${origin} must reach field validation`);
        assert.match((await response.json() as { error: string }).error, /valid (?:product|cart item)/i);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous;
    if (previousAliases === undefined) delete process.env.APP_ALLOWED_ORIGINS; else process.env.APP_ALLOWED_ORIGINS = previousAliases;
  }
});

void test('a rejected cart request gives a useful reference without exposing technical or private data', async () => {
  const { POST, PATCH, DELETE } = await import('../app/api/cart/route');
  const previous = process.env.APP_ORIGIN;
  const previousAliases = process.env.APP_ALLOWED_ORIGINS;
  const warning = console.warn;
  const records: unknown[][] = [];
  try {
    process.env.APP_ORIGIN = 'https://hastabazaar.com';
    process.env.APP_ALLOWED_ORIGINS = 'https://www.hastabazaar.com';
    console.warn = (...args) => { records.push(args); };
    for (const [method, handler] of [['POST', POST], ['PATCH', PATCH], ['DELETE', DELETE]] as const) {
      const request = new Request('http://127.0.0.1:3000/api/cart?private=secret-query', {
        method, headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site',
          cookie: 'hastabazaar_cart=secret-cookie', authorization: 'Bearer secret-token' },
        body: JSON.stringify({ productId: 'fictional-product', quantity: 1 }),
      });
      const response = await handler(request);
      assert.equal(response.status, 403);
      const body = await response.json() as { error: string; reference: string };
      assert.match(body.error, /refresh|try again/i);
      assert.match(body.reference, /^[0-9a-f-]{36}$/);
      assert.equal(response.headers.get('x-request-id'), body.reference);
      assert.doesNotMatch(JSON.stringify(body), /origin|127\.0\.0\.1|attacker|secret-/i);
    }
    assert.equal(records.length, 3);
    const diagnostics = JSON.stringify(records);
    assert.match(diagnostics, /cart\.origin_rejected/);
    assert.match(diagnostics, /attacker\.example/);
    assert.doesNotMatch(diagnostics, /secret-query|secret-cookie|secret-token/);
  } finally {
    console.warn = warning;
    if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous;
    if (previousAliases === undefined) delete process.env.APP_ALLOWED_ORIGINS; else process.env.APP_ALLOWED_ORIGINS = previousAliases;
  }
});
