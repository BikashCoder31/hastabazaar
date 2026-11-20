import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, lstat, mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { assertPrivateCommerceNode, commercePolicyRecord, signedCommercePolicy, assertCommercePolicyProof, assertNativeCommerceOwner, createIsolatedCommercePolicy } from '../lib/security/isolated-commerce-policy';
const env = {
  NODE_ENV:'development' as const, HASTABAZAAR_RUNTIME_ENV:'local_staging',HASTABAZAAR_MAIL_MODE:'capture',
  HASTABAZAAR_PAYMENT_MODE:'simulated',HASTABAZAAR_RECIPIENT_DOMAIN:'local.hastabazaar.test',
  APP_ORIGIN:'http://127.0.0.1:41000',DB_HOST:'127.0.0.1',DB_PORT:'13329',DB_NAME:'native_123_fresh',DB_PASSWORD:'fictional',
  HASTABAZAAR_SECURITY_KEY:Buffer.alloc(32,4).toString('base64url'),HASTABAZAAR_COMMERCE_ARCHIVE_SHA256:'a'.repeat(64),
  HASTABAZAAR_COMMERCE_OWNER_TOKEN:'b'.repeat(48),HASTABAZAAR_COMMERCE_CONTAINER_ID:'c'.repeat(64),
  HASTABAZAAR_COMMERCE_POLICY_FILE:resolve('absent-commerce-policy.json'),
};
const marker={id:env.HASTABAZAAR_COMMERCE_CONTAINER_ID,token:env.HASTABAZAAR_COMMERCE_OWNER_TOKEN,name:'hastabazaar-native-123',host:'127.0.0.1',port:13329,database:env.DB_NAME,password:env.DB_PASSWORD};
const native={database_name:env.DB_NAME,hostname:'c'.repeat(12)};
void test('isolated policy binds exact signed artifact, owner and native database identity',()=>{
  assert.equal(commercePolicyRecord(env).initialized,true);assertCommercePolicyProof(env,signedCommercePolicy(env));assertNativeCommerceOwner(env,marker,native);
});
void test('isolated policy rejects production, canonical and non-fictional transport',()=>{
  for(const changes of [{NODE_ENV:'production' as const},{HASTABAZAAR_RUNTIME_ENV:'production'},{APP_ORIGIN:'http://localhost:3018'},{APP_ORIGIN:'http://127.0.0.1:3018'},{HASTABAZAAR_MAIL_MODE:'send'},{HASTABAZAAR_PAYMENT_MODE:'live'},{HASTABAZAAR_RECIPIENT_DOMAIN:'example.com'},{DB_NAME:'canonical'}])assert.throws(()=>commercePolicyRecord({...env,...changes}));
});
void test('isolated policy rejects tampered, foreign-key and absent proof',()=>{
  assert.throws(()=>assertCommercePolicyProof(env,{}));
  assert.throws(()=>assertCommercePolicyProof(env,{...signedCommercePolicy(env),initialized:false}));
  assert.throws(()=>assertCommercePolicyProof({...env,HASTABAZAAR_SECURITY_KEY:Buffer.alloc(32,5).toString('base64url')},signedCommercePolicy(env)));
});
void test('native proof rejects foreign database, container, token and credentials',()=>{
  for(const changes of [{token:'d'.repeat(48)},{id:'d'.repeat(64)},{database:'native_124_fresh'},{password:'foreign'},{name:'hastabazaar-native-124'}])assert.throws(()=>assertNativeCommerceOwner(env,{...marker,...changes},native));
  assert.throws(()=>assertNativeCommerceOwner(env,marker,{...native,database_name:'native_124_fresh'}));
  assert.throws(()=>assertNativeCommerceOwner(env,marker,{...native,hostname:'d'.repeat(12)}));
});
void test('absent private path and ordinary checkout cannot expose a policy or initialize it',async()=>{
  assert.throws(()=>createIsolatedCommercePolicy({...env,HASTABAZAAR_COMMERCE_POLICY_FILE:'relative.json'},{} as D1Database));
  let queried=false;const policy=createIsolatedCommercePolicy(env,{prepare(){queried=true;throw new Error('must not query');}} as unknown as D1Database);
  await assert.rejects(policy.read());await assert.rejects(policy.mark());assert.equal(queried,false);
});

void test('private node metadata rejects public modes, foreign owners, links and wrong types', () => {
  const node = {uid: 123, mode: 0o700, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false};
  assertPrivateCommerceNode(node, 123, true);
  for (const changes of [{mode: 0o777}, {mode: 0o750}, {uid: 124}, {isSymbolicLink: () => true}, {isDirectory: () => false}])
    assert.throws(() => assertPrivateCommerceNode({...node, ...changes}, 123, true));
  assert.throws(() => assertPrivateCommerceNode(node, 123, false));
});

