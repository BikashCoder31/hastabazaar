# T33 native bootstrap prerequisites — bounded acceptance

The reviewed schema-only bootstrap repair is applied and passed native MariaDB 10.11 verification. This closes the five-column/refund-index bootstrap omission, not all T33/T34/T35 or deployment readiness. Canonical local data, launcher settings, historical SQL assets, existing candidates and deployment holds are unchanged. Root granted source thaw only after 156 acceptance and clean shutdown, then separately granted the native slot.

## Source and candidate

Owned source changes:

- `lib/operations/bootstrap-prerequisites.mjs` and `deployment/babal/mariadb-bootstrap-prerequisites.sql`: canonical-source validation and guarded schema-only companion. Three nullable order-item fields, nullable seller settlement reference, seal `BIGINT NOT NULL DEFAULT 0`, and ordered refund/type uniqueness. Replacement uniqueness is created before removing the old refund-only restriction. All present metadata and duplicate checks precede DDL; malformed/unknown states stop, and completed replay does no DDL. No policy/consent/history creation, financial backfill, row UPDATE/DELETE, deduplication, FK suppression or collation rewrite.
- `scripts/generate-mariadb-schema.mjs`: checked companion appended after every accepted 156 byte, including FK restoration; historical schema remains reset input.
- `scripts/generate-release-manifest.mjs`: explicit new companion inventory and exact ordered `seller_ledger_entries.idx_seller_ledger_refund_type_unique = ['refund_id','type']` requirement.
- `tests/bootstrap-prerequisites-source.test.mjs`, `tests/bootstrap-prerequisites-import.test.ts`, `tests/native-public-feedback-combined-schema.test.mjs`, `tests/native-form-health-schema.test.mjs`, `tests/product-price-history-schema.test.ts`: source guards, actual importer parsing and schema-only suffix expectations, retaining all historical prefix/reset invariants.

The earlier independent staged review is preserved. The applied helper/SQL differ from it by one comment punctuation byte: `DDL auto-commits;` becomes `DDL auto-commits.`. Actual source-parser execution exposed the old comment as a separate query in current/legacy loaders. Executable SQL is unchanged. Original/corrected hashes and the initial failure are recorded under `.test-artifacts/t33/bootstrap-prerequisites-native-astra-20261105/`.

New candidate, generated into an absent directory: `.test-artifacts/t35/bootstrap-prerequisites-candidate-20261105-v1/mariadb-schema.sql` — 984238 bytes, 1777 statements, SHA256 `dd751ebe5fe7b0894a96c49646c7d8e413da31137add3dffea3c4461874a18b8`.

- Complete 974510-byte 156 prefix remains SHA256 `eda83b438b617d1ef97e3d9fcbdf42bc30613995c0dd4adcc2e1f7905b618c52`.
- Companion SHA256 `98aea94d335270612fe4497fb28469053b9c4194bacfe2f1a597c4ddd6cfb145`.
- Historical 992233-byte reset remains SHA256 `f71cbde53af46afe3156b2d4df3391c11a1c47590360c23faa41c0ea8b1ffdd3`.
- New bundle manifest SHA256 `232da972fa614a75477ef7e36fb4c05c22cdfd6f6006a02a5183c907a0cca583`: 137 assets, 358 table/469 trigger requirements. All five column requirements, exact companion hash and ordered new index are checked. Presence of the replacement alone does not prove absence of the old restrictive index; native checks explicitly establish that absence.
- The original 162-entry preservation inventory now reconciles as 161 unchanged SQL assets plus the authorized generator change, whose exact original is retained. It is not claimed as 162 unchanged after application. `candidate-review.json` and `final-freeze.json` hold exact source hashes and post-native reconciliation.

## Executed evidence

`node --import tsx --test --test-concurrency=1 tests/bootstrap-prerequisites-source.test.mjs tests/bootstrap-prerequisites-import.test.ts tests/native-public-feedback-combined-schema.test.mjs tests/native-form-health-schema.test.mjs tests/product-price-history-schema.test.ts` passed 10/10, zero failures/skips/cancellations, 16714.7453 ms. Source RED→GREEN was retained from the staged implementation; the comment parser regression was additionally observed before correction. Actual current-native and portable exported parsers preserve 1776 original statements and return the entire anonymous block as one final statement. Three source-parser-body checks, including the historical release loader, also passed.

`node --import tsx .test-artifacts/t33/bootstrap-prerequisites-native-astra-20261105/native-run.mjs .test-artifacts/t35/bootstrap-prerequisites-candidate-20261105-v1/mariadb-schema.sql dd751ebe5fe7b0894a96c49646c7d8e413da31137add3dffea3c4461874a18b8` passed 113/113, zero failures/skips:

- 96 populated partial states: every subset of five columns × old-only/old-and-new/new-only index checkpoints. Existing selected fields include nondefault historical values. All original row images, selected/original column metadata, table options/collation, unrelated indexes, complete CHECK metadata, triggers, FKs and ordered FK columns remain unchanged. Unrelated tables retain exact SHOW CREATE. Missing fields receive only canonical NULL/0 defaults. Settings sentinel rows and absent policy keys stay unchanged.
- Every successful state has exact replay with zero session ALTER count; five uniqueness probes verify refund+commission_reversal coexistence, rejection of same refund/type duplicates, distinct refunds and repeated NULL refunds. Actual FK, immutable-update trigger and CHECK rejection probes remain enforced.
- 16 malformed states refuse with the companion's named error before any ALTER and preserve exact snapshots. Three invalid-index fixture recipes use a separate ordinary FK-support index so fixture construction does not disable constraints.
- One full integration imports the actual 1776-statement accepted prefix, snapshots its 347 real tables, applies the exact final companion, and proves first-application preservation. Full replay and real Maria CLI DELIMITER replay retain exact snapshots with zero session/global ALTER count respectively. Full CLI bytes are the reviewed companion, not a custom rewritten statement.

