import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { checkoutCommitClock } from '../lib/checkout/commit-policy-guards';
import { recordRefundBankSubmission } from '../lib/payments/refund-advice';
import { uploadFinanceEvidence } from '../lib/payments/refund-evidence';
import { getRefundFinanceWorkspace } from '../lib/payments/refund-workspace';
import { refundPacketFixture } from './helpers/refund-funding-fixture';

void test('Finance shows original tender and packet proof to the independent Super Admin', async () => {
  const f = await refundPacketFixture({ freeDelivery: false });
  try {
    const { m } = f;
    const packet = await m.prepareRefundPacket(f.db, f.ctx('history-prepare', '0'), {
      obligationId: f.obligationId,
      destinationVersionId: f.destinationId,
      fundingStatementId: f.fundingId,
      reason: 'Prepare the exact original fictional refund and verified beneficiary.',
    });
    await m.approveRefundPacket(f.db, f.ctx('history-approve', '0'), {
      packetId: packet.id,
      reason: 'Review the retained company funding and approve the exact fictional packet.',
    });
    await m.startRefundPacket(f.db, f.ctx('history-start', '1'), {
      packetId: packet.id,
      reason: 'Begin this one independently approved fictional bank instruction.',
    });
    const history = async (actorId: string) => getRefundFinanceWorkspace(f.db, actorId, undefined, f.obligationId);
    const processing = (await history('reviewer')).packets[0];
    assert.equal(processing.route, 'manual_bank');
    assert.equal(processing.privateReview?.approvedBy?.id, 'reviewer');
    assert.equal(processing.privateReview?.startedBy?.id, 'reviewer');
    assert.equal(processing.privateReview?.submission, undefined);
    assert.equal(processing.privateReview?.settlement, undefined);

    const files = new Map<string, ArrayBuffer>();
    const bucket = {
      async get(key: string) {
        const bytes = files.get(key);
        return bytes ? { arrayBuffer: async () => bytes } : null;
      },
      async put(key: string, bytes: ArrayBuffer) { files.set(key, bytes); },
    } as unknown as R2Bucket;
    const proofImage = new PNG({ width: 2, height: 2 });
    proofImage.data.fill(255);
    const acknowledgment = await uploadFinanceEvidence(f.db, bucket, f.ctx('history-upload'),
      { kind: 'obligation', id: f.obligationId },
      new File([new Uint8Array(PNG.sync.write(proofImage))], 'fictional-bank-acknowledgment.png', { type: 'image/png' }),
      'staff');
    const { acknowledgedAt } = (await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} AS acknowledgedAt`).first<{ acknowledgedAt: number }>())!;
    await recordRefundBankSubmission(f.db, f.ctx('history-bank-acknowledgment', '2'), {
      packetId: packet.id,
      acknowledgedAt,
      actualAcknowledgmentConfirmed: true,
      evidenceReference: acknowledgment.id,
      reason: 'The fictional bank accepted this exact refund instruction at the retained time.',
    });

    const { bankAt } = (await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} AS bankAt`).first<{ bankAt: number }>())!;
    const transactionIdentity = 'FICTIONAL-WORKSPACE-TRANSFER-123';
    const evidenceReference = 'FICTIONAL-WORKSPACE-INDEPENDENT-BANK-PROOF';
    await m.recordRefundPacketOutcome(f.db, f.ctx('history-settle', '2'), {
      packetId: packet.id,
      outcome: 'paid',
      completedTransferConfirmed: true,
      exactBeneficiaryConfirmed: true,
      amountPaisa: f.cashPaisa,
      bankAt,
      transactionIdentity,
      evidenceReference,
      reason: 'Reconcile the one fictional completed bank transfer against its evidence.',
    });

    const reviewed = await history('reviewer');
    assert.equal(reviewed.destinations[0].privateReview?.details.accountNumber, 'TEST-REFUND-001');
    const original = reviewed.obligations[0];
    assert.equal(original.cashPaisa, 75000);
    assert.equal(original.walletPaisa, 20000);
    assert.deepEqual(original.returnTender, {
      merchandisePaisa: 80000,
      deliveryPaisa: 15000,
      referralOffsetPaisa: 0,
      promoOffsetPaisa: 0,
    });
    const proof = reviewed.packets[0].privateReview;
    assert.ok(proof?.approvedAt && proof.startedAt && proof.recordedAt);
    assert.equal(proof.preparedBy.id, 'reviewer');
    assert.equal(proof.recordedBy?.id, 'reviewer');
    assert.equal(proof.submission?.recordedBy.id, 'reviewer');
    assert.equal(proof.submission?.acknowledgedAt, acknowledgedAt);
    assert.equal(proof.submission?.evidenceReference, acknowledgment.id);
    assert.deepEqual(proof.settlement, { bankAt, transactionIdentity });
    assert.equal(proof.evidenceReference, evidenceReference);

    f.sqlite.prepare('UPDATE staff_permission_profiles SET permissions_json=?,version=version+1 WHERE user_id=?')
      .run(JSON.stringify(['refund.approve.standard']), 'delegate');
    f.sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,?)').run('customer', 'super_admin', bankAt);
    for (const actorId of ['delegate', 'customer']) {
      const workspace = await history(actorId);
      assert.equal(workspace.packets[0].state, 'paid');
      assert.equal(workspace.packets[0].privateReview, undefined);
      assert.equal(workspace.destinations[0].privateReview, undefined);
      assert.ok(!JSON.stringify(workspace).includes(transactionIdentity));
      assert.ok(!JSON.stringify(workspace).includes(evidenceReference));
      assert.ok(!JSON.stringify(workspace).includes(acknowledgment.id));
      assert.ok(!JSON.stringify(workspace).includes('TEST-REFUND-001'));
    }
  } finally {
    f.dispose();
  }
});
