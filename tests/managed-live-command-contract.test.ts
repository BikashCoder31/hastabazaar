import assert from 'node:assert/strict';
import test from 'node:test';
void test('live activation commands keep authority, source identity and exact assessments server controlled',async()=>{
 const path='../lib/managed-commerce/live-commands';
 const {parseManagedLiveCommand:parse}=await import(path);
 const body={sourceFormId:'system.managed-live-activation',action:'activate',requestId:'live-attempt-1',expectedRevision:'2',input:{readinessDigest:'a'.repeat(64),clearanceId:'clearance-1',reason:'Review the actual current evidence.'}};
 assert.equal(parse(body).action,'activate');
 for(const changed of [{...body,actorId:'another'},{...body,sourceFormId:'staff.managed-maker-activation'},{...body,input:{...body.input,sellerId:'another'}},{...body,input:{...body.input,simulation:true}},{...body,expectedRevision:2}])assert.throws(()=>parse(changed));
 const review={sourceFormId:body.sourceFormId,action:'review_clearance',requestId:'clearance-attempt',expectedRevision:null,input:{scopeDigest:'b'.repeat(64),evidenceIds:['evidence-1'],financialScopeId:'scope-1',issuerModel:'company_commercial_invoice_v1',issuerScopeDigest:'c'.repeat(64),issuer:'Independent fictional issuer',externalReference:'FICTIONAL-LEGAL-1',issuedAt:1,effectiveFrom:2,validUntil:null,externalAuthenticityConfirmed:true,supplierRegistrationTaxAssessmentConfirmed:true,invoiceIssuerConfirmed:true,payoutBeneficiaryConfirmed:true,reason:'Review all actual external assessments.'}};
 assert.equal(parse(review).action,'review_clearance');
 assert.throws(()=>parse({...review,input:{...review.input,evidenceIds:['evidence-1','evidence-1']}}));
 assert.throws(()=>parse({...review,input:{...review.input,issuedAt:1.5}}));
 assert.throws(()=>parse({...review,input:{...review.input,externalAuthenticityConfirmed:'true'}}));
});
