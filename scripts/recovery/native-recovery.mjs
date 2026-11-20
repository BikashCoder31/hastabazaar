import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat, mkdir, open, readdir, realpath, unlink} from 'node:fs/promises';
import {dirname, resolve, sep} from 'node:path';
import {encryptPortableFrames, decryptPortableFrames} from '../../lib/portability/crypto.ts';
import {canonicalJson} from '../../lib/portability/values.ts';

// This combination also remains below the authenticated format's million-frame cap.
const CHUNK=64*1024, MAX_FILES=100_000, MAX_BYTES=32*1024**3;
const sha=value=>createHash('sha256').update(value).digest('hex');
const hashPattern=/^[a-f0-9]{64}$/;
export async function fileDigest(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}

export function validateNativeProvenance(value){
 assert.ok(value&&typeof value==='object','Missing native provenance');
 const selected=value.artifactKind==='local-linux-candidate'||Object.hasOwn(value,'bootstrapSha256')||Object.hasOwn(value,'releaseManifestSha256');
 assert.deepEqual(Object.keys(value).sort(),['artifactKind','artifactSha256','commit','dispatchPaused','engine','keyIds','release','schemaSha256','sourceSha256','writeMode',...(selected?['bootstrapSha256','releaseManifestSha256']:[])].sort());
 assert.match(value.release,/^hastabazaar-release-[a-z0-9._-]+$/);
 assert.ok(['linux-release','source-snapshot','local-linux-candidate'].includes(value.artifactKind));
 if(value.artifactKind==='linux-release'){assert.match(value.commit,/^[a-f0-9]{40}$/);assert.equal(value.sourceSha256,null);}
 else {assert.equal(value.commit,null);assert.match(value.sourceSha256,hashPattern);}
 if(selected){assert.notEqual(value.artifactKind,'source-snapshot');assert.match(value.bootstrapSha256,hashPattern);assert.match(value.releaseManifestSha256,hashPattern);}
 assert.match(value.artifactSha256,hashPattern);assert.match(value.schemaSha256,hashPattern);
 assert.match(value.engine,/^10\.11\.\d+(?:[-+].*)?$/);
 assert.equal(value.writeMode,'paused');assert.equal(value.dispatchPaused,true);
 assert.ok(Array.isArray(value.keyIds)&&value.keyIds.length>0&&value.keyIds.length<=16);
 assert.equal(new Set(value.keyIds).size,value.keyIds.length);
 for(const id of value.keyIds)assert.match(id,/^[a-f0-9]{32}$/);
}

function safePath(name){
 assert.ok(typeof name==='string'&&name.length<=1024&&!/[\\:]/.test(name)&&!Array.from(name).some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127),'Invalid native recovery path');
 assert.ok(name.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Invalid native recovery path');
 assert.ok(name==='database.sql'||name==='release/artifact.tar.gz'||/^media\/(?:public|private)\//.test(name),'Unapproved native recovery path');
 assert.ok(!name.split('/').some(part=>part.startsWith('.')),'Private configuration is not a recovery file path');
}
async function safeRoot(path){
 const absolute=resolve(path);
 assert.ok(!absolute.split(/[\\/]/).some(part=>['.staging','.git','.aws','.ssh'].includes(part.toLowerCase())),'Retained local/configuration roots are forbidden');
 assert.equal(await realpath(absolute),absolute,'Recovery root must not redirect');
 assert.ok((await lstat(absolute)).isDirectory(),'Recovery root must be a directory');
 return absolute;
}
async function inventory(root,allowIncomplete=false){
 const files=[];let bytes=0;
 async function walk(relative=''){
  for(const name of (await readdir(resolve(root,relative))).sort()){
   if(allowIncomplete&&!relative&&name==='.incomplete')continue;
   const path=relative?relative+'/'+name:name,absolute=resolve(root,path),entry=await lstat(absolute);
   assert.ok(!entry.isSymbolicLink(),'Recovery cannot follow symbolic links');
   if(entry.isDirectory()){assert.ok(path==='media'||path==='release'||/^media\/(?:public|private)(?:\/|$)/.test(path),'Unapproved native recovery path');await walk(path);}
   else {safePath(path);assert.ok(entry.isFile(),'Unsupported recovery file');bytes+=entry.size;assert.ok(bytes<=MAX_BYTES&&files.length<MAX_FILES,'Native recovery size limit exceeded');files.push({path,bytes:entry.size,sha256:await fileDigest(absolute)});}
  }
 }
 await walk();
 assert.ok(files.some(file=>file.path==='database.sql'),'Native database dump is missing');
 assert.ok(files.some(file=>file.path==='release/artifact.tar.gz'),'Exact application artifact is missing');
 const names=new Set(files.map(file=>file.path));
 for(const file of files.filter(file=>file.path.startsWith('media/'))){
  const paired=file.path.endsWith('.metadata.json')?file.path.slice(0,-14):file.path+'.metadata.json';
  assert.ok(names.has(paired),'Every media object needs its original metadata sidecar');
 }
 return files;
}

/** Operator-only bundle: the source is a previously paused native snapshot. Never called by HTTP. */
export async function createNativeRecoveryBundle({source,output,provenance,passphrase}){
 validateNativeProvenance(provenance);const root=await safeRoot(source),files=await inventory(root);
 assert.equal(files.find(file=>file.path==='release/artifact.tar.gz').sha256,provenance.artifactSha256,'Application artifact digest does not match release provenance');
 const packageId=randomUUID(),manifestHash=sha(canonicalJson(files));
 async function* frames(){
  yield {type:'native-recovery',version:1,packageId,provenance};
  for(const file of files){
   yield {type:'file',...file};let bytes=0;const hash=createHash('sha256');
   for await(const chunk of createReadStream(resolve(root,file.path),{highWaterMark:CHUNK})){bytes+=chunk.length;hash.update(chunk);yield {type:'bytes',data:chunk.toString('base64')};}
   assert.equal(bytes,file.bytes,'Source changed during backup');assert.equal(hash.digest('hex'),file.sha256,'Source changed during backup');
   yield {type:'file-end'};
  }
  assert.deepEqual(await inventory(root),files,'Source changed during backup');
  yield {type:'complete',files:files.length,manifestHash};
 }
 assert.ok(resolve(output)!==root&&!resolve(output).startsWith(root+sep),'Encrypted output must be outside the source snapshot');
 const handle=await open(output,'wx',0o600);let complete=false;
 try{for await(const bytes of encryptPortableFrames(frames(),passphrase,'data',{packageId}))await handle.writeFile(bytes);complete=true;}
 finally{await handle.close();if(!complete)await unlink(output);}
 return {packageId,archiveSha256:await fileDigest(output),manifestHash,files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0),provenance};
}

