# T18 native orderable-price history — local implementation evidence

Controlling requirement: `docs/superpowers/specs/2026-10-31-product-discount-price-guidance.md` §4.1 and approved T16/T18 implementation parts. A completed sale is supporting evidence, not the sole permitted source. Canonical local data, launch settings, approvals, communications, money and deployments were not changed.

## Implemented behavior

- An independent product reviewer explicitly records a current public offer in the existing publication-review workspace. One native transaction binds the originating case/version, current owner/staff authority, public and offer versions, exact offer JSON, actual counted unreserved stock and revision, seller identity/current consent/managed readiness, publication eligibility and condition/unit/pack scope. A failed readiness check or concurrent source change retains no observation or successful receipt.
- An immutable observation records NPR price and one server-observed moment. It does not infer a continuous period, backfill unknown legacy availability, or equate a draft/browse-only/publication badge with orderability. No sale is required.
- The independent review shows chronological retained observations and current-to-proposed Selling-price amount/percentage changes. A reviewer explicitly chooses a source; there is no highest-price selection. Native approval requires a same-seller/physical-offer/condition/pack/price/time match plus an explicit assessment of intervening prices, relevance and possible temporary inflation. The newest reviewed observation is guarded against concurrent history changes. The native evidence ID and basis are retained against the exact candidate and price pair.
- Original public prices, orders, advisory cycles and unrelated drafts are unchanged. There is no arbitrary lookback/minimum period, automatic approval, price change or 30-day discount removal. Observation capture and review have exact-retry receipts and current-authority recovery; another case cannot claim the original observation receipt. Observation history is absent from publisher-only and public projections.

## Source-only migration0155

New table: `product_orderable_price_observations`, with references to products, sellers, physical offer identities, immutable offer versions, immutable publication candidates/decisions and users; an observation index; immutable/retained triggers.

Widening the original review-kind CHECK requires replacing the exact incoming-FK chain from0091: `product_price_reference_reviews` ← `product_discount_cycles` ← `product_discount_advisory_items`. The review table gains nullable `history_basis`; existing rows retain NULL, and native evidence requires a substantive basis. The advisory parent table is not replaced.

The forward source creates the replacement chain with FKs pointing to replacement parents, copies retained values, drops the old chain leaf-first, renames the new chain parent-first and recreates the original cycle index and review immutable/retained triggers. Foreign keys remain enabled. The migration must execute as one transaction. It has not been applied to the canonical database.

Diagnostic rejected approach: an isolated two-table experiment showed that replacing only the parent under `PRAGMA defer_foreign_keys=ON` gives an empty `foreign_key_check` but still fails COMMIT because SQLite retains the deferred parent-deletion debt. That approach was discarded; it is not part of0155. No FK-disable or writable-schema workaround was used.

## Verification record

- RED: two new capture tests failed on missing native capture API; later valid no-sale candidate evidence failed existing evidence-kind validation.
- Initial GREEN: capture/review3/3; populated migration preservation/rollback2/2.
- Expanded domain/HTTP6/6 passed before final case-bound receipt and additional history invalidation assertions. Includes actual publication/readiness fixtures, no-sale approval, private/public separation, stock/authority/consent/publication races, draft/browse-only/unconfirmed/paused/ineligible rejection and exact HTTP retry.
- Populated migration checks compare all retained review/cycle/advisory/link values, reject invalid dependent references, retain unique/index/immutability behavior, keep FK checks enabled, and verify injected copy failure rolls the entire schema/data back.
- Integrated bounded regression **22/22 pass**, zero skips: `node --import tsx --test --test-concurrency=1 tests/product-orderable-price-history.test.ts tests/product-orderable-price-history-http.test.ts tests/product-orderable-price-history-migration.test.ts tests/product-price-reference-store.test.ts tests/product-publication-http.test.ts tests/product-command-outcomes.test.ts`. Log: `artifacts/t18-orderable-history-20261104-green.log`.
- Final focused **8/8 pass**, zero skips, after latest-ID/count freshness and original-case receipt binding: `node --import tsx --test --test-concurrency=1 tests/product-orderable-price-history.test.ts tests/product-orderable-price-history-http.test.ts tests/product-orderable-price-history-migration.test.ts`. Log: `artifacts/t18-orderable-history-20261104-final.log`.
- A further strengthened focused review test **1/1 pass**, zero skips, injects a valid same-timestamp observation immediately before review commit and proves no approval survives; refresh then permits the exact reference: `node --import tsx --test --test-concurrency=1 --test-name-pattern='exact later candidate' tests/product-orderable-price-history.test.ts`. Log: `artifacts/t18-orderable-history-20261104-review-race.log`.
- Scoped production/test lint **exit0**; final UI/test lint **exit0** after checkbox freshness invalidation and integer price parsing. Logs: `artifacts/t18-orderable-history-20261104-lint.log`, `artifacts/t18-orderable-history-20261104-final-ui-lint.log`. `git diff --check -- <owned files>` **exit0**. A broader read-only diff check reported existing EOF blank lines in four unrelated files; they were left with their owners.
- Final SHA-256 inventory records twelve owned source/test files and five bounded logs: `artifacts/t18-orderable-history-20261104-sha256.json`. Later root-owned integration edits require refreshing affected hashes; this inventory is not a production release freeze.

Native D1, MariaDB, browser interaction and global type/build gates remain root-coordinated and pending. Root owns typed schema, MariaDB generator/inventory, release manifest and master coverage updates. Do not describe this local source slice as deployed or canonical-data-ready.
