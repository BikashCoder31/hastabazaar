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

## Task 12 combined checkpoint — 2026-09-28

The combined local D1 journey passed in a separate disposable clone, ID `7b623109`, on strict loopback `http://localhost:4174`. Canonical `4173` received only exact pending migration `0061_loyalty_points.sql` and initialization of the three missing actual forms. All five incentive forms now have published configurations; the original 136 published rows are byte-for-field unchanged, total 139. Default canonical earning remains disabled. Repeating `--publish-combined-incentive-configs` initializes nothing, preserves 139, and reports zero domain mutations.

Current canonical guarded preview is owned session **94263**, PID **2680**. Its fresh attestation verifies capture mail, simulated payments, local recipients, no remote credentials/bindings or local env files. `/health/live`, `/admin/loyalty`, and `/account/rewards` return 200. Disposable PID 24200 was stopped; 4174 refuses connections. The original three role windows/cookies were not used. All original customer orders, wallet/points and seller governance rows match the pre-fixture marker; original Task 7 order `HK-20260928-24FF9884DC` is preserved. The 22 protected files match their approved hashes, including Task 11's Rewards navigation addition.

Fixture acquisition used an online SQLite backup and 19 legitimate `claimDailyPoints` repository calls with explicitly recorded fixture-only server dates, then today's real UI claim, yielding 200 points. Live server time was never advanced. The actual UI exchanged those 200 points for 2,000 paisa wallet credit. Claim retry, lost exchange response and retry of the retained original exchange, exact API replay, whole-block validation, history, admin draft/publication/pause, stale promo quote removal, and checkout/cancellation replay were checked. Paused earning was viewed after redemption; this browser run does not independently prove redemption with a nonzero balance while paused.

The only combined order is `HK-20260928-39E819F405` (`8abd2f5e-caf9-4028-bdd4-1dfd58bce780`), campaign `SIM7B623109`. Initial merchandise 20,000 + delivery 27,000 - promo 1,000 - wallet 2,000 = cash 44,000 paisa. Partial cancellation leaves merchandise 10,000, delivery 18,000, promo 500, wallet 1,000, cash 26,500, restoring only 1,000 spent wallet paisa. Campaign use/spend stays 1/1,000 and points remain zero.

Actual customer return `880727c9-73f0-41ea-b42e-be6cb2506ff9` and admin review/start/complete refund all traversed real UI receivers. Paid refund gross 10,000 excludes 1,000 wallet and 500 promo, giving 8,500 cash; another 1,000 spent wallet paisa was restored. Final wallet 2,000, points zero, one points redemption and one promo use remain. Original merchandise and commission amounts were not rewritten. Admin case detail displays original delivery snapshot 27,000 via `orders.delivery_charge_paisa`; current order delivery is 18,000. Chosen delivery refund is zero. This original/current wording ambiguity remains a review observation.

Delivery/payment prerequisites are explicitly limited: real seller packing/ready calls succeeded, but actual admin dispatch returned 500 from an inherited cancelled-parcel eligibility mismatch. The controller independently fixes and tests that guard; this browser run did not replay dispatch on the advanced order. Before continuation, failed order/parcel/payment state was preserved in `failed-dispatch-online.sqlite` and `failed-dispatch-snapshot.json`. Approved fixture-only SQL marked just this new order delivered, its remaining ready item delivered, and its matching 26,500-paisa pending payment captured. `fixture-delivery-prerequisite.json` records exact SQL and unchanged wallet/points/promo/governance ledgers. This is not end-to-end delivery/payment acceptance.

Required widths **232, 390, 722, 1024, 1440, 1920** cover actual rewards/admin/errors/recovery/checkout/promo/receipts/cancellation/refund. Final run has 30 captures; 153 retained PNG artifacts include earlier stage captures and probes, individually hashed in `final-preservation.json`. Keyboard Tab/focus, content/title/path, overlay absence, clipping/viewport bounds were checked. Final console/page errors and unexpected local network failures are empty; expected navigation aborts are recorded. Prior failures remain preserved and are not erased by final success.

