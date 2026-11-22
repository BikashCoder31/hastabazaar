import assert from 'node:assert/strict';
import test from 'node:test';
import { accountingFixture } from './helpers/accounting-fixture';
import { parseAccountingQuery } from '../lib/accounting/filters';

const NOW = Date.parse('2026-10-18T05:00:00Z');
async function reader() {
  const m = await import('../lib/accounting/source-queries').catch(() => null);
  assert.ok(m, 'Read-only Accounting source reader must exist');
  return m.readAccountingSources;
}
const query = (s = 'period=all') =>
  parseAccountingQuery(new URLSearchParams(s), NOW);
void test('Accounting reads populated actual migrated schema without writes or fabricated bank cash', async () => {
  const read = await reader(),
    f = await accountingFixture(true);
  try {
    f.insert('users', {
      id: 'full-schema-user',
      email: 'fixture@example.test',
      display_name: 'Fixture',
      status: 'active',
      created_at: NOW,
      updated_at: NOW,
    });
    f.insert('wallet_accounts', {
      user_id: 'full-schema-user',
      referral_code: 'ACCOUNTING-FIXTURE',
      balance_paisa: 12345,
      created_at: NOW,
    });
    const before = f.fingerprint();
    const result = await read(f.db, query(), NOW, 'local_staging');
    assert.ok(result.coverage.length >= 10);
    assert.ok(
      result.coverage.every((c) => c.available),
      JSON.stringify(result.issues),
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'bank_balance')?.amountPaisa,
      null,
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'wallet_balance')?.amountPaisa,
      '12345',
    );
    assert.equal(f.fingerprint(), before);
  } finally {
    f.dispose();
  }
});
void test('Accounting aggregates all historical makers beyond display limits and cursor pages preserve totals', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    for (let i = 0; i < 201; i++) {
      f.insert('managed_commercial_snapshots', {
        id: `s${i}`,
        order_item_id: `i${i}`,
        seller_id: `m${i}`,
        commercial_model: 'managed_sale_linked_percentage_v1',
        eligible_base_paisa: 100000,
        platform_retained_paisa: 9000,
        maker_entitlement_paisa: 91000,
        platform_retention_bps: 900,
        delivery_hold_days: 7,
        created_at: NOW - 1000,
      });
      f.insert('managed_entitlements', {
        id: `e${i}`,
        snapshot_id: `s${i}`,
        seller_id: `m${i}`,
        status: 'held',
        calculated_paisa: 91000,
        earned_at: NOW - 1000,
        hold_until: NOW + 10000,
        created_at: NOW - 1000,
        version: 1,
      });
      f.insert('managed_settlement_entries', {
        id: `x${i}`,
        entitlement_id: `e${i}`,
        type: 'earned',
        amount_paisa: 91000,
        created_at: NOW - 1000,
      });
      f.insert('seller_participation_profiles', {
        seller_id: `m${i}`,
        participation_route: 'registered_seller',
      });
    }
    const before = f.fingerprint(),
      first = await read(
        f.db,
        query('period=all&section=makers'),
        NOW,
        'local_staging',
      );
    assert.equal(
      first.metrics.find((m) => m.key === 'maker_held')?.amountPaisa,
      '18291000',
    );
    assert.equal(
      first.metrics.find((m) => m.key === 'maker_payable')?.amountPaisa,
      '0',
    );
    const ids = new Set<string>();
    let page = first;
    for (let n = 0; n < 20; n++) {
      for (const row of page.rows) {
        assert.ok(!ids.has(row.sourceKind + row.sourceId));
        ids.add(row.sourceKind + row.sourceId);
      }
      if (!page.nextCursor) break;
      page = await read(
        f.db,
        query(
          `period=all&section=makers&cursor=${encodeURIComponent(page.nextCursor)}`,
        ),
        NOW,
        'local_staging',
      );
      assert.deepEqual(page.metrics, first.metrics);
    }
    assert.equal(ids.size, 402);
    assert.equal(f.fingerprint(), before);
  } finally {
    f.dispose();
  }
});
void test('Accounting excludes managed commission and preserves exact recorded legacy rates', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    f.insert('order_items', {
      id: 'independent',
      order_id: 'o',
      seller_id: 's',
      commission_bps: 1000,
      commission_paisa: 10000,
      line_total_paisa: 100000,
      commission_rule_version: 'old',
      fulfillment_status: 'delivered',
    });
    f.insert('orders', {
      id: 'o',
      order_number: 'O-1',
      status: 'delivered',
      payment_status: 'paid',
      created_at: NOW - 1000,
    });
    f.insert('seller_ledger_entries', {
      id: 'l',
      seller_id: 's',
      order_item_id: 'independent',
      type: 'commission',
      amount_paisa: -10000,
      created_at: NOW - 1000,
      available_at: NOW - 1000,
    });
    f.insert('order_items', {
      id: 'managed',
      order_id: 'o',
      seller_id: 's',
      commission_rule_version: 'managed-percentage',
    });
    f.insert('seller_ledger_entries', {
      id: 'bad',
      seller_id: 's',
      order_item_id: 'managed',
      type: 'commission',
      amount_paisa: -9000,
      created_at: NOW - 1000,
    });
    const result = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'seller_commission_earned')
        ?.amountPaisa,
      '10000',
    );
    assert.ok(!result.rows.some((r) => r.sourceId === 'bad'));
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT commission_bps n FROM order_items WHERE id='independent'",
        )
        .get()?.n,
      1000,
    );
  } finally {
    f.dispose();
  }
});
void test('Accounting separates posted cash, actual refund cash and document-only corrections', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    for (const [id, kind, status] of [
      ['c', 'collection', 'posted'],
      ['r', 'remittance', 'posted'],
      ['pending', 'collection', 'pending'],
    ])
      f.insert('parcel_cash_records', {
        id,
        kind,
        status,
        amount_paisa: 100000,
        created_at: NOW - 1000,
      });
    f.insert('refunds', {
      id: 'f',
      status: 'paid',
      amount_paisa: 10000,
      wallet_credit_paisa: 1000,
      referral_discount_paisa: 2000,
      promo_discount_paisa: 500,
      requested_at: NOW - 3000,
      processed_at: NOW - 1000,
    });
    f.insert('managed_invoice_adjustments', {
      id: 'note',
      adjustment_number: 'SIM-CN',
      kind: 'credit_note',
      amount_paisa: 10000,
      issued_at: NOW - 1000,
    });
    const result = await read(
      f.db,
      query('period=all&section=cash'),
      NOW,
      'local_staging',
    );
    for (const [key, want] of [
      ['cod_collected', '100000'],
      ['cod_remitted', '100000'],
      ['refund_cash', '6500'],
      ['refund_credit', '1000'],
      ['refund_discount', '2500'],
    ])
      assert.equal(
        result.metrics.find((m) => m.key === key)?.amountPaisa,
        want,
        key,
      );
    assert.equal(
      result.rows.find((r) => r.sourceId === 'f')?.amountPaisa,
      '6500',
    );
  } finally {
    f.dispose();
  }
});
void test('Accounting missing source is unavailable while other confirmed sources remain readable', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    f.sqlite.exec('DROP TABLE promo_redemptions');
    const result = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'promo_discounts')?.status,
      'unavailable',
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'cod_collected')?.amountPaisa,
      '0',
    );
    assert.ok(result.issues.some((i) => i.code === 'source_unavailable'));
  } finally {
    f.dispose();
  }
});
void test('Accounting uses original company retention and rejects inconsistent snapshot arithmetic', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    f.insert('managed_commercial_snapshots', {
      id: 'snap',
      commercial_model: 'managed_sale_linked_percentage_v1',
      eligible_base_paisa: 100000,
      platform_retained_paisa: 9000,
      maker_entitlement_paisa: 91000,
    });
    f.insert('managed_entitlements', {
      id: 'ent',
      snapshot_id: 'snap',
      seller_id: 'maker',
      calculated_paisa: 91000,
      earned_at: NOW - 1000,
      created_at: NOW - 1000,
    });
    let result = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_company_retention')
        ?.amountPaisa,
      '9000',
    );
    f.sqlite.exec(
      'UPDATE managed_commercial_snapshots SET maker_entitlement_paisa=92000',
    );
    result = await read(f.db, query(), NOW, 'local_staging');
    assert.ok(result.issues.some((i) => i.code === 'source_mismatch'));
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_payable')?.amountPaisa,
      null,
    );
  } finally {
    f.dispose();
  }
});
void test('Accounting matches canonical maker readiness including failed reservations and negative positions', async () => {
  const read = await reader(),
    f = await accountingFixture();
  const { getManagedFinanceSummary } =
    await import('../lib/managed-commerce/payout-operations');
  try {
    const old = NOW - 10 * 86400000;
    f.insert('orders', {
      id: 'o',
      status: 'delivered',
      payment_status: 'paid',
      delivered_at: old,
      created_at: old,
    });
    f.insert('order_items', {
      id: 'i',
      order_id: 'o',
      seller_id: 'm',
      fulfillment_status: 'delivered',
    });
    f.insert('managed_commercial_snapshots', {
      id: 's',
      // This permissive fixture omits defaults; the canonical payout reader requires simulation provenance.
      record_kind: 'simulation',
      order_item_id: 'i',
      seller_id: 'm',
      commercial_model: 'managed_sale_linked_percentage_v1',
      eligible_base_paisa: 100000,
      platform_retained_paisa: 9000,
      maker_entitlement_paisa: 91000,
      delivery_hold_days: 7,
    });
    f.insert('managed_entitlements', {
      id: 'e',
      snapshot_id: 's',
      seller_id: 'm',
      status: 'eligible',
      calculated_paisa: 91000,
      earned_at: old,
      hold_until: old + 7 * 86400000,
      eligible_at: old + 7 * 86400000,
      created_at: old,
    });
    f.insert('managed_settlement_entries', {
      id: 'x',
      entitlement_id: 'e',
      amount_paisa: 91000,
      type: 'earned',
      created_at: old,
    });
    for (const status of ['none', 'failed', 'paid']) {
      if (status === 'failed')
        f.insert('managed_payouts', {
          id: 'p',
          record_kind: 'simulation',
          seller_id: 'm',
          amount_paisa: 1000,
          status,
          created_at: old,
        });
      if (status === 'paid') {
        f.sqlite.exec("UPDATE managed_payouts SET status='paid'");
        f.insert('managed_payout_allocations', {
          payout_id: 'p',
          entitlement_id: 'e',
          amount_paisa: 1000,
          disposition: 'paid',
        });
      }
      const expected = await getManagedFinanceSummary(f.db, 'm', NOW),
        result = await read(f.db, query(), NOW, 'local_staging');
      for (const [key, value] of [
        ['maker_payable', expected.payablePaisa],
        ['maker_balance', expected.balancePaisa],
        ['maker_reserved', expected.reservedPaisa],
      ] as const)
        assert.equal(
          result.metrics.find((m) => m.key === key)?.amountPaisa,
          String(value),
          status + ':' + key,
        );
    }
    f.insert('managed_settlement_entries', {
      id: 'negative',
      entitlement_id: 'e',
      amount_paisa: -100000,
      type: 'adjustment',
      created_at: NOW - 1,
    });
    const result = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_payable')?.amountPaisa,
      '0',
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_balance')?.amountPaisa,
      '-10000',
    );
  } finally {
    f.dispose();
  }
});
void test('Accounting sums exact large signed amounts and fails closed on a non-integer source', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    for (const id of ['A', 'a', 'é', 'z'])
      f.insert('parcel_cash_records', {
        id,
        kind: 'collection',
        status: 'posted',
        amount_paisa: 9007199254740991,
        created_at: NOW - 1,
      });
    const result = await read(
      f.db,
      query('period=all&section=cash&pageSize=1'),
      NOW,
      'local_staging',
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'cod_collected')?.amountPaisa,
      '36028797018963964',
    );
    const ids = [];
    let page = result;
    while (true) {
      ids.push(page.rows[0].sourceId);
      if (!page.nextCursor) break;
      page = await read(
        f.db,
        query(
          'period=all&section=cash&pageSize=1&cursor=' +
            encodeURIComponent(page.nextCursor),
        ),
        NOW,
        'local_staging',
      );
    }
    assert.equal(new Set(ids).size, 4);
    f.sqlite.exec(
      "UPDATE parcel_cash_records SET amount_paisa=0.5 WHERE id='A'",
    );
    const bad = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      bad.metrics.find((m) => m.key === 'cod_collected')?.status,
      'unavailable',
    );
    assert.ok(bad.issues.some((i) => i.code === 'source_unavailable'));
  } finally {
    f.dispose();
  }
});
void test('Accounting marks an unprovable large maker refund as review instead of a confirmed zero', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    const old = NOW - 10 * 86400000;
    f.insert('orders', {
      id: 'o',
      status: 'delivered',
      payment_status: 'part_refunded',
      delivered_at: old,
      created_at: old,
    });
    f.insert('order_items', {
      id: 'i',
      order_id: 'o',
      seller_id: 'm',
      fulfillment_status: 'delivered',
    });
    f.insert('managed_commercial_snapshots', {
      id: 's',
      // Keep the comparison in the canonical simulation payout reader's explicit scope.
      record_kind: 'simulation',
      order_item_id: 'i',
      seller_id: 'm',
      commercial_model: 'managed_sale_linked_percentage_v1',
      eligible_base_paisa: 1000000000,
      platform_retained_paisa: 90000000,
      maker_entitlement_paisa: 910000000,
      delivery_hold_days: 7,
    });
    f.insert('managed_entitlements', {
      id: 'e',
      snapshot_id: 's',
      seller_id: 'm',
      status: 'eligible',
      calculated_paisa: 910000000,
      earned_at: old,
      hold_until: old + 7 * 86400000,
      eligible_at: old + 7 * 86400000,
      created_at: old,
    });
    f.insert('managed_settlement_entries', {
      id: 'earned',
      entitlement_id: 'e',
      amount_paisa: 910000000,
      type: 'earned',
      created_at: old,
    });
    f.insert('managed_settlement_entries', {
      id: 'refund',
      entitlement_id: 'e',
      amount_paisa: -455000000,
      base_amount_paisa: 500000000,
      type: 'refund_adjustment',
      created_at: NOW - 1,
    });
    const { getManagedFinanceSummary } =
      await import('../lib/managed-commerce/payout-operations');
    assert.equal(
      (await getManagedFinanceSummary(f.db, 'm', NOW)).payablePaisa,
      455000000,
    );
    const result = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_payable')?.amountPaisa,
      null,
    );
    assert.ok(result.issues.some((i) => i.code === 'unsafe_money'));
  } finally {
    f.dispose();
  }
});
void test('Accounting includes more than 50 paid payouts and excludes failed/cancelled requests', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    for (let n = 0; n < 61; n++) {
      f.insert('managed_payouts', {
        id: 'mp' + n,
        seller_id: 'm',
        status: 'paid',
        amount_paisa: 1000,
        created_at: NOW - 10,
        paid_at: NOW - 1,
      });
      f.insert('payouts', {
        id: 'sp' + n,
        seller_id: 's',
        status: 'paid',
        amount_paisa: 2000,
        created_at: NOW - 10,
        paid_at: NOW - 1,
      });
    }
    f.insert('managed_payouts', {
      id: 'failed',
      seller_id: 'm',
      status: 'failed',
      amount_paisa: 999999,
      created_at: NOW - 1,
    });
    const result = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_paid')?.amountPaisa,
      '61000',
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'seller_paid')?.amountPaisa,
      '122000',
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_balance')?.amountPaisa,
      '-61000',
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_reserved')?.amountPaisa,
      '999999',
    );
    assert.ok(result.issues.some((i) => i.code === 'source_mismatch'));
  } finally {
    f.dispose();
  }
});
void test('Accounting deducts legacy paid links once and preserves released allocations', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    f.insert('managed_commercial_snapshots', {
      id: 's',
      commercial_model: 'managed_sale_linked_percentage_v1',
      eligible_base_paisa: 100000,
      platform_retained_paisa: 9000,
      maker_entitlement_paisa: 91000,
    });
    f.insert('managed_entitlements', {
      id: 'e',
      seller_id: 'm',
      snapshot_id: 's',
      status: 'held',
      calculated_paisa: 91000,
      created_at: NOW - 10,
    });
    f.insert('managed_settlement_entries', {
      id: 'x',
      entitlement_id: 'e',
      amount_paisa: 91000,
      type: 'earned',
      created_at: NOW - 10,
    });
    f.insert('managed_payouts', {
      id: 'p',
      seller_id: 'm',
      status: 'paid',
      amount_paisa: 91000,
      paid_at: NOW - 1,
      created_at: NOW - 10,
    });
    f.insert('managed_payout_entries', {
      payout_id: 'p',
      settlement_entry_id: 'x',
    });
    let result = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_held')?.amountPaisa,
      '0',
    );
    f.insert('managed_payout_allocations', {
      payout_id: 'p',
      entitlement_id: 'e',
      amount_paisa: 91000,
      disposition: 'paid',
    });
    result = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_held')?.amountPaisa,
      '0',
    );
    f.insert('managed_payouts', {
      id: 'released',
      seller_id: 'm',
      status: 'cancelled',
      amount_paisa: 5000,
      created_at: NOW - 10,
    });
    f.insert('managed_payout_allocations', {
      payout_id: 'released',
      entitlement_id: 'e',
      amount_paisa: 5000,
      disposition: 'released',
    });
    result = await read(f.db, query(), NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_held')?.amountPaisa,
      '0',
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'maker_reserved')?.amountPaisa,
      '0',
    );
  } finally {
    f.dispose();
  }
});
void test('Accounting period flows use half-open Nepal event boundaries while positions remain current', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    const q = query('period=today');
    for (const [id, at] of [
      ['before', q.fromAt - 1],
      ['start', q.fromAt],
      ['end', q.toExclusive - 1],
      ['after', q.toExclusive],
    ] as const)
      f.insert('parcel_cash_records', {
        id,
        kind: 'collection',
        status: 'posted',
        amount_paisa: 100,
        created_at: at,
      });
    const result = await read(f.db, q, NOW, 'local_staging');
    assert.equal(
      result.metrics.find((m) => m.key === 'cod_collected')?.amountPaisa,
      '200',
    );
    assert.deepEqual(
      result.rows.map((r) => r.sourceId),
      ['end', 'start'],
    );
  } finally {
    f.dispose();
  }
});
void test('Accounting financial read failure never becomes confirmed zero', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    const db = {
      prepare(sql: string) {
        if (sql.startsWith('WITH ')) throw Error('Fictional read interrupted');
        return f.db.prepare(sql);
      },
    } as D1Database;
    const result = await read(db, query(), NOW, 'local_staging');
    assert.ok(
      result.metrics.every(
        (m) => m.status === 'unavailable' && m.amountPaisa === null,
      ),
    );
    assert.equal(result.rows.length, 0);
    assert.ok(result.issues.some((i) => i.code === 'source_unavailable'));
  } finally {
    f.dispose();
  }
});
void test('Accounting financial SELECT avoids the MariaDB reserved KEY alias', async () => {
  const read = await reader(),
    f = await accountingFixture();
  try {
    const db = {
      prepare(sql: string) {
        if (/\bAS\s+key\b/i.test(sql))
          throw Error('MariaDB reserved identifier KEY');
        return f.db.prepare(sql);
      },
    } as D1Database;
    const result = await read(
      db,
      query(),
      NOW,
      'Disposable portability contract',
    );
    assert.equal(
      result.metrics.find((m) => m.key === 'cod_collected')?.amountPaisa,
      '0',
    );
    assert.ok(!result.issues.some((i) => i.code === 'source_unavailable'));
  } finally {
    f.dispose();
  }
});
