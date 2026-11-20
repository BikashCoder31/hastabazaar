import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { checkoutCommitClock } from '../lib/checkout/commit-policy-guards';
import {
  isCurrentFinancialNotice,
  type CurrentOperationalNotice,
} from '../lib/operations/financial-notice-sources';
import { uploadFinanceEvidence } from '../lib/payments/refund-evidence';
import {
  recordRefundBankSubmission,
  recordRefundDelayNotice,
} from '../lib/payments/refund-advice';
import {
  openRefundObligation,
  submitRefundDestination,
} from '../lib/payments/refund-obligations';
import { getCustomerRefundWorkspace } from '../lib/payments/refund-workspace';
import {
  refundFundingFixture,
  refundPacketFixture,
} from './helpers/refund-funding-fixture';

function retainedBankEvidence(
  f: Awaited<ReturnType<typeof refundPacketFixture>>,
) {
  const objects = new Map<string, ArrayBuffer>();
  const bucket = {
    async put(key: string, value: ArrayBuffer) {
      objects.set(key, value);
    },
    async get(key: string) {
      const value = objects.get(key);
      return value ? { arrayBuffer: async () => value } : null;
    },
  } as unknown as R2Bucket;
  return (requestId: string, shade: number) => {
    const png = new PNG({ width: 2, height: 2 });
    png.data.fill(shade);
    const file = new File(
      [new Uint8Array(PNG.sync.write(png)).buffer],
      `${requestId}.png`,
      { type: 'image/png' },
    );
    return uploadFinanceEvidence(
      f.db,
      bucket,
      f.ctx(requestId),
      { kind: 'obligation', id: f.obligationId },
      file,
      'staff',
    );
  };
}

void test('an authorized cash refund asks for payment details before a destination is supplied', async () => {
  const f = await refundFundingFixture(20000);
  try {
    const obligation = await openRefundObligation(
      f.db,
      f.ctx('notice-details-obligation'),
      {
        kind: 'return_refund',
        sourceId: f.refundId,
        reason: 'Open the original authorized cash refund for review.',
      },
    );
    const [row] = await getCustomerRefundWorkspace(f.db, 'customer');
    assert.equal(row.id, obligation.id);
    assert.equal(row.paymentProgress?.status, 'payment_details_needed');
    assert.equal(row.paymentProgress?.label, 'Payment details needed');

    const now = (await f.db
      .prepare(`SELECT ${checkoutCommitClock(f.db)} AS now`)
      .first<{ now: number }>())!.now;
    const nextUpdateAt = now + 3_600_000;
    await recordRefundDelayNotice(f.db, f.ctx('waiting-for-details', '0'), {
      obligationId: obligation.id,
      reasonCode: 'payment_details_needed',
      nextUpdateAt,
      reason:
        'Review the actual missing beneficiary details for the original approved refund.',
    });
    assert.equal(
      (await getCustomerRefundWorkspace(f.db, 'customer'))[0].nextUpdateAt,
      nextUpdateAt,
    );
    f.sqlite.exec(
      'CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL)',
    );
    const sessionHash = 'FICTIONAL-ADVICE-SESSION';
    f.sqlite
      .prepare('INSERT INTO user_sessions VALUES(?,?,?,?,?)')
      .run(sessionHash, 'customer', now + 3_600_000, now - 1000, now);
    await submitRefundDestination(
      f.db,
      {
        ...f.ctx('advice-details-submitted'),
        actorId: 'customer',
        sessionHash,
      },
      {
        obligationId: obligation.id,
        details: {
          holder: 'Fictional Buyer',
          bank: 'Fictional Bank',
          branch: 'Fictional Branch',
          accountNumber: 'TEST-ADVICE-001',
          currency: 'NPR',
        },
        relationship: 'own_account',
        authorization:
          'I authorize my original refund to be paid to this account for verification.',
        evidenceReference: 'FICTIONAL-PRIVATE-BENEFICIARY',
        reason: 'Save private payment details for independent verification.',
      },
    );
    const [updated] = await getCustomerRefundWorkspace(f.db, 'customer');
    assert.equal(updated.paymentProgress?.status, 'approved');
    assert.equal(updated.paymentProgress?.delay, null);
    assert.equal(
      updated.nextUpdateAt,
      null,
      'A superseded promise must not reappear as the customer update time',
    );
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT next_update_at AS at FROM refund_obligations WHERE id=?',
        )
        .get(obligation.id)?.at,
      nextUpdateAt,
    );
  } finally {
    f.dispose();
  }
});

