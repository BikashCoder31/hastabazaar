import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import * as packagedBrowser from '../scripts/testing/verify-packaged-browser-gates.mjs';
import {
  assertLoopbackOrigin,
  assertHostedBrowserState,
  safeChildEnvironment,
  withOwnedProcesses,
  assertRecordedIdentity,
  createRecordedBrowserLauncher,
} from '../scripts/testing/verify-packaged-browser-gates.mjs';

type FixtureChild = { process: ChildProcess; exited: Promise<number | null> };

async function fixtureExit(child: FixtureChild) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([child.exited, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Owned fixture cleanup deadline')), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

// A failed regression assertion must not strand its real, exactly acquired fixtures.
async function cleanupFixtures(children: FixtureChild[]) {
  const results = await Promise.allSettled(children.map(async (child) => {
    child.process.kill('SIGKILL');
    await fixtureExit(child);
  }));
  assert.ok(results.every((result) => result.status === 'fulfilled'), 'Exact fixture backstop failed');
}

async function ready(child: { process: ChildProcess; exited: Promise<number | null> }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([once(child.process.stdout!, 'data'), child.exited.then(() => { throw new Error('Owned fixture exited before readiness'); }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Owned fixture readiness deadline')), 5000); })]);
  } finally { clearTimeout(timer); }
}

void test('packaged browser inputs refuse retained listeners and weakened session state', () => {
  assert.equal(assertLoopbackOrigin('http://127.0.0.1:43219'), 'http://127.0.0.1:43219');
  for (const origin of ['http://localhost:3018', 'http://0.0.0.0:43219', 'https://127.0.0.1:43219',
    'http://user:secret@127.0.0.1:43219', 'http://127.0.0.1:43219/path', 'http://127.0.0.1:43219?x=1'])
    assert.throws(() => assertLoopbackOrigin(origin));
  const cookie = { name: 'hastabazaar_session', value: 'fictional-opaque-session', domain: '127.0.0.1',
    path: '/', secure: true, httpOnly: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 600 };
  assertHostedBrowserState({ cookies: [cookie], origins: [] }, 'http://127.0.0.1:43219');
  for (const patch of [{ secure: false }, { httpOnly: false }, { domain: 'example.test' },
    { name: 'hastabazaar_local_test_role' }, { expires: 1 }])
    assert.throws(() => assertHostedBrowserState({ cookies: [{ ...cookie, ...patch }], origins: [] }, 'http://127.0.0.1:43219'));
  assert.throws(() => assertHostedBrowserState({ cookies: [cookie, cookie], origins: [] }, 'http://127.0.0.1:43219'));
  assert.throws(() => assertHostedBrowserState({ cookies: [cookie], origins: [{ origin: 'http://127.0.0.1:43219', localStorage: [] }] }, 'http://127.0.0.1:43219'));
});

void test('browser children receive no ambient database, host, native or service authority', () => {
  const environment = safeChildEnvironment({ PATH: 'fictional-path', TMPDIR: 'fictional-temp',
    PLAYWRIGHT_MODULE: 'file:///fixture/playwright.mjs', CHROME_PATH: '/fixture/chromium',
    DB_PASSWORD: 'private', HASTABAZAAR_SECURITY_KEY: 'private', HATSKALA_STAGING_NATIVE: '1',
    SMTP_HOST: 'mail.invalid', NODE_OPTIONS: '--require untrusted', APP_ORIGIN: 'https://retained.invalid' });
  assert.deepEqual(environment, { NODE_ENV: 'development', PATH: 'fictional-path', TMPDIR: 'fictional-temp',
    PLAYWRIGHT_MODULE: 'file:///fixture/playwright.mjs', CHROME_PATH: '/fixture/chromium' });
});

void test('owned child is stopped and awaited when setup throws after acquisition', async () => {
  let pid: number | undefined;
  await assert.rejects(withOwnedProcesses(async (owner) => {
    const child = owner.start(process.execPath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], { env: safeChildEnvironment(process.env) });
    pid = child.process.pid;
    await ready(child);
    throw new Error('fictional setup failure');
  }), /fictional setup failure/);
  assert.ok(pid);
  assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' });
});

void test('owned commands retain nonzero status and bound a hung child lifetime', async () => {
  await withOwnedProcesses(async (owner) => {
    const failed = await owner.run(process.execPath, ['-e', 'process.exit(23)'], { env: safeChildEnvironment(process.env) });
    assert.equal(failed.code, 23);
    const hung = owner.start(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { env: safeChildEnvironment(process.env) });
    await assert.rejects(owner.wait(hung, 50), /deadline/);
  });
});

void test('owned child overflow failure still stops and awaits every acquired child', { timeout: 20_000 }, async () => {
  const children: FixtureChild[] = [];
  let overflowObserved = false, deadlineObserved = false;
  try {
    await assert.rejects(withOwnedProcesses(async (owner) => {
      const app = owner.start(process.execPath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], { env: safeChildEnvironment(process.env) });
      children.push(app); await ready(app);
      const testChild = owner.start(process.execPath, ['-e', 'process.stdout.write("x".repeat(4*1024*1024+65536));setInterval(()=>{},1000)'], { env: safeChildEnvironment(process.env) });
      children.push(testChild);
      for (let attempt = 0; attempt < 500 && !testChild.truncated; attempt++) await delay(10);
      overflowObserved = testChild.truncated === true;
      try { await owner.wait(testChild, 50); } catch (error) {
        deadlineObserved = error instanceof Error && error.message === 'Owned child deadline exceeded';
        throw error;
      }
    }, 100));
    assert.equal(overflowObserved, true, 'The regression must actually cross the diagnostic bound');
    assert.equal(deadlineObserved, true, 'The later child must remain alive until its bounded timeout');
    for (const child of children) {
      assert.throws(() => process.kill(child.process.pid!, 0), { code: 'ESRCH' });
      await fixtureExit(child);
    }
    assert.equal(children.length, 2);
  } finally { await cleanupFixtures(children); }
});

void test('owned child cancellation and repeated close share one cleanup lifecycle', { timeout: 20_000 }, async () => {
  const children: FixtureChild[] = [];
  try {
    await withOwnedProcesses(async (owner) => {
      const child = owner.start(process.execPath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], { env: safeChildEnvironment(process.env) });
      children.push(child); await ready(child);
      const first = owner.close(), second = owner.close();
      const settled = Promise.allSettled([first, second]);
      try { assert.equal(first, second); } finally { await settled; }
      await first;
      assert.equal(owner.close(), first);
      assert.throws(() => owner.start(process.execPath, [], {}), /cleanup starts/);
      assert.throws(() => process.kill(child.process.pid!, 0), { code: 'ESRCH' });
      await fixtureExit(child);
    }, 100);
  } finally { await cleanupFixtures(children); }
});

void test('portable cleanup refusal continues other owners and retains private ownership state', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'packaged-browser-refusal-model-'));
  const children: FixtureChild[] = [];
  const record = join(root, 'private-ownership-record');
  try {
    await writeFile(record, 'fictional sole ownership evidence', { flag: 'wx', mode: 0o600 });
    await withOwnedProcesses(async (refusedOwner) => {
      const refused = refusedOwner.start(process.execPath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], { env: safeChildEnvironment(process.env) });
      children.push(refused); await ready(refused);
      await withOwnedProcesses(async (safeOwner) => {
        const safe = safeOwner.start(process.execPath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], { env: safeChildEnvironment(process.env) });
        children.push(safe); await ready(safe);
        // Portable orchestration model only: no injected callback can authenticate or signal a browser group.
        let failure: unknown;
        await assert.rejects(packagedBrowser.closeOwnedResources([{ async close() { throw new Error('fictional-private-identity-diagnostic'); } }, safeOwner],
          () => rm(root, { recursive: true, force: true })), (error: unknown) => { failure = error; return true; });
        assert.doesNotThrow(() => process.kill(refused.process.pid!, 0));
        assert.throws(() => process.kill(safe.process.pid!, 0), { code: 'ESRCH' });
        await fixtureExit(safe);
        assert.equal(await readFile(record, 'utf8'), 'fictional sole ownership evidence');
        assert.ok(failure instanceof AggregateError);
        assert.equal(failure.errors.length, 1);
        assert.doesNotMatch(failure.errors.map((error: Error) => error.message).join('\n'), /fictional-private/);
      }, 100);
    }, 100);
  } finally { await cleanupFixtures(children); await rm(root, { recursive: true, force: true }); }
});

