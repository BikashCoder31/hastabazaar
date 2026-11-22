-- Source only; existing contact windows and reports remain retained without invented history.
ALTER TABLE seller_recovery_claim_events ADD COLUMN case_revision INTEGER CHECK(case_revision IS NULL OR case_revision>=0);
--> statement-breakpoint
CREATE TRIGGER recovery_claim_evidence_response_revision BEFORE INSERT ON seller_recovery_claim_events
WHEN NEW.action='evidence_supplied' AND (NEW.case_revision IS NULL OR NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_claims q JOIN seller_recovery_cases c ON c.id=q.case_id WHERE q.id=NEW.claim_id AND c.revision=NEW.case_revision))
BEGIN SELECT RAISE(ABORT,'recovery_evidence_current_case_revision_required'); END;
--> statement-breakpoint
CREATE TABLE seller_recovery_response_windows (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),
 approval_event_id TEXT NOT NULL UNIQUE REFERENCES seller_recovery_events(id),
 contact_id TEXT NOT NULL UNIQUE REFERENCES seller_recovery_contacts(id),
 started_at INTEGER NOT NULL, reminder_at INTEGER NOT NULL, response_due_at INTEGER NOT NULL,
 review_due_at INTEGER NOT NULL, calendar_version TEXT NOT NULL,
 CHECK(reminder_at=started_at+259200000 AND response_due_at=started_at+604800000 AND review_due_at>=response_due_at)
);
--> statement-breakpoint
CREATE INDEX recovery_response_case ON seller_recovery_response_windows(case_id);
--> statement-breakpoint
CREATE TRIGGER recovery_response_current_notice BEFORE INSERT ON seller_recovery_response_windows
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_events e JOIN seller_recovery_contacts contact ON contact.notice_request_id=e.request_id
 JOIN notification_messages inbox ON inbox.id=contact.inbox_message_id
 WHERE e.id=NEW.approval_event_id AND e.case_id=NEW.case_id AND e.action='approved' AND contact.id=NEW.contact_id AND contact.case_id=e.case_id
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_events later WHERE later.case_id=e.case_id AND later.action='approved' AND later.revision>e.revision)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_contact_windows old JOIN seller_recovery_contacts prior ON prior.id=old.contact_id WHERE old.case_id=e.case_id AND prior.notice_request_id=e.request_id)
 AND NEW.started_at>=contact.actual_at AND NEW.started_at>=inbox.created_at AND (NEW.started_at=contact.actual_at OR NEW.started_at=inbox.created_at))
BEGIN SELECT RAISE(ABORT,'recovery_current_response_notice_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_response_window_immutable BEFORE UPDATE ON seller_recovery_response_windows BEGIN SELECT RAISE(ABORT,'recovery_response_clock_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_response_window_retained BEFORE DELETE ON seller_recovery_response_windows BEGIN SELECT RAISE(ABORT,'recovery_response_clock_retained'); END;
--> statement-breakpoint
ALTER TABLE seller_recovery_repayment_claims ADD COLUMN case_revision INTEGER CHECK(case_revision IS NULL OR case_revision>=0);
--> statement-breakpoint
CREATE TRIGGER recovery_claim_current_response_revision BEFORE INSERT ON seller_recovery_repayment_claims
WHEN NEW.case_revision IS NULL OR NOT EXISTS(SELECT 1 FROM seller_recovery_cases WHERE id=NEW.case_id AND revision=NEW.case_revision)
BEGIN SELECT RAISE(ABORT,'recovery_claim_current_case_revision_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_claim_response_revision_retained BEFORE UPDATE ON seller_recovery_repayment_claims
WHEN NEW.case_revision IS NOT OLD.case_revision BEGIN SELECT RAISE(ABORT,'recovery_claim_response_revision_retained'); END;

--> statement-breakpoint
DROP TRIGGER recovery_contact_original_notice;
--> statement-breakpoint
CREATE TRIGGER recovery_contact_original_notice BEFORE INSERT ON seller_recovery_contacts
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN seller_recovery_events e ON e.case_id=c.id
 JOIN notification_messages inbox ON inbox.id=NEW.inbox_message_id
 WHERE c.id=NEW.case_id AND e.request_id=NEW.notice_request_id AND e.action='approved' AND e.created_at<=NEW.actual_at
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_events later WHERE later.case_id=e.case_id AND later.action='approved' AND later.revision>e.revision)
 AND (json_extract(e.details_json,'$.responseNotice.inbox') IS NULL OR inbox.request_id=json_extract(e.details_json,'$.responseNotice.inbox'))
 AND inbox.recipient_user_id=s.user_id AND inbox.channel='in_app' AND inbox.related_type='seller_recovery' AND inbox.related_id=c.id AND inbox.template_key='business.seller.recovery'
 AND (NEW.method='staff_contact' AND NEW.actor_id<>s.user_id OR NEW.method='provider_handoff' AND EXISTS(SELECT 1 FROM notification_messages email
  WHERE email.id=NEW.email_message_id AND email.recipient_user_id=s.user_id AND email.channel='email' AND email.related_type='seller_recovery' AND email.related_id=c.id
  AND email.template_key=inbox.template_key AND email.status='sent' AND email.delivery_transport='provider' AND email.sent_at=NEW.actual_at
  AND (json_extract(e.details_json,'$.responseNotice.email') IS NULL OR email.request_id=json_extract(e.details_json,'$.responseNotice.email')))))
BEGIN SELECT RAISE(ABORT,'recovery_real_itemized_contact_required'); END;

--> statement-breakpoint
DROP TRIGGER recovery_contact_window_proof;
--> statement-breakpoint
CREATE TRIGGER recovery_contact_window_proof BEFORE INSERT ON seller_recovery_contact_windows
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_contacts contact JOIN notification_messages inbox ON inbox.id=contact.inbox_message_id
 WHERE NOT EXISTS(SELECT 1 FROM seller_recovery_response_windows modern JOIN seller_recovery_events approval ON approval.id=modern.approval_event_id WHERE modern.case_id=NEW.case_id AND approval.request_id=contact.notice_request_id) AND contact.id=NEW.contact_id AND contact.case_id=NEW.case_id AND NEW.started_at>=contact.actual_at AND NEW.started_at>=inbox.created_at
 AND (NEW.started_at=contact.actual_at OR NEW.started_at=inbox.created_at))
BEGIN SELECT RAISE(ABORT,'recovery_contact_window_proof_required'); END;
