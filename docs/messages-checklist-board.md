# Messages & seller checklist

Work started from `90c6057` on `admin-redesign`. The refreshed Emails, Seller record and Shop checklist references are present at all three design widths.

| Task | Status | Commit | Checks |
| --- | --- | --- | --- |
| M1 · Schedule the email sender | Done | `9fdefe53` | Typecheck and lint pass. 20 sender and job tests pass. Protected config validated offline. Checked preview shows both email pages at 390, 768, 1024 and 1440 px with no page overflow. |
| M2 · Emails and Today warning | In progress | | Unified history and resend checked in disposable data; Emails and Today opened at all four widths. |
| M3 · Message event coverage | Done | `Messages: Message event coverage` | Typecheck and scoped lint pass. 82 focused checks pass, including the scheduled D1 health job with owner migrations excluded. Notifications and email previews passed at all four widths. |
| M4 · Messages on each record | In progress | | |
| M5 · Shared seller checklist | In progress | | |
| M6 · Final check | Pending | | |

## For the owner

- Use the [Babal.Host sender setup](babal-host-setup.md#schedule-the-email-sender) on staging first. The guide includes the once-a-minute cPanel entries, protected config, QA inbox check and stop instructions.
- The app shows a stopped sender and old waiting messages on Today. The separate-host watchdog is optional for launch.
- Before enabling staging, review the exact sender POST route in the staging Basic Auth configuration so the job receives the bearer header, and review the staging runtime gateway for the protected sender settings. No host job has been installed or enabled.
- See the [message matrix](messages-matrix.md#for-the-owner) for channel exceptions. A routine selling-fee nudge can stay in-app under the existing preference and cadence. Guests only have email. Today can show a sender outage while the queued email waits for the sender to recover.
