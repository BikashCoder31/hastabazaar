# Recovery fixture lint and historical-writer compatibility

## Bounded lint cleanup

Fresh scoped lint found **19 findings in 16 files** within the 85 `tests/recovery-*.test.ts` files plus `tests/helpers/service-health-fixture.ts`. The initial and final diagnostics are retained in `.test-artifacts/t34/recovery-fixture-lint-before.txt` and `recovery-fixture-lint-final.txt`.

The health fixture's two `any` annotations were replaced with the actual local statement/batch structure and an explicit typed D1 boundary. Its before/after emitted JavaScript is **byte-identical**. Its in-memory target, actual migration reads, cursor table, SQL, transaction/rollback and awaited statement execution remain unchanged.

Twelve unused baseline result bindings were removed while retaining each exact awaited read. An unused helper and intentionally omitted environment binding were named as discarded; their bodies/destructuring remain. An unused receipt import was already absent from emitted JavaScript. A never-reassigned amount is now `const`, preserving initialization order. The native concurrent accrual assertion supplies an explicit numeric comparator; its expected exact `[0,1]` result is unchanged.

`.test-artifacts/t34/recovery-fixture-lint/change-proof.json` records all 16 files, before/after source and emitted hashes, exact identity where applicable, identical awaited-operation and embedded-template inventories, and every original assertion. The sole assertion-expression change is the explicit result comparator: 169 numerical/adversarial input pairs preserve exactly the original accepted outcomes. No browser fixture template, native command, race, monetary assertion, awaited side effect, target or guard was removed. No suppression or production source change was used. Pure lint cleanup did not launch browser or native workers.

## Independently diagnosed historical fixture failure

A targeted current memory run of `recovery-company-history.test.ts` failed **3/3**, before the changed amount declaration. A loader using the retained pre-lint emitted source actually applied (its marker/hash is in `recovery-company-history-retained-baseline.tap`) and reproduced the same three failures. They were not attributed to the lint edit or silently accepted.

The actual current `protectedPayoutGuards` now isolates `recoveryPayoutReadySql('?',model)` into a standalone atomic guard to satisfy D1 expression depth. Both historical setup adapters recognized only the older alias-based expression. Observation-only loaders retained the original SQL and bindings and recorded the exact standalone recovery guard failure; registered binding count and exact seller identities were also verified. Managed context has no form, so this was not a core-form origin or clock issue. The first registered observer had a template-escaping syntax error; its separate log is retained and is not counted as native guard evidence.

Root authorized narrow corrections to both historical fixture adapters. Only the exact code-owned standalone recovery predicate is recognized in the already documented pre-recovery writer. Every placeholder is retained, its guard ID is validated, and every remaining binding must equal that exact fictional seller. All other current source, party, identity, beneficiary, funding, physical-care, clock, native-trigger and money guards remain unchanged. The real current adapter must still reject the unreviewed modern source before historical setup, and every tested operation receives the original real `f.db`. No approval, verification, consent, paid outcome or funding record is fabricated to make a test pass; existing actual lifecycle commands and original monetary sources remain.

The managed focused group passes **2/2, exit 0**, then the complete affected group passes **3/3, zero skips, exit 0**, 19.237 seconds: `.test-artifacts/t34/recovery-company-history-fixture-final.tap`. This reaches the original exact replay, independent-authority, reversal, restored funding/payout and money-conservation assertions. Final scoped lint includes these two separately authorized helpers: **88 files, exit 0**. The two compatibility changes are explicitly separate from the 16-file pure lint classification.

No canonical database, old namespace, provider, actual bank/email, live activation, deployment, browser or native server was used. Parent owns global typing and integrated acceptance.
