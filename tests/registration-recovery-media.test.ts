import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {link,mkdir,mkdtemp,readFile,symlink,unlink,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import * as registrationMedia from '../scripts/recovery/registration-media.mjs';
import {stageRegistrationMedia,verifyRestoredRegistrationMedia} from '../scripts/recovery/registration-media.mjs';
import {createNativeRecoveryBundle,extractNativeRecoveryBundle} from '../scripts/recovery/native-recovery.mjs';
import {retainRegistrationMedia} from '../scripts/testing/registration-browser-fixture.mjs';

const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
async function fixture({linkSource=false,producer=false,sourceHardlink}:{linkSource?:boolean;producer?:boolean;sourceHardlink?:'body'|'sidecar'}={}){
 const base=resolve('.test-artifacts/t35/uploaded-media-source-link-fix-sol/fixtures');
 await mkdir(base,{recursive:true});
 const project=await mkdtemp(resolve(base,'media-'));
 const workspace=resolve(project,'.test-artifacts/t35/current-artifact-native-123/7');
 const snapshot=resolve(workspace,'native-recovery-fixture/source');
 await mkdir(snapshot,{recursive:true});
 if(linkSource){
  const foreign=resolve(project,'foreign');
  await mkdir(foreign);
  await mkdir(resolve(workspace,'media'));
  await symlink(foreign,resolve(workspace,'media/private'),'junction');
 }
 const keys=['private/seller-drafts/browser-registration-applicant-fixture/draft','private/seller-documents/fictional-seller/document'];
 const contents=new Map<string,Buffer>();
 for(const key of keys){
  const bytes=Buffer.from([0,255,128,1,10,13,42]);contents.set(key,bytes);
  contents.set(key+'.metadata.json',Buffer.from(JSON.stringify({size:bytes.length,etag:hash(bytes),httpMetadata:{contentType:'image/png'},customMetadata:{fixture:'fictional'},uploaded:'2026-11-10T00:00:00.000Z'})));
 }
 const sourceMedia=producer?resolve(project,'browser-media'):resolve(workspace,'media');
 for(const [path,bytes] of contents){const file=resolve(sourceMedia,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
 const marker={name:'hastabazaar-native-123',database:'native_123_fresh',token:'fictional-owner-token'};
 await writeFile(resolve(workspace,'ownership.json'),JSON.stringify({name:marker.name,token:marker.token}));
 const manifest={version:1,producer:'packaged-registration-browser-v1',database:marker.database,ownerName:marker.name,archiveSha256:hash('artifact'),files:[...contents].map(([path,bytes])=>({path,bytes:bytes.length,sha256:hash(bytes)}))};
 const options={project,workspace,snapshot,marker,archiveSha256:manifest.archiveSha256,manifestSha256:'',referencedKeys:new Set([...keys,'private/old/synthetic']),expectedKeys:new Set(keys),cancellation:undefined};
 const save=async()=>{const bytes=JSON.stringify(manifest);await writeFile(resolve(workspace,'registration-browser-media.json'),bytes);options.manifestSha256=hash(bytes);};
 if(producer){
  const markerPath=resolve(project,'.superpowers/sdd/2026-10-16-staging-native-compatibility/fictional-marker.json');
  await mkdir(dirname(markerPath),{recursive:true});
  await writeFile(markerPath,JSON.stringify(marker));
  await mkdir(resolve(workspace,'media'));
  const env={HASTABAZAAR_CURRENT_ARTIFACT_NATIVE:'1',MEDIA_ROOT:resolve(workspace,'media'),HATSKALA_NATIVE_MARKER:markerPath,HATSKALA_NATIVE_TOKEN:marker.token,DB_NAME:marker.database};
  const previous=Object.keys(env).map(name=>[name,process.env[name]] as const);
  try{
   Object.assign(process.env,env);
   const retain=()=>retainRegistrationMedia(project,sourceMedia,keys,manifest.archiveSha256);
   if(sourceHardlink){
    const path=keys[0]+(sourceHardlink==='sidecar'?'.metadata.json':'');
    await link(resolve(sourceMedia,path),resolve(project,'outside-browser-media'));
    await assert.rejects(retain,/single owned regular file/);
    await assert.rejects(readFile(resolve(workspace,'media',path)),{code:'ENOENT'});
    await assert.rejects(readFile(resolve(workspace,'registration-browser-media.json')),{code:'ENOENT'});
   }else{
    const retained=await retain();
    assert.equal(retained.retainedObjects,2);
    options.manifestSha256=retained.manifestSha256;
   }
  }finally{
   for(const [name,value] of previous){
    if(value===undefined)delete process.env[name];
    else process.env[name]=value;
   }
  }
 }else await save();
 return {options,manifest,save,keys,contents};
}

for(const sourceHardlink of ['body','sidecar'] as const)void test('producer refuses a '+sourceHardlink+' hardlinked outside its media root',async()=>{
 await fixture({producer:true,sourceHardlink});
});

void test('paired genuine bytes survive encrypted recovery and report truthful object/sidecar totals',async()=>{
 const f=await fixture({producer:true}),media=await stageRegistrationMedia(f.options);
 assert.equal(media.objects,2);assert.equal(media.bytes,14);
 for(const [path,bytes] of f.contents)assert.deepEqual(await readFile(resolve(f.options.snapshot,'media',path)),bytes);
 await assert.rejects(readFile(resolve(f.options.snapshot,'media/private/old/synthetic')),{code:'ENOENT'});
 await mkdir(resolve(f.options.snapshot,'release'));await writeFile(resolve(f.options.snapshot,'release/artifact.tar.gz'),'artifact');await writeFile(resolve(f.options.snapshot,'database.sql'),'fictional SQL text, never executed');
 const archive=resolve(f.options.workspace,'snapshot.hzn'),target=resolve(f.options.workspace,'restored');await mkdir(target);
 const provenance={release:'hastabazaar-release-fixture',artifactKind:'linux-release',sourceSha256:null,commit:'a'.repeat(40),artifactSha256:hash('artifact'),schemaSha256:'c'.repeat(64),keyIds:['d'.repeat(32)],engine:'10.11.14-MariaDB',writeMode:'paused',dispatchPaused:true};
 const passphrase='fictional-media-recovery-passphrase';
 const bundle=await createNativeRecoveryBundle({source:f.options.snapshot,output:archive,provenance,passphrase});
 await extractNativeRecoveryBundle({input:archive,destination:target,passphrase,expectedSha256:bundle.archiveSha256});
 const report=await verifyRestoredRegistrationMedia(target,media,undefined);
 assert.equal(report.genuineMediaObjects,2);assert.equal(report.genuineMediaBytes,14);assert.equal(report.genuineMediaRestored,true);
 assert.equal(report.genuineMediaSidecarBytes,[...f.contents].filter(([path])=>path.endsWith('.metadata.json')).reduce((sum,[,bytes])=>sum+bytes.length,0));
 assert.equal(report.genuineMediaManifestSha256,hash(await readFile(resolve(f.options.workspace,'registration-browser-media.json'))));
 await writeFile(resolve(target,'media',f.keys[0]),'tampered');
 await assert.rejects(verifyRestoredRegistrationMedia(target,media,undefined),/Restored registration media/);
});

void test('recovery discovers both genuine key families independently from applicant-owned rows',async()=>{
 const db=new DatabaseSync(':memory:');
 const id='browser-registration-applicant-12345678-1234-4234-8123-123456789abc';
 const email=id+'@local.hastabazaar.test';
 try{
  db.exec(`CREATE TABLE users(id TEXT,auth_subject TEXT,email TEXT);
    CREATE TABLE seller_application_draft_uploads(id TEXT,user_id TEXT,object_key TEXT);
    CREATE TABLE seller_profiles(id TEXT,user_id TEXT);
    CREATE TABLE seller_documents(id TEXT,seller_id TEXT,object_key TEXT);`);
  db.prepare('INSERT INTO users VALUES (?,?,?)').run(id,id,email);
  db.prepare('INSERT INTO seller_application_draft_uploads VALUES (?,?,?),(?,?,?)').run('draft',id,'private/seller-drafts/'+id+'/draft','other','older','private/older/draft');
  db.prepare('INSERT INTO seller_profiles VALUES (?,?),(?,?)').run('seller',id,'old-seller','older');
  db.prepare('INSERT INTO seller_documents VALUES (?,?,?),(?,?,?)').run('document','seller','private/seller-documents/seller/document','old','old-seller','private/older/document');
  const source={query:async(sql:string,params:string[]=[])=>[db.prepare(sql).all(...params)]};
  const expected=['private/seller-drafts/'+id+'/draft','private/seller-documents/seller/document'];
  assert.deepEqual(await registrationMedia.readExpectedRegistrationMediaKeys(source),new Set(expected));
  db.prepare('UPDATE seller_documents SET object_key=? WHERE id=?').run('private/seller-documents/old-seller/document','document');
  await assert.rejects(registrationMedia.readExpectedRegistrationMediaKeys(source),/key does not belong/);
  db.prepare('UPDATE seller_documents SET object_key=? WHERE id=?').run(expected[1],'document');
  db.prepare('DELETE FROM seller_application_draft_uploads WHERE id=?').run('draft');
  await assert.rejects(registrationMedia.readExpectedRegistrationMediaKeys(source),/must retain both/);
  db.prepare('UPDATE users SET email=? WHERE id=?').run('foreign@example.test',id);
  await assert.rejects(registrationMedia.readExpectedRegistrationMediaKeys(source),/fictional registration applicant/);
  db.prepare('UPDATE users SET email=? WHERE id=?').run(email,id);
  const another=id.replace('12345678','99999999');
  db.prepare('INSERT INTO users VALUES (?,?,?)').run(another,another,another+'@local.hastabazaar.test');
  await assert.rejects(registrationMedia.readExpectedRegistrationMediaKeys(source),/one registration applicant/);
  db.exec('DELETE FROM users');
  await assert.rejects(registrationMedia.readExpectedRegistrationMediaKeys(source),/one registration applicant/);
 }finally{db.close();}
});

void test('recovery refuses a replaced manifest and extra unpaired files',async()=>{
 const f=await fixture();
 const manifestPath=resolve(f.options.workspace,'registration-browser-media.json');
 await writeFile(manifestPath,JSON.stringify(f.manifest,null,2));
 await assert.rejects(stageRegistrationMedia(f.options),/handoff digest mismatch/);
 await f.save();
 await writeFile(resolve(f.options.workspace,'media/private/stray.metadata.json'),'{}');
 await assert.rejects(stageRegistrationMedia(f.options),/unlisted registration media/);
});

void test('recovery accepts one exact digest from the completed browser handoff',()=>{
 const sha256='d'.repeat(64),line='Registration media manifest SHA-256: '+sha256;
 assert.equal(registrationMedia.readRegistrationMediaHandoff('fixture output\r\n'+line+'\r\n'),sha256);
 assert.throws(()=>registrationMedia.readRegistrationMediaHandoff('fixture output'),/Expected one/);
 assert.throws(()=>registrationMedia.readRegistrationMediaHandoff(line+'\n'+line),/Expected one/);
 assert.throws(()=>registrationMedia.readRegistrationMediaHandoff(line+'trailing'),/Invalid registration media/);
});

for(const mutation of ['missing-manifest','foreign-owner','foreign-token','foreign-database','foreign-artifact','unknown-producer','duplicate','unpaired','omitted-object','unreferenced','traversal','absolute','backslash','tampered-object','tampered-sidecar','wrong-length','metadata-disagrees','missing-object'] as const)void test('registration media refuses '+mutation,async()=>{
 const f=await fixture(),first=f.manifest.files[0],path=resolve(f.options.workspace,'media',first.path);
 switch(mutation){
  case 'missing-manifest':await unlink(resolve(f.options.workspace,'registration-browser-media.json'));break;
  case 'foreign-owner':f.manifest.ownerName='hastabazaar-native-999';break;
  case 'foreign-token':await writeFile(resolve(f.options.workspace,'ownership.json'),JSON.stringify({name:f.options.marker.name,token:'foreign'}));break;
  case 'foreign-database':f.manifest.database='native_999_fresh';break;
  case 'foreign-artifact':f.manifest.archiveSha256='f'.repeat(64);break;
  case 'unknown-producer':f.manifest.producer='foreign';break;
  case 'duplicate':f.manifest.files.push({...first});break;
  case 'unpaired':f.manifest.files.splice(1,1);break;
  case 'omitted-object':f.manifest.files.splice(0,2);break;
  case 'unreferenced':f.options.referencedKeys.delete(first.path);break;
  case 'traversal':first.path='private/../outside';break;
  case 'absolute':first.path='/private/outside';break;
  case 'backslash':first.path='private\\outside';break;
  case 'tampered-object':await writeFile(path,Buffer.alloc(first.bytes,42));break;
  case 'tampered-sidecar':await writeFile(path+'.metadata.json','{}');break;
  case 'wrong-length':first.bytes++;break;
  case 'metadata-disagrees':{const record=f.manifest.files[1],bytes=Buffer.from(JSON.stringify({size:first.bytes,etag:'e'.repeat(64)}));record.bytes=bytes.length;record.sha256=hash(bytes);await writeFile(path+'.metadata.json',bytes);break;}
  case 'missing-object':await unlink(path);break;
 }
 if(mutation!=='missing-manifest')await f.save();
 await assert.rejects(stageRegistrationMedia(f.options));
 await assert.rejects(readFile(resolve(f.options.snapshot,'media',f.keys[0])),{code:'ENOENT'});
});

void test('registration media refuses foreign workspace, foreign snapshot, duplicate writes and cancellation',async()=>{
 const f=await fixture();
 await assert.rejects(stageRegistrationMedia({...f.options,workspace:f.options.project}));
 await assert.rejects(stageRegistrationMedia({...f.options,snapshot:resolve(f.options.project,'other')}));
 await assert.rejects(stageRegistrationMedia({...f.options,cancellation:{checkpoint:async()=>{throw new Error('STOP fixture');}}}),/STOP fixture/);
 const media=await stageRegistrationMedia(f.options);
 await assert.rejects(stageRegistrationMedia(f.options),{code:'EEXIST'});
 assert.deepEqual(await readFile(resolve(f.options.snapshot,'media',f.keys[0])),f.contents.get(f.keys[0]));
 assert.equal(media.objects,2);
});

void test('registration media refuses source and destination symlink ancestors',async()=>{
 for(const side of ['source','destination']){
  const f=await fixture({linkSource:side==='source'}),foreign=resolve(f.options.project,'foreign');
  if(side==='destination'){
   await mkdir(foreign);
   await mkdir(resolve(f.options.snapshot,'media'));
   await symlink(foreign,resolve(f.options.snapshot,'media/private'),'junction');
  }
  await assert.rejects(stageRegistrationMedia(f.options),/must not redirect|must not be a link|unsafe or unlisted/);
 }
});

void test('registration media refuses a file hardlinked outside the fixture media root',async()=>{
 const f=await fixture();
 await link(resolve(f.options.workspace,'media',f.keys[0]),resolve(f.options.project,'alias'));
 await assert.rejects(stageRegistrationMedia(f.options),/single owned regular file/);
});
