import assert from 'node:assert/strict';
import test from 'node:test';
import * as fees from '../lib/marketplace/fee-waivers';
import * as repository from '../lib/db/repositories/fee-waivers';
import { createCodOrder } from '../lib/db/repositories/orders';
import {
  transitionAdminFulfillment,
  cancelCustomerOrder,
} from '../lib/db/repositories/fulfillment';
import {
  buildEarningsAccrualStatements,
  getSellerFinanceSummary,
  prepareSellerPayout,
  operatePayout,
} from '../lib/db/repositories/payouts';
import {
  createCustomerReturnRequest,
  reviewReturnAsAdmin,
  advanceReturnAsAdmin,
} from '../lib/db/repositories/returns';
import { getCommissionReport } from '../lib/db/repositories/commission-reporting';
import { getSellerEarnings } from '../lib/seller/earnings';
import { promoCostPreview } from '../lib/incentives/presentation';
import { readAccountingSources } from '../lib/accounting/source-queries';
import { parseAccountingQuery } from '../lib/accounting/filters';
import {
  feeWaiverCheckoutFixture,
  feeWaiverContext,
  feeWaiverTerms,
} from './helpers/fee-waiver-fixture';
import { accountingFixture } from './helpers/accounting-fixture';

async function checkout(waived: boolean, quantity = 1, price = 10000) {
  const f = await feeWaiverCheckoutFixture();
  f.sqlite
    .prepare('UPDATE products SET price_paisa=?,return_eligible=1')
    .run(price);
  f.sqlite.prepare('UPDATE cart_items SET quantity=?').run(quantity);
  // Mature fictional seller: isolate the net entitlement from unrelated reserve policy.
  f.sqlite.exec('UPDATE seller_profiles SET approved_at=0');
  if (waived) {
    const draft = await repository.mutateFeeWaiver(
      f.database,
      feeWaiverContext('create', 0),
      { type: 'create', terms: feeWaiverTerms },
    );
    await repository.mutateFeeWaiver(
      f.database,
      feeWaiverContext('publish', 1),
      { type: 'publish', campaignId: draft.id },
    );
  }
  await createCodOrder(
    f.database,
    'token',
    'receipt',
    f.input,
    100,
    'checkout-buyer',
  );
  const order = f.sqlite.prepare('SELECT id,order_number FROM orders').get()!;
  const item = f.sqlite.prepare('SELECT id FROM order_items').get()!;
  return {
    ...f,
    orderId: String(order.id),
    orderNumber: String(order.order_number),
    itemId: String(item.id),
  };
}
type Fixture = Awaited<ReturnType<typeof checkout>>;
async function deliver(f: Fixture) {
  // Fixture starts at dispatched; exercise the actual delivery/accrual transaction.
  f.sqlite.exec(
    "UPDATE orders SET status='dispatched'; UPDATE order_items SET fulfillment_status='dispatched'",
  );
  await transitionAdminFulfillment(f.database, {
    orderId: f.orderId,
    actorId: 'owner',
    action: 'deliver',
    note: 'Fictional delivery received',
    requestId: 'deliver',
    now: 200,
  });
}
async function refund(f: Fixture, index: number, amount: number) {
  const request = await createCustomerReturnRequest(f.database, {
    orderNumber: f.orderNumber,
    receiptTokenHash: 'receipt',
    customerId: 'checkout-buyer',
    orderItemId: f.itemId,
    quantity: 1,
    reason: 'defective',
    requestedResolution: 'refund',
    detail: 'Fictional product has a documented defect.',
    locale: 'en-NP',
    idempotencyKey: `return-${index}`,
    evidence: [],
    now: 210 + index,
  });
  await reviewReturnAsAdmin(f.database, {
    returnRequestId: request.id,
    actorId: 'owner',
    actorRole: 'super_admin',
    action: 'approve',
    note: 'Fictional refund approved',
    publicMessageEn: 'Refund approved.',
    publicMessageNe: 'Refund approved.',
    responsibility: 'seller',
    outcome: 'refund',
    itemRefundPaisa: amount,
    deliveryRefundPaisa: 0,
    requestId: `approve-${index}`,
    now: 220 + index,
  });
  const options = {
    returnRequestId: request.id,
    actorId: 'owner',
    actorRole: 'super_admin' as const,
    note: 'Fictional refund processing',
    publicMessageEn: 'Refund update.',
    publicMessageNe: 'Refund update.',
  };
  await advanceReturnAsAdmin(f.database, {
    ...options,
    action: 'start_refund',
    requestId: `start-${index}`,
    now: 230 + index,
  });
  const complete = {
    ...options,
    action: 'complete_refund' as const,
    reference: `refund-ref-${index}`,
    requestId: `complete-${index}`,
    now: 240 + index,
  };
  await advanceReturnAsAdmin(f.database, complete);
  await advanceReturnAsAdmin(f.database, complete);
}
void test('historical breakdown preserves recorded amounts even when rate multiplication would round differently', () => {
  assert.equal(typeof fees.historicalFeeBreakdown, 'function');
  assert.deepEqual(fees.historicalFeeBreakdown(900, 8, 101), {
    standardBps: 900,
    basePaisa: 101,
    standardPaisa: 8,
    waivedPaisa: 0,
    netPaisa: 8,
    campaignId: null,
    campaignRevision: null,
  });
});

