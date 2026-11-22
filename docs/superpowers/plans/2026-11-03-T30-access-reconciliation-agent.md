# T30 access-change coverage reconciliation — 2026-11-03

Canonical checkout only. No canonical database, environment file, app launcher, real transport or deployment is used. SQLite source 0149 remains frozen at SHA256 `36b262faaf3e152504c058cbbf5fd74330b958b9fd6496c6520c41808055c340`.

## Implementation and authority

`team-access-impact.ts` writes one visible `access_change` obligation and native per-source internal `access_reconciliation` journals in the **same original transaction** as a direct grant change, approval of a historical pending grant, or offboarding. Each child retains the full original task ID, source identity/revision, started/due times, calendar, former owner, and original decision reference. Affected duty versions are captured separately. Snapshot insertion precedes shared-owner clearing and offboarding role deletion. Revocation never waits for source reassignment to succeed.

There is no aggregate JSON array, GROUP_CONCAT/JSON_ARRAYAGG limit, bounded-list truncation or concatenated opaque ID. Each generated child ID and source ID is 32 ASCII bytes: SQLite `lower(hex(randomblob(16)))`, MariaDB `REPLACE(UUID(),'-','')`. Full original IDs remain in each immutable JSON reference. The existing 0149 source-reference/clock trigger protects these facts. No DDL changed.

`team-access-reconciliation.ts` uses an existing 0147 cursor row, a 30-second lease, bounded keyset pages, a wall deadline, and a checkpoint after **each** source, including failures and final-guard races. Open gaps remain pending and are revisited after wraparound. A source-specific failure cannot keep later sources behind it. A failed final completion guard retries only the lease/checkpoint batch, leaving the child open. Root completes only after no original child remains open.

Direct/legacy grant saves and offboarding call a best-effort 1.5-second/10-source postcommit pass. Root owns the independent fair `team_access` step in the common bounded scheduler, providing durable later retry after a failed request-time pass. The original save remains successful if maintenance fails. No actor is impersonated, and no role is restored by the worker.

Source reassignment delegates to the shared `reconcileReviewTaskCoverage` implementation owned by the incident/review-task agent, with the immutable original source/clock snapshot. That adapter owns fresh native source/party/permission/availability checks, source/task CAS, native owner synchronization and common handoff notices. Duty resolution uses actual code-owned Team coverage and its final guards. Internal children are excluded by the Team owner from human task production; public source projection and policy completion reject them. Only the single root obligation is a human access-change follow-up.

## RED and focused memory evidence

All cases allocate the inspected `completeVersionFixture` in fresh SQLite `:memory:`. No canonical data is copied or modified.

- Initial RED: grant save had zero of three required retained original source snapshots. After implementation, the forced postcommit outage case passed: the grant remains revoked, all three full original source/clock snapshots persist, shared owner metadata is immediately cleared, and the root obligation remains open.
- Final source-guard race RED threw before cursor progress. After fallback checkpoint implementation, the race and outage cases passed 2/2, total 9,108.028 ms.
- Historical approval plus 125-source fanout/internal-child cases passed 2/2, total 8,144.397 ms. All 125 original task snapshots plus one duty survive. A 190-byte opaque task ID is retained exactly; generated keys stay 32 bytes. Public task projection and manual policy completion reject internal children, and the normal Team producer generates no child review tasks.
- Existing `tests/staff-permissions.test.ts` passed 8/8, total 1,135.836 ms. Its isolated fixture now loads real 0080/0147/0149 sources rather than bypassing the new hook. Its historical audit table now has the actual primary key required by 0149's native-source FK; temporary diagnostic logging was removed.

The final aggregate exposed an additional actual adapter defect: a stable journal request key reused an earlier no-cover receipt after a backup became available, returned `settled` without writing the new owner, and would have allowed false journal completion. The adapter owner repaired the transition identity with the current task revision, proved actual current ownership on replay, and avoided new NULL-to-NULL receipt/notice transitions. The actual offboarding/availability-return case now requires the native/shared owner write before completion.

Final memory command:

