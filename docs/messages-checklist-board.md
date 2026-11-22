# Messages & seller checklist

Work started from `90c6057` on `admin-redesign`. The refreshed Emails, Seller record and Shop checklist references are present at all three design widths.

| Task | Status | Commit | Checks |
| --- | --- | --- | --- |
| M1 · Schedule the email sender | Done | `9fdefe53` | Typecheck and lint pass. 20 sender and job tests pass. Protected config validated offline. Checked preview shows both email pages at 390, 768, 1024 and 1440 px with no page overflow. |
| M2 · Emails and Today warning | Done | `81ebde40` | Typecheck, lint for the changed files and 32 focused checks pass. Emails and Today opened at 390, 768, 1024 and 1440 px. Filter and send confirmation checked; resend tested with disposable capture. |
| M3 · Message event coverage | Done | `e82cbc5a` | Typecheck and scoped lint pass. 82 focused checks pass, including the scheduled D1 health job with owner migrations excluded. Notifications and email previews passed at all four widths. |
| M4 · Messages on each record | Done | `eefbe064` | Typecheck, lint and five focused checks pass. Seller and customer scoped links passed in the checked preview. The order card, capture-only resend and a stopped Today warning passed in a disposable browser fixture at all four widths. |
| M5 · Shared seller checklist | Done | `Messages: Shared seller checklist` | Typecheck, lint and 45 focused checks pass. Admin seller record, Seller Documents & agreement, Today and Earnings passed at 390, 768, 1024 and 1440 px. Tests covered privacy, expiry, audit, daily reminder and capture. |
| M6 · Final check | In progress | | Disposable resend and Ask seller stories passed at phone and desktop widths. Full verification follows. |

## For the owner

- Use the [Babal.Host sender setup](babal-host-setup.md#schedule-the-email-sender) on staging first. The guide includes the once-a-minute cPanel entries, protected config, QA inbox check and stop instructions.
- The app shows a stopped sender and old waiting messages on Today. The separate-host watchdog is optional for launch.
- Before enabling staging, review the exact sender POST route in the staging Basic Auth configuration so the job receives the bearer header, and review the staging runtime gateway for the protected sender settings. No host job has been installed or enabled.
- See the [message matrix](messages-matrix.md#for-the-owner) for channel exceptions. A routine selling-fee nudge can stay in-app under the existing preference and cadence. Guests only have email. Today can show a sender outage while the queued email waits for the sender to recover.
- Staff can resend a failed message through the existing queue once its retry time arrives. Rejected addresses and unconfirmed delivery outcomes stay on the recovery path. A captured email is labelled separately from provider acceptance. The previous order-email history remains reachable through Delivery details and recovery.
- The Emails page shows the current recipient address under the existing Super Admin email-delivery permission. Guests with no account name use the order link. Provider acceptance, local capture and in-app reading are reported separately.
- The pickup phone action uses the existing public shop phone and says so before editing. Shop-detail and early renewal requests queue the seller-facing note. Document corrections and replacement permissions still use the existing protected review flow, and the request does not add a payout hold. Reminders are limited to one per item in a rolling 24-hour period.
- The existing sender job scans for upcoming expiries and queues a privacy-scoped message pair for required documents. No migration is required for this batch.
