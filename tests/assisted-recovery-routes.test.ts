import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
const context = {
  db: null as D1Database | null,
  key: Buffer.from(randomBytes(32)).toString('base64url'),
};
(
  globalThis as typeof globalThis & { assistedRouteContext: typeof context }
).assistedRouteContext = context;
registerHooks({
  resolve(specifier, parent, next) {
    if (specifier === 'cloudflare:workers')
      return {
        url:
          'data:text/javascript,' +
          encodeURIComponent(
            "export const env={get DB(){return globalThis.assistedRouteContext.db},get HASTABAZAAR_SECURITY_KEY(){return globalThis.assistedRouteContext.key},SECURITY_POLICY:{async read(){return true},async mark(){}},APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RUNTIME_ENV:'local_staging'};",
          ),
        shortCircuit: true,
      };
    return next(specifier, parent);
  },
});
void test('recipient route requires same-origin bounded JSON and rate limits one invitation', async () => {
  const { POST } =
    await import('../app/api/security/assisted-recovery/complete/route');
  const f = securityDatabase();
  context.db = f.db;
  const request = (
    body: unknown,
    origin = 'http://localhost:3018',
    type = 'application/json',
  ) =>
    new Request(
      'http://localhost:3018/api/security/assisted-recovery/complete',
      {
        method: 'POST',
        headers: { origin, 'content-type': type },
        body: JSON.stringify(body),
      },
    );
  try {
    assert.equal((await POST(request({}, 'https://evil.test'))).status, 403);
    assert.equal(
      (await POST(request({}, 'http://localhost:3018', 'text/plain'))).status,
      415,
    );
    assert.equal(
      (await POST(request({ token: 'a'.repeat(9000) }))).status,
      413,
    );
    for (let n = 0; n < 5; n++)
      assert.equal(
        (await POST(request({ token: 'invalid-token', password: 'wrong' })))
          .status,
        409,
      );
    assert.equal(
      (await POST(request({ token: 'invalid-token', password: 'wrong' })))
        .status,
      429,
    );
  } finally {
    context.db = null;
    f.dispose();
  }
});
void test('issuance route does not accept anonymous or cross-site support requests', async () => {
  const { POST } = await import('../app/api/security/assisted-recovery/route');
  const f = securityDatabase();
  context.db = f.db;
  try {
    for (const [origin, status] of [
      ['https://evil.test', 403],
      ['http://localhost:3018', 401],
    ] as const) {
      const response = await POST(
        new Request('http://localhost:3018/api/security/assisted-recovery', {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: '{}',
        }),
      );
      assert.equal(response.status, status);
    }
  } finally {
    context.db = null;
    f.dispose();
  }
});
