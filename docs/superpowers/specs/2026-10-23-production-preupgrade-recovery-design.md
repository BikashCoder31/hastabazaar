# Production pre-upgrade backup and recovery design

Status: owner approved design and continued reviewed local preparation on 2026-10-23; no additional planning confirmation required. Later retention amendment below is the owner’s explicit instruction. This design does not authorize maintenance, deletion, grants, production schema/security changes or deployment. It covers preserving and rehearsing the legacy production source before those later operations.

## Intent and boundaries

Preserve the existing production data and prove a production-specific restore before upgrading or activating the staging-accepted candidate. The owner selected reuse of the retained rehearsal database slot **after a fresh verified backup**, with a separate deletion approval later. The owner also selected private maintenance enrollment: after the backup/recovery safeguards, prepare the tested web MFA flow behind a restrictive production gate, then pause for personal Super Admin enrollment before public launch. Security initialization and candidate activation are outside this design's execution scope.

Do not change local retained SQLite data, the launcher, localProjectRoot/baseline, normal HEAD/index/configuration, existing staging, original production records or historical accounting. Do not copy staging accounts, sessions, campaigns, keys or policy into production or its recovery copy. Retaining the old staging rehearsal copy's own security material with its backup is separate from production recovery.

No dependency installation, new hosting purchase, branch publication, product-code change, production DDL/DML, financial-setting initialization, MFA action or application activation is included. Operational source, tests and receipts remain private and independently reviewed. Implementation uses the canonical `C:/Users/abinash/Desktop/HastaBazaar` and existing tools.

## Evidence and fixed identities

The final inventory review approved the 23 October live observation for planning, not backup or deployment acceptance. Receipt: `output/production-readiness-2026-10-23/host-production-inventory-receipt.json`, 15,986 bytes, SHA256 `cb6d135062459c1cac36380282e0c37d5026c2ae7945e508cd1976d0a1763c4d`. Its three detail files are authenticated by that receipt and the saved native-verification evidence.

| Item | Bound value |
| --- | --- |
| Host account | `/home2/hastabaz`, UID 1999 |
| Production application | `/home2/hastabaz/hastabazaar-app` |
| Original current destination | `/home2/hastabaz/hastabazaar-production-releases/hastabazaar-release-ci-38358135513-1` |
| Production origin / database / account | `https://hastabazaar.com` / `hastabaz_marketplace` / `hastabaz_marketapp@localhost` |
| Production media | `/home2/hastabaz/private-media` |
| Observed source | MariaDB 10.11.19; 147 InnoDB tables, 147 triggers, no views/routines/events; 2,838 rows at the live observation |
| Source defaults | `latin1` / `latin1_swedish_ci`; preserve table and column collations separately |
| Original security | No configured application key/policy/initialization marker and zero `auth-private:*` rows; recheck at capture |
| Old archive | `production-6204ae4-20261013/hastabazaar-release-ci-38358135513-1.tar.gz` under the deployment tools root; 39,281,792 bytes; SHA256 `47c7b97fcdaac4b308d3873948728e6b30309b8af6581cd50521bf9341c85f36` |
| Old inventory / provenance | Native hashes `3cf33ea64ec38bca86a81f9ceeee0aa4c1750ef7325db93b8a5abcebe986020c` / `14f57092292bc033a414f930f21e88b2f1a04f4ba5702c4a258fcf48bb9250a8` |
| Recorded old source | Commit `6204ae4d1f6a97b41cdd322ef9a83f8f7bee1e2f`; GitHub CI run 38358135513 independently displays that release, commit and archive digest |
| Accepted candidate | Commit `27b0d15100123783da8fe0a59589a1aaef31e06a`, release `hastabazaar-release-ci-39684716989-1` |
| Candidate archive / manifest hashes | `944338c2d1a280cccfbc11fcec58b983df1374a15854a1bb6c683eacb986e6bf` / `0f9e900a30f3f461bd80d1032db6dde13783368d8720a4e43a7494ce000e237d` |
| Existing rehearsal to retain before replacement | `hastabaz_fee_final_20261022`; existing account `hastabaz_stageapp` |
| Proposed new isolated production rehearsal | `hastabaz_prod_pre_20261023`; existing account `hastabaz_marketapp` only |
| New host operational root | `/home2/hastabaz/.hastabazaar-deployment/production-preupgrade-20261023-39684716989-1` |

