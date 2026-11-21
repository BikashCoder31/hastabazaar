# Review fixes · 21 November 2026

Owner review baseline: `64f2158` on `admin-redesign`. Checked preview: `http://localhost:3018`.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| V1 · Legal & procedures access | V1 helper | Done | `d684a2c` | Typecheck and lint passed. 11 focused tests passed. Checked Super Admin at 390/768/1024/1440 and restricted staff at 390/1440. |
| V2 · Taxonomy names and occasion images | V2 helper | In progress | — | — |
| V3 · Today on phones | V3 helper | Done | This task commit | Typecheck and lint passed. 8 focused tests passed. Chrome at 390/768/1024/1440. |
| V4 · Phone tap targets | V4 helper | In progress | — | — |
| V5 · Seller payout day | V5 helper | In progress | — | — |
| V6 · Seller support entry point | V6 helper | In progress | — | — |
| V7 · Final check | Main agent | Waiting for V1–V6 | — | — |

## For the owner

The checked preview is the canonical project on `admin-redesign`. Browser tests that write data use disposable fixtures. Migration 0170 is owner-applied.

The read-only preflight confirmed the checked database has all 107 published forms and the required sign-in schema. The checked preview was already running on port 3018.

The checked local catalogue contains no category or occasion rows whose trimmed Nepali name equals the English name. This count came from a read-only query of the existing names.

Both legal pages opened directly from the checked Super Admin session. The production-mode disposable fixture used real authenticator verification. First-factor staff went to Security with the original return address. Restricted verified staff reached Staff access denied in one redirect at 390 and 1440 px.

Today at 390×844 places the first task title above 715 px and its Unassigned pill above 779 px. The bottom bar starts at 784 px. Every row displayed its owner pill. The keyboard filter and an existing task link worked. The fixture verified assignment writes and the You pill.
