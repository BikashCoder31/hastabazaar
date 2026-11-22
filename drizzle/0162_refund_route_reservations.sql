-- A simulated refund consumes only a simulated capture. It never settles an original obligation.
CREATE TABLE refund_route_simulation_captures (
  id TEXT NOT NULL PRIMARY KEY CHECK(length(id)=64 AND id NOT GLOB '*[^0-9a-f]*'),
  order_id TEXT NOT NULL REFERENCES orders(id),
  transaction_id TEXT NOT NULL CHECK(length(transaction_id) BETWEEN 1 AND 191),
  session_number TEXT NOT NULL CHECK(length(session_number) BETWEEN 1 AND 191),
  captured_paisa INTEGER NOT NULL CHECK(typeof(captured_paisa)='integer' AND captured_paisa BETWEEN 1 AND 9007199254740991),
  currency TEXT NOT NULL CHECK(currency='NPR'),
  UNIQUE (transaction_id,session_number)
);
--> statement-breakpoint
CREATE TABLE refund_route_simulation_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  obligation_id TEXT NOT NULL REFERENCES refund_obligations(id),
  capture_id TEXT NOT NULL REFERENCES refund_route_simulation_captures(id),
  route TEXT NOT NULL CHECK(route IN('fonepay','bank','pickup')),
  request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
  amount_paisa INTEGER NOT NULL CHECK(typeof(amount_paisa)='integer' AND amount_paisa BETWEEN 1 AND 9007199254740991),
  created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 1 AND 9007199254740991),
  UNIQUE (obligation_id,request_id)
);
--> statement-breakpoint
CREATE INDEX refund_route_capture_attempts ON refund_route_simulation_attempts(capture_id);
--> statement-breakpoint
CREATE TABLE refund_route_simulation_events (
  attempt_id TEXT NOT NULL REFERENCES refund_route_simulation_attempts(id),
  sequence INTEGER NOT NULL CHECK(typeof(sequence)='integer' AND sequence BETWEEN 1 AND 9007199254740991),
  route TEXT NOT NULL CHECK(route IN('fonepay','bank','pickup')),
  provider_reference TEXT NOT NULL CHECK(length(provider_reference) BETWEEN 1 AND 191),
  event_reference TEXT NOT NULL CHECK(length(event_reference) BETWEEN 1 AND 191),
  status TEXT NOT NULL CHECK(status IN('submitted','uncertain','partial','settled','closed')),
  settled_paisa INTEGER NOT NULL CHECK(typeof(settled_paisa)='integer' AND settled_paisa BETWEEN 0 AND 9007199254740991),
  confirmed_unsent_paisa INTEGER NOT NULL CHECK(typeof(confirmed_unsent_paisa)='integer' AND confirmed_unsent_paisa BETWEEN 0 AND 9007199254740991),
  proof_reference TEXT CHECK(length(proof_reference) BETWEEN 1 AND 191),
  created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (attempt_id,sequence),
  UNIQUE (route,event_reference),
  UNIQUE (route,proof_reference),
  CHECK((status IN('settled','closed') AND proof_reference IS NOT NULL) OR (status NOT IN('settled','closed') AND confirmed_unsent_paisa=0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX refund_route_original_provider_reference ON refund_route_simulation_events(route,provider_reference) WHERE sequence=1;
--> statement-breakpoint
CREATE TABLE refund_route_reservations (
  obligation_id TEXT NOT NULL PRIMARY KEY REFERENCES refund_obligations(id),
  bank_packet_id TEXT UNIQUE REFERENCES outgoing_payment_packets(id),
  simulation_attempt_id TEXT UNIQUE REFERENCES refund_route_simulation_attempts(id),
  CHECK((bank_packet_id IS NULL)<>(simulation_attempt_id IS NULL))
);
--> statement-breakpoint
-- A packet state alone cannot release a reservation or justify switching routes.
CREATE VIEW refund_route_bank_terminal_evidence AS
SELECT p.id AS packet_id, p.obligation_id, e.id AS event_id
FROM outgoing_payment_packets p
JOIN refund_obligation_events e ON e.obligation_id=p.obligation_id
 AND json_extract(e.private_details_json,'$.packetId')=p.id
 AND json_extract(e.private_details_json,'$.evidenceReference')=p.evidence_reference
 AND e.actor_id=p.recorded_by
WHERE p.amount_paisa>0 AND length(trim(p.evidence_reference))>=8 AND p.recorded_at IS NOT NULL
AND (
  (p.state='void' AND e.action='packet_voided' AND p.started_at IS NULL
    AND json_type(e.private_details_json,'$.notSentConfirmed')='true')
  OR (p.state='paid' AND e.action='packet_paid' AND p.started_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.packet_kind='refund'
      AND b.packet_id=p.id AND b.identity_hash=p.transaction_identity_hash AND b.account_version_id=p.account_version_id
      AND b.transaction_identity=p.transaction_identity AND b.amount_paisa=p.amount_paisa AND b.bank_at=p.bank_at))
  OR (p.state='failed' AND e.action='packet_failed' AND p.started_at IS NOT NULL
    AND json_extract(e.private_details_json,'$.failureBasis') IN('not_sent','no_debit','debit_returned')
    AND (
      NOT EXISTS(SELECT 1 FROM refund_obligation_events acknowledgment
        WHERE acknowledgment.obligation_id=p.obligation_id AND acknowledgment.action='packet_submitted'
          AND json_extract(acknowledgment.private_details_json,'$.packetId')=p.id)
      OR (json_extract(e.private_details_json,'$.failureBasis') IN('no_debit','debit_returned')
        AND json_type(e.private_details_json,'$.bankFinalityConfirmed')='true'
        AND EXISTS(SELECT 1 FROM refund_obligation_events acknowledgment
          JOIN finance_evidence_intents submitted ON submitted.id=trim(json_extract(acknowledgment.private_details_json,'$.evidenceReference'))
            AND submitted.scope_kind='obligation' AND submitted.scope_id=p.obligation_id
          JOIN finance_evidence_files submitted_file ON submitted_file.id=submitted.id
          JOIN finance_evidence_intents closing ON closing.id=trim(p.evidence_reference)
            AND closing.scope_kind='obligation' AND closing.scope_id=p.obligation_id AND closing.content_hash<>submitted.content_hash
          JOIN finance_evidence_files closing_file ON closing_file.id=closing.id
          WHERE acknowledgment.obligation_id=p.obligation_id AND acknowledgment.action='packet_submitted'
            AND json_extract(acknowledgment.private_details_json,'$.packetId')=p.id))
    ))
);
--> statement-breakpoint
CREATE TRIGGER refund_route_capture_insert BEFORE INSERT ON refund_route_simulation_captures
WHEN EXISTS(SELECT 1 FROM refund_route_simulation_captures c WHERE c.id=NEW.id OR
  (c.transaction_id=NEW.transaction_id AND c.session_number=NEW.session_number))
BEGIN SELECT RAISE(ABORT,'refund_route_capture_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_capture_update BEFORE UPDATE ON refund_route_simulation_captures
BEGIN SELECT RAISE(ABORT,'refund_route_capture_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_capture_delete BEFORE DELETE ON refund_route_simulation_captures
BEGIN SELECT RAISE(ABORT,'refund_route_capture_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_attempt_insert BEFORE INSERT ON refund_route_simulation_attempts
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM refund_route_simulation_attempts a WHERE a.id=NEW.id OR
    (a.obligation_id=NEW.obligation_id AND a.request_id=NEW.request_id))
    THEN RAISE(ABORT,'refund_route_attempt_retained') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM refund_route_reservations WHERE obligation_id=NEW.obligation_id)
    OR EXISTS(SELECT 1 FROM outgoing_payment_packets p WHERE p.obligation_id=NEW.obligation_id AND p.amount_paisa>0
      AND (p.state NOT IN('failed','void') OR NOT EXISTS(SELECT 1 FROM refund_route_bank_terminal_evidence e WHERE e.packet_id=p.id)))
    THEN RAISE(ABORT,'refund_route_already_reserved') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM refund_obligations o JOIN refund_route_simulation_captures c ON c.order_id=o.order_id
    WHERE o.id=NEW.obligation_id AND c.id=NEW.capture_id AND o.state='open' AND o.currency='NPR'
     AND NOT EXISTS(SELECT 1 FROM refund_route_simulation_attempts a WHERE a.obligation_id=o.id AND a.capture_id<>c.id)
     AND NEW.amount_paisa<=o.cash_paisa-COALESCE((SELECT SUM(e.settled_paisa) FROM refund_route_simulation_attempts a
       JOIN refund_route_simulation_events e ON e.attempt_id=a.id AND e.status IN('settled','closed') WHERE a.obligation_id=o.id),0)
     AND NEW.amount_paisa<=c.captured_paisa-COALESCE((SELECT SUM(COALESCE((SELECT e.settled_paisa FROM refund_route_simulation_events e
       WHERE e.attempt_id=a.id AND e.status IN('settled','closed')),a.amount_paisa)) FROM refund_route_simulation_attempts a WHERE a.capture_id=c.id),0))
    THEN RAISE(ABORT,'refund_route_amount_or_capture_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER refund_route_attempt_update BEFORE UPDATE ON refund_route_simulation_attempts
BEGIN SELECT RAISE(ABORT,'refund_route_attempt_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_attempt_delete BEFORE DELETE ON refund_route_simulation_attempts
BEGIN SELECT RAISE(ABORT,'refund_route_attempt_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_event_insert BEFORE INSERT ON refund_route_simulation_events
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM refund_route_simulation_events e WHERE
    (e.attempt_id=NEW.attempt_id AND e.sequence=NEW.sequence) OR (e.route=NEW.route AND (e.event_reference=NEW.event_reference
    OR e.proof_reference=NEW.proof_reference OR (e.provider_reference=NEW.provider_reference AND e.attempt_id<>NEW.attempt_id))))
    THEN RAISE(ABORT,'refund_route_event_retained') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM refund_route_simulation_attempts a
    JOIN refund_route_reservations s ON s.obligation_id=a.obligation_id AND s.simulation_attempt_id=a.id
    WHERE a.id=NEW.attempt_id AND a.route=NEW.route AND NEW.created_at>=a.created_at
      AND NEW.sequence=COALESCE((SELECT MAX(e.sequence) FROM refund_route_simulation_events e WHERE e.attempt_id=a.id),0)+1
      AND NOT EXISTS(SELECT 1 FROM refund_route_simulation_events e WHERE e.attempt_id=a.id
        AND (e.provider_reference<>NEW.provider_reference OR e.status IN('settled','closed') OR e.created_at>NEW.created_at))
      AND ((NEW.status='submitted' AND NEW.sequence=1 AND NEW.settled_paisa=0)
        OR (NEW.status='uncertain' AND NEW.settled_paisa<=a.amount_paisa)
        OR (NEW.status='partial' AND NEW.settled_paisa>0 AND NEW.settled_paisa<a.amount_paisa)
        OR (NEW.status='settled' AND NEW.settled_paisa=a.amount_paisa AND NEW.confirmed_unsent_paisa=0)
        OR (NEW.status='closed' AND NEW.settled_paisa<a.amount_paisa AND NEW.confirmed_unsent_paisa=a.amount_paisa-NEW.settled_paisa)))
    THEN RAISE(ABORT,'refund_route_event_outcome_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER refund_route_event_update BEFORE UPDATE ON refund_route_simulation_events
BEGIN SELECT RAISE(ABORT,'refund_route_event_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_event_delete BEFORE DELETE ON refund_route_simulation_events
BEGIN SELECT RAISE(ABORT,'refund_route_event_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_reservation_insert BEFORE INSERT ON refund_route_reservations
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM refund_route_reservations s WHERE s.obligation_id=NEW.obligation_id
    OR s.bank_packet_id=NEW.bank_packet_id OR s.simulation_attempt_id=NEW.simulation_attempt_id)
    THEN RAISE(ABORT,'refund_route_already_reserved') END;
  SELECT CASE WHEN NOT (
    EXISTS(SELECT 1 FROM outgoing_payment_packets p WHERE p.id=NEW.bank_packet_id AND p.obligation_id=NEW.obligation_id
      AND p.amount_paisa>0 AND p.state IN('prepared','approved','processing','uncertain'))
    OR EXISTS(SELECT 1 FROM refund_route_simulation_attempts a WHERE a.id=NEW.simulation_attempt_id AND a.obligation_id=NEW.obligation_id
      AND NOT EXISTS(SELECT 1 FROM refund_route_simulation_events e WHERE e.attempt_id=a.id)))
    THEN RAISE(ABORT,'refund_route_reservation_owner_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER refund_route_reservation_update BEFORE UPDATE ON refund_route_reservations
BEGIN SELECT RAISE(ABORT,'refund_route_reservation_owner_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_reservation_delete BEFORE DELETE ON refund_route_reservations
WHEN NOT (EXISTS(SELECT 1 FROM refund_route_bank_terminal_evidence e WHERE e.packet_id=OLD.bank_packet_id AND e.obligation_id=OLD.obligation_id)
  OR EXISTS(SELECT 1 FROM refund_route_simulation_events e WHERE e.attempt_id=OLD.simulation_attempt_id AND e.status IN('settled','closed')))
BEGIN SELECT RAISE(ABORT,'refund_route_release_proof_required'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_bank_attempt_guard BEFORE INSERT ON outgoing_payment_packets
WHEN NEW.amount_paisa>0 AND EXISTS(SELECT 1 FROM refund_route_reservations WHERE obligation_id=NEW.obligation_id)
BEGIN SELECT RAISE(ABORT,'refund_route_already_reserved'); END;
--> statement-breakpoint
CREATE TRIGGER refund_route_bank_reserve AFTER INSERT ON outgoing_payment_packets
WHEN NEW.amount_paisa>0 AND NEW.state IN('prepared','approved','processing','uncertain')
BEGIN
  INSERT INTO refund_route_reservations(obligation_id,bank_packet_id) VALUES(NEW.obligation_id,NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER refund_route_simulation_reserve AFTER INSERT ON refund_route_simulation_attempts
BEGIN
  INSERT INTO refund_route_reservations(obligation_id,simulation_attempt_id) VALUES(NEW.obligation_id,NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER refund_route_bank_release AFTER INSERT ON refund_obligation_events
WHEN NEW.action IN('packet_voided','packet_failed','packet_paid')
BEGIN
  DELETE FROM refund_route_reservations WHERE obligation_id=NEW.obligation_id
    AND EXISTS(SELECT 1 FROM refund_route_bank_terminal_evidence e
      WHERE e.packet_id=refund_route_reservations.bank_packet_id AND e.event_id=NEW.id);
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM refund_route_reservations s
    JOIN outgoing_payment_packets p ON p.id=s.bank_packet_id AND p.obligation_id=s.obligation_id
    WHERE s.obligation_id=NEW.obligation_id AND p.amount_paisa>0
      AND (p.id=json_extract(NEW.private_details_json,'$.packetId') OR p.state IN('void','failed','paid'))
  ) THEN RAISE(ABORT,'refund_route_release_proof_required') END;
END;
--> statement-breakpoint
CREATE TRIGGER refund_route_simulation_release AFTER INSERT ON refund_route_simulation_events
WHEN NEW.status IN('settled','closed')
BEGIN
  DELETE FROM refund_route_reservations WHERE simulation_attempt_id=NEW.attempt_id;
END;