void test('portable cleanup diagnostics surface nested causes, omit private content and attempt every owner', async () => {
  const privateValues = ['private-argv-cookie-nonce-path-record', '/private/ownership/record', 'UNKNOWN_PRIVATE_CODE'];
  const errno = Object.assign(new Error(privateValues.join(' ')), { code: 'ESRCH', path: privateValues[1],
    cause: Object.assign(new Error(privateValues[0]), { code: 'EACCES' }) });
  const assertion = new assert.AssertionError({ message: privateValues[0], actual: privateValues[1], expected: privateValues[0] });
  const attempted: string[] = [];
  let innerClosed = false, outerClosed = false;
  let failure: unknown;
  await assert.rejects(packagedBrowser.closeOwnedResources([
    { async close() {
      attempted.push('nested');
      await packagedBrowser.closeOwnedResources([
        { async close() { attempted.push('errno'); throw new AggregateError([errno], privateValues[0]); } },
        { async close() { attempted.push('inner-safe'); } },
      ], async () => { innerClosed = true; });
    } },
    { async close() { attempted.push('assertion'); throw assertion; } },
    { async close() { attempted.push('unknown'); throw Object.assign(new Error(privateValues[0]), { code: privateValues[2] }); } },
    { async close() { attempted.push('outer-safe'); } },
  ], async () => { outerClosed = true; }), (error: unknown) => { failure = error; return true; });
  assert.deepEqual(attempted, ['nested', 'errno', 'inner-safe', 'assertion', 'unknown', 'outer-safe']);
  assert.equal(innerClosed, false); assert.equal(outerClosed, false);
  assert.ok(failure instanceof AggregateError);
  assert.equal(failure.errors.length, 3, 'Each refused owner remains a failure, including ESRCH');
  assert.match(failure.message, /resource-close:ESRCH/);
  assert.match(failure.message, /resource-close:EACCES/);
  assert.match(failure.message, /resource-close:assertion/);
  assert.match(failure.message, /resource-close:unknown/);
  assert.ok(failure.message.length <= 512, 'The terminal reporting boundary must remain bounded');
  assert.ok((failure.message.match(/resource-close:/g) ?? []).length <= 8);
  const publicErrors = failure.errors as Error[];
  const diagnostic = publicErrors.map((error) => error.message).join('\n');
  assert.match(diagnostic, /resource-close:ESRCH/);
  assert.match(diagnostic, /resource-close:EACCES/);
  assert.match(diagnostic, /resource-close:assertion/);
  assert.match(diagnostic, /resource-close:unknown/);
  for (const error of [failure, ...publicErrors]) {
    assert.equal(error.cause, undefined, 'No original private cause object may escape');
    const publicState = [JSON.stringify(error), error.message, error.stack ?? ''].join('\n');
    for (const value of privateValues) assert.equal(publicState.includes(value), false);
  }
});

