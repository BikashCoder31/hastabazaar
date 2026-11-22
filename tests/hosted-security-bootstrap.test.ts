import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { hostedSecurityWorkspace } from './helpers/hosted-security-workspace';
import { join } from 'node:path';
import { securityDatabase } from './helpers/security-database';
import { createHostedSecurityPolicy, provisionHostedSecurityPolicy, inspectHostedSecurityReadiness } from '../lib/security/hosted-policy';
import { totpAtCounter } from '../lib/security/crypto';
import type { SecurityPolicyBindings } from '../lib/security/runtime-policy';

const context: { bindings: SecurityPolicyBindings & { DB?: D1Database } } = { bindings: {} };
(globalThis as typeof globalThis & { hostedBootstrapFixture: typeof context }).hostedBootstrapFixture = context;
registerHooks({ resolve(specifier, parent, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,' + encodeURIComponent('export const env=new Proxy({}, {get(_,key){return globalThis.hostedBootstrapFixture.bindings[key]}})'), shortCircuit: true };
  return next(specifier, parent);
} });

void test('restricted hosted bootstrap can enroll through normal routes before final readiness without a readiness bypass', async () => {
  const workspace = await hostedSecurityWorkspace();
  const {temporary} = workspace, fixture = securityDatabase();
  const config = { HASTABAZAAR_RUNTIME_ENV: 'production', APP_ORIGIN: 'https://bootstrap.example.test',
    HASTABAZAAR_SECURITY_KEY: Buffer.alloc(32, 71).toString('base64url'), HASTABAZAAR_SECURITY_POLICY_ROOT: join(temporary, 'policy') };
  try {
    fixture.sqlite.exec("INSERT INTO users VALUES('owner','owner','owner@example.test','Owner','active',1); INSERT INTO user_roles VALUES('owner','super_admin')");
    const { passwordRecord } = await import('../lib/auth/hosted-session');
    const password = 'fictional-bootstrap-password', credential = await passwordRecord(password), now = Date.now();
    fixture.sqlite.prepare('INSERT INTO user_credentials VALUES(?,?,?,1,?,?)').run('owner', credential.hash, credential.salt, now, now);
    const token = 'fixture-hosted-bootstrap-session';
    fixture.sqlite.prepare('INSERT INTO user_sessions VALUES(?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'), 'owner', now + 3600000, now, now);
    await provisionHostedSecurityPolicy(config, fixture.db);
    context.bindings = { ...config, DB: fixture.db, SECURITY_POLICY: createHostedSecurityPolicy(config) };
    assert.equal((await inspectHostedSecurityReadiness(context.bindings, fixture.db)).ready, false);
    let cookie = 'hastabazaar_session=' + token;
    const request = (action: string, data: unknown) => new Request(config.APP_ORIGIN + '/api/security/' + action, { method: 'POST', headers: { origin: config.APP_ORIGIN, 'content-type': 'application/json', cookie }, body: JSON.stringify(data) });
    const accept = (response: Response) => { const session = response.headers.getSetCookie().find(value => value.startsWith('hastabazaar_session=')); if (session) cookie = session.split(';')[0]; };
    const { handleSecurityAction, securityStatus } = await import('../lib/security/controller');
    assert.equal((await securityStatus(new Request(config.APP_ORIGIN + '/api/security/status', { headers: { cookie } }))).status, 200);
    const setup = await handleSecurityAction(request('setup', { password }), 'setup');
    assert.equal(setup.status, 200); accept(setup);
    const detail = await setup.json() as { setupId: string; manualKey: string };
    const confirmed = await handleSecurityAction(request('confirm', { password, setupId: detail.setupId, code: totpAtCounter(detail.manualKey, Math.floor(Date.now() / 30000)) }), 'confirm');
    assert.equal(confirmed.status, 200);
    assert.equal((await inspectHostedSecurityReadiness(context.bindings, fixture.db)).ready, false);
    const active = await handleSecurityAction(request('confirm', { password, setupId: detail.setupId, acknowledge: true }), 'confirm');
    assert.equal(active.status, 200); accept(active);
    context.bindings = { ...config, DB: fixture.db, SECURITY_POLICY: createHostedSecurityPolicy(config) };
    assert.deepEqual(await inspectHostedSecurityReadiness(context.bindings, fixture.db), { ready: true, phase: 'initialized', reasonCodes: [], enrolled: 1, pending: 0 });
  } finally { context.bindings = {}; fixture.dispose(); await workspace.dispose(); }
});