void test('bank submission and a current delay notice require native facts before the original refund settles', async () => {
  const f = await refundPacketFixture();
  try {
    const view = async () =>
      (await getCustomerRefundWorkspace(f.db, 'customer')).find(
        (row) => row.id === f.obligationId,
      )!;
    const packet = await f.m.prepareRefundPacket(
      f.db,
      f.ctx('advice-prepare', '0'),
      {
        obligationId: f.obligationId,
        destinationVersionId: f.destinationId,
        fundingStatementId: f.fundingId,
        reason:
          'Prepare the originally authorized amount and exact verified beneficiary.',
      },
    );
    await f.m.approveRefundPacket(f.db, f.ctx('advice-approve', '0'), {
      packetId: packet.id,
      reason: 'Approve the exact original cash and verified destination.',
    });
    await f.m.startRefundPacket(f.db, f.ctx('advice-start', '1'), {
      packetId: packet.id,
      reason:
        'Start the original protected packet process without claiming bank acceptance.',
    });
    assert.equal((await view()).paymentProgress?.status, 'approved');

    const clock = async () =>
      (await f.db
        .prepare(`SELECT ${checkoutCommitClock(f.db)} AS now`)
        .first<{ now: number }>())!.now;
    const submission = {
      packetId: packet.id,
      acknowledgedAt: await clock(),
      evidenceReference: 'PRIVATE-BANK-EVIDENCE',
      actualAcknowledgmentConfirmed: true,
      reason:
        'The bank accepted the exact packet for its independent processing.',
    };
    await assert.rejects(
      recordRefundBankSubmission(
        f.db,
        f.ctx('advice-no-proof', '2'),
        submission,
      ),
      /retained|bank acknowledgment/i,
    );
    const proof = await retainedBankEvidence(f)('advice-proof', 255);
    const accepted = { ...submission, evidenceReference: proof.id };
    const submitted = await recordRefundBankSubmission(
      f.db,
      f.ctx('advice-submitted', '2'),
      accepted,
    );
    assert.deepEqual(
      await recordRefundBankSubmission(
        f.db,
        f.ctx('advice-submitted', '2'),
        accepted,
      ),
      submitted,
    );
    assert.equal((await view()).paymentProgress?.status, 'submitted');
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) AS n FROM company_outgoing_bank_identities')
        .get()!.n,
      0,
    );

    await f.m.recordRefundPacketOutcome(f.db, f.ctx('advice-uncertain', '2'), {
      packetId: packet.id,
      outcome: 'uncertain',
      reason: 'The accepted instruction has an uncertain actual outcome.',
      evidenceReference: 'FICTIONAL-PRIVATE-OUTCOME-REVIEW',
    });
    assert.equal((await view()).paymentProgress?.status, 'reconciling');
    await assert.rejects(
      f.m.recordRefundPacketOutcome(f.db, f.ctx('advice-contradiction', '3'), {
        packetId: packet.id,
        outcome: 'failed',
        failureBasis: 'not_sent',
        reason:
          'A contradictory report claims this acknowledged original bank instruction was never sent.',
        evidenceReference: 'FICTIONAL-CONTRADICTORY-NOT-SENT-PROOF',
      }),
      /acknowledg|not sent/i,
    );
    const provisionalNoDebit = {
      packetId: packet.id,
      outcome: 'failed',
      failureBasis: 'no_debit',
      reason: 'A preliminary bank review does not yet show a debit.',
      evidenceReference: 'FICTIONAL-PRELIMINARY-NO-DEBIT',
    } as const;
    await assert.rejects(
      f.m.recordRefundPacketOutcome(
        f.db,
        f.ctx('advice-no-finality', '3'),
        provisionalNoDebit,
      ),
      /final|acknowledg/i,
    );
    const sameProof = {
      ...provisionalNoDebit,
      bankFinalityConfirmed: true,
      evidenceReference: proof.id,
    };
    await assert.rejects(
      f.m.recordRefundPacketOutcome(
        f.db,
        f.ctx('advice-same-proof', '3'),
        sameProof,
      ),
      /final|separate|acknowledg/i,
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT state FROM outgoing_payment_packets WHERE id=?')
        .get(packet.id)?.state,
      'uncertain',
    );
    const obligation = (await f.m.getRefundObligation(f.db, f.obligationId))!;
    const earlierDeadline = (await view()).bindingDueAt;
    const nextUpdateAt = (await clock()) + 3_600_000;
    const delay = {
      obligationId: f.obligationId,
      reasonCode: 'bank_outcome_reconciliation' as const,
      nextUpdateAt,
      reason: 'Private reason about fictional bank case Private-CASE-761.',
    };
    await assert.rejects(
      recordRefundDelayNotice(
        f.db,
        f.ctx('invalid-delay', String(obligation.revision)),
        { ...delay, reasonCode: 'company_funding_review' },
      ),
      /current|reason/i,
    );
    const delayCtx = f.ctx('advice-delay', String(obligation.revision));
    const delayResult = await recordRefundDelayNotice(f.db, delayCtx, delay);
    assert.deepEqual(
      await recordRefundDelayNotice(f.db, delayCtx, delay),
      delayResult,
    );
    assert.equal(
      (await view()).paymentProgress?.delay?.nextUpdateAt,
      nextUpdateAt,
    );
    assert.equal((await view()).bindingDueAt, earlierDeadline);
    const notice = f.sqlite
      .prepare(`SELECT n.template_key template,n.related_id relatedId,n.related_type relatedType,
      n.recipient_user_id userId,n.audience_role audience,n.channel,n.request_id requestId,n.body_en body
      FROM notification_messages n JOIN operational_notice_states current ON current.source_id=n.related_id
      WHERE current.family='finance.refund' AND current.source_id=? AND n.recipient_user_id='customer' AND n.channel='email'
      AND n.body_en LIKE '%Next update%' ORDER BY n.created_at DESC LIMIT 1`)
      .get(f.obligationId) as unknown as CurrentOperationalNotice & {
      body: string;
    };
    assert.ok(notice);
    assert.match(notice.body, /checking the bank|reconcil/i);
    assert.doesNotMatch(notice.body, /Private-CASE-761|fin-file-/);
    assert.equal(await isCurrentFinancialNotice(f.db, notice), true);

    const expiredAt = nextUpdateAt + 1;
    f.sqlite.function('strftime', { varargs: true }, (...args) =>
      String(args[0]) === '%s'
        ? String(Math.floor(expiredAt / 1000))
        : ((expiredAt % 60_000) / 1000).toFixed(3).padStart(6, '0'),
    );
    const expired = await view();
    assert.equal(expired.paymentProgress?.status, 'reconciling');
    assert.equal(expired.paymentProgress?.delay, null);
    assert.equal(
      expired.nextUpdateAt,
      null,
      'An expired promise must not reappear while the review is unresolved',
    );
    assert.equal(await isCurrentFinancialNotice(f.db, notice), false);

    await f.m.recordRefundPacketOutcome(f.db, f.ctx('advice-paid', '3'), {
      packetId: packet.id,
      outcome: 'paid',
      completedTransferConfirmed: true,
      exactBeneficiaryConfirmed: true,
      transactionIdentity: 'FICTIONAL-CONFIRMED-REFUND-ADVICE',
      bankAt: await clock(),
      amountPaisa: f.cashPaisa,
      evidenceReference: 'FICTIONAL-FINAL-REFUND-ADVICE-EVIDENCE',
      reason:
        'Retain independently verified final settlement and the exact beneficiary.',
    });
    const settled = await view();
    assert.equal(settled.paymentProgress?.status, 'confirmed_settled');
    assert.equal(settled.paymentProgress?.delay, null);
    assert.equal(await isCurrentFinancialNotice(f.db, notice), false);
  } finally {
    f.dispose();
  }
});

