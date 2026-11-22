import {env} from 'cloudflare:workers';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {requireMediaBucket} from '../db/d1';
import {readBoundedBody} from '../http/bounded-body';
import {isTrustedMutationRequest} from '../http/request-security';
import {consumeAccountRateLimit} from '../http/rate-limit';
import {proofIsCurrent,FRESH_PASSWORD_MS} from '../security/model';
import {SecurityStateError} from '../security/crypto';
import {securityActor,requiredStore,securityMutation,securityBindings,securityFailure,securityResponse,SecurityRequestError,privateHeaders,text,liveActorGuards,type SecurityActor} from '../security/request';
import {createSqlTransferSource} from './d1-source';
import {homepageHeroApplicationMedia} from './application-media';
import {preparePortableTransfer,inspectPortableTransfer,exportKeyRecovery,inspectKeyRecovery} from './transfer';
import {validateTransferPassphrase} from './crypto';
import {releaseId} from '../operations/readiness';

function requiresNativeRecovery(db:D1Database){return (db as D1Database & {dialect?:string}).dialect==='mariadb';}
function rejectNativeWebExport(db:D1Database){if(requiresNativeRecovery(db))throw new SecurityRequestError('This host uses operator-managed native recovery. Keep the exact application release, database snapshot, media and separate encrypted key recovery together. A browser data export cannot back up this host.',409,'HOST_NATIVE_RECOVERY_REQUIRED');}

