import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
const state = { role: 'super_admin', reads: 0, authCalls: 0 };
(
  globalThis as typeof globalThis & { accountingAccess: typeof state }
).accountingAccess = state;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs: Record<string, string> = {
      'cloudflare:workers':
        'export const env={HASTABAZAAR_RUNTIME_ENV:"local_staging"};',
      'next/navigation':
        'export function redirect(url){throw new Error("redirect:"+url)}',
      '@/lib/auth/staff': `export class StaffAuthorizationError extends Error {constructor(message,status){super(message);this.status=status;}}
   export async function requireStaffApi(permission){const s=globalThis.accountingAccess;s.authCalls++;if(s.role==='anonymous')throw new StaffAuthorizationError('Sign in required.',401);return {id:'existing',role:s.role};}
   export async function requireStaffPage(url,permission){const s=globalThis.accountingAccess;s.authCalls++;if(s.role==='anonymous')throw new Error('redirect:/login?return_to='+encodeURIComponent(url));return {id:'existing',role:s.role};}`,
      '@/lib/db/d1':
        'export function requireDatabase(){globalThis.accountingAccess.reads++;return {}}',
      '@/lib/accounting/workspace':
        'export async function getAccountingWorkspace(db,query,observedAt,environment){return {query,observedAt,environment,metrics:[],rows:[],issues:[],coverage:[],nextCursor:null}}',
    };
    if (stubs[specifier])
      return {
        url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]),
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
void test('Accounting authenticates every GET before reading and rejects direct non-Super access', async () => {
  const route = await import('../app/api/admin/accounting/route').catch(
    () => null,
  );
  assert.ok(route, 'Accounting GET route must exist');
  for (const [role, status] of [
    ['anonymous', 401],
    ['admin', 403],
    ['staff', 403],
    ['seller', 403],
    ['customer', 403],
    ['super_admin', 200],
    ['admin', 403],
  ] as const) {
    state.role = role;
    state.reads = 0;
    const response = await route.GET(
      new Request('http://localhost:3018/api/admin/accounting'),
    );
    assert.equal(response.status, status, role);
    assert.equal(state.reads, status === 200 ? 1 : 0);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = JSON.stringify(await response.json());
    assert.doesNotMatch(
      body,
      /code_hash|password|destination_reference|authSubject|email/,
    );
  }
  assert.equal(state.authCalls, 7);
  state.role = 'super_admin';
  assert.equal(
    (
      await route.GET(
        new Request(
          'http://localhost:3018/api/admin/accounting?period=custom&from=bad&to=bad',
        ),
      )
    ).status,
    400,
  );
  assert.equal(route.dynamic, 'force-dynamic');
  assert.equal('POST' in route, false);
  assert.equal('PUT' in route, false);
  assert.equal('DELETE' in route, false);
});
void test('Accounting page guard uses the normal sign-in flow and current explicit Super Admin role', async () => {
  const access = await import('../lib/accounting/access').catch(() => null);
  assert.ok(access, 'Accounting page guard must exist');
  state.role = 'anonymous';
  await assert.rejects(
    () => access.requireAccountingPageReader(),
    /redirect:\/login\?return_to=%2Fadmin%2Faccounting/,
  );
  state.role = 'admin';
  await assert.rejects(
    () => access.requireAccountingPageReader(),
    /redirect:\/staff-access-denied/,
  );
  state.role = 'super_admin';
  assert.equal(
    (await access.requireAccountingPageReader()).role,
    'super_admin',
  );
  state.role = 'admin';
  await assert.rejects(
    () => access.requireAccountingPageReader(),
    /redirect:\/staff-access-denied/,
  );
});
void test('Accounting navigation is Super Admin only and has a real task guide', async () => {
  const { adminNavigation, adminTaskGuide } =
    await import('../lib/admin/navigation');
  assert.ok(
    adminNavigation('super_admin').some((i) => i.href === '/admin/accounting'),
  );
  for (const role of ['admin', 'staff', 'seller', 'customer'])
    assert.ok(
      !adminNavigation(role).some((i) => i.href === '/admin/accounting'),
    );
  assert.ok(adminTaskGuide('/admin/accounting', 'super_admin')?.steps.length);
});