void test('distinct final bank evidence allows one full retry after an acknowledged instruction closed without a debit', async () => {
  const f = await refundPacketFixture();
  try {
    const input = {
      obligationId: f.obligationId,
      destinationVersionId: f.destinationId,
      fundingStatementId: f.fundingId,
      reason:
        'Prepare the full original cash amount for the same verified beneficiary.',
    };
    const packet = await f.m.prepareRefundPacket(
      f.db,
      f.ctx('finality-prepare', '0'),
      input,
    );
    await f.m.approveRefundPacket(f.db, f.ctx('finality-approve', '0'), {
      packetId: packet.id,
      reason: 'Approve the exact original amount and verified destination.',
    });
    await f.m.startRefundPacket(f.db, f.ctx('finality-start', '1'), {
      packetId: packet.id,
      reason: 'Start the original protected manual instruction workflow.',
    });
    const evidence = retainedBankEvidence(f);
    const acknowledged = await evidence('finality-bank-ack', 255);
    const acknowledgedAt = Number(
      f.sqlite
        .prepare('SELECT started_at FROM outgoing_payment_packets WHERE id=?')
        .get(packet.id)!.started_at,
    );
    await recordRefundBankSubmission(
      f.db,
      f.ctx('finality-bank-submitted', '2'),
      {
        packetId: packet.id,
        evidenceReference: acknowledged.id,
        acknowledgedAt,
        actualAcknowledgmentConfirmed: true,
        reason:
          'Bank acknowledgment accepts this exact original payment packet.',
      },
    );
    await f.m.recordRefundPacketOutcome(
      f.db,
      f.ctx('finality-uncertain', '2'),
      {
        packetId: packet.id,
        outcome: 'uncertain',
        evidenceReference: 'FICTIONAL-BANK-PENDING-FINAL-REVIEW',
        reason:
          'Finance awaits the bank’s final disposition of the accepted instruction.',
      },
    );
    const duplicateFile = await evidence('finality-bank-copy', 255);
    assert.notEqual(duplicateFile.id, acknowledged.id);
    const outcome = {
      packetId: packet.id,
      outcome: 'failed',
      failureBasis: 'no_debit',
      bankFinalityConfirmed: true,
      reason:
        'The bank has closed the original accepted instruction permanently without a debit.',
    } as const;
    await assert.rejects(
      f.m.recordRefundPacketOutcome(f.db, f.ctx('finality-reused-bytes', '3'), {
        ...outcome,
        evidenceReference: duplicateFile.id,
      }),
      /separate|distinct|hash/i,
    );
    const finalProof = await evidence('finality-bank-closed', 128);
    const finalInput = { ...outcome, evidenceReference: finalProof.id };
    const finalCtx = f.ctx('finality-recorded', '3');
    const failure = await f.m.recordRefundPacketOutcome(
      f.db,
      finalCtx,
      finalInput,
    );
    assert.equal(failure.state, 'failed');
    assert.deepEqual(
      await f.m.recordRefundPacketOutcome(f.db, finalCtx, finalInput),
      failure,
    );
    const row = (await f.m.getRefundObligation(f.db, f.obligationId))!;
    assert.equal(row.state, 'open');
    assert.equal(row.cashPaisa, f.cashPaisa);
    const retry = await f.m.prepareRefundPacket(
      f.db,
      f.ctx('finality-full-retry', String(row.revision)),
      input,
    );
    assert.notEqual(retry.id, packet.id);
    assert.equal(
      f.sqlite
        .prepare('SELECT amount_paisa FROM outgoing_payment_packets WHERE id=?')
        .get(retry.id)?.amount_paisa,
      f.cashPaisa,
    );
    await f.m.approveRefundPacket(f.db, f.ctx('finality-retry-approve', '0'), {
      packetId: retry.id,
      reason:
        'Verify the original full refund amount after the prior bank instruction conclusively closed.',
    });
    const updated = (await f.m.getRefundObligation(f.db, f.obligationId))!;
    await assert.rejects(
      f.m.prepareRefundPacket(
        f.db,
        f.ctx('finality-duplicate-retry', String(updated.revision)),
        input,
      ),
    );
    await f.m.startRefundPacket(f.db, f.ctx('finality-retry-start', '1'), {
      packetId: retry.id,
      reason:
        'Prepare the newly authorized replacement without claiming bank acknowledgment.',
    });
    const retryStarted = Number(
      f.sqlite
        .prepare('SELECT started_at FROM outgoing_payment_packets WHERE id=?')
        .get(retry.id)!.started_at,
    );
    await assert.rejects(
      recordRefundBankSubmission(f.db, f.ctx('finality-reused-ack', '2'), {
        packetId: retry.id,
        evidenceReference: duplicateFile.id,
        acknowledgedAt: retryStarted,
        actualAcknowledgmentConfirmed: true,
        reason:
          'The original bank acknowledgment bytes cannot also acknowledge a replacement packet.',
      }),
      /retained|bank acknowledgment/i,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM outgoing_payment_packets WHERE obligation_id=? AND state NOT IN('failed','void')",
        )
        .get(row.id)?.n,
      1,
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) AS n FROM company_outgoing_bank_identities')
        .get()?.n,
      0,
    );
  } finally {
    f.dispose();
  }
});