The source inventory's counts are observations, not values to force back onto a live database. Legitimate orders/media added before the later controlled cutoff must be freshly captured. Schema/control drift, conflicting security state or unidentified writers stops the operation without repair or rebasing. The original archive's members and deployed-tree equivalence still require verification; the GitHub ZIP download did not yield a completion event and is not claimed verified.

## Approaches

1. **Selected:** preserve the current rehearsal copy with fresh authenticated private custody, then request replacement of only its database slot with the named production-only rehearsal. This uses existing host capacity. The old database's independent/manual use still requires owner confirmation immediately before deletion.
2. **Not selected:** arrange additional isolated database capacity first. This would keep the rehearsal database in place, but adds capacity/setup and potentially cost. No purchase or quota change is requested.

Builder proposal: reuse the existing candidate-bound authenticated encryption primitives with a distinct strict **legacy production** payload contract. The current native recovery contract requires application key IDs and cannot describe this keyless source. Creating a key to satisfy it, copying staging security or pretending the old binary is the candidate would violate preservation. No new cipher or application backup format is introduced.

## Source and media verification

Before accepting the old archive, verify its native size/hash, top-level CI inventory fields, all 3,756 declared member paths/sizes/hashes and exact archive membership. Reject traversal, duplicate paths, links, special files, secret/config paths and resource-limit violations. Independently compare every deployed release file to that inventory and reject extra or missing files. Do not execute/extract/import the old operator, application or bootstrap. Keep CI attribution, archive integrity and deployed-tree equivalence as separate recorded checks.

Reconcile all reviewed database storage-reference columns with the actual media tree. The candidate registry currently covers `object_key` in product_media, seller_documents, seller_profile_media, category_media, return_evidence, review_photos, homepage_hero_media, rider_applications and rider_reports. Reconcile any built-in application-media references through the trusted release registry and exact release bytes; do not treat arbitrary URLs as recoverable objects or silently ignore unknown reference fields. Preserve all stored objects, including unreferenced ones, and every original metadata sidecar. The live observation has 1,100 files including sidecars, 75,360,961 bytes and no unpaired files; this alone is not reference coverage.

## Coherent capture and maintenance

Prepare the exact production-only access patch, stop/restart commands and permitted before/during/after control differences before asking for execution approval. Preserve original web/bootstrap/runtime/selector material privately. The capture phase keeps the original release selected; the maintenance response must stop new customer requests before account-owned production Passenger workers are stopped. Identify production workers by owned PID, cwd and start time; include unexpected production-release workers or stop for review. Do not touch staging workers or scan other users' environments/argv.

An empty account crontab does not exclude external writers. In addition to worker/scheduler checks, propose a bounded dedicated database connection holding `LOCK TABLES ... READ` over the complete freshly verified base-table set during capture. Existing source privileges must suffice; do not request global RELOAD/SUPER/PROCESS access. A separate connection performs the consistent read-only inventory/dump. Do not start a transaction on the lock-holder connection and accidentally release its locks. Bound lock acquisition, fail rather than silently fall back, and release locks on every exit. Fresh schema and media/config inventories before and after must match. Any external source/control change prevents backup acceptance. Source credentials stay in memory or an anonymous `/proc/self/fd` client-options pipe, never argv, logs or persistent configuration files.

Capture an unchanged native database dump with original definitions/data/defaults/allocation/owners, complete media, exact old archive/inventory/provenance, source inventories and the selected production application's recoverable runtime/bootstrap/access configuration. Encrypt secret configuration; do not retain raw all-application selector output. New host directories/files must be canonical, owned, non-symlink and private 0700/0600; files are exclusive and single-link. No overwriting earlier results or automatic cleanup of failed evidence.

