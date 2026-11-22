// Include builtin mocked operation coverage in the existing *.test.ts gate.
import './native-recovery-cancellation.test.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import mysql, {type ConnectionOptions} from 'mysql2';
import {cooperativeCancellation,ownedLifecycle} from '../scripts/testing/verify-current-native.mjs';
import {nativeProcess,ownedDatabase,connectOwnedDatabase} from '../scripts/recovery/owned-recovery-operations.mjs';

for(const reason of ['STOP','SIGTERM','SIGINT'])void test('actual '+reason+' reaches authenticated cleanup only after dump settles',async()=>{
 const events:string[]=[],signals=new EventEmitter();let stop=false;
 const cancel=cooperativeCancellation({signals,requested:async()=>stop});
 const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),kill(signal:string){events.push(signal);setImmediate(()=>{events.push('reaped');child.emit('close',null,signal);});return true;}});
 try{
  await assert.rejects(ownedLifecycle({start:async()=>'owned-id',persist:async()=>{},work:async()=>{
   setImmediate(()=>{if(reason==='STOP')stop=true;else signals.emit(reason);});
   await nativeProcess('unused',[],'unused','dump',{spawn:()=>child,openFile:()=>new PassThrough(),cancellation:cancel,timeoutMs:1000,pollMs:2,killGraceMs:5});
  },close:async()=>{events.push('close');},attest:async()=>{events.push('attest');},stop:async()=>{events.push('container stop');},receipt:async(outcome:{stopped:boolean})=>{assert.equal(outcome.stopped,true);events.push('receipt');}}),/Native run cancelled/);
  assert.deepEqual(events,['SIGTERM','reaped','close','attest','container stop','receipt']);
 }finally{cancel.dispose();}
 assert.equal(signals.listenerCount('SIGTERM'),0);assert.equal(signals.listenerCount('SIGINT'),0);
});
void test('actual SIGTERM drains a pending DB command before lifecycle cleanup failures are reported',async()=>{
 const signals=new EventEmitter(),events:string[]=[],cancel=cooperativeCancellation({signals,requested:async()=>false});
 const raw=Object.assign(new EventEmitter(),{stream:new PassThrough(),query(){setImmediate(()=>signals.emit('SIGTERM'));}});
 raw.stream.on('error',()=>{});raw.stream.on('close',()=>events.push('socket closed'));
 const db=ownedDatabase(raw,{cancellation:cancel,timeoutMs:1000,pollMs:2});
 try{await assert.rejects(ownedLifecycle({start:async()=>'owned-id',persist:async()=>{},work:()=>db.query('private'),close:async()=>{events.push('close');await db.end();},attest:async()=>{events.push('attest');},stop:async()=>{throw new Error('stop failed');},receipt:async(outcome:{cleanupErrors:string[]})=>{assert.match(outcome.cleanupErrors.join(),/stop failed/);events.push('receipt');}}),error=>{
  assert.match(String(error),/SIGTERM/);assert.match(String(error),/stop failed/);return true;
 });}finally{cancel.dispose();}
 assert.deepEqual(events,['socket closed','close','attest','receipt']);
});
void test('actual mysql2 hung handshake drains a mocked transport without an engine',async()=>{
 const stream=new PassThrough();let closed=false;
 stream.on('close',()=>{closed=true;});
 await assert.rejects(connectOwnedDatabase((config:ConnectionOptions)=>mysql.createConnection(config),{stream,connectTimeout:1000},{timeoutMs:20,pollMs:2}),/deadline/);
 assert.equal(closed,true);assert.equal(stream.destroyed,true);
});
