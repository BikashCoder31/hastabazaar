# Review fixes · 21 November 2026

Owner review baseline: `64f2158` on `admin-redesign`. Checked preview: `http://localhost:3018`.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| V1 · Legal & procedures access | V1 helper | Done | `d684a2c` | Typecheck and lint passed. 11 focused tests passed. Checked Super Admin at 390/768/1024/1440 and restricted staff at 390/1440. |
| V2 · Taxonomy names and occasion images | V2 helper | Done | This task commit | Typecheck and lint passed. 26 focused checks passed, including a loopback decoder rerun. Four-width Chrome checks and both schema states in a disposable fixture. |
| V3 · Today on phones | V3 helper | Done | `b8b4468` | Typecheck and lint passed. 8 focused tests passed. Chrome at 390/768/1024/1440. |
| V4 · Phone tap targets | V4 helper | Done | `da96ae1` | Typecheck and lint passed. 64 focused tests passed. 81 phone route states and four-width checks on changed pages. |
| V5 · Seller payout day | V5 helper | Done | `3767223` | Typecheck and lint passed. 10 focused tests passed. Earnings and Payout run at 390/768/1024/1440. |
| V6 · Seller support entry point | V6 helper | Done | `4b46e4d` | Typecheck and lint passed. 44 focused tests passed. Chrome at 390/768/1024/1440 and disposable submissions at 390/1440. |
| V7 · Final check | Main agent | Waiting for V1–V6 | — | — |

## For the owner

The checked preview is the canonical project on `admin-redesign`. Browser tests that write data use disposable fixtures. Migration 0170 is owner-applied.

The read-only preflight confirmed the checked database has all 107 published forms and the required sign-in schema. The checked preview was already running on port 3018.

The checked local catalogue contains no category or occasion rows whose trimmed Nepali name equals the English name. This count came from a read-only query of the existing names.

Both legal pages opened directly from the checked Super Admin session. The production-mode disposable fixture used real authenticator verification. First-factor staff went to Security with the original return address. Restricted verified staff reached Staff access denied in one redirect at 390 and 1440 px.

Today at 390×844 places the first task title above 715 px and its Unassigned pill above 779 px. The bottom bar starts at 784 px. Every row displayed its owner pill. The keyboard filter and an existing task link worked. The fixture verified assignment writes and the You pill.

Seller Earnings and the admin Payout run both showed the same next run date, Wednesday 25 November, from the checked settings. The fixture also verified a different saved weekday and the cutoff boundary.

The 390 px Ask a question action was 351×44 px. The top and empty-state actions select Seller support in the existing form. A fictional seller question submitted at each of 390 and 1440 px reached Admin › Contact & feedback. The ordinary contact and feedback topics keep their usual initial selection.

The 390 px tap-target sweep covered 81 route states. The resized controls measured 44–48 px. The changed pages fit at 390, 768, 1024 and 1440 px.

- Seller Studio. Agreement acceptance, product options help, craft experience and shop contact and address controls.
- Admin operations. Company accounts, business settings, delivery rate overrides, commission explanation, seller review ownership, account recovery, seller public profile review and staff access checks for bank payments.
- Admin configuration. Program finance, marketplace rules, product classification, form guides, form preview and compatibility, and Team & roles actions across all five tabs.

The Catalog Add buttons and editor controls are covered by V2. Informational disclosures outside the primary flows retain compact styling, including recorded case history and published form question previews. Parked Rider settings were outside the active workspace sweep.

The Catalog editor and the public homepage, Categories and Gifts by occasion fit at all four widths. At 390 and 1440 px, adding and editing both kinds saved separate English and Nepali names. The storefront displayed the saved translation and hid it after it was cleared. With the optional tables present in the disposable fixture, occasion image upload, private preview, publication, replacement and removal passed. Retired image URLs returned 404. Without the tables, Catalog displayed one database-update note and saved names normally.

### Migration 0170 · Occasion images

Run these from the project root against an approved copy only. Set the existing review database variables to that copy. The MariaDB release manifest records the companion under owner-applied migrations.

- D1 `test -f "$HASTABAZAAR_REVIEW_D1" && sqlite3 -bail "$HASTABAZAAR_REVIEW_D1" < drizzle/0170_occasion_images.sql`
- MariaDB `mariadb --defaults-extra-file="$HASTABAZAAR_REVIEW_MARIADB_CONFIG" --database="$HASTABAZAAR_REVIEW_MARIADB_DB" < deployment/babal/mariadb-occasion-images.sql`