async function transferActor(request:Request){
 const context=await securityActor(request);
 if(context.actor.role!=='super_admin')throw new SecurityRequestError('Only Super Admin can prepare or inspect a complete backup.');
 const store=requiredStore(context.db,context.key,context.initialized),account=await store.readAccount(context.actor.id);
 const proof=context.actor.sessionHash?await store.readProof(context.actor.sessionHash,context.actor.id):null;
 const now=Date.now();
 if(!context.actor.raw || !account || !proof || !proofIsCurrent(proof.value,account.value,now) || now-proof.value.verifiedAt>FRESH_PASSWORD_MS)throw new SecurityRequestError('Verify your password and authenticator in Account security before this protected action.',403,'MFA_REQUIRED');
 return {...context,store,account,proof};
}
async function audit(db:D1Database,actor:SecurityActor,action:string,id:string,details:Record<string,unknown>={}){
 await db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,?,'backup',?,'Owner requested protected data portability',NULL,?,NULL,NULL,?)`).bind(randomUUID(),actor.id,action,id,JSON.stringify(details),Date.now()).run();
}
async function source(db:D1Database,store:{keyId:string},signal?:AbortSignal){
 const bucket=requireMediaBucket(env as unknown as {MEDIA?:R2Bucket});
 const applicationMedia=await homepageHeroApplicationMedia(db,securityBindings().APP_ORIGIN,fetch,signal);
 return createSqlTransferSource(db,bucket,{installationId:'hastabazaar-'+store.keyId,release:releaseId,keyIds:[store.keyId],schemaVersion:'current-source-schema',signal,applicationMedia});
}
async function validateSecurityInventory(context:Awaited<ReturnType<typeof transferActor>>){
 const manifest=await context.store.readManifest();if(!manifest)throw new SecurityStateError();
 const expected=new Set(manifest.value.userIds.map(id=>'auth-private:account:'+encodeURIComponent(id)));
 for(const id of manifest.value.userIds){if(!await context.store.readAccount(id))throw new SecurityStateError('An expected staff security record is missing. Preserve the existing records and key before exporting.');}
 const rows=await context.db.prepare("SELECT `key` AS recordKey FROM marketplace_settings WHERE `key` LIKE 'auth-private:account:%'").all<{recordKey:string}>();
 if(rows.results.length!==expected.size||rows.results.some(row=>!expected.has(row.recordKey)))throw new SecurityStateError('Staff security inventory is incomplete or contains an unregistered record. No complete backup was issued.');
}
export async function backupReadiness(request:Request){
 try{
  let context:Awaited<ReturnType<typeof transferActor>>;
  try{context=await transferActor(request);}catch(error){if(error instanceof SecurityRequestError && error.code==='MFA_REQUIRED')return securityResponse({ready:false,mfaRequired:true,warnings:[error.message],supportedDestinations:['Compatible prepared SQLite schema; new empty destination only']});throw error;}
  if(requiresNativeRecovery(context.db))return securityResponse({ready:true,nativeRecoveryRequired:true,verificationExpiresAt:context.proof.value.verifiedAt+FRESH_PASSWORD_MS,authorizationOnly:true,release:releaseId,warnings:['This MariaDB host requires the operator-managed native recovery procedure. Browser data export and restore are disabled.','Keep the verified application archive, native database snapshot, every public/private media file and its metadata, and a separate encrypted key recovery bundle.','A restore rehearsal must pass on an owned isolated destination before any separately approved hosting switch.'],supportedDestinations:['Operator-managed MariaDB 10.11 recovery; isolated rehearsal only']});
  return securityResponse({ready:true,verificationExpiresAt:context.proof.value.verifiedAt+FRESH_PASSWORD_MS,authorizationOnly:true,release:'local-unversioned-candidate',warnings:['MFA is verified. Database, schema and file readiness are checked when export starts.','A local read-only export is preliminary. A final hosting switch requires paused writes and separate approval.','Keep the matching application source separately; it is not included in this data archive. Keep the separately encrypted key recovery bundle.','Native MariaDB transfer has not been verified; no restore is enabled for this installation.'],supportedDestinations:['Versioned portable archive; compatible empty SQLite target adapter']});
 }catch(error){return securityFailure(error);}
}
export async function createBackup(request:Request):Promise<Response>{
 try{
  const {data}=await securityMutation(request,'backup');
  if(data.action!=='export'&&data.action!=='key-recovery'&&data.action!=='prepare-download')throw new SecurityRequestError('This installation cannot restore, overwrite data or switch hosting.',403,'RESTORE_DISABLED');
  const kind=data.action==='prepare-download'?data.kind:data.action;
  if(kind!=='export'&&kind!=='key-recovery')throw new SecurityRequestError('Choose a valid encrypted download.',422);
  const context=await transferActor(request),passphrase=text(data,'passphrase',512);
  if(kind==='export')rejectNativeWebExport(context.db);
  if(data.confirmation!==true)throw new SecurityRequestError('Confirm that you will store the encrypted package and recovery material safely.',422);
  try{validateTransferPassphrase(passphrase);}catch{throw new SecurityRequestError('Use a recovery passphrase of at least 16 characters and at most 512 bytes.',422);}
  const budget=await consumeAccountRateLimit(context.db,{scope:`backup-export:${context.actor.id}`,limit:5,windowMs:10*60000});
  if(!budget.allowed)throw new SecurityRequestError('Wait before preparing another protected download.',429);
  if(data.action==='prepare-download'){
    const ticket=Buffer.from(randomBytes(32)).toString('base64url'),hash=createHash('sha256').update(ticket).digest('hex'),now=Date.now();
    const grant:DownloadGrant={version:1,userId:context.actor.id,sessionHash:context.actor.sessionHash!,generation:context.account.value.generation,expiresAt:now+60000,passphrase,kind};
    await context.store.checkedBatch([...liveActorGuards(context.db,context.actor),...context.store.insertRecord('auth-private:transfer-grant:download:'+hash,context.actor.id,grant,now)]);
    return securityResponse({ticket});
  }
  return await protectedBackup(request,context,kind,passphrase);
 }catch(error){return securityFailure(error);}
}
async function protectedBackup(request:Request,context:Awaited<ReturnType<typeof transferActor>>,kind:'export'|'key-recovery',passphrase:string):Promise<Response>{
  const packageId=randomUUID();await audit(context.db,context.actor,'security.backup.started',packageId,{kind});
  if(kind==='key-recovery'){
    const key=context.key!;
    const bytes=await exportKeyRecovery({version:1,activeKeyId:context.store.keyId,keys:[{id:context.store.keyId,keyBase64:Buffer.from(key,'base64url').toString('base64')}]},passphrase);
    await transferActor(request);
    await audit(context.db,context.actor,'security.backup.completed',packageId,{kind:'key-recovery'});
    return new Response(Uint8Array.from(bytes),{headers:{...privateHeaders,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="hastabazaar-key-recovery-${packageId}.hzk"`,'X-Content-Type-Options':'nosniff'}});
  }
  rejectNativeWebExport(context.db);
  await validateSecurityInventory(context);
  const iterator=preparePortableTransfer(await source(context.db,context.store,request.signal),{passphrase,packageId})[Symbol.asyncIterator]();
  let first:IteratorResult<Uint8Array>;
  try{first=await iterator.next();}catch{await iterator.return?.(undefined);throw new SecurityRequestError('A complete backup could not be prepared. No complete package was issued. Return to Backup & Transfer and check readiness before retrying.',503,'BACKUP_PREPARATION_FAILED');}
  try{await transferActor(request);await validateSecurityInventory(context);}catch(error){await iterator.return?.(undefined);throw error;}
  let checkedAt=Date.now();
  let initial=true,completed=false;
  const stream=new ReadableStream<Uint8Array>({async pull(controller){
    try{
      const value=initial?(initial=false,first):await iterator.next();
      if(value.done){completed=true;await audit(context.db,context.actor,'security.backup.completed',packageId,{kind:'data',preliminary:true});controller.close();}
      else {
        if(Date.now()-checkedAt>=1000){await transferActor(request);checkedAt=Date.now();}
        controller.enqueue(Uint8Array.from(value.value));
      }
    }catch{await iterator.return?.(undefined);controller.error(new Error('Backup preparation stopped; this incomplete download must not be used.'));}
  },async cancel(){await iterator.return?.(undefined);if(!completed)await audit(context.db,context.actor,'security.backup.cancelled',packageId);}});
  return new Response(stream,{headers:{...privateHeaders,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="hastabazaar-data-${packageId}.hzb"`,'X-Content-Type-Options':'nosniff'}});
}

interface InspectionGrant{version:1;userId:string;sessionHash:string;generation:number;expiresAt:number;passphrase:string;}
interface DownloadGrant extends InspectionGrant{kind:'export'|'key-recovery';}
function inspectionGrant(value:unknown):InspectionGrant{
 const v=value as InspectionGrant;
 if(!v||v.version!==1||typeof v.userId!=='string'||!/^[a-f0-9]{64}$/.test(v.sessionHash)||!Number.isSafeInteger(v.generation)||!Number.isSafeInteger(v.expiresAt)||typeof v.passphrase!=='string')throw new SecurityStateError();
 validateTransferPassphrase(v.passphrase);return v;
}
function downloadGrant(value:unknown):DownloadGrant{
 const v=inspectionGrant(value) as DownloadGrant;
 if(v.kind!=='export'&&v.kind!=='key-recovery')throw new SecurityStateError();
 return v;
}
/** Native form POST streams to the browser download manager. Only a one-use
 * ticket enters the form; passphrases and keys never enter URLs or headers. */
export async function downloadBackup(request:Request):Promise<Response>{
 try{
  if(!request.headers.get('origin')||!isTrustedMutationRequest(request,securityBindings().APP_ORIGIN))throw new SecurityRequestError('Cross-site requests are not allowed.');
  if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type')??''))throw new SecurityRequestError('Use the protected download form.',415);
  const body=new URLSearchParams(new TextDecoder().decode(await readBoundedBody(request,1024)));
  const ticket=body.get('ticket')??'';
  if([...body.keys()].join(',')!=='ticket'||!/^[A-Za-z0-9_-]{43}$/.test(ticket))throw new SecurityRequestError('Prepare a new encrypted download.',403);
  const context=await transferActor(request),hash=createHash('sha256').update(ticket).digest('hex');
  const row=await context.store.readRecord('auth-private:transfer-grant:download:'+hash,context.actor.id,downloadGrant);
  if(!row||row.value.userId!==context.actor.id||row.value.sessionHash!==context.actor.sessionHash||row.value.generation!==context.account.value.generation||Date.now()>=row.value.expiresAt)throw new SecurityRequestError('The download request expired or belongs to another sign-in. Prepare it again.',403);
  await context.store.checkedBatch([...liveActorGuards(context.db,context.actor),...context.store.deleteRecord(row)]);
  return await protectedBackup(request,context,row.value.kind,row.value.passphrase);
 }catch(error){return securityFailure(error);}
}
async function* requestBytes(request:Request){
 if(!request.body)throw new Error('Missing encrypted package.');
 const reader=request.body.getReader();let total=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>16*1024**4)throw new Error('Encrypted package exceeds the portable archive limit.');yield value;}}
 finally{try{await reader.cancel();}finally{reader.releaseLock();}}
}
export async function inspectBackup(request:Request):Promise<Response>{
 try{
  if(request.headers.get('content-type')?.startsWith('application/json')){
    const {data}=await securityMutation(request,'backup-inspect');const context=await transferActor(request);
    if(data.action!=='prepare')throw new SecurityRequestError('Choose a valid inspection action.',422);
    const passphrase=text(data,'passphrase',512);try{validateTransferPassphrase(passphrase);}catch{throw new SecurityRequestError('Use the private passphrase for this encrypted package.',422);}
    const ticket=Buffer.from(randomBytes(32)).toString('base64url'),hash=createHash('sha256').update(ticket).digest('hex'),rowKey='auth-private:transfer-grant:'+hash,now=Date.now();
    const grant:InspectionGrant={version:1,userId:context.actor.id,sessionHash:context.actor.sessionHash!,generation:context.account.value.generation,expiresAt:now+5*60000,passphrase};
    await context.store.checkedBatch([...liveActorGuards(context.db,context.actor),...context.store.insertRecord(rowKey,context.actor.id,grant,now)]);
    return securityResponse({ticket});
  }
  if(!request.headers.get('origin') || !isTrustedMutationRequest(request,securityBindings().APP_ORIGIN))throw new SecurityRequestError('Cross-site requests are not allowed.');
  if(!request.headers.get('content-type')?.startsWith('application/octet-stream'))throw new SecurityRequestError('Use the protected encrypted-file inspection form.',415);
  const context=await transferActor(request),ticket=request.headers.get('x-hastabazaar-inspection')??'';
  if(!/^[A-Za-z0-9_-]{43}$/.test(ticket))throw new SecurityRequestError('Prepare a new private inspection request.',403);
  const hash=createHash('sha256').update(ticket).digest('hex'),row=await context.store.readRecord('auth-private:transfer-grant:'+hash,context.actor.id,inspectionGrant);
  if(!row || row.value.userId!==context.actor.id || row.value.sessionHash!==context.actor.sessionHash || row.value.generation!==context.account.value.generation || Date.now()>=row.value.expiresAt)throw new SecurityRequestError('The inspection request expired or belongs to another sign-in. Prepare it again.',403);
  await context.store.checkedBatch([...liveActorGuards(context.db,context.actor),...context.store.deleteRecord(row)]);
  const input=requestBytes(request),iterator=input[Symbol.asyncIterator](),prefix:Uint8Array[]=[];let header='';
  try{
    while(!header.includes('\n')){
      const value=await iterator.next();if(value.done)throw new Error('Missing header.');
      prefix.push(value.value);
      // Decode at most the bounded first line even if the sender supplies a
      // large first chunk. The complete chunk is replayed without copying it.
      const remaining=4097-header.length;
      header+=new TextDecoder().decode(value.value.subarray(0,remaining));
      if(header.indexOf('\n')>4096 || (!header.includes('\n')&&header.length>4096))throw new Error('Invalid header.');
    }
    const purpose=JSON.parse(header.slice(0,header.indexOf('\n'))).purpose;
    async function* replay(){yield* prefix;for(;;){const value=await iterator.next();if(value.done)break;yield value.value;}}
    if(purpose==='key-recovery'){
      const bundle=await inspectKeyRecovery(replay(),row.value.passphrase);
      await audit(context.db,context.actor,'security.backup.inspected',hash,{kind:'key-recovery',keyCount:bundle.keys.length});
      return securityResponse({valid:true,inventory:{tables:0,rows:0,files:0,bytes:0},warnings:[`Encrypted key recovery bundle verified (${bundle.keys.length} key IDs). Raw keys are never displayed. Keep it separately from the data package.`]});
    }
    const inspected=await inspectPortableTransfer(replay(),row.value.passphrase);
    await audit(context.db,context.actor,'security.backup.inspected',inspected.packageId,{kind:'data',tables:inspected.inventory.tables.length,files:inspected.totalObjects});
    return securityResponse({valid:true,inventory:{tables:inspected.inventory.tables.length,rows:inspected.totalRows,files:inspected.totalObjects,bytes:inspected.totalObjectBytes},warnings:inspected.warnings,release:inspected.inventory.application.release,snapshotAt:inspected.inventory.snapshot.cutoff,finalCutoverReady:inspected.finalCutoverReady});
  }catch{return securityResponse({error:'The encrypted package is incomplete or invalid, or its passphrase does not match. No data has been restored.'},422);}
  finally{await iterator.return?.();}
 }catch(error){return securityFailure(error);}
}
