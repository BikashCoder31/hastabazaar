# T28 financial implementation evidence

Scope: canonical source checkout only. No canonical database migration, seed, reset, restore, deployment, real seller action, email or payment. Test data is disposable fictional memory/D1 (`d1Persist:false`). T28 is not complete merely because this slice passes.

## Contracts and implemented source

- `live-snapshots.ts`: positive server-read original activation/clearance/financial scope plus CURRENT genuine accepted detail. Original accepted integer economics and language remain; old activation fee audit pointer is not renewed acceptance. Fixed live remains blocked.
- `live-billing.ts`: explicit independently reviewed `company_commercial_invoice_v1`, `taxDocument:false`, supported declared PAN commercial format only. Company identity is checked against the current actual accepted-offer company source; PAN/code version does not establish clearance. Actual approved prefix/version/opening sequence is independent of simulation numbering. One canonical managed invoice artifact; original customer-owned read and exact paid-refund/cancellation credits use its original identity/series.
- `live-payout-operations.ts`: original live-only positive/negative positions, paid deductions, reservations, exact preview, verified current beneficiary, eligible SA and current/retained original personal-interest checks. Separate release/preparation/retirement; execution uses existing manual bank packet, actual funding and uncertain outcome controls.
- Existing simulation preparation/summary/release filters simulation originals. Actual managed transfer dispatch derives kind from native DB source, not a caller or environment flag. Registered execution remains separate; fixed and simulation execution retain simulation guards.
- Recovery payout policy scopes financial debt to positively live originals for actual payouts while preserving current identity/bank/capability holds. Recovery earnings candidate selection also requires the original case cohort.

## Source0146 preservation treatment

Authoritative generator: `scripts/generate-managed-live-financial-source.ts`; SQLite `drizzle/0146_managed_live_financial.sql`; Maria parity `deployment/babal/mariadb-managed-live-financial.sql`.

Existing table identities remain. For each affected simulation-label column, a temporary preservation column retains its exact old bytes, then only the label column is dropped/re-added nullable and restored. Relevant immutable triggers are removed only inside the reviewed transition and restored verbatim. Every existing row receives explicit `record_kind='simulation'`; NULL alone never proves live. Native kind/proof guards reject mixed financial allocation and preserve original live source. No parent table drop or FK disable is used.

## Observed checks so far

- Snapshot economics/proof: red missing module, then 2/2 green.
- Explicit financial scope/model/series readiness: red missing module, then 1/1 green; mismatched company issuer and unsupported format rejected.
- Isolated real managed-DDL populated preservation: 1/1 green; original labels/rows/child references/indexes/immutable protections retained.
- Actual live isolation: 3/3 green, including historical simulated paid-refund recovery remaining unchanged while excluded from actual readiness. Native forged live header initially accepted (red), then rejected by source cap guard (green).
- Existing simulation/native execution regression plus snapshot/preservation: 21/21 green (55.87s).
- Native D1 populated pre0146→0146: 1/1 green, exit0, test30.58s/process32.91s. All actual original table rows, generated fields, exact original triggers, FKcheck0 and labels retained. Initial failed assertion was SELECT*/table_info generated-column projection mismatch in the test, corrected to table_xinfo on both sides; source was unchanged for that correction.

## Actual source and money lifecycle

Actual fixtures use genuine activation/clearance, public offer/cart checkout, original order insertion, company preparation, parcel delivery/customer COD collection, native entitlement, manual maker bank packet, actual paid customer refund, original invoice credit and owned recovery. They do not insert simulated labels into actual records or bypass activation capabilities. Original rate/terms survive a new-order fee hold; historical payout/refund/recovery proceeds from original immutable provenance. Fixed live remains blocked.

- Actual canonical order/invoice integration passes, with one invoice/number. The actual payment receipt references that same canonical invoice and creates no second billing receipt number audit.
- Actual lifecycle/visible summary 2/2 green: eligible → reserved → paid → actual refund offset; original seven-day held earnings remain visible and unavailable. Actual money and simulationHistory are separate in owner earnings/application/readiness.
- Real commit-time identity/bank expiry reproductions initially permitted new native/transfer preparation (red); DB-time guards fix native prepare, transfer prepare/approve/start, while already-sent paid outcome and replay remain allowed. Focused expiry suite 9/9 green.
- Mixed-cohort memory/native checks preserve the older simulated approved plan/dispute unchanged while applying exactly 69,000 actual future earnings. Native cross-cohort withholding is rejected atomically in both directions; candidate selection is cohort-bound. Final bidirectional memory suite passes 2/2 (14.15s): genuinely older approved live plan/dispute cannot reduce or queue the later simulation case, which nets the full 69,000 from a separate explicitly retained simulated future earning; the older actual case and actual future earning remain unchanged. Source-case chronology is created through genuine case transitions, not rewritten. Artifact: .test-artifacts/t28/cohort-bidirectional-final.tap. No current new-order activation gate is added to original historical obligations.
- Independent original parties are selected from exact original earnings. Immutable live_customer_id preserves the original buyer beside the current order customer, current maker owner and retained activation owner. Runtime and native bank approval reject an original buyer who also becomes Super Admin after order metadata correction. Payout/release saved-outcome authorization retains exact original selected IDs privately.
- Recovery source originalCustomerId also reads immutable live buyer. A first-case-opening regression after customer correction reproduced Missing expected rejection, then passed with current and retained case/customer checks preserved. Focused party/lifecycle memory 5/5 green.

## Final native source checkpoint

Serialized command: node --import tsx --test --test-concurrency=1 tests/live-maker-order-native.test.ts tests/managed-live-financial-native.test.ts tests/managed-live-schema-preservation.test.ts tests/managed-live-money-native.test.ts tests/managed-live-payout-parties.test.ts

Observed exit 0; 8/8 passed; 136.21 seconds. Artifact: .test-artifacts/t28/financial-native-final.tap. This covers actual same-intent concurrent public checkout (including immutable buyer), populated full pre0146→0146 nonpersistent D1 transition, original rows/generated fields/FKs/triggers/labels, actual native payout/refund/original invoice credit, native retained-buyer approval denial and first recovery opening denial, native mixed-cohort netting, and minimal-DDL preservation. Every original native trigger is restored before tested operations. Historical simulation buyer fields remain NULL rather than inventing old facts.

Source0146 Maria uses explicit distinct names for activation, clearance, financial-scope and immutable-customer FKs; exact targets/types/nullability remain. This fixes the independently observed Maria implicit ALTER-FK-name collision without changing financial policy. Earlier candidate artifacts are preserved under .test-artifacts/t28/0146-before-selected-parties.*.

Frozen SHA256:

- generator: 3A7B6FC1ECC36193633C0F61793EC650F666058DC468264315660FA12753DF8E
- SQLite: 9826A657EF7BA004D0C9CE5BE7932A7F783E0BE89E0B4962C0514880B6CFC82F
- Maria parity: EA68216330E9F360A626927E114253DD482B5DAA8E83DC3D8169BECFF0CE8C0A

Parent coordinates final combined typecheck, independent review and frozen full Maria import. This financial slice does not claim canonical migration or production readiness; no canonical/live database or payment was touched.

