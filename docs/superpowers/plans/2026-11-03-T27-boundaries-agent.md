# T27 identity and earnings priority boundary evidence

Canonical target: `C:/Users/abinash/Desktop/HastaBazaar`. This evidence covers a focused T27 slice; it does not mark T27 complete.

Controlling requirements: part 5 T27, refund-recovery specification section 7A (same legal seller/model/currency, explicit accepted authority, oldest eligible approved recovery, bounded shared earnings), and the single-Super-Admin amendment (retain personal-interest exclusions while allowing one eligible operator).

## Reproduced defects and narrow fixes

- The existing boundary test changed the original order customer to the acting reviewer between the source read and the atomic batch. Netting incorrectly succeeded. `nativeSourceGuards` now checks the current original customer against the read snapshot, including a portable null-safe comparison, within the same money batch.
- A cash-only approved older fixed-supplier recovery incorrectly blocked a later explicitly accepted earnings arrangement. The shared `oldest` SQL expression now requires the older case's NPR plan to reference its matching seller-authorized proposal, current legal owner and protected identity revision. The same expression runs before execution and in the atomic batch; eligible older plans still consume the shared pool first.
- No schema change or migration generation is required for these two application guards. The existing schema has no duplicate oldest-case priority expression.

## Verification

All fixtures inspected are fictional SQLite `:memory:` databases; their database-list assertions remain enabled. No canonical database or configuration was opened or changed.

1. Before fixes: `node --import tsx --test --test-concurrency=1 tests/recovery-identity-priority-boundaries.test.ts` — **6 passed, 2 failed**, precisely the customer write-boundary race and cash-only older-case priority defect.
2. After fixes: `node --import tsx --test --test-concurrency=1 tests/recovery-identity-priority-boundaries.test.ts tests/recovery-workspace.test.ts tests/recovery-command-contract.test.ts tests/recovery-allocation-cap.test.ts tests/recovery-agreement-netting.test.ts tests/recovery-model-netting.test.ts tests/recovery-protected-netting.test.ts tests/recovery-liability-correction.test.ts` — **41 passed, 0 failed**.
3. Added missing isolation assertions and reran `node --import tsx --test --test-concurrency=1 tests/recovery-identity-priority-boundaries.test.ts` — **10 passed, 0 failed**. These additionally verify that another legal seller's registered earnings remain untouched, a non-NPR proposal is rejected by the retained currency constraint, and fixed recovery cannot substitute the same seller's registered ledger balance for an accepted future supply obligation.
4. Initial coordinated native run: `node --import tsx --test --test-concurrency=1 tests/recovery-model-netting-native.test.ts tests/recovery-allocation-cap-native.test.ts` — **0 passed, 5 failed**, exit 1. Every case failed with the same Miniflare/undici `TypeError: fetch failed` transport error, without a domain assertion result. Root identified the known sandbox transport restriction and authorized one rerun with `sandbox_permissions: require_escalated`. The inspected `nativeFinanceClone` accepts only memory fixtures, restores all native triggers and checks foreign keys; `createIncentiveDb` uses `d1Persist: false`. No launcher bypass or canonical database fallback was attempted.
5. Authorized native rerun of the identical two-file command with the required transport escalation — **5 passed, 0 failed**, exit 0, 82.8 seconds. This covers concurrent source opening, registered cash/earnings cap contention, simultaneous receipt allocations with atomic rollback, and managed/fixed cash-versus-earnings contention. The passing rerun confirms the first run's transport restriction; no guard or test source changed between runs.

Existing tests reused cover retained/current personal conflicts, saved command authority, current seller/permission races, bank-only holds, identity uncertainty before and during commit, all three model netting paths, bounded shared allocation, ledger conservation, corrections and owner statement privacy.

## Remaining scope

Native MariaDB, browser journeys, T28–T35 and the broader T27 dispositions/integration audit remain separate evidence obligations. Root owns the shared ledger updates and typecheck. No deployment, staging launch, data migration/seed/reset/restore, live seller/service action, Git mutation or source 0139 edit was performed by this boundary slice.