for (const waived of [false, true])
  void test(`${waived ? 'waived' : 'ordinary'} delivery and payout retain net semantics and immutable fee evidence`, async (t) => {
    t.mock.method(Date, 'now', () => 100);
    const f = await checkout(waived);
    try {
      await deliver(f);
      await f.database.batch(
        buildEarningsAccrualStatements(f.database, {
          orderId: f.orderId,
          now: 201,
        }),
      );
      const breakdown = (
        await repository.readOrderMarketplaceFees(f.database, [f.itemId])
      ).get(f.itemId)!;
      assert.equal(breakdown.standardPaisa, 1000);
      assert.equal(breakdown.waivedPaisa, waived ? 1000 : 0);
      assert.equal(breakdown.netPaisa, waived ? 0 : 1000);
      const now = 100 * 86400000;
      const summary = await getSellerFinanceSummary(
        f.database,
        'seller-a',
        now,
      );
      assert.equal(summary.availablePaisa, waived ? 10000 : 9000);
      assert.equal(summary.commissionPaisa, waived ? 0 : -1000);
      const earnings = await getSellerEarnings(f.database, 'seller-a', now);
      assert.deepEqual(earnings.marketplaceFees, {
        originalStandardPaisa: 1000,
        originalWaivedPaisa: waived ? 1000 : 0,
        originalNetPaisa: waived ? 0 : 1000,
      });
      const payout = await prepareSellerPayout(f.database, {
        sellerId: 'seller-a',
        actorId: 'owner',
        actorRole: 'super_admin',
        note: 'Fictional net seller payout',
        requestId: 'prepare',
        now,
      });
      for (const action of ['start_processing', 'mark_paid'] as const)
        await operatePayout(f.database, {
          payoutId: payout.id,
          actorId: 'owner',
          actorRole: 'super_admin',
          action,
          note: 'Fictional payout evidence',
          providerReference: 'SIM-PAYOUT',
          requestId: action,
          now: now + 1,
        });
      assert.equal(
        (await getSellerFinanceSummary(f.database, 'seller-a', now + 2))
          .paidPaisa,
        waived ? 10000 : 9000,
      );
      const report = await getCommissionReport(f.database, {});
      assert.equal(report.totals.originalStandardPaisa, 1000);
      assert.equal(report.totals.originalWaivedPaisa, waived ? 1000 : 0);
      assert.equal(report.totals.netPaisa, waived ? 0 : 1000);
      assert.equal(
        report.rows[0].originalCommissionPaisa,
        1000 - report.totals.originalWaivedPaisa,
      );
      assert.equal(
        report.rows[0].minRateBps,
        1000,
        'the report rate is the recorded standard, even when net is zero',
      );
      assert.equal(report.rows[0].maxRateBps, 1000);
      assert.equal(report.totals.missingEntries, 0);
      const accounting = await readAccountingSources(
        f.database,
        parseAccountingQuery(
          new URLSearchParams('period=all&section=sellers'),
          now,
        ),
        now,
        'local_staging',
      );
      assert.equal(
        accounting.metrics.find(
          (m) => m.key === 'seller_original_standard_commission',
        )?.amountPaisa,
        '1000',
      );
      assert.equal(
        accounting.metrics.find(
          (m) => m.key === 'seller_original_waived_commission',
        )?.amountPaisa,
        waived ? '1000' : '0',
      );
      assert.equal(
        accounting.metrics.find((m) => m.key === 'seller_commission_earned')
          ?.amountPaisa,
        waived ? '0' : '1000',
      );
    } finally {
      await f.dispose();
    }
  });

void test('zero expected fees without a commission entry are not missing ledger money; historical reports retain recorded values', async () => {
  const f = await accountingFixture();
  try {
    f.insert('orders', {
      id: 'o',
      order_number: 'O',
      created_at: 100,
      status: 'delivered',
      payment_status: 'paid',
    });
    for (const [id, bps, commission] of [
      ['waived', 0, 0],
      ['historical', 900, 8],
    ] as const)
      f.insert('order_items', {
        id,
        order_id: 'o',
        seller_id: 'seller',
        seller_name_snapshot: 'Shop',
        line_total_paisa: 101,
        seller_discount_paisa: 0,
        commission_base_paisa: 101,
        commission_bps: bps,
        commission_paisa: commission,
        fulfillment_status: 'delivered',
      });
    f.insert('order_item_marketplace_fees', {
      order_item_id: 'waived',
      standard_bps: 900,
      base_paisa: 101,
      standard_paisa: 9,
      waived_paisa: 9,
      net_paisa: 0,
      campaign_id: 'campaign',
      campaign_revision: 2,
      created_at: 100,
    });
    const breakdown = await repository.readOrderMarketplaceFees(f.db, [
      'waived',
      'historical',
      'absent',
    ]);
    assert.equal(breakdown.get('historical')?.standardPaisa, 8);
    assert.equal(breakdown.get('historical')?.waivedPaisa, 0);
    assert.equal(breakdown.has('absent'), false);
    assert.equal((await repository.readOrderMarketplaceFees(f.db, [])).size, 0);
    const report = await getCommissionReport(f.db, {});
    assert.equal(
      report.totals.missingEntries,
      1,
      'only the historical nonzero fee is missing',
    );
    assert.equal(report.totals.originalStandardPaisa, 17);
    assert.equal(report.totals.originalWaivedPaisa, 9);
    assert.equal(report.totals.pendingPaisa, 8);
  } finally {
    f.dispose();
  }
});

