import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {PassThrough, Writable} from 'node:stream';
import * as recovery from '../scripts/recovery/owned-recovery-operations.mjs';

const timing={timeoutMs:20,pollMs:2,killGraceMs:5};
function childFixture(events,{exitCode=null}={}){
 const child=new EventEmitter();
 child.stdout=new PassThrough();child.stdin=new PassThrough();child.stderr=new PassThrough();
 child.kill=signal=>{events.push(signal);if(signal==='SIGKILL')setImmediate(()=>{events.push('reaped');child.emit('close',null,signal);});return true;};
 if(exitCode!==null)setImmediate(()=>{child.stdout.end();child.stdin.end();child.stderr.end();events.push('reaped');child.emit('close',exitCode);});
 return child;
}
for(const direction of ['dump','restore'])void test('hung '+direction+' is killed and reaped before returning',async()=>{
 const events=[],child=childFixture(events);
 await assert.rejects(recovery.nativeProcess('unused',[],'unused',direction,{...timing,spawn:()=>child,openFile:()=>direction==='dump'?new Writable({write(c,e,done){done();}}):new PassThrough()}),/deadline/);
 assert.deepEqual(events,['SIGTERM','SIGKILL','reaped']);
 assert.ok(child.stdin.destroyed&&child.stdout.destroyed&&child.stderr.destroyed);
});
for(const reason of ['STOP file','SIGTERM'])void test(reason+' interrupts pending recovery before outer cleanup',async()=>{
 const events=[],child=childFixture(events);let cancelled=false;
 const pending=recovery.nativeProcess('unused',[],'unused','dump',{...timing,timeoutMs:1000,spawn:()=>child,openFile:()=>new PassThrough(),cancellation:{async checkpoint(){if(cancelled)throw new Error(reason);}}});
 cancelled=true;
 try{await pending;assert.fail('must cancel');}catch(error){assert.match(error.message,new RegExp(reason));}finally{events.push('outer cleanup');}
 assert.deepEqual(events,['SIGTERM','SIGKILL','reaped','outer cleanup']);
});
function databaseFixture(events){
 const raw=new EventEmitter();raw.stream=new PassThrough();raw.config={host:'owned'};
 raw.stream.on('error',()=>{});raw.stream.on('close',()=>events.push('socket closed'));
 for(const method of ['query','beginTransaction','commit','rollback','connect'])raw[method]=()=>{events.push(method);};
 return raw;
}
for(const method of ['query','beginTransaction','commit','rollback'])void test('hung DB '+method+' drains owned socket before rejection',async()=>{
 const events=[],raw=databaseFixture(events),db=recovery.ownedDatabase(raw,timing);
 await assert.rejects(db[method]('private SQL'),/deadline/);events.push('outer cleanup');
 assert.deepEqual(events,[method,'socket closed','outer cleanup']);
 await assert.rejects(db.query('never start'),/deadline/);
});
void test('hung connect is cancellable and cannot leak a late connection',async()=>{
 const events=[],raw=databaseFixture(events);
 await assert.rejects(recovery.connectOwnedDatabase(()=>raw,{},timing),/deadline/);
 assert.deepEqual(events,['connect','socket closed']);
});
void test('successful query retains values and transactions; close does not wait for QUIT',async()=>{
 const events=[],raw=databaseFixture(events);
 raw.query=(sql,values,done)=>{assert.equal(sql,'SELECT ?');assert.deepEqual(values,[42]);done(null,[{value:42}],['field']);};
 const db=recovery.ownedDatabase(raw,timing);
 assert.deepEqual(await db.query('SELECT ?',[42]),[[{value:42}],['field']]);
 await db.end();assert.deepEqual(events,['socket closed']);
});
void test('client nonzero exit rejects without private diagnostics',async()=>{
 const events=[],child=childFixture(events,{exitCode:2});
 await assert.rejects(recovery.nativeProcess('unused',[],'unused','dump',{...timing,spawn:()=>child,openFile:()=>new PassThrough()}),/Native recovery client failed/);
 assert.deepEqual(events,['reaped']);
});
void test('termination failure is retained alongside deadline after owned client reaps',async()=>{
 const events=[],child=childFixture(events),kill=child.kill;
 child.kill=signal=>{if(signal==='SIGTERM')throw new Error('private diagnostics');return kill(signal);};
 await assert.rejects(recovery.nativeProcess('unused',[],'unused','dump',{...timing,spawn:()=>child,openFile:()=>new PassThrough()}),error=>{
  assert.match(error.message,/deadline/);assert.match(error.message,/termination failed/);assert.doesNotMatch(error.message,/private diagnostics/);return true;
 });
 assert.deepEqual(events,['SIGKILL','reaped']);
});
void test('DB cancellation and cleanup failure both remain visible',async()=>{
 const events=[],raw=databaseFixture(events),destroy=raw.stream.destroy.bind(raw.stream);
 raw.stream.destroy=(error)=>{destroy(error);throw new Error('private driver details');};
 const db=recovery.ownedDatabase(raw,timing);
 await assert.rejects(db.query('private query'),error=>{
  assert.match(error.message,/deadline/);assert.match(error.message,/database cleanup failed/);assert.doesNotMatch(error.message,/private driver/);return true;
 });
 assert.deepEqual(events,['query','socket closed']);
});
void test('successful dump awaits both file transfer and child close',async()=>{
 const events=[],child=childFixture(events,{exitCode:0});
 await recovery.nativeProcess('unused',[],'unused','dump',{...timing,spawn:()=>child,openFile:()=>new Writable({write(c,e,done){done();},final(done){setTimeout(()=>{events.push('file finished');done();},5);}})});
 assert.deepEqual(events,['reaped','file finished']);
});
