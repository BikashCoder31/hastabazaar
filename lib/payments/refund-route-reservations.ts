import { checkoutCommitClock } from '../checkout/commit-policy-guards';
import { readRefundRouteCapabilities } from './refund-route-capabilities';

export type SimulatedRefundRoute = 'fonepay' | 'bank' | 'pickup';
export type SimulatedRefundStatus = 'submitted' | 'uncertain' | 'partial' | 'settled' | 'closed';

export interface SimulatedRefundCapture {
  id: string;
  orderId: string;
  transactionId: string;
  sessionNumber: string;
  capturedPaisa: number;
  currency: 'NPR';
}

export interface SimulatedRefundAttempt {
  id: string;
  obligationId: string;
  captureId: string;
  route: SimulatedRefundRoute;
  requestId: string;
  amountPaisa: number;
  createdAt: number;
}

export interface SimulatedRefundEvent {
  attemptId: string;
  sequence: number;
  route: SimulatedRefundRoute;
  providerReference: string;
  eventReference: string;
  status: SimulatedRefundStatus;
  settledPaisa: number;
  confirmedUnsentPaisa: number;
  proofReference: string | null;
  createdAt: number;
}

type CaptureInput = Omit<SimulatedRefundCapture, 'id'>;
type ReserveInput = Omit<SimulatedRefundAttempt, 'id' | 'createdAt'>;
type OutcomeInput = Pick<SimulatedRefundEvent, 'attemptId' | 'providerReference' | 'eventReference' | 'status'> &
  Partial<Pick<SimulatedRefundEvent, 'settledPaisa' | 'confirmedUnsentPaisa' | 'proofReference'>>;

const captureColumns = `id,order_id AS orderId,transaction_id AS transactionId,session_number AS sessionNumber,
  captured_paisa AS capturedPaisa,currency`;
const attemptColumns = `a.id,a.obligation_id AS obligationId,a.capture_id AS captureId,a.route,a.request_id AS requestId,
  a.amount_paisa AS amountPaisa,a.created_at AS createdAt`;
const eventColumns = `attempt_id AS attemptId,sequence,route,provider_reference AS providerReference,
  event_reference AS eventReference,status,settled_paisa AS settledPaisa,confirmed_unsent_paisa AS confirmedUnsentPaisa,
  proof_reference AS proofReference,created_at AS createdAt`;

function exactReference(value: string, field: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 191 || value.trim() !== value || /[\p{Cc}]/u.test(value)) {
    throw new Error(`Use an exact simulated ${field}.`);
  }
  return value;
}

function paisa(value: number, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error('Use an exact whole-paisa simulated amount.');
  return value;
}

function simulatedRoute(value: SimulatedRefundRoute): SimulatedRefundRoute {
  if (!['fonepay', 'bank', 'pickup'].includes(value)) throw new Error('Use a supported simulated refund route.');
  return value;
}

function sameFields<T extends object>(expected: T, saved: T, errorMessage: string): void {
  if ((Object.keys(expected) as Array<keyof T>).some(key => expected[key] !== saved[key])) throw new Error(errorMessage);
}

