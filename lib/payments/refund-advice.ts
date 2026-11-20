import { checkoutCommitClock } from '../checkout/commit-policy-guards';
import { financialNoticeStatements } from '../operations/financial-notices';
import { responseScopeContains } from '../orders/response-sql';
import type { CommandContext } from '../workflows/contracts';
import { paymentGuard } from './manual-receipts';
import {
  customerRefundDelayReasons,
  currentRefundDelayReasonSql,
  refundEventValueSql,
  type CustomerRefundDelayReason,
} from './refund-current-progress';
import {
  getRefundObligation,
  refundCommand,
  refundEvent,
  refundIndependence,
  refundText,
  RefundObligationError,
} from './refund-obligations';

interface BankSubmissionInput {
  packetId: string;
  acknowledgedAt: number;
  evidenceReference: string;
  actualAcknowledgmentConfirmed: boolean;
  reason: string;
}

/** Retain independently reviewed bank acceptance of one existing instruction. */
export async function recordRefundBankSubmission(
  db: D1Database,
  ctx: CommandContext,
  input: BankSubmissionInput,
) {
  const packetId = refundText(input.packetId, 'payment packet', 1, 191);
  const packet = await db
    .prepare(`SELECT obligation_id AS obligationId,state,revision,amount_paisa AS amountPaisa,
  started_at AS startedAt,account_version_id AS accountVersionId,destination_version_id AS destinationVersionId
  FROM outgoing_payment_packets WHERE id=?`)
    .bind(packetId)
    .first<{
      obligationId: string;
      state: string;
      revision: number;
      amountPaisa: number;
      startedAt: number | null;
      accountVersionId: string | null;
      destinationVersionId: string | null;
    }>();
  const obligation =
    packet && (await getRefundObligation(db, packet.obligationId));
  if (!packet || !obligation)
    throw new RefundObligationError(
      'Open the original refund payment packet.',
      404,
    );
  const command = await refundCommand(
    db,
    ctx,
    'packet_submitted',
    obligation.id,
    input,
    true,
  );
  if (command.receipt.replayed)
    return command.receipt.result as { id: string; revision: number };

  const reference = refundText(
    input.evidenceReference,
    'retained bank acknowledgment',
    8,
    191,
  );
  const reason = refundText(
    input.reason,
    'independent bank acknowledgment review',
    10,
  );
  const now = checkoutCommitClock(db);
  if (
    !/^fin-file-[a-f0-9]{64}$/.test(reference) ||
    input.actualAcknowledgmentConfirmed !== true
  ) {
    throw new RefundObligationError(
      'Retain private bank acknowledgment evidence and confirm that it accepts this exact payment packet.',
      400,
    );
  }
  if (
    ctx.expectedRevision !== String(packet.revision) ||
    !['processing', 'uncertain'].includes(packet.state) ||
    obligation.state !== packet.state ||
    packet.amountPaisa <= 0 ||
    packet.amountPaisa !== obligation.cashPaisa ||
    packet.startedAt === null ||
    !Number.isSafeInteger(input.acknowledgedAt) ||
    input.acknowledgedAt < packet.startedAt
  ) {
    throw new RefundObligationError(
      'Use the original active cash packet and the actual time the bank acknowledged it.',
    );
  }
  const eventPacket = refundEventValueSql(db, 'packetId');
  const eventEvidence = refundEventValueSql(db, 'evidenceReference');
  const proof = `EXISTS(SELECT 1 FROM outgoing_payment_packets p
  JOIN company_payment_account_versions account ON account.id=p.account_version_id
  JOIN refund_destination_versions destination ON destination.id=p.destination_version_id AND destination.obligation_id=p.obligation_id
  JOIN refund_obligations original ON original.id=p.obligation_id
  JOIN finance_evidence_intents i ON i.id=? AND i.scope_kind='obligation' AND i.scope_id=original.id
  JOIN finance_evidence_files f ON f.id=i.id
  JOIN users uploader ON uploader.id=i.uploaded_by AND uploader.status='active' AND uploader.id<>original.customer_id
  JOIN user_roles uploader_role ON uploader_role.user_id=uploader.id AND uploader_role.role='super_admin'
  WHERE p.id=? AND p.obligation_id=? AND p.revision=? AND p.state=? AND original.state=p.state
   AND p.currency='NPR' AND p.amount_paisa=?
   AND ? BETWEEN p.started_at AND ${now} AND destination.status='verified'
   AND NOT ${responseScopeContains(db, 'account.conflicts_json', '?')}
   AND NOT EXISTS(SELECT 1 FROM refund_obligation_events native_event
    LEFT JOIN finance_evidence_intents earlier ON earlier.id=${eventEvidence}
    LEFT JOIN finance_evidence_files retained ON retained.id=earlier.id
    WHERE native_event.action='packet_submitted' AND (
      (native_event.obligation_id=original.id AND ${eventPacket}=p.id)
      OR (retained.id IS NOT NULL AND earlier.content_hash=i.content_hash))))`;
  const values = [
    reference,
    packetId,
    obligation.id,
    packet.revision,
    packet.state,
    packet.amountPaisa,
    input.acknowledgedAt,
    ctx.actorId,
  ];
  const evidence = await db
    .prepare(
      `SELECT content_hash AS hash FROM finance_evidence_intents WHERE id=? AND ${proof}`,
    )
    .bind(reference, ...values)
    .first<{ hash: string }>();
  if (!evidence || !/^[a-f0-9]{64}$/.test(evidence.hash)) {
    throw new RefundObligationError(
      'Use new retained staff evidence of bank acknowledgment for this exact instruction.',
    );
  }
  // Serialize use of identical evidence across obligations, then recheck the
  // immutable submission history inside the same transaction as the event.
  const evidenceLock = 'refund-bank-acknowledgment:' + evidence.hash;
  const reconciling = packet.state === 'uncertain';
  const packetRevision = reconciling ? packet.revision + 1 : packet.revision;
  // Advance the uncertain packet's revision to invalidate any concurrent
  // outcome review without invalidating the active reconciliation notice.
  const advanceRevision = reconciling
    ? db
        .prepare(
          "UPDATE outgoing_payment_packets SET revision=revision+1 WHERE id=? AND obligation_id=? AND revision=? AND state='uncertain'",
        )
        .bind(packetId, obligation.id, packet.revision)
    : db
        .prepare(
          "UPDATE refund_obligations SET revision=revision+1 WHERE id=? AND revision=? AND state='processing'",
        )
        .bind(obligation.id, obligation.revision);
  const message = reconciling
    ? 'The bank acknowledged your refund instruction. Finance is still checking its outcome.'
    : 'The bank has acknowledged your refund instruction. Settlement is still pending.';
  return command.commit(
    [
      ...(await refundIndependence(
        db,
        ctx.actorId,
        obligation.customerId,
        obligation.orderId,
        obligation.receiptId,
      )),
      db
        .prepare(
          'INSERT INTO operation_transaction_guards(id,valid) VALUES(?,1)',
        )
        .bind(evidenceLock),
      ...paymentGuard(db, proof, values),
      advanceRevision,
      ...paymentGuard(db, 'changes()=1'),
      await refundEvent(db, ctx, obligation.id, 'packet_submitted', message, {
        packetId,
        packetRevision,
        amountPaisa: packet.amountPaisa,
        accountVersionId: packet.accountVersionId,
        destinationVersionId: packet.destinationVersionId,
        acknowledgedAt: input.acknowledgedAt,
        evidenceReference: reference,
        reason,
      }),
      ...(reconciling
        ? []
        : await financialNoticeStatements(db, ctx, {
            kind: 'finance.refund',
            sourceId: obligation.id,
            status: 'packet_submitted',
          })),
      db
        .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
        .bind(evidenceLock),
    ],
    { id: packetId, revision: packetRevision },
  );
}

