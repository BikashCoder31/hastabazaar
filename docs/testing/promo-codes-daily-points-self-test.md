# Promo codes and daily points local self-test

Task 7 promo checkpoint, 2026-09-28. Worktree: `C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala`; branch `codex/hastabazaar-v1-2-1-staging`; reviewed base `f060b6f` (Tasks 5/6 committed). Local acceptance passed; independent specification and quality reviews are still required before the controller commits. Future loyalty contracts are not implementation readiness.

The flow under test is: `/admin/promo-codes` → actual draft/publication → isolated customer `/checkout` quote/remove/reapply → simulated COD order → receipt → partial seller cancellation with retained financial consumption.

## Guarded environment

Exact origin `http://localhost:4173`, Node `v22.23.1`, `NODE_ENV=development`, `HASTABAZAAR_RUNTIME_ENV=local_staging`, mail `capture`, payment `simulated`, recipient domain `local.hastabazaar.test`, `HASTABAZAAR_LOCAL_RIDER_DECODER=1`. Forbidden remote DB, SMTP, Cloudflare credentials, remote storage and EMAIL bindings were absent. No `.env*` or `.dev.vars*` files existed. The existing Vite configuration uses `remoteBindings:false` and marked `.staging/state`. The controller stopped only its known server session 13161; the same-state refresh is owned exec session **70563**, still running on 4173. User Chrome windows, cookies and preview state were preserved.