```text
node --import tsx --test tests/team-access-reconciliation.test.ts tests/team-access-impact.test.ts tests/staff-permissions.test.ts
```

Initial full result: **15/15 passed**, exit 0, total 17,651.702 ms. This includes all six original journal/recovery cases, the retained offboarding/last-Super-Admin case and eight permission cases.

The final approved producer work adds one same-transaction `access_changed` native Team event, current marker and common outbox for direct/applied and historical/approved grant changes. It replaces the legacy `permissions.changed` producer rather than sending duplicate event families. The helper runs after the original approved request/claim but **before** the exact profile update: the common notification factory snapshots current profile JSON, and its guard therefore matches at insertion. The later exact profile-version guard still determines all-or-nothing commit. Current authority is rechecked again before delivery. Offboarding keeps its existing outer Team event and emits no duplicate helper event. No private reason/grant list is copied into the notification body.

Actual producer RED progressed from no native access event to two rather than four copies, exposing the Team source's reserved-duty personal-recipient issue. After the Team owner's narrow fix, exact replay remains four copies (subject and Super Admin, each in-app/email), and a later grant makes every old queued copy noncurrent. The legacy approval also proves four actual common copies. A further actual source-boundary case excludes a roster-eligible Super Admin who is the original product seller, while preserving a later lawful current assignee.

Final expanded aggregate: **17/17 passed**, exit 0, total 25,724.534 ms. A subsequent targeted legacy-approval check with the added four-copy assertion passed 1/1, total 4,411.060 ms. Root's absence/active-handoff source changes were ready before this aggregate.

## Native runtime attempts and final result

Runner: `scripts/test-t30-access-mariadb.mjs`, against the existing verified official 10.11.19 portable fixture `fixture-20261103032129-d7804952`. It imports the exact frozen 1736-statement candidate into a newly created owned database each run, seeds 125 fictional actual product review sources, and uses the real `node-bindings` D1 adapter through the helper's already authenticated, identity-verified connection. It cannot create a pool toward an external or canonical database. Frozen schema SHA256: `f7f6bafc9d767c817b119b2ee10f9c9a2db35edf4240ef81515cd30163fb5f0f`.

The first native attempt exposed a **fixture** transport mismatch: the owned raw mysql connection parsed MariaDB extended JSON metadata to objects, while the real adapter requests `jsonStrings:true`. The runner now honors that exact requested driver option; installed mysql2 text/binary parser and cache sources were inspected. No application adapter was weakened. Evidence `.test-artifacts/t30/access-mariadb-1793706057221.json`; PID 22908 authenticated shutdown, no force, stopped 11:45:38.125Z.

The corrected attempt imported and seeded successfully, then exposed a **production** MariaDB syntax error in the new Team notice path: unquoted reserved alias `procedure` in `team-notice-sources.ts`. The actual journal/outbox batch failed rather than committing a partial grant-related journal. This was reported to the Team owner for a safe alias rename, with all guards retained. Evidence `.test-artifacts/t30/access-mariadb-1793707144825.json`; PID 11940 authenticated shutdown, no force, stopped 12:01:31.072Z.

An actual tiny native parser test also rejected the unquoted `AS cursor` alias with `ER_PARSE_ERROR`, then accepted the exact query with ``AS `cursor` ``. Per root authorization, the alias was quoted in the access worker and both Team dispatchers. Evidence `.test-artifacts/t30/access-cursor-parser.json`; PID 28504 authenticated stopped, no force, 12:05:32.898Z. After both alias repairs the actual access suite passed 8/8, exit 0, total 23,514.375 ms.

The next native attempt then exposed a genuine historical generated-schema gap: `notification_messages` lacked the canonical 0033 `business_event_key` field (and related queue fields), so the common outbox INSERT failed. Evidence `.test-artifacts/t30/access-mariadb-1793707632567.json`; PID 34636 authenticated stopped, no force, 12:11:34.373Z. No fixture-only ALTER was used to pretend this candidate passed.

## Canonical 0033/0035 outbox parity repair

