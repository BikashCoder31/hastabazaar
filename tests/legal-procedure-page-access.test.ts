import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { totpAtCounter } from '../lib/security/crypto';
import { MfaService } from '../lib/security/mfa';
import { SecurityStore } from '../lib/security/store';
import { securityDatabase } from './helpers/security-database';

const context = {
  db: null as D1Database | null,
  key: '',
  runtime: 'production',
  headers: new Headers(),
};
Object.assign(globalThis, { legalPageAccessContext: context });
registerHooks({
  resolve(specifier, parent, next) {
    const stubs: Record<string, string> = {
      'cloudflare:workers': `export const env={
        get DB(){return globalThis.legalPageAccessContext.db},
        get HASTABAZAAR_SECURITY_KEY(){return globalThis.legalPageAccessContext.key},
        get HASTABAZAAR_RUNTIME_ENV(){return globalThis.legalPageAccessContext.runtime},
        APP_ORIGIN:'http://localhost:3018',
        HASTABAZAAR_LOCAL_SKIP_STAFF_MFA:'1',
        SECURITY_POLICY:{async read(){return true},async mark(){}},
      };`,
      'next/headers': 'export async function headers(){return globalThis.legalPageAccessContext.headers}',
      'next/navigation': 'export function redirect(path){throw new Error("redirect:"+path)}',
    };
    return stubs[specifier]
      ? { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true }
      : next(specifier, parent);
  },
});

const owner = 'local-test-super-admin';
const ownerCookie = 'hastabazaar_local_test_role=super_admin';
const draftPath = '/admin/legal-policies';
const readerPath = '/admin/legal-policies/active';

async function fixture(mode: 'development' | 'production', now: number) {
  const f = securityDatabase();
  const previousNodeEnv = process.env.NODE_ENV;
  Reflect.set(process.env, 'NODE_ENV', mode);
  context.db = f.db;
  context.key = Buffer.from(randomBytes(32)).toString('base64url');
  context.runtime = mode === 'production' ? 'production' : 'local_staging';
  const support = 'fixture-support-admin';
  for (const [id, role, email] of [
    [owner, 'super_admin', 'superadmin@local.hastabazaar.test'],
    [support, 'admin', 'support@example.test'],
  ] as const) {
    f.sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id, id, email, id, 'active', now);
    f.sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run(id, role);
  }
  f.sqlite.exec(`CREATE TABLE staff_permission_profiles (
    user_id TEXT PRIMARY KEY, permissions_json TEXT, version INTEGER, updated_by TEXT, updated_at INTEGER
  )`);
  const permissions = f.sqlite.prepare('INSERT OR REPLACE INTO staff_permission_profiles VALUES (?,?,1,?,?)');
  permissions.run(support, '["support.manage"]', owner, now);
  const store = new SecurityStore(f.db, context.key);
  await store.initialize([owner, support], now);
  const mfa = new MfaService(store);

  function createSession(userId: string, at: number) {
    const token = Buffer.from(randomBytes(32)).toString('base64url');
    const sessionHash = createHash('sha256').update(token).digest('hex');
    f.sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)')
      .run(sessionHash, userId, at + 8 * 3_600_000, at, at);
    return { sessionHash, cookie: 'hastabazaar_session=' + token };
  }

  async function enroll(userId: string) {
    const { sessionHash } = createSession(userId, now);
    const options = { userId, sessionHash, now };
    const setup = await mfa.beginSetup(options);
    await mfa.confirmSetup({
      ...options, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(now / 30_000)),
    });
    await mfa.activateSetup({ ...options, setupId: setup.setupId, passwordVerifiedAt: now, recoverySaved: true });
    return setup.secret;
  }

  return {
    support, permissions, mfa, enroll, createSession,
    close() {
      if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
      else Reflect.set(process.env, 'NODE_ENV', previousNodeEnv);
      context.db = null;
      context.headers = new Headers();
      f.dispose();
    },
  };
}

void test('both legal pages accept the same enrolled local testing session as the admin layout', async () => {
  const f = await fixture('development', Date.now());
  try {
    await f.enroll(owner);
    context.headers = new Headers({ host: 'localhost:3018', cookie: ownerCookie });
    const { requireStaffPage } = await import('../lib/auth/staff');
    const { requireLegalDraftPage, requireLegalProcedureReaderPage } = await import('../lib/legal-procedures/access');
    assert.equal((await requireStaffPage('/admin')).id, owner);
    assert.equal((await requireLegalDraftPage()).actor.id, owner);
    assert.equal((await requireLegalProcedureReaderPage()).actor.id, owner);
  } finally {
    f.close();
  }
});

void test('production legal pages send first-factor sessions to security with the original destination', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const f = await fixture('production', now);
  try {
    const ownerSecret = await f.enroll(owner);
    const supportSecret = await f.enroll(f.support);
    now += 30_000;
    const ownerSession = f.createSession(owner, now);
    const supportSession = f.createSession(f.support, now);
    const { requireLegalDraftPage, requireLegalProcedureReaderPage } = await import('../lib/legal-procedures/access');
    const legalPages = [[draftPath, requireLegalDraftPage], [readerPath, requireLegalProcedureReaderPage]] as const;
    for (const [path, guard] of legalPages) {
      context.headers = new Headers({ host: 'localhost:3018', cookie: ownerCookie });
      await assert.rejects(guard, { message: 'redirect:/login?return_to=' + encodeURIComponent(path) });
      context.headers.set('cookie', ownerCookie + '; ' + ownerSession.cookie);
      await assert.rejects(guard, { message: 'redirect:/security?return_to=' + encodeURIComponent(path) });
    }

    for (const [userId, secret, session] of [
      [owner, ownerSecret, ownerSession], [f.support, supportSecret, supportSession],
    ] as const) {
      await f.mfa.verifyTotp({
        userId, sessionHash: session.sessionHash, passwordVerifiedAt: now, now,
        code: totpAtCounter(secret, Math.floor(now / 30_000)),
      });
    }
    assert.equal((await requireLegalDraftPage()).actor.id, owner);
    assert.equal((await requireLegalProcedureReaderPage()).actor.id, owner);
    context.headers.set('cookie', supportSession.cookie);
    await assert.rejects(requireLegalDraftPage, { message: 'redirect:/staff-access-denied' });
    assert.equal((await requireLegalProcedureReaderPage()).actor.id, f.support);
    f.permissions.run(f.support, '[]', owner, now);
    await assert.rejects(requireLegalProcedureReaderPage, { message: 'redirect:/staff-access-denied' });
  } finally {
    f.close();
  }
});
