# Feedback delivery reconciliation (support runbook)

The restricted `/admin/feedback` view shows confirmed mail handoffs, uncertain sends, and exhausted pre-send jobs. Access requires an active staff account and a current `support.manage` grant. The request ID is an internal reference, not evidence of email delivery.

1. Find the customer's request ID in the support view. Confirm the source, time, address, topic, and message before discussing it with the customer. Do not copy custom answers into email or public tickets.
2. **Delivery uncertain:** the job entered `sending` before the external transport call. The message may have been accepted even when the page says uncertain. Check the support mailbox and available transport records for a matching message and time. A missing message is not proof that no mail was sent. Do not automatically retry, manually edit the job to `sent`, or claim a verified delivery without independent evidence.
3. **Not sent; attempts exhausted:** the transport was definitely unavailable before each send, or the final pre-send lease expired without entering `sending`. The bounded five-attempt key cannot retry. Explain this status and help the customer decide whether to start a new message.
4. If the status cannot be resolved, tell the customer that a new submission could create a duplicate. The customer may use **Start a new message after contacting support** in the same browser tab. The confirmation clears only the opaque session request ID; it does not alter the saved job or answer. A new submission uses a new ID and remains subject to ordinary rate limits.

This is a read-only reconciliation workflow. There is no support-side state mutation or replay of uncertain jobs, and no claim of exactly-once SMTP delivery. Escalate provider-log disputes through the normal support/operations process; do not run production SQL or migrations as part of this procedure.
