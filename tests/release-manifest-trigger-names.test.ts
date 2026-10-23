import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

void test('release manifest records actual guarded trigger names for native readiness',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hb-manifest-trigger-names-'));
 try{
  const source=JSON.parse(await readFile(new URL('../deployment/babal/release-manifest.json',import.meta.url),'utf8')) as {migrations:{path:string}[]};
  for(const {path} of source.migrations){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),'');}
  await writeFile(join(root,'deployment/babal/mariadb-customer-service-fee-waivers.sql'),await readFile(new URL('../deployment/babal/mariadb-customer-service-fee-waivers.sql',import.meta.url)));
  await writeFile(join(root,'deployment/babal/mariadb-schema.sql'),
   'CREATE TABLE IF NOT EXISTS users (id BIGINT PRIMARY KEY) ENGINE=InnoDB;\n'+
   'CREATE TRIGGER IF NOT EXISTS fixture_plain BEFORE INSERT ON users FOR EACH ROW SET NEW.id=1;\n'+
   'CREATE TRIGGER IF NOT EXISTS `fixture_quoted` BEFORE UPDATE ON users FOR EACH ROW SET NEW.id=1;\n'+
   'CREATE TRIGGER fixture_standard BEFORE DELETE ON users FOR EACH ROW BEGIN SIGNAL SQLSTATE \'45000\'; END;');
  await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/generate-release-manifest.mjs',import.meta.url))],
   {cwd:root,env:{...process.env,HASTABAZAAR_RELEASE_ID:'fixture-trigger-names'}});
  const result=JSON.parse(await readFile(join(root,'deployment/babal/release-manifest.json'),'utf8')) as {release:string;requiredTriggers:Record<string,string[]>};
  assert.equal(result.release,'fixture-trigger-names');
  for(const name of ['fixture_plain','fixture_quoted','fixture_standard'])assert.ok(name in result.requiredTriggers,name);
  assert.equal('IF' in result.requiredTriggers,false,'SQL IF NOT EXISTS is a modifier, not a database trigger');
 }finally{await rm(root,{recursive:true,force:true});}
});