The small fixtures isolate the companion contract; they do not pretend to be 112 full application imports or end-to-end commerce. Full integration covers the real generated schema separately. The manifest's 358-table requirements versus 347 imported tables were subsequently investigated at root's request. This reveals concrete incomplete-bootstrap and manifest-inventory blockers, detailed below; the discrepancy is not merely a counting caveat.

Native evidence: `.test-artifacts/t33/bootstrap-prerequisites-native-astra-20261105/run-1793822039418/{cases.jsonl,results.json,maria-cli-replay.txt}`. Live server version was asserted to be 10.11.x; cached image ID was pinned to `sha256:7f22313fc130a377a44999965bcb0a08dd5b21e8502824c1b864f792f9bc66ab`. Strict unchanged fixture marker/token/ID/local context/bindings/no-host-bind checks and exact owned namespace guards applied. TEMP/TMP stayed under the owned project artifact. Initial sandbox image inspection was denied before acquisition; approved escalation ran the isolated test. Container `f6f746bdb20fac84ca1f300db5446106abef47bd37407f061ba99b4f603347e7` was independently attested and stopped; receipt has `failure:null`, `cleanupErrors:[]`. No native process remains from this task; heavy slot was returned to root.

Scoped diff whitespace validation passed. A mistaken `npx eslint` attempt found no local ESLint and failed registry resolution; it is retained in `scoped-lint.txt` and is not lint evidence. The repository's actual `.\node_modules\.bin\oxlint.cmd --disable-nested-config` run over the eight changed JS/TS files exited 0 with no diagnostics; `scoped-oxlint.txt` is empty. Global lint/typecheck/full regression/build/package remain root-owned gates and are not claimed by this note.

## Remaining boundary

### Newly identified bootstrap and inventory blockers

Read-only reconciliation found **16 required tables absent from the candidate**, offset by **five present tables absent from the manifest**, producing the net difference of 11. The candidate has exactly 347 distinct CREATE TABLE names and no DROP TABLE/RENAME TABLE statements, matching the observed native count. Complete per-table authoritative Maria/SQLite source paths, line numbers, ORM mappings and runtime consumers are retained in `.test-artifacts/t33/bootstrap-prerequisites-native-astra-20261105/table-inventory-diff.json`.

| Missing required tables | Authoritative SQLite source | Current use |
|---|---|---|
| referral_campaign, referral_redemptions | 0021_referrals_wallet.sql | Wallet/referral quote and order posting |
| order_email_jobs | 0022_order_updates.sql | Email queue reader |
| review_photos, review_replies | 0023_review_photos_replies.sql | Review upload/reply APIs and repositories |
| password_reset_challenges | 0025_password_reset.sql | Password-reset authentication |
| product_deletions | 0026_product_deletions.sql | Product availability/readers |
| product_sku_claims | 0030_product_identity_taxonomy.sql | Authoritative claim_new_product_sku trigger and current portability inventory; no direct ORM/TypeScript writer located, so retirement is not established |
| delivery_rate_versions, delivery_rate_current, parcel_courier_costs | 0032_delivery_rates_costs.sql | Current delivery quotes/configuration and parcel cost posting |
| exception_work_items, exception_work_events | 0034_exception_work.sql | Rider/exception commands and private event history |
| homepage_product_controls | 0040_homepage_product_controls.sql | Homepage product queries and controls |
| marketplace_settings | 0041_marketplace_settings.sql | Current private security store and settings consumers |
| homepage_hero_media | 0055_homepage_hero_carousel.sql | Current private homepage-media repository |

All have maintained Maria companions, included as required assets in the manifest but omitted from the generated bootstrap. Fifteen have direct current runtime SQL; the SKU table has the retained database-trigger/portability contract described above. These are concrete release-readiness blockers. Earlier frozen-bootstrap comments already retain a Task12 carry-forward, but that does not waive current requirements or authorize blanket historical companion replay.

The five present-but-uninventoried tables are `email_transport_backoff`, `operational_notice_states`, `operational_reminder_cursors`, `operational_reminder_milestones` (0147) and `service_health_guards` (0148). They have current ORM/runtime consumers. Their CREATE definitions end with `);` without an ENGINE clause. The extractor at `scripts/generate-release-manifest.mjs:181` requires `) ENGINE`, which omits these tables and can consume text across later CREATE blocks. This separate manifest defect needs a coordinated structural extraction correction and source tests.

No additional application/schema repair, engine restart or broad migration replay was attempted during this audit. The frozen candidate and 113 passing cases remain bounded evidence for the five-column/refund-index companion. This new source-only audit supersedes the earlier generic inventory caveat in `final-freeze.json`; it does not invalidate its exact hashes or native results.

Root's fresh unchanged seller setup, fee 29 and health 3 native functional checks follow this candidate. Actual phpMyAdmin host import is unverified locally; release packaging copies/hashes exact SQL bytes and does not execute migrations. All deployments, live changes and canonical local data mutations remain held.

The preserved reset ends at 156 and is not alone a complete new-bootstrap install. Any later separately authorized empty-target recovery also requires the verified companion afterward. Never apply reset to populated/current canonical data; do not replay the whole manifest or historical policy companion. No recovery was performed here.
