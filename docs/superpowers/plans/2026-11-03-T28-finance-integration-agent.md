# T28 actual admin payout integration — 2026-11-03

The actual live payout domain now has an app caller. The existing Program Management finance workspace exposes live earned, eligible, held, reserved, paid and refund-offset totals separately from simulation history. `finance-workspace.ts` filters retained simulation payment rows/counts and supplies a separate live projection. `managed-settlement-controls.tsx` mounts the actual controls and keeps explicitly guarded simulation controls in a separate history section.

New protected route: `/api/admin/managed-makers/[id]/finance`. GET reads actual original finance; GET with only `attempt` recovers the original result; POST accepts the fixed `system.managed-live-finance` protocol with release, prepare or safe cancel. Preparation binds exact amount/digest/date/reason and derives the beneficiary on the server. There is no approve/mark-paid shortcut. Actual bank preparation, execution and uncertain-outcome reconciliation remain at `/admin/payments/payouts`.

The adapter reuses `getLiveManagedPayoutPartyAuthority` and the original entitlement-party helper supplied by the financial owner. Current/retained source interests are checked for the exact original earnings/payout, rather than blacklisting unrelated historical buyers. Recovery uses saved original source IDs, including the private native eligibility receipt IDs. Only the count is returned to the browser. The guarded database wrapper inherits the original dialect so Maria execution-clock guards retain their semantics. No new-order eligibility, current fee acceptance or current participation-route prerequisite was added to original-money access.

Client forms store only opaque attempt UUIDs through the existing recovery hook. Preparation remains mounted when its new reservation reduces availability to zero; cancellation remains mounted after a successful retirement. Recovery controls sit outside disabled mutation fieldsets. Actual source versions, reasons, balances and beneficiary data are not persisted in browser storage. Actor changes remount the actual controls; server-provided observation time supplies the preparation default.

Both `LIVE_MANAGED_FINANCE_FORM` and root's `LIVE_INVOICE_ADJUSTMENT_FORM` are registered in the adapter and definition maps of `lib/forms/registry.ts`. Root owns actual invoice route/UI integration; this slice did not edit invoice files, financial domain code, schema/source0145/0146, seller readiness or the main ledgers.

## Verification

Initial adapter tests failed for the missing actual adapter module, then passed after implementation. During shared financial-source work, the new HTTP/render tests initially stopped at the in-flight `live_customer_id` schema seam; they were rerun after its owner regenerated the coherent source, without a migration/filter bypass.

```powershell
node --import tsx --test --test-concurrency=1 tests/live-finance-adapter.test.ts tests/live-finance-api.test.ts tests/live-finance-controls-render.test.ts
```

Result: **5/5 passed**, exit 0, **24.01 s**. Covers actual earned-money workspace/protocol, role/current-and-original customer denial, exact field validation, direct mark-paid rejection, source-bound preparation/replay, safe cancellation and retained UI recovery surfaces. The eligibility recovery DTO assertion separately reproduced leaked private original IDs, then passed with an explicitly minimized result.

Subsequent narrow checks:

- `node --import tsx --test --test-concurrency=1 tests/live-finance-api.test.ts`: **2/2 passed**, exit 0, **7.38 s**, after the changed-payload/same-request assertion reproduced 503. The adapter now awaits its asynchronous preparation inside the catch and returns the known command conflict as 409.
- `node --import tsx --test --test-concurrency=1 --test-name-pattern='actual admin finance' tests/live-finance-adapter.test.ts`: **1/1 passed**, exit 0, **7.76 s**. A genuinely published new effective fee blocks new orders while the original 69,000 paisa remains payable; changing the current route also preserves original-money preparation and cancellation.

```powershell
node --import tsx --test --test-concurrency=1 tests/live-finance-browser.test.ts
```

Result: **1/1 passed**, exit 0, **9.23 s**. Owned hidden Chrome, actual component and actual protected route, fictional memory sources and every network request intercepted. Preparation and safe cancellation each commit before a deliberately lost acknowledgement, then recover after reload. Exactly one actual payout remains, with no transfer packet or outgoing bank identity, no duplicate action POSTs, UUID-only session storage and empty local storage. No direct payment-execution control exists. Page identity and runtime-error checks passed.

Screenshot inspected: [.test-artifacts/t28/live-finance-recovery.png](../../../.test-artifacts/t28/live-finance-recovery.png). It demonstrates recovered cancellation, released availability and the protected execution link in the isolated unstyled harness; it is not production CSS/responsive visual QA.

Tracked scoped `git diff --check` passed. No canonical database/server, actual bank/mail service, deployment or T29 production change occurred. No adapter-specific native run is claimed; the financial owner retains native party/execution verification, and root owns final global typecheck/review. All heavy/browser/native slots were released immediately after the browser run.

## Handoff hashes

| File | SHA-256 |
| --- | --- |
| `.test-artifacts/t28/live-finance-recovery.png` | `D4A1EB37772AB14B359D2ACE33AAA721DD13CD25B6ADC90E754143EF673AF2CD` |
| `lib/managed-commerce/live-finance-api.ts` | `EAC8F83F2E4802A002AEBF730F90AB4DA547F564DDFCE4525B2ABDD804BD61ED` |
| `components/admin/live-managed-finance-controls.tsx` | `EA67ABCD1DF88900B0631DEE3EB70278040A4CD04C71D5D073C7FD724A922103` |
