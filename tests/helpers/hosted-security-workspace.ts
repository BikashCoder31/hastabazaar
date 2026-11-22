import assert from 'node:assert/strict';
import {lstat,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Model a hosted app and its private sibling policy, both inside this checkout. */
export async function hostedSecurityWorkspace() {
  const project=resolve(fileURLToPath(new URL('../../',import.meta.url)));
  const parent=join(project,'.test-artifacts','t34','tmp');
  await mkdir(parent,{recursive:true});
  const temporary=await mkdtemp(join(parent,'hosted-security-owned-'));
  const application=join(temporary,'application');
  await mkdir(application);
  const original=process.cwd();
  process.chdir(application);
  return {temporary,async dispose(){
    process.chdir(original);
    assert.ok(resolve(temporary).startsWith(parent+sep));
    assert.equal((await lstat(temporary)).isSymbolicLink(),false);
    await rm(temporary,{recursive:true,force:true});
  }};
}
