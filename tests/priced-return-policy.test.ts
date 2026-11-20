import test from 'node:test';
import assert from 'node:assert/strict';
import { originalVoluntaryDeliveryTerms, returnMethodFunding } from '../lib/returns/priced-return-policy';

const terms = { version:'disclosed_voluntary_delivery_v1', legalAuthorityReference:'reviewed-legal-source',
  disclosureVersion:'displayed-policy-v1', disclosedAtCheckout:true, outboundRefundPromised:false, reversePaidByBuyer:true };

void test('outbound delivery is retained only when the originally disclosed terms permit it', () => {
  const saved = (voluntaryDelivery:Record<string,unknown>) => JSON.stringify({voluntaryDelivery});
  assert.equal(originalVoluntaryDeliveryTerms('{}'),null);
  assert.equal(originalVoluntaryDeliveryTerms(saved({...terms,legalAuthorityReference:''})), null);
  assert.equal(originalVoluntaryDeliveryTerms(saved({...terms,outboundRefundPromised:true})), null);
  assert.equal(originalVoluntaryDeliveryTerms(saved({...terms,disclosedAtCheckout:false})), null);
  assert.equal(originalVoluntaryDeliveryTerms(saved(terms))?.version,'disclosed_voluntary_delivery_v1');
});

void test('return instructions keep company funding until a buyer-paid decision is approved', () => {
  assert.equal(returnMethodFunding(null,null),'company');
  assert.equal(returnMethodFunding('disclosed_voluntary_delivery_v1','pending_high_value_approval'),'company');
  assert.equal(returnMethodFunding('disclosed_voluntary_delivery_v1','approved'),'buyer');
  assert.equal(returnMethodFunding('unknown','approved'),'company');
});
