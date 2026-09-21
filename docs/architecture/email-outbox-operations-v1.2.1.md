# Hastabazaar v1.2.1 email outbox operations

The existing SMTP binding and both persisted queues remain authoritative. Immediate attempts, manual staff attempts and the scheduled runner all use the same conditional claim and 15-minute lease paths, so two workers cannot intentionally claim the same eligible row. SMTP acceptance cannot be committed atomically with the database; the admin text continues to disclose the narrow duplicate-on-crash risk.

`POST /api/jobs/order-emails` is now the hosting-neutral scheduled entrypoint for both queues. It requires the existing long bearer secret in the Authorization header and never accepts the credential in a URL. Each bounded run processes delivery-authorization/business messages first, with delivery codes ordered ahead of ordinary business messages, then uses the remaining batch capacity for order updates. It does not create or enable a hosting scheduler by itself.

Delivery-code email is rechecked against the current parcel assignment and unconsumed, unexpired OTP challenge immediately before sending. An expired or obsolete code is marked cancelled with `expired_or_obsolete_otp`. Business messages whose recipient access or source state changed are marked cancelled with `obsolete_or_access_changed`. An order update whose order has moved to a newer state is marked cancelled with `obsolete_order_state`. These retained records explain suppression without storing SMTP responses or credentials.

Failures store only a safe failure code. Retries use 5, 10, 20, 40 and 60 minute delays and stop automatically after five attempts. Expired leases are eligible for a later worker. The two admin queue pages show due work, oldest age, failures, exhausted attempts, leases and suppressed outcomes. An outage leaves queued/failed records intact and causes the scheduler response to report failure.

Production remains blocked on confirmed hosting scheduler support, the approved invocation interval, SMTP provider/quota, verified sender and reply-to identities, secret provisioning and alert ownership. No provider was changed, no paid service was added and no historical queue was replayed.
