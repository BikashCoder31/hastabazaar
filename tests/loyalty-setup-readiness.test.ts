import assert from 'node:assert/strict';
import test from 'node:test';
import {assessLoyaltySetup} from '../lib/incentives/loyalty-setup';
import {loyaltyEditorValues} from '../components/admin/loyalty-terms-editor';
import type {LoyaltyTerms} from '../lib/incentives/types';
const initial:LoyaltyTerms={enabled:false,dailyPoints:10,pointsPerBlock:100,creditPaisaPerBlock:1000,startsAt:null,endsAt:null,dailyBudgetPoints:null,lifetimeBudgetPoints:null};

void test('unpublished initial setup shows the approved weekly values but never invents saved dates or limits',()=>{
  const values=loyaltyEditorValues(initial,true);
  assert.equal(values.rewardMode,'weekly');assert.deepEqual(values.weeklyPoints,['5','7','9','10','11','13','15']);assert.equal(values.graceEnabled,false);
  assert.equal(values.enabled,false);for(const field of ['startsAt','endsAt','dailyBudgetPoints','lifetimeBudgetPoints'] as const)assert.equal(values[field],'');
  assert.equal(values.pointsPerBlock,'100');assert.equal(values.creditPaisaPerBlock,'10.00');assert.equal(initial.dailyPoints,10);
  assert.equal(loyaltyEditorValues(initial).rewardMode,'fixed','Existing callers preserve the stored fixed revision by default');
});
void test('missing or invalid setup identifies the exact dates and shared point limits',()=>{
  const empty=assessLoyaltySetup({...loyaltyEditorValues(initial),rewardMode:'weekly'},initial);
  assert.equal(empty.ready,false);assert.equal(empty.terms,null);
  for(const field of ['startsAt','endsAt','dailyBudgetPoints','lifetimeBudgetPoints'])assert.ok(empty.issues[field],field);
  const fields={...loyaltyEditorValues(initial),rewardMode:'weekly' as const,enabled:true,startsAt:'2026-10-20T09:00',endsAt:'2026-10-19T09:00',dailyBudgetPoints:'14',lifetimeBudgetPoints:'14'};
  const bad=assessLoyaltySetup(fields,initial);assert.match(bad.issues.endsAt,/after.*start/i);assert.match(bad.issues.dailyBudgetPoints,/15/);assert.match(bad.issues.lifetimeBudgetPoints,/15/);
  const ready=assessLoyaltySetup({...fields,endsAt:'2026-10-21T09:00',dailyBudgetPoints:'1500',lifetimeBudgetPoints:'15000'},initial);
  assert.equal(ready.ready,true);assert.deepEqual(ready.issues,{});assert.deepEqual(ready.terms?.weeklyPoints,[5,7,9,10,11,13,15]);assert.equal(ready.terms?.startsAt,Date.parse('2026-10-20T03:15:00Z'));
});
void test('existing weekly drafts legacy fixed rules and exact immutable timestamps keep their saved values',()=>{
  const fixed={...initial,enabled:true,startsAt:Date.parse('2026-10-20T03:15:22.125Z'),endsAt:Date.parse('2026-10-21T03:15:59.500Z'),dailyBudgetPoints:1000,lifetimeBudgetPoints:10000};
  const values=loyaltyEditorValues(fixed);assert.equal(values.rewardMode,'fixed');assert.equal(assessLoyaltySetup(values,fixed).terms?.startsAt,fixed.startsAt);assert.equal(assessLoyaltySetup(values,fixed).terms?.endsAt,fixed.endsAt);
  const weekly={...fixed,dailyPoints:6,weeklyPoints:[6,8,10,12,14,16,18],graceEnabled:true};
  const saved=loyaltyEditorValues(weekly);assert.deepEqual(saved.weeklyPoints,weekly.weeklyPoints.map(String));assert.equal(saved.graceEnabled,true);
});
