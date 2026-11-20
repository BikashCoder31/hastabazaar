import { readRefundRouteCapabilities } from './refund-route-capabilities';

export interface FonepayOriginalPayment {
  readonly orderId: string;
  readonly transactionId: string;
  readonly sessionNumber: string;
}

/** Capture facts supplied by an isolated fixture. */
export interface FonepaySimulationCapture extends FonepayOriginalPayment {
  readonly capturedPaisa: number;
  readonly currency: 'NPR';
  readonly refundEligible: boolean;
}

export interface FonepaySimulationRefundRequest {
  readonly original: FonepayOriginalPayment;
  readonly obligationId: string;
  readonly authorizedPaisa: number;
  readonly amountPaisa: number;
  readonly currency: string;
  readonly idempotencyKey: string;
}

export interface FonepaySimulationReference {
  readonly original: FonepayOriginalPayment;
  readonly obligationId: string;
  readonly providerReference: string;
}

type OutcomeStatus =
  | 'submitted'
  | 'uncertain'
  | 'partial'
  | 'settled'
  | 'closed';

export interface FonepaySimulationOutcome extends FonepaySimulationReference {
  readonly eventReference: string;
  readonly status: OutcomeStatus;
  /** For a provisional partial event, this is the amount reported by the simulated provider. */
  readonly settledPaisa?: number;
  readonly confirmedUnsentPaisa?: number;
  readonly proofReference?: string;
}

export interface FonepaySimulationAttempt extends FonepaySimulationReference {
  readonly amountPaisa: number;
  readonly currency: 'NPR';
  readonly status: 'reserved' | OutcomeStatus;
  readonly settledPaisa: number;
  readonly reportedPaisa: number;
  readonly remainingPaisa: number;
  readonly reservedPaisa: number;
}

type Eligibility = { eligible: true } | { eligible: false; reason: string };

type Capture = {
  amountPaisa: number;
  refundEligible: boolean;
  reservedPaisa: number;
  settledPaisa: number;
};
type Obligation = {
  captureKey: string;
  authorizedPaisa: number;
  settledPaisa: number;
  active: boolean;
};

function isReference(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= 191
  );
}

