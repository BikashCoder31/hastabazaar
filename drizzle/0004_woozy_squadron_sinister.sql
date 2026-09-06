DROP INDEX `idx_staff_invitations_email_status`;--> statement-breakpoint
CREATE INDEX `idx_staff_invitations_email_status_created` ON `staff_invitations` (`email`,`status`,`created_at`);