void test('late bank acknowledgment retains the exact uncertain packet and its current reconciliation notice', async () => {
  const f = await refundPacketFixture();
  try {
    const packet = await f.m.prepareRefundPacket(
      f.db,
      f.ctx('late-prepare', '0'),
      {
        obligationId: f.obligationId,
        destinationVersionId: f.destinationId,
        fundingStatementId: f.fundingId,
        reason: 'Prepare the original authorized cash and exact beneficiary.',
      },
    );
    await f.m.approveRefundPacket(f.db, f.ctx('late-approve', '0'), {
      packetId: packet.id,
      reason: 'Approve the exact original refund instruction.',
    });
    await f.m.startRefundPacket(f.db, f.ctx('late-start', '1'), {
      packetId: packet.id,
      reason: 'Start the reviewed instruction before receiving bank evidence.',
    });
    const pending = await f.m.recordRefundPacketOutcome(
      f.db,
      f.ctx('late-uncertain', '2'),
      {
        packetId: packet.id,
        outcome: 'uncertain',
        evidenceReference: 'FICTIONAL-BANK-DEBIT-HAS-NOT-BEEN-RECONCILED',
        reason: 'Finance is awaiting bank evidence for the active packet.',
      },
    );
    const view = async () =>
      (await getCustomerRefundWorkspace(f.db, 'customer')).find(
        (row) => row.id === f.obligationId,
      )!;
    const latest = (await f.m.getRefundObligation(f.db, f.obligationId))!;
    const acknowledgedAt = (await f.db
      .prepare(`SELECT ${checkoutCommitClock(f.db)} AS now`)
      .first<{ now: number }>())!.now;
    const nextUpdateAt = acknowledgedAt + 3_600_000;
    await recordRefundDelayNotice(
      f.db,
      f.ctx('late-current-update', String(latest.revision)),
      {
        obligationId: f.obligationId,
        reasonCode: 'bank_outcome_reconciliation',
        nextUpdateAt,
        reason: 'Finance will update the buyer after reconciling the transfer.',
      },
    );
    const marker = () =>
      f.sqlite
        .prepare(`SELECT current_event_id,current_status,revision FROM operational_notice_states
          WHERE family='finance.refund' AND source_id=?`)
        .get(f.obligationId);
    const previousMarker = marker();
    assert.equal(previousMarker?.current_status, 'customer_delay');
    assert.equal((await view()).nextUpdateAt, nextUpdateAt);
    const notifications = () =>
      f.sqlite
        .prepare(
          'SELECT COUNT(*) AS n FROM notification_messages WHERE related_id=?',
        )
        .get(f.obligationId)?.n;
    const previousNotifications = notifications();
    const evidence = await retainedBankEvidence(f)('late-bank-proof', 255);
    const command = f.ctx('late-acknowledgment', String(pending.revision));
    const input = {
      packetId: packet.id,
      acknowledgedAt,
      evidenceReference: evidence.id,
      actualAcknowledgmentConfirmed: true,
      reason: 'File the exact acknowledgment received during reconciliation.',
    };
    const recorded = await recordRefundBankSubmission(f.db, command, input);
    assert.deepEqual(
      await recordRefundBankSubmission(f.db, command, input),
      recorded,
    );
    assert.deepEqual(marker(), previousMarker);
    assert.equal(notifications(), previousNotifications);
    assert.equal((await view()).paymentProgress?.status, 'reconciling');
    assert.equal((await view()).nextUpdateAt, nextUpdateAt);
    const events = f.sqlite
      .prepare(`SELECT private_details_json FROM refund_obligation_events
        WHERE obligation_id=? AND action='packet_submitted'`)
      .all(f.obligationId);
    assert.equal(events.length, 1);
    const saved = JSON.parse(String(events[0].private_details_json));
    assert.equal(saved.packetId, packet.id);
    assert.equal(saved.acknowledgedAt, acknowledgedAt);
    assert.equal(saved.evidenceReference, evidence.id);
    await assert.rejects(
      f.m.recordRefundPacketOutcome(
        f.db,
        f.ctx('late-contradictory-release', String(recorded.revision)),
        {
          packetId: packet.id,
          outcome: 'failed',
          failureBasis: 'not_sent',
          evidenceReference: 'FICTIONAL-CONTRADICTORY-BANK-REPORT',
          reason:
            'An incompatible report claims this instruction was never sent.',
        },
      ),
      /acknowledg|not sent/i,
    );
    const retained = f.sqlite
      .prepare(
        'SELECT state,amount_paisa FROM outgoing_payment_packets WHERE id=?',
      )
      .get(packet.id);
    assert.equal(retained?.state, 'uncertain');
    assert.equal(retained?.amount_paisa, f.cashPaisa);
  } finally {
    f.dispose();
  }
});