void test('real POSIX paths admit exact private epoch and reject filesystem mutations', {skip: process.platform === 'win32'}, async t => {
  const temporary = await realpath(tmpdir());
  const root = await mkdtemp(resolve(temporary, 'hastabazaar-native-commerce-'));
  const originalCwd = process.cwd();
  const packageRoot = resolve(root, 'package'), proofPath = resolve(root, 'commerce-policy.json');
  const markerDirectory = resolve(root, '.superpowers/sdd/2026-10-16-staging-native-compatibility');
  const markerPath = resolve(markerDirectory, '.native-123.json');
  await mkdir(packageRoot, {mode: 0o700});
  await mkdir(markerDirectory, {recursive: true, mode: 0o700});
  const environment = {...env, HASTABAZAAR_COMMERCE_POLICY_FILE: proofPath, HASTABAZAAR_COMMERCE_NATIVE_MARKER: markerPath};
  const proof = signedCommercePolicy(environment);
  await writeFile(proofPath, JSON.stringify(proof), {mode: 0o600});
  await writeFile(markerPath, JSON.stringify(marker), {mode: 0o600});
  let queries = 0;
  const database = {prepare(sql: string) {
    queries++;
    if (sql.startsWith('SELECT DATABASE()')) return {first: async () => native};
    assert.equal(sql, 'SELECT value FROM marketplace_settings WHERE `key`=?');
    return {bind(key: string) {assert.equal(key, 'isolated-commerce-owner:' + env.HASTABAZAAR_COMMERCE_OWNER_TOKEN); return {first: async () => ({value: JSON.stringify(proof)})};}};
  }} as unknown as D1Database;
  const policy = createIsolatedCommercePolicy(environment, database);
  const rejectedBeforeDatabase = async () => {
    queries = 0; await assert.rejects(policy.read()); await assert.rejects(policy.mark()); assert.equal(queries, 0);
  };
  try {
    process.chdir(packageRoot);
    await t.test('valid private directory and file admission reaches both actual-proof queries', async () => {
      assert.equal(await policy.read(), true); assert.equal(queries, 2);
      await policy.mark(); assert.equal(queries, 4);
    });
    for (const path of [root, packageRoot, proofPath, markerPath]) {
      await t.test('reject public permissions: ' + path.slice(root.length || 0), async () => {
        const oldMode = (await lstat(path)).mode;
        try {await chmod(path, 0o777); await rejectedBeforeDatabase();} finally {await chmod(path, oldMode);}
      });
    }
    await t.test('real directory metadata rejects a foreign effective UID', async () => {
      assert.equal(typeof process.getuid, 'function');
      const posixProcess = process as NodeJS.Process & { getuid(): number };
      const realUid = posixProcess.getuid();
      const replacement = t.mock.method(posixProcess, 'getuid', () => realUid + 1);
      try {await rejectedBeforeDatabase();} finally {replacement.mock.restore();}
    });
    await t.test('same-named nested epoch/package is rejected', async () => {
      const nested = resolve(root, 'nested/package'); await mkdir(nested, {recursive: true, mode: 0o700});
      process.chdir(nested); try {await rejectedBeforeDatabase();} finally {process.chdir(packageRoot);}
    });
    for (const path of [proofPath, markerPath]) {
      await t.test('symlink file rejected: ' + path.slice(root.length), async () => {
        await rename(path, path + '.target'); await symlink(path + '.target', path);
        try {await rejectedBeforeDatabase();} finally {await rm(path); await rename(path + '.target', path);}
      });
    }
    await t.test('symlink package rejected even with a valid private target', async () => {
      process.chdir(originalCwd);
      const target = resolve(root, 'real-package'); await rename(packageRoot, target); await symlink(target, packageRoot, 'dir');
      // chdir resolves symlinks on POSIX; return the lexical caller path to exercise alias rejection too.
      const replacement = t.mock.method(process, 'cwd', () => packageRoot);
      try {await rejectedBeforeDatabase();} finally {replacement.mock.restore(); await rm(packageRoot); await rename(target, packageRoot); process.chdir(packageRoot);}
    });
    await t.test('symlink epoch is rejected', async () => {
      const alias = root.slice(0, -6) + 'ALIAS1'; await symlink(root, alias, 'dir');
      const replacement = t.mock.method(process, 'cwd', () => resolve(alias, 'package'));
      try {await rejectedBeforeDatabase();} finally {replacement.mock.restore(); await rm(alias);}
    });
    await t.test('proof in nested location is rejected', async () => {
      const misplaced = createIsolatedCommercePolicy({...environment, HASTABAZAAR_COMMERCE_POLICY_FILE: resolve(packageRoot, 'commerce-policy.json')}, database);
      await assert.rejects(misplaced.read());
    });
    assert.equal(await policy.read(), true, 'Filesystem restoration preserves valid admission');
  } finally {
    process.chdir(originalCwd);
    assert.equal(dirname(root), temporary);
    await rm(root, {recursive: true, force: true});
  }
});
