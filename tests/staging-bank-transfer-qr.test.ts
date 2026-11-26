import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { readStagingBankTransferQrs } from '../lib/payments/staging-bank-transfer-qr';

const stagingOrigin = 'https://staging.hastabazaar.com';
const order = {
  state: 'awaiting_payment',
  now: 1000,
  cutoffAt: 2000,
  remainingPaisa: 12_500,
  instruction: { accountVersionId: 'qa-bank-version-1', requiresAccountReview: false },
};
const png = Buffer.from(PNG.sync.write(new PNG({ width: 8, height: 11 })));

function mediaFixture(missingSuffix?: string) {
  const keys: string[] = [];
  const bucket = {
    async get(key: string) {
      keys.push(key);
      if (missingSuffix && key.endsWith(missingSuffix)) return null;
      return {
        size: png.length,
        httpMetadata: { contentType: 'image/png' },
        body: new Response(Uint8Array.from(png)).body,
      };
    },
  } as unknown as Pick<R2Bucket, 'get'>;
  return { bucket, keys };
}

void test('loads both staged bank codes only for the order’s verified account version', async () => {
  const { bucket, keys } = mediaFixture();
  const posters = await readStagingBankTransferQrs(stagingOrigin, bucket, order);
  assert.deepEqual(posters.map(poster => poster.name), ['Fonepay', 'Nabil NEPALPAY']);
  assert.deepEqual(keys, [
    'private/company-bank-qr/qa-bank-version-1/fonepay.png',
    'private/company-bank-qr/qa-bank-version-1/nepalpay.png',
  ]);
  assert.ok(posters.every(poster => poster.src === 'data:image/png;base64,' + png.toString('base64') &&
    poster.width === 8 && poster.height === 11));
});

void test('skips QR data on other origins and when the buyer should not pay again', async () => {
  const { bucket, keys } = mediaFixture();
  for (const [origin, payment] of [
    ['https://hastabazaar.com', order],
    ['http://localhost:3018', order],
    [stagingOrigin, { ...order, state: 'under_review' }],
    [stagingOrigin, { ...order, now: order.cutoffAt }],
    [stagingOrigin, { ...order, remainingPaisa: 0 }],
    [stagingOrigin, { ...order, instruction: { ...order.instruction, requiresAccountReview: true } }],
    [stagingOrigin, { ...order, instruction: { ...order.instruction, accountVersionId: '../other' } }],
  ] as const) {
    assert.deepEqual(await readStagingBankTransferQrs(origin, bucket, payment), []);
  }
  assert.deepEqual(keys, []);
});

void test('keeps the normal bank instructions usable when the staged upload is incomplete', async () => {
  const { bucket } = mediaFixture('nepalpay.png');
  assert.deepEqual(await readStagingBankTransferQrs(stagingOrigin, bucket, order), []);
});