void test('credit-only restoration cannot produce a bank delay notice', async () => {
  const f = await refundFundingFixture(80000);
  try {
    const obligation = await openRefundObligation(
      f.db,
      f.ctx('credit-delay-obligation'),
      {
        kind: 'return_refund',
        sourceId: f.refundId,
        reason: 'Review the original credit restoration entitlement.',
      },
    );
    const {
      prepareRefundPacket,
      approveRefundPacket,
      startRefundPacket,
      recordRefundPacketOutcome,
      getRefundObligation,
    } = await import('../lib/payments/refund-obligations');
    const packet = await prepareRefundPacket(
      f.db,
      f.ctx('credit-delay-prepare', '0'),
      {
        obligationId: obligation.id,
        destinationVersionId: null,
        fundingStatementId: null,
        reason: 'This exact packet returns original wallet credit only.',
      },
    );
    await approveRefundPacket(f.db, f.ctx('credit-delay-approve', '0'), {
      packetId: packet.id,
      reason: 'Review the original credit and authorize its one restoration.',
    });
    await startRefundPacket(f.db, f.ctx('credit-delay-start', '1'), {
      packetId: packet.id,
      reason:
        'Start the original credit restoration without a bank instruction.',
    });
    const processing = (await getRefundObligation(f.db, obligation.id))!;
    assert.equal(processing.cashPaisa, 0);
    const processingDelay = {
      obligationId: obligation.id,
      reasonCode: 'bank_processing' as const,
      nextUpdateAt: Date.now() + 3_600_000,
      reason: 'This grounds the test in a real zero-cash processing packet.',
    };
    await assert.rejects(
      recordRefundDelayNotice(
        f.db,
        f.ctx('credit-delay-wrong-processing', String(processing.revision)),
        processingDelay,
      ),
      /current refund/i,
    );
    await recordRefundPacketOutcome(
      f.db,
      f.ctx('credit-delay-reconcile', '2'),
      {
        packetId: packet.id,
        outcome: 'uncertain',
        reason: 'The recorded credit restoration outcome is awaiting review.',
        evidenceReference: 'FICTIONAL-CREDIT-OUTCOME-REVIEW',
      },
    );
    const uncertain = (await getRefundObligation(f.db, obligation.id))!;
    await assert.rejects(
      recordRefundDelayNotice(
        f.db,
        f.ctx('credit-delay-wrong-reconciling', String(uncertain.revision)),
        {
          ...processingDelay,
          reasonCode: 'bank_outcome_reconciliation',
        },
      ),
      /current refund/i,
    );
  } finally {
    f.dispose();
  }
});
