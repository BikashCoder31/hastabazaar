import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {FIXED_PREVIEW_FORM_IDS,PROTECTED_PREVIEW_FORM_IDS} from '../lib/forms/preview-contracts';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { isFormCatalogEditable } from '../lib/forms/catalog-presentation';
import { FEATURE_MANAGED_BASELINE_FORM_IDS } from '../lib/db/repositories/form-catalog';
import { inspectFormPreviewReadiness, REQUIRED_PREVIEW_FORM_IDS } from '../scripts/staging/form-preview-readiness.mjs';

const catalogIds = Object.values(FORM_REGISTRY).filter(isFormCatalogEditable).map(form => form.id);
// The approved preview inventory before fee waivers. This literal catches an
// accidental removal of an existing publication requirement as well as extras.
const existingPreviewIds = `
account.address account.daily-reward account.points-redemption account.privacy-request
account.profile account.review commerce.checkout commerce.complaint
commerce.gift-card-issue commerce.gift-card-redeem commerce.order-cancellation commerce.promo-quote
commerce.return-request identity.email-code-request identity.email-code-verify identity.login-password
identity.password-reset-complete identity.password-reset-request identity.register public.contact
public.feedback public.footer-feedback rider.application rider.code-verify
rider.remittance rider.report seller.application seller.case-complaint-response
seller.case-return-response seller.inventory seller.maker-profile seller.managed-supply-proposal
seller.managed-terms-acceptance seller.managed-transition-request seller.payout-request seller.product-submission
seller.profile seller.review-reply seller.shipping-action seller.shipping-request
shipping.console-action-seller shipping.console-action-staff shipping.console-request staff.business-settings-manager
staff.cancellation-review staff.catalog staff.complaint-case-action staff.delivery-assignment
staff.delivery-rate staff.exception-work staff.first-cod-confirmation staff.governance-backup-verify
staff.governance-incident-create staff.governance-incident-update staff.governance-promotion-create staff.governance-rule-create
staff.homepage-hero-manager staff.homepage-occasion-manager staff.homepage-visibility staff.invoice-adjustment
staff.loyalty-settings staff.managed-adjustment staff.managed-eligibility-release staff.managed-maker-activation
staff.managed-payment-action staff.managed-payment-preparation staff.managed-payout-action staff.managed-payout-preparation
staff.managed-supply-decision staff.managed-transition-decision staff.order-fulfillment staff.parcel-control
staff.payout-1 staff.payout-2 staff.payout-request-action staff.privacy-action
staff.product-classification staff.product-review staff.promo-code staff.referral-settings
staff.return-case-action staff.review-moderation staff.rider-control-1 staff.rider-control-2
staff.seller-governance staff.seller-review-action staff.staff-invitation staff.staff-permission-1
staff.staff-permission-2
`.trim().split(/\s+/);
const lexical=(left:string,right:string)=>left<right?-1:left>right?1:0;
async function fixture(formIds: readonly string[],malformedFormId?:string) {
  const f=await completeVersionFixture(),db=f.sqlite;
  assert.ok(db.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  for(const formId of formIds)db.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES(?,?,1,'published',?,'Fictional retained form','reviewer',1,'reviewer',1,'reviewer',1,?)`)
    .run('readiness:'+formId,formId,JSON.stringify({formId:formId===malformedFormId?'wrong-form':formId,fields:[]}),'readiness:'+formId);
  return f;
}

void test('preview readiness covers every catalog form and every required feature-managed form', () => {
  const expected = new Set([...catalogIds, ...FEATURE_MANAGED_BASELINE_FORM_IDS]);
  for (const formId of expected) assert.ok(REQUIRED_PREVIEW_FORM_IDS.includes(formId), `Missing preview check for ${formId}`);
});

void test('fee waiver controls require no catalog publication and preserve every existing preview requirement', () => {
  const fee = FORM_REGISTRY['staff.fee-waivers'];
  assert.equal(fee.mode, 'system');
  assert.equal(fee.capabilities.answerBehavior, 'none');
  assert.equal(isFormCatalogEditable(fee), false);
  assert.equal(REQUIRED_PREVIEW_FORM_IDS.includes(fee.id), false);
  assert.equal(existingPreviewIds.length, 89);
  assert.equal(FIXED_PREVIEW_FORM_IDS.size,16);
  assert.deepEqual([...REQUIRED_PREVIEW_FORM_IDS], [...existingPreviewIds,...FIXED_PREVIEW_FORM_IDS,...PROTECTED_PREVIEW_FORM_IDS].sort(lexical));
});

void test('a complete catalog alone still reports required non-core settings and sign-in tables', async () => {
  const f=await fixture(catalogIds),db=f.sqlite;
  try {
    const before = db.prepare('SELECT * FROM form_config_versions ORDER BY form_id').all();
    const result = inspectFormPreviewReadiness(db);
    assert.equal(result.ready, false);
    const missing=[...FEATURE_MANAGED_BASELINE_FORM_IDS,'rider.application',...PROTECTED_PREVIEW_FORM_IDS].sort(lexical);
    assert.equal(result.readyForms,REQUIRED_PREVIEW_FORM_IDS.length-missing.length);
    assert.deepEqual(result.missingForms.toSorted(lexical),missing);
    assert.equal(result.fixedForms.length,16);
    assert.ok(result.errors.some((error: string) => error.includes('user_sessions')));
    assert.deepEqual(db.prepare('SELECT * FROM form_config_versions ORDER BY form_id').all(), before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='user_sessions'").get()?.n, 0);
  } finally { f.dispose(); }
});

void test('a malformed publication is reported even when every required form has a published row', async () => {
  const f=await fixture(REQUIRED_PREVIEW_FORM_IDS,'staff.staff-invitation'),db=f.sqlite;
  try {
    const result = inspectFormPreviewReadiness(db);
    assert.equal(result.ready, false);
    assert.deepEqual(result.missingForms, []);
    assert.deepEqual(result.invalidForms, ['staff.staff-invitation']);
    assert.equal(result.readyForms, REQUIRED_PREVIEW_FORM_IDS.length - 1);
  } finally { f.dispose(); }
});

void test('fixed seller dashboard controls do not require catalog publication', () => {
  for (const id of ['seller.bank-details','staff.seller-bank-review','seller.products-description']) {
    assert.equal(isFormCatalogEditable(FORM_REGISTRY[id]), false);
    assert.equal(FORM_REGISTRY[id].capabilities.answerBehavior, 'none');
    assert.equal(REQUIRED_PREVIEW_FORM_IDS.includes(id), false);
  }
});