void test('cancellation before delivery keeps the original waiver and never accrues fees or seller money', async (t) => {
  t.mock.method(Date, 'now', () => 100);
  const f = await checkout(true);
  try {
    await cancelCustomerOrder(f.database, {
      orderNumber: f.orderNumber,
      receiptTokenHash: 'receipt',
      customerId: 'checkout-buyer',
      note: 'Fictional cancellation before delivery',
      requestId: 'cancel',
      now: 110,
    });
    await f.database.batch(
      buildEarningsAccrualStatements(f.database, {
        orderId: f.orderId,
        now: 120,
      }),
    );
    const report = await getCommissionReport(f.database, {});
    assert.equal(report.rows[0].status, 'cancelled');
    assert.equal(report.totals.originalWaivedPaisa, 1000);
    assert.equal(report.totals.netPaisa, 0);
    assert.equal(report.totals.pendingPaisa, 0);
    assert.equal(
      (await getSellerFinanceSummary(f.database, 'seller-a')).grossSalesPaisa,
      0,
    );
    assert.equal(
      (await repository.readOrderMarketplaceFees(f.database, [f.itemId])).get(
        f.itemId,
      )?.netPaisa,
      0,
    );
  } finally {
    await f.dispose();
  }
});

for (const waived of [false, true])
  void test(`${waived ? 'waived' : 'ordinary'} multi-quantity partial returns use cumulative rounded reversals and preserve original fee snapshots`, async (t) => {
    t.mock.method(Date, 'now', () => 100);
    const f = await checkout(waived, 3, 5);
    try {
      await deliver(f);
      for (let index = 1; index <= 3; index++) {
        await refund(f, index, 5);
        await f.database.batch(
          buildEarningsAccrualStatements(f.database, {
            orderId: f.orderId,
            now: 300 + index,
          }),
        );
        const report = await getCommissionReport(f.database, {});
        assert.equal(report.totals.originalStandardPaisa, 2);
        assert.equal(report.totals.originalWaivedPaisa, waived ? 2 : 0);
        assert.equal(report.rows[0].originalCommissionPaisa, waived ? 0 : 2);
        assert.equal(
          report.totals.reversedPaisa,
          waived ? 0 : index === 3 ? 2 : 1,
        );
        assert.equal(report.totals.netPaisa, waived ? 0 : index === 3 ? 0 : 1);
        const summary = await getSellerFinanceSummary(
          f.database,
          'seller-a',
          100 * 86400000,
        );
        assert.equal(
          summary.availablePaisa,
          waived ? 15 - index * 5 : index === 3 ? 0 : 14 - index * 5,
        );
      }
      assert.deepEqual(
        f.sqlite
          .prepare(
            'SELECT commission_reversal_paisa n FROM refunds ORDER BY processed_at',
          )
          .all()
          .map((r) => r.n),
        waived ? [0, 0, 0] : [1, 0, 1],
      );
      assert.equal(
        (await repository.readOrderMarketplaceFees(f.database, [f.itemId])).get(
          f.itemId,
        )?.standardPaisa,
        2,
      );
    } finally {
      await f.dispose();
    }
  });

void test('promo contribution uses the net fee after waiver while preserving discount eligibility and cost', () => {
  const terms = {
    code: 'SAVE',
    label: 'Fictional discount',
    kind: 'fixed' as const,
    fixedPaisa: 500,
    minimumSubtotalPaisa: 0,
    startsAt: 0,
    endsAt: 1000,
    totalUseLimit: 10,
    perCustomerUseLimit: 1,
    budgetPaisa: 5000,
  };
  const ordinary = promoCostPreview(terms, 10000, 1000);
  const waived = promoCostPreview(terms, 10000, 1000, {
    ...feeWaiverTerms,
    id: 'campaign',
    revision: 2,
    state: 'published',
  });
  assert.equal(ordinary.commissionPaisa, 1000);
  assert.equal(ordinary.contributionPaisa, 500);
  assert.equal(waived.commissionPaisa, 0);
  assert.equal(waived.standardCommissionPaisa, 1000);
  assert.equal(waived.waivedCommissionPaisa, 1000);
  assert.equal(waived.contributionPaisa, -500);
  assert.equal(waived.discountPaisa, ordinary.discountPaisa);
  assert.equal(waived.eligible, ordinary.eligible);
});