After the capture and required conservation checks, restore only the exact saved production access/selector running state and old release. Verify the original public health and controls. The rehearsal then runs while the old production release serves normally. If resumption cannot be verified, keep a truthful maintenance/failure state and report it; do not select another release to make health pass. A fresh final cutoff/capture is still required before a later production upgrade.

## Legacy encrypted material and custody

The proposed inner contract is `production-legacy-recovery`, version 1, inside the existing `hastabazaar-encrypted` data-purpose frames. It explicitly binds source database/release, observed security branch, artifact identity and schema/media/control manifests. A recorded or independently CI-supported commit is labeled by its evidence level; unknown values are never invented. It has bounded allowlisted file records, fixed-size content chunks, per-file hashes and an authenticated final manifest/completion record. Original SQL is preserved byte-for-byte; transformed restore SQL is a separate derivative.

Use the existing AES-256-GCM/scrypt frame implementation from the pinned candidate. Reject wrong purpose/type/version/target, unsafe KDF parameters, wrong passphrase, altered/reordered/truncated frames, trailing data, duplicate or escaping paths, links, unsupported files, incorrect file sizes/hashes and resource-limit violations. Extract only into a new inert private directory, mark incomplete extraction durably, and never execute SQL during extraction/authentication.

Generate strong independent backup recovery material, keep it out of receipts/chat/screenshots, and retain separately from the data package. Authenticate both the on-host package and independently downloaded off-host copy before risky operations. Proposed local custody is under the ignored operational output root, in separate `production-private-data-custody` and `production-private-recovery-custody` folders with inheritance disabled and explicit owner-only/system ACLs. Verify ACLs and Git exclusion; ignore rules are not encryption. Recovery codes and personal MFA secrets are never collected. No plaintext configuration or dump is printed or committed.

## Retain the existing rehearsal before capacity replacement

Freshly inventory `hastabaz_fee_final_20261022`, its current schema/rows/defaults/owners and references/clients. Preserve changes rather than assuming it is unchanged since staging recovery. Create and authenticate a fresh native dump and required companion material; verify its existing matching key/policy and retained media/artifact evidence without copying any of it into production recovery. Known prior material lives under the old final-host-recovery root, including `final-b-restore/extracted/media` and the separate recovery policy root `/home2/hastabaz/hastabazaar-recovery-final-security-20261022`; exact current inputs must be authenticated before retention is declared complete. Do not replay a prior staging operator or require stopping live staging to make a historical helper pass.

Before deletion, verify fresh private independent custody and present a concrete preview naming only the old rehearsal database, new database, existing production account, exact grant and empty-database character settings. Ask the owner to confirm no separate/manual workload and approve the permanent deletion/access expansion at action time. Preserve old media/policy directories and original encrypted backups through verified replacement; later redundant-generation cleanup follows the owner retention amendment below. No slot replacement occurs from design approval alone.

The proposed new-database-only privileges are SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, CREATE VIEW, SHOW VIEW, TRIGGER and LOCK TABLES. Set its defaults to the freshly captured source defaults only while it is verified empty. Reject any source/staging database target or selector/application reference to the destination.

## Isolated restore and required mappings

Authenticate the complete legacy package before preparing destination-relative SQL. Verify the destination's identity, empty schema, absence of clients/references and exact grants again immediately before import. Reject database/user/grant commands, client shell/source commands and any unexpected executable comments or cross-database references. Do not trust the connection's selected database as sufficient isolation.

Two explicit mappings are required **only in the isolated derivative**:

- Retarget the existing `clear_closed_delivery_location` trigger's single qualified `hastabaz_marketplace.delivery_assignments` reference to `hastabaz_prod_pre_20261023.delivery_assignments`. Its observed body is an AFTER UPDATE orders trigger clearing location fields for closed deliveries. Preserve and authenticate the original body in the backup. Use parsed executable identifiers and a complete expected preimage/occurrence check, not a global string replacement. Reject every other production qualifier before import and before behavioral tests.
- Map the captured `hastabaz@localhost` trigger definers to `hastabaz_marketapp@localhost` in this isolated database because the existing application account cannot assume another definer. The observed source has 56 such triggers and 91 already owned by marketapp; bind the exact named set and stop on drift. Do not change original production trigger owners or request SUPER/SET USER access.

