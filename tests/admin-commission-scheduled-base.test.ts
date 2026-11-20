import assert from 'node:assert/strict';
import test from 'node:test';
import {feeView,futurePolicy,renderCommonFee} from './helpers/common-fee-view';
void test('one upcoming fee card uses the actual paired source and Nepal common start',async()=>{
 const html=await renderCommonFee(feeView({upcoming:futurePolicy,history:[futurePolicy]}));assert.match(html,/Upcoming fee[\s\S]*?12%/);assert.match(html,/Nov 11, 2026/);assert.match(html,/12:00\s?am/i);assert.match(html,/Early acceptance starts no charge early/);assert.match(html,/fresh 15-day notice and fresh consent/);assert.doesNotMatch(html,/Next scheduled base rate|Next scheduled fee supplement/);
});
void test('cancelled history is retained without presenting a future card or old rate as current',async()=>{
 const html=await renderCommonFee(feeView({history:[{...futurePolicy,cancelledAt:Date.UTC(2026,9,27),replacementId:null}]}));assert.doesNotMatch(html,/Upcoming fee|No common fee change scheduled/);assert.match(html,/Common policy history/);assert.match(html,/Cancelled/);assert.match(html,/Current fee[\s\S]*?7\.25%/);
});