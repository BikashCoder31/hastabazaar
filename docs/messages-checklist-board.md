# Messages & seller checklist

Work started from `90c6057` on `admin-redesign`. The refreshed Emails, Seller record and Shop checklist references are present at all three design widths.

| Task | Status | Commit | Checks |
| --- | --- | --- | --- |
| M1 · Schedule the email sender | Done | `Messages: Schedule the email sender` | Typecheck and lint pass. 20 sender and job tests pass. Protected config validated offline. Checked preview shows both email pages at 390, 768, 1024 and 1440 px with no page overflow. |
| M2 · Emails and Today warning | Pending | | |
| M3 · Message event coverage | In progress | | |
| M4 · Messages on each record | Pending | | |
| M5 · Shared seller checklist | Pending | | |
| M6 · Final check | Pending | | |

## For the owner

- Use the [Babal.Host sender setup](babal-host-setup.md#schedule-the-email-sender) on staging first. The guide includes the once-a-minute cPanel entries, protected config, QA inbox check and stop instructions.
- The app shows a stopped sender and old waiting messages on Today. The separate-host watchdog is optional for launch.
- Before enabling staging, review the exact sender POST route in the staging Basic Auth configuration so the job receives the bearer header, and review the staging runtime gateway for the protected sender settings. No host job has been installed or enabled.