function isPaisa(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function paymentKey(original: FonepayOriginalPayment): string | null {
  if (
    !original ||
    ![original.orderId, original.transactionId, original.sessionNumber].every(
      isReference,
    )
  )
    return null;
  return JSON.stringify([
    original.orderId,
    original.transactionId,
    original.sessionNumber,
  ]);
}

function validEventAmounts(
  attempt: FonepaySimulationAttempt,
  event: FonepaySimulationOutcome,
) {
  const settled = event.settledPaisa ?? 0;
  const unsent = event.confirmedUnsentPaisa ?? 0;
  if (!isPaisa(settled) || !isPaisa(unsent))
    throw new Error('Use whole paisa from the simulated outcome.');

  switch (event.status) {
    case 'submitted':
    case 'uncertain':
      if (settled !== 0 || unsent !== 0)
        throw new Error('This outcome provides no final amount evidence.');
      return;
    case 'partial':
      if (settled <= 0 || settled >= attempt.amountPaisa || unsent !== 0) {
        throw new Error(
          'A provisional partial report must be positive and smaller than the reserved amount.',
        );
      }
      return;
    case 'settled':
      if (settled !== attempt.amountPaisa || unsent !== 0) {
        throw new Error('Full settlement requires proof of the full amount.');
      }
      return;
    case 'closed':
      if (
        settled >= attempt.amountPaisa ||
        unsent !== attempt.amountPaisa - settled
      ) {
        throw new Error(
          'Final evidence must confirm exactly the unsent remainder of this attempt.',
        );
      }
      return;
    default:
      throw new Error('Use a supported simulated refund outcome.');
  }
}

/** An isolated, in-memory provider simulation with fixture-supplied payment and authorization facts. */
export function createFonepayRefundSimulator(
  binding: object,
  simulatedCaptures: readonly FonepaySimulationCapture[],
) {
  const captures = new Map<string, Capture>();
  const providerCaptures = new Set<string>();
  for (const capture of simulatedCaptures) {
    const captureKey = paymentKey(capture);
    const providerKey = JSON.stringify([
      capture.transactionId,
      capture.sessionNumber,
    ]);
    if (
      !captureKey ||
      providerCaptures.has(providerKey) ||
      capture.currency !== 'NPR' ||
      !isPaisa(capture.capturedPaisa) ||
      capture.capturedPaisa === 0
    ) {
      throw new Error(
        'Supply a distinct original simulated NPR capture with its exact provider references.',
      );
    }
    providerCaptures.add(providerKey);
    captures.set(captureKey, {
      amountPaisa: capture.capturedPaisa,
      refundEligible: capture.refundEligible === true,
      reservedPaisa: 0,
      settledPaisa: 0,
    });
  }

  const obligations = new Map<string, Obligation>();
  const attempts = new Map<string, FonepaySimulationAttempt>();
  const requests = new Map<string, { signature: string; reference: string }>();
  const events = new Map<string, string>();
  const proofReferences = new Set<string>();

  function checkEligibility(
    input: Omit<FonepaySimulationRefundRequest, 'idempotencyKey'>,
  ): Eligibility {
    const capabilities = readRefundRouteCapabilities(binding);
    if (
      !capabilities.fonepaySimulationAdmission ||
      !capabilities.fonepaySimulationRetainedRead
    ) {
      return {
        eligible: false,
        reason: 'New simulated Fonepay refunds are disabled.',
      };
    }
    const captureKey = paymentKey(input.original);
    const capture = captureKey ? captures.get(captureKey) : undefined;
    if (
      !capture?.refundEligible ||
      input.currency !== 'NPR' ||
      !isReference(input.obligationId)
    ) {
      return {
        eligible: false,
        reason:
          'Use the exact eligible original simulated NPR capture and authorization.',
      };
    }
    if (
      !isPaisa(input.amountPaisa) ||
      input.amountPaisa === 0 ||
      !isPaisa(input.authorizedPaisa) ||
      input.authorizedPaisa === 0
    ) {
      return {
        eligible: false,
        reason:
          'Use a positive original authorization and refund amount in whole paisa.',
      };
    }
    const obligation = obligations.get(input.obligationId);
    if (
      obligation &&
      (obligation.captureKey !== captureKey ||
        obligation.authorizedPaisa !== input.authorizedPaisa)
    ) {
      return {
        eligible: false,
        reason: 'The original authorization cannot be changed.',
      };
    }
    if (obligation?.active)
      return {
        eligible: false,
        reason: 'The original simulated attempt is still reserved.',
      };
    if (
      input.amountPaisa !==
      input.authorizedPaisa - (obligation?.settledPaisa ?? 0)
    ) {
      return {
        eligible: false,
        reason: 'Use the exact authorized remainder for this refund.',
      };
    }
    if (
      input.amountPaisa >
      capture.amountPaisa - capture.reservedPaisa - capture.settledPaisa
    ) {
      return {
        eligible: false,
        reason: 'The original capture has insufficient unreserved funds.',
      };
    }
    return { eligible: true };
  }

  function requestRefund(
    input: FonepaySimulationRefundRequest,
  ): FonepaySimulationAttempt {
    if (!isReference(input.idempotencyKey))
      throw new Error('A simulated request requires an idempotency key.');
    const captureKey = paymentKey(input.original);
    const signature = JSON.stringify([
      captureKey,
      input.obligationId,
      input.authorizedPaisa,
      input.amountPaisa,
      input.currency,
    ]);
    const replay = requests.get(input.idempotencyKey);
    if (replay) {
      if (!readRefundRouteCapabilities(binding).fonepaySimulationRetainedRead)
        throw new Error('Retained simulated refunds are disabled.');
      if (replay.signature !== signature)
        throw new Error(
          'This request replay changes the original refund facts.',
        );
      return attempts.get(replay.reference)!;
    }

    const eligibility = checkEligibility(input);
    if (!eligibility.eligible) throw new Error(eligibility.reason);
    const providerReference = `SIM-FONEPAY-${crypto.randomUUID()}`;
    if (attempts.has(providerReference))
      throw new Error('This simulated provider reference already exists.');
    const original = Object.freeze({
      orderId: input.original.orderId,
      transactionId: input.original.transactionId,
      sessionNumber: input.original.sessionNumber,
    });
    const attempt = Object.freeze<FonepaySimulationAttempt>({
      original,
      providerReference,
      obligationId: input.obligationId,
      currency: 'NPR',
      status: 'reserved',
      amountPaisa: input.amountPaisa,
      settledPaisa: 0,
      reportedPaisa: 0,
      remainingPaisa: input.amountPaisa,
      reservedPaisa: input.amountPaisa,
    });
    const obligation = obligations.get(input.obligationId) ?? {
      captureKey: captureKey!,
      authorizedPaisa: input.authorizedPaisa,
      settledPaisa: 0,
      active: false,
    };
    obligation.active = true;
    obligations.set(input.obligationId, obligation);
    captures.get(obligation.captureKey)!.reservedPaisa += input.amountPaisa;
    attempts.set(providerReference, attempt);
    requests.set(input.idempotencyKey, {
      signature,
      reference: providerReference,
    });
    return attempt;
  }

  function lookupByReference(
    scope: FonepaySimulationReference,
  ): FonepaySimulationAttempt | null {
    if (!readRefundRouteCapabilities(binding).fonepaySimulationRetainedRead)
      return null;
    const attempt = attempts.get(scope.providerReference);
    if (!attempt || attempt.obligationId !== scope.obligationId) return null;
    return paymentKey(attempt.original) === paymentKey(scope.original)
      ? attempt
      : null;
  }

  function recordOutcome(
    event: FonepaySimulationOutcome,
  ): FonepaySimulationAttempt {
    const attempt = lookupByReference(event);
    if (!attempt || !isReference(event.eventReference))
      throw new Error(
        'Use the exact original scope and simulated event reference.',
      );
    const signature = JSON.stringify([
      event.providerReference,
      event.status,
      event.settledPaisa ?? 0,
      event.confirmedUnsentPaisa ?? 0,
      event.proofReference ?? null,
    ]);
    const replay = events.get(event.eventReference);
    if (replay !== undefined) {
      if (replay !== signature)
        throw new Error(
          'This provider event replay changes the original outcome.',
        );
      return attempt;
    }
    if (attempt.reservedPaisa === 0)
      throw new Error('The original simulated outcome is final.');

    const terminal = event.status === 'settled' || event.status === 'closed';
    const proof = event.proofReference;
    if (
      (terminal || proof !== undefined) &&
      (!isReference(proof) || proofReferences.has(proof))
    ) {
      throw new Error('Use distinct retained proof for the simulated outcome.');
    }
    validEventAmounts(attempt, event);

    // A late acknowledgment is historical once the outcome is uncertain or partial.
    const status =
      event.status === 'submitted' &&
      (attempt.status === 'uncertain' || attempt.status === 'partial')
        ? attempt.status
        : event.status;
    const settledPaisa = terminal ? (event.settledPaisa ?? 0) : 0;
    const next = Object.freeze<FonepaySimulationAttempt>({
      ...attempt,
      status,
      settledPaisa,
      reportedPaisa:
        event.status === 'partial' || terminal
          ? (event.settledPaisa ?? 0)
          : attempt.reportedPaisa,
      remainingPaisa: attempt.amountPaisa - settledPaisa,
      reservedPaisa: terminal ? 0 : attempt.amountPaisa,
    });
    if (terminal) {
      const obligation = obligations.get(attempt.obligationId)!;
      const capture = captures.get(obligation.captureKey)!;
      obligation.active = false;
      obligation.settledPaisa += settledPaisa;
      capture.reservedPaisa -= attempt.amountPaisa;
      capture.settledPaisa += settledPaisa;
    }
    if (proof !== undefined) proofReferences.add(proof);
    attempts.set(attempt.providerReference, next);
    events.set(event.eventReference, signature);
    return next;
  }

  return { checkEligibility, requestRefund, lookupByReference, recordOutcome };
}
