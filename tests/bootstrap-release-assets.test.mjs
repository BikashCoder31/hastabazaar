import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import test from 'node:test';
import {readReleaseAssets,releaseManifestPath,releaseSchemaPath} from '../scripts/release-schema-assets.mjs';
void test('release reader admits only the exact fresh companion as an additional empty-only asset',async()=>{
 const parent=resolve('.test-artifacts/t33/complete-bootstrap-parity-astra-20261105/release-reader');await mkdir(parent,{recursive:true});
 const root=await mkdtemp(resolve(parent,'case-'));await mkdir(resolve(root,'deployment/babal'),{recursive:true});
 const paths=[releaseSchemaPath,'deployment/babal/mariadb-fresh-bootstrap-defaults.sql','deployment/babal/unknown.sql'];
 const bytes=Buffer.from('-- isolated release asset fixture\n'),sha256=createHash('sha256').update(bytes).digest('hex');
 for(const path of paths)await writeFile(resolve(root,path),bytes);
 const manifest={release:'hastabazaar-bootstrap-reader-test',migrations:[{path:paths[0],sha256,usage:'empty-database-only'}]};
 const save=()=>writeFile(resolve(root,releaseManifestPath),JSON.stringify(manifest));
 await save();assert.equal((await readReleaseAssets(root)).files.length,1,'historical public manifest remains accepted');
 manifest.migrations.push({path:paths[1],sha256,usage:'empty-database-only'});await save();assert.equal((await readReleaseAssets(root)).files.length,2);
 manifest.migrations[1].usage='additive-maintenance';await save();await assert.rejects(()=>readReleaseAssets(root),/Invalid migration entry/,'fresh defaults cannot be labelled for populated maintenance');
 manifest.migrations[1]={path:paths[2],sha256,usage:'empty-database-only'};await save();await assert.rejects(()=>readReleaseAssets(root),/Invalid migration entry/,'unknown empty-only path is refused');
});
