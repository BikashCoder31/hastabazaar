import assert from 'node:assert/strict';
import test from 'node:test';
import { saveCompanyAccountDraft } from '../lib/payments/company-accounts';
import { recordCustomerRefundReversal } from '../lib/payments/customer-refund-reversal';
import { recordBankReceipt } from '../lib/payments/manual-receipts';
import { recordRefundDelayNotice } from '../lib/payments/refund-advice';
import { getRefundFinanceWorkspace } from '../lib/payments/refund-workspace';
import { approvedSellerRecoveryFixture } from './helpers/seller-recovery-fixture';

void test('a returned refund retry retains the original seller conflict after an ownership change', async () => {
  const fixture = await approvedSellerRecoveryFixture();
  const { db, sqlite } = fixture;
  try {
    assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    sqlite.prepare(`INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at)
      VALUES('registered-owner','super_admin',1)`).run();

    const packet = sqlite.prepare(`SELECT id,revision FROM outgoing_payment_packets
      WHERE obligation_id=? AND state='paid'`).get(fixture.obligationId)!;
    const recordCredit = (requestId: string) => recordBankReceipt(db, fixture.ctx(requestId), {
      accountVersionId: fixture.accountVersionId,
      transactionIdentity: `FICTIONAL-${requestId.toUpperCase()}`,
      bankAt: Date.now() - 1,
      amountMinor: fixture.cashPaisa,
      currency: 'NPR',
      payerReference: 'Fictional verified credit from the original payer',
      payerUserId: 'customer',
      evidenceReference: `FICTIONAL-${requestId.toUpperCase()}-EVIDENCE`,
      completedCreditConfirmed: true,
      conflictUserIds: [],
      reason: 'Independently verify the exact fictional receiving account, payer and amount.',
    });

    const returned = await recordCredit('retry-bank-return');
    await recordCustomerRefundReversal(db, fixture.ctx('retry-record-return', String(packet.revision)), {
      packetId: String(packet.id), receiptId: returned.id, receiptRevision: 0, amountPaisa: fixture.cashPaisa,
      actualReversalConfirmed: true,
      evidenceReference: 'FICTIONAL-RETRY-RETURNED-REFUND-PROOF',
      reason: 'The original bank transfer came back as this exact verified credit.',
    });

    const openRetry = (actorId: string, requestId: string, sourceId = returned.id) => fixture.m.openRefundObligation(
      db, { ...fixture.ctx(requestId), actorId }, {
        kind: 'receipt_return', sourceId,
        reason: 'Keep this actual original payer credit with its retained proof.',
      },
    );
    const conflicted = (error: unknown) => error instanceof Error && 'status' in error && error.status === 403;
    await assert.rejects(openRetry('registered-owner', 'deny-original-seller-opening'), conflicted);
    const retry = await openRetry('reviewer', 'independent-retry-opening');

    const independent = async (actorId: string, obligationId = retry.id) => {
      const workspace = await getRefundFinanceWorkspace(db, actorId, undefined, obligationId);
      return workspace.obligations.find(row => row.id === obligationId)?.independentReviewer;
    };
    assert.equal(await independent('registered-owner'), false);
    assert.equal(await independent('reviewer'), true);

    // The recovery record still names the original account after the seller's current owner changes.
    sqlite.prepare("UPDATE seller_profiles SET user_id='customer' WHERE id='registered'").run();
    assert.equal(await independent('registered-owner'), false);
    const delay = (actorId: string, requestId: string) => recordRefundDelayNotice(
      db, { ...fixture.ctx(requestId, String(retry.revision)), actorId }, {
        obligationId: retry.id,
        reasonCode: 'payment_details_needed',
        nextUpdateAt: Date.now() + 3600000,
        reason: 'Finance is waiting for a verified destination for this returned payment.',
      },
    );
    await assert.rejects(delay('registered-owner', 'deny-retained-seller-delay'), conflicted);
    assert.deepEqual(await delay('reviewer', 'independent-retry-delay'), { id: retry.id, revision: 1 });
    assert.deepEqual(sqlite.prepare('SELECT id,revision FROM outgoing_payment_packets WHERE id=?').get(packet.id!), packet);

    const unrelated = await recordCredit('retry-unrelated-credit');
    const standalone = await openRetry('registered-owner', 'standalone-credit-opening', unrelated.id);
    assert.equal(await independent('registered-owner', standalone.id), true);

    const account = sqlite.prepare(`SELECT v.account_id AS id,v.details_json AS details,a.revision
      FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id
      WHERE v.id=?`).get(fixture.accountVersionId)!;
    let rotated = false;
    const racingDb = new Proxy(db, {
      get(target, key, receiver) {
        if (key !== 'batch') return Reflect.get(target, key, receiver);
        return async (statements: D1PreparedStatement[]) => {
          if (!rotated) {
            rotated = true;
            await saveCompanyAccountDraft(db, fixture.ctx('retry-latest-conflict', String(account.revision)), {
              accountId: String(account.id), basedOnVersionId: fixture.accountVersionId,
              details: JSON.parse(String(account.details)), conflictUserIds: ['reviewer'],
              evidenceReference: 'FICTIONAL-NEW-RETURNED-ACCOUNT-CONFLICT',
              reason: 'Retain the newly disclosed conflict on the original receiving company account.',
            });
          }
          return target.batch(statements);
        };
      },
    });
    await assert.rejects(recordRefundDelayNotice(racingDb, fixture.ctx('retry-conflict-before-commit', '1'), {
      obligationId: retry.id, reasonCode: 'payment_details_needed',
      nextUpdateAt: Date.now() + 7200000,
      reason: 'The new bank details need current Finance review.',
    }));
    assert.equal(rotated, true);
    assert.equal(await independent('reviewer'), false);
    assert.equal(sqlite.prepare('SELECT revision FROM refund_obligations WHERE id=?').get(retry.id)?.revision, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM refund_obligation_events WHERE obligation_id=? AND action='customer_delay'").get(retry.id)?.n, 1);
  } finally {
    fixture.dispose();
  }
});
