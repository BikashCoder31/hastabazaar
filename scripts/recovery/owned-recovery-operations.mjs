import {spawn as spawnChild} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';

// No SQL, arguments, stderr or driver diagnostics enter public failure messages.
function watch({cancellation,timeoutMs=30000,pollMs=100},abort){
 let polling=false;
 const deadline=setTimeout(()=>abort(new Error('Native recovery operation deadline exceeded')),timeoutMs);
 const poll=cancellation?setInterval(async()=>{
  if(polling)return;polling=true;
  try{await cancellation.checkpoint();}catch(error){abort(error);}finally{polling=false;}
 },pollMs):undefined;
 return ()=>{clearTimeout(deadline);clearInterval(poll);};
}
function combined(primary,errors){
 return errors.length?new AggregateError([primary,...errors].filter(Boolean),[primary?.message,...errors.map(e=>e.message)].filter(Boolean).join('; ')):primary;
}

export async function nativeProcess(docker,args,file,direction,options={}){
 await options.cancellation?.checkpoint();
 const child=(options.spawn??spawnChild)(docker,args,{stdio:[direction==='restore'?'pipe':'ignore',direction==='dump'?'pipe':'ignore','pipe']});
 let failure,closed=false,killTimer;const cleanupErrors=[];
 const streams=[child.stdin,child.stdout,child.stderr].filter(Boolean);
 const closedPromise=new Promise(resolve=>child.once('close',code=>{closed=true;if(code!==0&&!failure)failure=new Error('Native recovery client failed');resolve();}));
 const stop=error=>{
  failure??=error;
  for(const stream of streams){try{stream.destroy();}catch{cleanupErrors.push(new Error('Native recovery stream cleanup failed'));}}
  if(!closed&&!killTimer){
   try{child.kill('SIGTERM');}catch{cleanupErrors.push(new Error('Native recovery client termination failed'));}
   killTimer=setTimeout(()=>{if(!closed)try{child.kill('SIGKILL');}catch{cleanupErrors.push(new Error('Native recovery client kill failed'));}},options.killGraceMs??1000);
  }
 };
 child.on('error',()=>stop(new Error('Native recovery client failed')));
 child.stderr?.resume();
 const dispose=watch({...options,timeoutMs:options.timeoutMs??120000},stop);
 let transfer;
 try{
  const local=options.openFile?options.openFile():direction==='dump'?createWriteStream(file,{flags:'wx',mode:0o600}):createReadStream(file);
  streams.push(local);
  transfer=(direction==='dump'?pipeline(child.stdout,local):pipeline(local,child.stdin)).catch(()=>stop(new Error('Native recovery transfer failed')));
  // A completed pipe does not imply the client exited; an exited client does
  // not imply its inherited pipes closed. Drain BOTH before returning.
  await Promise.all([closedPromise,transfer]);
 }catch{stop(new Error('Native recovery transfer failed'));await Promise.all([closedPromise,transfer]);}
 finally{dispose();clearTimeout(killTimer);}
 if(failure)throw combined(failure,cleanupErrors);
}

/** Callback mysql2 connection, owned socket, no uncancellable PromiseConnection. */
export function ownedDatabase(raw,options={}){
 let failure,closing;
 const close=()=>{
  if(closing)return closing;
  closing=new Promise((resolve,reject)=>{
   if(raw.stream.closed)return resolve();
   let cleanupError;
   raw.stream.once('close',()=>cleanupError?reject(cleanupError):resolve());
   try{raw.stream.destroy(new Error('Owned native recovery connection closed'));}catch{cleanupError=new Error('Native recovery database cleanup failed');}
  });
  return closing;
 };
 // mysql2 propagates fatal socket errors to pending command callbacks and/or
 // its connection emitter. The generic listener avoids an unhandled idle error.
 raw.on('error',()=>{});
 const operation=async(method,args=[])=>{
  if(failure)throw failure;
  await options.cancellation?.checkpoint();
  return new Promise((resolve,reject)=>{
   let settled=false,dispose=()=>{};
   const finish=(error,value)=>{if(settled)return;settled=true;dispose();if(error)reject(error);else resolve(value);};
   const abort=error=>{
    if(settled||failure)return;failure=error;dispose();
    // Wait for actual socket close, not a naked race against driver work.
    close().then(()=>finish(failure),cleanup=>finish(combined(failure,[cleanup])));
   };
   dispose=watch(options,abort);
   try{raw[method](...args,(error,...result)=>{
    if(failure)return; // abort owns settlement until socket close
    if(error){abort(new Error('Native recovery database operation failed'));return;}
    finish(null,result);
   });}catch{abort(new Error('Native recovery database operation failed'));}
  });
 };
 return {connection:raw,query:(sql,values)=>operation('query',[sql,...(values===undefined?[]:[values])]),
  beginTransaction:()=>operation('beginTransaction'),commit:()=>operation('commit'),
  // Preserve the original failure during rollback after an aborted transaction.
  rollback:()=>failure?Promise.resolve():operation('rollback'),
  connect:()=>operation('connect'),end:close,destroy:close};
}

export async function connectOwnedDatabase(createConnection,configuration,options={}){
 await options.cancellation?.checkpoint();
 const db=ownedDatabase(createConnection(configuration),options);
 await db.connect();return db;
}
