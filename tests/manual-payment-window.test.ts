import assert from 'node:assert/strict';
import test from 'node:test';

async function policy(){const name='../lib/payments/payment-window';const loadedFixtureModule=await import(name).catch(()=>null);assert.equal(typeof loadedFixtureModule?.evaluatePaymentWindow,'function','Manual payment needs one timestamp-enforced original window and fixed review buffer.');return loadedFixtureModule!;}
const hour=3_600_000,issuedAt=1_800_000_000_000,deadlineAt=issuedAt+24*hour;
const window={issuedAt,deadlineAt,calendarVersion:'continuous-v1',paidAt:null,closedAt:null};

void test('manual window keeps its original cutoff, one fixed buffer and distinct paid/expired facts',async()=>{
 const {evaluatePaymentWindow:e}=await policy();
 const source={window,claims:[],allocations:[],remainingPaisa:10000};
 assert.equal(e({...source,now:deadlineAt-1}).state,'awaiting_payment');
 assert.equal(e({...source,now:deadlineAt}).state,'expired');
 const timely={...source,claims:[{at:deadlineAt-1,state:'submitted'}]};
 assert.equal(e({...timely,now:deadlineAt}).state,'under_review');assert.equal(e({...timely,now:deadlineAt}).cutoffAt,deadlineAt+4*hour);
 assert.equal(e({...timely,claims:[...timely.claims,{at:deadlineAt+hour,state:'clarified'}],now:deadlineAt+4*hour}).state,'expired');
 assert.equal(e({...source,claims:[{at:deadlineAt,state:'submitted'}],now:deadlineAt}).state,'expired');
 assert.equal(e({...timely,window:{...window,closedAt:deadlineAt+4*hour},now:deadlineAt+5*hour}).state,'expired');
});

void test('claim history is evaluated strictly before the deadline; later rejection cannot create or shorten another buffer',async()=>{
 const {evaluatePaymentWindow:e}=await policy();const source={window,allocations:[],remainingPaisa:10000,now:deadlineAt};
 assert.equal(e({...source,claims:[{at:issuedAt,state:'submitted'},{at:deadlineAt-1,state:'rejected'}]}).state,'expired');
 assert.equal(e({...source,claims:[{at:deadlineAt-1,state:'submitted'},{at:deadlineAt,state:'rejected'}]}).cutoffAt,deadlineAt+4*hour);
 assert.equal(e({...source,claims:[{at:deadlineAt,state:'submitted'},{at:deadlineAt+1,state:'clarified'}]}).state,'expired');
});

void test('real partial allocations qualify once, a screenshot does not pay, and full verification at cutoff is late',async()=>{
 const {evaluatePaymentWindow:e}=await policy();const source={window,claims:[],remainingPaisa:5000,now:deadlineAt,allocations:[{at:deadlineAt-1,amountPaisa:5000}]};
 assert.equal(e(source).cutoffAt,deadlineAt+4*hour);assert.equal(e(source).state,'awaiting_payment');
 assert.equal(e({...source,allocations:[{at:deadlineAt,amountPaisa:5000}]}).state,'expired');
 assert.equal(e({...source,allocations:[...source.allocations,{at:deadlineAt-1,amountPaisa:-5000}]}).state,'expired');
 assert.equal(e({...source,remainingPaisa:0,window:{...window,paidAt:deadlineAt+4*hour-1},now:deadlineAt+5*hour}).state,'paid');
 assert.equal(e({...source,remainingPaisa:0,window:{...window,paidAt:deadlineAt+4*hour},now:deadlineAt+5*hour}).state,'expired');
 assert.equal(e({...source,allocations:[],claims:[{at:issuedAt,state:'submitted'}],remainingPaisa:10000}).state,'under_review');
});

void test('one payment reminder is accurate, suppressed during review, and never revived after expiry',async()=>{
 const {evaluatePaymentWindow:e}=await policy();const source={window,claims:[],allocations:[],remainingPaisa:2500};
 assert.equal(e({...source,now:deadlineAt-6*hour-1}).reminderEligible,false);
 assert.equal(e({...source,now:deadlineAt-6*hour}).reminderEligible,true);
 assert.equal(e({...source,claims:[{at:issuedAt,state:'submitted'}],now:deadlineAt-6*hour}).reminderEligible,false);
 assert.equal(e({...source,now:deadlineAt}).reminderEligible,false);
 assert.throws(()=>e({...source,window:{...window,calendarVersion:'invented-hours'},now:issuedAt}),/calendar/i);
});
