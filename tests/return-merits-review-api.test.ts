import './helpers/care-runtime';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

declare global {
  var returnMeritsReviewOptions: Record<string, unknown>[];
}

const stub = (source: string) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/db/repositories/returns') return stub(`
    export class ReturnConflictError extends Error {}
    export async function reviewReturnAsAdmin(db,options) { globalThis.returnMeritsReviewOptions.push(options); }
  `);
  if (specifier === '@/lib/forms/submission') return stub(`
    export async function validateSellerFormSubmission() { return { versionId: 'v1', answers: { formId: 'staff.return-case-action', version: 1, answers: [] } }; }
    export async function isValidatedFormVersionStale() { return false; }
  `);
  return nextResolve(specifier, context);
} });

void test('return review requires real choices and forwards only well-typed investigation evidence', async () => {
  globalThis.careBrowserDb = {} as D1Database;
  globalThis.careBrowserAuthority = async () => ({ id: 'fictional-staff', role: 'admin' });
  globalThis.returnMeritsReviewOptions = [];
  const review = await import('../app/api/admin/returns/[id]/review/route');
  const origin = 'https://care-scope.test';
  const payload = {
    sourceFormId: 'staff.return-case-action', action: 'approve', outcome: 'replacement', responsibility: 'seller',
    itemRefundPaisa: 0, deliveryRefundPaisa: 0, note: 'Reviewed the fictional original facts and remedy.',
    publicMessageEn: 'The fictional case review has been recorded.', formVersion: 1, customAnswers: [],
  };
  const send = (patch: Record<string, unknown> = {}) => review.POST(new Request(
    `${origin}/api/admin/returns/return-case/review`,
    {
      method: 'POST', headers: { origin, 'content-type': 'application/json', 'X-Hastabazaar-Actor': 'fictional-staff' },
      body: JSON.stringify({ ...payload, idempotencyKey: crypto.randomUUID(), ...patch }),
    },
  ), { params: Promise.resolve({ id: 'return-case' }) });

  for (const patch of [
    { outcome: '' }, { responsibility: '' }, { outcome: 'invented' }, { responsibility: 'invented' },
    { decisionEvidenceReference: 42 }, { decisionEvidenceReference: '   ' }, { decisionEvidenceReference: 'x'.repeat(192) },
    { correctSellerFulfillment: 'true' },
  ]) {
    const response = await send(patch);
    assert.equal(response.status, 400, await response.text());
  }
  assert.equal(globalThis.returnMeritsReviewOptions.length, 0);
  const legacy = await send();
  assert.equal(legacy.status, 200, await legacy.text());
  assert.equal(globalThis.returnMeritsReviewOptions[0].outcome, 'replacement');
  assert.equal(globalThis.returnMeritsReviewOptions[0].decisionEvidenceReference, undefined);

  const reference = 'Verified fictional carrier intake record';
  const recorded = await send({
    outcome: 'refund', responsibility: 'carrier', decisionEvidenceReference: `  ${reference}  `, correctSellerFulfillment: true,
  });
  assert.equal(recorded.status, 200, await recorded.text());
  assert.equal(globalThis.returnMeritsReviewOptions[1].decisionEvidenceReference, reference);
  assert.equal(globalThis.returnMeritsReviewOptions[1].correctSellerFulfillment, true);
});