/** Decrypt only into a new private inert directory. This never executes SQL or activates an application. */
export async function extractNativeRecoveryBundle({input,destination,passphrase,expectedSha256}){
 assert.match(expectedSha256,hashPattern);assert.equal(await fileDigest(input),expectedSha256,'Encrypted native archive digest mismatch');
 const root=await safeRoot(destination);assert.equal((await readdir(root)).length,0,'Recovery destination must be empty');
 const marker=await open(resolve(root,'.incomplete'),'wx',0o600);await marker.close();
 const files=[],names=new Set();let provenance,packageId,active,handle,hash,written=0,total=0,complete=false;
 try{
  for await(const {header,value} of decryptPortableFrames(createReadStream(input),passphrase,'data')){
   assert.ok(value&&typeof value==='object'&&!complete,'Invalid native recovery frame');
   if(value.type==='native-recovery'){
    assert.ok(!provenance&&!active);assert.equal(value.version,1);assert.equal(value.packageId,header.packageId);validateNativeProvenance(value.provenance);provenance=value.provenance;packageId=value.packageId;
   }else if(value.type==='file'){
    assert.ok(provenance&&!active);safePath(value.path);assert.ok(!names.has(value.path));assert.ok(Number.isSafeInteger(value.bytes)&&value.bytes>=0);assert.match(value.sha256,hashPattern);
    total+=value.bytes;assert.ok(total<=MAX_BYTES&&files.length<MAX_FILES,'Native recovery size limit exceeded');names.add(value.path);
    active={path:value.path,bytes:value.bytes,sha256:value.sha256};const target=resolve(root,value.path);assert.ok(target.startsWith(root+sep));await mkdir(dirname(target),{recursive:true,mode:0o700});handle=await open(target,'wx',0o600);hash=createHash('sha256');written=0;
   }else if(value.type==='bytes'){
    assert.ok(active&&handle&&typeof value.data==='string'&&value.data.length<=Math.ceil(CHUNK/3)*4);const bytes=Buffer.from(value.data,'base64');assert.equal(bytes.toString('base64'),value.data);written+=bytes.length;assert.ok(written<=active.bytes);hash.update(bytes);await handle.writeFile(bytes);
   }else if(value.type==='file-end'){
    assert.ok(active&&handle);await handle.close();handle=null;assert.equal(written,active.bytes);assert.equal(hash.digest('hex'),active.sha256);files.push(active);active=null;
   }else if(value.type==='complete'){
    assert.ok(provenance&&!active);assert.equal(value.files,files.length);assert.equal(value.manifestHash,sha(canonicalJson(files)));complete=true;
   }else throw Error('Unknown native recovery frame');
  }
  assert.ok(complete&&provenance&&!active,'Incomplete native recovery archive');
  assert.equal(files.find(file=>file.path==='release/artifact.tar.gz')?.sha256,provenance.artifactSha256);
  assert.ok(files.some(file=>file.path==='database.sql'));
  assert.deepEqual(await inventory(root,true),files,'Extracted native inventory mismatch');
  await unlink(resolve(root,'.incomplete'));
  return {packageId,provenance,files,archiveSha256:expectedSha256};
 }finally{await handle?.close();}
}

/** Only the owned-container rehearsal may execute restored SQL. No arbitrary host/name override. */
export function assertDisposableRecoveryTarget(scope){
 assert.equal(scope.owned,true);assert.equal(scope.dispatchPaused,true);assert.equal(scope.host,'127.0.0.1');
 assert.match(scope.containerId,/^[a-f0-9]{64}$/);assert.match(scope.run,/^\d+$/);
 assert.equal(scope.sourceDatabase,'native_'+scope.run+'_fresh');assert.equal(scope.database,'native_'+scope.run+'_recovery');
 assert.notEqual(scope.database,scope.sourceDatabase);
}
