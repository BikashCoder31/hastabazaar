# T03 active native form replay overlay

This is a local-only follow-up to the exact seven-editor / 57-native-task transition. It does not activate the rider application or portal and does not change the existing public hold.

## Inspected change

Six active rider replay lookups, the company preparation and staff fulfillment replay lookups, and the reports receiver's matching replay lookup now use the shared, explicitly aliased `formAnswerSourceSql` derived source. This recognizes actual immutable native core answer audit receipts alongside original published answer rows. All original actor, native source, version, digest, permission and transaction predicates remain in place. Rider application and rider OTP verification remain untouched.

## Evidence

- The initial real rider core commands saved successfully and their exact retries failed before this change: `.test-artifacts/t03-followup/rider-fulfillment-native-red.tap`.
- Initial company preparation and staff dispatch setup failures were not treated as replay evidence. The fixtures were corrected to actual confirmed/unpaid COD preparation and a genuine fictional manual consignment reference. The resulting second-call replay failures are retained separately in `fulfillment-native-meaningful-red.tap` and `staff-fulfillment-native-red.tap`.
- `node --import tsx --test --test-concurrency=1 tests/native-rider-fulfillment-replay.test.ts tests/native-rider-route-hold.test.ts`: **10/10, zero skips, exit 0**, 33.078 seconds; `rider-fulfillment-replay-final.tap`.
- The actual held reports API returns **503 / rider_program_on_hold** before authentication, database or media access. Its production availability module is not stubbed. The native repository fixtures represent retained historical operational sources; remittance remains a pending claim and creates no incoming company receipt.
- Three retained published-form rider cases pass after the small fixture explicitly loads the actual two form-health columns from migration 0151: **3/3, exit 0**, `rider-retained-published-current.tap`. No published answers or validation guards were removed.
- Coverage includes exact retries, wrong actor/source/origin/digest, current authority loss at commit, company preparation, staff dispatch and rollback of decision plus core receipt. A first negative changed an unused policy `note`; this was corrected to change the actual policy `otpScope`, without changing runtime behavior.

## Separate native preparation

The new actual-command publication preparation exposed a shared seller profile core-replay subject mapping defect and reported it to the shared-form owner. That owner is fixing only the known `seller_profile` command / `seller` core-receipt relationship while preserving all other identity/digest guards. The optional registration preparation now passes with explicitly declared original verified-email fixture evidence; no seller role is granted.

`scripts/test-t03-core-forms-mariadb.mjs` and `scripts/t03-core-form-native-runtime.mjs` perform a fresh-namespace native rehearsal using the verified local portable binary. The concurrency seam pauses after a real native GET_LOCK succeeds, requires a distinct second physical connection and an actual server-reported user-lock wait, then proves both core-first and first-publication-first outcomes. The runner preserves source hashes and authenticated shutdown evidence. Actual execution and outcomes are recorded below separately from preparation.

No canonical data, reset artifact, real provider, deployment or live seller activation was used.

## Actual native rehearsal

The first attempt imported the full native schema and shut down through authenticated shutdown (PID 30676). Its new harness then copied the wrong cleanup filename and obscured the primary runtime return; **no native domain pass or failure is inferred from that attempt**. The exact failed harness log is `native-core-forms-mw1osac6_4b8d-evidence-writer-red.log`, and its actual shutdown proof is retained alongside it. The harness now persists the primary runtime result before copying the actual `last-shutdown.json`, verifies the exact owned PID, and records safe phase markers.

The corrected fresh-namespace repeat **passed, exit 0**:

- Result: `.test-artifacts/t03-followup/native-core-forms-mw1oxr7j_faa5.json`.
- New namespace: `fixture_815db40e_t03f_mw1oxr7j_faa5`, MariaDB 10.11.19, all **1758** candidate-v5 statements; exact schema SHA `27b50a85e8afd035565a238fb15f0e6a1411b0c8293f403930ad914e8a75ad56`.
- The actual Node pool and native policy command save and replay core receipts through the shared UNION source; changed actor, digest and form origin are rejected. No native-task publication is fabricated.
- Core-first and publisher-first races both prove **distinct physical connections**, a real acquired `GET_LOCK`, an actual server `PROCESSLIST` user-lock wait, and eventual lock release. The first command is paused only after the real server grants its lock; no SQL result, guard or transaction is mocked.
- When the profile core command wins, it saves before the genuine first publication, and the exact original core command remains recoverable afterward. A new command must supply the required published extension. Both original core and published answer history remain readable with their original origins.
- When first publication wins, the prevalidated optional application core command rejects; native seller profile, intake, domain audit, core answer and seller-role writes all remain absent after rollback. The account's verified email is an explicit original fictional fixture fact, never a submitted answer or a claimed provider call.
- Original orders, order items, seller ledger and payout rows remain identical. The actual rider program stays held and no seller is activated.
- The result contains source hashes checked unchanged at the end, including the shared core marker, subject mapping, current-version guards and Node adapter. This is a separate post-v5 **runtime overlay**; the earlier T33 v5 proof is not claimed to have exercised these new seams.
- Exact shutdown proof: `native-core-forms-mw1oxr7j_faa5-shutdown.json`; **PID 31832**, authenticated shutdown true, stopped true, forced stop false. Its OS process absence was independently checked. No fixture server, pool, browser or worker remains.

The actual-command preparation also passes **2/2, zero skips, exit 0**, 6.804 seconds: `native-form-publication-preparation-current.tap`. The shared-form owner fixed the demonstrated known profile parent mapping with actual actor/parent/action/digest negatives; no authority was widened by this slice.

## Final active reader overlay

A later complete-reader inventory found two additional physical-only reads: the native courier assignment retry and the report/remittance history existence check. Three actual-command cases reproduced the failures: the courier save succeeded but its exact retry rejected; report and pending remittance saves succeeded but disappeared from their own native history. The exact **3/3 RED** is `delivery-rider-history-native-red.tap`.

The courier replay now uses the same explicitly aliased shared source. Rider history selects that source **only for report and remittance**; application and code-verification history retain their physical published-answer source. The corresponding actual tests prove original actor/order/digest/origin, owner-only history, staff history discovery, unchanged inactive application history, and no incoming company payment from a pending remittance. **3/3 GREEN, zero skips, exit 0**, 10.855 seconds: `delivery-rider-history-native-green.tap`.

The full current owned replay/history plus actual production-hold aggregate then passes **13/13, zero skips, exit 0**, 35.008 seconds: `rider-fulfillment-history-final.tap`. These two consumer changes are explicitly **after** the actual Maria proof. The shared UNION and lock implementation exercised by that proof is unchanged; the proof is not retroactively claimed to have run these later two consumer queries.