Record original/prepared SQL hashes and every mapped trigger's before/after definition/owner. Restore all original tables/rows and prove complete native equality against explicitly transformed expected definitions, defaults, allocation and owners, plus full media/artifact/configuration equality. No application server, jobs, mail, payments, sessions or campaign actions run from the recovered copy.

## Candidate schema rehearsal

Only after the unchanged legacy restore passes, rehearse the candidate's exact additive companions: commission workspace; **only** the weekly extension section of loyalty-points; company-store-maker readiness; loyalty scheduled changes; marketplace fee waivers. Bind source bytes to candidate Git blobs and the packaged migration hashes. The weekly section replaces the existing loyalty_claim_guard, adds two guards and a derived view; record this required candidate behavior change rather than claiming every old trigger definition is unchanged. No full base/reset SQL, historical financial-policy seed or blind migration replay is allowed.

Compare every original row projected onto every original column before/after, including all financial/order/acceptance snapshots, alongside allocation/default/collation controls and all unmodified definitions. Check new definitions against the exact candidate manifest and require all structural diagnostics resolved. Preserve historical commission terms and do not run the old 9% policy seed or local-only 12% initializer. Do not create or publish fee campaigns. Focused negative regression tests must prove wrong-target refusal, SQL/trigger isolation, exact mappings, preservation, crypto completion/custody failures and cleanup of read locks/handles.

Application semantics remain a separate launch gate: production currently has zero business_setting_versions rows. The candidate requires an effective published commission setting and intentionally refuses an invented default. The recorded old source uses a 9% fallback, while the owner's earlier intended visible fee was 10%; the local-only initializer is restricted to 12% and cannot be repurposed on hosted production. This design preserves all those records unchanged and reports the missing controlled financial configuration. A separate reviewed decision must reconcile the actual legacy terms, intended new rate, notice/acceptance rules and actor/audit evidence before public sales. Schema-ready is not commerce-ready.

## Acceptance and subsequent gates

This phase passes only with independently reviewed authenticated source/custody proofs, a verified fresh backup of the former rehearsal copy, an explicitly approved isolated destination, an unchanged legacy restore, a successful exact additive rehearsal and complete original-data/media conservation. Report each result separately and retain failed/incomplete evidence.

It does not accept production deployment. Later work needs a fresh final production cutoff/backup, reviewed additive production upgrade and rollback limits, production-only security setup/private access, the owner's production Super Admin MFA ceremony, effective controlled financial configuration, post-security matching-key recovery and restart/login/health/business acceptance. Admin MFA remains optional and available. The old binary is not an assumed rollback after new accounting evidence or orders exist. Keep public customers out of any privately activated candidate until those gates pass.

## Decisions and approvals

Owner decisions: preserve existing data; reuse the rehearsal slot after verified backup; use private maintenance enrollment and pause for personal production Super Admin MFA before public launch; continue subagents with independent review.

Builder proposals requiring design approval: the distinct legacy payload using existing encryption, the fixed new destination/root, dedicated bounded read locks, exact isolated trigger mappings and phased resumption/rehearsal. Design approval permits preparing a task plan and local reviewed tools. It does not approve permanent deletion/grants, production maintenance, security initialization, financial-setting writes, source schema changes or activation; those are concrete later action boundaries.

## Owner retention amendment — 23 October 2026

The owner requested keeping only the latest updated backup and selected “Current deployment backups only”. Retain the newest authenticated, complete, recovery-verified logical set for each environment/source, including its matching recovery material and required independent on/off-host copies. Do not select by timestamp alone or remove the last verified set while a replacement is incomplete. After coverage is proved, prepare exact removal of older redundant current-deployment generations; obtain any required action-time confirmation before irreversible host cleanup. Exclude `C:/Users/abinash/Desktop/Hatskala-backups`, active application/data/release/policy files and unrelated local archives. Earlier preservation requirements apply until that safe replacement gate, not indefinite retention of redundant backups.