Browser plugin not available; explicitly approved installed Playwright (`C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`) and headless Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`) were used. Fresh isolated contexts block cross-origin requests and service workers. Opaque isolated cookies stay only in ignored artifacts and are never logged.

## Exact commands and outcomes

Run from the exact worktree, with the environment above. Use installed binaries; no `npx` autofetch or dependency installation.

| Command | Result |
| --- | --- |
| `./node_modules/.bin/tsx.cmd --test tests/incentive-local-setup.test.ts` | Actual inert-interface RED: 1/9 pass, 8 fail, exit 1; implemented GREEN: 9/9 pass, zero skipped, exit 0. |
| `node scripts/incentives-browser-check.mjs --phase=promo --preflight` | Read-only canonical preflight plus online SQLite backup; integrity `ok`, all table counts and migration ledger match. |
| `node scripts/incentives-browser-check.mjs --phase=promo --apply-pending-0060` | Fresh backup and explicit runtime attestation verified; pending set exactly `0060_promo_codes.sql`; applied 1, ledger 60→61. All pre-existing table counts/configurations preserved. |
| `node scripts/form-catalog-local-setup.mjs --publish-incentive-configs` | Audited draft/publish APIs initialized `staff.promo-code` and `commerce.promo-quote`; 134 existing published rows unchanged; domain mutation count 0. |
| Same initialization command, repeated | Initialized none; 136 published rows unchanged; domain mutation count 0. |
| `node scripts/form-catalog-local-setup.mjs --plan` | Exit 0; local schema and fictional fixtures ready; promo phase IDs reported. |
| `node scripts/incentives-browser-check.mjs --phase=promo` | Actual financial journey and retained same-order resume verified; final exit 0, zero page/console errors, no overlays/clipping/overflow, six widths. |
| `./node_modules/.bin/tsc.cmd --noEmit` | Exit 0. |
| `./node_modules/.bin/oxlint.cmd scripts/form-catalog-local-setup.mjs scripts/incentives-browser-check.mjs tests/incentive-local-setup.test.ts "app/orders/[orderNumber]/page.tsx"` | Exit 0. |
| `node .staging/task7-final-audit.mjs` | Existing identities, seller/governance/history/configuration/financial rows preserved; original 3 carts and 2 items unchanged; one campaign order, one cancellation; all 22 protected source hashes match. |

The named behavioral anchor is **initialization preserves existing configuration and covers every new ID**. Guards reject non-loopback, production, unmarked and remote-binding contexts before mutation. Metadata preflight rejects disconnected adapters, an unpublished existing draft and missing actual promo IDs before any write; published configurations/drafts are skipped unchanged. The no-answer quote form permits no custom questions/answers. `staff.loyalty-settings`, `account.daily-reward`, and `account.points-redemption` are explicitly absent. `--phase=combined` is reserved for Task 12.

## Actual fixture and accounting

Only new explicitly authorized SIMULATED fixture rows were added: owner `sim-promo-owner-7b10a37b`, seller `sim-promo-seller-7b10a37b`, product `sim-promo-product-7b10a37b`. The seller starts in an explicitly simulated approved fixture state. No existing under-review application was approved or changed. No private bank/document/contact/media data was copied. Deltas: one user, one seller, one product and its trigger-owned SKU claim. Existing seller/governance/history rows stayed unchanged.

Campaign `SIM7B10A37B` was created/published through the actual UI, with a 1,000-paisa fixed discount, finite dates, use limit 2 and budget 2,000. Customer quote/remove/reapply and an actual delayed quote response after removal were exercised. The obsolete response did not restore a removed code.

Exactly one order, `HK-20260928-24FF9884DC`, and one partial cancellation were created. The second seller's parcel was cancelled through the actual configured cancellation form/API; retries of the harness verified retained native state and did not create another order or cancellation.

| Accounting | Original | After partial cancellation |
| --- | ---: | ---: |
| Merchandise paisa | 20,000 | 10,000 |
| Delivery paisa | 27,000 | 18,000 |
| Promo savings paisa | 1,000 immutable original | 500 current; 0 refunded |
| COD due paisa | 46,000 immutable original | 27,500 current |
| Shopping credit spent/restored | 0 | 0 |
| Campaign use / spend paisa | 1 / 1,000 | 1 / 1,000 retained |
| Customer lifetime uses / redemption rows | 1 / 1 | 1 / 1 retained |

Both original line gross values remain 10,000 and both original commission amounts remain 900. No promo-created wallet credit occurred. Positive wallet restoration is covered by earlier native financial tests, not claimed by this zero-credit browser fixture.

## Evidence and failure history

Ignored artifacts: `.staging/artifacts/incentives/`. `runtime-attestation.json`, `migration-0060.json`, verified online `pre-0060-*.sqlite` backups, `promo-results.json`, `final-audit.json`, and 62 PNG files. Screenshot prefixes `7b10a37b-admin-published`, `checkout-applied`, `promo-region`, `promo-summary`, `receipt`, and `partial-cancelled`; widths **232, 390, 722, 1024, 1440, 1920**. Top-of-page captures prove page identity; region/summary captures prove actual controls and savings. Mounted keyboard focus/Tab, meaningful content, title/path, overlay absence and viewport bounds were checked. Actual Promo codes navigation targets `/admin/promo-codes` and has `aria-current="page"`.

Retained failed-run logs under `.superpowers/sdd/2026-09-28-promo-codes-daily-points/`: `task-7-red.log`, `task-7-browser-first.log`, `task-7-browser-second.log`, `task-7-browser-third.log`, `task-7-browser-fourth.log`, and `task-7-console-red.log/.json`. Initial fresh-cart hydration caused a token/response race; explicitly awaiting cart GET corrected the harness. A checkout response-body collection raced successful client navigation; the committed order was recovered through its retained native redemption and actual receipt, then response interception was corrected to capture before fulfillment. The Reason label includes a required asterisk; the harness now matches its actual accessible name. SQLite null-prototype rows were normalized for persisted evidence comparisons. No financial action was repeated to resolve these harness errors.

Actual receipt console RED showed two Base UI errors. The controller approved one extra path: `app/orders/[orderNumber]/page.tsx`, adding only `nativeButton={false}` to the two Buttons rendering Links (document and Continue shopping). A CRLF insertion initially missed the document site, and a transient HMR hydration warning was observed during that iteration; the final fresh retained-order pass reports zero console/page errors. The existing protected navigation's visual `data-active` styling discrepancy is a Task 12 follow-up; its current-page ARIA semantics are correct.

No reset/reseed, production connection/deployment, live payment, external message, dependency installation, standalone cancellation/MariaDB lifecycle runner, user cart modification, staging or commit occurred. No production/MariaDB readiness claim follows from this local D1 checkpoint. Whole-branch checks and all five configured incentive forms remain Task 12.
