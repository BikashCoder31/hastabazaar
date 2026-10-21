import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { accountingFixture } from './helpers/accounting-fixture';
const security = {
  db: null as D1Database | null,
  identity: null as null | {
    userId: string;
    email: string;
    mailboxVerified: boolean;
  },
};
(
  globalThis as typeof globalThis & { accountingSecurity: typeof security }
).accountingSecurity = security;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs: Record<string, string> = {
      'cloudflare:workers':
        'export const env={get DB(){return globalThis.accountingSecurity.db},HASTABAZAAR_RUNTIME_ENV:"local_staging"};',
      '@/app/auth': `export async function getAuthenticatedUser(){return globalThis.accountingSecurity.identity;} export async function requireAuthenticatedUser(url){const i=globalThis.accountingSecurity.identity;if(!i)throw new Error('redirect:/login?return_to='+encodeURIComponent(url));return i;}`,
      'next/navigation':
        'export function redirect(url){throw new Error("redirect:"+url)}',
    };
    if (stubs[specifier])
      return {
        url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]),
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
void test('real Accounting authorization rechecks a revoked or disabled Super Admin with the same identity', async () => {
  const f = await accountingFixture(true);
  security.db = f.db;
  try {
    f.insert('users', {
      id: 'acct-super',
      auth_subject: 'acct-identity',
      email: 'acct-super@example.test',
      display_name: 'Fictional Super',
      status: 'active',
      created_at: 1,
      updated_at: 1,
    });
    f.insert('user_roles', {
      user_id: 'acct-super',
      role: 'super_admin',
      assigned_at: 1,
    });
    const { GET } = await import('../app/api/admin/accounting/route');
    const { requireAccountingPageReader } =
      await import('../lib/accounting/access');
    const send = () =>
      GET(new Request('http://localhost:3018/api/admin/accounting'));
    security.identity = null;
    assert.equal((await send()).status, 401);
    security.identity = {
      userId: 'acct-identity',
      email: 'acct-super@example.test',
      mailboxVerified: false,
    };
    assert.equal((await send()).status, 200);
    assert.equal((await requireAccountingPageReader()).role, 'super_admin');
    f.sqlite.exec("DELETE FROM user_roles WHERE user_id='acct-super'");
    const before = f.queries.length;
    assert.equal((await send()).status, 403);
    await assert.rejects(
      () => requireAccountingPageReader(),
      /staff-access-denied/,
    );
    assert.ok(
      !f.queries.slice(before).some((s) => s.startsWith('WITH ')),
      'Revoked identity must not read financial data',
    );
    f.insert('user_roles', {
      user_id: 'acct-super',
      role: 'super_admin',
      assigned_at: 2,
    });
    f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='acct-super'");
    assert.equal((await send()).status, 403);
  } finally {
    security.db = null;
    security.identity = null;
    f.dispose();
  }
});
