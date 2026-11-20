import { fixtureWithOverrides } from './helpers/fixture-delegation';
import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationDestination } from '../lib/operations/notification-links';
import { deliveredLiveFinancialFixture } from './helpers/live-financial-lifecycle-fixture';
import {
  getLiveManagedPayoutPreview,
  prepareLiveManagedPayout,
} from '../lib/managed-commerce/live-payout-operations';
void test('every financial descriptor has a valid audience-scoped exact record destination', () => {
  const cases: Record<string, string[]> = {
    refund_obligation: ['customer', 'staff'],
    payout_transfer: ['seller', 'staff'],
    managed_live_payout: ['seller', 'staff'],
    managed_live_eligibility: ['seller', 'staff'],
    managed_live_clearance: ['seller', 'staff'],
    managed_live_financial_scope: ['staff'],
    lawful_fee_refund_authorization: ['customer', 'staff'],
    managed_live_invoice_adjustment: ['customer', 'staff'],
    company_funding_statement: ['staff'],
    promo_campaign_notice: ['staff'],
    loyalty_programme_notice: ['staff'],
  };
  for (const [type, audiences] of Object.entries(cases))
    for (const audience of ['customer', 'seller', 'staff'] as const) {
      const href = notificationDestination(
        audience,
        audience,
        type,
        'source-one',
      );
      if (audiences.includes(audience)) {
        assert.ok(
          href,
          `${type}/${audience} must not cancel email due to a missing destination`,
        );
        assert.ok(
          href!.includes('source-one'),
          `${type}/${audience} must address its exact record`,
        );
      } else assert.equal(href, null);
    }
  assert.equal(
    notificationDestination(
      'staff',
      'customer',
      'company_funding_statement',
      'source-one',
    ),
    null,
  );
  assert.equal(
    notificationDestination(
      'staff',
      'staff',
      'company_funding_statement',
      '../../other',
    ),
    null,
  );
});
void test('exact live payout destination requires an actually issued current notice and current independent source authority', async () => {
  const path = '../lib/operations/financial-notice-destination',
    resolver = await import(path);
  assert.equal(typeof resolver.readFinancialNoticeDestination, 'function');
  const f = await deliveredLiveFinancialFixture();
  try {
    f.sqlite.exec(
      "INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('destination-dept','destination-dept','dept@local.hastabazaar.test','Fictional payout reviewer','active',1,1);INSERT INTO user_roles(user_id,role,assigned_at) VALUES('destination-dept','admin',1);INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('destination-dept','[\"payout.prepare\"]',1,'reviewer',1);",
    );
    const preview = await getLiveManagedPayoutPreview(
        f.db,
        f.sellerId,
        Date.now(),
      ),
      payout = await prepareLiveManagedPayout(
        f.db,
        f.ctx('destination-actual-payout'),
        {
          sellerId: f.sellerId,
          scheduledFor: Date.now(),
          expectedAmountPaisa: preview.amountPaisa,
          expectedSnapshot: preview.snapshotDigest,
          reason:
            'Review actual original financial notice destination without broadening any money authority.',
        },
      );
    const staff = await resolver.readFinancialNoticeDestination(f.db, {
      actorId: 'reviewer',
      audience: 'staff',
      type: 'managed_live_payout',
      id: payout.id,
    });
    assert.ok(staff);
    assert.equal(staff.recordId, payout.id);
    assert.equal(staff.actionHref, '/admin/programs?sellerId=' + f.sellerId);
    assert.equal(staff.amountPaisa, 69000);
    const department = await resolver.readFinancialNoticeDestination(f.db, {
      actorId: 'destination-dept',
      audience: 'staff',
      type: 'managed_live_payout',
      id: payout.id,
    });
    assert.ok(department);
    assert.equal(
      department.actionHref,
      '/admin/payments/payouts',
      'Department staff must receive a next step their actual current permission can open',
    );
    const owner = await resolver.readFinancialNoticeDestination(f.db, {
      actorId: f.ownerId,
      audience: 'seller',
      type: 'managed_live_payout',
      id: payout.id,
    });
    assert.ok(owner);
    assert.equal(owner.recordId, payout.id);
    assert.equal(
      await resolver.readFinancialNoticeDestination(f.db, {
        actorId: f.buyerId,
        audience: 'customer',
        type: 'managed_live_payout',
        id: payout.id,
      }),
      null,
    );
    assert.equal(
      await resolver.readFinancialNoticeDestination(f.db, {
        actorId: 'reviewer',
        audience: 'staff',
        type: 'managed_live_payout',
        id: 'missing-record',
      }),
      null,
    );
    assert.doesNotMatch(
      JSON.stringify(staff),
      /PRIVATE|accountNumber|TEST-ACTUAL|verification_reference|evidenceReference|account_number/,
    );
    const event = f.sqlite
      .prepare(
        "SELECT current_event_id eventId FROM operational_notice_states WHERE family='finance.payout' AND source_id=?",
      )
      .get(payout.id)!;
    const { operationalNotificationRequestId } =
      await import('../lib/operations/event-catalog');
    const forgedRequest = await operationalNotificationRequestId(
      'business.finance.payout',
      String(event.eventId),
      f.buyerId,
      'email',
    );
    f.sqlite
      .prepare(
        "INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)",
      )
      .run(f.buyerId);
    f.sqlite
      .prepare('UPDATE orders SET customer_id=? WHERE id=?')
      .run(f.ownerId, f.orderId);
    f.sqlite
      .prepare(
        "INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission) SELECT 'forged-buyer-destination',?,'staff','email',template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,'queued',?,created_at,business_event_key,required_permission FROM notification_messages WHERE recipient_user_id='reviewer' AND related_id=? AND audience_role='staff' AND channel='email' LIMIT 1",
      )
      .run(f.buyerId, forgedRequest, payout.id);
    assert.equal(
      await resolver.readFinancialNoticeDestination(f.db, {
        actorId: f.buyerId,
        audience: 'staff',
        type: 'managed_live_payout',
        id: payout.id,
      }),
      null,
      'Immutable original buyer interest survives changed order metadata and a forged correctly shaped staff notice',
    );
    let raced = false;
    const prepare = f.db.prepare.bind(f.db),
      raceDb = fixtureWithOverrides(f.db, {prepare(sql: string) {
          if (sql.includes('payout_number reference') && !raced) {
            raced = true;
            f.sqlite
              .prepare("UPDATE users SET status='disabled' WHERE id='reviewer'")
              .run();
          }
          return prepare(sql);
        }}) as D1Database;
    await assert.rejects(
      resolver.readFinancialNoticeDestination(raceDb, {
        actorId: 'reviewer',
        audience: 'staff',
        type: 'managed_live_payout',
        id: payout.id,
      }),
      (e) => (e as { status: number }).status === 403,
    );
    assert.equal(raced, true);
    await assert.rejects(
      resolver.readFinancialNoticeDestination(f.db, {
        actorId: 'reviewer',
        audience: 'staff',
        type: 'managed_live_payout',
        id: payout.id,
      }),
      (e) => (e as { status: number }).status === 403,
    );
  } finally {
    f.dispose();
  }
});
import { refundActualLiveOrder } from './helpers/live-financial-lifecycle-fixture';
import { issueLiveManagedInvoiceAdjustment } from '../lib/managed-commerce/live-billing';
import { preparePayoutTransfer } from '../lib/payments/payout-transfers';
void test('current financial scope, clearance, funding, packet and actual invoice credit all open their exact protected source without private evidence', async () => {
  const resolver =
      await import('../lib/operations/financial-notice-destination'),
    f = await deliveredLiveFinancialFixture();
  try {
    const currentTypes = [
      'managed_live_financial_scope',
      'managed_live_clearance',
      'company_funding_statement',
    ];
    for (const type of currentTypes) {
      const notice = f.sqlite
        .prepare(
          "SELECT related_id id FROM notification_messages WHERE related_type=? AND audience_role='staff' AND recipient_user_id='reviewer' ORDER BY created_at DESC LIMIT 1",
        )
        .get(type);
      assert.ok(notice, 'Fixture must create its genuine ' + type + ' notice');
      const record = await resolver.readFinancialNoticeDestination(f.db, {
        actorId: 'reviewer',
        audience: 'staff',
        type,
        id: String(notice.id),
      });
      assert.ok(record, 'Current source must open for ' + type);
      assert.equal(record.recordId, notice.id);
      assert.doesNotMatch(
        JSON.stringify(record),
        /evidenceReference|TEST-ACTUAL|FICTIONAL-PRIVATE|accountNumber/,
      );
    }
    const preview = await getLiveManagedPayoutPreview(
        f.db,
        f.sellerId,
        Date.now(),
      ),
      payout = await prepareLiveManagedPayout(
        f.db,
        f.ctx('destination-packet-source'),
        {
          sellerId: f.sellerId,
          scheduledFor: Date.now(),
          expectedAmountPaisa: preview.amountPaisa,
          expectedSnapshot: preview.snapshotDigest,
          reason:
            'Prepare this exact source for destination mapping without completing a bank transfer.',
        },
      );
    const packet = await preparePayoutTransfer(
      f.db,
      f.ctx('destination-packet'),
      {
        model: 'managed',
        payoutId: payout.id,
        accountVersionId: f.sources.accountVersionId,
        reason:
          'Prepare only this original exact bank instruction for the protected source destination.',
      },
    );
    const record = await resolver.readFinancialNoticeDestination(f.db, {
      actorId: 'reviewer',
      audience: 'staff',
      type: 'payout_transfer',
      id: packet.id,
    });
    assert.ok(record);
    assert.equal(
      record.actionHref,
      '/admin/payments/payouts#packet-' + packet.id,
    );
  } finally {
    f.dispose();
  }
  const invoiceFixture = await deliveredLiveFinancialFixture();
  try {
    const paid = await refundActualLiveOrder(
      invoiceFixture,
      'destination-original-credit',
    );
    const invoice = invoiceFixture.sqlite
      .prepare("SELECT id FROM managed_invoice_groups WHERE record_kind='live'")
      .get()!;
    const credit = await issueLiveManagedInvoiceAdjustment(
      invoiceFixture.db,
      invoiceFixture.ctx('destination-credit-note'),
      {
        invoiceGroupId: String(invoice.id),
        sourceKind: 'refund',
        sourceId: paid.refundId,
        reason:
          'Append the commercial credit for the actual original paid refund without exposing internal evidence.',
      },
    );
    const record = await resolver.readFinancialNoticeDestination(
      invoiceFixture.db,
      {
        actorId: invoiceFixture.buyerId,
        audience: 'customer',
        type: 'managed_live_invoice_adjustment',
        id: credit.id,
      },
    );
    assert.ok(record);
    assert.equal(record.recordId, credit.id);
    assert.match(
      record.actionHref,
      new RegExp(
        '/managed-invoices/' + invoice.id + '#adjustment-' + credit.id + '$',
      ),
    );
  } finally {
    invoiceFixture.dispose();
  }
});
import { refundFundingFixture } from './helpers/refund-funding-fixture';
import {
  authorizeLawfulFeeRefund,
  openRefundObligation,
} from '../lib/payments/refund-obligations';
void test('lawful fee authorization has a truthful original customer destination before Finance opens an obligation', async () => {
  const f = await refundFundingFixture(0, { serviceFee: true });
  try {
    const resolver =
        await import('../lib/operations/financial-notice-destination'),
      fee = Number(
        f.sqlite
          .prepare('SELECT buyer_platform_fee_paisa fee FROM orders WHERE id=?')
          .get(f.orderId)!.fee,
      );
    assert.ok(fee > 0);
    const authorized = await authorizeLawfulFeeRefund(
      f.db,
      f.ctx('destination-lawful-fee'),
      {
        orderId: f.orderId,
        amountPaisa: fee,
        legalBasis:
          'Explicit fictional mandatory consumer remedy after independently documented review.',
        caseReference: 'DESTINATION-FEE-CASE',
        evidenceReference: 'FICTIONAL-PRIVATE-LEGAL-REMEDY',
      },
    );
    const row = await resolver.readFinancialNoticeDestination(f.db, {
      actorId: 'customer',
      audience: 'customer',
      type: 'lawful_fee_refund_authorization',
      id: authorized.id,
    });
    assert.ok(row);
    assert.equal(row.amountPaisa, fee);
    assert.match(row.explanation, /separate from Finance opening/);
    assert.doesNotMatch(
      JSON.stringify(row),
      /PRIVATE-LEGAL|legalBasis|evidenceReference/,
    );
    assert.equal(
      await resolver.readFinancialNoticeDestination(f.db, {
        actorId: 'reviewer',
        audience: 'seller',
        type: 'lawful_fee_refund_authorization',
        id: authorized.id,
      }),
      null,
    );
    await openRefundObligation(f.db, f.ctx('destination-fee-obligation'), {
      kind: 'service_fee',
      sourceId: authorized.id,
      reason:
        'Hand the exact legal authorization to Finance without claiming any completed payment.',
    });
    assert.equal(
      await resolver.readFinancialNoticeDestination(f.db, {
        actorId: 'customer',
        audience: 'customer',
        type: 'lawful_fee_refund_authorization',
        id: authorized.id,
      }),
      null,
      'Superseded pre-obligation notice cannot misdescribe the current handoff',
    );
  } finally {
    f.dispose();
  }
});
