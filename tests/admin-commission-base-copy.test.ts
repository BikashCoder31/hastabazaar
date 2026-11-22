import assert from 'node:assert/strict';
import test from 'node:test';
import {feeView,renderCommonFee} from './helpers/common-fee-view';
void test('ordinary fee summary shows only the actual current fee when there is no future publication',async()=>{
 const html=await renderCommonFee(feeView());assert.match(html,/Current fee[\s\S]*?7\.25%/);assert.doesNotMatch(html,/Upcoming fee|No common fee change scheduled|Next scheduled|Current published fee supplement/);assert.match(html,/Original orders keep their recorded amounts/);assert.doesNotMatch(html,/9% launch commission|previous accepted rate applies/);
});
void test('a route source mismatch is explicit and publication cannot silently invent a common fee',async()=>{
 const state=feeView();state.current.managed!.basisPoints=800;state.issues=['The covered route rates or common start differ and require source reconciliation.'];const html=await renderCommonFee(state);assert.match(html,/Source review required/);assert.match(html,/Registered: 7\.25%/);assert.match(html,/sale-linked maker: 8%/);assert.match(html,/disabled=""[^>]*>Review publication/);
});