void test('portable cleanup diagnostics bound nested aggregates and reject arbitrary error codes', async () => {
  const privateValue = 'private-diagnostic-content';
  let nested: Error = Object.assign(new Error(privateValue), { code: 'EPERM' });
  for (let index = 0; index < 20; index++) nested = new AggregateError(Array.from({ length: 20 }, () => nested), privateValue);
  const attempted: string[] = [];
  let closed = false;
  const failure = await packagedBrowser.closeOwnedResources([
    { async close() { attempted.push('nested'); throw nested; } },
    { async close() { attempted.push('unknown'); throw Object.assign(new Error(privateValue), { code: 'EACCES ' + privateValue }); } },
    { async close() { attempted.push('safe'); } },
  ], async () => { closed = true; }).then(() => assert.fail('Nested failures must remain rejected'), (error: unknown) => error);
  assert.deepEqual(attempted, ['nested', 'unknown', 'safe']); assert.equal(closed, false);
  assert.ok(failure instanceof AggregateError);
  assert.equal(failure.errors.length, 2);
  assert.match(failure.message, /resource-close:unknown/);
  assert.doesNotMatch(failure.message, /EPERM|resource-close:EACCES/, 'Truncated or unallowlisted causes must not be claimed');
  assert.ok((failure.message.match(/resource-close:/g) ?? []).length <= 8);
  for (const error of [failure, ...failure.errors as Error[]]) {
    assert.ok(error.message.length <= 512, 'Public classification is bounded independently of input size');
    assert.match(error.message, /resource-close:unknown/);
    assert.equal(error.message.includes(privateValue), false);
    assert.equal(error.cause, undefined);
  }
});

