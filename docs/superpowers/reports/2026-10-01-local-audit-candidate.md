# Hastabazaar local audit candidate

The audit repairs are implemented and verified in an isolated local candidate. This report records the changes, supporting evidence, and remaining setup gaps. No deployment, push, live provider activation, production migration, or historical data repair occurred.

Use [the implementation worktree](C:/Users/abinash/.codex/worktrees/local-audit-remediation/Hatskala), on `codex/local-audit-remediation`. It preserves the newer staging source and its 96 existing working changes. The original desktop and staging checkouts remain unchanged. The [roadmap](C:/Users/abinash/.codex/worktrees/local-audit-remediation/Hatskala/docs/superpowers/plans/2026-09-30-local-audit-remediation-roadmap.md) and [project audit](C:/Users/abinash/.codex/visualizations/2026/09/30/01a0f2dd-89c4-77c1-9b97-f0cf98fec1b0/Hastabazaar-project-audit-2026-09-30.md) retain the detailed scope.

## Repairs by finding

| Findings | Resulting behavior |
| --- | --- |
| F01 | Reset revokes stale contact challenges and sessions. A contact request that read authentication before reset cannot create proof or a replacement session afterward. Legitimate first mailbox verification still rotates its originating session. |
| F02, F03, F04, F08 | Refund delivery allowances use current financial snapshots, and failed refunds reacquire capacity before processing. Replacement stock consumption must win its guarded transition. Requester and actual owner cannot perform ordinary or high-value self-review. Delivered plus cancelled orders receive a consistent delivery timestamp. |
| F05, F06, F07 | Managed items stay out of ordinary earnings and payouts. Unearned refunds create no premature debit; final collection posts one earning credit and cumulative deferred reversal. Replay resumes unfinished earnings and simulated invoice work without repeating collection. Fully collected refunded orders can issue their unchanged original gross simulated invoice. |
| F11, F12 | Readiness distinguishes D1/SQLite schema from MariaDB generated-column requirements. SMTP timeout, disconnect and later reads terminate predictably and release owned sockets. |
| F15, F16, F17, F19 | Account allowances are separate from shared-network limits. Logout mutates only through trusted POST. Private and encoded route identifiers are excluded from analytics ingestion and historical aggregates, including old backslash paths. |
| F09, F10, F18 | Omitted Nepali fields preserve saved values; intentional clearing remains distinct. Materials additions and removals persist through revision/reload. Photos must fully decode within bounded dimensions before storage; corrupt signature-only files fail safely. |
| F13, F14, F22 | Verification/configuration outages show recovery actions. An outage does not imply sign-out or grant checkout proof. Pending submissions disable all editable fields; failures preserve answers and replay identity. |
| F20, F21 | Discovery omits the missing makers directory and excludes videos from Product image metadata. |

The changes retain integer-paisa calculations, immutable commercial snapshots, ownership checks, replay protection and simulation gates. No source SQL migration was added. Additional lifecycle cases found in independent review received focused regressions and corrections.

## Usability and performance

Both homepage carousels have persistent Pause and Resume controls, and the homepage has one meaningful H1. Tracking preserves the last successful result during transient errors and offers retry. Aftercare explains recovery through existing saved cases and the same replay identity.

An 8 MiB synthetic video previously returned 8,388,608 bytes for a 64 KiB seek request. The corrected route returns status 206 and 65,536 bytes, a 99.21875% transfer reduction for that request. The native bucket reads the requested range, preserves full object size, and supplies validators without loading the whole video. Eligibility checks precede storage access; photos retain their watermark path.

Two other bottlenecks remain measured follow-ups. One product repository load performs two queries; duplicate metadata/page loads perform four. Synthetic maker collection output grows from 161 bytes for one row to 16,645 for 101 rows and 166,947 for 1,001 rows. These measurements demonstrate duplicate work and payload growth; they are not production latency benchmarks.

## Verification

Both complete test partitions, fresh lint/TypeScript checks and both refreshed builds pass. Independent follow-up review approved the repairs. Earlier failures remain in the execution logs and are not omitted from the record. This verifies the local candidate within the acceptance limits below.

| Check | Evidence |
| --- | --- |
| Combined source run | All 210 source partition files ran: 2,003 tests, 1,992 passed, zero failures, 11 explicit skips; exit 0. Ten skipped opt-in MariaDB scenarios passed separately; the 232px browser test remains a gap. |
| Combined native fixture run | All 16 native SQLite/D1 partition files ran: 233 tests, 233 passed, zero failures or skips; exit 0 with natural process shutdown. |
| Lint and TypeScript | Fresh final checks passed: `npm run lint` and `npm run typecheck` (`tsc --noEmit --incremental false`). |
| Build targets | Fresh local Cloudflare (`npm run build`) and standalone Node/Babal (`npm run build:babal`) builds passed, exit 0. These compile locally without deployment. |
| Runtime and bootstrap | 31/31 focused checks; all 67 SQLite migrations applied to empty local state; runtime auth prerequisites created after backup; health reported ready. |
| Actual MariaDB acceptance | Four identity and six commerce scenarios passed on independent connections in a disposable fixture. Effective schema limits apply. |
| Commerce follow-ups | 168/168 affected commerce, document, staff and staging tests passed, including the cost replay regression. |
| Frontend compatibility | 69 scoped tests covered by passing focused runs; shared validation 406/406. Logout forms are classified explicitly; accepted photo fixtures are real JPEGs. |
| Media | 23/23 affected tests, including native range reads and existing watermark behavior. |
| Native lifecycle | Initial 16-file run reported 233 passing test events but did not exit. Its last test retained 2,432 filesystem watchers. A test-only unnecessary watcher was disabled; corrected final file passes 6/6 and exits naturally. The subsequent group's sole quota assertion failure was reproduced and corrected as described below. |
| Native quota test | The prior group exited with 232 passed and one `200 !== 429` failure: 41 requests crossed the real 60-second quota window under load. A controlled clock-crossing reproduction matched that error. A tightly scoped, restored same-window clock passes the full promo file 21/21; the production limiter and existing assertions are unchanged. |
| Generated release manifest | Post-build completeness and trigger-name checks passed 6/6, zero skips; exit 0. |
| Final preview and preservation | The corrected README uses Vinext's `--hostname 127.0.0.1`. The running preview returns HTTP 200 and `marketplaceReady: true`. All 96 captured staging source files still match their original hashes. |

