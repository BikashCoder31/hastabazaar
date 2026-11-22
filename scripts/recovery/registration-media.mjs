import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,readdir,realpath,writeFile} from 'node:fs/promises';
import {relative,resolve,sep} from 'node:path';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const ordered=values=>[...values].sort((a,b)=>a.localeCompare(b));
const applicantId=/^browser-registration-applicant-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function objectKey(key){
 assert.match(key,/^private\/[a-zA-Z0-9_/-]+$/,'Invalid registration media key');
 assert.ok(key.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Invalid registration media key');
}

/** Read through the cancellation-aware connection after native ownership and schema attestation. */
export async function readExpectedRegistrationMediaKeys(source){
 const [applicants]=await source.query("SELECT id,auth_subject authSubject,email FROM users WHERE id LIKE 'browser-registration-applicant-%'");
 assert.equal(applicants.length,1,'Expected exactly one registration applicant in the owned fixture');
 const {id,authSubject,email}=applicants[0];
 assert.ok(applicantId.test(id)&&authSubject===id&&email===id+'@local.hastabazaar.test','Invalid fictional registration applicant');
 const [drafts]=await source.query('SELECT id,user_id ownerId,object_key objectKey FROM seller_application_draft_uploads WHERE user_id=?',[id]);
 const [documents]=await source.query('SELECT d.id,d.seller_id sellerId,p.id profileId,p.user_id ownerId,d.object_key objectKey FROM seller_documents d JOIN seller_profiles p ON p.id=d.seller_id WHERE p.user_id=?',[id]);
 assert.ok(drafts.length&&documents.length,'Registration fixture must retain both a draft upload and a submitted document');
 const keys=new Set();
 for(const row of drafts){
  assert.ok(row.ownerId===id&&row.objectKey===`private/seller-drafts/${id}/${row.id}`,'Draft key does not belong to the registration applicant');
  objectKey(row.objectKey);keys.add(row.objectKey);
 }
 for(const row of documents){
  assert.ok(row.ownerId===id&&row.sellerId===row.profileId&&row.objectKey===`private/seller-documents/${row.sellerId}/${row.id}`,'Document key does not belong to the registration applicant');
  objectKey(row.objectKey);keys.add(row.objectKey);
 }
 return keys;
}

export function readRegistrationMediaHandoff(output){
 const lines=output.split(/\r?\n/).filter(line=>line.startsWith('Registration media manifest SHA-256: '));
 assert.equal(lines.length,1,'Expected one registration media handoff from the packaged browser');
 const sha256=lines[0].slice('Registration media manifest SHA-256: '.length);
 assert.match(sha256,/^[a-f0-9]{64}$/,'Invalid registration media handoff digest');
 return sha256;
}

async function assertMediaTree(root,records,cancellation){
 const directories=new Set();
 for(const file of records.keys()){
  const parts=file.split('/');
  for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'));
 }
 async function walk(prefix){
  await cancellation?.checkpoint();
  const path=resolve(root,prefix);
  await directory(path);
  for(const entry of await readdir(path,{withFileTypes:true})){
   const local=prefix?prefix+'/'+entry.name:entry.name;
   if(entry.isDirectory()&&directories.has(local))await walk(local);
   else assert.ok(entry.isFile()&&records.has(local),'Found unsafe or unlisted registration media');
  }
 }
 await walk('');
}
async function directory(path){
 assert.equal(await realpath(path),path,'Registration media directory must not redirect');
 const info=await lstat(path);
 assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Registration media directory must not be a link');
}
async function ancestors(root,path,create=false){
 const local=relative(root,path);
 assert.ok(local&&!local.startsWith('..')&&!local.includes(':')&&!local.startsWith(sep),'Registration media path escaped its root');
 let parent=root;await directory(parent);
 for(const part of local.split(sep).slice(0,-1)){
  parent=resolve(parent,part);
  if(create)try{await mkdir(parent,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  await directory(parent);
 }
}
const maxOwnedBytes=32*1024*1024;
export async function readOwned(root,path,maximum=maxOwnedBytes){
 assert.ok(Number.isSafeInteger(maximum)&&maximum>=0&&maximum<=maxOwnedBytes,'Invalid owned media read bound');
 await ancestors(root,path);
 assert.equal(await realpath(path),path,'Registration media file must not redirect');
 const entry=await lstat(path);
 assert.ok(entry.isFile()&&!entry.isSymbolicLink()&&entry.nlink===1,'Registration media must be a single owned regular file');
 assert.ok(entry.size<=maximum,'Registration media file exceeds fixture bound');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const opened=await handle.stat();
  assert.ok(opened.isFile()&&opened.nlink===1&&opened.ino===entry.ino&&opened.dev===entry.dev,'Registration media file changed during open');
  assert.equal(opened.size,entry.size,'Registration media length changed during open');
  const bytes=Buffer.alloc(entry.size);
  let offset=0;
  while(offset<bytes.length){
   const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);
   assert.ok(bytesRead>0,'Registration media length changed');
   offset+=bytesRead;
  }
  const tail=await handle.read(Buffer.alloc(1),0,1,offset);
  assert.equal(tail.bytesRead,0,'Registration media length changed');
  await ancestors(root,path);
  const after=await lstat(path);
  assert.ok(!after.isSymbolicLink()&&after.nlink===1&&after.ino===entry.ino&&after.dev===entry.dev&&after.size===entry.size,'Registration media changed during read');
  return bytes;
 }finally{await handle.close();}
}

/** Consume only the authenticated private producer handoff, never retained media. */
export async function stageRegistrationMedia({project,workspace,snapshot,marker,archiveSha256,manifestSha256,referencedKeys,expectedKeys,cancellation}){
 await cancellation?.checkpoint();
 project=resolve(project);workspace=resolve(workspace);snapshot=resolve(snapshot);
 await directory(project);
 const local=relative(project,workspace).split(sep).join('/');
 assert.match(local,/^\.test-artifacts\/t35\/current-artifact-native-\d+\/\d+$/,'Registration media requires the current owned fixture workspace');
 await ancestors(project,resolve(workspace,'ownership.json'));
 assert.match(relative(workspace,snapshot).split(sep).join('/'),/^native-recovery-[a-zA-Z0-9]+\/source$/,'Registration media snapshot must belong to this fixture');
 await ancestors(workspace,resolve(snapshot,'media'));
 await directory(snapshot);
 const ownership=JSON.parse(await readOwned(workspace,resolve(workspace,'ownership.json')));
 assert.ok(typeof marker.token==='string'&&marker.token.length>0,'Missing native ownership token');
 assert.ok(ownership.name===marker.name&&ownership.token===marker.token,'Registration media ownership mismatch');
 assert.match(marker.name,/^hastabazaar-native-\d+$/);
 assert.equal(marker.database,'native_'+marker.name.slice('hastabazaar-native-'.length)+'_fresh');
 assert.match(archiveSha256,/^[a-f0-9]{64}$/);
 assert.match(manifestSha256,/^[a-f0-9]{64}$/,'Missing authenticated registration media handoff digest');
 const manifestBytes=await readOwned(workspace,resolve(workspace,'registration-browser-media.json'));
 assert.equal(digest(manifestBytes),manifestSha256,'Registration media handoff digest mismatch');
 const manifest=JSON.parse(manifestBytes);
 assert.equal(manifest.version,1);assert.equal(manifest.producer,'packaged-registration-browser-v1');
 assert.equal(manifest.ownerName,marker.name);assert.equal(manifest.database,marker.database);
 assert.equal(manifest.archiveSha256,archiveSha256,'Registration media artifact mismatch');
 assert.ok(Array.isArray(manifest.files)&&manifest.files.length>0&&manifest.files.length<=100,'Registration media manifest is missing files');
 const records=new Map();
 for(const file of manifest.files){
  assert.equal(typeof file.path,'string');
  objectKey(file.path.endsWith('.metadata.json')?file.path.slice(0,-14):file.path);
  assert.match(file.sha256,/^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=32*1024*1024);
  assert.ok(!records.has(file.path),'Duplicate registration media path');records.set(file.path,file);
 }
 const keys=[...records.keys()].filter(path=>!path.endsWith('.metadata.json'));
 assert.ok(expectedKeys.size>0,'Registration media must include genuinely uploaded objects');
 for(const key of expectedKeys)objectKey(key);
 assert.deepEqual(ordered(keys),ordered(expectedKeys),'Registration media must contain every genuine upload exactly once');
 assert.equal(records.size,keys.length*2,'Registration media must have exactly paired sidecars');
 for(const key of keys){assert.ok(referencedKeys.has(key),'Unreferenced registration media object');assert.ok(records.has(key+'.metadata.json'),'Missing registration media sidecar');}
 const mediaRoot=resolve(workspace,'media');await assertMediaTree(mediaRoot,records,cancellation);
 const contents=new Map();
 for(const file of records.values()){
  await cancellation?.checkpoint();
  const bytes=await readOwned(mediaRoot,resolve(mediaRoot,file.path));
  assert.equal(bytes.length,file.bytes,'Registration media length mismatch');
  assert.equal(digest(bytes),file.sha256,'Registration media digest mismatch');contents.set(file.path,bytes);
 }
 for(const key of keys){
  const metadata=JSON.parse(contents.get(key+'.metadata.json'));
  assert.equal(metadata.size,records.get(key).bytes,'Registration metadata size mismatch');
  assert.equal(metadata.etag,records.get(key).sha256,'Registration metadata content digest mismatch');
 }
 for(const file of records.values()){
  await cancellation?.checkpoint();
  const target=resolve(snapshot,'media',file.path);
  await ancestors(snapshot,target,true);
  await writeFile(target,contents.get(file.path),{flag:'wx',mode:0o600});
  assert.equal(digest(await readOwned(snapshot,target)),file.sha256,'Registration media copy changed');
 }
 return {keys:new Set(keys),files:[...records.values()],manifestSha256,objects:keys.length,bytes:keys.reduce((sum,key)=>sum+records.get(key).bytes,0),sidecarBytes:keys.reduce((sum,key)=>sum+records.get(key+'.metadata.json').bytes,0)};
}

/** Independently re-read extracted objects and sidecars before declaring recovery. */
export async function verifyRestoredRegistrationMedia(target,media,cancellation){
 target=resolve(target);await directory(target);
 for(const file of media.files){
  await cancellation?.checkpoint();
  const bytes=await readOwned(target,resolve(target,'media',file.path));
  assert.equal(bytes.length,file.bytes,'Restored registration media length mismatch');
  assert.equal(digest(bytes),file.sha256,'Restored registration media digest mismatch');
 }
 return {genuineMediaObjects:media.objects,genuineMediaBytes:media.bytes,genuineMediaSidecarBytes:media.sidecarBytes,genuineMediaManifestSha256:media.manifestSha256,genuineMediaRestored:true};
}
