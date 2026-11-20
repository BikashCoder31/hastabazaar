import assert from 'node:assert/strict';
import test from 'node:test';
import {readProductAttemptReference,isProductRequestId} from '../hooks/use-product-attempt-reference';
import type {ProductCommandSource} from '../lib/products/command-outcome-contract';
void test('Product reference hydration exposes only validated source-owned opaque identity, including legacy private scrub input',()=>{
 const source:ProductCommandSource={kind:'publication_review',sourceId:'case-one',actorId:'reviewer'},marker={schema:1,requestId:'original-request-one',action:'request_changes',...source};
 assert.deepEqual(readProductAttemptReference(JSON.stringify(marker),source),{state:'pending',requestId:marker.requestId,action:marker.action,legacy:false});
 assert.deepEqual(readProductAttemptReference(JSON.stringify(marker),{...source,actorId:'other'}),{state:'invalid'});
 assert.deepEqual(readProductAttemptReference(JSON.stringify({...marker,reason:'PRIVATE'}),source),{state:'invalid'});
 const legacy=readProductAttemptReference(JSON.stringify({payload:{requestId:marker.requestId,action:marker.action,reason:'PRIVATE reason',checks:{secret:'PRIVATE'}},body:'PRIVATE wire'}),source);
 assert.deepEqual(legacy,{state:'pending',requestId:marker.requestId,action:marker.action,legacy:true});assert.doesNotMatch(JSON.stringify(legacy),/PRIVATE|reason|checks|body/);
 assert.deepEqual(readProductAttemptReference('{',source),{state:'invalid'});assert.deepEqual(readProductAttemptReference(null,source),{state:'empty'});assert.deepEqual(readProductAttemptReference(undefined,source),{state:'loading'});
 assert.equal(isProductRequestId('12345678-1234-1234-1234-123456789abc'),true);assert.equal(isProductRequestId('a'.repeat(64)),true);assert.equal(isProductRequestId('short'),false);
});
