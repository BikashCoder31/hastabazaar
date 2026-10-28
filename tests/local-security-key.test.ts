import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

void test('local security key is durable and never replaced during restart',async()=>{
  const {provisionLocalSecurityKey}=await import('../scripts/staging/security-key.mjs');
  const root=await mkdtemp(join(tmpdir(),'hzb-key-fixture-'));
  await mkdir(join(root,'.staging'));
  const first=await provisionLocalSecurityKey(root,false);
  const again=await provisionLocalSecurityKey(root,true);
  assert.match(first,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(again,first);
  assert.ok((await readFile(join(root,'.staging/security/key.json'),'utf8')).includes(first));
});
void test('missing or malformed key never replaces encrypted security records',async()=>{
  const {provisionLocalSecurityKey}=await import('../scripts/staging/security-key.mjs');
  const root=await mkdtemp(join(tmpdir(),'hzb-key-fixture-'));
  await mkdir(join(root,'.staging/security'),{recursive:true});
  await assert.rejects(()=>provisionLocalSecurityKey(root,true),/missing/i);
  await writeFile(join(root,'.staging/security/key.json'),'broken');
  await assert.rejects(()=>provisionLocalSecurityKey(root,false),/invalid/i);
  assert.equal(await readFile(join(root,'.staging/security/key.json'),'utf8'),'broken');
});
void test('checked launch rejects files that shadow its protected Worker key',async()=>{
  const {verifyLocalEnvironmentFiles}=await import('../scripts/start-local.mjs');
  const dev=await mkdtemp(join(tmpdir(),'hzb-key-precedence-'));
  await writeFile(join(dev,'.dev.vars'),'# even an empty file suppresses Worker process secrets\n');
  await assert.rejects(()=>verifyLocalEnvironmentFiles(dev),/\.dev.vars/i);
  const env=await mkdtemp(join(tmpdir(),'hzb-key-precedence-'));
  await writeFile(join(env,'.env.local'),'HASTABAZAAR_SECURITY_KEY=fictional-not-a-secret\n');
  await assert.rejects(()=>verifyLocalEnvironmentFiles(env),/security key/i);
});
