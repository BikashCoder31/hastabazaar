import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLocalEnvironment } from '../scripts/start-local.mjs';
import { resolveDisposableStagingPaths, stagingMarker } from '../scripts/staging/guards.mjs';

void test('product media activation reuses canonical checkout and staging checks without touching data',async()=>{
  const mediaModule=await import('../scripts/staging/product-watermark-plugin');
  assert.equal(typeof mediaModule.localProductMediaPlugin,'function','Checked local photo activation must exist');
  const root=await mkdtemp(join(tmpdir(),'hastabazaar-media-guard-'));
  // Keep this tiny temporary history; no existing repository or database is changed.
  const git=(args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true}).trim();
  git(['init','--quiet']);await writeFile(join(root,'fixture.txt'),'SIMULATED guard test\n');git(['add','fixture.txt']);
  git(['-c','user.name=Local QA','-c','user.email=qa@local.hastabazaar.test','-c','commit.gpgsign=false','commit','--quiet','-m','Temporary guard fixture']);
  const baseline=git(['rev-parse','HEAD']);
  git(['config','hastabazaar.localProjectRoot',root]);git(['config','hastabazaar.localBaseline',baseline]);
  const environment=createLocalEnvironment({});
  const paths=resolveDisposableStagingPaths(root,environment);
  await mkdir(paths.root);
  await writeFile(paths.marker,JSON.stringify(stagingMarker(paths)));
  const activate=(env=environment,command:'serve'|'build'='serve',cwd=root)=>mediaModule.localProductMediaPlugin(env,root,command,cwd);
  assert.equal((await activate()).name,'hastabazaar-local-product-watermark');
  await assert.rejects(activate({...environment,NODE_ENV:'production'}),/development|nonproduction/i);
  await assert.rejects(activate(environment,'build'),/serve|development/i);
  await assert.rejects(activate({...environment,HASTABAZAAR_LOCAL_RIDER_DECODER:'1'}),/must be absent/i);
  await assert.rejects(activate({...environment,HASTABAZAAR_MAIL_MODE:'smtp'}),/conflict|capture/i);
  await assert.rejects(activate(environment,'serve',tmpdir()),/canonical|directory|checkout/i);
  git(['config','hastabazaar.localBaseline','f'.repeat(40)]);
  await assert.rejects(activate(),/baseline|older|descend/i);
  git(['config','hastabazaar.localBaseline',baseline]);
  const marker=await readFile(paths.marker,'utf8');
  await writeFile(paths.marker,'{}');await assert.rejects(activate(),/marker|staging|scope/i);
  await unlink(paths.marker);await assert.rejects(activate(),/marker|ENOENT|staging/i);
  await writeFile(paths.marker,marker);
  assert.equal((await activate()).name,'hastabazaar-local-product-watermark');
});