Root transferred this narrow ORM and source-asset repair. `db/schema.ts` now records all six original 0033 fields/defaults, both0035 guest fields, nullable `recipient_user_id`, the original recipient-shape constraint and canonical retry/lease index. No new SQLite migration is necessary: the original canonical migrations already establish this contract.

`lib/operations/notification-schema.mjs` derives `deployment/babal/mariadb-notification-runtime-compatibility.sql` directly from the actual0033/0035 source. The catchup is additive: it retains the existing table, rows and foreign key, adds missing fields/defaults and changes recipient nullability. Strict BEFORE INSERT and UPDATE triggers preserve the original recipient predicate without introducing MariaDB CHECK/FK referential-action incompatibilities. Native role/channel comparisons use BINARY to preserve SQLite's exact case and trailing-space behavior. It never replaces a table, truncates/deletes rows, rewrites delivery history or changes private payloads.

`tests/t30-outbox-schema-parity.test.ts` reproduced both absent0033 fields and incorrect nonnullable0035 recipient metadata before repair. Final 2/2 passed, exit 0, 1,822.057 ms. It executes the actual canonical 0035 CREATE in fresh SQLite memory: registered and guest shapes pass; missing fields, wrong audience/channel, uppercase and trailing-space variants fail on insert; an invalid guest update fails. The original nonNULL empty-string structural shape remains allowed, as the original constraint requires; actual delivery eligibility remains the responsibility of the existing protected producers/consumer.

Native helper `scripts/t30-notification-runtime-constraints.mjs` is frozen for root's new candidate proof: actual eight-column/default/index inspection, registered/guest positives, ten invalid inserts, six invalid updates, retained FK rejection, and whole historical-row equality after idempotent catchup reapplication. Root owns generator append/publication and the new ownership candidate, with the catchup after the verified 151 prefix and before 152. The access runner now accepts that candidate/freeze and also prepares the requested actual supported-command case-variant party negative. Final native PASS/source hashes remain pending root's candidate proof and explicit native-slot release.

Root's first new-candidate import caught my generated provenance comments `--0033`/`--0035`, which MariaDB interprets as SQL without whitespace after the dashes. The generator now emits `-- 0033`/`-- 0035`; a source regression check reproduced the old failure and now rejects any generated `--` immediately followed by a nonwhitespace character. Final source parity2/2 passed, exit0,1,380.429ms. Corrected frozen asset SHA256 `f7ec41523842c5828a8fdb339486a3cb4fc1bf095087245d80ade4b692fc68a5`. The earlier `ffce3f...` artifact is superseded, not a native PASS. Root retains its failed import artifact `.test-artifacts/t30/ownership-maria-candidate/native-mw0nxw0d_17f4af.json`.

## Combined native orchestration handoff

Root now owns one combined152/guest/access native run on a single authenticated fresh fixture. `scripts/t30-access-runtime.mjs` exports `verifyT30AccessRuntime(fixture)`; the standalone `scripts/test-t30-access-mariadb.mjs` wrapper invokes the exact same helper after its own owned import and guest check. The shared helper creates no server, database, schema, socket or real mysql pool. The adapter factory can return only the existing authenticated owned connection; temporary driver/environment settings are restored in `finally`. It verifies selected database identity and captures module-load runtime hashes, rechecking them at call start and successful completion.

The supported save_duty case-variant seller-party negative and the separate hostile persisted-profile case race run **before** bulk125 work. Both have real valid-command controls and independent fictional task/actor namespaces. The profile case is explicitly hostile fixture state, not a claim that the public grant validator accepts uppercase permissions. Both concrete negative outcomes are collected before an AggregateError; neither is converted into PASS, and failed cases retain diagnostic evidence rather than resetting source facts. On success, the helper proceeds to native same-batch grant/journal/outbox capture and bounded rerouting of all125 original sources, with original clocks and190-byte task identity retained. Root will append the actual native result after running it; no native PASS is claimed here.

## Confirmed native identity/profile defects and narrow authority repair

