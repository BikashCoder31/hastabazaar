-- Source only. Delivery proof and contact history are not seller fault or money.
ALTER TABLE notification_messages ADD COLUMN delivery_transport TEXT CHECK(delivery_transport IS NULL OR delivery_transport IN('capture','provider'));
--> statement-breakpoint
CREATE TABLE seller_recovery_contacts (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id), notice_request_id TEXT NOT NULL REFERENCES seller_recovery_events(request_id),
 inbox_message_id TEXT NOT NULL REFERENCES notification_messages(id), email_message_id TEXT REFERENCES notification_messages(id),
 method TEXT NOT NULL CHECK(method IN('provider_handoff','staff_contact')), actor_id TEXT REFERENCES users(id), actual_at INTEGER NOT NULL,
 evidence_reference TEXT NOT NULL, reason TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE, recorded_at INTEGER NOT NULL,
 CHECK(actual_at>=0 AND actual_at<=recorded_at),
 CHECK(method='provider_handoff' AND email_message_id IS NOT NULL AND actor_id IS NULL OR method='staff_contact' AND email_message_id IS NULL AND actor_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TRIGGER recovery_contact_original_notice BEFORE INSERT ON seller_recovery_contacts
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN seller_recovery_events e ON e.case_id=c.id
 JOIN notification_messages inbox ON inbox.id=NEW.inbox_message_id
 WHERE c.id=NEW.case_id AND e.request_id=NEW.notice_request_id AND e.action='approved' AND e.created_at<=NEW.actual_at
 AND inbox.recipient_user_id=s.user_id AND inbox.channel='in_app' AND inbox.related_type='seller_recovery' AND inbox.related_id=c.id AND inbox.template_key='business.seller.recovery'
 AND (NEW.method='staff_contact' AND NEW.actor_id<>s.user_id OR NEW.method='provider_handoff' AND EXISTS(SELECT 1 FROM notification_messages email
  WHERE email.id=NEW.email_message_id AND email.recipient_user_id=s.user_id AND email.channel='email' AND email.related_type='seller_recovery' AND email.related_id=c.id
  AND email.template_key=inbox.template_key AND email.status='sent' AND email.delivery_transport='provider' AND email.sent_at=NEW.actual_at)))
BEGIN SELECT RAISE(ABORT,'recovery_real_itemized_contact_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_contact_immutable BEFORE UPDATE ON seller_recovery_contacts BEGIN SELECT RAISE(ABORT,'recovery_contact_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_contact_retained BEFORE DELETE ON seller_recovery_contacts BEGIN SELECT RAISE(ABORT,'recovery_contact_retained'); END;
--> statement-breakpoint
CREATE TABLE seller_recovery_contact_windows (
 case_id TEXT PRIMARY KEY REFERENCES seller_recovery_cases(id), contact_id TEXT NOT NULL UNIQUE REFERENCES seller_recovery_contacts(id),
 started_at INTEGER NOT NULL, reminder_at INTEGER NOT NULL, response_due_at INTEGER NOT NULL, review_due_at INTEGER NOT NULL, calendar_version TEXT NOT NULL,
 CHECK(reminder_at=started_at+259200000 AND response_due_at=started_at+604800000 AND review_due_at>=response_due_at)
);
--> statement-breakpoint
CREATE TRIGGER recovery_contact_window_proof BEFORE INSERT ON seller_recovery_contact_windows
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_contacts contact JOIN notification_messages inbox ON inbox.id=contact.inbox_message_id
 WHERE contact.id=NEW.contact_id AND contact.case_id=NEW.case_id AND NEW.started_at>=contact.actual_at AND NEW.started_at>=inbox.created_at
 AND (NEW.started_at=contact.actual_at OR NEW.started_at=inbox.created_at))
BEGIN SELECT RAISE(ABORT,'recovery_contact_window_proof_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_contact_window_immutable BEFORE UPDATE ON seller_recovery_contact_windows BEGIN SELECT RAISE(ABORT,'recovery_contact_clock_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_contact_window_retained BEFORE DELETE ON seller_recovery_contact_windows BEGIN SELECT RAISE(ABORT,'recovery_contact_clock_retained'); END;