Reproduction uses installed dependencies only, exact worktree, safe staging variables from the guarded launcher, and explicit `PLAYWRIGHT_MODULE`/`CHROMIUM_PATH`. `node scripts/incentives-browser-check.mjs --phase=combined --apply-pending-0061` applies only the exact pending migration after online backup/integrity/history guards. `node scripts/form-catalog-local-setup.mjs --publish-combined-incentive-configs` initializes actual connected forms. Ignored `.staging/task12-fixture.ts` records bounded clone acquisition; `.staging/task12-fixture-launch.mjs` creates the wrapper by copying canonical Vite settings, changing only relative import resolution and persistState to the identified clone. Extra cacheDir caused duplicate React renderer SSR errors; sequential use of the canonical cache resolved them. Never sync the clone back. `.staging/task12-browser-launch.mjs` supplies the sanitized runtime and existing browser module; `node .staging/task12-browser-launch.mjs --phase=combined` passed once and refuses rerun after success. `.staging/task12-launch.mjs` restores canonical settings.

Scoped validation: 17 setup tests pass, both owned scripts lint/syntax-check, and owned diff whitespace check passes. Genuine combined initializer RED/GREEN is retained. Full branch tests, typecheck, lint/build and independent review belong to the controller after scope freeze.

Compatibility remains conditional: the separate final Maria report records **13 PASS, 4 BLOCKED, 1 INCONCLUSIVE, 0 FAIL**, overall exit 1. Its inherited rider/gift/catalog/MATERIALIZED bootstrap blockers and exact source-trigger barrier limitation prevent a Maria readiness claim. See `.superpowers/sdd/2026-09-28-promo-codes-daily-points/task-12-compat-report.md` and the detailed browser report in the same scratch directory. No production deployment, real payment, external mail, reseed/reset, stage, commit, or download occurred.

## Final local acceptance — 2026-09-29

Local incentives are delivered at `http://localhost:4173/admin/promo-codes`, `http://localhost:4173/admin/loyalty`, and `http://localhost:4173/account/rewards`. Promo administration, customer quote/application, daily points claims, whole-block points exchange, shopping credit checkout, and cancellation/refund accounting have local implementation and evidence. All five configured incentive forms have real receivers and published local configurations. Daily earning defaults to disabled, with 10 points/day and 100 points exchanged for 1,000 paisa; enabling requires SuperAdmin publication with an explicitly selected finite campaign.

The final SPEC corrections protect authentication-subject custom-field aliases across incentive forms and include the loyalty companion migration plus loyalty wallet kind/source and safe-amount requirements in generated release readiness metadata. The actual deployment manifest was intentionally not regenerated. Scoped SPEC rereview approved both corrections. Independent whole-feature QUALITY / SECURITY / FINANCIAL review is APPROVED with no material findings; final corrected-tree local acceptance is verified.

Final corrected-tree gates: full suite session 8864 completed with actual exit 0: **1,953/1,953 tests passed**, zero failures/skips/cancels/todos, 1,689,675.3011 ms (`task-12-corrected-full-tests.log`); full typecheck (97466), full lint (40148), and local build (3399) each completed with actual exit 0. Correction coverage passed 10/10, related coverage 441/441. The earlier 1,944/1,944 full-suite pass predates the two SPEC fixes and does not substitute for the final corrected-tree run. Earlier browser/setup evidence comprises 17 passing setup tests; the durable setup regression suite contains 11 tests. These are distinct checkpoints, not additive counts.

QUALITY explicitly carries three nonblocking P3 observations forward: Delivery paid needs a deferred display-only clarification of the original delivery snapshot (27,000 versus current 18,000 paisa); refund arithmetic remains correct. Inherited ReturnCaseActions labels need stable control IDs/label associations and accessible-name checks; the browser journey does not establish full return-form accessibility. The older admin navigation highlight has an unconfirmed cause despite correct current-page ARIA/routing; defer a read-only mounted pointer/focus/CSS check, without claiming visual resolution. Earlier failed suite and browser attempts remain historical evidence, including the first full-suite 1,937/1,944 pass with seven failures. Nothing in this section erases or reclassifies those results.

Acceptance is bounded to local evidence. Actual Maria compatibility remains **13 PASS, 4 BLOCKED, 1 INCONCLUSIVE, 0 FAIL**, overall exit 1, with inherited bootstrap/gift/catalog/answer blockers and the inconclusive exact source-trigger barrier proof retained. The combined browser financial journey required a documented disposable delivery/payment prerequisite after dispatch failed. The separately corrected dispatch guard was tested, but dispatch was not rerun on the advanced/refunded browser order; this is not end-to-end delivery/payment acceptance. Repository/native coverage supports paused redemption; the browser paused earning only after redemption. No production readiness, deployment, live payment, or external message is claimed.