/** This repository records simulated provider observations and shares only the native reservation slot. */
export function createRefundRouteSimulationRepository(
  db: D1Database,
  binding?: Parameters<typeof readRefundRouteCapabilities>[0],
) {
  function assertAdmission() {
    const capabilities = readRefundRouteCapabilities(binding);
    if (!capabilities.fonepaySimulationAdmission || !capabilities.fonepaySimulationRetainedRead) {
      throw new Error('Simulated refund admission is disabled until retained reconciliation is available.');
    }
  }

  function assertRetainedAccess() {
    if (!readRefundRouteCapabilities(binding).fonepaySimulationRetainedRead) throw new Error('Retained simulated refunds are disabled.');
  }

  const getAttempt = (attemptId: string) => db.prepare(`SELECT ${attemptColumns}
    FROM refund_route_simulation_attempts a WHERE a.id=?`).bind(attemptId).first<SimulatedRefundAttempt>();

  return {
    async registerCapture(input: CaptureInput): Promise<SimulatedRefundCapture> {
      assertAdmission();
      const data = {
        orderId: exactReference(input.orderId, 'original order'),
        transactionId: exactReference(input.transactionId, 'transaction ID'),
        sessionNumber: exactReference(input.sessionNumber, 'session number'),
        capturedPaisa: paisa(input.capturedPaisa, 1),
        currency: input.currency,
      };
      if (data.currency !== 'NPR') throw new Error('Use NPR for the exact simulated capture.');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([data.transactionId, data.sessionNumber])));
      const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const find = () => db.prepare(`SELECT ${captureColumns} FROM refund_route_simulation_captures WHERE id=?`)
        .bind(id).first<SimulatedRefundCapture>();
      const check = (row: SimulatedRefundCapture) => {
        sameFields(data, row, 'This simulated capture already identifies a different original payment.');
        return row;
      };
      const existing = await find();
      if (existing) return check(existing);
      try {
        await db.prepare(`INSERT INTO refund_route_simulation_captures(id,order_id,transaction_id,session_number,captured_paisa,currency)
          VALUES(?,?,?,?,?,?)`).bind(id, data.orderId, data.transactionId, data.sessionNumber, data.capturedPaisa, data.currency).run();
      } catch (error) {
        const replay = await find();
        if (replay) return check(replay);
        throw error;
      }
      return { id, ...data };
    },

    async reserve(input: ReserveInput): Promise<SimulatedRefundAttempt> {
      assertAdmission();
      const data = {
        obligationId: exactReference(input.obligationId, 'refund obligation'),
        captureId: exactReference(input.captureId, 'capture'),
        route: simulatedRoute(input.route),
        requestId: exactReference(input.requestId, 'request ID'),
        amountPaisa: paisa(input.amountPaisa, 1),
      };
      const find = () => db.prepare(`SELECT ${attemptColumns} FROM refund_route_simulation_attempts a
        WHERE a.obligation_id=? AND a.request_id=?`).bind(data.obligationId, data.requestId).first<SimulatedRefundAttempt>();
      const check = (row: SimulatedRefundAttempt) => {
        sameFields(data, row, 'This simulated refund request already retains a different attempt.');
        return row;
      };
      const existing = await find();
      if (existing) return check(existing);
      try {
        await db.prepare(`INSERT INTO refund_route_simulation_attempts(id,obligation_id,capture_id,route,request_id,amount_paisa,created_at)
          VALUES(?,?,?,?,?,?,${checkoutCommitClock(db)})`)
          .bind(crypto.randomUUID(), data.obligationId, data.captureId, data.route, data.requestId, data.amountPaisa).run();
      } catch (error) {
        const replay = await find();
        if (replay) return check(replay);
        throw error;
      }
      return (await find())!;
    },

    async recordOutcome(input: OutcomeInput): Promise<SimulatedRefundEvent> {
      assertRetainedAccess();
      const attempt = await getAttempt(exactReference(input.attemptId, 'refund attempt'));
      if (!attempt) throw new Error('Open the exact retained simulated refund attempt.');
      const data = {
        attemptId: attempt.id,
        providerReference: exactReference(input.providerReference, 'provider reference'),
        eventReference: exactReference(input.eventReference, 'provider event reference'),
        status: input.status,
        settledPaisa: paisa(input.settledPaisa ?? 0),
        confirmedUnsentPaisa: paisa(input.confirmedUnsentPaisa ?? 0),
        proofReference: input.proofReference == null ? null : exactReference(input.proofReference, 'proof reference'),
      };
      if (!['submitted', 'uncertain', 'partial', 'settled', 'closed'].includes(data.status)) throw new Error('Use a supported simulated provider status.');
      const find = () => db.prepare(`SELECT ${eventColumns} FROM refund_route_simulation_events WHERE route=? AND event_reference=?`)
        .bind(attempt.route, data.eventReference).first<SimulatedRefundEvent>();
      const check = (row: SimulatedRefundEvent) => {
        sameFields(data, row, 'This simulated event reference already retains a different outcome.');
        return row;
      };
      const existing = await find();
      if (existing) return check(existing);
      // Determine the next sequence before insertion so MariaDB can run the event's release trigger in the same statement.
      const latest = await db.prepare('SELECT COALESCE(MAX(sequence),0) AS sequence FROM refund_route_simulation_events WHERE attempt_id=?')
        .bind(attempt.id).first<{sequence: number}>();
      try {
        await db.prepare(`INSERT INTO refund_route_simulation_events(attempt_id,sequence,route,provider_reference,event_reference,status,
          settled_paisa,confirmed_unsent_paisa,proof_reference,created_at) VALUES(?,?,?,?,?,?,?,?,?,${checkoutCommitClock(db)})`)
          .bind(data.attemptId, (latest?.sequence ?? 0) + 1, attempt.route, data.providerReference, data.eventReference, data.status,
            data.settledPaisa, data.confirmedUnsentPaisa, data.proofReference).run();
      } catch (error) {
        const replay = await find();
        if (replay) return check(replay);
        throw error;
      }
      return (await find())!;
    },

    async readByReference(input: { route: SimulatedRefundRoute; providerReference: string }): Promise<{
      attempt: SimulatedRefundAttempt;
      latestOutcome: SimulatedRefundEvent;
    } | null> {
      assertRetainedAccess();
      const attempt = await db.prepare(`SELECT ${attemptColumns} FROM refund_route_simulation_attempts a
        JOIN refund_route_simulation_events initial ON initial.attempt_id=a.id AND initial.sequence=1
        WHERE initial.route=? AND initial.provider_reference=?`)
        .bind(simulatedRoute(input.route), exactReference(input.providerReference, 'provider reference')).first<SimulatedRefundAttempt>();
      if (!attempt) return null;
      const latestOutcome = await db.prepare(`SELECT ${eventColumns} FROM refund_route_simulation_events
        WHERE attempt_id=? ORDER BY sequence DESC LIMIT 1`).bind(attempt.id).first<SimulatedRefundEvent>();
      return { attempt, latestOutcome: latestOutcome! };
    },
  };
}