void test('portable cleanup classification cannot abandon owners for hostile error shapes', async () => {
  const privateValue = 'private-hostile-error-shape';
  const getter = Object.defineProperties({}, {
    code: { get() { throw new Error(privateValue); } },
    cause: { get() { throw new Error(privateValue); } },
    errors: { get() { throw new Error(privateValue); } },
  });
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(privateValue); }, getPrototypeOf() { throw new Error(privateValue); } });
  const shapes: unknown[] = [getter, proxy, null, privateValue];
  const attempted: number[] = [];
  let closed = false;
  const failure = await packagedBrowser.closeOwnedResources([
    ...shapes.map((shape, index) => ({ async close() { attempted.push(index); throw shape; } })),
    { async close() { attempted.push(shapes.length); } },
  ], async () => { closed = true; }).then(() => assert.fail('All refusals must be retained'), (error: unknown) => error);
  assert.deepEqual(attempted, [0, 1, 2, 3, 4]); assert.equal(closed, false);
  assert.ok(failure instanceof AggregateError); assert.equal(failure.errors.length, shapes.length);
  assert.match(failure.message, /resource-close:unknown/);
  assert.ok(failure.message.length <= 512, 'Hostile inputs cannot expand the terminal reporting boundary');
  for (const error of [failure, ...failure.errors as Error[]]) {
    assert.match(error.message, /resource-close:unknown/);
    assert.equal(error.message.includes(privateValue), false); assert.equal(error.cause, undefined);
  }
});

void test('browser ownership refuses malformed or changed Linux start identity before signaling', () => {
  const identity = { pid: 231, uid: 1000, pgid: 231, session: 231, startTicks: '123456' };
  assertRecordedIdentity(identity, { ...identity });
  for (const patch of [{ pid: 232 }, { uid: 1001 }, { pgid: 232 }, { session: 232 }, { startTicks: '123457' }])
    assert.throws(() => assertRecordedIdentity(identity, { ...identity, ...patch }));
  for (const patch of [{ pid: 0 }, { uid: -1 }, { pgid: 232 }, { session: 232 }, { startTicks: 'invalid' }])
    assert.throws(() => assertRecordedIdentity({ ...identity, ...patch }, { ...identity, ...patch }));
});

void test('Linux recorded detached browser-like child stops and malformed ownership is refused', { skip: process.platform !== 'linux', timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'packaged-browser-lifetime-'));
  try {
    const browser = await createRecordedBrowserLauncher(root, process.execPath);
    await withOwnedProcesses(async (owner) => {
      const child = owner.start(browser.executablePath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], { env: safeChildEnvironment(process.env) });
      await ready(child);
      assert.equal(await browser.close(), 1);
      await owner.wait(child, 1000);
      assert.throws(() => process.kill(child.process.pid!, 0), { code: 'ESRCH' });
    });
    const malformedRoot = join(root, 'malformed'); await mkdir(malformedRoot, { mode: 0o700 });
    const malformed = await createRecordedBrowserLauncher(malformedRoot, process.execPath);
    await writeFile(join(malformedRoot, 'browser-processes', '999999.pid'), 'malformed', { flag: 'wx', mode: 0o600 });
    await assert.rejects(malformed.close(), AggregateError);
  } finally { await rm(root, { recursive: true, force: true }); }
});

void test('Linux recorded refusal skips no valid group and preserves private records on repeated close', { skip: process.platform !== 'linux', timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'packaged-browser-multiple-groups-'));
  const children: FixtureChild[] = [];
  try {
    const browser = await createRecordedBrowserLauncher(root, process.execPath);
    await withOwnedProcesses(async (owner) => {
      for (let index = 0; index < 2; index++) {
        const child = owner.start(browser.executablePath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], { env: safeChildEnvironment(process.env) });
        children.push(child); await ready(child);
      }
      const directory = join(root, 'browser-processes');
      const names = await readdir(directory);
      assert.equal(names.length, 2);
      const refusedPath = join(directory, names[0]);
      const original = await readFile(refusedPath, 'utf8');
      const fields = original.trim().split(' ');
      fields[4] = String(BigInt(fields[4]) + BigInt(1)); // Authenticated record shape, mismatched actual start identity.
      await writeFile(refusedPath, `${fields.join(' ')}\n`, { mode: 0o600 });
      const refused = children.find((child) => child.process.pid === Number(fields[0]))!;
      const safe = children.find((child) => child !== refused)!;
      assert.ok(refused && safe);
      const first = browser.close(), second = browser.close();
      const results = await Promise.allSettled([first, second]);
      assert.ok(results.every((result) => result.status === 'rejected'));
      assert.equal(first, second);
      await assert.rejects(packagedBrowser.closeOwnedResources([browser], () => rm(root, { recursive: true, force: true })), AggregateError);
      assert.doesNotThrow(() => process.kill(refused.process.pid!, 0));
      assert.throws(() => process.kill(safe.process.pid!, 0), { code: 'ESRCH' });
      await fixtureExit(safe);
      assert.equal((await readdir(directory)).length, 2);
      assert.equal(await readFile(refusedPath, 'utf8'), `${fields.join(' ')}\n`);
    }, 100);
  } finally { await cleanupFixtures(children); await rm(root, { recursive: true, force: true }); }
});
