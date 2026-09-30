import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { shortCircuit: true,
    url: 'data:text/javascript,export const env={get DB(){return globalThis.localLogoutDb}}' };
  if (specifier === 'next/headers') return { shortCircuit: true,
    url: 'data:text/javascript,export async function headers(){return globalThis.localLogoutHeaders}' };
  if (specifier === 'next/navigation') return { shortCircuit: true,
    url: 'data:text/javascript,export function redirect(){throw Error("Unexpected redirect")}' };
  return nextResolve(specifier, context);
} });
declare global { var localLogoutDb: D1Database; var localLogoutHeaders: Headers }

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY)');
  const token = 'fictional-hosted-logout-session';
  sqlite.prepare('INSERT INTO user_sessions(token_hash) VALUES (?)').run(createHash('sha256').update(token).digest('hex'));
  sqlite.prepare('INSERT INTO user_sessions(token_hash) VALUES (?)').run('unrelated-session-hash');
  globalThis.localLogoutDb = { prepare(sql: string) {
    const statement = sqlite.prepare(sql);
    return { bind(value: string) { return { async run() { return statement.run(value); } }; } };
  } } as unknown as D1Database;
  return { sqlite, token };
}
function applyExpiredCookies(requestHeaders: Headers, expired: string[]) {
  const cookies = new Map((requestHeaders.get('cookie') ?? '').split('; ').filter(Boolean)
    .map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)] as const; }));
  for (const value of expired) if (/Max-Age=0(?:;|$)/.test(value)) cookies.delete(value.slice(0, value.indexOf('=')));
  return new Headers({ host: requestHeaders.get('host') ?? '', cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') });
}

void test('the visible sign-out destination expires local role and hosted cookies and revokes only the current hosted session', async () => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: 'development' });
  const { sqlite, token } = fixture();
  try {
    const { signOutPath, getAuthenticatedUser } = await import('../app/auth');
    const { POST } = await import('../app/api/auth/logout/route');
    const request = new Request(new URL(signOutPath('/'), 'http://localhost:4173'), { method: 'POST', headers: { origin: 'http://localhost:4173',
      host: 'localhost:4173', cookie: `hastabazaar_local_test_role=buyer; hastabazaar_session=${token}`,
    } });
    globalThis.localLogoutHeaders = request.headers;
    assert.equal((await getAuthenticatedUser())?.userId, 'local-test-buyer');
    const response = await POST(request);
    assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.ok(cookies.includes('hastabazaar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'));
    assert.ok(cookies.includes('hastabazaar_local_test_role=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'));
    assert.deepEqual(sqlite.prepare('SELECT token_hash FROM user_sessions').all().map(row => row.token_hash), ['unrelated-session-hash']);
    globalThis.localLogoutHeaders = applyExpiredCookies(request.headers, cookies);
    assert.equal(await getAuthenticatedUser(), null, 'Expired local role must no longer override a signed-out hosted session');
  } finally { sqlite.close(); if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: previous }); }
});

void test('production logout preserves secure hosted-only cookie expiry and the safe return path', async () => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: 'production' });
  const { sqlite, token } = fixture();
  try {
    const { POST } = await import('../app/api/auth/logout/route');
    const request = new Request('https://hastabazaar.test/api/auth/logout?return_to=%2Fshop%3Fcategory%3Dcraft', { method: 'POST', headers: { origin: 'https://hastabazaar.test',
      host: 'hastabazaar.test', cookie: `hastabazaar_local_test_role=buyer; hastabazaar_session=${token}`,
    } });
    const response = await POST(request);
    assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/shop?category=craft');
    assert.deepEqual(response.headers.getSetCookie(), ['hastabazaar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure']);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n, 1);
  } finally { sqlite.close(); if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: previous }); }
});

void test('development on a nonloopback host remains hosted-only and external logout return paths stay rejected', async () => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: 'development' });
  const { sqlite, token } = fixture();
  try {
    const { POST } = await import('../app/api/auth/logout/route');
    const response = await POST(new Request('https://example.test/api/auth/logout?return_to=%2F%2Fevil.test', { method: 'POST', headers: { origin: 'https://example.test',
      host: 'example.test', cookie: `hastabazaar_local_test_role=buyer; hastabazaar_session=${token}`,
    } }));
    assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/');
    assert.deepEqual(response.headers.getSetCookie(), ['hastabazaar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0']);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n, 1);
  } finally { sqlite.close(); if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: previous }); }
});

void test('cross-site GET logout does not revoke sessions or expire cookies, while cross-site POST is rejected', async () => {
  const { sqlite, token } = fixture();
  try {
    const { GET, POST } = await import('../app/api/auth/logout/route');
    const request = new Request('https://app.test/api/auth/logout?return_to=%2Fshop', { headers: {
      cookie: `hastabazaar_session=${token}`, 'sec-fetch-site': 'cross-site', origin: 'https://attacker.test',
    } });
    const response = await GET(request);
    assert.equal(response.headers.getSetCookie().length, 0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM user_sessions').get()?.n, 2);
    assert.equal((await POST(new Request(request.url, { method: 'POST', headers: request.headers }))).status, 403);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM user_sessions').get()?.n, 2);
  } finally { sqlite.close(); }
});
