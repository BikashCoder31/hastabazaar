import assert from 'node:assert/strict';
import test from 'node:test';
async function api(){const path='../lib/products/discount-advisories';const m=await import(path).catch(()=>null);assert.equal(typeof m?.discountAdvisoryDecision,'function','Discount checks need a non-expiring, non-repeating advisory cycle.');return m!;}
const day=86400000,start=1793491200000;
void test('day 23 and 29 are optional suggestions; day 30/60 never changes a price or repeats a cycle',async()=>{
 const m=await api(),cycle={firstPublishedAt:start,visibleSince:start,dismissedAt:null,day23:'pending',day29:'pending'};
 assert.deepEqual(m.discountAdvisoryDecision(cycle,start+22*day,true),[]);
 assert.deepEqual(m.discountAdvisoryDecision(cycle,start+23*day,true),[{day:23,outcome:'suggest'}]);
 assert.deepEqual(m.discountAdvisoryDecision({...cycle,day23:'sent'},start+29*day,true),[{day:29,outcome:'suggest'}]);
 for(const age of [30,60])assert.deepEqual(m.discountAdvisoryDecision({...cycle,day23:'sent',day29:'sent'},start+age*day,true),[]);
 assert.deepEqual(m.discountAdvisoryDecision({...cycle,dismissedAt:start+24*day,day23:'sent'},start+29*day,true),[{day:29,outcome:'skip'}]);assert.equal(cycle.firstPublishedAt,start);
});
void test('unpublished, hidden, late/reappeared and obsolete pairs cannot backfill reminders',async()=>{
 const m=await api(),cycle={firstPublishedAt:start,visibleSince:start,dismissedAt:null,day23:'pending',day29:'pending'};
 assert.deepEqual(m.discountAdvisoryDecision(cycle,start+23*day,false),[{day:23,outcome:'skip'}]);
 assert.deepEqual(m.discountAdvisoryDecision({...cycle,visibleSince:start+23*day+1},start+23*day+2,true),[{day:23,outcome:'skip'}]);
 assert.deepEqual(m.discountAdvisoryDecision(cycle,start+31*day,true),[{day:23,outcome:'skip'},{day:29,outcome:'skip'}]);
 assert.throws(()=>m.discountAdvisoryDecision({...cycle,firstPublishedAt:null},start+29*day,true));
});
