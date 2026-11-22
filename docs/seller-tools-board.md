# Seller tools

Started on `admin-redesign` at `60908834` after the Couriers completion marker. All 18 design references are present.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| T1 · Guided Add a product | Main and product copy helper | In progress | | Check step validation, allowed-field copy, direct submission and the assistance path. |
| T2 · Seller desk for Super Admin | Seller desk helper | Done | `Seller tools: Seller desk for Super Admin` | Typecheck and lint passed. Queue, navigation and native decision tests passed. Chrome at 390, 768, 1024 and 1440 px verified keyboard and touch interaction, no overflow and automatic advancement after a decision. |
| T3 · Final check | Main | In progress | | Full suite is running. Verify the seller-to-Super-Admin browser walkthrough on disposable data. |

## For the owner

- Seller desk keeps the original decision rules. General payout requests can be left pending. The existing protected bank workflow supports documented holds. Older catalog records retain their existing separate approval and publication steps. General seller-support contacts still open in Contact & feedback when there is no seller-linked staff task.