The 210-file source and 16-file native SQLite/D1 groups select all 226 maintained test files. The ten actual MariaDB opt-in scenarios run separately against independent connections in the disposable fixture; their success does not certify a fresh release installation.

Detailed logs and reviews are in [the local execution record](C:/Users/abinash/.codex/worktrees/local-audit-remediation/Hatskala/.superpowers/sdd/2026-09-30-local-audit-remediation-roadmap). The [whole-branch review](C:/Users/abinash/.codex/worktrees/local-audit-remediation/Hatskala/.superpowers/sdd/2026-09-30-local-audit-remediation-roadmap/final-review-report.md) required failed-refund capacity, high-value self-review and invoice replay fixes. The [independent follow-up review](C:/Users/abinash/.codex/worktrees/local-audit-remediation/Hatskala/.superpowers/sdd/2026-09-30-local-audit-remediation-roadmap/final-review-followup-report.md) approved those corrections with no remaining findings in its seven-file scope. The coordinator's completed integration checks are listed above.

Final integration evidence is in `final-source-reviewed-tests.log`, `final-native-reviewed-tests.log`, `lint-candidate-final.log`, `typecheck-candidate-final.log`, `build-cloudflare-candidate-final.log` and `build-babal-candidate-final.log`. Production repairs are checkpointed through `058f85b`; the isolated quota test correction is `0f49f2d`. The final documentation checkpoint preserves this report and the corrected start command.

## Browser checks

The actual local application was inspected through the in-app browser. Home controls work on desktop and a 390px mobile viewport; keyboard Enter toggles pause. Contact configuration loads, controls disable during sending, and an unavailable transport preserves answers with retry. Seller and admin sign-out use POST; seller access afterward redirects to sign-in.

Contact and catalog controls fit their forms without horizontal overflow at the browser's actual 240px minimum. Keyboard Tab moves from name to email. A requested 232px viewport is clamped to 240px, so the existing automatic 232px test remains skipped. Selected browser console checks returned no warnings/errors; HMR server diagnostics are recorded separately. These checks do not certify a complete rendered shopping, checkout and return journey.

![Keyboard pause in the restored local storefront](C:/Users/abinash/.codex/visualizations/2026/09/30/01a0f2dd-89c4-77c1-9b97-f0cf98fec1b0/local-remediation-final-preview.png)

![Actual mobile pause controls](C:/Users/abinash/.codex/visualizations/2026/09/30/01a0f2dd-89c4-77c1-9b97-f0cf98fec1b0/local-remediation-mobile-paused.jpg)

## Remaining setup and acceptance gaps

- An unmodified fresh MariaDB release installation is not certified. Companion SQL overlaps base columns/constraints, and trigger local variables depend on database default collation. Only the synthetic fixture was repaired; source migration files were preserved. Effective-schema tests cannot prove the unmodified install or production upgrade.
- Protected public sign-in form configurations are absent after fresh seeding and unavailable for catalog editing. Fictional role access works; public sign-in still needs an explicit bootstrap design.
- Live mail, SMS, payment, carrier, transfer, backup and legal/tax integrations remain outside this phase. The D1 preview safely reports unavailable contact delivery without sending to the external feedback mailbox.
- No historical financial records were repaired. These changes protect future transitions; they do not establish a data migration for previously contaminated ledgers.
- Complete rendered commerce and mixed-media journeys, exact 232px automation, physical touch testing and unmodified MariaDB upgrades remain distinct from selected browser/fixture checks.

## Recommended next capabilities

Reconciliation inside the existing exception workspace is the first operational extension: compare orders, refunds and both ledger models, then surface discrepancies for review. A makers directory is a contained customer feature once eligibility and pagination are designed. Seller autosave/upload recovery builds on corrected revision contracts. Back-in-stock subscriptions need reliable inventory events, a local outbox and preference controls.

Purchasable variants deserve a separate design because they change stock, checkout and refund snapshots. Shared gift lists, customer privacy exports and planned gift delivery follow their ownership and operational requirements. These are prioritized ideas, not implemented features or approvals for live providers.

## Continue locally

Follow [README development instructions](C:/Users/abinash/.codex/worktrees/local-audit-remediation/Hatskala/README.md) in the implementation worktree. The [preview](http://127.0.0.1:4317) is running; `/local-testing` selects fictional roles. The audit-owned MariaDB fixture was stopped after its checks, preserving its disposable data. Local checkpoints preserve the baseline and repairs. Integration into either existing dirty checkout remains a deliberate later step.
