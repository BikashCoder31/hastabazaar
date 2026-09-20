# R015 — order-email monitor clarity

Local UI changes only, 13 September 2026.

- app/admin/order-emails/page.tsx: defines queued, sending, retry waiting and mail-server-accepted states; distinguishes email attempt failures from parcel delivery; explains active/expired sending locks and next action; displays eligibility times in Asia/Kathmandu; links each row to /admin/orders/[id] using the fetched internal order ID.
- components/admin/order-email-retry.tsx: explicitly explains that clicking attempts up to six eligible sends and can contact customers immediately; results say mail-server accepted rather than delivered/sent to inbox. Existing API behavior stays intact.

Read-only comparison against lib/email/order-updates.ts confirmed the five-minute retry, 15-minute lease and eligible-status query. app/api/admin/order-emails/retry/route.ts calls the sender with limit 6. No sender/API invocation, email delivery or production access occurred. Touched-file oxlint passed after fixing a server-render time read lint finding. No mirror unit tests added for UI copy; no rendered-browser verification performed.