const updateDate = new Intl.DateTimeFormat('en-NP', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kathmandu',
  timeZoneName: 'short',
});

interface RefundDelayInput {
  obligationId: string;
  reasonCode: CustomerRefundDelayReason;
  nextUpdateAt: number;
  reason: string;
}

/** Record a supported customer update without moving the original binding deadline. */
export async function recordRefundDelayNotice(
  db: D1Database,
  ctx: CommandContext,
  input: RefundDelayInput,
) {
  const id = refundText(input.obligationId, 'original refund identity', 1, 191);
  const row = await getRefundObligation(db, id);
  if (!row)
    throw new RefundObligationError(
      'Open the original refund obligation.',
      404,
    );
  const command = await refundCommand(db, ctx, 'customer_delay', id, input);
  if (command.receipt.replayed)
    return command.receipt.result as { id: string; revision: number };
  const reason = refundText(input.reason, 'current delay reason', 10);
  if (
    typeof input.reasonCode !== 'string' ||
    !Object.hasOwn(customerRefundDelayReasons, input.reasonCode) ||
    !Number.isSafeInteger(input.nextUpdateAt) ||
    input.nextUpdateAt > 8_640_000_000_000_000 ||
    ctx.expectedRevision !== String(row.revision)
  ) {
    throw new RefundObligationError(
      'Use the current refund with its actual delay reason and next update time.',
      400,
    );
  }

  const clock = checkoutCommitClock(db);
  const proof = `EXISTS(SELECT 1 FROM refund_obligations original WHERE original.id=? AND ? > ${clock}
  AND (${currentRefundDelayReasonSql('?')}))`;
  const values = [id, input.nextUpdateAt, input.reasonCode];
  if (
    !(await db
      .prepare('SELECT 1 WHERE ' + proof)
      .bind(...values)
      .first())
  ) {
    throw new RefundObligationError(
      'Choose the reason that matches the current refund and set a future next update time.',
    );
  }
  const revision = row.revision + 1;
  const message = `${customerRefundDelayReasons[input.reasonCode]} Next update by ${updateDate.format(input.nextUpdateAt)}.`;
  return command.commit(
    [
      ...(await refundIndependence(
        db,
        ctx.actorId,
        row.customerId,
        row.orderId,
        row.receiptId,
      )),
      db
        .prepare(
          "UPDATE refund_obligations SET revision=revision+1,next_update_at=? WHERE id=? AND revision=? AND state<>'completed'",
        )
        .bind(input.nextUpdateAt, id, row.revision),
      ...paymentGuard(db, 'changes()=1'),
      ...paymentGuard(db, proof, values),
      await refundEvent(db, ctx, id, 'customer_delay', message, {
        reasonCode: input.reasonCode,
        nextUpdateAt: input.nextUpdateAt,
        obligationRevision: revision,
        reason,
      }),
      ...(await financialNoticeStatements(db, ctx, {
        kind: 'finance.refund',
        sourceId: id,
        status: 'customer_delay',
        detail: message,
      })),
    ],
    { id, revision },
  );
}