Root's combined fresh SQL proof passed **1,752 statements / 357 tables**, including the catchup/152 native constraints. Actual schema evidence is `.test-artifacts/t30/ownership-maria-candidate/schema-native-mw0onqnv_4bb610.json`, with a separate `freeze.json`. Runtime setup initially collided with the priority fixture's `Local / FIX-REG` unique seller identity; only fictional access fixture registration/tax/bank values were namespaced, preserving the actual unique constraints. This setup failure is not an application defect.

Root then explicitly authorized a diagnostic run on that already verified owned fictional schema, after proving zero `access-*` users from the rolled-back setup. This diagnostic is **not** the final fresh acceptance rehearsal. It confirmed both actual runtime defects in `.test-artifacts/t30/access-retained-diagnostic-1793710535091.json`:

- Supported `save_duty` accepted a case-variant canonical seller ID under native CI lookup/FK semantics, then source-party JS equality failed to exclude that spelling. `caseVariantPartyExcluded=false`.
- The actual ordinary guarded assignment reached the injected precommit profile race (`raced=true`), then a case-only invalid persisted permission profile passed native CI snapshot equality and a receipt committed. `profileCaseRejected=false`. The public grant validator does not accept that uppercase profile; this is the explicitly labelled hostile persisted-profile race.

Root assigned the narrow shared repair in `lib/db/repositories/staff-mutation-guard.ts`. It now selects the canonical `users.id` and rejects a nonexact requested identity before granting any actor/candidate authority. Read and commit status/role comparisons, commit user identity and explicit permission-profile comparisons use native BINARY; SQLite uses explicit COLLATE BINARY, retaining its original exact semantics. The absent-profile branch still detects a newly inserted explicit profile instead of restoring legacy authority. There is no new grant, roster rewrite, policy permission or schema change.

`tests/staff-mutation-guard.test.ts` uses fresh SQLite memory with NOCASE columns to reproduce the verified native collation hazard, while executing the real helper and canonical0031 guard CHECK. Initial RED was4/5 failing (ID alias, profile case, role case, account status); after repair5/5 pass. The transaction cases prove complete rollback of a marker mutation, not merely a new SQL string. Existing legacy absence and explicit empty/invalid-profile semantics remain covered.

Scoped nine-file staff/Team/access aggregate passed **38/38**, exit0, total32,257.041ms; artifact `.test-artifacts/t30/staff-exact-authority.tap`. Root must still run the final **fresh** combined native acceptance rehearsal against the frozen repair. The retained diagnostic's failures and the separate schema PASS must not be described as combined runtime PASS.

Root's independent follow-up requested retaining the original indexed user lookup before its exact residual. The guard now uses `u.id=? AND` the exact identity comparison, binding the same actor twice. A real SQLite EXPLAIN QUERY PLAN regression first reproduced `SCAN r`; after the change the canonical user index is searched before scanning roles. Only the five focused guard tests were rerun, all5/5 passed, exit0,445.783ms; the earlier38-case semantic aggregate remains recorded above. Final frozen guard SHA256 `566df358d9425ae6ffe16d0dba8a184e577a78fb7a38392b5089ba8112abbf3c`. No further runtime edits are authorized during root's fresh rehearsal.

### Final fresh acceptance, after the retained diagnostic

Root ran the final fresh combined rehearsal and reported exit0. Its actual retained artifact `.test-artifacts/t30/ownership-maria-candidate/native-mw0pchi2_562389.json` was subsequently read: status PASS,1752 imported statements,357 tables/views,46 actual system-ownership checks,10 guest negative inserts +6 negative updates +1 FK rejection, and unchanged retained notification history. The actual access adapter proof reports125 original tasks,126 internal children,128 bounded scans, original clocks retained, caseVariantRejected=true, caseVariantPartyExcluded=true, profileCaseRejected=true and immutable reference rejection. Runtime hashes include the exact frozen shared guard above and the same `5333d5a3…c42` exported access helper. This is fresh combined acceptance; the earlier diagnostic failures remain genuine RED evidence.

Root confirmed authenticated shutdown of owned PID16092 with no force, final D1/Team/incident browser4/4 and closure typecheck exit0. T30 was then closed locally; preflight STOP89/107 was left untouched. No live database, real transport, migration/reset execution, merge or deployment is authorized or claimed by this result.
