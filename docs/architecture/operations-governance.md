# Operations and governance

## Notifications

`notification_messages` is a bilingual, provider-neutral outbox for in-app, email, and SMS messages. Every message has a unique request ID, audience, related record, delivery state, provider reference, and failure field. Order placement queues customer messages and an isolated seller notification for each seller represented in the order. In-app messages can only be read by their recipient. Email and SMS remain queued until approved production providers and credentials are configured; queued does not mean sent.

## Shipping, returns, claims, and reconciliation

Shipping jobs are unique by order, seller, and direction, preserving multi-vendor boundaries for both outbound delivery and return pickup. Sellers request coordination and can confirm a scheduled handoff. Staff record manual labels, tracking codes, pickup progress, delivery, carrier claims, and reconciliation status. Every transition has an idempotent append-only event. `nepal_can_move_manual` names the intended manual workflow and does not imply an undocumented API integration.

## Governance

Admins can maintain bilingual prohibited/restricted-product guidance and prepare time-bounded homepage or shop promotions containing published products. A different Super Admin must approve or reject a promotion. Super Admins can suspend/reactivate other users, open and resolve operational incidents, and record backup verification evidence. They cannot change their own account status. These operations append audit records and never invent a registration, carrier, backup, or payment-provider result.

## Privacy and retention

Authenticated customers can request data access, correction, deletion, or object to retention. Admins assign and investigate; only a Super Admin can make the final decision or mark completion. Requests and state changes are append-only. A deletion request is not an instruction to erase orders, payments, fraud controls, or audits that must be retained; the recorded decision must cite the applicable approved retention basis.

## Reporting and resilience boundaries

Seller reports expose only that seller's delivered sales, units, returns, and inventory. Marketplace reports aggregate order value, delivered value, sellers, cases, refunds, and payouts using integer paisa. Incident and backup-verification registers support operational evidence, but they do not create infrastructure backups or external alerts. Production backup schedules, restore drills, email/SMS delivery, carrier webhooks, bank settlement imports, legal schedules, and monitoring require approved provider configuration before launch.
