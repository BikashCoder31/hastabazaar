# T34 commerce-form fixture regression correction

Scope is the authoritative `C:/Users/abinash/Desktop/HastaBazaar` checkout only. Owned implementation files are `tests/form-catalog-commerce.test.ts` and `tests/form-catalog-commerce-success.test.ts`. This note and `.test-artifacts/t34/commerce-form-fixture-sol-20261104/` retain bounded evidence. Root owns the global ledgers and serialized heavy slot.

No application/runtime or shared-helper edit, Git mutation, canonical database read/write, seed/migration/reset/restore, launcher bypass, seller activation/approval, live mail/money, remote/deployment operation, Chrome, native D1, MariaDB, lint, compiler or release build was performed by this worker. All SQL setup was confined to the existing `DatabaseSync(':memory:')` fixture. The approved current core-form/history, payment, actor-intent and read-only authentication contracts remain unchanged.

Read AGENTS.md, LOCAL-START.md, the current implementation-progress checkpoints and preceding COD fixture triage; approved Form Management reliability, Orders/customer-care and manual-payment specifications; current T31 checkout/care evidence; actual catalogue/readiness, payment capabilities, checkout route, order/aftercare components and existing fictional checkout evidence helper.

## Original evidence and root cause

Original full-suite cases1286,1305,1307,1310,1311 are copied without modifying the original running log into `original-suite-failures.tap` (five blocks). Before-source copies, owned-only diffs and a source/dependency/migration SHA256 manifest are retained separately from pre-existing dirty changes.

- Both mounted CheckoutForm fixtures omitted `paymentCapabilities`. The actual component correctly defaults to both methods unavailable/unknown, so a COD submission fixture never becomes enabled. Explicit fictional `{cod:true,manual_bank:false,state:'ready'}` now accompanies the intended successful mocked cart/contacts. The product default and all existing unavailable-capability cases remain untouched.
- The isolated repository/route fixture lacked actual verified seller identity/tax evidence. All migrations were already applied; the actual0083/0084 insert triggers already create protected revision and public-profile records. The broader earlier triage is narrowed accordingly: no duplicate hand-created readiness rows are needed. The existing `readyCheckoutSeller` verifies pending fictional representative identity and PAN evidence through actual `verifySellerDocument`, with the distinct fictional Super Admin reviewer, then retains the exact owner's original commission acceptance. It replaces the obsolete partial agreement-column update in the three checkout cases. No fabricated query response or relaxed catalogue guard is used.
- CustomerAftercare now imports next/link. Its isolated bundle stubbed only navigation; it now calls the existing `stubFixtureLink` helper to preserve real anchor semantics. Actual component imports remain unchanged.

The exact original checkout-only memory command used `--test-name-pattern='^(checkout answer joins|versioned checkout route)'`. RED was0/2,0skip,17.054s: cart availability conflict and route503. After actual fictional readiness the same two cases passed2/2,0skip, exit0,14.665s (`checkout-after-readiness.tap`).

## Preserved and strengthened contracts

Existing custom answer ownership/privacy, exact parent links, version/publication checks, malformed-success rejection, native duplicate replay, changed input rejection, evidence byte/name/type/size binding, zero-row rollback and seller ownership assertions remain. Current native actor-intent/read-only authentication receivers are not replaced or weakened.

The checkout answer test additionally asserts the literal historical100,000 merchandise +15,000 delivery +0 buyer service fee =115,000 paisa total, exactly one new order/answer, one additional unit reserved, and unchanged12,000-paisa original delivered-item commission. Initial fixture stock10 has already become9 through the actual0088 trigger when the original delivered item is inserted; the new checkout becomes8 and every exact/conflicting replay leaves8. My first added assertion incorrectly expected9 after checkout; `memory-current.tap` retains that20/21 result. Source/trigger inspection established the original item decrement, and explicit pre9/post8 assertions correct only that arithmetic mistake.

No new injected race is claimed. The selected real memory tests reach native transactions, exact/changed replays, invalid answer snapshots and zero-row insert triggers; these do not substitute for native D1/Maria or a new cross-connection race.

## Verification boundary

The positive anchored name pattern selects exactly21 memory tests and excludes every five Chromium-launching client test in this file; the seven dynamically generated success-mode browser tests are not included. `memory-selection.json` records every selected/excluded name and an inspected assertion that no selected body launches Chromium.

Final current-source memory rerun: **21/21,0fail,0skip, exit0,111.504s**, `memory-final.tap` and `memory-final.exit.txt`. The complete exact argv is retained in `commands.json`; no selected case launched a browser. This final run includes the explicit pre9/post8 stock proof and all original selected assertions.

All12 mounted cases remain queued behind root's serialized heavy slot: five client cases in `form-catalog-commerce.test.ts` and all seven modes in `form-catalog-commerce-success.test.ts`. Browser-only command after slot authorization:

```powershell
node --import tsx --test --test-concurrency=1 --test-name-pattern='^(gift form renders|invalid gift code|aftercare client|checkout client|seller case response client|commerce\.|seller\.case-)' tests/form-catalog-commerce.test.ts tests/form-catalog-commerce-success.test.ts
```

The actual aftercare bundle resolution, checkout submission/retained-input behavior and malformed-success browser acceptance are not claimed from static edits. Global lint/typecheck/build and full-suite verdict belong to root; no full-suite pass or all20-workstream completion is claimed here. The original full npm log retains its original failures even after focused repairs.
